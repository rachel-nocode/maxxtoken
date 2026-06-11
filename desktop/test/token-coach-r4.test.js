const assert = require('node:assert/strict')
const test = require('node:test')

const { detectLimitCollision } = require('../lib/token-coach/rules/r4-limit-collision')
const { runDailyVerdict } = require('../lib/token-coach')

const T0 = Date.parse('2026-06-10T09:00:00Z')
const MIN = 60_000

function sample(offsetMin, usedPct, extra = {}) {
  return { when: T0 + offsetMin * MIN, agentType: 'codex', windowKind: '5h', usedPct, ...extra }
}

const limitContext = { tokensPerPct: 300_000, tokensPerHour: 2_000_000, periodLabel: 'weekly limit' }

test('R4 flags a burst collision as red with lockout hours', () => {
  const windowSamples = [
    sample(0, 10),
    sample(30, 40),
    sample(60, 80),
    sample(80, 99.5, { resetAt: T0 + 80 * MIN + 2 * 3_600_000 }),
  ]
  const verdicts = detectLimitCollision({ windowSamples, limitContext })
  assert.equal(verdicts.length, 1)
  const v = verdicts[0]
  assert.equal(v.rule, 'R4')
  assert.equal(v.severity, 'red')
  assert.equal(v.cost.pctOfLimit, 89.5)
  assert.equal(v.cost.lockedOutHours, 2)
  // 89.5% × 300K tokens-per-% = 26.85M estimated tokens.
  assert.equal(v.cost.tokens, 26_850_000)
  assert.ok(v.cost.text.includes('89.5% of your 5-hour limit in 90 minutes'))
  assert.ok(v.cost.text.includes('locked out ≈ 2h'))
  assert.ok(v.what.includes('Codex'))
  assert.equal(v.evidence.collisionCount, 1)
  assert.equal(v.evidence.collisions[0].baselinePct, 10)
  assert.ok(v.title.split(' ').length <= 8)
})

test('R4 ignores a slow grind into the limit', () => {
  // 2% per 30 minutes — the lookback window only sees a ~6%... make it slower: 1.5%/30min → 4.5% in 90min < minSpikePct.
  const windowSamples = []
  for (let i = 0; i <= 70; i++) windowSamples.push(sample(i * 30, Math.min(100, 1.5 * i)))
  const verdicts = detectLimitCollision({ windowSamples, limitContext })
  assert.deepEqual(verdicts, [])
})

test('R4 returns nothing when the lookback lacks samples', () => {
  // Collision sample exists but nothing else within 90 minutes before it.
  const windowSamples = [sample(0, 20), sample(300, 99.5)]
  assert.deepEqual(detectLimitCollision({ windowSamples, limitContext }), [])
  assert.deepEqual(detectLimitCollision({ windowSamples: [] }), [])
  assert.deepEqual(detectLimitCollision({}), [])
  assert.deepEqual(detectLimitCollision(null), [])
})

test('R4 dedupes a sustained collision to one rising edge', () => {
  const windowSamples = [
    sample(0, 30),
    sample(45, 99.2),
    sample(50, 99.8), // still pinned — same collision
    sample(55, 100),
  ]
  const verdicts = detectLimitCollision({ windowSamples, limitContext })
  assert.equal(verdicts.length, 1)
  assert.equal(verdicts[0].evidence.collisionCount, 1)
})

test('R4 groups repeated collisions and reports the worst spike', () => {
  const windowSamples = [
    // Collision 1: spike 40%.
    sample(0, 59),
    sample(60, 99),
    // Recovery.
    sample(400, 20),
    // Collision 2: spike 79.5% (baseline = window minimum, 20 at t+400).
    sample(430, 24.5),
    sample(490, 99.5),
  ]
  const verdicts = detectLimitCollision({ windowSamples, limitContext })
  assert.equal(verdicts.length, 1)
  const v = verdicts[0]
  assert.equal(v.evidence.collisionCount, 2)
  assert.equal(v.cost.pctOfLimit, 79.5)
  assert.ok(v.what.includes('2 times'))
})

test('R4 keeps a modest spike at yellow and emits without a token rate', () => {
  const windowSamples = [
    sample(0, 91),
    sample(30, 93),
    sample(60, 99.3, { resetAt: T0 + 60 * MIN + 90 * 60_000 }),
  ]
  const verdicts = detectLimitCollision({ windowSamples })
  assert.equal(verdicts.length, 1)
  const v = verdicts[0]
  assert.equal(v.severity, 'yellow')
  assert.equal(v.cost.pctOfLimit, 8.3)
  assert.equal(v.cost.tokens, null)
  assert.equal(v.wastedTokens, 0)
})

test('R4 separates agents and windows', () => {
  const windowSamples = [
    sample(0, 10),
    sample(60, 99.5),
    { when: T0, agentType: 'claude-code', windowKind: '7d', usedPct: 50 },
    { when: T0 + 60 * MIN, agentType: 'claude-code', windowKind: '7d', usedPct: 60 }, // no collision
  ]
  const verdicts = detectLimitCollision({ windowSamples, limitContext })
  assert.equal(verdicts.length, 1)
  assert.equal(verdicts[0].evidence.agentType, 'codex')
  assert.equal(verdicts[0].evidence.windowKind, '5h')
})

test('engine accepts windowSamples alongside sessions', () => {
  const verdicts = runDailyVerdict({
    sessions: [],
    windowSamples: [sample(0, 10), sample(60, 99.5)],
    limitContext,
  })
  assert.equal(verdicts.length, 1)
  assert.equal(verdicts[0].rule, 'R4')
})
