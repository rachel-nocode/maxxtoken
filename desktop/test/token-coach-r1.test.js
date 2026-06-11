const assert = require('node:assert/strict')
const test = require('node:test')

const { detectLongThreadBleed } = require('../lib/token-coach/rules/r1-long-thread')
const { runDailyVerdict } = require('../lib/token-coach')
const config = require('../lib/token-coach/config')

const T0 = Date.parse('2026-06-10T09:00:00Z')

function makeRequests(count, { inputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0, outputTokens = 200 }) {
  return Array.from({ length: count }, (_, i) => ({
    when: T0 + i * 60_000,
    inputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    outputTokens,
  }))
}

// Fixture 1 — clear waste: 50-message uncached thread, 260K context/request.
const clearWasteSession = {
  sessionId: 'fixture-clear-waste',
  agentType: 'claude-code',
  requests: makeRequests(50, { inputTokens: 250_000, cacheCreationTokens: 10_000 }),
}

// Fixture 2 — borderline: 45 messages, 150K context, decent cache hit rate.
const borderlineSession = {
  sessionId: 'fixture-borderline',
  agentType: 'codex',
  requests: makeRequests(45, { inputTokens: 60_000, cacheReadTokens: 90_000 }),
}

// Fixture 3 — clean: short session, context under the healthy floor.
const cleanSession = {
  sessionId: 'fixture-clean',
  agentType: 'claude-code',
  requests: makeRequests(12, { inputTokens: 30_000, cacheReadTokens: 20_000 }),
}

// Observed limit rate: 300K weighted tokens move the weekly limit 1%.
const limitContext = { tokensPerPct: 300_000, tokensPerHour: 2_000_000, periodLabel: 'weekly limit' }

test('R1 flags a clear long-thread bleed as red with full cost line', () => {
  const verdicts = detectLongThreadBleed({ sessions: [clearWasteSession], limitContext })
  assert.equal(verdicts.length, 1)
  const v = verdicts[0]
  assert.equal(v.rule, 'R1')
  assert.equal(v.severity, 'red')
  // 50 requests × (260K − 60K floor) × ratio 1.0 = 10M weighted tokens.
  assert.equal(v.wastedTokens, 10_000_000)
  assert.equal(v.cost.tokens, 10_000_000)
  assert.equal(v.cost.pctOfLimit, 33.3)
  assert.equal(v.cost.hoursEquivalent, 5)
  assert.equal(v.cost.text, '10M tokens · ≈ 33.3% of your weekly limit · ≈ 5h of normal usage')
  assert.equal(v.evidence.requestCount, 50)
  assert.equal(v.evidence.peakContextTokens, 260_000)
  assert.equal(v.evidence.sessionId, 'fixture-clear-waste')
  assert.ok(v.title.split(' ').length <= 8)
  assert.ok(v.what.includes('50 messages'))
  assert.ok(v.fix.length > 0)
})

test('R1 flags a borderline cached thread as yellow', () => {
  const verdicts = detectLongThreadBleed({ sessions: [borderlineSession], limitContext })
  assert.equal(verdicts.length, 1)
  const v = verdicts[0]
  assert.equal(v.severity, 'yellow')
  // 45 × 90K excess × (69K weighted / 150K context) = 1,863,000.
  assert.equal(v.wastedTokens, 1_863_000)
  assert.equal(v.evidence.pctOfLimit, 6.2)
  assert.ok(v.what.includes('Codex'))
})

test('R1 stays silent on a clean session', () => {
  const verdicts = detectLongThreadBleed({ sessions: [cleanSession], limitContext })
  assert.deepEqual(verdicts, [])
})

test('R1 does not punish a well-cached long thread', () => {
  // 60 messages, 205K context, but 200K of it is cache reads — cheap.
  const cached = {
    sessionId: 'fixture-cache-friendly',
    agentType: 'claude-code',
    requests: makeRequests(60, { inputTokens: 2_000, cacheReadTokens: 200_000, cacheCreationTokens: 3_000 }),
  }
  const verdicts = detectLongThreadBleed({ sessions: [cached], limitContext })
  assert.deepEqual(verdicts, [])
})

test('R1 returns nothing on insufficient data — never a partial verdict', () => {
  const tiny = {
    sessionId: 'fixture-tiny',
    agentType: 'claude-code',
    requests: makeRequests(4, { inputTokens: 500_000 }),
  }
  assert.deepEqual(detectLongThreadBleed({ sessions: [tiny], limitContext }), [])
  assert.deepEqual(detectLongThreadBleed({ sessions: [] }), [])
  assert.deepEqual(detectLongThreadBleed({}), [])
  assert.deepEqual(detectLongThreadBleed(null), [])
})

test('R1 filters malformed requests before judging', () => {
  const mangled = {
    sessionId: 'fixture-mangled',
    agentType: 'claude-code',
    requests: [
      { when: 'not-a-time', inputTokens: 900_000 },
      { inputTokens: 900_000 },
      { when: T0, inputTokens: -5 },
      ...makeRequests(4, { inputTokens: 250_000 }),
    ],
  }
  // Only 4 valid requests survive — below minRequestsForVerdict.
  assert.deepEqual(detectLongThreadBleed({ sessions: [mangled], limitContext }), [])
})

test('R1 falls back to absolute thresholds without an observed limit rate', () => {
  const verdicts = detectLongThreadBleed({ sessions: [clearWasteSession] })
  assert.equal(verdicts.length, 1)
  const v = verdicts[0]
  // 10M weighted ≥ yellowTokens (4M) but < redTokens (20M).
  assert.equal(v.severity, 'yellow')
  assert.equal(v.cost.pctOfLimit, null)
  assert.equal(v.cost.text, '10M tokens')
  assert.equal(v.evidence.pctOfLimit, null)
})

test('engine ranks verdicts by wasted tokens and respects the card cap', () => {
  const verdicts = runDailyVerdict({ sessions: [borderlineSession, clearWasteSession], limitContext })
  assert.ok(verdicts.length >= 2)
  assert.ok(verdicts.length <= config.maxVerdictsPerDay)
  assert.equal(verdicts[0].evidence.sessionId, 'fixture-clear-waste')
  assert.equal(verdicts[1].evidence.sessionId, 'fixture-borderline')
})
