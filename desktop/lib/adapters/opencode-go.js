const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')
const { readCookieHeader } = require('../browser-cookies')

const COOKIE_HOSTS = ['opencode.ai']

const BASE = 'https://opencode.ai'
const SERVER_URL = `${BASE}/_server`
const MODELS_URL = `${BASE}/zen/go/v1/models`
const WORKSPACES_ID = 'def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f'
const COOKIE_NAMES = new Set(['auth', '__Host-auth'])
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'

const LIMITS = {
  rolling: 12,
  weekly: 30,
  monthly: 60,
}
const DAY = 86400000
const WEEK = 7 * DAY
const FIFTH = 5 * 3600 * 1000

const PERCENT_KEYS = [
  'usagePercent',
  'usedPercent',
  'percentUsed',
  'percent',
  'usage_percent',
  'used_percent',
  'utilization',
  'utilizationPercent',
  'utilization_percent',
  'usage',
]
const RESET_IN_KEYS = [
  'resetInSec',
  'resetInSeconds',
  'resetSeconds',
  'reset_sec',
  'reset_in_sec',
  'resetsInSec',
  'resetsInSeconds',
  'resetIn',
  'resetSec',
]
const RESET_AT_KEYS = ['resetAt', 'resetsAt', 'reset_at', 'resets_at', 'nextReset', 'next_reset', 'renewAt', 'renew_at']

