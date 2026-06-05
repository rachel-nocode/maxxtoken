const assert = require('node:assert/strict')
const test = require('node:test')

const flow = require('../lib/flow-checkpoints')

test('flow checkpoint builds a compact resume prompt without hidden context claims', () => {
  const checkpoint = flow.buildFlowCheckpoint({
    dir: '/Users/rachel/app',
    goal: 'Ship Flow Mode before the Claude window resets.',
    changed: 'Added the Optimize entry and checkpoint form.',
    nextStep: 'Run the focused tests, then wire the copy button.',
    notes: 'Do not touch provider credentials.',
    providerId: 'claude',
    providerName: 'Claude',
    windowResetAt: Date.parse('2026-06-05T18:00:00Z'),
  }, { now: Date.parse('2026-06-05T16:00:00Z') })

  assert.equal(checkpoint.title, 'Ship Flow Mode before the Claude window resets.')
  assert.equal(checkpoint.providerName, 'Claude')
  assert.match(checkpoint.resumePrompt, /Do not assume prior hidden chat context/)
  assert.match(checkpoint.resumePrompt, /NEXT STEP:\nRun the focused tests/)
  assert.ok(checkpoint.resumePrompt.length < 1200)
})

test('flow checkpoint list keeps newest twenty normalized entries', () => {
  const items = Array.from({ length: 25 }, (_, i) => flow.buildFlowCheckpoint({
    goal: `Goal ${i}`,
    nextStep: `Step ${i}`,
    createdAt: i + 1,
  }))

  const normalized = flow.normalizeFlowCheckpoints(items)

  assert.equal(normalized.length, 20)
  assert.equal(normalized[0].goal, 'Goal 24')
  assert.equal(normalized[19].goal, 'Goal 5')
})

test('flow recommendation picks the tightest active short window', () => {
  const rec = flow.flowRecommendation({
    providers: [
      { id: 'claude', name: 'Claude', connected: true, windows: [{ kind: '5h', usedPct: 64, resetAt: Date.parse('2026-06-05T18:00:00Z') }] },
      { id: 'codex', name: 'ChatGPT', connected: true, windows: [{ kind: '5h', usedPct: 82, resetAt: Date.parse('2026-06-05T17:00:00Z') }] },
    ],
  }, { now: Date.parse('2026-06-05T16:00:00Z'), reservePct: 40 })

  assert.equal(rec.recommended, true)
  assert.equal(rec.providerId, 'codex')
  assert.equal(rec.freePct, 18)
  assert.match(rec.summary, /18% free/)
})

test('flow recommendation quiet state says recommended instead of appears', () => {
  const rec = flow.flowRecommendation({
    providers: [
      { id: 'claude', name: 'Claude', connected: true, windows: [{ kind: '5h', usedPct: 20 }] },
    ],
  }, { reservePct: 40 })

  assert.equal(rec.recommended, false)
  assert.equal(rec.summary, 'Recommended when a 5-hour window drops under 40% free.')
})
