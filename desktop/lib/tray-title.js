function trayMoney(n) {
  return '$' + Math.round(n || 0).toLocaleString('en-US')
}

function formatTokens(n) {
  const v = Math.round(Number(n) || 0)
  const compact = (value, suffix) => value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, '') + suffix
  if (v >= 1000000) return compact(v / 1000000, 'M')
  if (v >= 1000) return compact(v / 1000, 'K')
  return v.toLocaleString('en-US')
}

function fmtRunway(ms) {
  if (ms <= 0) return '0m'
  let s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  s -= d * 86400
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function trayTitleFromSnapshot(snap, metric = 'left', now = Date.now()) {
  const totals = snap?.totals || {}
  const fallback = () => ` ${trayMoney(totals.left ?? totals.remaining ?? totals.burned)}`

  switch (metric) {
    case 'spent':
      return ` ${trayMoney(totals.spent ?? totals.captured)} spent`
    case 'percent':
      return ` ${Math.round(totals.capturedPct || 0)}%`
    case 'target':
      return snap?.maxxTarget?.name ? ` ${snap.maxxTarget.name}` : fallback()
    case 'reset': {
      const resetAt = totals.resetQueue?.[0]?.resetAt || snap?.maxxTarget?.resetAt
      return resetAt ? ` ${fmtRunway(Math.max(0, resetAt - now))}` : fallback()
    }
    case 'tokens': {
      const total = totals.tokens?.total || 0
      return total ? ` ${formatTokens(total)}` : fallback()
    }
    case 'left':
    default:
      return fallback()
  }
}

module.exports = { trayTitleFromSnapshot, trayMoney, formatTokens, fmtRunway }
