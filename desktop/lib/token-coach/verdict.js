// Verdict object contract (PRD section 5). Every rule returns objects built
// through makeVerdict so the card anatomy stays uniform:
//   what happened -> what it cost -> what to do instead, plus evidence.

const defaultConfig = require('./config')

function round(value) {
  return Math.round(Number(value) || 0)
}

// Map weighted wasted tokens to PRD severity. Uses the empirical
// tokens-per-percent rate when the caller observed one (DATA_GAPS G7);
// otherwise falls back to absolute token thresholds. Returns null severity
// when the waste is below the yellow line — callers must then emit nothing.
function severityFor(weightedTokens, limitContext = null, config = defaultConfig) {
  const tokens = Number(weightedTokens) || 0
  const tokensPerPct = Number(limitContext?.tokensPerPct) || 0
  if (tokensPerPct > 0) {
    const pct = tokens / tokensPerPct
    if (pct >= config.severity.redPctOfLimit) return { severity: 'red', pctOfLimit: pct }
    if (pct >= config.severity.yellowPctOfLimit) return { severity: 'yellow', pctOfLimit: pct }
    return { severity: null, pctOfLimit: pct }
  }
  if (tokens >= config.severity.redTokens) return { severity: 'red', pctOfLimit: null }
  if (tokens >= config.severity.yellowTokens) return { severity: 'yellow', pctOfLimit: null }
  return { severity: null, pctOfLimit: null }
}

function formatTokens(value) {
  const n = round(value)
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10}M`
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

// Cost line per PRD: tokens AND % of period limit AND ≈ hours of usage —
// but each piece appears only when honestly computable. No invented numbers.
function costFor(weightedTokens, limitContext = null) {
  const tokens = round(weightedTokens)
  const tokensPerPct = Number(limitContext?.tokensPerPct) || 0
  const tokensPerHour = Number(limitContext?.tokensPerHour) || 0
  const periodLabel = limitContext?.periodLabel || 'limit'
  const cost = { tokens, pctOfLimit: null, hoursEquivalent: null }
  const parts = [`${formatTokens(tokens)} tokens`]
  if (tokensPerPct > 0) {
    cost.pctOfLimit = Math.round((tokens / tokensPerPct) * 10) / 10
    parts.push(`≈ ${cost.pctOfLimit}% of your ${periodLabel}`)
  }
  if (tokensPerHour > 0) {
    cost.hoursEquivalent = Math.round((tokens / tokensPerHour) * 10) / 10
    parts.push(`≈ ${cost.hoursEquivalent}h of normal usage`)
  }
  cost.text = parts.join(' · ')
  return cost
}

function makeVerdict({ rule, id, severity, title, what, cost, fix, evidence, wastedTokens }) {
  return {
    rule,
    id,
    severity,
    title,
    what,
    cost,
    fix,
    evidence: evidence || {},
    wastedTokens: round(wastedTokens),
  }
}

module.exports = { severityFor, costFor, makeVerdict, formatTokens }
