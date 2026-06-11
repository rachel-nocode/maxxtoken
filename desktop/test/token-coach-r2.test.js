const assert = require('node:assert/strict')
const test = require('node:test')

const { detectEffortMismatch } = require('../lib/token-coach/rules/r2-effort-mismatch')
const { runDailyVerdict } = require('../lib/token-coach')

const T0 = Date.parse('2026-06-10T09:00:00Z')

function makeTurns(count, fields) {
  return Array.from({ length: count }, (_, i) => ({ when: T0 + i * 120_000, ...fields }))
}

// Codex high-effort quick ask: 200K reasoning overhead per turn, 400 visible.
const codexQuickAsk = {
  effort: 'xhigh',
  promptChars: 80,
  inputTokens: 10_000,
  outputTokens: 200_400,
  reasoningTokens: 200_000,
}

const limitContext = { tokensPerPct: 300_000, tokensPerHour: 2_000_000, periodLabel: 'weekly limit' }

test('R2 flags heavy observed reasoning overhead on quick Codex asks as red', () => {
  const sessions = [
    { sessionId: 'codex-a', agentType: 'codex', requests: makeTurns(25, codexQuickAsk) },
    { sessionId: 'codex-b', agentType: 'codex', requests: makeTurns(15, codexQuickAsk) },
  ]
  const verdicts = detectEffortMismatch({ sessions, limitContext })
  assert.equal(verdicts.length, 1)
  const v = verdicts[0]
  assert.equal(v.rule, 'R2')
  assert.equal(v.severity, 'red')
  // 40 flagged turns × 200K observed reasoning tokens = 8M.
  assert.equal(v.wastedTokens, 8_000_000)
  assert.equal(v.evidence.observedReasoningWaste, 8_000_000)
  assert.equal(v.evidence.assumedWaste, 0)
  assert.equal(v.evidence.assumedOverkillShare, null)
  assert.equal(v.evidence.flaggedTurns, 40)
  assert.deepEqual(v.evidence.sessionsHit.sort(), ['codex-a', 'codex-b'])
  assert.equal(v.cost.pctOfLimit, 26.7)
  assert.ok(v.fix.includes('reasoning effort'))
  assert.ok(v.title.split(' ').length <= 8)
})

test('R2 flags a borderline Codex habit as yellow', () => {
  const sessions = [{ sessionId: 'codex-c', agentType: 'codex', requests: makeTurns(10, codexQuickAsk) }]
  const verdicts = detectEffortMismatch({ sessions, limitContext })
  assert.equal(verdicts.length, 1)
  assert.equal(verdicts[0].severity, 'yellow')
  assert.equal(verdicts[0].wastedTokens, 2_000_000)
})

test('R2 uses the assumed share for Claude turns without reasoning split', () => {
  const claudeQuickAsk = {
    effort: 'xhigh',
    promptChars: 100,
    inputTokens: 150_000,
    outputTokens: 1_000,
  }
  const sessions = [{ sessionId: 'claude-a', agentType: 'claude-code', requests: makeTurns(30, claudeQuickAsk) }]
  const verdicts = detectEffortMismatch({ sessions, limitContext })
  assert.equal(verdicts.length, 1)
  const v = verdicts[0]
  assert.equal(v.severity, 'yellow')
  // 30 × (150K + 1K) weighted × 0.5 assumed share = 2,265,000.
  assert.equal(v.wastedTokens, 2_265_000)
  assert.equal(v.evidence.observedReasoningWaste, 0)
  assert.equal(v.evidence.assumedWaste, 2_265_000)
  assert.equal(v.evidence.assumedOverkillShare, 0.5)
  assert.ok(v.fix.includes('/effort medium'))
})

test('R2 stays silent on clean usage', () => {
  // High effort doing real work: long prompts, big deliverables.
  const realWork = {
    effort: 'xhigh',
    promptChars: 2_400,
    inputTokens: 80_000,
    outputTokens: 9_000,
  }
  // Medium effort quick asks are fine too.
  const mediumQuick = { effort: 'medium', promptChars: 60, inputTokens: 5_000, outputTokens: 300 }
  const sessions = [
    { sessionId: 's1', agentType: 'claude-code', requests: makeTurns(20, realWork) },
    { sessionId: 's2', agentType: 'claude-code', requests: makeTurns(20, mediumQuick) },
  ]
  assert.deepEqual(detectEffortMismatch({ sessions, limitContext }), [])
})

test('R2 returns nothing on insufficient or unevaluable data', () => {
  // Only 6 evaluable turns (< minEvaluableTurns) — even though all flagged.
  const few = [{ sessionId: 's1', agentType: 'codex', requests: makeTurns(6, codexQuickAsk) }]
  assert.deepEqual(detectEffortMismatch({ sessions: few, limitContext }), [])

  // Turns missing effort or promptChars are skipped entirely.
  const unevaluable = [
    {
      sessionId: 's2',
      agentType: 'codex',
      requests: [
        ...makeTurns(20, { promptChars: 50, inputTokens: 400_000, outputTokens: 500 }), // no effort
        ...makeTurns(20, { effort: 'xhigh', inputTokens: 400_000, outputTokens: 500 }), // no promptChars
      ],
    },
  ]
  assert.deepEqual(detectEffortMismatch({ sessions: unevaluable, limitContext }), [])
  assert.deepEqual(detectEffortMismatch({}), [])
  assert.deepEqual(detectEffortMismatch(null), [])
})

test('R2 needs a minimum flagged count before calling it a habit', () => {
  const sessions = [
    {
      sessionId: 's1',
      agentType: 'codex',
      requests: [
        ...makeTurns(4, codexQuickAsk), // below minFlaggedTurns
        ...makeTurns(10, { effort: 'medium', promptChars: 60, inputTokens: 5_000, outputTokens: 300 }),
      ],
    },
  ]
  assert.deepEqual(detectEffortMismatch({ sessions, limitContext }), [])
})

test('engine merges R1 and R2 verdicts ranked by waste', () => {
  const longThread = {
    sessionId: 'thread-1',
    agentType: 'claude-code',
    requests: Array.from({ length: 50 }, (_, i) => ({
      when: T0 + i * 60_000,
      inputTokens: 250_000,
      cacheCreationTokens: 10_000,
      outputTokens: 200,
    })),
  }
  const codexHabit = { sessionId: 'codex-c', agentType: 'codex', requests: makeTurns(10, codexQuickAsk) }
  const verdicts = runDailyVerdict({ sessions: [longThread, codexHabit], limitContext })
  assert.equal(verdicts.length, 2)
  assert.equal(verdicts[0].rule, 'R1') // 10M > 2M
  assert.equal(verdicts[1].rule, 'R2')
})
