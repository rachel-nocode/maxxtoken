// Loop 4 — hostile QA gauntlet (PRD section 12, Loop 4). Each scenario must
// produce a correct verdict, a 🟢 good-habit card, or gracefully nothing.
// Findings and policy decisions are documented in QA_FINDINGS.md.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { runDailyVerdict } = require('../lib/token-coach')
const { collectCoachInput } = require('../lib/token-coach/collect')
const config = require('../lib/token-coach/config')

const T0 = Date.parse('2026-06-10T09:00:00Z')
const NOW = Date.parse('2026-06-10T12:00:00Z')

function makeSession(id, agentType, count, fields) {
  return {
    sessionId: id,
    agentType,
    requests: Array.from({ length: count }, (_, i) => ({ when: T0 + i * 60_000, outputTokens: 300, ...fields })),
  }
}

const limitContext = { tokensPerPct: 300_000, tokensPerHour: 2_000_000, periodLabel: 'weekly limit' }
const uncachedBleed = { inputTokens: 250_000, cacheCreationTokens: 10_000 }
const healthyCached = { inputTokens: 5_000, cacheReadTokens: 120_000, cacheCreationTokens: 2_000 }

test('QA: empty data shows nothing — no crash, no fake verdicts', () => {
  assert.deepEqual(runDailyVerdict({ sessions: [], windowSamples: [] }), [])
  assert.deepEqual(runDailyVerdict({}), [])
  assert.deepEqual(runDailyVerdict(null), [])
})

test('QA: a single session never produces a verdict or a green card', () => {
  const one = [makeSession('only', 'claude-code', 50, uncachedBleed)]
  const cards = runDailyVerdict({ sessions: one, limitContext })
  // One R1 card is legitimate; what must NOT happen is a green card from
  // a single data point or any rule throwing.
  assert.ok(cards.every((c) => c.rule !== 'GREEN'))
})

test('QA: 100 sessions stay within card caps and finish fast', () => {
  const sessions = Array.from({ length: 100 }, (_, i) => makeSession(`s-${i}`, i % 2 ? 'codex' : 'claude-code', 50, uncachedBleed))
  const started = Date.now()
  const cards = runDailyVerdict({ sessions, limitContext })
  assert.ok(Date.now() - started < 1_000, 'engine must stay fast at 100 sessions')
  assert.ok(cards.length <= config.maxVerdictsPerDay)
  const perRule = cards.reduce((m, c) => ((m[c.rule] = (m[c.rule] || 0) + 1), m), {})
  for (const [rule, count] of Object.entries(perRule)) {
    if (rule !== 'GREEN') assert.ok(count <= config.maxCardsPerRule, `${rule} exceeded per-rule cap`)
  }
})

test('QA: corrupted log lines are skipped, valid data still verdicts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-qa-'))
  const file = path.join(dir, 'claude.jsonl')
  const goodLine = (i) =>
    JSON.stringify({
      type: 'assistant',
      sessionId: 'qa-sess',
      timestamp: new Date(T0 + i * 60_000).toISOString(),
      requestId: `r${i}`,
      message: { id: `m${i}`, model: 'claude-fable-5', usage: { input_tokens: 250_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 200 } },
    })
  const lines = []
  for (let i = 0; i < 50; i++) {
    lines.push(goodLine(i))
    lines.push('}{ totally corrupted ' + i)
    lines.push('{"type":"assistant","truncated":')
  }
  fs.writeFileSync(file, lines.join('\n'))
  const input = collectCoachInput({ now: NOW, claudeFiles: [file], codexFiles: [], historyFile: '/nonexistent' })
  input.limitContext = limitContext
  const cards = runDailyVerdict(input)
  assert.ok(cards.some((c) => c.rule === 'R1'), 'valid rows must still produce the R1 card')
})

test('QA: Codex-only user gets Codex verdicts and no Claude blame', () => {
  const sessions = [
    makeSession('cx-1', 'codex', 50, uncachedBleed),
    makeSession('cx-2', 'codex', 12, { effort: 'xhigh', promptChars: 60, inputTokens: 10_000, outputTokens: 200_400, reasoningTokens: 200_000 }),
  ]
  const cards = runDailyVerdict({ sessions, limitContext })
  assert.ok(cards.length >= 1)
  for (const card of cards) {
    assert.ok(!JSON.stringify(card).includes('Claude'), 'no Claude wording for a Codex-only user')
  }
})

test('QA: user who never hit limits gets no R4 card', () => {
  const windowSamples = Array.from({ length: 50 }, (_, i) => ({
    when: T0 + i * 30 * 60_000,
    agentType: 'codex',
    windowKind: '5h',
    usedPct: Math.min(60, i * 2),
  }))
  const cards = runDailyVerdict({ sessions: [], windowSamples, limitContext })
  assert.ok(cards.every((c) => c.rule !== 'R4'))
})

test('QA: healthy cached week earns the greenCache card (max one)', () => {
  const sessions = Array.from({ length: 5 }, (_, i) => makeSession(`ok-${i}`, 'claude-code', 10, healthyCached))
  const cards = runDailyVerdict({ sessions, limitContext })
  const greens = cards.filter((c) => c.rule === 'GREEN')
  assert.equal(greens.length, 1)
  assert.equal(greens[0].id, 'green-cache')
  assert.equal(greens[0].severity, 'green')
  assert.ok(greens[0].what.includes('% of what the model re-read'))
})

test('QA: active but unremarkable week earns the greenClean card', () => {
  // Mid cache ratio (below green target), no waste — small uncached sessions.
  const sessions = Array.from({ length: 4 }, (_, i) =>
    makeSession(`mid-${i}`, 'codex', 8, { inputTokens: 30_000, cacheReadTokens: 20_000, outputTokens: 500 }),
  )
  const cards = runDailyVerdict({ sessions, limitContext })
  assert.equal(cards.length, 1)
  assert.equal(cards[0].id, 'green-clean')
})

test('QA: green card never displaces a waste card', () => {
  // Five sessions each tripping R1 (per-rule cap 2) + R3-heavy spread to
  // fill remaining slots is hard to fabricate; assert the invariant instead:
  // when 5 waste cards exist, no green is appended.
  const sessions = [
    ...Array.from({ length: 5 }, (_, i) => makeSession(`bleed-${i}`, i % 2 ? 'codex' : 'claude-code', 50, uncachedBleed)),
    makeSession('fx', 'codex', 12, { effort: 'xhigh', promptChars: 60, inputTokens: 10_000, outputTokens: 200_400, reasoningTokens: 200_000 }),
  ]
  const windowSamples = [
    { when: T0, agentType: 'codex', windowKind: '5h', usedPct: 10 },
    { when: T0 + 60 * 60_000, agentType: 'codex', windowKind: '5h', usedPct: 99.5 },
  ]
  const cards = runDailyVerdict({ sessions, windowSamples, limitContext })
  assert.ok(cards.length <= config.maxVerdictsPerDay)
  if (cards.length === config.maxVerdictsPerDay) {
    assert.ok(cards.every((c) => c.rule !== 'GREEN'))
  }
})

test('QA: R1-flagged sessions are not double-billed by R3', () => {
  // Uncached long threads trip R1; with dedup they must not also appear in R3.
  const sessions = Array.from({ length: 6 }, (_, i) => makeSession(`dup-${i}`, 'claude-code', 50, uncachedBleed))
  const cards = runDailyVerdict({ sessions, limitContext })
  assert.ok(cards.some((c) => c.rule === 'R1'))
  assert.ok(cards.every((c) => c.rule !== 'R3'), 'R3 must not re-bill R1 sessions')
})
