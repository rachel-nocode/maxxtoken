const fs = require('fs')
const os = require('os')
const path = require('path')

const DIR = path.join(os.homedir(), '.maxxtoken')
const FILE = path.join(DIR, 'widget-snapshot.json')

function compactProvider(provider) {
  const primary = (provider.windows || [])[0] || null
  const secondary = (provider.windows || [])[1] || null
  const tokenUsage = compactTokenUsage(provider.tokenUsage)
  return {
    id: provider.id,
    name: provider.name,
    plan: provider.plan,
    monthly: provider.monthly ?? null,
    connected: provider.connected === true,
    needsKey: provider.needsKey === true,
    activity: provider.activity || 'none',
    capturedPct: provider.capturedPct ?? null,
    remainingPct: provider.remainingPct ?? null,
    spentValue: provider.spentValue ?? null,
    leftValue: provider.leftValue ?? null,
    resetAt: provider.resetAt || primary?.resetAt || null,
    urgent: provider.urgent === true,
    error: provider.error || null,
    sourceLabel: provider.sourceLabel || provider.tokenUsage?.source || null,
    primaryWindow: compactWindow(primary),
    secondaryWindow: compactWindow(secondary),
    tokenUsage,
    dailyUsage: tokenUsage?.dailyUsage || [],
  }
}

function compactTokenUsage(tokenUsage) {
  if (!tokenUsage) return null
  return {
    total: tokenUsage.total ?? null,
    input: tokenUsage.input ?? null,
    cached: tokenUsage.cached ?? null,
    output: tokenUsage.output ?? null,
    costUSD: tokenUsage.costUSD ?? null,
    costAccuracy: tokenUsage.costAccuracy || null,
    pricingSource: tokenUsage.pricingSource || null,
    pricingSources: tokenUsage.pricingSources || [],
    source: tokenUsage.source || null,
    priorityEvents: tokenUsage.priorityEvents ?? null,
    serviceTiers: compactServiceTierBreakdowns(tokenUsage.serviceTierBreakdowns),
    topModels: compactModelBreakdowns(tokenUsage.modelBreakdowns),
    dailyUsage: compactDailyUsage(tokenUsage.dailyBreakdown),
  }
}

function compactServiceTierBreakdowns(serviceTierBreakdowns) {
  return (Array.isArray(serviceTierBreakdowns) ? serviceTierBreakdowns : [])
    .filter((row) => Number(row?.total) > 0)
    .slice(0, 3)
    .map((row) => ({
      serviceTier: row.serviceTier || 'unknown',
      total: row.total ?? null,
      input: row.input ?? null,
      cached: row.cached ?? null,
      output: row.output ?? null,
      events: row.events ?? null,
    }))
}

function compactModelBreakdowns(modelBreakdowns) {
  return (Array.isArray(modelBreakdowns) ? modelBreakdowns : [])
    .filter((row) => Number(row?.total) > 0)
    .slice(0, 5)
    .map((row) => ({
      model: row.model || row.modelName || 'unknown',
      total: row.total ?? null,
      input: row.input ?? null,
      cached: row.cached ?? null,
      output: row.output ?? null,
      costUSD: row.costUSD ?? null,
      costAccuracy: row.costAccuracy || null,
      pricingSource: row.pricingSource || null,
      pricingModel: row.pricingModel || null,
      requests: row.requests ?? null,
    }))
}

function compactDailyUsage(dailyBreakdown) {
  return (Array.isArray(dailyBreakdown) ? dailyBreakdown : [])
    .filter((row) => Number(row?.total) > 0 || Number.isFinite(Number(row?.costUSD)))
    .slice(0, 14)
    .map((row) => ({
      dayKey: row.date || row.dayKey || null,
      totalTokens: row.total ?? null,
      costUSD: row.costUSD ?? null,
      requests: row.requests ?? null,
      topModels: compactModelBreakdowns(row.modelBreakdowns).slice(0, 3),
    }))
}

function compactWindow(window) {
  if (!window) return null
  return {
    label: window.label || window.kind || 'Window',
    kind: window.kind || 'cycle',
    usedPct: window.usedPct ?? null,
    resetAt: window.resetAt || null,
    historyRiskPct: window.history?.missRiskPct || null,
    pace: window.pace
      ? {
          tone: window.pace.tone,
          leftLabel: window.pace.leftLabel,
          willLastToReset: window.pace.willLastToReset,
        }
      : null,
  }
}

function buildWidgetSnapshot(snapshot) {
  const providers = Array.isArray(snapshot?.providers) ? snapshot.providers : []
  return {
    generatedAt: new Date(snapshot?.generatedAt || Date.now()).toISOString(),
    cycle: snapshot?.cycle || null,
    totals: {
      totalValue: snapshot?.totals?.totalValue ?? snapshot?.totals?.monthly ?? null,
      spent: snapshot?.totals?.spent ?? snapshot?.totals?.captured ?? null,
      left: snapshot?.totals?.left ?? snapshot?.totals?.remaining ?? null,
      capturedPct: snapshot?.totals?.capturedPct ?? null,
      planCount: snapshot?.totals?.planCount ?? providers.filter((provider) => provider.connected).length,
      tokens: snapshot?.totals?.tokens || null,
      tokenTrend: snapshot?.totals?.tokenTrend || null,
      trend: snapshot?.totals?.trend || null,
    },
    rating: snapshot?.rating || null,
    maxxTarget: snapshot?.maxxTarget || null,
    resetQueue: snapshot?.totals?.resetQueue || [],
    history: snapshot?.totals?.history || null,
    providers: providers.map(compactProvider),
    enabledProviderIds: providers.map((provider) => provider.id),
  }
}

function saveWidgetSnapshot(snapshot, file = FILE) {
  const compact = buildWidgetSnapshot(snapshot)
  const payload = JSON.stringify(compact, null, 2)
  // Async fire-and-forget — widget snapshot is best-effort persistence.
  fs.promises.mkdir(path.dirname(file), { recursive: true })
    .then(() => fs.promises.writeFile(file, payload))
    .catch(() => { /* best effort */ })
  return compact
}

function readWidgetSnapshot(file = FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

module.exports = {
  FILE,
  buildWidgetSnapshot,
  saveWidgetSnapshot,
  readWidgetSnapshot,
  _private: {
    compactProvider,
    compactTokenUsage,
    compactModelBreakdowns,
    compactDailyUsage,
    compactWindow,
  },
}
