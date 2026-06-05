const fs = require('fs')
const os = require('os')
const path = require('path')
const { canonicalProviderId } = require('./provider-ids')
const { normalizeFlowCheckpoints } = require('./flow-checkpoints')

const DIR = path.join(os.homedir(), '.maxxtoken')
const FILE = path.join(DIR, 'config.json')
const TRAY_METRICS = new Set(['burnbar', 'left', 'spent', 'percent', 'target', 'reset', 'tokens'])
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
  usageMeterMode: 'used',
  // Local read-only HTTP API (loopback only) for statuslines/scripts/tmux.
  localApiPort: 7878,
  tokenHistoryDays: 30,
  saveModeSuggestions: false,
  onboardingComplete: false,
  // null = not yet decided, true = on, false = declined.
  missions: null,
  missionHistory: [],
  flowCheckpoints: [],
  // tier drives which providers the UI lists:
  //   'core'     — the popular agents both CodexBar + OpenUsage track; shown by default.
  //   'extended' — secondary/API providers; revealed later via a "more providers" drawer.
  //   'hidden'   — long-tail/niche providers nobody monitors; kept in code (reversible,
  //                adapters intact) but never listed in the UI.
  providers: {
    claude: { name: 'Claude', plan: 'Max', monthly: 200, enabled: false, tier: 'core' },
    // Codex CLI runs on the OpenAI / ChatGPT Pro subscription.
    codex: { name: 'ChatGPT', plan: 'Pro', monthly: 200, enabled: false, tier: 'core' },
    openai: { name: 'OpenAI API', plan: 'Admin API', monthly: 50, enabled: false, tier: 'extended' },
    azureopenai: { name: 'Azure OpenAI', plan: 'Deployment', monthly: 20, enabled: false, tier: 'hidden' },
    cursor: { name: 'Cursor', plan: 'Pro', monthly: 20, enabled: false, tier: 'core' },
    copilot: { name: 'Copilot', plan: 'Pro', monthly: 10, enabled: false, tier: 'core' },
    windsurf: { name: 'Windsurf', plan: 'Pro', monthly: 15, enabled: false, tier: 'core' },
    kiro: { name: 'Kiro', plan: 'Free', monthly: 50, enabled: false, tier: 'core' },
    alibaba: { name: 'Alibaba', plan: 'Coding Plan', monthly: 20, enabled: false, tier: 'hidden' },
    alibabatokenplan: { name: 'Alibaba Token Plan', plan: 'Token Plan', monthly: 20, enabled: false, tier: 'hidden' },
    augment: { name: 'Augment', plan: 'Code', monthly: 30, enabled: false, tier: 'hidden' },
    warp: { name: 'Warp', plan: 'AI', monthly: 20, enabled: false, tier: 'hidden' },
    elevenlabs: { name: 'ElevenLabs', plan: 'Creator', monthly: 22, enabled: false, tier: 'hidden' },
    kilo: { name: 'Kilo', plan: 'Pass', monthly: 20, enabled: false, tier: 'hidden' },
    kimi: { name: 'Kimi', plan: 'Basic', monthly: 15, enabled: false, tier: 'core' },
    moonshot: { name: 'Moonshot / Kimi API', plan: 'API', monthly: 20, enabled: false, tier: 'extended' },
    kimik2: { name: 'Kimi K2', plan: 'Credits', monthly: 20, enabled: false, tier: 'extended' },
    doubao: { name: 'Doubao', plan: 'Ark API', monthly: 20, enabled: false, tier: 'hidden' },
    grok: { name: 'Grok', plan: 'Build', monthly: 99, enabled: false, tier: 'core' },
    groq: { name: 'Groq', plan: 'API', monthly: 20, enabled: false, tier: 'hidden' },
    gemini: { name: 'Gemini', plan: 'Pro', monthly: 20, enabled: false, tier: 'core' },
    openrouter: { name: 'OpenRouter', plan: 'API', monthly: 20, enabled: false, tier: 'extended' },
    mistral: { name: 'Mistral', plan: 'API', monthly: 20, enabled: false, tier: 'extended' },
    codebuff: { name: 'Codebuff', plan: 'Pro', monthly: 20, enabled: false, tier: 'hidden' },
    commandcode: { name: 'Command Code', plan: 'Pro', monthly: 30, enabled: false, tier: 'hidden' },
    crof: { name: 'Crof', plan: 'API', monthly: 20, enabled: false, tier: 'hidden' },
    venice: { name: 'Venice', plan: 'API', monthly: 20, enabled: false, tier: 'hidden' },
    deepseek: { name: 'DeepSeek', plan: 'API', monthly: 10, enabled: false, tier: 'extended' },
    deepgram: { name: 'Deepgram', plan: 'API', monthly: 20, enabled: false, tier: 'hidden' },
    stepfun: { name: 'StepFun', plan: 'Step Plan', monthly: 20, enabled: false, tier: 'hidden' },
    llmproxy: { name: 'LLM Proxy', plan: 'Quota Stats', monthly: 20, enabled: false, tier: 'hidden' },
    ollama: { name: 'Ollama', plan: 'Cloud', monthly: 20, enabled: false, tier: 'extended' },
    abacus: { name: 'Abacus AI', plan: 'Credits', monthly: 20, enabled: false, tier: 'hidden' },
    amp: { name: 'Amp', plan: 'Credits', monthly: 40, enabled: false, tier: 'core' },
    antigravity: { name: 'Antigravity', plan: 'Google AI', monthly: 20, enabled: false, tier: 'core' },
    manus: { name: 'Manus', plan: 'Pro', monthly: 20, enabled: false, tier: 'hidden' },
    vertexai: { name: 'Vertex AI', plan: 'Google Cloud', monthly: 20, enabled: false, tier: 'extended' },
    synthetic: { name: 'Synthetic', plan: 'API', monthly: 20, enabled: false, tier: 'hidden' },
    mimo: { name: 'Xiaomi MiMo', plan: 'Credits', monthly: 20, enabled: false, tier: 'hidden' },
    bedrock: { name: 'AWS Bedrock', plan: 'Cost Explorer', monthly: 20, enabled: false, tier: 'extended' },
    t3chat: { name: 'T3 Chat', plan: 'Pro', monthly: 20, enabled: false, tier: 'hidden' },
  },
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
      usageMeterMode: normalizeUsageMeterMode(raw.usageMeterMode),
      tokenHistoryDays: normalizeTokenHistoryDays(raw.tokenHistoryDays),
      saveModeSuggestions: raw.saveModeSuggestions === true,
      onboardingComplete: raw.onboardingComplete === true,
      missions: typeof raw.missions === 'boolean' ? raw.missions : null,
      missionHistory: normalizeMissionHistory(raw.missionHistory),
      flowCheckpoints: normalizeFlowCheckpoints(raw.flowCheckpoints),
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
      if (!providers[canonical] || seen.has(canonical)) continue
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
    providers[id] = normalizeProviderConfig(provider)
  }
  return providers
}

