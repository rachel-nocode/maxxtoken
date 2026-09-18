const fs = require('fs')
const os = require('os')
const path = require('path')
const { fetchWithTimeout } = require('./http')

const VERSION = 1
const TTL_MS = 60 * 60 * 1000
const DEFAULT_URL = 'https://robinebers.github.io/openusage/pricing_supplement.json'

const BUNDLED = {
  updated_at: '2026-09-11T18:04:26Z',
  pricing: {
    'gpt-5.6-sol': { input_per_million: 5, cache_write_per_million: 6.25, cache_read_per_million: 0.5, output_per_million: 30 },
    'gpt-6-astra': { input_per_million: 10, cache_write_per_million: 12.5, cache_read_per_million: 1, output_per_million: 50 },
    'gpt-5.6-terra': { input_per_million: 2, cache_write_per_million: 2.5, cache_read_per_million: 0.2, output_per_million: 12 },
    'gpt-5.6-luna': { input_per_million: 0.2, cache_write_per_million: 0.25, cache_read_per_million: 0.02, output_per_million: 1.2 },
  },
  fast_multipliers: {
    'gpt-5.6-sol': 2,
    'gpt-6-astra': 2,
    'gpt-5.6-terra': 2,
    'gpt-5.6-luna': 2,
  },
  alias_rules: [
    { pattern: '^gpt-5\\.6-sol(?:-(?:none|low|medium|high|xhigh|max|ultra))?$', canonical: 'gpt-5.6-sol' },
    { pattern: '^gpt-6-astra(?:-(?:none|low|medium|high|xhigh|max|ultra))?$', canonical: 'gpt-6-astra' },
    { pattern: '^gpt-5\\.6-terra(?:-(?:none|low|medium|high|xhigh|max))?$', canonical: 'gpt-5.6-terra' },
    { pattern: '^gpt-5\\.6-luna(?:-(?:none|low|medium|high|xhigh|max))?$', canonical: 'gpt-5.6-luna' },
    { pattern: '^(?:gpt-)?daybreak-blue-latest$', canonical: 'gpt-5.6-sol' },
  ],
  fallback_models: {
    codex: [
      'gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
      'gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4', 'gpt-5.4-pro', 'gpt-5.4-mini', 'gpt-5.4-nano',
      'gpt-5.3-codex', 'gpt-5.2', 'gpt-5.2-pro', 'gpt-5.2-codex', 'gpt-5.1',
      'gpt-5.1-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini', 'gpt-5', 'gpt-5-pro',
      'gpt-5-mini', 'gpt-5-nano', 'gpt-5-codex', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
      'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o4-mini', 'o3',
      'o3-pro', 'o3-mini', 'o1', 'o1-pro', 'o1-mini', 'codex-mini-latest',
    ],
  },
}

let state = { root: null, loadedAt: 0, supplement: null, fetchedAt: 0, url: null }

function cacheRoot() {
  if (process.env.MAXXTOKEN_PRICING_CACHE_ROOT) return process.env.MAXXTOKEN_PRICING_CACHE_ROOT
  const appData = process.platform === 'win32'
    ? process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    : path.join(os.homedir(), 'Library', 'Application Support')
  return path.join(appData, 'MaxxToken', 'model-pricing')
}

function cacheFile(root = cacheRoot()) {
  return path.join(root, `supplement-v${VERSION}.json`)
}

function finiteNonnegative(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function compileRule(rule) {
  if (!rule || typeof rule.pattern !== 'string' || typeof rule.canonical !== 'string') return null
  if (rule.pattern.length > 512 || rule.canonical.length > 160) return null
  if (/\\[1-9]|\(\?[=!<]|\((?:\?:)?[^)]*[+*][^)]*\)[+*{]/.test(rule.pattern)) return null
  let source = rule.pattern
  let flags = ''
  if (source.startsWith('(?i)')) {
    source = source.slice(4)
    flags = 'i'
  }
  try {
    return { pattern: rule.pattern, canonical: rule.canonical, regex: new RegExp(source, flags) }
  } catch {
    return null
  }
}

function normalize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const pricing = {}
  for (const [model, row] of Object.entries(raw.pricing || {})) {
    if (!model || !row || typeof row !== 'object') continue
    const input = finiteNonnegative(row.input_per_million)
    const output = finiteNonnegative(row.output_per_million)
    if (input == null || output == null) continue
    pricing[model] = {
      input: input / 1e6,
      output: output / 1e6,
      cacheCreation: (finiteNonnegative(row.cache_write_per_million) ?? input) / 1e6,
      cacheRead: (finiteNonnegative(row.cache_read_per_million) ?? input * 0.1) / 1e6,
    }
  }
  const fastMultipliers = {}
  for (const [model, value] of Object.entries(raw.fast_multipliers || {})) {
    const multiplier = Number(value)
    if (model && Number.isFinite(multiplier) && multiplier > 0 && multiplier <= 10) fastMultipliers[model] = multiplier
  }
  const aliasRules = Array.isArray(raw.alias_rules) ? raw.alias_rules.map(compileRule).filter(Boolean) : []
  const fallbackModels = {}
  for (const [provider, models] of Object.entries(raw.fallback_models || {})) {
    if (!Array.isArray(models)) continue
    fallbackModels[provider] = [...new Set(models.filter((model) => typeof model === 'string' && model.length <= 160))].slice(0, 200)
  }
  if (!Object.keys(pricing).length && !aliasRules.length && !Object.keys(fallbackModels).length) return null
  return {
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : null,
    pricing,
    fastMultipliers,
    aliasRules,
    fallbackModels,
  }
}

