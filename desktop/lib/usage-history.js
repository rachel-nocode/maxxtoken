const fs = require('fs')
const os = require('os')
const path = require('path')

const DIR = path.join(os.homedir(), '.maxxtoken')
const FILE = path.join(DIR, 'usage-history.json')
const DAY = 86400000
const MAX_AGE_MS = 120 * DAY
const MAX_SAMPLES = 12000
const MAX_TOTALS = 3000
const MAX_TOKEN_TOTALS = 3000
const MIN_HISTORY_SAMPLES = 2
const MISS_UNUSED_THRESHOLD_PCT = 25

function readHistory(file = FILE) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    const samples = Array.isArray(parsed.samples) ? parsed.samples : []
    const totals = Array.isArray(parsed.totals) ? parsed.totals : []
    const tokens = Array.isArray(parsed.tokens) ? parsed.tokens : []
    return { samples: samples.filter(validSample), totals: totals.filter(validTotalRecord), tokens: tokens.filter(validTokenRecord) }
  } catch {
    return { samples: [], totals: [], tokens: [] }
  }
}

function writeHistory(history, file = FILE) {
  // Async fire-and-forget — never block snapshot path on disk write.
  const payload = JSON.stringify({ samples: history.samples || [], totals: history.totals || [], tokens: history.tokens || [] }, null, 2)
  fs.promises.mkdir(path.dirname(file), { recursive: true })
    .then(() => fs.promises.writeFile(file, payload))
    .catch(() => { /* best effort */ })
  return history
}

function sampleKey(sample) {
  return [
    sample.providerId,
    sample.windowLabel,
    sample.kind || 'cycle',
    Math.round(Number(sample.periodMs) || 0),
  ].join('|')
}

function hourBucket(ms) {
  return Math.floor(Number(ms) / 3600000)
}

function validSample(sample) {
  return (
    sample &&
    typeof sample.providerId === 'string' &&
    typeof sample.windowLabel === 'string' &&
    Number.isFinite(Number(sample.capturedAt)) &&
    Number.isFinite(Number(sample.usedPct)) &&
    Number.isFinite(Number(sample.resetAt)) &&
    Number.isFinite(Number(sample.periodMs)) &&
    Number(sample.periodMs) > 0
  )
}

function validTotalRecord(record) {
  return (
    record &&
    Number.isFinite(Number(record.capturedAt)) &&
    Number.isFinite(Number(record.totalValue)) &&
    Number.isFinite(Number(record.spentValue)) &&
    Number.isFinite(Number(record.leftValue)) &&
    Number.isFinite(Number(record.capturedPct))
  )
}

function validTokenRecord(record) {
  const hasRequired =
    record &&
    Number.isFinite(Number(record.capturedAt)) &&
    Number.isFinite(Number(record.total)) &&
    Number.isFinite(Number(record.input)) &&
    Number.isFinite(Number(record.cached)) &&
    Number.isFinite(Number(record.output)) &&
    Number(record.total) >= 0
  if (!hasRequired) return false
  return record.costUSD == null || Number.isFinite(Number(record.costUSD))
}

function samplesFromProviders(providers, now = Date.now()) {
  const samples = []
  for (const provider of providers || []) {
    if (!provider?.connected) continue
    for (const window of provider.windows || []) {
      const periodMs = Number(window.periodMs)
      const resetAt = Number(window.resetAt)
      const usedPct = Number(window.usedPct)
      if (!Number.isFinite(periodMs) || periodMs <= 0) continue
      if (!Number.isFinite(resetAt) || resetAt <= 0) continue
      if (!Number.isFinite(usedPct)) continue
      samples.push({
        providerId: provider.id,
        providerName: provider.name,
        windowLabel: window.label || window.kind || 'Window',
        kind: window.kind || 'cycle',
        periodMs,
        resetAt,
        usedPct: Math.max(0, Math.min(100, Math.round(usedPct))),
        capturedAt: now,
      })
    }
  }
  return samples
}

function tokenRecordFromTotals(tokens, now = Date.now()) {
  if (!tokens || !Number.isFinite(Number(tokens.total)) || Number(tokens.total) <= 0) return null
  const record = {
    capturedAt: now,
    input: Math.max(0, Math.round(Number(tokens.input) || 0)),
    cached: Math.max(0, Math.round(Number(tokens.cached) || 0)),
    output: Math.max(0, Math.round(Number(tokens.output) || 0)),
    total: Math.max(0, Math.round(Number(tokens.total) || 0)),
    providerCount: Number(tokens.providerCount) || 0,
    historyDays: Number(tokens.historyDays) || null,
  }
  if (Number.isFinite(Number(tokens.costUSD))) {
    record.costUSD = Math.max(0, Number(tokens.costUSD))
    record.costProviderCount = Number(tokens.costProviderCount) || 0
  }
  return record
}

