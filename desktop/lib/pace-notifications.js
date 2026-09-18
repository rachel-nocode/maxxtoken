const fs = require('fs')
const os = require('os')
const path = require('path')

const FILE = path.join(os.homedir(), '.maxxtoken', 'pace-notifications.json')
const DEFAULT_MAX_AGE_MS = 20 * 60 * 1000
const RESET_JITTER_MS = 1000
const evaluatedFiles = new Set()

function evaluateSnapshot(snapshot, prefs = {}, file = FILE, now = Date.now(), options = {}) {
  const state = loadState(file)
  const launchBaseline = !evaluatedFiles.has(file)
  evaluatedFiles.add(file)
  const result = evaluateSnapshotWithState(snapshot, prefs, state, now, { ...options, launchBaseline })
  saveState(result.state, file)
  return result.events
}

function evaluateSnapshotWithState(snapshot, prefs = {}, state = emptyState(), now = Date.now(), options = {}) {
  const next = normalizeState(state)
  const candidates = []
  const enabled = {
    nearExhaustion: prefs?.paceAlerts?.nearExhaustion === true,
    runOut: prefs?.paceAlerts?.runOut === true,
  }
  const generatedAt = Number(snapshot?.generatedAt)
  const maxAgeMs = positiveNumber(options.maxAgeMs, DEFAULT_MAX_AGE_MS)
  const snapshotFresh = Number.isFinite(generatedAt) && generatedAt <= now + 60000 && now - generatedAt <= maxAgeMs
  const seen = new Set()

  for (const provider of snapshotFresh ? snapshot?.providers || [] : []) {
    if (!provider || provider.connected === false) continue
    if (provider.activity === 'stale' || provider.stale === true) continue
    const providerUpdatedAt = Number(provider.lastUpdatedAt)
    if (Number.isFinite(providerUpdatedAt) && now - providerUpdatedAt > maxAgeMs) continue
    for (const window of provider.windows || []) {
      const metric = paceMetric(provider, window, now)
      if (!metric) continue
      seen.add(metric.key)
      const previous = next.metrics[metric.key] || emptyMetricState()
      if (options.launchBaseline === true) previous.primed = false
      const transition = transitionForMetric(metric, previous, enabled, now)
      next.metrics[metric.key] = transition.state
      for (const milestone of transition.fire) candidates.push({ milestone, metric })
    }
  }

  for (const key of Object.keys(next.metrics)) {
    if (!seen.has(key) && now - Number(next.metrics[key]?.updatedAt || 0) > maxAgeMs * 3) delete next.metrics[key]
  }

  return { events: groupEvents(candidates, now), state: next }
}

function paceMetric(provider, window, now) {
  if (window?.forecastEligible === false) return null
  const resetAt = Number(window?.resetAt)
  const periodMs = Number(window?.periodMs)
  if (window?.pace?.projectedAtResetPercent == null || window?.usedPct == null) return null
  const projected = Number(window.pace.projectedAtResetPercent)
  const used = Number(window.usedPct)
  if (!Number.isFinite(resetAt) || resetAt <= now) return null
  if (!Number.isFinite(periodMs) || periodMs <= 0 || resetAt - now > periodMs + RESET_JITTER_MS) return null
  if (!Number.isFinite(projected) || projected < 0 || !Number.isFinite(used) || used < 0 || used > 100) return null

  const bucket = projected >= 100 || window?.pace?.willLastToReset === false
    ? 'runOut'
    : projected >= 90
      ? 'nearExhaustion'
      : 'healthy'
  const label = String(window.label || window.kind || 'Quota')
  return {
    key: [provider.id, label, window.kind || 'cycle', Math.round(periodMs)].join('|'),
    providerId: provider.id,
    providerName: provider.name || provider.id,
    windowLabel: label,
    resetAt,
    projectedPct: Math.round(projected),
    exhaustsAt: finiteOrNull(window?.pace?.exhaustsAt),
    bucket,
  }
}

