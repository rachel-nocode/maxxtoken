// R3 — Cache misses (PRD section 6).
//
// Providers re-serve repeated context from cache at a fraction of the quota
// cost of fresh input. A session whose cache hit ratio sits far below the
// achievable baseline paid full price for context it kept re-sending.
//
// Waste estimate per miss-heavy session:
//   (targetHitRatio × totalContext − cacheReadTokens) × (1 − cacheReadWeight)
// i.e. the extra weighted tokens paid because cacheable context arrived
// uncached. The target ratio is config, surfaced in evidence (auditable
// estimate, not a hidden guess).
//
// Codex note (DATA_GAPS G1): Codex reports cache reads (cached_input_tokens,
// a subset of input_tokens) but no cache-creation counter. The collector
// normalizes Codex turns to { inputTokens: fresh, cacheReadTokens: cached,
// cacheCreationTokens: 0 }, so this rule treats both agents uniformly and
// verdict copy speaks only of "cache hits".
//
// One verdict per agent type. Pure function.

const defaultConfig = require('../config')
const { severityFor, costFor, makeVerdict, formatTokens } = require('../verdict')
const { render } = require('../templates')

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function sessionStats(session, config) {
  const requests = (Array.isArray(session?.requests) ? session.requests : []).filter(
    (request) =>
      request &&
      typeof request === 'object' &&
      Number.isFinite(Number(request.when)) &&
      Number(request.when) > 0,
  )
  if (requests.length < config.r3.minRequestsPerSession) return null

  let cacheRead = 0
  let totalContext = 0
  for (const request of requests) {
    const read = num(request.cacheReadTokens)
    cacheRead += read
    totalContext += num(request.inputTokens) + num(request.cacheCreationTokens) + read
  }
  if (totalContext < config.r3.minSessionContextTokens) return null
  return { requestCount: requests.length, cacheRead, totalContext, hitRatio: cacheRead / totalContext }
}

function detectCacheMisses(input, config = defaultConfig) {
  const sessions = Array.isArray(input?.sessions) ? input.sessions : []
  const limitContext = input?.limitContext || null

  const byAgent = new Map()
  for (const session of sessions) {
    const stats = sessionStats(session, config)
    if (!stats) continue
    const agentType = session?.agentType === 'codex' ? 'codex' : 'claude-code'
    const bucket =
      byAgent.get(agentType) ||
      byAgent.set(agentType, { evaluated: 0, missSessions: [], wasted: 0 }).get(agentType)
    bucket.evaluated += 1
    if (stats.hitRatio >= config.r3.lowHitRatio) continue

    const wasted =
      Math.max(0, config.r3.targetHitRatio * stats.totalContext - stats.cacheRead) *
      (1 - config.cacheReadWeight)
    bucket.wasted += wasted
    bucket.missSessions.push({
      sessionId: session.sessionId || null,
      hitRatio: Math.round(stats.hitRatio * 1000) / 1000,
      totalContextTokens: Math.round(stats.totalContext),
      cacheReadTokens: Math.round(stats.cacheRead),
      requestCount: stats.requestCount,
      wastedTokens: Math.round(wasted),
    })
  }

  const verdicts = []
  for (const [agentType, bucket] of byAgent) {
    if (bucket.missSessions.length < config.r3.minSessionsForVerdict) continue
    if (bucket.wasted <= 0) continue
    const { severity, pctOfLimit } = severityFor(bucket.wasted, limitContext, config)
    if (!severity) continue

    const agent = agentType === 'codex' ? 'Codex' : 'Claude Code'
    const worst = [...bucket.missSessions].sort((a, b) => b.wastedTokens - a.wastedTokens)
    const avgRatio =
      bucket.missSessions.reduce((sum, s) => sum + s.hitRatio, 0) / bucket.missSessions.length

    verdicts.push(
      makeVerdict({
        rule: 'R3',
        id: `r3-cache-miss:${agentType}`,
        severity,
        title: render('r3', 'title'),
        what: render('r3', 'what', {
          agent,
          count: bucket.missSessions.length,
          ratio: Math.round(avgRatio * 100),
          waste: formatTokens(bucket.wasted),
        }),
        cost: costFor(bucket.wasted, limitContext),
        fix: render('r3', 'fix'),
        evidence: {
          agentType,
          sessionsEvaluated: bucket.evaluated,
          missSessions: bucket.missSessions.length,
          averageHitRatio: Math.round(avgRatio * 1000) / 1000,
          lowHitRatio: config.r3.lowHitRatio,
          targetHitRatio: config.r3.targetHitRatio,
          cacheReadWeight: config.cacheReadWeight,
          pctOfLimit: pctOfLimit == null ? null : Math.round(pctOfLimit * 10) / 10,
          worstSessions: worst.slice(0, 3),
        },
        wastedTokens: bucket.wasted,
      }),
    )
  }

  return verdicts.sort((a, b) => b.wastedTokens - a.wastedTokens)
}

module.exports = { detectCacheMisses }