function totalRecordFromSnapshot(totals, now = Date.now()) {
  if (!totals) return null
  const totalValue = Number(totals.totalValue ?? totals.monthly)
  const spentValue = Number(totals.spent ?? totals.captured)
  const leftValue = Number(totals.left ?? totals.remaining ?? totals.burned)
  const capturedPct = Number(totals.capturedPct)
  if (![totalValue, spentValue, leftValue, capturedPct].every(Number.isFinite)) return null
  if (totalValue <= 0) return null
  return {
    capturedAt: now,
    totalValue,
    spentValue,
    leftValue,
    capturedPct: Math.max(0, Math.min(100, Math.round(capturedPct))),
    providerCount: Number(totals.planCount) || 0,
    estimatedPlanCount: Number(totals.estimatedPlanCount) || 0,
  }
}

function compactSamples(samples, now = Date.now()) {
  const fresh = (samples || [])
    .filter(validSample)
    .filter((sample) => Number(sample.capturedAt) >= now - MAX_AGE_MS)
    .sort((a, b) => Number(a.capturedAt) - Number(b.capturedAt))
  if (fresh.length <= MAX_SAMPLES) return fresh
  return fresh.slice(fresh.length - MAX_SAMPLES)
}

function compactTotals(totals, now = Date.now()) {
  const fresh = (totals || [])
    .filter(validTotalRecord)
    .filter((record) => Number(record.capturedAt) >= now - MAX_AGE_MS)
    .sort((a, b) => Number(a.capturedAt) - Number(b.capturedAt))
  if (fresh.length <= MAX_TOTALS) return fresh
  return fresh.slice(fresh.length - MAX_TOTALS)
}

function compactTokenTotals(tokens, now = Date.now()) {
  const fresh = (tokens || [])
    .filter(validTokenRecord)
    .filter((record) => Number(record.capturedAt) >= now - MAX_AGE_MS)
    .sort((a, b) => Number(a.capturedAt) - Number(b.capturedAt))
  if (fresh.length <= MAX_TOKEN_TOTALS) return fresh
  return fresh.slice(fresh.length - MAX_TOKEN_TOTALS)
}

function mergeSamples(existing, incoming, now = Date.now()) {
  const byBucket = new Map()
  for (const sample of compactSamples([...(existing || []), ...(incoming || [])], now)) {
    const key = `${sampleKey(sample)}|${Math.round(Number(sample.resetAt) || 0)}|${hourBucket(sample.capturedAt)}`
    const current = byBucket.get(key)
    if (!current || Number(sample.capturedAt) >= Number(current.capturedAt)) byBucket.set(key, sample)
  }
  return compactSamples([...byBucket.values()], now)
}

function mergeTokenTotals(existing, incoming, now = Date.now()) {
  const byBucket = new Map()
  for (const record of compactTokenTotals([...(existing || []), ...(incoming || [])], now)) {
    const key = hourBucket(record.capturedAt)
    const current = byBucket.get(key)
    if (!current || Number(record.capturedAt) >= Number(current.capturedAt)) byBucket.set(key, record)
  }
  return compactTokenTotals([...byBucket.values()], now)
}

function mergeTotals(existing, incoming, now = Date.now()) {
  const byBucket = new Map()
  for (const record of compactTotals([...(existing || []), ...(incoming || [])], now)) {
    const key = hourBucket(record.capturedAt)
    const current = byBucket.get(key)
    if (!current || Number(record.capturedAt) >= Number(current.capturedAt)) byBucket.set(key, record)
  }
  return compactTotals([...byBucket.values()], now)
}

function recordSnapshot(providers, { now = Date.now(), file = FILE, totals = null, tokenTotals = null } = {}) {
  const history = readHistory(file)
  const incoming = samplesFromProviders(providers, now)
  const totalRecord = totalRecordFromSnapshot(totals, now)
  const tokenRecord = tokenRecordFromTotals(tokenTotals || totals?.tokens, now)
  if (!incoming.length && !totalRecord && !tokenRecord) return history
  const next = {
    samples: incoming.length ? mergeSamples(history.samples, incoming, now) : compactSamples(history.samples, now),
    totals: totalRecord ? mergeTotals(history.totals, [totalRecord], now) : compactTotals(history.totals, now),
    tokens: tokenRecord ? mergeTokenTotals(history.tokens, [tokenRecord], now) : compactTokenTotals(history.tokens, now),
  }
  writeHistory(next, file)
  return next
}