function saveConfig(config, file = FILE) {
  fs.mkdirSync(DIR, { recursive: true })
  const providers = normalizeProviders(config.providers)
  const normalized = {
    ...config,
    trayMetric: normalizeTrayMetric(config.trayMetric),
    usageMeterMode: normalizeUsageMeterMode(config.usageMeterMode),
    tokenHistoryDays: normalizeTokenHistoryDays(config.tokenHistoryDays),
    quotaWarningThresholds: normalizeQuotaWarningThresholds(config.quotaWarningThresholds),
    quotaWarningSessionThresholds: normalizeQuotaWarningThresholds(config.quotaWarningSessionThresholds || config.quotaWarningThresholds),
    quotaWarningWeeklyThresholds: normalizeQuotaWarningThresholds(config.quotaWarningWeeklyThresholds || config.quotaWarningThresholds),
    missionHistory: normalizeMissionHistory(config.missionHistory),
    flowCheckpoints: normalizeFlowCheckpoints(config.flowCheckpoints),
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

function normalizeProviderConfig(provider) {
  const next = { ...provider }
  if (next.alertsEnabled != null) next.alertsEnabled = next.alertsEnabled !== false
  if (next.alertReservePct != null) next.alertReservePct = clampNumber(next.alertReservePct, 1, 99, DEFAULT_CONFIG.maxxAlertReservePct)
  return next
}

module.exports = {
  loadConfig,
  saveConfig,
  billingCycle,
  FILE,
  _private: { normalizeProviders, normalizeTrayMetric, normalizeUsageMeterMode, normalizeTokenHistoryDays, normalizeQuotaWarningThresholds, normalizeProviderConfig, normalizeMissionHistory, normalizeFlowCheckpoints },
}
