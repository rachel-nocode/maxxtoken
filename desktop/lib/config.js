const fs = require('fs')
const os = require('os')
const path = require('path')
const { canonicalProviderId } = require('./provider-ids')
const openUsagePreferences = require('./openusage-preferences')
const { defaultProviders, getProviderCapability } = require('./provider-capabilities')

const DIR = path.join(os.homedir(), '.maxxtoken')
const FILE = path.join(DIR, 'config.json')
const TRAY_METRICS = new Set(['burnbar', 'pins', 'left', 'spent', 'percent', 'target', 'reset', 'tokens'])
const USAGE_METER_MODES = new Set(['used', 'left'])

// Default subscriptions. Costs are what people typically overspend on.
const DEFAULT_CONFIG = {
  billingDay: 1,
  openAtLogin: true,
  maxxAlertsEnabled: true,
  maxxAlertHours: 48,
  maxxAlertReservePct: 25,
  sessionQuotaNotificationsEnabled: true,
  quotaWarningNotificationsEnabled: false,
  quotaWarningThresholds: [50, 20],
  quotaWarningSessionThresholds: [50, 20],
  quotaWarningWeeklyThresholds: [50, 20],
  quotaWarningSessionEnabled: true,
  quotaWarningWeeklyEnabled: true,
  trayMetric: 'burnbar',
  trayPins: [],
  metricLayouts: {},
  expandedProviderIds: [],
  openUsagePrefs: openUsagePreferences.normalize(),
  accountLayoutBindings: {},
  usageMeterMode: 'used',
  // Local read-only HTTP API (loopback only) for statuslines/scripts/tmux.
  localApiPort: 7878,
  tokenHistoryDays: 30,
  saveModeSuggestions: false,
  logLevel: 'info',
  proxy: { enabled: false, url: '', bypassLoopback: true },
  unknownModelFallback: { enabled: false, models: {} },
  pricingSupplementUrl: '',
  onboardingComplete: false,
  // null = not yet decided, true = on, false = declined.
  missions: null,
  missionHistory: [],
  providers: defaultProviders(),
}

function loadConfig(file = FILE) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    const providers = normalizeProviders(raw.providers)
    return {
      billingDay: raw.billingDay || 1,
      openAtLogin: raw.openAtLogin ?? DEFAULT_CONFIG.openAtLogin,
      maxxAlertsEnabled: raw.maxxAlertsEnabled ?? DEFAULT_CONFIG.maxxAlertsEnabled,
      maxxAlertHours: clampNumber(raw.maxxAlertHours, 1, 168, DEFAULT_CONFIG.maxxAlertHours),
      maxxAlertReservePct: clampNumber(raw.maxxAlertReservePct, 1, 99, DEFAULT_CONFIG.maxxAlertReservePct),
      sessionQuotaNotificationsEnabled: raw.sessionQuotaNotificationsEnabled ?? DEFAULT_CONFIG.sessionQuotaNotificationsEnabled,
      quotaWarningNotificationsEnabled: raw.quotaWarningNotificationsEnabled ?? DEFAULT_CONFIG.quotaWarningNotificationsEnabled,
      quotaWarningThresholds: normalizeQuotaWarningThresholds(raw.quotaWarningThresholds),
      quotaWarningSessionThresholds: normalizeQuotaWarningThresholds(raw.quotaWarningSessionThresholds || raw.quotaWarningThresholds),
      quotaWarningWeeklyThresholds: normalizeQuotaWarningThresholds(raw.quotaWarningWeeklyThresholds || raw.quotaWarningThresholds),
      quotaWarningSessionEnabled: raw.quotaWarningSessionEnabled ?? DEFAULT_CONFIG.quotaWarningSessionEnabled,
      quotaWarningWeeklyEnabled: raw.quotaWarningWeeklyEnabled ?? DEFAULT_CONFIG.quotaWarningWeeklyEnabled,
      trayMetric: normalizeTrayMetric(raw.trayMetric),
      trayPins: normalizeTrayPins(raw.trayPins),
      metricLayouts: normalizeMetricLayouts(raw.metricLayouts),
      expandedProviderIds: normalizeProviderIds(raw.expandedProviderIds),
      openUsagePrefs: openUsagePreferences.normalize(raw.openUsagePrefs),
      accountLayoutBindings: normalizeAccountLayoutBindings(raw.accountLayoutBindings),
      usageMeterMode: normalizeUsageMeterMode(raw.usageMeterMode),
      localApiPort: clampNumber(raw.localApiPort, 1, 65535, DEFAULT_CONFIG.localApiPort),
      tokenHistoryDays: normalizeTokenHistoryDays(raw.tokenHistoryDays),
      saveModeSuggestions: raw.saveModeSuggestions === true,
      logLevel: normalizeLogLevel(raw.logLevel),
      proxy: normalizeProxyConfig(raw.proxy),
      unknownModelFallback: normalizeUnknownModelFallback(raw.unknownModelFallback),
      pricingSupplementUrl: normalizePricingSupplementUrl(raw.pricingSupplementUrl),
      onboardingComplete: raw.onboardingComplete === true,
      missions: typeof raw.missions === 'boolean' ? raw.missions : null,
      missionHistory: normalizeMissionHistory(raw.missionHistory),
      providerOptOuts: normalizeProviderOptOuts(raw.providerOptOuts),
      providerOrder: normalizeProviderOrder(raw.providerOrder, providers),
      providers,
    }
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG))
  }
}