function completedNearResetSamples(history, providerId, window, now = Date.now()) {
  const periodMs = Number(window?.periodMs)
  if (!Number.isFinite(periodMs) || periodMs <= 0) return []
  const key = sampleKey({
    providerId,
    windowLabel: window.label || window.kind || 'Window',
    kind: window.kind || 'cycle',
    periodMs,
  })
  const nearResetMs = Math.max(2 * 3600000, Math.min(12 * 3600000, periodMs * 0.12))
  return (history?.samples || []).filter((sample) => {
    if (!validSample(sample)) return false
    if (sampleKey(sample) !== key) return false
    const resetAt = Number(sample.resetAt)
    const capturedAt = Number(sample.capturedAt)
    return resetAt < now && capturedAt <= resetAt && resetAt - capturedAt <= nearResetMs
  })
}

function windowInsight(history, providerId, window, now = Date.now()) {
  const samples = completedNearResetSamples(history, providerId, window, now)
  if (samples.length < MIN_HISTORY_SAMPLES) return null
  const unused = samples.map((sample) => Math.max(0, 100 - Number(sample.usedPct)))
  const averageUnusedPct = Math.round(unused.reduce((sum, value) => sum + value, 0) / unused.length)
  const missCount = unused.filter((value) => value >= MISS_UNUSED_THRESHOLD_PCT).length
  const missRiskPct = Math.round((missCount / unused.length) * 100)
  return {
    averageUnusedPct,
    missRiskPct,
    missCount,
    sampleCount: samples.length,
    riskLabel: `${missRiskPct}% miss risk`,
    label: `Usually leaves ${averageUnusedPct}%`,
  }
}

function windowSeries(history, providerId, window, now = Date.now(), limit = 24) {
  const periodMs = Number(window?.periodMs)
  const resetAt = Number(window?.resetAt)
  if (!Number.isFinite(periodMs) || periodMs <= 0) return []
  const key = sampleKey({
    providerId,
    windowLabel: window.label || window.kind || 'Window',
    kind: window.kind || 'cycle',
    periodMs,
  })
  return compactSamples(history?.samples || [], now)
    .filter((sample) => sampleKey(sample) === key)
    .filter((sample) => {
      if (!Number.isFinite(resetAt)) return true
      return Math.abs(Number(sample.resetAt) - resetAt) <= periodMs
    })
    .slice(-limit)
    .map((sample) => ({
      capturedAt: Number(sample.capturedAt),
      usedPct: Math.max(0, Math.min(100, Math.round(Number(sample.usedPct)))),
      resetAt: Number(sample.resetAt),
    }))
}

function applyInsights(providers, history, now = Date.now()) {
  return (providers || []).map((provider) => {
    if (!provider?.connected || !Array.isArray(provider.windows) || !provider.windows.length) return provider
    const windows = provider.windows.map((window) => {
      const insight = windowInsight(history, provider.id, window, now)
      const series = windowSeries(history, provider.id, window, now)
      return {
        ...window,
        ...(insight ? { history: insight } : {}),
        ...(series.length >= 2 ? { historySeries: series } : {}),
      }
    })
    const insights = windows.map((window) => window.history).filter(Boolean)
    if (!insights.length) return { ...provider, windows }
    const best = insights.sort((a, b) => b.averageUnusedPct - a.averageUnusedPct || b.sampleCount - a.sampleCount)[0]
    return {
      ...provider,
      windows,
      history: best,
    }
  })
}

function nearResetSamples(history, now = Date.now()) {
  const bestByReset = new Map()
  for (const sample of history?.samples || []) {
    if (!validSample(sample)) continue
    const resetAt = Number(sample.resetAt)
    const capturedAt = Number(sample.capturedAt)
    const periodMs = Number(sample.periodMs)
    if (resetAt >= now || capturedAt > resetAt) continue
    const nearResetMs = Math.max(2 * 3600000, Math.min(12 * 3600000, periodMs * 0.12))
    if (resetAt - capturedAt > nearResetMs) continue
    const key = `${sampleKey(sample)}|${Math.round(resetAt)}`
    const current = bestByReset.get(key)
    if (!current || Number(sample.capturedAt) > Number(current.capturedAt)) bestByReset.set(key, sample)
  }
  return [...bestByReset.values()]
}

