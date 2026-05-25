const fs = require('fs')
const os = require('os')
const path = require('path')
const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const DEFAULT_HISTORY_DAYS = 30
const GROK_WEB_BILLING_URL = 'https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig'
const USER_AGENT = 'MaxxToken'

function grokHome(options = {}) {
  return options.grokHome || options.env?.GROK_HOME || process.env.GROK_HOME || path.join(os.homedir(), '.grok')
}

function numberValue(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function parseCookiePairs(raw) {
  let text = clean(raw)
  if (!text) return []
  if (text.toLowerCase().startsWith('cookie:')) text = text.slice(7).trim()
  const out = []
  for (const chunk of text.split(';')) {
    const index = chunk.indexOf('=')
    if (index <= 0) continue
    const name = chunk.slice(0, index).trim()
    const value = chunk.slice(index + 1).trim()
    if (name && value) out.push({ name, value })
  }
  return out
}

function normalizeCookieHeader(raw) {
  const pairs = parseCookiePairs(raw)
  return pairs.length ? pairs.map((pair) => `${pair.name}=${pair.value}`).join('; ') : null
}

function bearerToken(raw) {
  const text = clean(raw)
  if (!text) return null
  const header = text.match(/(?:authorization\s*:\s*)?bearer\s+([A-Za-z0-9._~+/=-]+)/i)
  if (header) return clean(header[1])
  if (text.includes('=') || text.includes(';') || /\s/.test(text)) return null
  if (text.length >= 40 || text.split('.').length >= 3) return text
  return null
}

function manualCredentials(raw) {
  const text = clean(raw)
  if (!text) return {}
  let cookieHeader = normalizeCookieHeader(text)
  let accessToken = bearerToken(text)
  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text)
      cookieHeader = normalizeCookieHeader(json.cookieHeader || json.cookie || json.session) || cookieHeader
      accessToken = clean(json.accessToken || json.access_token || json.bearerToken || json.token) || accessToken
    } catch {
      /* fall through */
    }
  }
  return { cookieHeader, accessToken }
}

function parseAuthFile(root) {
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(path.join(root, 'auth.json'), 'utf8'))
  } catch {
    return {}
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const entries = Object.entries(raw)
    .filter(([, entry]) => entry && typeof entry === 'object' && clean(entry.key))
  const oidc = entries.find(([scope]) => String(scope).startsWith('https://auth.x.ai::'))
  const legacy = entries.find(([scope]) => scope === 'https://accounts.x.ai/sign-in' || String(scope).includes('/sign-in'))
  const selected = (oidc || legacy || entries[0])?.[1]
  return selected ? {
    accessToken: clean(selected.key),
    email: clean(selected.email),
    authMode: clean(selected.auth_mode),
    expiresAt: clean(selected.expires_at),
  } : {}
}

function resolveCredentials(root, options = {}) {
  const saved = manualCredentials(options.savedKey ?? getKey('grok'))
  const env = options.env || process.env
  const envCookie = manualCredentials(env.GROK_COOKIE || env.GROK_SESSION_COOKIE || env.GROK_WEB_COOKIE)
  const envToken = clean(env.GROK_ACCESS_TOKEN || env.GROK_BEARER_TOKEN || env.GROK_TOKEN)
  const auth = parseAuthFile(root)
  return {
    cookieHeader: envCookie.cookieHeader || saved.cookieHeader || null,
    accessToken: envToken || envCookie.accessToken || saved.accessToken || auth.accessToken || null,
    auth,
  }
}

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

function emptyBucket(extra = {}) {
  return { input: 0, cached: 0, output: 0, total: 0, sessions: 0, requests: 0, ...extra }
}

function addTokens(bucket, row) {
  bucket.input += row.input || 0
  bucket.cached += row.cached || 0
  bucket.output += row.output || 0
  bucket.total += row.total || 0
  bucket.sessions += row.sessions || 0
  bucket.requests += row.requests || row.sessions || 0
}

function sortedBreakdowns(map, key) {
  return [...map.entries()]
    .map(([name, bucket]) => ({ [key]: name, ...bucket }))
    .sort((a, b) => b.total - a.total)
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return null
}

function modelsFromSignal(json) {
  const models = []
  const primary = firstString(json.primaryModelId, json.primary_model_id, json.model, json.modelId, json.model_id)
  if (primary) models.push(primary)
  if (Array.isArray(json.modelsUsed)) {
    for (const model of json.modelsUsed) {
      const trimmed = firstString(model)
      if (trimmed && !models.includes(trimmed)) models.push(trimmed)
    }
  }
  return models
}

