const fs = require('fs')
const os = require('os')
const path = require('path')
const { fetchWithTimeout } = require('./http')

const VERSION = 1
const TTL_MS = 24 * 60 * 60 * 1000
const URL = 'https://models.dev/api.json'

let memory = { root: null, loadedAt: 0, artifact: null }

function cacheRoot() {
  if (process.env.MAXXTOKEN_MODELS_DEV_CACHE_ROOT) return process.env.MAXXTOKEN_MODELS_DEV_CACHE_ROOT
  return path.join(os.homedir(), 'Library', 'Application Support', 'MaxxToken')
}

function cacheFile(root = cacheRoot()) {
  return path.join(root, 'model-pricing', `models-dev-v${VERSION}.json`)
}

function normalizeProviderId(raw) {
  return String(raw || '').trim().toLowerCase()
}

function normalizeModelId(raw) {
  return String(raw || '').trim()
}

function modelCandidates(raw) {
  const candidates = []
  function add(value) {
    const normalized = normalizeModelId(value)
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized)
  }

  const trimmed = normalizeModelId(raw)
  add(trimmed)
  if (trimmed.startsWith('openai/')) add(trimmed.slice('openai/'.length))
  if (trimmed.startsWith('anthropic.')) add(trimmed.slice('anthropic.'.length))
  if (trimmed.includes('claude-')) {
    const tail = trimmed.slice(trimmed.lastIndexOf('claude-'))
    add(tail)
  }

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]
    const at = candidate.indexOf('@')
    if (at > 0) {
      const base = candidate.slice(0, at)
      add(base)
      const suffix = candidate.slice(at + 1)
      if (/^\d{8}$/.test(suffix)) add(`${base}-${suffix}`)
    } else if (candidate.startsWith('claude-')) {
      add(`${candidate}@default`)
    }
    add(candidate.replace(/-\d{4}-\d{2}-\d{2}$/, ''))
    add(candidate.replace(/-\d{8}$/, ''))
    add(candidate.replace(/-v\d+:\d+$/i, ''))
  }
  return candidates
}

function providersFromCatalog(raw) {
  const source = raw?.providers && typeof raw.providers === 'object' ? raw.providers : raw
  if (!source || typeof source !== 'object') return null
  const providers = {}
  for (const [key, provider] of Object.entries(source)) {
    if (!provider || typeof provider !== 'object' || !provider.models) continue
    const id = normalizeProviderId(provider.id || key)
    providers[id] = { ...provider, mapKey: key }
  }
  return Object.keys(providers).length ? providers : null
}

function normalizeCatalog(raw) {
  const providers = providersFromCatalog(raw)
  return providers ? { providers } : null
}

function load(root = cacheRoot()) {
  if (memory.root === root && memory.artifact && Date.now() - memory.loadedAt < 30000) return memory.artifact
  try {
    const artifact = JSON.parse(fs.readFileSync(cacheFile(root), 'utf8'))
    if (artifact?.version !== VERSION || !normalizeCatalog(artifact.catalog)) return null
    memory = { root, loadedAt: Date.now(), artifact }
    return artifact
  } catch {
    return null
  }
}

function save(catalog, fetchedAt = Date.now(), root = cacheRoot()) {
  const normalized = normalizeCatalog(catalog)
  if (!normalized) return null
  const artifact = {
    version: VERSION,
    fetchedAt: new Date(fetchedAt).toISOString(),
    catalog: normalized,
  }
  fs.mkdirSync(path.dirname(cacheFile(root)), { recursive: true })
  fs.writeFileSync(cacheFile(root), JSON.stringify(artifact, null, 2))
  memory = { root, loadedAt: Date.now(), artifact }
  return artifact
}