function normalizeProviderOrder(rawOrder, providers) {
  const all = Object.keys(providers || {})
  const seen = new Set()
  const out = []
  if (Array.isArray(rawOrder)) {
    for (const id of rawOrder) {
      const canonical = canonicalProviderId(id)
      if ((!providers[canonical] && !isAccountInstanceId(canonical)) || seen.has(canonical)) continue
      seen.add(canonical)
      out.push(canonical)
    }
  }
  for (const id of all) if (!seen.has(id)) out.push(id)
  return out
}

function normalizeMissionHistory(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => item && typeof item === 'object')
    .slice(0, 20)
    .map((item) => ({
      id: String(item.id || Date.now()),
      title: String(item.title || 'Project Mission').slice(0, 140),
      dir: String(item.dir || ''),
      cli: String(item.cli || ''),
      models: Array.isArray(item.models) ? item.models.slice(0, 8).map((m) => String(m).slice(0, 80)) : [],
      status: String(item.status || 'sent').slice(0, 40),
      createdAt: Number(item.createdAt) || Date.now(),
      goalPath: String(item.goalPath || ''),
      promptLaunched: item.promptLaunched === true,
    }))
}

function normalizeProviders(rawProviders) {
  const providers = { ...DEFAULT_CONFIG.providers }
  const entries = Object.entries(rawProviders || {})
  // Merge aliases first so an explicit canonical id wins if both exist.
  for (const canonicalOnly of [false, true]) {
    for (const [id, p] of entries) {
      const canonical = canonicalProviderId(id)
      if ((id === canonical) !== canonicalOnly) continue
      if (!DEFAULT_CONFIG.providers[canonical]) continue
      providers[canonical] = { ...providers[canonical], ...p }
    }
  }
  for (const [id, provider] of Object.entries(providers)) {
    providers[id] = normalizeProviderConfig(provider, id)
  }
  return providers
}

function saveConfig(config, file = FILE) {
  fs.mkdirSync(DIR, { recursive: true })
  const providers = normalizeProviders(config.providers)
  const normalized = {
    ...config,
    trayMetric: normalizeTrayMetric(config.trayMetric),
    trayPins: normalizeTrayPins(config.trayPins),
    metricLayouts: normalizeMetricLayouts(config.metricLayouts),
    expandedProviderIds: normalizeProviderIds(config.expandedProviderIds),
    openUsagePrefs: openUsagePreferences.normalize(config.openUsagePrefs),
    accountLayoutBindings: normalizeAccountLayoutBindings(config.accountLayoutBindings),
    usageMeterMode: normalizeUsageMeterMode(config.usageMeterMode),
    tokenHistoryDays: normalizeTokenHistoryDays(config.tokenHistoryDays),
    logLevel: normalizeLogLevel(config.logLevel),
    proxy: normalizeProxyConfig(config.proxy),
    unknownModelFallback: normalizeUnknownModelFallback(config.unknownModelFallback),
    pricingSupplementUrl: normalizePricingSupplementUrl(config.pricingSupplementUrl),
    quotaWarningThresholds: normalizeQuotaWarningThresholds(config.quotaWarningThresholds),
    quotaWarningSessionThresholds: normalizeQuotaWarningThresholds(config.quotaWarningSessionThresholds || config.quotaWarningThresholds),
    quotaWarningWeeklyThresholds: normalizeQuotaWarningThresholds(config.quotaWarningWeeklyThresholds || config.quotaWarningThresholds),
    missionHistory: normalizeMissionHistory(config.missionHistory),
    providerOptOuts: normalizeProviderOptOuts(config.providerOptOuts),
    providerOrder: normalizeProviderOrder(config.providerOrder, providers),
    providers,
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(normalized, null, 2))
  return normalized
}