function merge(base, preferred) {
  return {
    updatedAt: preferred.updatedAt || base.updatedAt,
    pricing: { ...base.pricing, ...preferred.pricing },
    fastMultipliers: { ...base.fastMultipliers, ...preferred.fastMultipliers },
    aliasRules: preferred.aliasRules.length ? preferred.aliasRules : base.aliasRules,
    fallbackModels: { ...base.fallbackModels, ...preferred.fallbackModels },
  }
}

function load(root = cacheRoot()) {
  if (state.root === root && state.supplement && Date.now() - state.loadedAt < 30000) return state
  const bundled = normalize(BUNDLED)
  let cached = null
  let fetchedAt = 0
  let url = null
  try {
    const artifact = JSON.parse(fs.readFileSync(cacheFile(root), 'utf8'))
    if (artifact.version === VERSION) {
      cached = normalize(artifact.supplement)
      fetchedAt = Date.parse(artifact.fetchedAt) || 0
      url = artifact.url || null
    }
  } catch { /* no valid cache */ }
  state = { root, loadedAt: Date.now(), supplement: cached ? merge(bundled, cached) : bundled, fetchedAt, url }
  return state
}

function rawForSave(raw) {
  const normalized = normalize(raw)
  return normalized ? raw : null
}

function save(raw, options = {}) {
  if (!rawForSave(raw)) return null
  const root = options.root || cacheRoot()
  const artifact = {
    version: VERSION,
    fetchedAt: new Date(options.now || Date.now()).toISOString(),
    url: options.url || DEFAULT_URL,
    supplement: raw,
  }
  fs.mkdirSync(path.dirname(cacheFile(root)), { recursive: true, mode: 0o700 })
  const temporary = `${cacheFile(root)}.${process.pid}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(artifact), { mode: 0o600 })
  fs.renameSync(temporary, cacheFile(root))
  state = { root: null, loadedAt: 0, supplement: null, fetchedAt: 0, url: null }
  return load(root).supplement
}

function safeURL(raw) {
  const url = new URL(raw || DEFAULT_URL)
  if (url.protocol !== 'https:') throw new Error('Pricing supplement URL must use HTTPS.')
  return url.toString()
}

async function refreshIfNeeded(options = {}) {
  const root = options.root || cacheRoot()
  const current = load(root)
  const now = options.now || Date.now()
  try {
    const url = safeURL(options.url || DEFAULT_URL)
    if (!options.force && current.url === url && current.fetchedAt && now - current.fetchedAt < TTL_MS) return current.supplement
    const response = await (options.fetcher || fetchWithTimeout)(url, { headers: { Accept: 'application/json' } }, options.timeoutMs || 5000)
    if (!response.ok) return current.supplement
    const raw = await response.json()
    return save(raw, { root, now, url }) || current.supplement
  } catch {
    return current.supplement
  }
}

function current(root = cacheRoot()) {
  return load(root).supplement
}

function resolveAlias(model, supplement = current()) {
  const actual = String(model || '').trim()
  if (actual.length > 160) return actual
  for (const rule of supplement.aliasRules) if (rule.regex.test(actual)) return rule.canonical
  return actual
}

function lookup(model, supplement = current()) {
  const canonical = resolveAlias(model, supplement)
  const fast = canonical.endsWith('-fast')
  const base = fast ? canonical.slice(0, -5) : canonical
  const price = supplement.pricing[canonical] || supplement.pricing[base]
  if (!price) return null
  const multiplier = fast ? supplement.fastMultipliers[base] : 1
  return {
    ...price,
    ...(multiplier ? {
      input: price.input * multiplier,
      output: price.output * multiplier,
      cacheCreation: price.cacheCreation * multiplier,
      cacheRead: price.cacheRead * multiplier,
    } : {}),
    modelId: canonical,
    source: 'OpenUsage pricing supplement',
    fastMultiplierApplied: Boolean(fast && multiplier && multiplier !== 1),
  }
}

function fallbackModels(providerId, supplement = current()) {
  return [...(supplement.fallbackModels[String(providerId || '')] || [])]
}

function resetForTesting() {
  state = { root: null, loadedAt: 0, supplement: null, fetchedAt: 0, url: null }
}

module.exports = {
  DEFAULT_URL,
  current,
  fallbackModels,
  lookup,
  refreshIfNeeded,
  resolveAlias,
  _private: { BUNDLED, cacheFile, cacheRoot, compileRule, merge, normalize, resetForTesting, safeURL, save },
}