function num(value) {
  if (value == null || value === '') return null
  const text = String(value).trim()
  const n = Number(text.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function clampPct(value) {
  const n = num(value)
  if (n == null) return null
  return Math.max(0, Math.min(100, n <= 1 && n >= 0 ? n * 100 : n))
}

function localDbCandidates(home = os.homedir(), env = process.env) {
  const xdg = env.XDG_DATA_HOME || path.join(home, '.local', 'share')
  return [
    env.OPENCODE_DB,
    env.OPENCODE_DB_PATH,
    env.XDG_DATA_HOME ? path.join(xdg, 'opencode', 'opencode.db') : null,
    path.join(home, '.local', 'share', 'opencode', 'opencode.db'),
    path.join(home, '.config', 'opencode', 'opencode.db'),
    path.join(home, 'Library', 'Application Support', 'opencode', 'opencode.db'),
  ].filter(Boolean)
}

function hasAllColumns(columns = [], names = []) {
  const set = new Set(columns.map((name) => String(name || '').toLowerCase()))
  return names.find((name) => set.has(name.toLowerCase())) || null
}

function candidateTableNames() {
  return ['messages', 'message', 'events', 'requests', 'history']
}

function listTables(dbPath, execImpl = execFileSync) {
  const out = execImpl('sqlite3', ['-readonly', '-json', `file:${dbPath}?mode=ro`, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const text = String(out).trim()
  if (!text) return []
  const rows = JSON.parse(text)
  return Array.isArray(rows) ? rows.map((row) => row.name).filter(Boolean) : []
}

function listColumns(dbPath, table, execImpl = execFileSync) {
  const out = execImpl('sqlite3', ['-readonly', '-json', `file:${dbPath}?mode=ro`, `PRAGMA table_info("${table}")`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const text = String(out).trim()
  if (!text) return []
  const rows = JSON.parse(text)
  return Array.isArray(rows) ? rows.map((row) => row.name).filter(Boolean) : []
}

function chooseUsageTable(dbPath, execImpl = execFileSync) {
  const tables = listTables(dbPath, execImpl)
  if (!tables.length) return null

  const providerCandidates = ['providerid', 'provider_id', 'providerId', 'provider']
  const roleCandidates = ['role']
  const tsCandidates = ['createdat', 'created_at', 'created', 'timestamp', 'ts']
  const costCandidates = ['cost', 'spent', 'amount', 'totalcost', 'total_cost']

  const priority = candidateTableNames()
  const ordered = [
    ...priority.filter((name) => tables.includes(name)),
    ...tables.filter((name) => !priority.includes(name)),
  ]

  for (const table of ordered) {
    const columns = listColumns(dbPath, table, execImpl)
    const providerCol = hasAllColumns(columns, providerCandidates)
    const tsCol = hasAllColumns(columns, tsCandidates)
    const costCol = hasAllColumns(columns, costCandidates)
    if (!providerCol || !tsCol || !costCol) continue
    const roleCol = hasAllColumns(columns, roleCandidates)
    return { table, providerCol, tsCol, costCol, roleCol }
  }
  return null
}

function sqliteRows(dbPath, query, execImpl = execFileSync) {
  const out = execImpl('sqlite3', ['-readonly', '-json', `file:${dbPath}?mode=ro`, query], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const text = String(out).trim()
  if (!text) return []
  return JSON.parse(text)
}

function parseTimestamp(value) {
  const n = num(value)
  if (n != null) {
    if (n > 1_000_000_000_000) return n
    if (n > 1_000_000_000) return n * 1000
  }
  const ms = Date.parse(String(value || ''))
  return Number.isFinite(ms) ? ms : null
}

function sumRows(rows, startMs, now) {
  return rows.reduce((acc, row) => {
    const ts = parseTimestamp(row.ts)
    if (ts == null || ts < startMs || ts > now) return acc
    const cost = num(row.cost)
    if (cost == null || cost < 0 || !Number.isFinite(cost)) return acc
    return acc + cost
  }, 0)
}

function usageWindowsFromRows(rows, now = Date.now()) {
  if (!Array.isArray(rows) || !rows.length) {
    return {
      connected: false,
      needsKey: false,
      usageSource: 'local db',
      error: 'No OpenCode Go usage rows in local opencode.db.',
    }
  }

  const nowMs = Number(now) || Date.now()
  const rollingStart = nowMs - FIFTH

  const nowDate = new Date(nowMs)
  const dayStart = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate())
  const mondayOffset = (nowDate.getUTCDay() + 6) % 7
  const weeklyStart = dayStart - mondayOffset * DAY

  const firstOfMonth = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1)
  const monthEnd = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() + 1, 1)

  const parsedRows = rows
    .map((row) => ({
      ts: parseTimestamp(row.ts),
      cost: num(row.cost),
    }))
    .filter((entry) => entry.ts != null && entry.cost != null && entry.cost >= 0)

  if (!parsedRows.length) {
    return {
      connected: false,
      needsKey: false,
      usageSource: 'local db',
      error: 'No numeric OpenCode Go costs in local opencode.db.',
    }
  }

  const rolling = sumRows(parsedRows, rollingStart, nowMs)
  const weekly = sumRows(parsedRows, weeklyStart, nowMs)
  const monthly = sumRows(parsedRows, firstOfMonth, nowMs)
  const lastActive = parsedRows.reduce((best, row) => Math.max(best, row.ts), 0)
  const toWindow = (used, limit, resetAt) => ({
    usedPct: clampPct((used / limit) * 100),
    resetAt,
    resetInSec: Math.max(0, Math.round((resetAt - nowMs) / 1000)),
  })

  return {
    connected: true,
    rolling: toWindow(rolling, LIMITS.rolling, nowMs + FIFTH),
    weekly: toWindow(weekly, LIMITS.weekly, weeklyStart + WEEK),
    monthly: toWindow(monthly, LIMITS.monthly, monthEnd),
    lastActive,
    usageSource: 'local db',
  }
}

function readLocalUsageFromDb(options = {}) {
  const home = options.home || os.homedir()
  const env = options.env || process.env
  const dbPath = (options.localDbPath || localDbCandidates(home, env).find((file) => fs.existsSync(file))) || null
  if (!dbPath) return null

  const execImpl = options.execFileSync || execFileSync
  try {
    const target = chooseUsageTable(dbPath, execImpl)
    if (!target) return null
    const where = [`"${target.providerCol}" = 'opencode-go'`]
    if (target.roleCol) where.push(`"${target.roleCol}" = 'assistant'`)
    const query = `SELECT "${target.tsCol}" AS ts, "${target.costCol}" AS cost FROM "${target.table}" WHERE ${where.join(' AND ')}`
    const rows = sqliteRows(dbPath, query, execImpl)
    return usageWindowsFromRows(rows, options.now || Date.now())
  } catch {
    return null
  }
}

function cookieHeader(raw) {
  const text = String(raw || '')
    .replace(/^Cookie:\s*/i, '')
    .trim()
  if (!text) return null
  const pairs = []
  for (const part of text.split(';')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const name = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (COOKIE_NAMES.has(name) && value) pairs.push(`${name}=${value}`)
  }
  return pairs.length ? pairs.join('; ') : null
}

function normalizeWorkspaceID(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  if (text.startsWith('wrk_') && text.length > 4) return text
  const match = text.match(/wrk_[A-Za-z0-9]+/)
  return match ? match[0] : null
}

function authFileCandidates(home = os.homedir(), env = process.env) {
  return [
    env.OPENCODE_GO_AUTH_FILE || env.OPENCODE_AUTH_FILE || null,
    env.XDG_DATA_HOME ? path.join(env.XDG_DATA_HOME, 'opencode', 'auth.json') : null,
    path.join(home, '.local', 'share', 'opencode', 'auth.json'),
    path.join(home, 'Library', 'Application Support', 'opencode', 'auth.json'),
  ].filter(Boolean)
}

function configFileCandidates(home = os.homedir(), env = process.env) {
  const xdg = env.XDG_CONFIG_HOME || path.join(home, '.config')
  return [
    env.OPENCODE_GO_CONFIG_FILE || null,
    path.join(xdg, 'opencode-bar', 'opencode-go.json'),
    path.join(xdg, 'opencode-quota', 'opencode-go.json'),
    path.join(home, 'Library', 'Application Support', 'opencode-bar', 'opencode-go.json'),
    path.join(home, 'Library', 'Application Support', 'opencode-quota', 'opencode-go.json'),
  ].filter(Boolean)
}

function readJsonFile(file, fsImpl = fs) {
  try {
    return JSON.parse(fsImpl.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function resolveApiKey(options = {}) {
  const env = options.env || process.env
  const direct = clean(env.OPENCODE_GO_API_KEY || env.OPENCODE_API_KEY)
  if (direct) return { key: direct, source: 'environment' }

  const fsImpl = options.fs || fs
  for (const file of authFileCandidates(options.home, env)) {
    const json = readJsonFile(file, fsImpl)
    const key = clean(json && json['opencode-go'] && json['opencode-go'].key)
    if (key) return { key, source: file }
  }
  return null
}

function clean(value) {
  const text = String(value || '').trim()
  return text || null
}

function dashboardCookieHeader(raw) {
  const text = String(raw || '').replace(/^Cookie:\s*/i, '').trim()
  if (!text) return null
  if (!text.includes('=')) return `auth=${text}`
  return cookieHeader(text)
}

function readDashboardConfig(options = {}) {
  const env = options.env || process.env
  const envWorkspace = normalizeWorkspaceID(env.OPENCODE_GO_WORKSPACE_ID)
  const envCookie = dashboardCookieHeader(env.OPENCODE_GO_AUTH_COOKIE)
  if (envWorkspace && envCookie) return { workspaceID: envWorkspace, cookie: envCookie, source: 'environment' }

  const fsImpl = options.fs || fs
  for (const file of configFileCandidates(options.home, env)) {
    const json = readJsonFile(file, fsImpl)
    const workspaceID = normalizeWorkspaceID(json && (json.workspaceId || json.workspaceID || json.workspace_id))
    const cookie = dashboardCookieHeader(json && (json.authCookie || json.auth_cookie || json.cookie))
    if (workspaceID && cookie) return { workspaceID, cookie, source: file }
  }
  return null
}

function serverURL(serverID, args, method) {
  if (method !== 'GET') return SERVER_URL
  const url = new URL(SERVER_URL)
  url.searchParams.set('id', serverID)
  if (args) url.searchParams.set('args', args)
  return url.toString()
}

function looksSignedOut(text) {
  const lower = String(text || '').toLowerCase()
  return (
    lower.includes('login') ||
    lower.includes('sign in') ||
    lower.includes('auth/authorize') ||
    lower.includes('not associated with an account') ||
    lower.includes('actor of type "public"')
  )
}

async function fetchServerText({ serverID, args = null, method = 'GET', referer = BASE }, cookie, timeout = 15000) {
  const res = await fetchWithTimeout(
    serverURL(serverID, args, method),
    {
      method,
      headers: {
        Cookie: cookie,
        'X-Server-Id': serverID,
        'X-Server-Instance': `server-fn:${crypto.randomUUID()}`,
        'User-Agent': USER_AGENT,
        Origin: BASE,
        Referer: referer,
        Accept: 'text/javascript, application/json;q=0.9, */*;q=0.8',
        ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
      },
      body: method === 'GET' ? undefined : args || '[]',
      redirect: 'manual',
    },
    timeout,
  )
  const text = await res.text()
  if (looksSignedOut(text) || res.status === 401 || res.status === 403) {
    throw new Error('OpenCode Go session cookie is invalid or expired.')
  }
  if (!res.ok) throw new Error(`OpenCode Go HTTP ${res.status}`)
  return text
}

async function fetchPageText(url, cookie, timeout = 15000) {
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        Cookie: cookie,
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'manual',
    },
    timeout,
  )
  const text = await res.text()
  if (looksSignedOut(text) || res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
    throw new Error('OpenCode Go session cookie is invalid or expired.')
  }
  if (!res.ok) throw new Error(`OpenCode Go HTTP ${res.status}`)
  return text
}

async function validateApiKey(apiKey, timeout = 10000) {
  if (!apiKey) return null
  const res = await fetchWithTimeout(
    MODELS_URL,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      redirect: 'manual',
    },
    timeout,
  )
  const text = await res.text()
  if (res.status === 401 || res.status === 403) throw new Error('OpenCode Go API key is invalid or expired.')
  if (!res.ok) throw new Error(`OpenCode Go models HTTP ${res.status}`)
  try {
    const json = JSON.parse(text)
    const models = json.data || json.models || []
    return { modelCount: Array.isArray(models) ? models.length : null }
  } catch {
    return { modelCount: null }
  }
}

function parseWorkspaceIDs(text) {
  const ids = new Set()
  for (const match of String(text || '').matchAll(/id\s*:\s*"([^"]+)"/g)) {
    if (match[1].startsWith('wrk_')) ids.add(match[1])
  }
  try {
    collectWorkspaceIDs(JSON.parse(text), ids)
  } catch {
    /* server-functions may return JS-ish text */
  }
  return [...ids]
}

function collectWorkspaceIDs(value, ids) {
  if (Array.isArray(value)) {
    for (const item of value) collectWorkspaceIDs(item, ids)
    return
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectWorkspaceIDs(item, ids)
    return
  }
  if (typeof value === 'string' && value.startsWith('wrk_')) ids.add(value)
}

function valueFor(dict, keys) {
  for (const key of keys) {
    if (Object.hasOwn(dict, key)) return dict[key]
  }
  return null
}

function parseDate(value, now) {
  const n = num(value)
  if (n != null) {
    if (n > 1_000_000_000_000) return n
    if (n > 1_000_000_000) return n * 1000
  }
  const ms = Date.parse(String(value || ''))
  return Number.isFinite(ms) ? ms : null
}

function parseWindow(dict, now) {
  if (!dict || typeof dict !== 'object' || Array.isArray(dict)) return null
  let usedPct = clampPct(valueFor(dict, PERCENT_KEYS))
  if (usedPct == null) {
    const used = num(valueFor(dict, ['used', 'usage', 'consumed', 'count', 'usedTokens']))
    const limit = num(valueFor(dict, ['limit', 'total', 'quota', 'max', 'cap', 'tokenLimit']))
    if (used != null && limit > 0) usedPct = clampPct((used / limit) * 100)
  }
  if (usedPct == null) return null

  let resetInSec = num(valueFor(dict, RESET_IN_KEYS))
  if (resetInSec == null) {
    const resetAt = parseDate(valueFor(dict, RESET_AT_KEYS), now)
    if (resetAt != null) resetInSec = Math.max(0, Math.round((resetAt - now) / 1000))
  }
  return { usedPct, resetInSec: Math.max(0, Math.round(resetInSec || 0)) }
}

function parseUsageDict(dict, now) {
  if (!dict || typeof dict !== 'object' || Array.isArray(dict)) return null
  if (dict.usage && typeof dict.usage === 'object') {
    const nested = parseUsageDict(dict.usage, now)
    if (nested) return nested
  }

  const rolling = dict.rollingUsage || dict.rolling || dict.rolling_usage || dict.rollingWindow || dict.rolling_window
  const weekly = dict.weeklyUsage || dict.weekly || dict.weekly_usage || dict.weeklyWindow || dict.weekly_window
  const monthly = dict.monthlyUsage || dict.monthly || dict.monthly_usage || dict.monthlyWindow || dict.monthly_window
  const rollingWindow = parseWindow(rolling, now)
  const weeklyWindow = parseWindow(weekly, now)
  if (rollingWindow && weeklyWindow) {
    return {
      rolling: rollingWindow,
      weekly: weeklyWindow,
      monthly: parseWindow(monthly, now),
    }
  }

  for (const key of ['data', 'result', 'billing', 'payload']) {
    const found = parseUsageDict(dict[key], now)
    if (found) return found
  }
  return parseNestedCandidates(dict, now)
}

function parseNestedCandidates(value, now, path = [], out = []) {
  if (path.length > 5) return null
  if (Array.isArray(value)) {
    value.forEach((item, index) => parseNestedCandidates(item, now, path.concat(`[${index}]`), out))
  } else if (value && typeof value === 'object') {
    const window = parseWindow(value, now)
    if (window) out.push({ ...window, path: path.join('.').toLowerCase() })
    for (const [key, item] of Object.entries(value)) parseNestedCandidates(item, now, path.concat(key), out)
  }
  if (path.length) return null

  const byShortest = (a, b) => a.resetInSec - b.resetInSec || b.usedPct - a.usedPct
  const byLongest = (a, b) => b.resetInSec - a.resetInSec || b.usedPct - a.usedPct
  const rolling =
    out.filter((candidate) => /rolling|hour|5h|5-hour/.test(candidate.path)).sort(byShortest)[0] || out.sort(byShortest)[0]
  const weekly = out.filter((candidate) => candidate !== rolling && /weekly|week/.test(candidate.path)).sort(byLongest)[0]
  const monthly = out.filter((candidate) => candidate !== rolling && candidate !== weekly && /monthly|month/.test(candidate.path)).sort(byLongest)[0]
  return rolling && weekly ? { rolling, weekly, monthly: monthly || null } : null
}

// OpenCode streams the live usage objects to the page as React Server Component
// assignments, e.g. `rollingUsage:$R[34]={status:"ok",resetInSec:..,usagePercent:99}`.
// The plainly-rendered `usagePercent:0` elsewhere on the page is a pre-hydration
// placeholder — reading it is why usage showed 0 / mis-rounded. We read the $R
// assignment (the real integer opencode reports), matching the opencode-go-usage
// plugin and opencode.ai itself.
function parseRscUsageWindows(text) {
  const grab = (kind) => {
    const m = String(text || '').match(new RegExp(`${kind}Usage:\\$R\\[\\d+\\]=(\\{[^}]+\\})`))
    if (!m) return null
    try {
      const obj = JSON.parse(m[1].replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3'))
      const usedPct = clampPct(obj.usagePercent)
      if (usedPct == null) return null
      return { usedPct, resetInSec: Math.max(0, Math.round(Number(obj.resetInSec) || 0)) }
    } catch {
      return null
    }
  }
  const rolling = grab('rolling')
  const weekly = grab('weekly')
  const monthly = grab('monthly')
  return rolling || weekly ? { rolling, weekly, monthly } : null
}

function parseSubscription(text, now = Date.now()) {
  let windows = parseRscUsageWindows(text)
  try {
    if (!windows) windows = parseUsageDict(JSON.parse(text), now)
  } catch {
    const raw = String(text || '')
    const rollingPercent = raw.match(/rollingUsage[^}]*?usagePercent\s*:\s*([0-9]+(?:\.[0-9]+)?)/)
    const rollingReset = raw.match(/rollingUsage[^}]*?resetInSec\s*:\s*([0-9]+)/)
    const weeklyPercent = raw.match(/weeklyUsage[^}]*?usagePercent\s*:\s*([0-9]+(?:\.[0-9]+)?)/)
    const weeklyReset = raw.match(/weeklyUsage[^}]*?resetInSec\s*:\s*([0-9]+)/)
    const monthlyPercent = raw.match(/monthlyUsage[^}]*?usagePercent\s*:\s*([0-9]+(?:\.[0-9]+)?)/)
    const monthlyReset = raw.match(/monthlyUsage[^}]*?resetInSec\s*:\s*([0-9]+)/)
    if (rollingPercent && rollingReset && weeklyPercent && weeklyReset) {
      windows = {
        rolling: { usedPct: clampPct(rollingPercent[1]), resetInSec: Number(rollingReset[1]) },
        weekly: { usedPct: clampPct(weeklyPercent[1]), resetInSec: Number(weeklyReset[1]) },
        monthly:
          monthlyPercent || monthlyReset
            ? { usedPct: clampPct(monthlyPercent && monthlyPercent[1]) || 0, resetInSec: Number((monthlyReset && monthlyReset[1]) || 0) }
            : null,
      }
    }
  }
  if (!windows) throw new Error('Missing OpenCode Go usage fields.')

  const windowResult = (window) =>
    window
      ? {
          usedPct: window.usedPct,
          resetAt: now + window.resetInSec * 1000,
          resetInSec: window.resetInSec,
        }
      : null

  return {
    connected: true,
    rolling: windowResult(windows.rolling),
    weekly: windowResult(windows.weekly),
    monthly: windowResult(windows.monthly),
    zenBalanceUSD: parseZenBalance(text),
    lastActive: now,
  }
}