// Billing cycle anchored to billingDay of the month.
function billingCycle(billingDay = 1) {
  const now = new Date()
  let start = new Date(now.getFullYear(), now.getMonth(), billingDay)
  if (start > now) start = new Date(now.getFullYear(), now.getMonth() - 1, billingDay)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, billingDay)
  const dayMs = 86400000
  return {
    start,
    end,
    startMs: start.getTime(),
    endMs: end.getTime(),
    daysElapsed: Math.max(1, Math.floor((now - start) / dayMs)),
    daysLeft: Math.max(0, Math.ceil((end - now) / dayMs)),
    totalDays: Math.round((end - start) / dayMs),
    label: start.toLocaleString('en-US', { month: 'short' }) + ' cycle',
  }
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function normalizeTrayMetric(value) {
  return TRAY_METRICS.has(value) ? value : DEFAULT_CONFIG.trayMetric
}

function normalizeProviderIds(value) {
  return Array.isArray(value)
    ? [...new Set(value.map(canonicalProviderId).filter((id) => DEFAULT_CONFIG.providers[id] || isAccountInstanceId(id)))].slice(0, 50)
    : []
}

function isAccountInstanceId(id) {
  return /^(claude|codex)@[0-9a-f]{12}$/.test(id)
}

function normalizeAccountLayoutBindings(value) {
  const out = {}
  for (const family of ['claude', 'codex']) {
    if (typeof value?.[family] === 'string' && value[family].startsWith(`${family}@`) && isAccountInstanceId(value[family])) out[family] = value[family]
  }
  return out
}

function normalizeMetricIdList(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 180))].slice(0, 80)
    : []
}

function normalizeMetricLayouts(value) {
  const layouts = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return layouts
  for (const [rawId, rawLayout] of Object.entries(value)) {
    const id = canonicalProviderId(rawId)
    if ((!DEFAULT_CONFIG.providers[id] && !isAccountInstanceId(id)) || !rawLayout || typeof rawLayout !== 'object') continue
    layouts[id] = {
      version: 1,
      order: normalizeMetricIdList(rawLayout.order),
      primary: normalizeMetricIdList(rawLayout.primary),
      hidden: normalizeMetricIdList(rawLayout.hidden),
      knownMetricIds: normalizeMetricIdList(rawLayout.knownMetricIds),
    }
  }
  return layouts
}

function normalizeTrayPins(value) {
  const pins = []
  const perProvider = new Map()
  for (const raw of Array.isArray(value) ? value : []) {
    if (!raw || typeof raw !== 'object') continue
    const providerId = canonicalProviderId(raw.providerId)
    const metricId = typeof raw.metricId === 'string' ? raw.metricId.slice(0, 180) : ''
    if ((!DEFAULT_CONFIG.providers[providerId] && !isAccountInstanceId(providerId)) || !metricId) continue
    const count = perProvider.get(providerId) || 0
    if (count >= 2) continue
    perProvider.set(providerId, count + 1)
    pins.push({ providerId, metricId, style: raw.style === 'text' ? 'text' : 'bar' })
  }
  return pins.slice(0, 12)
}

function normalizeUsageMeterMode(value) {
  const normalized = value === 'remaining' ? 'left' : value
  return USAGE_METER_MODES.has(normalized) ? normalized : DEFAULT_CONFIG.usageMeterMode
}

function normalizeTokenHistoryDays(value) {
  return clampNumber(value, 1, 365, DEFAULT_CONFIG.tokenHistoryDays)
}

