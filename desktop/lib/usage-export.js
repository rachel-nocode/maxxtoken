// Builds the JSON payload for "Export usage + cost history". Shapes the live
// snapshot into a curated, stable, self-describing schema (rather than dumping
// internal snapshot fields) so statuslines, spreadsheets, and scripts can rely
// on it. Pure + deterministic given (snapshot, now) — easy to test.

const SCHEMA = 'maxxtoken.usage-export/v1'

function iso(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return null
  return new Date(n).toISOString()
}

function round(value, digits = 2) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const f = 10 ** digits
  return Math.round(n * f) / f
}

function int(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : null
}

function tokenBlock(tokenUsage) {
  if (!tokenUsage || typeof tokenUsage !== 'object') return null
  const total = int(tokenUsage.total)
  if (total == null) return null
  return {
    input: int(tokenUsage.input) || 0,
    cached: int(tokenUsage.cached) || 0,
    output: int(tokenUsage.output) || 0,
    total,
    costUSD: round(tokenUsage.costUSD),
    source: tokenUsage.source || null,
  }
}

function dailyRows(tokenUsage) {
  const rows = tokenUsage && (tokenUsage.dailyBreakdown || tokenUsage.dailyUsage)
  if (!Array.isArray(rows)) return []
  return rows
    .map((row) => ({
      date: row.date || row.dayKey || null,
      input: int(row.input) || 0,
      cached: int(row.cached) || 0,
      output: int(row.output) || 0,
      total: int(row.total) || 0,
      costUSD: round(row.costUSD),
    }))
    .filter((row) => row.date)
}

function modelRows(tokenUsage) {
  const rows = tokenUsage && (tokenUsage.modelBreakdowns || tokenUsage.topModels)
  if (!Array.isArray(rows)) return []
  return rows
    .map((row) => ({
      model: row.model || null,
      input: int(row.input) || 0,
      cached: int(row.cached) || 0,
      output: int(row.output) || 0,
      total: int(row.total) || 0,
      costUSD: round(row.costUSD),
    }))
    .filter((row) => row.model)
}

function exportProvider(p) {
  return {
    id: p.id,
    name: p.name || null,
    plan: p.plan || null,
    connected: !!p.connected,
    activity: p.activity || null,
    lastUpdatedAt: iso(p.lastUpdatedAt),
    monthlyBudgetUSD: round(p.totalValue ?? p.monthly),
    spentUSD: round(p.spentValue),
    remainingUSD: round(p.leftValue),
    capturedPct: int(p.capturedPct),
    status: p.status ? { indicator: p.status.indicator || null, label: p.status.label || null } : null,
    error: p.error || null,
    tokens: tokenBlock(p.tokenUsage),
    models: modelRows(p.tokenUsage),
    dailyHistory: dailyRows(p.tokenUsage),
  }
}

// dailyCost history lives on totals.tokens.dailyCost.days — the cross-provider
// cost-over-time series.
function dailyCostHistory(tokens) {
  const days = tokens && tokens.dailyCost && Array.isArray(tokens.dailyCost.days) ? tokens.dailyCost.days : []
  return days
    .map((d) => ({
      date: d.dayKey || d.date || null,
      total: int(d.total) || 0,
      input: int(d.input) || 0,
      cached: int(d.cached) || 0,
      output: int(d.output) || 0,
      costUSD: round(d.costUSD),
    }))
    .filter((d) => d.date)
}

function buildUsageExport(snapshot, options = {}) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('No usage snapshot available to export')
  }
  const now = options.now || Date.now()
  const totals = snapshot.totals || {}
  const tokens = totals.tokens || {}
  const providers = Array.isArray(snapshot.providers) ? snapshot.providers : []

  return {
    schema: SCHEMA,
    exportedAt: iso(now),
    generatedAt: iso(snapshot.generatedAt),
    app: { name: 'MaxxToken', version: options.appVersion || null },
    cycle: snapshot.cycle
      ? { label: snapshot.cycle.label || null, daysLeft: int(snapshot.cycle.daysLeft), totalDays: int(snapshot.cycle.totalDays) }
      : null,
    totals: {
      budgetUSD: round(totals.totalValue ?? totals.monthly),
      spentUSD: round(totals.spent ?? totals.captured),
      remainingUSD: round(totals.left ?? totals.remaining),
      capturedPct: int(totals.capturedPct),
      planCount: int(totals.planCount),
      tokens: {
        input: int(tokens.input) || 0,
        cached: int(tokens.cached) || 0,
        output: int(tokens.output) || 0,
        total: int(tokens.total) || 0,
        costUSD: round(tokens.costUSD),
        historyDays: int(tokens.historyDays),
      },
    },
    costHistory: dailyCostHistory(tokens),
    providers: providers.map(exportProvider),
  }
}

module.exports = { buildUsageExport, SCHEMA, _private: { tokenBlock, dailyRows, modelRows, exportProvider } }
