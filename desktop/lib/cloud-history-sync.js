const fsp = require('fs/promises')
const fs = require('fs')
const os = require('os')
const path = require('path')

const SCHEMA = 'maxxtoken.history.v1'
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_DAYS = 120
const DEFAULT_WRITE_INTERVAL_MS = 5 * 60 * 1000
const MAX_MODELS_PER_DAY = 500
const MAX_PROVENANCE_VALUES = 20
const MACHINE_LOCAL_FAMILIES = new Set(['claude', 'codex', 'grok', 'opencode'])
const SAFE_PRICING_SOURCES = new Set(['built-in', 'models.dev', 'xai pricing', 'grok completed turns', 'provider reported', 'api reported'])
const LOCAL_TOKEN_USAGE = Symbol('maxxtokenLocalTokenUsage')

function defaultICloudRoot(home = os.homedir()) {
  return path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'MaxxToken', 'History', 'v1')
}

function createICloudFileStore(options = {}) {
  const rootDir = path.resolve(options.rootDir || defaultICloudRoot(options.home))
  const io = options.fs || fsp
  const containerRoot = path.resolve(options.containerRoot || path.join(rootDir, '..', '..', '..'))

  async function isAvailable() {
    try {
      const stat = await io.stat(containerRoot)
      return stat.isDirectory()
    } catch { return false }
  }

  async function loadDocuments() {
    if (!(await isAvailable())) throw syncError('icloud-unavailable', 'iCloud Drive is unavailable for MaxxToken.')
    let names = []
    try { names = await io.readdir(rootDir) } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    const documents = []
    const invalidFiles = []
    for (const name of names.filter((item) => item.endsWith('.json'))) {
      const file = path.join(rootDir, name)
      try {
        const stat = await io.stat(file)
        if (stat.size > MAX_FILE_BYTES) throw new Error('file is too large')
        documents.push(validateDocument(JSON.parse(await io.readFile(file, 'utf8'))))
      } catch (error) {
        invalidFiles.push({ file: name, error: safeError(error) })
      }
    }
    return { documents: newestByDevice(documents), invalidFiles }
  }

  async function writeDocument(document) {
    if (!(await isAvailable())) throw syncError('icloud-unavailable', 'iCloud Drive is unavailable for MaxxToken.')
    const clean = validateDocument(document)
    await io.mkdir(rootDir, { recursive: true })
    const file = path.join(rootDir, `${safeDeviceId(clean.device.id)}.json`)
    const temp = `${file}.${process.pid}.tmp`
    await io.writeFile(temp, JSON.stringify(clean, null, 2), { mode: 0o600 })
    await io.rename(temp, file)
    return clean
  }

  async function deleteDevice(deviceId) {
    const file = path.join(rootDir, `${safeDeviceId(deviceId)}.json`)
    try { await io.unlink(file) } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }

  return { rootDir, containerRoot, isAvailable, loadDocuments, writeDocument, deleteDevice }
}

function buildHistoryDocument(providers, options = {}) {
  const deviceId = safeDeviceId(options.deviceId)
  const deviceName = cleanText(options.deviceName, 120)
  if (!deviceName) throw syncError('invalid-device', 'This Mac needs a device name before history can sync.')
  const accounts = []
  for (const provider of providers || []) {
    const family = providerFamily(provider)
    if (!provider?.connected || !MACHINE_LOCAL_FAMILIES.has(family) || family === 'cursor') continue
    const accountId = syncAccountId(provider, options.accountOwnership)
    if (!accountId) continue
    const tokenUsage = provider[LOCAL_TOKEN_USAGE] || provider.tokenUsage
    const days = normalizeDays(tokenUsage?.dailyBreakdown || tokenUsage?.dailyUsage || [], options.now)
    if (!days.length) continue
    accounts.push({ providerFamily: family, accountId, days })
  }
  return validateDocument({
    schema: SCHEMA,
    device: { id: deviceId, name: deviceName },
    updatedAt: Number(options.now || Date.now()),
    accounts,
  })
}

