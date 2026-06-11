// Token Coach verdict engine. Runs every detection rule over parsed session
// data, applies cross-rule policy, ranks by tokens wasted, and caps to the
// Daily Verdict card limit. Rules are pure; this module is the single entry
// point the app calls.
//
// Cross-rule policy (QA_FINDINGS.md):
//   - Sessions R1 flags are excluded from R3's pool — an uncached long
//     thread is one problem with one fix, not two cards billing the same
//     tokens twice. R1 wins because its fix is the more specific one.
//   - No rule may take more than maxCardsPerRule slots (real-data QA: R1
//     alone filled all five).
//   - One 🟢 good-habit card per day, appended only when a slot is free.

const defaultConfig = require('./config')
const { detectLongThreadBleed } = require('./rules/r1-long-thread')
const { detectEffortMismatch } = require('./rules/r2-effort-mismatch')
const { detectCacheMisses } = require('./rules/r3-cache-miss')
const { detectLimitCollision } = require('./rules/r4-limit-collision')
const { makeVerdict, formatTokens } = require('./verdict')
const { render } = require('./templates')

const RULES = [detectLongThreadBleed, detectEffortMismatch, detectCacheMisses, detectLimitCollision]

// 🟢 good-habit card (PRD section 5 — positive reinforcement, max 1/day).
// Two deterministic shapes, both from observed numbers only:
//   greenCache — overall cache hit ratio at/above the healthy target.
//   greenClean — enough activity and zero waste verdicts fired.
function goodHabitCard(input, wasteCards, config) {
  const sessions = Array.isArray(input?.sessions) ? input.sessions : []
  if (sessions.length < config.green.minSessions) return null

  let cacheRead = 0
  let totalContext = 0
  for (const session of sessions) {
    for (const request of Array.isArray(session?.requests) ? session.requests : []) {
      const read = Number(request.cacheReadTokens) || 0
      cacheRead += read
      totalContext += (Number(request.inputTokens) || 0) + (Number(request.cacheCreationTokens) || 0) + read
    }
  }
  if (totalContext < config.green.minContextTokens) return null

  const hitRatio = cacheRead / totalContext
  if (hitRatio >= config.green.minHitRatio) {
    const saved = cacheRead * (1 - config.cacheReadWeight)
    return makeVerdict({
      rule: 'GREEN',
      id: 'green-cache',
      severity: 'green',
      title: render('greenCache', 'title'),
      what: render('greenCache', 'what', { ratio: Math.round(hitRatio * 100), saved: formatTokens(saved) }),
      cost: { tokens: 0, pctOfLimit: null, hoursEquivalent: null, text: `${formatTokens(saved)} tokens served from cache` },
      fix: render('greenCache', 'fix'),
      evidence: {
        sessionsChecked: sessions.length,
        overallHitRatio: Math.round(hitRatio * 1000) / 1000,
        cacheReadTokens: Math.round(cacheRead),
        totalContextTokens: Math.round(totalContext),
        savedWeightedTokens: Math.round(saved),
      },
      wastedTokens: 0,
    })
  }

  if (!wasteCards.length) {
    return makeVerdict({
      rule: 'GREEN',
      id: 'green-clean',
      severity: 'green',
      title: render('greenClean', 'title'),
      what: render('greenClean', 'what', { sessions: sessions.length }),
      cost: { tokens: 0, pctOfLimit: null, hoursEquivalent: null, text: 'nothing wasted worth flagging' },
      fix: render('greenClean', 'fix'),
      evidence: { sessionsChecked: sessions.length },
      wastedTokens: 0,
    })
  }
  return null
}

function runDailyVerdict(input, config = defaultConfig) {
  // R1 first: its flagged sessions are excluded from R3 (cross-rule dedup).
  const r1 = detectLongThreadBleed(input, config)
  const r1Sessions = new Set(r1.map((v) => v.evidence.sessionId).filter(Boolean))
  const inputForR3 = {
    ...(input || {}),
    sessions: (Array.isArray(input?.sessions) ? input.sessions : []).filter(
      (s) => !r1Sessions.has(s.sessionId),
    ),
  }

  const all = [
    ...r1,
    ...detectEffortMismatch(input, config),
    ...detectCacheMisses(inputForR3, config),
    ...detectLimitCollision(input, config),
  ].sort((a, b) => b.wastedTokens - a.wastedTokens)

  // Per-rule cap, then the global card cap.
  const perRule = new Map()
  const capped = []
  for (const verdict of all) {
    const count = (perRule.get(verdict.rule) || 0) + 1
    perRule.set(verdict.rule, count)
    if (count <= config.maxCardsPerRule) capped.push(verdict)
  }
  const cards = capped.slice(0, config.maxVerdictsPerDay)

  const green = goodHabitCard(input, cards, config)
  if (green && cards.length < config.maxVerdictsPerDay) cards.push(green)
  return cards
}

module.exports = { runDailyVerdict, RULES, _private: { goodHabitCard } }
