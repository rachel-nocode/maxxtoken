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
const REFRESH_AGE_MS = 8 * 24 * 60 * 60 * 1000
const PERIOD_SESSION_MS = 5 * 60 * 60 * 1000
const PERIOD_WEEKLY_MS = 7 * 24 * 60 * 60 * 1000

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

function numberHeader(headers, key) {
  const raw = headers.get(key)
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function resetAt(window) {
  if (!window) return null
  if (typeof window.reset_at === 'number') return window.reset_at * 1000
  if (typeof window.reset_after_seconds === 'number') {
    return Date.now() + window.reset_after_seconds * 1000
  }
  return null
}

function windowFrom(label, kind, usedPct, window, fallbackPeriodMs) {
  return {
    label,
    kind,
    usedPct: Math.round(Math.max(0, Math.min(100, usedPct || 0))),
    resetAt: resetAt(window),
    periodMs: typeof window?.limit_window_seconds === 'number'
      ? window.limit_window_seconds * 1000
      : fallbackPeriodMs,
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

  const data = await resp.json()
  const rateLimit = data.rate_limit || {}
  const primaryWindow = rateLimit.primary_window || null
  const secondaryWindow = rateLimit.secondary_window || null
  const primaryUsed =
    numberHeader(resp.headers, 'x-codex-primary-used-percent') ??
    (typeof primaryWindow?.used_percent === 'number' ? primaryWindow.used_percent : null)
  const secondaryUsed =
    numberHeader(resp.headers, 'x-codex-secondary-used-percent') ??
    (typeof secondaryWindow?.used_percent === 'number' ? secondaryWindow.used_percent : null)
  const windows = []

  if (primaryUsed != null) {
    windows.push(windowFrom('Session', '5h', primaryUsed, primaryWindow, PERIOD_SESSION_MS))
  }
  if (secondaryUsed != null) {
    windows.push(windowFrom('Weekly', '7d', secondaryUsed, secondaryWindow, PERIOD_WEEKLY_MS))
  }

  return {
    connected: true,
    planType: planLabel(data.plan_type) || data.plan_type || null,
    lastActive: Date.now(),
    windows,
    extra: [{ label: 'Source', value: 'live Codex usage' }],
  }
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
function rolloutFiles(limit = 8) {
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
        found.push({ full, mtime: fs.statSync(full).mtimeMs })
      }
    }
  }
  walk(SESSIONS)
  return found
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map((f) => f.full)
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

function readLocal() {
  const files = rolloutFiles()
  if (!files.length) return { connected: false }

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
  if (!rl) return { connected: false }

  const toMs = (s) => (s ? s * 1000 : null)
  const result = {
    connected: true,
    planType: rl.plan_type || null,
    lastActive: mtime,
    windows: [],
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
  return result
}

async function read() {
  try {
    const live = await readLive()
    if (live.windows.length) return live
  } catch (error) {
    const local = readLocal()
    if (local.connected) {
      return {
        ...local,
        extra: [{ label: 'Source', value: 'local fallback' }],
        error: error.message || 'Live Codex usage unavailable.',
      }
    }
    return { connected: false, error: error.message || 'Codex usage unavailable.' }
  }
  return readLocal()
}

module.exports = { read }