function parseZenBalance(text) {
  try {
    const found = findBalanceValue(JSON.parse(text))
    if (found != null) return found
  } catch {
    /* page HTML fallback below */
  }
  const raw = String(text || '')
  const localized = raw.match(/(?:current\s+balance|zen\s+balance|現在の残高)[^$]{0,80}\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i)
  if (localized) return num(localized[1])
  const nearby = raw.match(/(?:balance|残高)[\s\S]{0,120}?\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i)
  return nearby ? num(nearby[1]) : null
}

function findBalanceValue(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBalanceValue(item)
      if (found != null) return found
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (['zenbalance', 'zencurrentbalance', 'currentbalance', 'currentbalanceusd', 'balanceusd', 'usdbalance'].includes(normalized)) {
        const n = num(item)
        if (n != null) return n
      }
      const found = findBalanceValue(item)
      if (found != null) return found
    }
  }
  return null
}

async function fetchWorkspaceID(cookie) {
  let text = await fetchServerText({ serverID: WORKSPACES_ID, method: 'GET' }, cookie)
  let ids = parseWorkspaceIDs(text)
  if (!ids.length) {
    text = await fetchServerText({ serverID: WORKSPACES_ID, args: '[]', method: 'POST' }, cookie)
    ids = parseWorkspaceIDs(text)
  }
  if (!ids.length) throw new Error('Missing OpenCode Go workspace id.')
  return ids[0]
}

