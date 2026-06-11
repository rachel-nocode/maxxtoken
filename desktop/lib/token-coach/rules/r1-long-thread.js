// R1 — Long-thread bleed (PRD section 6).
//
// A single long session re-sends its whole history with every new message.
// Tokens above a healthy per-request context floor are "bleed". Cache reads
// are weighted down (config.cacheReadWeight) so a well-cached long thread —
// which is cheap for the user's quota — does not get flagged as waste.
//
// Pure function: parsed session data in, Verdict objects out. No I/O.
//
// Input shape:
//   {
//     sessions: [{
//       sessionId, agentType,            // 'claude-code' | 'codex'
//       requests: [{ when, inputTokens, cacheReadTokens,
//                    cacheCreationTokens, outputTokens, model? }],
//     }],
//     limitContext?: { tokensPerPct?, tokensPerHour?, periodLabel? },
//   }

const defaultConfig = require('../config')
const { severityFor, costFor, makeVerdict, formatTokens } = require('../verdict')
const { render } = require('../templates')

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function validRequest(request) {
  if (!request || typeof request !== 'object') return false
  const when = Number(request.when)
  if (!Number.isFinite(when) || when <= 0) return false
  return (
    num(request.inputTokens) +
      num(request.cacheReadTokens) +
      num(request.cacheCreationTokens) +
      num(request.outputTokens) >
    0
  )
}

function analyzeSession(session, config) {
  const requests = (Array.isArray(session?.requests) ? session.requests : [])
    .filter(validRequest)
    .sort((a, b) => Number(a.when) - Number(b.when))
  if (requests.length < config.r1.minRequestsForVerdict) return null

  const floor = config.r1.healthyContextFloor
  const weight = config.cacheReadWeight
  let resentTokens = 0
  let weightedResentTokens = 0
  let peakContextTokens = 0

  for (const request of requests) {
    const input = num(request.inputTokens)
    const cacheRead = num(request.cacheReadTokens)
    const cacheCreation = num(request.cacheCreationTokens)
    const contextSize = input + cacheRead + cacheCreation
    if (contextSize > peakContextTokens) peakContextTokens = contextSize
    const excess = contextSize - floor
    if (excess <= 0) continue
    resentTokens += excess
    const weightedContext = input + cacheCreation + cacheRead * weight
    weightedResentTokens += excess * (weightedContext / contextSize)
  }

  return {
    requests,
    resentTokens,
    weightedResentTokens,
    peakContextTokens,
    windowStart: Number(requests[0].when),
    windowEnd: Number(requests[requests.length - 1].when),
  }
}

function detectLongThreadBleed(input, config = defaultConfig) {
  const sessions = Array.isArray(input?.sessions) ? input.sessions : []
  const limitContext = input?.limitContext || null
  const verdicts = []

  for (const session of sessions) {
    const stats = analyzeSession(session, config)
    if (!stats) continue

    const longByCount = stats.requests.length >= config.r1.longSessionRequests
    const longByTokens = stats.weightedResentTokens >= config.r1.minWeightedResentTokens
    if (!longByCount && !longByTokens) continue
    if (stats.weightedResentTokens <= 0) continue

    const { severity, pctOfLimit } = severityFor(stats.weightedResentTokens, limitContext, config)
    if (!severity) continue

    const agent = session.agentType === 'codex' ? 'Codex' : 'Claude Code'
    verdicts.push(
      makeVerdict({
        rule: 'R1',
        id: `r1-long-thread:${session.sessionId}`,
        severity,
        title: render('r1', 'title'),
        what: render('r1', 'what', {
          agent,
          count: stats.requests.length,
          peak: formatTokens(stats.peakContextTokens),
        }),
        cost: costFor(stats.weightedResentTokens, limitContext),
        fix: render('r1', 'fix'),
        evidence: {
          sessionId: session.sessionId || null,
          agentType: session.agentType || null,
          requestCount: stats.requests.length,
          peakContextTokens: Math.round(stats.peakContextTokens),
          resentTokens: Math.round(stats.resentTokens),
          weightedResentTokens: Math.round(stats.weightedResentTokens),
          pctOfLimit: pctOfLimit == null ? null : Math.round(pctOfLimit * 10) / 10,
          healthyContextFloor: config.r1.healthyContextFloor,
          cacheReadWeight: config.cacheReadWeight,
          windowStart: stats.windowStart,
          windowEnd: stats.windowEnd,
        },
        wastedTokens: stats.weightedResentTokens,
      }),
    )
  }

  return verdicts.sort((a, b) => b.wastedTokens - a.wastedTokens)
}

module.exports = { detectLongThreadBleed }