function applyPeerHistory(providers, documents, options = {}) {
  const peers = newestByDevice(documents || []).filter((document) => document.device.id !== options.deviceId)
  return (providers || []).map((provider) => {
    const family = providerFamily(provider)
    if (!provider?.connected || !MACHINE_LOCAL_FAMILIES.has(family) || family === 'cursor') return provider
    const accountId = syncAccountId(provider, options.accountOwnership)
    if (!accountId) return provider
    const inputs = [normalizeDays(provider.tokenUsage?.dailyBreakdown || provider.tokenUsage?.dailyUsage || [], options.now)]
    for (const document of peers) {
      const account = document.accounts.find((item) => item.providerFamily === family && item.accountId === accountId)
      if (account) inputs.push(account.days)
    }
    if (inputs.length === 1 || !inputs.some((days, index) => index > 0 && days.length)) return provider
    const dailyBreakdown = mergeDays(inputs.flat(), options.now)
    const result = { ...provider, tokenUsage: tokenUsageFromDays(provider.tokenUsage, dailyBreakdown) }
    Object.defineProperty(result, LOCAL_TOKEN_USAGE, { value: provider.tokenUsage, enumerable: false })
    return result
  })
}

function createHistorySync(options = {}) {
  const platform = options.platform || process.platform
  const fileStore = options.fileStore || createICloudFileStore(options)
  const getProviders = options.getProviders || (() => [])
  const getAccountOwnership = options.getAccountOwnership || (() => ({}))
  const onChange = typeof options.onChange === 'function' ? options.onChange : () => {}
  const deviceId = options.deviceId
  const deviceName = options.deviceName || os.hostname()
  let enabled = false
  let syncing = false
  let documents = []
  let invalidFiles = []
  let lastAttemptAt = null
  let lastSuccessAt = null
  let error = null
  let syncPromise = null
  let watcher = null
  let reloadTimer = null
  let lastUploadAt = 0
  let lastUploadSignature = null

  async function setEnabled(value) {
    const next = value === true
    if (next === enabled) return getStatus()
    enabled = next
    if (!enabled) {
      stopWatcher()
      lastUploadAt = 0
      lastUploadSignature = null
      documents = []
      invalidFiles = []
      try {
        if (platform === 'darwin' && deviceId) await fileStore.deleteDevice(deviceId)
        error = null
      } catch (cause) { error = safeError(cause) }
      emit()
      return getStatus()
    }
    await syncNow()
    return getStatus()
  }

  async function syncNow() {
    if (syncPromise) return syncPromise
    syncPromise = performSync()
    try { return await syncPromise } finally { syncPromise = null }
  }

  async function performSync() {
    if (!enabled) return getStatus()
    if (platform !== 'darwin') {
      error = 'Cross-Mac history sync is available only on macOS.'
      emit()
      return getStatus()
    }
    if (!deviceId) {
      error = 'This Mac has no stable sync device identity.'
      emit()
      return getStatus()
    }
    syncing = true
    lastAttemptAt = Date.now()
    emit()
    try {
      const document = buildHistoryDocument(await getProviders(), {
        deviceId,
        deviceName,
        accountOwnership: await getAccountOwnership(),
        now: lastAttemptAt,
      })
      const signature = JSON.stringify(document.accounts)
      const writeIntervalMs = Number(options.writeIntervalMs) > 0
        ? Number(options.writeIntervalMs)
        : DEFAULT_WRITE_INTERVAL_MS
      if (signature !== lastUploadSignature || lastAttemptAt - lastUploadAt >= writeIntervalMs) {
        await fileStore.writeDocument(document)
        lastUploadSignature = signature
        lastUploadAt = lastAttemptAt
      }
      if (!enabled) {
        await fileStore.deleteDevice(deviceId)
        return getStatus()
      }
      const loaded = await fileStore.loadDocuments()
      if (!enabled) return getStatus()
      documents = loaded.documents
      invalidFiles = loaded.invalidFiles
      lastSuccessAt = Date.now()
      error = invalidFiles.length ? 'Some synced history files could not be read.' : null
      startWatcher()
    } catch (cause) { error = safeError(cause) }
    finally {
      syncing = false
      emit()
    }
    return getStatus()
  }

  async function reload() {
    if (!enabled || platform !== 'darwin') return getStatus()
    syncing = true
    lastAttemptAt = Date.now()
    emit()
    try {
      const loaded = await fileStore.loadDocuments()
      if (!enabled) return getStatus()
      documents = loaded.documents
      invalidFiles = loaded.invalidFiles
      lastSuccessAt = Date.now()
      error = invalidFiles.length ? 'Some synced history files could not be read.' : null
    } catch (cause) { error = safeError(cause) }
    finally {
      syncing = false
      emit()
    }
    return getStatus()
  }

  function mergeHistory(providers = getProviders()) {
    if (!enabled) return providers
    return applyPeerHistory(providers, documents, {
      deviceId,
      accountOwnership: getAccountOwnership(),
    })
  }

  function getStatus() {
    return {
      enabled,
      supported: platform === 'darwin',
      supportLevel: platform === 'darwin' ? 'full' : 'unsupported',
      syncing,
      lastAttemptAt,
      lastSuccessAt,
      error,
      devices: documents.map((document) => ({
        deviceId: document.device.id,
        deviceName: document.device.name,
        updatedAt: document.updatedAt,
        isThisDevice: document.device.id === deviceId,
      })).sort((a, b) => Number(b.isThisDevice) - Number(a.isThisDevice) || b.updatedAt - a.updatedAt),
      invalidFiles: invalidFiles.map((item) => ({ ...item })),
    }
  }

  function emit() { onChange(getStatus()) }

  function startWatcher() {
    if (watcher || options.watch === false || !fileStore.rootDir) return
    try {
      const watch = typeof options.watch === 'function' ? options.watch : fs.watch
      watcher = watch(fileStore.rootDir, () => {
        if (!enabled) return
        if (reloadTimer) clearTimeout(reloadTimer)
        reloadTimer = setTimeout(() => { reloadTimer = null; void reload() }, 250)
        reloadTimer.unref?.()
      })
      watcher.unref?.()
    } catch (cause) {
      error = `iCloud change monitoring unavailable: ${safeError(cause)}`
    }
  }

  function stopWatcher() {
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = null
    watcher?.close?.()
    watcher = null
  }

  return { setEnabled, syncNow, reload, mergeHistory, getStatus }
}