function transitionForMetric(metric, previous, enabled, now = Date.now()) {
  const state = normalizeMetricState(previous)
  const resetAdvanced = state.resetAt == null || metric.resetAt - state.resetAt > RESET_JITTER_MS
  if (resetAdvanced) {
    state.fired = []
    state.bucket = null
  }
  state.resetAt = metric.resetAt
  state.updatedAt = now

  if (!state.primed) {
    state.primed = true
    state.bucket = metric.bucket
    return { fire: [], state }
  }

  const previousSeverity = severity(state.bucket)
  const currentSeverity = severity(metric.bucket)
  const fire = []
  if (currentSeverity < previousSeverity) {
    if (currentSeverity < severity('runOut')) remove(state.fired, 'runOut')
    if (currentSeverity < severity('nearExhaustion')) remove(state.fired, 'nearExhaustion')
  }

  let consumed = currentSeverity <= previousSeverity
  if (currentSeverity > previousSeverity) {
    const milestone = metric.bucket === 'runOut' ? 'runOut' : 'nearExhaustion'
    if (enabled[milestone] && !state.fired.includes(milestone)) {
      fire.push(milestone)
      state.fired.push(milestone)
      consumed = true
    }
  }
  if (consumed) state.bucket = metric.bucket
  return { fire, state }
}

function groupEvents(candidates, now) {
  const byMilestone = new Map()
  for (const candidate of candidates) {
    const group = byMilestone.get(candidate.milestone) || []
    group.push(candidate.metric)
    byMilestone.set(candidate.milestone, group)
  }
  return [...byMilestone.entries()].map(([milestone, metrics]) => {
    const runOut = milestone === 'runOut'
    const names = [...new Set(metrics.map((item) => item.providerName))]
    const prefix = names.length === 1 ? names[0] : `${names.length} providers`
    return {
      type: 'pace-change',
      milestone,
      providerIds: [...new Set(metrics.map((item) => item.providerId))],
      metrics,
      postedAt: now,
      title: runOut ? 'Projected to run out' : 'Projected near exhaustion',
      body: runOut
        ? `${prefix}: ${metricSummary(metrics)} before reset.`
        : `${prefix}: ${metricSummary(metrics)} projected to finish with less than 10% left.`,
    }
  })
}

function metricSummary(metrics) {
  if (metrics.length === 1) return metrics[0].windowLabel
  return `${metrics.length} quota windows`
}

function severity(bucket) {
  if (bucket === 'runOut') return 2
  if (bucket === 'nearExhaustion') return 1
  if (bucket === 'healthy') return 0
  return -1
}

function emptyMetricState() {
  return { resetAt: null, bucket: null, fired: [], primed: false, updatedAt: 0 }
}

function normalizeMetricState(value) {
  return {
    resetAt: Number.isFinite(Number(value?.resetAt)) ? Number(value.resetAt) : null,
    bucket: ['healthy', 'nearExhaustion', 'runOut'].includes(value?.bucket) ? value.bucket : null,
    fired: [...new Set((Array.isArray(value?.fired) ? value.fired : []).filter((item) => ['nearExhaustion', 'runOut'].includes(item)))],
    primed: value?.primed === true,
    updatedAt: Number(value?.updatedAt) || 0,
  }
}

function emptyState() {
  return { metrics: {} }
}

function normalizeState(value) {
  const metrics = {}
  if (value?.metrics && typeof value.metrics === 'object') {
    for (const [key, metric] of Object.entries(value.metrics)) metrics[key] = normalizeMetricState(metric)
  }
  return { metrics }
}

function loadState(file = FILE) {
  try { return normalizeState(JSON.parse(fs.readFileSync(file, 'utf8'))) } catch { return emptyState() }
}

function saveState(state, file = FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(normalizeState(state), null, 2))
  fs.renameSync(tmp, file)
}

function finiteOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function positiveNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function remove(values, value) {
  const index = values.indexOf(value)
  if (index !== -1) values.splice(index, 1)
}

module.exports = {
  FILE,
  evaluateSnapshot,
  evaluateSnapshotWithState,
  loadState,
  saveState,
  _private: { paceMetric, transitionForMetric, groupEvents, emptyState, severity },
}
