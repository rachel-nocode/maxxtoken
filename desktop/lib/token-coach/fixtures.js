// Preview fixtures for the Token Coach beta screen (PRD Loop 3: render the
// card UI with the Loop 1 test fixtures — no real data wiring yet). The
// session collector (task #11) replaces this input with parsed transcripts.

const T0 = Date.parse('2026-06-10T09:00:00Z')
const MIN = 60_000

function requests(count, fields) {
  return Array.from({ length: count }, (_, i) => ({ when: T0 + i * MIN, outputTokens: 200, ...fields }))
}

const previewInput = {
  sessions: [
    // R1 clear waste — 50-message uncached thread.
    {
      sessionId: 'preview-long-thread',
      agentType: 'claude-code',
      requests: requests(50, { inputTokens: 250_000, cacheCreationTokens: 10_000 }),
    },
    // R2 — quick Codex asks at max effort with observed reasoning overhead.
    {
      sessionId: 'preview-effort',
      agentType: 'codex',
      requests: requests(12, {
        effort: 'xhigh',
        promptChars: 80,
        inputTokens: 10_000,
        outputTokens: 200_400,
        reasoningTokens: 200_000,
      }),
    },
    // R3 — miss-heavy Claude sessions (three, the habit minimum).
    ...[1, 2, 3].map((n) => ({
      sessionId: `preview-cache-${n}`,
      agentType: 'claude-code',
      requests: requests(10, { inputTokens: 100_000, cacheReadTokens: 5_000, cacheCreationTokens: 2_000 }),
    })),
  ],
  // R4 — burst collision on the Codex 5-hour window.
  windowSamples: [
    { when: T0, agentType: 'codex', windowKind: '5h', usedPct: 10 },
    { when: T0 + 30 * MIN, agentType: 'codex', windowKind: '5h', usedPct: 40 },
    { when: T0 + 60 * MIN, agentType: 'codex', windowKind: '5h', usedPct: 80 },
    { when: T0 + 80 * MIN, agentType: 'codex', windowKind: '5h', usedPct: 99.5, resetAt: T0 + 80 * MIN + 2 * 3_600_000 },
  ],
  limitContext: { tokensPerPct: 300_000, tokensPerHour: 2_000_000, periodLabel: 'weekly limit' },
}

module.exports = { previewInput }
