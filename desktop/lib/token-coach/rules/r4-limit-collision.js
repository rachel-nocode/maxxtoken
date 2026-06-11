// R4 — Limit collision (PRD section 6).
//
// The user slammed into a usage limit because of a burst right before it:
// a large share of the window's quota burned in the minutes leading up to
// the wall. Measured directly in % of the period limit from window
// utilization samples — Codex emits rate_limits on every token_count event;
// Claude samples come from usage-history/quota-notifications polling.
//
// A collision after a slow, steady grind is NOT flagged: pacing advice only
// helps when the burn was bursty. Insufficient samples inside the lookback
// means no verdict, never a guess (poll-rate honesty, DATA_GAPS G4).
//
// Input shape (new field, ignored by R1-R3):
//   windowSamples: [{ when, agentType, windowKind ('5h'|'7d'),
//                     usedPct, resetAt? }]
//
// Pure function. One verdict per agentType+windowKind, worst spike leads.

const defaultConfig = require('../config')
const { severityForPct, makeVerdict } = require('../verdict')
const { render } = require('../templates')

const HOUR_MS = 3_600_000

function windowLabel(windowKind) {
  return windowKind === '7d' ? 'weekly limit' : '5-hour limit'
}

function validSample(sample) {
  if (!sample || typeof sample !== 'object') return false
  const when = Number(sample.when)
  const usedPct = Number(sample.usedPct)
  return Number.isFinite(when) && when > 0 && Number.isFinite(usedPct) && usedPct >= 0
}

function groupKey(sample) {
  const agentType = sample.agentType === 'codex' ? 'codex' : 'claude-code'
  const windowKind = sample.windowKind === '7d' ? '7d' : '5h'
  return `${agentType}:${windowKind}`
}

function findCollisions(samples, config) {
  const lookbackMs = config.r4.spikeWindowMinutes * 60_000
  const collisions = []
  let aboveLimit = false

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]
    if (sample.usedPct < config.r4.limitPct) {
      aboveLimit = false
      continue
    }
    if (aboveLimit) continue // still the same collision, not a new rising edge
    aboveLimit = true

    const windowStart = sample.when - lookbackMs
    const inWindow = samples.filter((s) => s.when >= windowStart && s.when <= sample.when)
    if (inWindow.length < config.r4.minSamplesInWindow) continue // can't measure the rise

    const baseline = inWindow.reduce((min, s) => (s.usedPct < min.usedPct ? s : min))
    const spikePct = sample.usedPct - baseline.usedPct
    if (spikePct < config.r4.minSpikePct) continue // slow grind, not a burst

    const resetAt = Number(sample.resetAt)
    collisions.push({
      when: sample.when,
      usedPct: Math.round(sample.usedPct * 10) / 10,
      baselinePct: Math.round(baseline.usedPct * 10) / 10,
      spikePct: Math.round(spikePct * 10) / 10,
      lockedOutHours:
        Number.isFinite(resetAt) && resetAt > sample.when
          ? Math.round(((resetAt - sample.when) / HOUR_MS) * 10) / 10
          : null,
    })
  }
  return collisions
}

function detectLimitCollision(input, config = defaultConfig) {
  const samples = (Array.isArray(input?.windowSamples) ? input.windowSamples : []).filter(validSample)
  const limitContext = input?.limitContext || null

  const groups = new Map()
  for (const sample of samples) {
    const key = groupKey(sample)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ ...sample, when: Number(sample.when), usedPct: Number(sample.usedPct) })
  }

  const verdicts = []
  for (const [key, groupSamples] of groups) {
    groupSamples.sort((a, b) => a.when - b.when)
    const collisions = findCollisions(groupSamples, config)
    if (!collisions.length) continue

    const [agentType, windowKind] = key.split(':')
    const worst = collisions.reduce((max, c) => (c.spikePct > max.spikePct ? c : max))
    const severity = severityForPct(worst.spikePct, config)
    if (!severity) continue

    const agent = agentType === 'codex' ? 'Codex' : 'Claude Code'
    const label = windowLabel(windowKind)
    const tokensPerPct = Number(limitContext?.tokensPerPct) || 0
    const estTokens = tokensPerPct > 0 ? Math.round(worst.spikePct * tokensPerPct) : null

    const costParts = [`${worst.spikePct}% of your ${label} in ${config.r4.spikeWindowMinutes} minutes`]
    if (worst.lockedOutHours != null) costParts.push(`locked out ≈ ${worst.lockedOutHours}h until reset`)

    verdicts.push(
      makeVerdict({
        rule: 'R4',
        id: `r4-limit-collision:${key}`,
        severity,
        title: render('r4', 'title'),
        what: render('r4', 'what', {
          agent,
          window: label,
          collisionCount: collisions.length,
          spike: worst.spikePct,
          baseline: worst.baselinePct,
          minutes: config.r4.spikeWindowMinutes,
        }),
        cost: {
          tokens: estTokens,
          pctOfLimit: worst.spikePct,
          hoursEquivalent: null,
          lockedOutHours: worst.lockedOutHours,
          text: costParts.join(' · '),
        },
        fix: render('r4', 'fix'),
        evidence: {
          agentType,
          windowKind,
          collisionCount: collisions.length,
          collisions,
          spikeWindowMinutes: config.r4.spikeWindowMinutes,
          limitPct: config.r4.limitPct,
          samplesSeen: groupSamples.length,
        },
        wastedTokens: estTokens || 0,
      }),
    )
  }

  return verdicts.sort((a, b) => b.wastedTokens - a.wastedTokens || b.cost.pctOfLimit - a.cost.pctOfLimit)
}

module.exports = { detectLimitCollision }
