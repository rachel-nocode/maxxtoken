const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { collectCoachInput, _private } = require('../lib/token-coach/collect')

const NOW = Date.parse('2026-06-10T12:00:00Z')
const T0 = Date.parse('2026-06-10T09:00:00Z')

function iso(offsetMin) {
  return new Date(T0 + offsetMin * 60_000).toISOString()
}

function tmpFile(name, lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-coach-'))
  const file = path.join(dir, name)
  fs.writeFileSync(file, lines.join('\n') + '\n')
  return file
}

// ---------- Claude ----------------------------------------------------------

function claudeAssistantLine(offsetMin, sessionId, usage, extra = {}) {
  return JSON.stringify({
    type: 'assistant',
    sessionId,
    timestamp: iso(offsetMin),
    requestId: `req-${sessionId}-${offsetMin}`,
    message: { id: `msg-${sessionId}-${offsetMin}`, model: 'claude-fable-5', usage },
    ...extra,
  })
}

const CLAUDE_USAGE = {
  input_tokens: 1_000,
  cache_creation_input_tokens: 2_000,
  cache_read_input_tokens: 30_000,
  output_tokens: 400,
}

test('collector groups Claude rows into sessions with normalized fields', () => {
  const file = tmpFile('claude.jsonl', [
    claudeAssistantLine(0, 'sess-a', CLAUDE_USAGE),
    claudeAssistantLine(5, 'sess-a', CLAUDE_USAGE),
    claudeAssistantLine(10, 'sess-b', CLAUDE_USAGE),
    'not json at all {{{',
    JSON.stringify({ type: 'user', sessionId: 'sess-a', timestamp: iso(2) }),
  ])
  const input = collectCoachInput({ now: NOW, claudeFiles: [file], codexFiles: [], historyFile: '/nonexistent' })
  assert.equal(input.sessions.length, 2)
  const a = input.sessions.find((s) => s.sessionId === 'sess-a')
  assert.equal(a.agentType, 'claude-code')
  assert.equal(a.requests.length, 2)
  assert.deepEqual(
    { ...a.requests[0], when: undefined },
    {
      when: undefined,
      inputTokens: 1_000,
      cacheReadTokens: 30_000,
      cacheCreationTokens: 2_000,
      outputTokens: 400,
      model: 'claude-fable-5',
    },
  )
})

test('collector dedupes identical Claude rows across files', () => {
  const line = claudeAssistantLine(0, 'sess-a', CLAUDE_USAGE)
  const f1 = tmpFile('one.jsonl', [line])
  const f2 = tmpFile('two.jsonl', [line])
  const input = collectCoachInput({ now: NOW, claudeFiles: [f1, f2], codexFiles: [], historyFile: '/nonexistent' })
  assert.equal(input.sessions.length, 1)
  assert.equal(input.sessions[0].requests.length, 1)
})

// ---------- Codex -----------------------------------------------------------

function codexLines() {
  const rateLimits = (primaryPct, secondaryPct) => ({
    primary: { used_percent: primaryPct, window_minutes: 300, resets_at: Math.floor((T0 + 3 * 3_600_000) / 1000) },
    secondary: { used_percent: secondaryPct, window_minutes: 10_080, resets_at: Math.floor((T0 + 5 * DAY) / 1000) },
  })
  const DAY = 86_400_000
  return [
    JSON.stringify({ timestamp: iso(0), type: 'session_meta', payload: { id: 'codex-sess-1' } }),
    JSON.stringify({ timestamp: iso(1), type: 'turn_context', payload: { model: 'gpt-5.3-codex', effort: 'xhigh' } }),
    JSON.stringify({
      timestamp: iso(2),
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'short ask' }] },
    }),
    JSON.stringify({
      timestamp: iso(3),
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: 24_000, cached_input_tokens: 4_000, output_tokens: 600, reasoning_output_tokens: 200, total_tokens: 24_600 },
          last_token_usage: { input_tokens: 24_000, cached_input_tokens: 4_000, output_tokens: 600, reasoning_output_tokens: 200, total_tokens: 24_600 },
          model_context_window: 258_400,
        },
        rate_limits: rateLimits(4, 7),
      },
    }),
    'corrupted {{{ line',
    JSON.stringify({
      timestamp: iso(60),
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: { input_tokens: 80_000, cached_input_tokens: 50_000, output_tokens: 1_200, reasoning_output_tokens: 0 },
        },
        rate_limits: rateLimits(9, 8),
      },
    }),
  ]
}

