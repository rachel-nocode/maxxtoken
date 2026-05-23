const fs = require('fs')
const os = require('os')
const path = require('path')

const DIR = path.join(os.homedir(), '.maxxtoken')
const FILE = path.join(DIR, 'quota-notifications.json')
const DEPLETED_THRESHOLD = 0.0001
const DEFAULT_THRESHOLDS = [50, 20]

function evaluateSnapshot(snap, config = {}, file = FILE, now = Date.now()) {
  const state = loadState(file)
  const result = evaluateSnapshotWithState(snap, config, state, now)
  saveState(result.state, file)
  return result.events
}

function evaluateSnapshotWithState(snap, config = {}, state = emptyState(), now = Date.now()) {
  const next = normalizeState(state)
  const events = []
  const providers = (snap?.providers || []).filter((provider) => provider && provider.connected !== false)

  for (const provider of providers) {
    if (config.sessionQuotaNotificationsEnabled !== false) {
      const event = sessionQuotaEvent(provider, next)
      if (event) events.push(event)
    } else {
      delete next.sessions[provider.id]
    }

    if (config.quotaWarningNotificationsEnabled === true) {
      events.push(...quotaWarningEvents(provider, config, next, now))
    }
  }

  return { events, state: next }
}

function sessionQuotaEvent(provider, state) {
  const window = sessionWindow(provider)
  if (!window) {
    delete state.sessions[provider.id]
    return null
  }

  const currentRemaining = remainingPct(window)
  const previousRemaining = state.sessions[provider.id]?.remaining
  state.sessions[provider.id] = { remaining: currentRemaining, updatedAt: Date.now() }

  if (!Number.isFinite(currentRemaining)) return null

  const currentDepleted = isDepleted(currentRemaining)
  const previousDepleted = isDepleted(previousRemaining)

  if (previousRemaining == null && currentDepleted) return sessionEvent(provider, window, 'depleted', currentRemaining)
  if (previousRemaining == null) return null
  if (!previousDepleted && currentDepleted) return sessionEvent(provider, window, 'depleted', currentRemaining)
  if (previousDepleted && !currentDepleted) return sessionEvent(provider, window, 'restored', currentRemaining)
  return null
}

function quotaWarningEvents(provider, config, state, now) {
  const events = []
  for (const kind of ['session', 'weekly']) {
    if (!quotaWarningWindowEnabled(config, kind)) {
      delete state.warnings[warningKey(provider.id, kind)]
      continue
    }

    const window = kind === 'session' ? sessionWindow(provider) : weeklyWindow(provider)
    const key = warningKey(provider.id, kind)
    if (!window) {
      delete state.warnings[key]
      continue
    }

    const currentRemaining = remainingPct(window)
    if (!Number.isFinite(currentRemaining)) {
      delete state.warnings[key]
      continue
    }

    const thresholds = quotaWarningThresholds(config, kind)
    let entry = state.warnings[key] || { firedThresholds: [] }
    entry.firedThresholds = (entry.firedThresholds || []).filter((threshold) => currentRemaining <= threshold)

    const threshold = crossedThreshold(entry.lastRemaining, currentRemaining, thresholds, new Set(entry.firedThresholds))
    if (threshold != null) {
      entry.firedThresholds = activeThresholds(thresholds).filter((item) => item >= threshold)
      events.push(quotaWarningEvent(provider, window, kind, threshold, currentRemaining, now))
    }

    entry.lastRemaining = currentRemaining
    entry.updatedAt = now
    state.warnings[key] = entry
  }
  return events
}

function sessionEvent(provider, window, transition, remaining) {
  const depleted = transition === 'depleted'
  return {
    type: 'session-quota',
    transition,
    providerId: provider.id,
    providerName: provider.name || provider.id,
    windowLabel: window.label || 'Session',
    remainingPct: remaining,
    title: `${provider.name || provider.id} session ${depleted ? 'depleted' : 'restored'}`,
    body: depleted ? '0% left. I will tell you when it is available again.' : 'Session quota is available again.',
  }
}

function quotaWarningEvent(provider, window, kind, threshold, remaining, now) {
  const label = kind === 'weekly' ? 'weekly' : 'session'
  const remainingText = `${Math.round(Math.max(0, Math.min(100, remaining)))}%`
  return {
    type: 'quota-warning',
    providerId: provider.id,
    providerName: provider.name || provider.id,
    windowKind: kind,
    windowLabel: window.label || label,
    threshold,
    remainingPct: remaining,
    resetAt: window.resetAt || null,
    postedAt: now,
    title: `${provider.name || provider.id} ${label} quota low`,
    body: `${remainingText} left. Reached your ${threshold}% ${label} warning threshold.`,
  }
}