function validateDocument(value) {
  if (!value || value.schema !== SCHEMA) throw syncError('invalid-schema', 'Unsupported synced history format.')
  const id = safeDeviceId(value.device?.id)
  const name = cleanText(value.device?.name, 120)
  const updatedAt = Number(value.updatedAt)
  if (!name || !Number.isFinite(updatedAt) || updatedAt <= 0) throw syncError('invalid-document', 'Invalid synced history metadata.')
  if (!Array.isArray(value.accounts) || value.accounts.length > 100) throw syncError('invalid-document', 'Invalid synced account history.')
  const seen = new Set()
  const accounts = value.accounts.map((account) => {
    const providerFamily = String(account?.providerFamily || '').toLowerCase()
    const accountId = safeAccountId(account?.accountId, providerFamily)
    if (!MACHINE_LOCAL_FAMILIES.has(providerFamily)) throw syncError('invalid-provider', 'Synced history contains an unsupported provider.')
    const key = `${providerFamily}:${accountId}`
    if (seen.has(key)) throw syncError('duplicate-account', 'Synced history contains the same account twice.')
    if (!Array.isArray(account.days) || account.days.length > MAX_DAYS) {
      throw syncError('invalid-document', 'Synced account history contains too many days.')
    }
    for (const day of account.days) {
      const models = day?.models || day?.modelBreakdowns
      if (models != null && (!Array.isArray(models) || models.length > MAX_MODELS_PER_DAY)) {
        throw syncError('invalid-document', 'Synced account history contains too many model rows.')
      }
    }
    seen.add(key)
    return { providerFamily, accountId, days: normalizeDays(account.days) }
  })
  return { schema: SCHEMA, device: { id, name }, updatedAt, accounts }
}

function normalizeDays(rows, now = Date.now()) {
  const byDate = new Map()
  const cutoff = dayKey(now - MAX_DAYS * 86400000)
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = String(row?.date || row?.dayKey || '')
    if (!validDay(date) || date < cutoff) continue
    const clean = normalizeTokenRow(row, date)
    if (!clean) continue
    byDate.set(date, clean)
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_DAYS)
}

function normalizeTokenRow(row, date) {
  const input = tokenNumber(row?.input)
  const cached = tokenNumber(row?.cached ?? row?.cacheRead)
  const output = tokenNumber(row?.output)
  const totalValue = tokenNumber(row?.total)
  const total = totalValue || input + cached + output
  if (total <= 0) return null
  const result = { date, input, cached, output, total }
  const costUSD = costNumber(row?.costUSD)
  const models = normalizeModels(row?.modelBreakdowns || row?.models)
  if (models.length) result.models = models
  const modelPricedTokens = models.reduce((sum, model) => sum + (model.costUSD != null ? model.total : 0), 0)
  const explicitPricedTokens = optionalTokenNumber(row?.pricedTokens ?? row?.pricedTokenCount)
  const pricedTokens = Math.min(total, explicitPricedTokens ?? (models.length ? modelPricedTokens : costUSD != null ? total : 0))
  const pricedCostUSD = costNumber(row?.pricedCostUSD ?? row?.pricedUSD) ?? costUSD
  const unpricedModels = cleanStringList([
    ...(Array.isArray(row?.unpricedModels) ? row.unpricedModels : []),
    ...models.filter((model) => model.costUSD == null).map((model) => model.model),
  ], MAX_MODELS_PER_DAY)
  if (costUSD != null) result.costUSD = costUSD
  if (pricedCostUSD != null) result.pricedCostUSD = pricedCostUSD
  result.pricedTokens = pricedTokens
  result.unpricedTokens = Math.max(0, total - pricedTokens)
  result.costCoverage = costUSD == null
    ? 'none'
    : result.unpricedTokens > 0 || unpricedModels.length ? 'partial' : 'full'
  const accuracy = cleanAccuracy(row?.costAccuracy)
  if (accuracy) result.costAccuracy = accuracy
  const pricingSources = cleanPricingSources([
    ...(Array.isArray(row?.pricingSources) ? row.pricingSources : []),
    row?.pricingSource,
  ], MAX_PROVENANCE_VALUES)
  if (pricingSources.length) {
    result.pricingSources = pricingSources
    result.pricingSource = pricingSources.length === 1 ? pricingSources[0] : 'mixed'
  }
  if (unpricedModels.length) result.unpricedModels = unpricedModels
  return result
}