function historySummary(history, now = Date.now()) {
  const samples = nearResetSamples(history, now)
  const byWindow = new Map()
  for (const sample of samples) {
    const key = sampleKey(sample)
    const group =
      byWindow.get(key) || {
        providerId: sample.providerId,
        providerName: sample.providerName || sample.providerId,
        windowLabel: sample.windowLabel,
        kind: sample.kind || 'cycle',
        periodMs: Number(sample.periodMs),
        unused: [],
      }
    group.unused.push(Math.max(0, 100 - Number(sample.usedPct)))
    byWindow.set(key, group)
  }

  const windows = [...byWindow.values()]
    .map((group) => {
      const averageUnusedPct = Math.round(group.unused.reduce((sum, value) => sum + value, 0) / group.unused.length)
      const missCount = group.unused.filter((value) => value >= MISS_UNUSED_THRESHOLD_PCT).length
      return {
        providerId: group.providerId,
        providerName: group.providerName,
        windowLabel: group.windowLabel,
        kind: group.kind,
        periodMs: group.periodMs,
        averageUnusedPct,
        missRiskPct: Math.round((missCount / group.unused.length) * 100),
        missCount,
        sampleCount: group.unused.length,
      }
    })
    .sort((a, b) => b.averageUnusedPct - a.averageUnusedPct || b.missRiskPct - a.missRiskPct || b.sampleCount - a.sampleCount)

  const unused = samples.map((sample) => Math.max(0, 100 - Number(sample.usedPct)))
  const averageUnusedPct = unused.length ? Math.round(unused.reduce((sum, value) => sum + value, 0) / unused.length) : null
  const providers = new Set(samples.map((sample) => sample.providerId))
  return {
    sampleCount: samples.length,
    providerCount: providers.size,
    windowCount: windows.length,
    averageUnusedPct,
    worst: windows.find((window) => window.sampleCount >= MIN_HISTORY_SAMPLES) || windows[0] || null,
  }
}

function valueTrendSummary(history, now = Date.now()) {
  const records = compactTotals(history?.totals || [], now).filter((record) => Number(record.capturedAt) >= now - 7 * DAY)
  if (records.length < 2) return null
  const first = records[0]
  const latest = records[records.length - 1]
  const points = records.slice(-12).map((record) => ({
    capturedAt: Number(record.capturedAt),
    capturedPct: Math.round(Number(record.capturedPct)),
    spentValue: Number(record.spentValue),
    leftValue: Number(record.leftValue),
  }))
  const deltaPct = Math.round(Number(latest.capturedPct) - Number(first.capturedPct))
  const deltaSpent = Number(latest.spentValue) - Number(first.spentValue)
  const hours = Math.max(1, Math.round((Number(latest.capturedAt) - Number(first.capturedAt)) / 3600000))
  return {
    sampleCount: records.length,
    hours,
    startPct: Math.round(Number(first.capturedPct)),
    currentPct: Math.round(Number(latest.capturedPct)),
    deltaPct,
    deltaSpent,
    currentSpent: Number(latest.spentValue),
    currentLeft: Number(latest.leftValue),
    totalValue: Number(latest.totalValue),
    providerCount: Number(latest.providerCount) || 0,
    points,
    direction: deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'flat',
  }
}

function tokenTrendSummary(history, now = Date.now()) {
  const records = compactTokenTotals(history?.tokens || [], now).filter((record) => Number(record.capturedAt) >= now - 7 * DAY)
  if (records.length < 2) return null
  const first = records[0]
  const latest = records[records.length - 1]
  const points = records.slice(-12).map((record) => ({
    capturedAt: Number(record.capturedAt),
    input: Number(record.input),
    cached: Number(record.cached),
    output: Number(record.output),
    total: Number(record.total),
    costUSD: Number.isFinite(Number(record.costUSD)) ? Number(record.costUSD) : null,
  }))
  const deltaTotal = Number(latest.total) - Number(first.total)
  const firstCost = Number(first.costUSD)
  const latestCost = Number(latest.costUSD)
  const hasCost = Number.isFinite(firstCost) && Number.isFinite(latestCost)
  const hours = Math.max(1, Math.round((Number(latest.capturedAt) - Number(first.capturedAt)) / 3600000))
  return {
    sampleCount: records.length,
    hours,
    startTotal: Number(first.total),
    currentTotal: Number(latest.total),
    deltaTotal,
    deltaInput: Number(latest.input) - Number(first.input),
    deltaCached: Number(latest.cached) - Number(first.cached),
    deltaOutput: Number(latest.output) - Number(first.output),
    deltaCostUSD: hasCost ? latestCost - firstCost : null,
    currentCostUSD: Number.isFinite(latestCost) ? latestCost : null,
    costProviderCount: Number(latest.costProviderCount) || 0,
    providerCount: Number(latest.providerCount) || 0,
    historyDays: Number(latest.historyDays) || null,
    points,
    direction: deltaTotal > 0 ? 'up' : deltaTotal < 0 ? 'down' : 'flat',
  }
}

module.exports = {
  FILE,
  readHistory,
  writeHistory,
  samplesFromProviders,
  tokenRecordFromTotals,
  totalRecordFromSnapshot,
  mergeSamples,
  mergeTotals,
  mergeTokenTotals,
  recordSnapshot,
  windowInsight,
  windowSeries,
  applyInsights,
  historySummary,
  valueTrendSummary,
  tokenTrendSummary,
  _private: {
    sampleKey,
    hourBucket,
    completedNearResetSamples,
    windowSeries,
    nearResetSamples,
    validTotalRecord,
    validTokenRecord,
  },
}