function sessionWindow(provider) {
  const windows = Array.isArray(provider?.windows) ? provider.windows : []
  return (
    windows.find((window) => isSessionWindow(window)) ||
    windows.find((window) => /session|rolling|5h|4h/i.test(String(window?.label || window?.kind || ''))) ||
    null
  )
}

function weeklyWindow(provider) {
  const windows = Array.isArray(provider?.windows) ? provider.windows : []
  return (
    windows.find((window) => /weekly|7d|week/i.test(String(window?.label || window?.kind || ''))) ||
    windows.find((window) => String(window?.kind || '') === 'cycle') ||
    null
  )
}

function isSessionWindow(window) {
  const label = String(window?.label || window?.kind || '')
  if (/session|5h|4h|rolling/i.test(label)) return true
  const period = Number(window?.periodMs)
  return Number.isFinite(period) && period > 0 && period <= 6 * 3600000
}

function remainingPct(window) {
  if (Number.isFinite(Number(window?.remainingPct))) return clampPct(window.remainingPct)
  const used = Number(window?.usedPct)
  if (!Number.isFinite(used)) return null
  return clampPct(100 - used)
}

function isDepleted(value) {
  return Number.isFinite(Number(value)) && Number(value) <= DEPLETED_THRESHOLD
}

function crossedThreshold(previousRemaining, currentRemaining, thresholds, alreadyFired) {
  const eligible = activeThresholds(thresholds).filter((threshold) => currentRemaining <= threshold && !alreadyFired.has(threshold))
  if (!eligible.length) return null
  if (Number.isFinite(Number(previousRemaining))) {
    const crossed = eligible.filter((threshold) => Number(previousRemaining) > threshold)
    return crossed.length ? Math.min(...crossed) : null
  }
  return Math.min(...eligible)
}

function quotaWarningWindowEnabled(config, kind) {
  if (kind === 'session') return config.quotaWarningSessionEnabled !== false
  if (kind === 'weekly') return config.quotaWarningWeeklyEnabled !== false
  return true
}

function quotaWarningThresholds(config, kind) {
  const specific = kind === 'weekly' ? config.quotaWarningWeeklyThresholds : config.quotaWarningSessionThresholds
  return sanitizeThresholds(specific || config.quotaWarningThresholds || DEFAULT_THRESHOLDS)
}

function sanitizeThresholds(raw) {
  const values = (Array.isArray(raw) ? raw : DEFAULT_THRESHOLDS)
    .map((value) => clampNumber(value, 0, 99, null))
    .filter((value) => value != null)
  const unique = [...new Set(values)].sort((a, b) => b - a)
  return unique.length ? unique : [...DEFAULT_THRESHOLDS]
}

function activeThresholds(raw) {
  return sanitizeThresholds(raw).filter((value) => value > 0)
}

function warningMarkerPercents(thresholds, showUsed = true) {
  return activeThresholds(thresholds)
    .map((threshold) => (showUsed ? 100 - threshold : threshold))
    .filter((value) => value > 0 && value < 100)
}

function warningKey(providerId, kind) {
  return `${providerId}:${kind}`
}

function clampPct(value) {
  return clampNumber(value, 0, 100, null)
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function emptyState() {
  return { sessions: {}, warnings: {} }
}

function normalizeState(state) {
  return {
    sessions: state?.sessions && typeof state.sessions === 'object' ? { ...state.sessions } : {},
    warnings: state?.warnings && typeof state.warnings === 'object' ? { ...state.warnings } : {},
  }
}

function loadState(file = FILE) {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch {
    return emptyState()
  }
}

function saveState(state, file = FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(normalizeState(state), null, 2))
}

module.exports = {
  FILE,
  evaluateSnapshot,
  evaluateSnapshotWithState,
  loadState,
  saveState,
  _private: {
    sessionWindow,
    weeklyWindow,
    remainingPct,
    isDepleted,
    crossedThreshold,
    sanitizeThresholds,
    activeThresholds,
    warningMarkerPercents,
    quotaWarningThresholds,
    quotaWarningWindowEnabled,
    emptyState,
  },
}