function normalizeModels(rows) {
  const models = new Map()
  for (const row of (Array.isArray(rows) ? rows : []).slice(0, MAX_MODELS_PER_DAY)) {
    const model = cleanText(row?.model || row?.modelName, 200)
    if (!model) continue
    const input = tokenNumber(row?.input)
    const cached = tokenNumber(row?.cached ?? row?.cacheRead)
    const output = tokenNumber(row?.output)
    const total = tokenNumber(row?.total) || input + cached + output
    if (total <= 0) continue
    const normalized = { input, cached, output, total }
    const costUSD = costNumber(row?.costUSD)
    if (costUSD != null) normalized.costUSD = costUSD
    const accuracy = cleanAccuracy(row?.costAccuracy)
    if (accuracy) normalized.costAccuracy = accuracy
    const pricingSources = cleanPricingSources([
      ...(Array.isArray(row?.pricingSources) ? row.pricingSources : []),
      row?.pricingSource,
    ], MAX_PROVENANCE_VALUES)
    if (pricingSources.length) {
      normalized.pricingSources = pricingSources
      normalized.pricingSource = pricingSources.length === 1 ? pricingSources[0] : 'mixed'
    }
    const current = models.get(model.toLowerCase())
    models.set(model.toLowerCase(), current ? { model: current.model, ...mergeTokenRows(current, normalized) } : { model, ...normalized })
  }
  return [...models.values()].sort((a, b) => b.total - a.total || a.model.localeCompare(b.model))
}

