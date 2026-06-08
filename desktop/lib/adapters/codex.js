const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { fetchWithTimeout } = require('../http')

const SESSIONS = path.join(os.homedir(), '.codex', 'sessions')
const AUTH_FILE = 'auth.json'
const KEYCHAIN_SERVICE = 'Codex Auth'
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const REFRESH_URL = 'https://auth.openai.com/oauth/token'
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses'
// Only this model is accepted on the Codex/ChatGPT-account responses endpoint;
// gpt-5 / gpt-5-codex are rejected ("not supported when using Codex with a
// ChatGPT account"). max_output_tokens and temperature are also unsupported.
const GEN_MODEL = 'gpt-5.5'
const REFRESH_AGE_MS = 8 * 24 * 60 * 60 * 1000
const PERIOD_SESSION_MS = 5 * 60 * 60 * 1000
const PERIOD_WEEKLY_MS = 7 * 24 * 60 * 60 * 1000
const TOKEN_SCAN_CACHE_MS = 60 * 1000
const PRIORITY_DB = path.join(os.homedir(), '.codex', 'logs_2.sqlite')

let tokenScanCache = { historyDays: null, pathSignature: null, signature: null, scannedAt: 0, usage: null }

function authPaths() {
  if (process.env.CODEX_HOME) return [path.join(process.env.CODEX_HOME, AUTH_FILE)]
  return [
    path.join(os.homedir(), '.config', 'codex', AUTH_FILE),
    path.join(os.homedir(), '.codex', AUTH_FILE),
  ]
}

function hexMaybeDecode(text) {
  const t = String(text).trim()
  if (/^[0-9a-fA-F]+$/.test(t) && t.length % 2 === 0 && t.length > 20) {
    try {
      return Buffer.from(t, 'hex').toString('utf8')
    } catch {
      /* fall through */
    }
  }
  return t
}

function parseAuth(text) {
  try {
    const auth = JSON.parse(hexMaybeDecode(text))
    if (auth?.tokens?.access_token || auth?.OPENAI_API_KEY) return auth
  } catch {
    /* invalid auth source */
  }
  return null
}

