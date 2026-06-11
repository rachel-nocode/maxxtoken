// R2 — Effort mismatch (PRD section 6).
//
// High reasoning effort spent on quick asks: short prompt in, small answer
// out, premium effort level on. Codex logs reasoning_output_tokens per turn,
// so its overhead is observed directly. Claude does not split thinking from
// output, so flagged Claude turns count a configured share of their weighted
// tokens as waste — recorded in evidence as an assumption, never hidden.
//
// One verdict per agent type (it is a habit across sessions, not a single
// session's failure). Pure function: parsed session data in, Verdicts out.
//
// Request fields used: when, effort, promptChars, inputTokens,
// cacheReadTokens, cacheCreationTokens, outputTokens, reasoningTokens.

const defaultConfig = require('../config')
const { severityFor, costFor, makeVerdict, formatTokens } = require('../verdict')
const { render } = require('../templates')

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function evaluable(request) {
  if (!request || typeof request !== 'object') return false
  if (!Number.isFinite(Number(request.when)) || Number(request.when) <= 0) return false
  const effort = typeof request.effort === 'string' ? request.effort.trim() : ''
  if (!effort) return false
  const promptChars = Number(request.promptChars)
  if (!Number.isFinite(promptChars) || promptChars < 0) return false
  return true
}

function weightedTokens(request, config) {
  return (
    num(request.inputTokens) +
    num(request.cacheCreationTokens) +
    num(request.cacheReadTokens) * config.cacheReadWeight +
    num(request.outputTokens)
  )
}

function agentLabel(agentType) {
  return agentType === 'codex' ? 'Codex' : 'Claude Code'
}

function detectEffortMismatch(input, config = defaultConfig) {
  const sessions = Array.isArray(input?.sessions) ? input.sessions : []
  const limitContext = input?.limitContext || null
  const highLevels = new Set(config.r2.highEffortLevels.map((level) => level.toLowerCase()))

  // Aggregate per agent type — the verdict describes a usage habit.
  const byAgent = new Map()
  for (const session of sessions) {
    const agentType = session?.agentType === 'codex' ? 'codex' : 'claude-code'
    const bucket =
      byAgent.get(agentType) ||
      byAgent.set(agentType, {
        evaluableTurns: 0,
        flaggedTurns: 0,
        flaggedTokens: 0,
        observedReasoningWaste: 0,
        assumedWaste: 0,
        assumedTurns: 0,
        sessionsHit: new Set(),
        firstFlagged: null,
        lastFlagged: null,
      }).get(agentType)

    for (const request of Array.isArray(session?.requests) ? session.requests : []) {
      if (!evaluable(request)) continue
      bucket.evaluableTurns += 1

      const effort = String(request.effort).trim().toLowerCase()
      if (!highLevels.has(effort)) continue
      if (Number(request.promptChars) >= config.r2.shortPromptChars) continue
      // Provider-reported output includes reasoning tokens (Codex); the
      // "small answer" gate cares about the visible deliverable only.
      const visibleOutput = Math.max(0, num(request.outputTokens) - num(request.reasoningTokens))
      if (visibleOutput >= config.r2.smallOutputTokens) continue

      bucket.flaggedTurns += 1
      bucket.sessionsHit.add(session.sessionId || 'unknown')
      const when = Number(request.when)
      if (bucket.firstFlagged === null || when < bucket.firstFlagged) bucket.firstFlagged = when
      if (bucket.lastFlagged === null || when > bucket.lastFlagged) bucket.lastFlagged = when

      const turnTokens = weightedTokens(request, config)
      bucket.flaggedTokens += turnTokens
      const reasoning = num(request.reasoningTokens)
      if (reasoning > 0) {
        bucket.observedReasoningWaste += reasoning
      } else {
        bucket.assumedWaste += turnTokens * config.r2.assumedOverkillShare
        bucket.assumedTurns += 1
      }
    }
  }

  const verdicts = []
  for (const [agentType, bucket] of byAgent) {
    if (bucket.evaluableTurns < config.r2.minEvaluableTurns) continue
    if (bucket.flaggedTurns < config.r2.minFlaggedTurns) continue

    const wasted = bucket.observedReasoningWaste + bucket.assumedWaste
    if (wasted <= 0) continue
    const { severity, pctOfLimit } = severityFor(wasted, limitContext, config)
    if (!severity) continue

    verdicts.push(
      makeVerdict({
        rule: 'R2',
        id: `r2-effort-mismatch:${agentType}`,
        severity,
        title: render('r2', 'title'),
        what: render('r2', 'what', {
          agent: agentLabel(agentType),
          count: bucket.flaggedTurns,
          waste: formatTokens(wasted),
        }),
        cost: costFor(wasted, limitContext),
        fix: render('r2', 'fix', { agentType }),
        evidence: {
          agentType,
          flaggedTurns: bucket.flaggedTurns,
          evaluableTurns: bucket.evaluableTurns,
          sessionsHit: [...bucket.sessionsHit],
          flaggedTurnTokens: Math.round(bucket.flaggedTokens),
          observedReasoningWaste: Math.round(bucket.observedReasoningWaste),
          assumedWaste: Math.round(bucket.assumedWaste),
          assumedTurns: bucket.assumedTurns,
          assumedOverkillShare: bucket.assumedTurns > 0 ? config.r2.assumedOverkillShare : null,
          pctOfLimit: pctOfLimit == null ? null : Math.round(pctOfLimit * 10) / 10,
          shortPromptChars: config.r2.shortPromptChars,
          smallOutputTokens: config.r2.smallOutputTokens,
          windowStart: bucket.firstFlagged,
          windowEnd: bucket.lastFlagged,
        },
        wastedTokens: wasted,
      }),
    )
  }

  return verdicts.sort((a, b) => b.wastedTokens - a.wastedTokens)
}

module.exports = { detectEffortMismatch }