function mergeDays(rows, now = Date.now()) {
  const byDate = new Map()
  const cutoff = dayKey(now - MAX_DAYS * 86400000)
  for (const raw of Array.isArray(rows) ? rows : []) {
    const date = String(raw?.date || raw?.dayKey || '')
    if (!validDay(date) || date < cutoff) continue
    const row = normalizeTokenRow(raw, date)
    if (!row) continue
    const current = byDate.get(date)
    byDate.set(date, current ? mergeTokenRows(current, row) : row)
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
}

function mergeTokenRows(left, right) {
  const merged = {
    ...(left.date ? { date: left.date } : {}),
    input: left.input + right.input,
    cached: left.cached + right.cached,
    output: left.output + right.output,
    total: left.total + right.total,
  }
  if (left.costUSD != null || right.costUSD != null) merged.costUSD = (left.costUSD || 0) + (right.costUSD || 0)
  if (left.pricedCostUSD != null || right.pricedCostUSD != null) {
    merged.pricedCostUSD = (left.pricedCostUSD || 0) + (right.pricedCostUSD || 0)
  }
  merged.pricedTokens = tokenNumber(left.pricedTokens) + tokenNumber(right.pricedTokens)
  merged.unpricedTokens = Math.max(0, merged.total - merged.pricedTokens)
  merged.costCoverage = merged.costUSD == null
    ? 'none'
    : merged.unpricedTokens > 0 ? 'partial' : 'full'
  const accuracies = [...new Set([left.costAccuracy, right.costAccuracy].filter(Boolean))]
  if (accuracies.length) merged.costAccuracy = accuracies.length === 1 ? accuracies[0] : 'mixed'
  const pricingSources = cleanPricingSources([
    ...(left.pricingSources || []), left.pricingSource,
    ...(right.pricingSources || []), right.pricingSource,
  ], MAX_PROVENANCE_VALUES).filter((source) => source !== 'mixed')
  if (pricingSources.length) {
    merged.pricingSources = pricingSources
    merged.pricingSource = pricingSources.length === 1 ? pricingSources[0] : 'mixed'
  }
  const unpricedModels = cleanStringList([
    ...(left.unpricedModels || []), ...(right.unpricedModels || []),
  ], MAX_MODELS_PER_DAY)
  if (unpricedModels.length) {
    merged.unpricedModels = unpricedModels
    if (merged.costUSD != null) merged.costCoverage = 'partial'
  }
  const models = normalizeModels([...(left.models || []), ...(right.models || [])])
  if (models.length) merged.models = models
  return merged
}

function tokenUsageFromDays(original, days) {
  const totals = days.reduce((sum, day) => mergeTokenRows(sum, day), { input: 0, cached: 0, output: 0, total: 0 })
  const models = normalizeModels(days.flatMap((day) => day.models || []))
  return {
    ...(original || {}),
    input: totals.input,
    cached: totals.cached,
    output: totals.output,
    total: totals.total,
    costUSD: totals.costUSD ?? null,
    pricedCostUSD: totals.pricedCostUSD ?? null,
    pricedTokens: totals.pricedTokens,
    unpricedTokens: totals.unpricedTokens,
    costCoverage: totals.costCoverage,
    costAccuracy: totals.costAccuracy || null,
    pricingSources: totals.pricingSources || [],
    pricingSource: totals.pricingSource || null,
    unpricedModels: totals.unpricedModels || [],
    historyDays: days.length,
    dailyBreakdown: days.map((day) => {
      const { models: dayModels, ...rest } = day
      return { ...rest, modelBreakdowns: dayModels || [] }
    }),
    modelBreakdowns: models,
    modelNames: models.map((model) => model.model),
    source: 'local logs and synced Macs',
  }
}

function newestByDevice(documents) {
  const newest = new Map()
  for (const raw of documents || []) {
    const document = validateDocument(raw)
    const current = newest.get(document.device.id)
    if (!current || document.updatedAt > current.updatedAt) newest.set(document.device.id, document)
  }
  return [...newest.values()]
}

function providerFamily(provider) {
  return String(provider?.providerFamily || provider?.id || '').split('@')[0].toLowerCase()
}

function syncAccountId(provider, ownership = {}) {
  const family = providerFamily(provider)
  if (!MACHINE_LOCAL_FAMILIES.has(family) || family === 'cursor') return null
  const candidate = ownership?.[provider.id] || provider?.accountId || provider?.id
  try {
    if (!String(candidate).startsWith(`${family}@`)) return null
    return safeAccountId(candidate, family)
  } catch { return null }
}

function safeDeviceId(value) {
  const id = String(value || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]{7,127}$/.test(id)) throw syncError('invalid-device', 'Invalid sync device identity.')
  return id
}

function safeAccountId(value, family) {
  const id = String(value || '').trim().toLowerCase()
  if (!new RegExp(`^${family}@[a-f0-9]{12}$`).test(id)) {
    throw syncError('invalid-account', 'Invalid synced account ownership.')
  }
  return id
}

function cleanText(value, max) {
  const text = String(value || '').trim()
  if (!text || text.length > max || /[\u0000-\u001f]/.test(text)) return null
  return text
}

function tokenNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return 0
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(number))
}

function optionalTokenNumber(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return null
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(number))
}

function costNumber(value) {
  if (value == null) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function cleanAccuracy(value) {
  const accuracy = String(value || '').toLowerCase()
  return ['exact', 'live', 'estimate', 'hypothetical', 'mixed'].includes(accuracy) ? accuracy : null
}

function cleanStringList(values, max) {
  const result = []
  const seen = new Set()
  for (const value of values || []) {
    const text = cleanText(value, 200)
    if (!text || seen.has(text.toLowerCase())) continue
    seen.add(text.toLowerCase())
    result.push(text)
    if (result.length >= max) break
  }
  return result
}

function cleanPricingSources(values) {
  return cleanStringList(values, MAX_PROVENANCE_VALUES)
    .filter((value) => SAFE_PRICING_SOURCES.has(value.toLowerCase()))
}

function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && dayKey(date.getTime()) === value
}

function dayKey(value) { return new Date(value).toISOString().slice(0, 10) }
function safeError(error) { return String(error?.message || error || 'Unknown sync error').slice(0, 300) }
function syncError(code, message) { const error = new Error(message); error.code = code; return error }

module.exports = {
  SCHEMA,
  defaultICloudRoot,
  createICloudFileStore,
  createHistorySync,
  buildHistoryDocument,
  applyPeerHistory,
  validateDocument,
  _private: { normalizeDays, mergeDays, tokenUsageFromDays, newestByDevice, syncAccountId, providerFamily },
}
