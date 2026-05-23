const fs = require('fs')
const os = require('os')
const path = require('path')

const DIR = path.join(os.homedir(), '.maxxtoken')
const FILE = path.join(DIR, 'maxx-alerts.json')
const MAX_ALERT_AGE_MS = 45 * 86400000
const DEFAULT_THRESHOLD_HOURS = 48
const DEFAULT_MIN_RESERVE_PCT = 25

function alertCandidateFromSnapshot(snap, now = Date.now(), options = {}) {
  const target = snap?.maxxTarget
  if (!target) return null
  const resetAt = Number(target.resetAt)
  if (!Number.isFinite(resetAt)) return null
  const timeLeftMs = resetAt - now

  const reservePct = Number(target.reservePct)

  const provider = (snap.providers || []).find((p) => p.id === target.id)
  if (provider?.status && ['major', 'critical'].includes(provider.status.indicator)) return null
  const providerOptions = providerAlertOptions(target.id, options)
  if (providerOptions.alertsEnabled === false) return null

  const window = soonestWindow(provider, resetAt)
  const hoursBeforeReset = providerOptions.alertHours ?? options.hoursBeforeReset
  const thresholdMs = clampNumber(hoursBeforeReset, 1, 168, DEFAULT_THRESHOLD_HOURS) * 3600000
  if (timeLeftMs <= 0 || timeLeftMs > thresholdMs) return null

  const minReservePct = clampNumber(
    providerOptions.alertReservePct ?? options.minReservePct,
    1,
    99,
    DEFAULT_MIN_RESERVE_PCT,
  )
  if (!Number.isFinite(reservePct) || reservePct < minReservePct) return null

  const key = `${target.id}:${window?.label || 'reset'}:${Math.round(resetAt / 60000)}`
  const value = Number(target.valueLeft)
  const valueText = Number.isFinite(value) && value > 0 ? ` · $${Math.round(value).toLocaleString('en-US')} left` : ''
  const history = target.historyRiskNote ? ` · ${String(target.historyRiskNote).toLowerCase()}` : ''
  return {
    key,
    providerId: target.id,
    providerName: target.name,
    title: `Maxx ${target.name} before reset`,
    body: `${target.reason}${history}${valueText} · resets in ${duration(timeLeftMs)}.`,
    resetAt,
    timeLeftMs,
    reservePct,
  }
}

function providerAlertOptions(providerId, options = {}) {
  const providers = options.providers || options.providerAlertOverrides || {}
  const provider = providers?.[providerId] || {}
  return {
    alertsEnabled: provider.alertsEnabled,
    alertHours: provider.alertHours,
    alertReservePct: provider.alertReservePct,
  }
}

function shouldPostAlert(candidate, state = loadState(), now = Date.now()) {
  if (!candidate) return { shouldPost: false, state }
  const nextState = pruneState(state, now)
  if (nextState.sent?.[candidate.key]) return { shouldPost: false, state: nextState }
  return {
    shouldPost: true,
    state: {
      ...nextState,
      sent: {
        ...(nextState.sent || {}),
        [candidate.key]: now,
      },
    },
  }
}

function recordAlert(candidate, file = FILE, now = Date.now()) {
  const decision = shouldPostAlert(candidate, loadState(file), now)
  saveState(decision.state, file)
  return decision.shouldPost
}

function loadState(file = FILE) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return { sent: parsed && typeof parsed.sent === 'object' ? parsed.sent : {} }
  } catch {
    return { sent: {} }
  }
}

function saveState(state, file = FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(state, null, 2))
}

function pruneState(state, now = Date.now()) {
  const sent = {}
  for (const [key, value] of Object.entries(state?.sent || {})) {
    const ts = Number(value)
    if (Number.isFinite(ts) && now - ts <= MAX_ALERT_AGE_MS) sent[key] = ts
  }
  return { sent }
}

function soonestWindow(provider, resetAt) {
  const windows = Array.isArray(provider?.windows) ? provider.windows : []
  return windows
    .filter((w) => Number.isFinite(Number(w.resetAt)))
    .sort((a, b) => Math.abs(Number(a.resetAt) - resetAt) - Math.abs(Number(b.resetAt) - resetAt))[0]
}

function duration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes - days * 1440) / 60)
  const mins = minutes - days * 1440 - hours * 60
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${mins}m`
  return `${mins}m`
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

module.exports = {
  alertCandidateFromSnapshot,
  shouldPostAlert,
  recordAlert,
  _private: { duration, pruneState, loadState, saveState, clampNumber },
}
