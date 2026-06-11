// Token Coach verdict engine. Runs every detection rule over parsed session
// data, ranks verdicts by tokens wasted, caps to the Daily Verdict card limit.
// Rules are pure; this module is the single entry point the app will call.

const defaultConfig = require('./config')
const { detectLongThreadBleed } = require('./rules/r1-long-thread')
const { detectEffortMismatch } = require('./rules/r2-effort-mismatch')

const RULES = [
  detectLongThreadBleed,
  detectEffortMismatch,
  // R3 cache misses, R4 limit collision — next loops.
]

function runDailyVerdict(input, config = defaultConfig) {
  const verdicts = []
  for (const rule of RULES) {
    verdicts.push(...rule(input, config))
  }
  return verdicts
    .sort((a, b) => b.wastedTokens - a.wastedTokens)
    .slice(0, config.maxVerdictsPerDay)
}

module.exports = { runDailyVerdict, RULES }