function priceFromModel(providerId, provider, model) {
  const input = Number(model?.cost?.input)
  const output = Number(model?.cost?.output)
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null
  const unit = 1000000
  const over200k = model.cost?.context_over_200k || model.cost?.contextOver200K || null
  return {
    providerId: normalizeProviderId(providerId),
    providerName: provider.name || null,
    modelId: model.id || null,
    modelName: model.name || null,
    input: input / unit,
    output: output / unit,
    cacheRead: Number.isFinite(Number(model.cost.cache_read)) ? Number(model.cost.cache_read) / unit : null,
    cacheCreation: Number.isFinite(Number(model.cost.cache_write)) ? Number(model.cost.cache_write) / unit : null,
    contextWindow: Number.isFinite(Number(model.limit?.context)) ? Number(model.limit.context) : null,
    threshold: over200k ? 200000 : null,
    above: over200k
      ? {
          input: Number.isFinite(Number(over200k.input)) ? Number(over200k.input) / unit : null,
          output: Number.isFinite(Number(over200k.output)) ? Number(over200k.output) / unit : null,
          cacheRead: Number.isFinite(Number(over200k.cache_read)) ? Number(over200k.cache_read) / unit : null,
          cacheCreation: Number.isFinite(Number(over200k.cache_write)) ? Number(over200k.cache_write) / unit : null,
        }
      : null,
    source: 'models.dev',
  }
}

function lookup(providerId, modelId, root = cacheRoot()) {
  const artifact = load(root)
  const provider = artifact?.catalog?.providers?.[normalizeProviderId(providerId)]
  if (!provider?.models) return null
  const candidates = modelCandidates(modelId)
  for (const candidate of candidates) {
    const direct = provider.models[candidate]
    const pricing = direct ? priceFromModel(providerId, provider, direct) : null
    if (pricing) return { ...pricing, normalizedModelId: candidate }
  }
  for (const candidate of candidates) {
    const match = Object.values(provider.models).find((model) => normalizeModelId(model.id) === candidate)
    const pricing = match ? priceFromModel(providerId, provider, match) : null
    if (pricing) return { ...pricing, normalizedModelId: candidate }
  }
  return null
}

function stale(artifact, now = Date.now()) {
  const fetchedAt = Date.parse(artifact?.fetchedAt)
  return !Number.isFinite(fetchedAt) || now - fetchedAt > TTL_MS
}

function containsCachedPriceableModels(nextCatalog, oldCatalog) {
  const next = normalizeCatalog(nextCatalog)
  const old = normalizeCatalog(oldCatalog)
  if (!next || !old) return false
  for (const [providerId, oldProvider] of Object.entries(old.providers)) {
    const nextProvider = next.providers[providerId]
    if (!nextProvider?.models) return false
    for (const oldModel of Object.values(oldProvider.models || {})) {
      if (!oldModel?.cost?.input || !oldModel?.cost?.output) continue
      if (!lookupInCatalog(next, providerId, oldModel.id)) return false
    }
  }
  return true
}

function lookupInCatalog(catalog, providerId, modelId) {
  const provider = normalizeCatalog(catalog)?.providers?.[normalizeProviderId(providerId)]
  if (!provider?.models) return null
  for (const candidate of modelCandidates(modelId)) {
    const model = provider.models[candidate] || Object.values(provider.models).find((item) => item.id === candidate)
    if (priceFromModel(providerId, provider, model)) return model
  }
  return null
}

async function refreshIfNeeded(options = {}) {
  const root = options.root || cacheRoot()
  const now = options.now || Date.now()
  const current = load(root)
  if (current && !stale(current, now)) return current
  try {
    const resp = await fetchWithTimeout(options.url || URL, { headers: { Accept: 'application/json' } }, options.timeoutMs || 20000)
    if (!resp.ok) return current
    const catalog = await resp.json()
    if (current?.catalog && !containsCachedPriceableModels(catalog, current.catalog)) return current
    return save(catalog, now, root)
  } catch {
    return current
  }
}

function resetForTesting() {
  memory = { root: null, loadedAt: 0, artifact: null }
}

module.exports = {
  refreshIfNeeded,
  lookup,
  save,
  load,
  _private: {
    cacheFile,
    cacheRoot,
    containsCachedPriceableModels,
    modelCandidates,
    normalizeCatalog,
    resetForTesting,
    stale,
  },
}