function authCandidates() {
  const out = []
  for (const file of authPaths()) {
    try {
      if (!fs.existsSync(file)) continue
      const auth = parseAuth(fs.readFileSync(file, 'utf8'))
      if (auth) out.push({ auth, source: 'file', file })
    } catch {
      /* try the next source */
    }
  }
  try {
    const raw = execFileSync(
      'security',
      ['find-generic-password', '-w', '-s', KEYCHAIN_SERVICE],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const auth = parseAuth(raw)
    if (auth) out.push({ auth, source: 'keychain' })
  } catch {
    /* keychain item may not exist or may be denied */
  }
  return out
}

function keychainAccount() {
  try {
    const out = execFileSync(
      'security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const m = out.match(/"acct"<blob>="([^"]*)"/)
    return m ? m[1] : os.userInfo().username
  } catch {
    return os.userInfo().username
  }
}

function persistAuth(state) {
  const text = JSON.stringify(state.auth, null, state.source === 'file' ? 2 : 0)
  if (state.source === 'file' && state.file) {
    try {
      fs.writeFileSync(state.file, text)
    } catch {
      /* refreshed token still works in memory */
    }
    return
  }
  if (state.source === 'keychain') {
    try {
      execFileSync(
        'security',
        ['add-generic-password', '-U', '-a', keychainAccount(), '-s', KEYCHAIN_SERVICE, '-w', text],
        { stdio: 'ignore' },
      )
    } catch {
      /* refreshed token still works in memory */
    }
  }
}

function needsRefresh(auth) {
  if (!auth.last_refresh) return true
  const ms = Date.parse(auth.last_refresh)
  return !Number.isFinite(ms) || Date.now() - ms > REFRESH_AGE_MS
}

async function refreshToken(state) {
  const refreshToken = state.auth?.tokens?.refresh_token
  if (!refreshToken) return null
  const resp = await fetchWithTimeout(
    REFRESH_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:
        'grant_type=refresh_token' +
        '&client_id=' +
        encodeURIComponent(CLIENT_ID) +
        '&refresh_token=' +
        encodeURIComponent(refreshToken),
    },
    15000,
  )
  if (resp.status === 400 || resp.status === 401) {
    throw new Error('Codex session expired. Run `codex` to log in again.')
  }
  if (!resp.ok) return null
  const body = await resp.json()
  if (!body.access_token) return null
  state.auth.tokens.access_token = body.access_token
  if (body.refresh_token) state.auth.tokens.refresh_token = body.refresh_token
  if (body.id_token) state.auth.tokens.id_token = body.id_token
  state.auth.last_refresh = new Date().toISOString()
  persistAuth(state)
  return body.access_token
}

function planLabel(raw) {
  const p = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (p === 'prolite') return 'Pro 5x'
  if (p === 'pro') return 'Pro 20x'
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : null
}

// The live usage endpoint omits plan_type, so the live path otherwise loses it
// and aggregate falls back to a stale persisted plan. The id_token JWT always
// carries the authoritative plan under chatgpt_plan_type — decode it here.
function planFromIdToken(idToken) {
  if (typeof idToken !== 'string') return null
  const parts = idToken.split('.')
  if (parts.length < 2) return null
  try {
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    payload += '='.repeat((4 - (payload.length % 4)) % 4)
    const claims = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
    const auth = claims && claims['https://api.openai.com/auth']
    return (auth && auth.chatgpt_plan_type) || null
  } catch {
    return null
  }
}

function numberHeader(headers, key) {
  const raw = headers?.get ? headers.get(key) : null
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function resetAt(window) {
  if (!window) return null
  const raw = window.reset_at ?? window.resets_at ?? window.resetAt
  if (typeof raw === 'number') return raw < 1e12 ? raw * 1000 : raw
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  const after = window.reset_after_seconds ?? window.reset_after
  if (typeof after === 'number') {
    return Date.now() + after * 1000
  }
  return null
}

function numberValue(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function usedPercentFromWindow(window) {
  if (!window || typeof window !== 'object') return null
  const direct = numberValue(
    window.used_percent ??
    window.usedPercent ??
    window.percent_used ??
    window.usage_percent ??
    window.used_pct,
  )
  if (direct != null) return direct

  const remaining = numberValue(window.remaining_percent ?? window.remainingPercent)
  if (remaining != null) return 100 - remaining

  const utilization = numberValue(window.utilization)
  if (utilization != null) return utilization < 1 ? utilization * 100 : utilization

  const used = numberValue(window.used ?? window.consumed)
  const limit = numberValue(window.limit ?? window.total)
  if (used != null && limit > 0) return (used / limit) * 100

  const available = numberValue(window.remaining ?? window.available)
  if (available != null && limit > 0) return ((limit - available) / limit) * 100

  return null
}

function periodMsFromWindow(window, fallbackPeriodMs) {
  const seconds = numberValue(window?.limit_window_seconds ?? window?.window_seconds)
  if (seconds != null) return seconds * 1000
  const minutes = numberValue(window?.window_minutes ?? window?.limit_window_minutes)
  if (minutes != null) return minutes * 60000
  return fallbackPeriodMs
}

function kindFromPeriod(periodMs, fallback = 'quota') {
  if (Math.abs(periodMs - PERIOD_SESSION_MS) < 60000) return '5h'
  if (Math.abs(periodMs - PERIOD_WEEKLY_MS) < 60000) return '7d'
  return fallback
}

function cleanWindowKey(key) {
  return String(key || '')
    .replace(/[_-]?window$/i, '')
    .replace(/[_-]?rate[_-]?limit$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
}

function titleCase(text) {
  return String(text || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function labelForCodexWindow(key, window) {
  const raw = cleanWindowKey(key)
  const lower = raw.toLowerCase()
  const model = String(window?.model || window?.model_slug || window?.name || '').toLowerCase()
  const isSpark = lower.includes('spark') || model.includes('spark')
  const isWeekly =
    lower.includes('secondary') ||
    lower.includes('weekly') ||
    lower.includes('seven') ||
    periodMsFromWindow(window, 0) === PERIOD_WEEKLY_MS

  if (lower === 'primary' || lower === 'primary window') return 'Session'
  if (lower === 'secondary' || lower === 'secondary window') return 'Weekly'
  if (isSpark) return isWeekly ? 'Spark Weekly' : 'Spark'
  return titleCase(raw.replace(/\b(primary|secondary|usage|limit)\b/gi, '').trim()) || 'Quota'
}

function labelForAdditionalLimit(limit, key, window) {
  const raw = String(limit?.limit_name || limit?.name || limit?.metered_feature || key || '').trim()
  const lower = raw.toLowerCase()
  const isWeekly =
    String(key || '').toLowerCase().includes('secondary') ||
    periodMsFromWindow(window, 0) === PERIOD_WEEKLY_MS
  if (lower.includes('spark')) return isWeekly ? 'Spark Weekly' : 'Spark'
  const clean = raw
    .replace(/^gpt[-.\d]+[-_\s]*/i, '')
    .replace(/^codex[-_\s]*/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
  const label = titleCase(clean) || 'Extra'
  return isWeekly ? `${label} Weekly` : label
}

function windowFrom(label, kind, usedPct, window, fallbackPeriodMs) {
  const periodMs = periodMsFromWindow(window, fallbackPeriodMs)
  return {
    label,
    kind: kind || kindFromPeriod(periodMs),
    usedPct: Math.round(Math.max(0, Math.min(100, usedPct || 0))),
    resetAt: resetAt(window),
    periodMs,
  }
}

function windowFromRateLimit(key, window, fallback = {}) {
  const usedPct = usedPercentFromWindow(window)
  if (usedPct == null) return null
  const label = fallback.label || labelForCodexWindow(key, window)
  const periodMs = periodMsFromWindow(window, fallback.periodMs || null)
  return windowFrom(label, fallback.kind || kindFromPeriod(periodMs, 'quota'), usedPct, window, periodMs)
}

function formatCreditAmount(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value || '').trim()
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function creditsExtra(data) {
  const credits = data?.credits || data?.rate_limit?.credits
  if (!credits || typeof credits !== 'object') return []
  if (credits.unlimited) return [{ label: 'Credits left', value: 'unlimited' }]
  const balance = credits.balance ?? credits.credits_remaining ?? credits.remaining
  if (balance == null || balance === '') return []
  return [{ label: 'Credits left', value: formatCreditAmount(balance) }]
}

function codexWindowsFromRateLimit(rateLimit, headers = null) {
  const primaryWindow = rateLimit.primary_window || rateLimit.primary || null
  const secondaryWindow = rateLimit.secondary_window || rateLimit.secondary || null
  const primaryUsed =
    numberHeader(headers, 'x-codex-primary-used-percent') ?? usedPercentFromWindow(primaryWindow)
  const secondaryUsed =
    numberHeader(headers, 'x-codex-secondary-used-percent') ?? usedPercentFromWindow(secondaryWindow)
  const windows = []

  if (primaryUsed != null) {
    windows.push(windowFrom('Session', '5h', primaryUsed, primaryWindow, PERIOD_SESSION_MS))
  }
  if (secondaryUsed != null) {
    windows.push(windowFrom('Weekly', '7d', secondaryUsed, secondaryWindow, PERIOD_WEEKLY_MS))
  }

  const known = new Set(['primary_window', 'secondary_window', 'primary', 'secondary', 'credits'])
  for (const [key, value] of Object.entries(rateLimit || {})) {
    if (known.has(key) || !value || typeof value !== 'object') continue
    const window = windowFromRateLimit(key, value)
    if (window) windows.push(window)
  }
  return windows
}

function additionalCodexWindows(limits) {
  const windows = []
  for (const limit of Array.isArray(limits) ? limits : []) {
    const rateLimit = limit?.rate_limit || limit?.rateLimit || limit
    if (!rateLimit || typeof rateLimit !== 'object') continue
    const primary = windowFromRateLimit('primary_window', rateLimit.primary_window || rateLimit.primary, {
      label: labelForAdditionalLimit(limit, 'primary_window', rateLimit.primary_window || rateLimit.primary),
      kind: '5h',
      periodMs: PERIOD_SESSION_MS,
    })
    const secondary = windowFromRateLimit('secondary_window', rateLimit.secondary_window || rateLimit.secondary, {
      label: labelForAdditionalLimit(limit, 'secondary_window', rateLimit.secondary_window || rateLimit.secondary),
      kind: '7d',
      periodMs: PERIOD_WEEKLY_MS,
    })
    if (primary) windows.push(primary)
    if (secondary) windows.push(secondary)

    const known = new Set(['primary_window', 'secondary_window', 'primary', 'secondary'])
    for (const [key, value] of Object.entries(rateLimit)) {
      if (known.has(key) || !value || typeof value !== 'object') continue
      const window = windowFromRateLimit(key, value, {
        label: labelForAdditionalLimit(limit, key, value),
      })
      if (window) windows.push(window)
    }
  }
  return windows
}

function parseLiveUsage(data, headers = null) {
  const rateLimit = data?.rate_limit || {}
  const windows = [
    ...codexWindowsFromRateLimit(rateLimit, headers),
    ...additionalCodexWindows(data?.additional_rate_limits),
  ]
  return {
    connected: true,
    planType: planLabel(data?.plan_type) || data?.plan_type || null,
    lastActive: Date.now(),
    windows,
    extra: [{ label: 'Source', value: 'live Codex usage' }, ...creditsExtra(data)],
  }
}

async function fetchUsage(accessToken, accountId) {
  const headers = {
    Authorization: 'Bearer ' + accessToken,
    Accept: 'application/json',
    'User-Agent': 'MaxxToken',
  }
  if (accountId) headers['ChatGPT-Account-Id'] = accountId
  return fetchWithTimeout(USAGE_URL, { headers }, 10000)
}

async function readLiveWithAuth(state) {
  if (state.auth.OPENAI_API_KEY && !state.auth.tokens?.access_token) {
    throw new Error('Codex usage is not available for API-key auth.')
  }

  let accessToken = state.auth.tokens?.access_token
  if (!accessToken) throw new Error('Run `codex` to authenticate.')
  if (needsRefresh(state.auth)) {
    accessToken = (await refreshToken(state)) || accessToken
  }

  const accountId = state.auth.tokens?.account_id
  let resp = await fetchUsage(accessToken, accountId)
  if (resp.status === 401 || resp.status === 403) {
    const refreshed = await refreshToken(state)
    if (refreshed) resp = await fetchUsage(refreshed, accountId)
  }
  if (!resp.ok) throw new Error(`Codex usage request failed (${resp.status}).`)

  const result = parseLiveUsage(await resp.json(), resp.headers)
  if (!result.planType) {
    const raw = planFromIdToken(state.auth.tokens?.id_token)
    if (raw) result.planType = planLabel(raw) || raw
  }
  return result
}

async function readLive() {
  let lastError = null
  for (const state of authCandidates()) {
    try {
      return await readLiveWithAuth(state)
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) throw lastError
  throw new Error('Run `codex` to authenticate.')
}

// Walk the date-bucketed session tree and return rollout files newest-first.
function rolloutFiles(options = {}) {
  const limit = typeof options === 'number' ? options : options.limit ?? 8
  const sinceMs = typeof options === 'object' ? options.sinceMs : null
  const found = []
  function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) {
        const mtime = fs.statSync(full).mtimeMs
        if (!sinceMs || mtime >= sinceMs) found.push({ full, mtime })
      }
    }
  }
  walk(SESSIONS)
  const sorted = found.sort((a, b) => b.mtime - a.mtime)
  return (Number.isFinite(limit) ? sorted.slice(0, limit) : sorted).map((f) => f.full)
}

// Extract the JSON object that follows a `"rate_limits":` key by brace-balancing.
function extractRateLimits(text) {
  const key = '"rate_limits":'
  const at = text.lastIndexOf(key)
  if (at === -1) return null
  let i = text.indexOf('{', at)
  if (i === -1) return null
  let depth = 0
  const start = i
  for (; i < text.length; i++) {
    const c = text[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function tokenHistoryDays(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.min(365, Math.round(n))) : 30
}

function tokenHistorySince(days = 30, now = Date.now()) {
  return now - tokenHistoryDays(days) * 86400000
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function readLocal(options = {}) {
  // Light pulls skip the full rollout enumeration + token scan; they only need
  // the most recent files for rate-limit windows.
  const tokenFiles = options.skipTokenHistory
    ? []
    : rolloutFiles({ limit: Infinity, sinceMs: tokenHistorySince(options.tokenHistoryDays) })
  const files = tokenFiles.length ? tokenFiles : rolloutFiles()
  if (!files.length) return { connected: false }

  const tokenUsage = options.skipTokenHistory ? null : readTokenUsage(tokenFiles.length ? tokenFiles : files, options)
  let rl = null
  let mtime = 0
  for (const f of files) {
    const found = extractRateLimits(fs.readFileSync(f, 'utf8'))
    if (found) {
      rl = found
      mtime = fs.statSync(f).mtimeMs
      break
    }
  }
  if (!rl) {
    return tokenUsage
      ? { connected: true, lastActive: tokenUsage.lastActive, windows: [], tokenUsage }
      : { connected: false }
  }

  const toMs = (s) => (s ? s * 1000 : null)
  const result = {
    connected: true,
    planType: planLabel(rl.plan_type) || rl.plan_type || null,
    lastActive: mtime,
    windows: [],
    tokenUsage,
  }
  if (rl.primary) {
    result.session = {
      usedPct: Math.round(rl.primary.used_percent || 0),
      windowMinutes: rl.primary.window_minutes,
      resetAt: toMs(rl.primary.resets_at),
    }
    result.windows.push({
      label: 'Session',
      kind: '5h',
      usedPct: result.session.usedPct,
      resetAt: result.session.resetAt,
      periodMs: (rl.primary.window_minutes || 300) * 60000,
    })
  }
  if (rl.secondary) {
    result.weekly = {
      usedPct: Math.round(rl.secondary.used_percent || 0),
      windowMinutes: rl.secondary.window_minutes,
      resetAt: toMs(rl.secondary.resets_at),
    }
    result.windows.push({
      label: 'Weekly',
      kind: '7d',
      usedPct: result.weekly.usedPct,
      resetAt: result.weekly.resetAt,
      periodMs: (rl.secondary.window_minutes || 10080) * 60000,
    })
  }
  const known = new Set(['primary', 'secondary', 'plan_type', 'credits'])
  for (const [key, value] of Object.entries(rl)) {
    if (known.has(key) || !value || typeof value !== 'object') continue
    const window = windowFromRateLimit(key, value)
    if (window) result.windows.push(window)
  }
  result.extra = creditsExtra({ credits: rl.credits })
  return result
}

function toTokenInt(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function tokenTotals(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    input: toTokenInt(raw.input_tokens),
    cached: toTokenInt(raw.cached_input_tokens ?? raw.cache_read_input_tokens),
    output: toTokenInt(raw.output_tokens),
  }
}

function zeroTotals() {
  return { input: 0, cached: 0, output: 0 }
}

function totalSum(tokens) {
  return (tokens?.input || 0) + (tokens?.cached || 0) + (tokens?.output || 0)
}

function addTokenTotals(a, b) {
  return {
    input: (a?.input || 0) + (b?.input || 0),
    cached: (a?.cached || 0) + (b?.cached || 0),
    output: (a?.output || 0) + (b?.output || 0),
  }
}

function subtractTokenTotals(a, b) {
  return {
    input: Math.max(0, (a?.input || 0) - (b?.input || 0)),
    cached: Math.max(0, (a?.cached || 0) - (b?.cached || 0)),
    output: Math.max(0, (a?.output || 0) - (b?.output || 0)),
  }
}

function dateKeyFrom(value) {
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString().slice(0, 10)
}

function turnIdFrom(row, payload, info) {
  return (
    row?.turn_id ||
    row?.turnId ||
    row?.turn?.id ||
    payload?.turn_id ||
    payload?.turnId ||
    payload?.turn?.id ||
    info?.turn_id ||
    info?.turnId ||
    info?.turn?.id ||
    null
  )
}

function modelFromTokenEvent(obj, payload, info, currentModel) {
  const candidates = [
    currentModel,
    info?.model,
    info?.model_name,
    payload?.model,
    payload?.model_name,
    obj?.model,
    obj?.model_name,
  ]
  for (const raw of candidates) {
    const model = typeof raw === 'string' ? raw.trim() : ''
    if (model) return model.replace(/^openai\//i, '')
  }
  return null
}

function sessionMetadataFromRow(row) {
  if (!row || row.type !== 'session_meta') return null
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
  return {
    sessionId: payload.session_id || payload.sessionId || payload.id || row.session_id || row.sessionId || row.id || null,
    forkedFromId:
      payload.forked_from_id ||
      payload.forkedFromId ||
      payload.parent_session_id ||
      payload.parentSessionId ||
      null,
    forkTimestamp: payload.timestamp || row.timestamp || null,
  }
}

function addTokens(target, delta) {
  target.input += delta.input
  target.cached += delta.cached
  target.output += delta.output
}

function addBreakdown(map, key, delta) {
  if (!key) return
  if (!map.has(key)) map.set(key, { input: 0, cached: 0, output: 0, total: 0, events: 0 })
  const row = map.get(key)
  row.input += delta.input
  row.cached += delta.cached
  row.output += delta.output
  row.total += delta.input + delta.cached + delta.output
  row.events += Number(delta.events) || 1
}

function parseTraceValue(name, text) {
  const match = String(text || '').match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^\\s,\\]\\)]+)`))
  return match?.[1] || null
}

function parseCodexPriorityTraceRow(body, timestamp = null) {
  const marker = 'websocket request:'
  const at = String(body || '').indexOf(marker)
  if (at < 0) return null
  const prefix = body.slice(0, at)
  const jsonText = body.slice(at + marker.length).trim()
  let request
  try {
    request = JSON.parse(jsonText)
  } catch {
    return null
  }
  if (request?.type !== 'response.create' || request?.service_tier !== 'priority') return null
  const turnID = parseTraceValue('turn.id', prefix) || parseTraceValue('turn_id', prefix) || request.turn_id || null
  if (!turnID) return null
  return {
    turnID,
    threadID: parseTraceValue('thread_id', prefix) || null,
    model: typeof request.model === 'string' && request.model.trim() ? request.model.trim().replace(/^openai\//i, '') : null,
    timestamp,
  }
}

function parseCodexCompletedTraceRow(body) {
  const marker = 'websocket event:'
  const at = String(body || '').indexOf(marker)
  if (at < 0) return null
  const prefix = body.slice(0, at)
  const jsonText = body.slice(at + marker.length).trim()
  let event
  try {
    event = JSON.parse(jsonText)
  } catch {
    return null
  }
  if (event?.type !== 'response.completed') return null
  const model = typeof event.response?.model === 'string' ? event.response.model.trim().replace(/^openai\//i, '') : ''
  if (!model) return null
  const turnID = parseTraceValue('turn.id', prefix) || parseTraceValue('turn_id', prefix) || null
  if (!turnID) return null
  return { turnID, model }
}

function priorityTraceMeta(options = {}) {
  const databasePath = options.priorityDatabasePath || PRIORITY_DB
  try {
    const stat = fs.statSync(databasePath)
    return { databasePath, mtimeMs: stat.mtimeMs, size: stat.size }
  } catch {
    return { databasePath, mtimeMs: 0, size: 0 }
  }
}

function codexPriorityTurns(options = {}) {
  const databasePath = options.priorityDatabasePath || PRIORITY_DB
  if (!fs.existsSync(databasePath)) return {}
  const sinceMs = Number(options.sinceMs)
  const where = [
    "(feedback_log_body like '%websocket request:%' or feedback_log_body like '%response.completed%')",
  ]
  if (Number.isFinite(sinceMs) && sinceMs > 0) where.unshift(`ts >= ${Math.floor(sinceMs / 1000)}`)
  const sql = `select ts, feedback_log_body as body from logs where ${where.join(' and ')}`
  let rows
  try {
    rows = JSON.parse(
      execFileSync('sqlite3', ['-readonly', '-json', databasePath, sql], {
        encoding: 'utf8',
        timeout: 8000,
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      }) || '[]',
    )
  } catch {
    return {}
  }

  const turns = {}
  const completedModels = {}
  for (const row of rows) {
    const body = row?.body || row?.feedback_log_body
    const completed = parseCodexCompletedTraceRow(body)
    if (completed) {
      completedModels[completed.turnID] = completed.model
      if (turns[completed.turnID]) turns[completed.turnID].model = completed.model
      continue
    }
    const parsed = parseCodexPriorityTraceRow(body, row?.ts == null ? null : String(row.ts))
    if (!parsed) continue
    if (completedModels[parsed.turnID]) parsed.model = completedModels[parsed.turnID]
    turns[parsed.turnID] = parsed
  }
  return turns
}

function breakdownRows(map, keyName) {
  return [...map.entries()]
    .map(([key, value]) => ({
      [keyName]: key,
      ...value,
      uncachedInput: Math.max(0, value.input - value.cached),
    }))
    .sort((a, b) => b.total - a.total)
}

function tokenDelta(current, previous) {
  if (!previous) return current
  return subtractTokenTotals(current, previous)
}

function parseCodexTokenSnapshots(text) {
  let sessionId = null
  let previousTotal = null
  const snapshots = []
  for (const line of String(text || '').split(/\r?\n/)) {
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    const metadata = sessionMetadataFromRow(row)
    if (metadata) {
      sessionId = sessionId || metadata.sessionId
      continue
    }
    if (!line.includes('"token_count"')) continue
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : row
    if (payload.type !== 'token_count') continue
    const info = payload.info && typeof payload.info === 'object' ? payload.info : {}
    const total = tokenTotals(info.total_token_usage)
    const last = tokenTotals(info.last_token_usage)
    const timestamp = row.timestamp || payload.timestamp || info.timestamp
    if (!timestamp) continue

    if (last) {
      previousTotal = addTokenTotals(previousTotal || zeroTotals(), last)
      snapshots.push({ timestamp, ms: Date.parse(timestamp), totals: previousTotal })
    } else if (total) {
      const delta = tokenDelta(total, previousTotal)
      previousTotal = addTokenTotals(previousTotal || zeroTotals(), delta)
      snapshots.push({ timestamp, ms: Date.parse(timestamp), totals: previousTotal })
    }
  }
  return { sessionId, snapshots }
}

function sessionMetadataFromFile(file) {
  try {
    const fd = fs.openSync(file, 'r')
    try {
      const chunk = Buffer.alloc(256 * 1024)
      const read = fs.readSync(fd, chunk, 0, chunk.length, 0)
      const text = chunk.slice(0, read).toString('utf8')
      for (const line of text.split(/\r?\n/)) {
        try {
          const row = JSON.parse(line)
          const metadata = sessionMetadataFromRow(row)
          if (metadata) return metadata
        } catch {
          /* keep scanning first chunk */
        }
      }
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    /* unreadable session file */
  }
  return null
}

function buildSessionFileIndex(files) {
  const index = new Map()
  for (const file of files || []) {
    const metadata = sessionMetadataFromFile(file)
    if (metadata?.sessionId && !index.has(metadata.sessionId)) index.set(metadata.sessionId, file)
  }
  return index
}

function makeInheritedTotalsResolver(files, options = {}) {
  const allFiles = options.includeAll === false
    ? [...new Set(files || [])]
    : [...new Set([...(files || []), ...rolloutFiles({ limit: Infinity })])]
  const index = buildSessionFileIndex(allFiles)
  const snapshotsBySession = new Map()
  return (sessionId, cutoffTimestamp) => {
    if (!sessionId || !cutoffTimestamp) return null
    if (!snapshotsBySession.has(sessionId)) {
      const file = index.get(sessionId)
      if (!file) {
        snapshotsBySession.set(sessionId, [])
      } else {
        try {
          snapshotsBySession.set(sessionId, parseCodexTokenSnapshots(fs.readFileSync(file, 'utf8')).snapshots)
        } catch {
          snapshotsBySession.set(sessionId, [])
        }
      }
    }
    const snapshots = snapshotsBySession.get(sessionId) || []
    const cutoffMs = Date.parse(cutoffTimestamp)
    let inherited = null
    for (const snapshot of snapshots) {
      const before = Number.isFinite(snapshot.ms) && Number.isFinite(cutoffMs)
        ? snapshot.ms <= cutoffMs
        : String(snapshot.timestamp) <= String(cutoffTimestamp)
      if (before) inherited = snapshot.totals
    }
    return inherited
  }
}

function parseCodexTokenUsage(text, options = {}) {
  const usage = { input: 0, cached: 0, output: 0 }
  const byModel = new Map()
  const byDay = new Map()
  const byDayModel = new Map()
  const byServiceTier = new Map()
  const priorityTurns = options.priorityTurns || {}
  let previousTotal = null
  let inheritedTotals = null
  let remainingInheritedTotals = null
  let currentModel = null
  let currentTurnId = null
  let sessionId = null
  let forkedFromId = null
  let events = 0
  let priorityEvents = 0
  const priorityTurnIds = new Set()

  for (const line of String(text).split(/\r?\n/)) {
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }

    const metadata = sessionMetadataFromRow(row)
    if (metadata) {
      sessionId = sessionId || metadata.sessionId
      forkedFromId = forkedFromId || metadata.forkedFromId
      if (forkedFromId && !inheritedTotals && typeof options.inheritedTotalsResolver === 'function') {
        inheritedTotals = options.inheritedTotalsResolver(forkedFromId, metadata.forkTimestamp || row.timestamp || '')
        remainingInheritedTotals = inheritedTotals ? { ...inheritedTotals } : null
      }
      continue
    }

    if (row.type === 'turn_context') {
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
      currentTurnId = turnIdFrom(row, payload, {})
      const model = typeof payload.model === 'string'
        ? payload.model
        : typeof payload.info?.model === 'string'
          ? payload.info.model
          : null
      if (model?.trim()) currentModel = model.trim()
      continue
    }

    if (row.type === 'event_msg') {
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
      if (payload.type === 'task_started' && turnIdFrom(row, payload, {})) {
        currentTurnId = turnIdFrom(row, payload, {})
        continue
      }
    }

    if (!line.includes('"token_count"')) continue
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : row
    if (payload.type !== 'token_count') continue
    const info = payload.info && typeof payload.info === 'object' ? payload.info : {}
    const turnId = turnIdFrom(row, payload, info) || currentTurnId
    const priorityTurn = turnId ? priorityTurns[turnId] : null
    const total = tokenTotals(info.total_token_usage)
    const last = tokenTotals(info.last_token_usage)
    const timestamp = row.timestamp || payload.timestamp || info.timestamp
    const eventMs = Date.parse(timestamp)
    if (options.sinceMs && Number.isFinite(eventMs) && eventMs < options.sinceMs) continue
    const model = priorityTurn?.model || modelFromTokenEvent(row, payload, info, currentModel) || 'gpt-5'
    const serviceTier = priorityTurn ? 'priority' : 'standard'
    const day = dateKeyFrom(timestamp)
    let delta = null

    function adjustedLastDelta(rawDelta) {
      if (!remainingInheritedTotals) return rawDelta
      const adjusted = subtractTokenTotals(rawDelta, remainingInheritedTotals)
      remainingInheritedTotals = subtractTokenTotals(remainingInheritedTotals, rawDelta)
      if (totalSum(remainingInheritedTotals) === 0) remainingInheritedTotals = null
      return adjusted
    }

    if (last) {
      const hadRemainingInheritedTotals = remainingInheritedTotals != null
      delta = adjustedLastDelta(last)
      if (total) {
        const currentTotal = inheritedTotals ? subtractTokenTotals(total, inheritedTotals) : total
        const totalBasedDelta = tokenDelta(currentTotal, previousTotal)
        if (!hadRemainingInheritedTotals && previousTotal && totalSum(totalBasedDelta) > 0 && totalSum(totalBasedDelta) < totalSum(delta)) {
          delta = totalBasedDelta
        }
        previousTotal = addTokenTotals(previousTotal || zeroTotals(), delta)
      } else {
        previousTotal = addTokenTotals(previousTotal || zeroTotals(), delta)
      }
    } else if (total) {
      if (forkedFromId && !previousTotal) {
        if (!inheritedTotals) {
          previousTotal = total
          continue
        }
      }
      const currentTotal = inheritedTotals ? subtractTokenTotals(total, inheritedTotals) : total
      delta = tokenDelta(currentTotal, previousTotal)
      previousTotal = addTokenTotals(previousTotal || zeroTotals(), delta)
      remainingInheritedTotals = null
    }
    if (!delta || delta.input + delta.cached + delta.output <= 0) continue

    delta = { ...delta, cached: Math.min(delta.cached, delta.input) }
    addTokens(usage, delta)
    addBreakdown(byModel, model, delta)
    addBreakdown(byDay, day, delta)
    addBreakdown(byServiceTier, serviceTier, delta)
    if (day && model) addBreakdown(byDayModel, `${day}\u0000${model}`, delta)
    events++
    if (priorityTurn) {
      priorityEvents++
      if (turnId) priorityTurnIds.add(turnId)
    }
  }

  if (!events) return null
  const total = usage.input + usage.cached + usage.output
  const modelBreakdowns = breakdownRows(byModel, 'model')
  const serviceTierBreakdowns = breakdownRows(byServiceTier, 'serviceTier')
  const dailyBreakdown = breakdownRows(byDay, 'date')
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((day) => {
      const modelRows = [...byDayModel.entries()]
        .filter(([key]) => key.startsWith(`${day.date}\u0000`))
        .map(([key, value]) => ({
          model: key.split('\u0000')[1],
          ...value,
          uncachedInput: Math.max(0, value.input - value.cached),
        }))
        .sort((a, b) => b.total - a.total)
      return {
        ...day,
        modelBreakdowns: modelRows,
      }
    })
  return {
    ...usage,
    total,
    events,
    priorityEvents,
    ...(sessionId ? { sessionId } : {}),
    ...(forkedFromId ? { forkedFromId } : {}),
    ...(priorityTurnIds.size ? { priorityTurnCount: priorityTurnIds.size } : {}),
    ...(currentModel && !modelBreakdowns.length ? { model: currentModel } : {}),
    ...(modelBreakdowns.length ? {
      modelBreakdowns,
      modelNames: modelBreakdowns.map((row) => row.model),
    } : {}),
    ...(serviceTierBreakdowns.length ? {
      serviceTierBreakdowns,
    } : {}),
    ...(dailyBreakdown.length ? {
      dailyBreakdown,
      historyDays: dailyBreakdown.length,
    } : {}),
  }
}

function mergeTokenUsage(target, usage) {
  addTokens(target, usage)
  target.total += usage.total || 0
  target.events += usage.events || 0
  target.priorityEvents += usage.priorityEvents || 0
  target.priorityTurnCount += usage.priorityTurnCount || 0
  if (usage.lastActive) target.lastActive = Math.max(target.lastActive || 0, usage.lastActive)
  for (const row of usage.modelBreakdowns || []) {
    addBreakdown(target.byModel, row.model || row.modelName, row)
  }
  for (const row of usage.serviceTierBreakdowns || []) {
    addBreakdown(target.byServiceTier, row.serviceTier || row.tier, row)
  }
  for (const row of usage.dailyBreakdown || []) {
    addBreakdown(target.byDay, row.date || row.dayKey, row)
    for (const model of row.modelBreakdowns || []) {
      const day = row.date || row.dayKey
      const modelName = model.model || model.modelName
      if (day && modelName) addBreakdown(target.byDayModel, `${day}\u0000${modelName}`, model)
    }
  }
}

function aggregateTokenUsages(usages) {
  const aggregate = {
    input: 0,
    cached: 0,
    output: 0,
    total: 0,
    events: 0,
    priorityEvents: 0,
    priorityTurnCount: 0,
    lastActive: 0,
    byModel: new Map(),
    byDay: new Map(),
    byDayModel: new Map(),
    byServiceTier: new Map(),
  }
  for (const usage of usages) mergeTokenUsage(aggregate, usage)
  if (!aggregate.events) return null
  const modelBreakdowns = breakdownRows(aggregate.byModel, 'model')
  const serviceTierBreakdowns = breakdownRows(aggregate.byServiceTier, 'serviceTier')
  const dailyBreakdown = breakdownRows(aggregate.byDay, 'date')
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((day) => ({
      ...day,
      modelBreakdowns: [...aggregate.byDayModel.entries()]
        .filter(([key]) => key.startsWith(`${day.date}\u0000`))
        .map(([key, value]) => ({
          model: key.split('\u0000')[1],
          ...value,
          uncachedInput: Math.max(0, value.input - value.cached),
        }))
        .sort((a, b) => b.total - a.total),
    }))
  return {
    input: aggregate.input,
    cached: aggregate.cached,
    output: aggregate.output,
    total: aggregate.total,
    events: aggregate.events,
    priorityEvents: aggregate.priorityEvents,
    lastActive: aggregate.lastActive,
    ...(aggregate.priorityTurnCount ? { priorityTurnCount: aggregate.priorityTurnCount } : {}),
    ...(modelBreakdowns.length ? {
      modelBreakdowns,
      modelNames: modelBreakdowns.map((row) => row.model),
    } : {}),
    ...(serviceTierBreakdowns.length ? {
      serviceTierBreakdowns,
    } : {}),
    ...(dailyBreakdown.length ? {
      dailyBreakdown,
      historyDays: dailyBreakdown.length,
    } : {}),
  }
}

function tokenFileMetas(files) {
  const metas = []
  for (const file of files) {
    try {
      const stat = fs.statSync(file)
      metas.push({ file, mtimeMs: stat.mtimeMs, size: stat.size })
    } catch {
      /* file disappeared between listing and scan */
    }
  }
  return metas
}

function tokenScanSignature(metas, options = {}) {
  const priorityMeta = priorityTraceMeta(options)
  return [
    tokenHistoryDays(options.tokenHistoryDays),
    `${priorityMeta.databasePath}:${priorityMeta.mtimeMs}:${priorityMeta.size}`,
    ...metas.map((meta) => `${meta.file}:${meta.mtimeMs}:${meta.size}`),
  ].join('|')
}

function tokenPathSignature(metas, options = {}) {
  const priorityMeta = priorityTraceMeta(options)
  return [
    tokenHistoryDays(options.tokenHistoryDays),
    priorityMeta.databasePath,
    ...metas.map((meta) => meta.file),
  ].join('|')
}

function readTokenUsage(files = rolloutFiles(), options = {}) {
  const historyDays = tokenHistoryDays(options.tokenHistoryDays)
  const metas = tokenFileMetas(files)
  const pathSignature = tokenPathSignature(metas, options)
  if (
    !options.forceRefresh &&
    tokenScanCache.historyDays === historyDays &&
    tokenScanCache.pathSignature === pathSignature &&
    tokenScanCache.usage &&
    Date.now() - tokenScanCache.scannedAt < TOKEN_SCAN_CACHE_MS
  ) {
    return clone(tokenScanCache.usage)
  }

  const signature = tokenScanSignature(metas, options)
  if (
    !options.forceRefresh &&
    tokenScanCache.signature === signature &&
    tokenScanCache.usage &&
    Date.now() - tokenScanCache.scannedAt < TOKEN_SCAN_CACHE_MS
  ) {
    return clone(tokenScanCache.usage)
  }

  const usages = []
  const seenSessionIds = new Set()
  const sinceMs = tokenHistorySince(options.tokenHistoryDays)
  const priorityTurns = options.priorityTurns || codexPriorityTurns({ ...options, sinceMs })
  const inheritedTotalsResolver = options.inheritedTotalsResolver || makeInheritedTotalsResolver(metas.map((meta) => meta.file))
  let newest = null
  for (const meta of metas) {
    const file = meta.file
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const usage = parseCodexTokenUsage(text, { sinceMs, priorityTurns, inheritedTotalsResolver })
    if (!usage) continue
    if (usage.sessionId) {
      if (seenSessionIds.has(usage.sessionId)) continue
      seenSessionIds.add(usage.sessionId)
    }
    usages.push({
      ...usage,
      lastActive: meta.mtimeMs,
      sessionFile: path.basename(file),
    })
    newest = newest || path.basename(file)
  }
  const usage = aggregateTokenUsages(usages)
  if (!usage) return null
  const result = {
    ...usage,
    source: usages.length > 1 ? 'local Codex sessions' : 'local Codex session',
    sessionFile: newest,
    filesScanned: usages.length,
    sessionsScanned: seenSessionIds.size || null,
    historyDays: tokenHistoryDays(options.tokenHistoryDays),
  }
  tokenScanCache = { historyDays, pathSignature, signature, scannedAt: Date.now(), usage: clone(result) }
  return result
}

function resetTokenScanCacheForTesting() {
  tokenScanCache = { historyDays: null, pathSignature: null, signature: null, scannedAt: 0, usage: null }
}

// ── Idea generation (Codex/ChatGPT subscription) ─────────────────────────────
// Mirrors the Claude OAuth idea path: turn surplus subscription quota into burn
// ideas. Uses the same responses endpoint the Codex CLI uses.

// Auth candidates that carry an OAuth access token (API-key-only auth can't hit
// the ChatGPT-account responses endpoint).
function oauthAuthCandidates() {
  return authCandidates().filter((s) => s.auth?.tokens?.access_token)
}

// True when a usable Codex subscription token is on this machine.
function canGenerate() {
  return oauthAuthCandidates().length > 0
}

async function accessTokenFor(state) {
  let token = state.auth.tokens.access_token
  if (needsRefresh(state.auth)) token = (await refreshToken(state)) || token
  return token
}

// Accumulate the assistant text from a streamed Responses SSE body.
function parseResponsesSse(text) {
  let out = ''
  for (const line of String(text || '').split('\n')) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    try {
      const ev = JSON.parse(payload)
      if (ev.type === 'response.output_text.delta' && typeof ev.delta === 'string') out += ev.delta
    } catch {
      /* keepalive / non-JSON line */
    }
  }
  return out
}

function callResponses(token, accountId, prompt, options) {
  const headers = {
    Authorization: 'Bearer ' + token,
    'content-type': 'application/json',
    'OpenAI-Beta': 'responses=experimental',
    Accept: 'text/event-stream',
    originator: 'codex_cli_rs',
    'User-Agent': 'codex_cli_rs',
  }
  if (accountId) headers['ChatGPT-Account-Id'] = accountId
  const body = {
    model: options.model || GEN_MODEL,
    instructions: options.instructions || 'You return only the requested JSON. No prose, no code fences.',
    input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
    reasoning: { effort: options.reasoningEffort || 'low' },
    stream: true,
    store: false,
  }
  return fetchWithTimeout(RESPONSES_URL, { method: 'POST', headers, body: JSON.stringify(body) }, options.timeout || 30000)
}

// Generate raw assistant text from a Codex subscription token. Returns the text
// or throws (caller decides whether to fall back). Error messages are stable
// codes (codex-http-429, codex-empty, …) to match the Claude path.
async function generate(prompt, options = {}) {
  let lastError = new Error('no-codex-oauth')
  for (const state of oauthAuthCandidates()) {
    try {
      const accountId = state.auth.tokens.account_id
      const token = await accessTokenFor(state)
      let resp = await callResponses(token, accountId, prompt, options)
      if (resp.status === 401 || resp.status === 403) {
        const refreshed = await refreshToken(state)
        if (refreshed) resp = await callResponses(refreshed, accountId, prompt, options)
      }
      if (!resp.ok) {
        const err = new Error(`codex-http-${resp.status}`)
        err.body = (await resp.text().catch(() => '')).slice(0, 200)
        throw err
      }
      const text = parseResponsesSse(await resp.text())
      if (!text.trim()) throw new Error('codex-empty')
      return text
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

async function read(options = {}) {
  try {
    const live = await readLive()
    // Heavy: scanning the rollout files for token history only on heavy pulls.
    if (options.skipTokenHistory) {
      if (live.windows.length) return live
    } else {
      const files = rolloutFiles({ limit: Infinity, sinceMs: tokenHistorySince(options.tokenHistoryDays) })
      const tokenUsage = readTokenUsage(files, options)
      if (live.windows.length) return tokenUsage ? { ...live, tokenUsage } : live
    }
  } catch (error) {
    const local = readLocal(options)
    if (local.connected) {
      return {
        ...local,
        extra: [{ label: 'Source', value: 'local fallback' }],
        error: error.message || 'Live Codex usage unavailable.',
      }
    }
    return { connected: false, error: error.message || 'Codex usage unavailable.' }
  }
  return readLocal(options)
}

module.exports = {
  read,
  generate,
  canGenerate,
  _private: {
    parseResponsesSse,
    aggregateTokenUsages,
    codexPriorityTurns,
    parseCodexTokenUsage,
    parseCodexCompletedTraceRow,
    parseCodexPriorityTraceRow,
    parseCodexTokenSnapshots,
    priorityTraceMeta,
    makeInheritedTotalsResolver,
    additionalCodexWindows,
    codexWindowsFromRateLimit,
    creditsExtra,
    parseLiveUsage,
    readTokenUsage,
    resetTokenScanCacheForTesting,
    rolloutFiles,
    sessionMetadataFromRow,
    sessionMetadataFromFile,
    tokenFileMetas,
    tokenHistoryDays,
    tokenHistorySince,
    tokenPathSignature,
    tokenScanSignature,
  },
}