// saved paste -> env -> local browser session (zero-paste). The browser header
// is filtered by cookieHeader() down to the auth/__Host-auth cookies the API needs.
function resolveCookie(options = {}) {
  const saved = cookieHeader(options.savedKey ?? getKey('opencodego'))
  if (saved) return saved
  const legacySaved = cookieHeader(getKey('opencode'))
  if (legacySaved) return legacySaved
  const env = cookieHeader(process.env.OPENCODE_COOKIE || process.env.OPENCODE_GO_COOKIE)
  if (env) return env
  const browser = cookieHeader(readCookieHeader({
    hosts: COOKIE_HOSTS,
    cookieNames: [...COOKIE_NAMES],
    home: options.home,
    files: options.browserCookieFiles,
  }))
  return browser || null
}

function resolveDashboardCredentials(options = {}) {
  const configured = readDashboardConfig(options)
  if (configured) return configured
  const cookie = resolveCookie(options)
  return cookie ? { cookie, workspaceID: null, source: 'browser/session' } : null
}

async function read(options = {}) {
  const local = readLocalUsageFromDb(options)
  if (local) return { ...local, apiKeySource: null }

  const apiKey = resolveApiKey(options)
  const dashboard = resolveDashboardCredentials(options)
  if (!dashboard?.cookie) {
    if (apiKey?.key) {
      try {
        await validateApiKey(apiKey.key, options.timeout || 10000)
      } catch (err) {
        return { connected: false, needsKey: true, error: err && err.message ? err.message : String(err), apiKeySource: apiKey.source }
      }
      return {
        connected: false,
        needsKey: false,
        error: 'OpenCode Go usage needs a dashboard login, OPENCODE_GO_WORKSPACE_ID plus OPENCODE_GO_AUTH_COOKIE, or ~/.config/opencode-bar/opencode-go.json.',
        apiKeySource: apiKey.source,
      }
    }
    return { connected: false, needsKey: true }
  }

  try {
    const workspaceID = dashboard.workspaceID || await fetchWorkspaceID(dashboard.cookie)
    const usagePage = await fetchPageText(`${BASE}/workspace/${workspaceID}/go`, dashboard.cookie)
    const usage = parseSubscription(usagePage)
    const zenBalanceUSD = usage.zenBalanceUSD ?? parseZenBalance(await fetchPageText(`${BASE}/workspace/${workspaceID}`, dashboard.cookie, 5000))
    return { ...usage, zenBalanceUSD, workspaceID, apiKeySource: apiKey?.source || null, usageSource: dashboard.source }
  } catch (err) {
    return { connected: false, needsKey: !apiKey?.key, error: err && err.message ? err.message : String(err), apiKeySource: apiKey?.source || null }
  }
}

module.exports = {
  read,
  _private: {
    localDbCandidates,
    readLocalUsageFromDb,
    cookieHeader,
    resolveCookie,
    resolveApiKey,
    resolveDashboardCredentials,
    authFileCandidates,
    configFileCandidates,
    dashboardCookieHeader,
    normalizeWorkspaceID,
    parseWorkspaceIDs,
    parseSubscription,
    parseRscUsageWindows,
    parseWindow,
    parseZenBalance,
  },
}
