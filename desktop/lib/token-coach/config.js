// Token Coach thresholds. Every tunable for rules R1-R4 lives here — rules
// must never hardcode numbers (PRD section 6).

module.exports = {
  // Daily Verdict screen shows at most this many cards, ranked by waste.
  maxVerdictsPerDay: 5,

  // Quota weight of a cache-read token relative to uncached input. Providers
  // bill/weigh cache reads far below fresh input; verdicts must not count a
  // cached re-send as if it were full-price context.
  cacheReadWeight: 0.1,

  severity: {
    // PRD section 5: 🔴 WASTE ≥ 20% of period limit, 🟡 5–20%.
    redPctOfLimit: 20,
    yellowPctOfLimit: 5,
    // Fallback absolute thresholds (weighted tokens) when an empirical
    // tokens-per-percent rate is unavailable (DATA_GAPS G7).
    redTokens: 20_000_000,
    yellowTokens: 4_000_000,
  },

  r1: {
    // Sessions with fewer requests than this never produce a verdict —
    // insufficient data, not evidence of a clean session.
    minRequestsForVerdict: 5,
    // "Long thread" trigger: request count in a single session.
    longSessionRequests: 40,
    // Context size per request considered a healthy restart point; only
    // tokens above this floor count as re-sent history bleed.
    healthyContextFloor: 60_000,
    // Alternative trigger: weighted re-sent tokens even in shorter sessions.
    minWeightedResentTokens: 1_500_000,
  },

  r2: {
    // Turns lacking effort or prompt length are skipped; if fewer than this
    // many turns are evaluable across all sessions, emit nothing.
    minEvaluableTurns: 8,
    // Minimum flagged turns before "effort mismatch" is a habit, not noise.
    minFlaggedTurns: 5,
    // A prompt shorter than this is a "quick ask".
    shortPromptChars: 280,
    // ...and an answer smaller than this means no big deliverable came back.
    smallOutputTokens: 1_200,
    // Effort levels considered premium. Codex exposes effort per turn;
    // Claude Code session effort comes from the attachment-row heuristic (G2).
    highEffortLevels: ['high', 'xhigh', 'max'],
    // When a flagged turn has no observed reasoning-token overhead (Claude
    // does not split thinking from output), count this share of the turn's
    // weighted tokens as waste. Surfaced in evidence as an assumption.
    assumedOverkillShare: 0.5,
  },
  r3: {
    // Sessions smaller than this barely move quota — skip them as noise.
    minSessionContextTokens: 500_000,
    // A cache-miss habit needs several affected sessions, not one outlier.
    minSessionsForVerdict: 3,
    minRequestsPerSession: 5,
    // Hit ratio (cache reads / total context) below this = miss-heavy session.
    lowHitRatio: 0.4,
    // Achievable baseline used to size the waste estimate. Claude Code and
    // Codex both cache automatically; healthy sessions commonly sit well
    // above this. Surfaced in evidence so the estimate is auditable.
    targetHitRatio: 0.7,
  },
  r4: {}, // limit collision — populated in Loop 1d
}
