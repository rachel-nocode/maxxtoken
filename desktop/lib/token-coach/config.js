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

  r2: {}, // effort mismatch — populated in Loop 1b
  r3: {}, // cache misses — populated in Loop 1c
  r4: {}, // limit collision — populated in Loop 1d
}