function tokensFromSignal(json) {
  const input = numberValue(json.inputTokens ?? json.input_tokens ?? json.promptTokens ?? json.prompt_tokens)
  const cached = numberValue(
    json.cachedInputTokens
      ?? json.cacheReadInputTokens
      ?? json.cacheReadTokens
      ?? json.cached_input_tokens
      ?? json.cache_read_input_tokens
      ?? json.cache_read_tokens,
  )
  const output = numberValue(json.outputTokens ?? json.output_tokens ?? json.completionTokens ?? json.completion_tokens)
  const splitTotal = input + cached + output
  const grokLocalTotal = numberValue(json.totalTokensBeforeCompaction)
    + numberValue(json.contextTokensUsed)
  const fallbackTotal = numberValue(json.totalTokens ?? json.total_tokens)
  const total = splitTotal || grokLocalTotal || fallbackTotal

  if (!total) return null
  if (splitTotal) return { input, cached, output, total, sessions: 1, requests: 1 }
  return { input: total, cached: 0, output: 0, total, sessions: 1, requests: 1 }
}

function scanSignalFile(file, mtimeMs) {
  let json
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const tokens = tokensFromSignal(json)
  if (!tokens) return null
  const models = modelsFromSignal(json)
  return {
    ...tokens,
    model: models[0] || 'grok',
    models,
    day: dayKey(mtimeMs),
    lastActive: mtimeMs,
  }
}

function scanGrokSignals(root, now = Date.now(), historyDays = DEFAULT_HISTORY_DAYS) {
  const cutoff = now - Math.max(1, Number(historyDays) || DEFAULT_HISTORY_DAYS) * 86400000
  const sessionsDir = path.join(root, 'sessions')
  const files = []

  function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile() && entry.name === 'signals.json') {
        files.push(full)
      }
    }
  }

  walk(sessionsDir)

  const usage = emptyBucket()
  const byModel = new Map()
  const byDay = new Map()
  const byDayModel = new Map()
  let lastActive = 0

  for (const file of files) {
    let stat
    try {
      stat = fs.statSync(file)
    } catch {
      continue
    }
    const mtimeMs = stat.mtimeMs
    if (mtimeMs < cutoff) continue
    const row = scanSignalFile(file, mtimeMs)
    if (!row) continue

    addTokens(usage, row)
    lastActive = Math.max(lastActive, row.lastActive)

    const model = byModel.get(row.model) || emptyBucket()
    addTokens(model, row)
    byModel.set(row.model, model)

    const day = byDay.get(row.day) || emptyBucket({ date: row.day })
    addTokens(day, row)
    byDay.set(row.day, day)

    const dayModelKey = `${row.day}\u0000${row.model}`
    const dayModel = byDayModel.get(dayModelKey) || emptyBucket({ model: row.model })
    addTokens(dayModel, row)
    byDayModel.set(dayModelKey, dayModel)
  }

  if (!usage.sessions || !usage.total) return null

  const dailyBreakdown = sortedBreakdowns(byDay, 'date')
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((day) => ({
      ...day,
      modelBreakdowns: [...byDayModel.entries()]
        .filter(([key]) => key.startsWith(`${day.date}\u0000`))
        .map(([, bucket]) => bucket)
        .sort((a, b) => b.total - a.total),
    }))
  const modelBreakdowns = sortedBreakdowns(byModel, 'model')

  return {
    input: usage.input,
    cached: usage.cached,
    output: usage.output,
    total: usage.total,
    sessions: usage.sessions,
    modelBreakdowns,
    modelNames: modelBreakdowns.map((row) => row.model),
    dailyBreakdown,
    historyDays: dailyBreakdown.length,
    period: `${Math.max(1, Number(historyDays) || DEFAULT_HISTORY_DAYS)}d`,
    source: 'local Grok signals',
    lastActive,
  }
}

