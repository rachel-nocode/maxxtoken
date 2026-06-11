const assert = require('node:assert/strict')
const test = require('node:test')

const { detectCacheMisses } = require('../lib/token-coach/rules/r3-cache-miss')
const { runDailyVerdict } = require('../lib/token-coach')

const T0 = Date.parse('2026-06-10T09:00:00Z')

function makeSession(id, agentType, count, fields) {
  return {
    sessionId: id,
    agentType,
    requests: Array.from({ length: count }, (_, i) => ({ when: T0 + i * 60_000, outputTokens: 300, ...fields })),
  }
}

// Miss-heavy session: 1.07M context, only 50K of it from cache (ratio ~0.047).
// Waste = (0.7 × 1.07M − 50K) × 0.9 = 629,100 weighted tokens.
const missFields = { inputTokens: 100_000, cacheReadTokens: 5_000, cacheCreationTokens: 2_000 }
// Healthy session: ratio ~0.89.
const cachedFields = { inputTokens: 20_000, cacheReadTokens: 200_000, cacheCreationTokens: 5_000 }

const limitContext = { tokensPerPct: 300_000, tokensPerHour: 2_000_000, periodLabel: 'weekly limit' }

test('R3 flags a widespread cache-miss habit as red', () => {
  const sessions = Array.from({ length: 10 }, (_, i) => makeSession(`miss-${i}`, 'claude-code', 10, missFields))
  const verdicts = detectCacheMisses({ sessions, limitContext })
  assert.equal(verdicts.length, 1)
  const v = verdicts[0]
  assert.equal(v.rule, 'R3')
  assert.equal(v.severity, 'red')
  assert.equal(v.wastedTokens, 6_291_000)
  assert.equal(v.evidence.missSessions, 10)
  assert.equal(v.evidence.sessionsEvaluated, 10)
  assert.equal(v.evidence.targetHitRatio, 0.7)
  assert.equal(v.evidence.worstSessions.length, 3)
  assert.equal(v.evidence.worstSessions[0].wastedTokens, 629_100)
  assert.ok(v.title.split(' ').length <= 8)
  assert.ok(v.cost.text.includes('% of your weekly limit'))
})

test('R3 flags three miss sessions as yellow at the boundary', () => {
  const sessions = [
    makeSession('m1', 'codex', 10, { inputTokens: 100_000, cacheReadTokens: 5_000 }),
    makeSession('m2', 'codex', 10, { inputTokens: 100_000, cacheReadTokens: 5_000 }),
    makeSession('m3', 'codex', 10, { inputTokens: 100_000, cacheReadTokens: 5_000 }),
  ]
  const verdicts = detectCacheMisses({ sessions, limitContext })
  assert.equal(verdicts.length, 1)
  assert.equal(verdicts[0].severity, 'yellow')
  // Codex shape (no cacheCreation): context 1.05M, waste = (735K − 50K) × 0.9 per session.
  assert.equal(verdicts[0].wastedTokens, Math.round(3 * (0.7 * 1_050_000 - 50_000) * 0.9))
  assert.ok(verdicts[0].what.includes('Codex'))
})

test('R3 stays silent on healthy cached sessions', () => {
  const sessions = Array.from({ length: 8 }, (_, i) => makeSession(`ok-${i}`, 'claude-code', 10, cachedFields))
  assert.deepEqual(detectCacheMisses({ sessions, limitContext }), [])
})

test('R3 needs minimum miss sessions and skips noise sessions', () => {
  // Only 2 miss sessions — below minSessionsForVerdict.
  const two = Array.from({ length: 2 }, (_, i) => makeSession(`m-${i}`, 'claude-code', 10, missFields))
  assert.deepEqual(detectCacheMisses({ sessions: two, limitContext }), [])

  // Tiny sessions (300K context, ratio 0) are skipped entirely.
  const tiny = Array.from({ length: 6 }, (_, i) =>
    makeSession(`t-${i}`, 'claude-code', 10, { inputTokens: 30_000 }),
  )
  assert.deepEqual(detectCacheMisses({ sessions: tiny, limitContext }), [])

  // Too few requests per session — not judged.
  const short = Array.from({ length: 6 }, (_, i) =>
    makeSession(`s-${i}`, 'claude-code', 3, { inputTokens: 400_000 }),
  )
  assert.deepEqual(detectCacheMisses({ sessions: short, limitContext }), [])

  assert.deepEqual(detectCacheMisses({}), [])
  assert.deepEqual(detectCacheMisses(null), [])
})

test('R3 separates agents — Claude habit does not blame Codex', () => {
  const sessions = [
    ...Array.from({ length: 5 }, (_, i) => makeSession(`c-${i}`, 'claude-code', 10, missFields)),
    ...Array.from({ length: 5 }, (_, i) => makeSession(`x-${i}`, 'codex', 10, cachedFields)),
  ]
  const verdicts = detectCacheMisses({ sessions, limitContext })
  assert.equal(verdicts.length, 1)
  assert.equal(verdicts[0].evidence.agentType, 'claude-code')
})

test('engine runs R1+R2+R3 together and keeps the card cap', () => {
  const sessions = Array.from({ length: 10 }, (_, i) => makeSession(`miss-${i}`, 'claude-code', 10, missFields))
  const verdicts = runDailyVerdict({ sessions, limitContext })
  assert.ok(verdicts.length >= 1)
  assert.ok(verdicts.length <= 5)
  assert.ok(verdicts.some((v) => v.rule === 'R3'))
})