function normalizeQuotaWarningThresholds(raw) {
  const values = (Array.isArray(raw) ? raw : DEFAULT_CONFIG.quotaWarningThresholds)
    .map((value) => clampNumber(value, 0, 99, null))
    .filter((value) => value != null)
  const unique = [...new Set(values)].sort((a, b) => b - a)
  return unique.length ? unique : [...DEFAULT_CONFIG.quotaWarningThresholds]
}

function normalizeProviderConfig(provider, id = provider?.id) {
  const next = { ...provider }
  const capability = getProviderCapability(id)
  if (capability) {
    next.tier = capability.tier
    next.status = capability.status
    next.auth = capability.auth
  }
  if (next.alertsEnabled != null) next.alertsEnabled = next.alertsEnabled !== false
  if (next.alertReservePct != null) next.alertReservePct = clampNumber(next.alertReservePct, 1, 99, DEFAULT_CONFIG.maxxAlertReservePct)
  return next
}

function normalizeLogLevel(value) {
  return ['error', 'warn', 'info', 'debug'].includes(value) ? value : DEFAULT_CONFIG.logLevel
}

function normalizeProxyConfig(value) {
  const raw = value && typeof value === 'object' ? value : {}
  let url = String(raw.url || '').trim()
  if (url) {
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:', 'socks5:'].includes(parsed.protocol)) throw new Error('unsupported proxy protocol')
      parsed.username = ''
      parsed.password = ''
      url = parsed.toString().replace(/\/$/, '')
    } catch {
      url = ''
    }
  }
  return {
    enabled: raw.enabled === true && !!url,
    url,
    bypassLoopback: true,
  }
}

function normalizePricingSupplementUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : ''
  } catch { return '' }
}

function normalizeUnknownModelFallback(value) {
  const raw = value && typeof value === 'object' ? value : {}
  const models = {}
  for (const [providerId, model] of Object.entries(raw.models || {})) {
    const id = canonicalProviderId(providerId)
    const label = typeof model === 'string' ? model.trim().slice(0, 160) : ''
    if (DEFAULT_CONFIG.providers[id] && label) models[id] = label
  }
  return { enabled: raw.enabled === true, models }
}

function normalizeProviderOptOuts(value) {
  return Array.isArray(value)
    ? [...new Set(value.map(canonicalProviderId).filter((id) => DEFAULT_CONFIG.providers[id]))]
    : []
}

function mergeProviderOptOuts(currentConfig = {}, nextConfig = {}, options = {}) {
  const optOuts = new Set(normalizeProviderOptOuts(currentConfig.providerOptOuts))
  const currentProviders = currentConfig.providers || {}
  const nextProviders = nextConfig.providers || {}
  const firstOnboardingSave = currentConfig.onboardingComplete !== true && nextConfig.onboardingComplete === true
  const explicitIds = new Set((options.explicitProviderIds || []).map(canonicalProviderId))
  for (const id of Object.keys(DEFAULT_CONFIG.providers)) {
    const capability = getProviderCapability(id)
    if (firstOnboardingSave && !explicitIds.size && (capability?.tier !== 'core' || capability?.status !== 'supported')) continue
    if (firstOnboardingSave && explicitIds.size && !explicitIds.has(id)) continue
    const before = currentProviders[id]?.enabled === true
    const after = nextProviders[id]?.enabled === true
    if (!firstOnboardingSave && before === after && !explicitIds.has(id)) continue
    if (after) optOuts.delete(id)
    else optOuts.add(id)
  }
  return normalizeProviderOptOuts([...optOuts])
}

module.exports = {
  loadConfig,
  saveConfig,
  billingCycle,
  FILE,
  DEFAULT_CONFIG,
  mergeProviderOptOuts,
  _private: { normalizeProviders, normalizeTrayMetric, normalizeTrayPins, normalizeMetricLayouts, normalizeProviderIds, normalizeUsageMeterMode, normalizeTokenHistoryDays, normalizeQuotaWarningThresholds, normalizeProviderConfig, normalizeMissionHistory, normalizeLogLevel, normalizeProxyConfig, normalizePricingSupplementUrl, normalizeUnknownModelFallback, normalizeProviderOptOuts },
}