function readVarint(bytes, cursor) {
  let value = 0n
  let shift = 0n
  while (cursor.index < bytes.length && shift < 64n) {
    const byte = bytes[cursor.index++]
    value |= BigInt(byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return Number(value)
    shift += 7n
  }
  return null
}

function scanProtobuf(buffer, depth = 0, pathParts = [], orderRef = { value: 0 }) {
  const bytes = Buffer.from(buffer)
  const scan = { fixed32Fields: [], varintFields: [] }
  let index = 0

  while (index < bytes.length) {
    const fieldStart = index
    const key = readVarint(bytes, { get index() { return index }, set index(value) { index = value } })
    if (!key) {
      index = fieldStart + 1
      continue
    }
    const fieldNumber = Math.floor(key / 8)
    const wireType = key & 0x07
    const fieldPath = [...pathParts, fieldNumber]

    if (wireType === 0) {
      const cursor = { index }
      const value = readVarint(bytes, cursor)
      if (value != null) {
        index = cursor.index
        scan.varintFields.push({ path: fieldPath, value })
      } else {
        index = fieldStart + 1
      }
    } else if (wireType === 1) {
      if (index + 8 > bytes.length) break
      index += 8
    } else if (wireType === 2) {
      const cursor = { index }
      const length = readVarint(bytes, cursor)
      if (length == null || length < 0 || cursor.index + length > bytes.length) {
        index = fieldStart + 1
        continue
      }
      index = cursor.index
      const end = index + length
      if (depth < 4) {
        const nested = scanProtobuf(bytes.subarray(index, end), depth + 1, fieldPath, orderRef)
        scan.fixed32Fields.push(...nested.fixed32Fields)
        scan.varintFields.push(...nested.varintFields)
      }
      index = end
    } else if (wireType === 5) {
      if (index + 4 > bytes.length) break
      scan.fixed32Fields.push({
        path: fieldPath,
        value: bytes.readFloatLE(index),
        order: orderRef.value++,
      })
      index += 4
    } else {
      index = fieldStart + 1
    }
  }

  return scan
}

function grpcWebDataFrames(data) {
  const bytes = Buffer.from(data)
  const frames = []
  let index = 0
  while (index + 5 <= bytes.length) {
    const flags = bytes[index]
    const length = bytes.readUInt32BE(index + 1)
    const start = index + 5
    const end = start + length
    if (end > bytes.length) break
    if ((flags & 0x80) === 0) frames.push(bytes.subarray(start, end))
    index = end
  }
  return frames
}

function grpcWebTrailerFields(data) {
  const bytes = Buffer.from(data)
  const fields = {}
  let index = 0
  while (index + 5 <= bytes.length) {
    const flags = bytes[index]
    const length = bytes.readUInt32BE(index + 1)
    const start = index + 5
    const end = start + length
    if (end > bytes.length) break
    if ((flags & 0x80) !== 0) {
      const text = bytes.subarray(start, end).toString('utf8')
      for (const line of text.split(/\r?\n/)) {
        if (!line) continue
        const sep = line.indexOf(':')
        if (sep <= 0) continue
        fields[line.slice(0, sep).trim().toLowerCase()] = decodeURIComponent(line.slice(sep + 1).trim())
      }
    }
    index = end
  }
  return fields
}

function validateGrpcStatus(fields) {
  const status = Number(fields['grpc-status'])
  if (Number.isFinite(status) && status !== 0) {
    throw new Error(`Grok web billing RPC failed with status ${status}: ${fields['grpc-message'] || ''}`.trim())
  }
}

function parseGrokWebBillingResponse(data, now = Date.now()) {
  validateGrpcStatus(grpcWebTrailerFields(data))
  const payloads = grpcWebDataFrames(data)
  if (!payloads.length) throw new Error('Grok web billing returned no protobuf payload')

  const scan = { fixed32Fields: [], varintFields: [] }
  for (const payload of payloads) {
    const next = scanProtobuf(payload)
    scan.fixed32Fields.push(...next.fixed32Fields)
    scan.varintFields.push(...next.varintFields)
  }

  const percentField = scan.fixed32Fields
    .filter((field) => {
      const value = field.value
      return field.path.at(-1) === 1 && Number.isFinite(value) && value >= 0 && value <= 100
    })
    .sort((a, b) => (a.path.length - b.path.length) || (a.order - b.order))[0]
  const futureResets = scan.varintFields
    .filter((field) => field.value >= 1_700_000_000 && field.value <= 2_100_000_000)
    .map((field) => ({ ...field, ms: field.value * 1000 }))
    .filter((field) => field.ms > now)
  const preferredReset = futureResets
    .filter((field) => field.path.join('.') === '1.5.1')
    .sort((a, b) => a.ms - b.ms)[0]
  const reset = preferredReset || futureResets.sort((a, b) => a.ms - b.ms)[0]
  const noUsageYet = !percentField
    && scan.fixed32Fields.length === 0
    && reset
    && scan.varintFields.some((field) => field.path[0] === 1 && field.path[1] === 6)
  const usedPercent = percentField ? percentField.value : noUsageYet ? 0 : null
  if (!Number.isFinite(usedPercent)) throw new Error('Could not parse Grok web billing usage')
  return {
    usedPercent,
    resetsAt: reset ? reset.ms : null,
    source: 'grok.com billing',
  }
}

async function fetchWebBilling(credentials, options = {}) {
  const headers = {
    Origin: 'https://grok.com',
    Referer: 'https://grok.com/?_s=usage',
    Accept: '*/*',
    'Content-Type': 'application/grpc-web+proto',
    'x-grpc-web': '1',
    'x-user-agent': 'connect-es/2.1.1',
    'User-Agent': USER_AGENT,
  }
  if (credentials.accessToken) headers.Authorization = `Bearer ${credentials.accessToken}`
  if (credentials.cookieHeader) headers.Cookie = credentials.cookieHeader
  if (!headers.Authorization && !headers.Cookie) return null

  const fetchImpl = options.fetchImpl || fetchWithTimeout
  const response = await fetchImpl(options.endpoint || GROK_WEB_BILLING_URL, {
    method: 'POST',
    headers,
    body: Buffer.from([0, 0, 0, 0, 0]),
  }, options.timeoutMs || 10000)
  const body = Buffer.from(await response.arrayBuffer())
  if (!response.ok) {
    const text = body.subarray(0, 400).toString('utf8')
    throw new Error(response.status === 401 || response.status === 403
      ? 'Grok web billing rejected credentials. Run `grok login` or paste a fresh grok.com Cookie.'
      : `Grok web billing request failed with HTTP ${response.status}: ${text}`)
  }
  validateGrpcStatus(Object.fromEntries([...response.headers.entries()]
    .filter(([key]) => key.toLowerCase().startsWith('grpc-'))
    .map(([key, value]) => [key.toLowerCase(), decodeURIComponent(String(value).trim())])))
  return parseGrokWebBillingResponse(body, options.now || Date.now())
}

// Grok Build CLI stores auth in auth.json and per-project sessions under
// ~/.grok/sessions/<encoded-cwd>/<session-uuid>/summary.json (with last_active_at).
// We infer "usage" the same way Gemini does: active days within the billing cycle.
async function read(cycle, options = {}) {
  const root = grokHome(options)
  const credentials = resolveCredentials(root, options)
  let exists = Boolean(credentials.cookieHeader || credentials.accessToken)
  try {
    exists = exists || fs.existsSync(path.join(root, 'auth.json'))
  } catch {
    return { connected: false }
  }
  if (!exists) return { connected: false }

  const activeDays = new Set()
  let lastActive = 0
  let sessions = 0

  // Walk project session directories
  const sessionsDir = path.join(root, 'sessions')
  let projects
  try {
    projects = fs.readdirSync(sessionsDir, { withFileTypes: true })
  } catch {
    // No sessions yet is fine — still connected via auth.json
  }

  if (projects) {
    for (const p of projects) {
      if (!p.isDirectory()) continue
      const projDir = path.join(sessionsDir, p.name)
      let sessEntries
      try {
        sessEntries = fs.readdirSync(projDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const s of sessEntries) {
        if (!s.isDirectory()) continue
        const sessDir = path.join(projDir, s.name)
        const summaryPath = path.join(sessDir, 'summary.json')
        try {
          const stat = fs.statSync(summaryPath)
          const m = stat.mtimeMs
          if (m >= cycle.startMs) {
            activeDays.add(new Date(m).toDateString())
            if (m > lastActive) lastActive = m
            sessions++
          }
        } catch {
          // summary may not exist for very new sessions; prefer signal mtime before dir mtime
          try {
            const signalPath = path.join(sessDir, 'signals.json')
            const stat = fs.existsSync(signalPath) ? fs.statSync(signalPath) : fs.statSync(sessDir)
            const m = stat.mtimeMs
            if (m >= cycle.startMs) {
              activeDays.add(new Date(m).toDateString())
              if (m > lastActive) lastActive = m
              sessions++
            }
          } catch {}
        }
      }
    }
  }

  // Also count activity from the unified log (catches CLI invocations even without full sessions)
  const logPath = path.join(root, 'logs', 'unified.jsonl')
  try {
    const stat = fs.statSync(logPath)
    const m = stat.mtimeMs
    if (m >= cycle.startMs) {
      activeDays.add(new Date(m).toDateString())
      if (m > lastActive) lastActive = m
    }
  } catch {}

  const tokenUsage = scanGrokSignals(root, options.now || Date.now(), options.tokenHistoryDays || DEFAULT_HISTORY_DAYS)
  for (const day of tokenUsage?.dailyBreakdown || []) {
    const ms = Date.parse(`${day.date}T12:00:00Z`)
    if (Number.isFinite(ms) && ms >= cycle.startMs) activeDays.add(new Date(ms).toDateString())
  }
  const usageLastActive = tokenUsage?.lastActive || 0
  let billing = null
  let error = null
  try {
    billing = await fetchWebBilling(credentials, options)
  } catch (err) {
    error = err && err.message ? err.message : String(err)
  }

  return {
    connected: true,
    sessions: Math.max(sessions, tokenUsage?.sessions || 0),
    activeDays: activeDays.size,
    lastActive: Math.max(lastActive, usageLastActive, billing ? Date.now() : 0) || null,
    billing,
    tokenUsage,
    accountEmail: credentials.auth?.email || null,
    error,
  }
}

module.exports = {
  read,
  _private: {
    grokHome,
    resolveCredentials,
    manualCredentials,
    parseAuthFile,
    parseGrokWebBillingResponse,
    fetchWebBilling,
    scanGrokSignals,
    scanSignalFile,
    tokensFromSignal,
  },
}