test('collector parses Codex rollouts: turns, effort, prompt chars, windows', () => {
  const file = tmpFile('rollout-test.jsonl', codexLines())
  const input = collectCoachInput({ now: NOW, claudeFiles: [], codexFiles: [file], historyFile: '/nonexistent' })

  assert.equal(input.sessions.length, 1)
  const s = input.sessions[0]
  assert.equal(s.sessionId, 'codex-sess-1')
  assert.equal(s.agentType, 'codex')
  assert.equal(s.requests.length, 2)

  const first = s.requests[0]
  // cached ⊂ input_tokens → fresh input = 24000 − 4000.
  assert.equal(first.inputTokens, 20_000)
  assert.equal(first.cacheReadTokens, 4_000)
  assert.equal(first.cacheCreationTokens, 0)
  assert.equal(first.outputTokens, 600)
  assert.equal(first.reasoningTokens, 200)
  assert.equal(first.effort, 'xhigh')
  assert.equal(first.promptChars, 'short ask'.length)
  // promptChars consumed by the first turn; second turn has none.
  assert.equal(s.requests[1].promptChars, null)

  // Two events × (5h + 7d) = 4 window samples, resets_at seconds → ms.
  assert.equal(input.windowSamples.length, 4)
  const fiveHour = input.windowSamples.filter((w) => w.windowKind === '5h')
  assert.deepEqual(fiveHour.map((w) => w.usedPct), [4, 9])
  assert.ok(fiveHour[0].resetAt > 1e12)
})

test('collector builds an observed limitContext from weekly deltas', () => {
  // Need ≥2 clean pairs: three rollouts each contributing one 7d rise.
  const files = [1, 2, 3].map((n) => {
    const mk = (offset, pct, cum) =>
      JSON.stringify({
        timestamp: iso(offset),
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { last_token_usage: { input_tokens: cum, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 } },
          rate_limits: { secondary: { used_percent: pct, resets_at: 1781478912 } },
        },
      })
    // 100K tokens per 1% on every pair.
    return tmpFile(`rollout-${n}.jsonl`, [mk(0, 10, 100_000), mk(30, 11, 100_000)])
  })
  const input = collectCoachInput({ now: NOW, claudeFiles: [], codexFiles: files, historyFile: '/nonexistent' })
  assert.ok(input.limitContext)
  assert.equal(input.limitContext.tokensPerPct, 100_000)
  assert.equal(input.limitContext.periodLabel, 'weekly limit')
})

test('collector returns empty contract on no data — never throws', () => {
  const input = collectCoachInput({ now: NOW, claudeFiles: [], codexFiles: [], historyFile: '/nonexistent' })
  assert.deepEqual(input.sessions, [])
  assert.deepEqual(input.windowSamples, [])
  assert.equal(input.limitContext, null)
  const missing = collectCoachInput({
    now: NOW,
    claudeFiles: ['/nope/missing.jsonl'],
    codexFiles: ['/nope/rollout.jsonl'],
    historyFile: '/nonexistent',
  })
  assert.deepEqual(missing.sessions, [])
})

test('collector reads Claude window samples from usage-history', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-coach-hist-'))
  const historyFile = path.join(dir, 'usage-history.json')
  fs.writeFileSync(
    historyFile,
    JSON.stringify({
      samples: [
        { providerId: 'claude', windowLabel: 'Session', kind: '5h', capturedAt: T0, usedPct: 42, resetAt: T0 + 3_600_000, periodMs: 18_000_000 },
        { providerId: 'claude', windowLabel: 'Weekly', kind: '7d', capturedAt: T0, usedPct: 60, resetAt: T0 + 86_400_000, periodMs: 604_800_000 },
        { providerId: 'codex', windowLabel: 'Session', kind: '5h', capturedAt: T0, usedPct: 10, resetAt: T0, periodMs: 18_000_000 },
      ],
      totals: [],
      tokens: [],
    }),
  )
  const samples = _private.collectClaudeWindowSamples({ sinceMs: T0 - 1, historyFile })
  assert.equal(samples.length, 2)
  assert.deepEqual(samples.map((s) => s.windowKind), ['5h', '7d'])
  assert.equal(samples[0].agentType, 'claude-code')
})
