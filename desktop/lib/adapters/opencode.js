const crypto = require('crypto')
const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const BASE = 'https://opencode.ai'
const SERVER_URL = `${BASE}/_server`
const WORKSPACES_ID = 'def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f'
const SUBSCRIPTION_ID = '7abeebee372f304e050aaaf92be863f4a86490e382f8c79db68fd94040d691b4'
const COOKIE_NAMES = new Set(['auth', '__Host-auth'])
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'

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
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function clampPct(value) {
  const n = num(value)
  if (n == null) return null
  return Math.max(0, Math.min(100, n <= 1 && n >= 0 ? n * 100 : n))
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

function serverURL(serverID, args, method) {
  if (method !== 'GET') return SERVER_URL
  const url = new URL(SERVER_URL)
  url.searchParams.set('id', serverID)
  if (args && args.length) url.searchParams.set('args', JSON.stringify(args))
  return url.toString()
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
      body: method === 'GET' ? undefined : JSON.stringify(args || []),
    },
    timeout,
  )
  const text = await res.text()
  if (looksSignedOut(text) || res.status === 401 || res.status === 403) {
    throw new Error('OpenCode session cookie is invalid or expired.')
  }
  if (!res.ok) throw new Error(`OpenCode HTTP ${res.status}`)
  return text
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
  const rollingWindow = parseWindow(rolling, now)
  const weeklyWindow = parseWindow(weekly, now)
  if (rollingWindow && weeklyWindow) return { rolling: rollingWindow, weekly: weeklyWindow }

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

  const rolling =
    out
      .filter((candidate) => /rolling|hour|5h|5-hour/.test(candidate.path))
      .sort((a, b) => a.resetInSec - b.resetInSec)[0] || out.sort((a, b) => a.resetInSec - b.resetInSec)[0]
  const weekly =
    out
      .filter((candidate) => candidate !== rolling && /weekly|week/.test(candidate.path))
      .sort((a, b) => b.resetInSec - a.resetInSec)[0] ||
    out.filter((candidate) => candidate !== rolling).sort((a, b) => b.resetInSec - a.resetInSec)[0]
  return rolling && weekly ? { rolling, weekly } : null
}

function parseSubscription(text, now = Date.now()) {
  const trimmed = String(text || '').trim()
  if (!trimmed || trimmed.toLowerCase() === 'null') throw new Error('Missing OpenCode subscription data.')

  let windows = null
  try {
    windows = parseUsageDict(JSON.parse(trimmed), now)
  } catch {
    const rollingPercent = String(text || '').match(/rollingUsage[^}]*?usagePercent\s*:\s*([0-9]+(?:\.[0-9]+)?)/)
    const rollingReset = String(text || '').match(/rollingUsage[^}]*?resetInSec\s*:\s*([0-9]+)/)
    const weeklyPercent = String(text || '').match(/weeklyUsage[^}]*?usagePercent\s*:\s*([0-9]+(?:\.[0-9]+)?)/)
    const weeklyReset = String(text || '').match(/weeklyUsage[^}]*?resetInSec\s*:\s*([0-9]+)/)
    if (rollingPercent && rollingReset && weeklyPercent && weeklyReset) {
      windows = {
        rolling: { usedPct: clampPct(rollingPercent[1]), resetInSec: Number(rollingReset[1]) },
        weekly: { usedPct: clampPct(weeklyPercent[1]), resetInSec: Number(weeklyReset[1]) },
      }
    }
  }
  if (!windows) throw new Error('Missing OpenCode usage fields.')

  return {
    connected: true,
    rolling: {
      usedPct: windows.rolling.usedPct,
      resetAt: now + windows.rolling.resetInSec * 1000,
      resetInSec: windows.rolling.resetInSec,
    },
    weekly: {
      usedPct: windows.weekly.usedPct,
      resetAt: now + windows.weekly.resetInSec * 1000,
      resetInSec: windows.weekly.resetInSec,
    },
    lastActive: now,
  }
}

async function fetchWorkspaceID(cookie) {
  let text = await fetchServerText({ serverID: WORKSPACES_ID, method: 'GET' }, cookie)
  let ids = parseWorkspaceIDs(text)
  if (!ids.length) {
    text = await fetchServerText({ serverID: WORKSPACES_ID, args: [], method: 'POST' }, cookie)
    ids = parseWorkspaceIDs(text)
  }
  if (!ids.length) throw new Error('Missing OpenCode workspace id.')
  return ids[0]
}

async function read() {
  const cookie = cookieHeader(getKey('opencode'))
  if (!cookie) return { connected: false, needsKey: true }

  try {
    const workspaceID = await fetchWorkspaceID(cookie)
    let text = await fetchServerText(
      {
        serverID: SUBSCRIPTION_ID,
        args: [workspaceID],
        method: 'GET',
        referer: `${BASE}/workspace/${workspaceID}/billing`,
      },
      cookie,
    )
    try {
      return { ...(parseSubscription(text) || {}), workspaceID }
    } catch {
      text = await fetchServerText(
        {
          serverID: SUBSCRIPTION_ID,
          args: [workspaceID],
          method: 'POST',
          referer: `${BASE}/workspace/${workspaceID}/billing`,
        },
        cookie,
      )
    }
    return { ...(parseSubscription(text) || {}), workspaceID }
  } catch (err) {
    return { connected: false, needsKey: true, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    cookieHeader,
    normalizeWorkspaceID,
    parseWorkspaceIDs,
    parseSubscription,
    parseWindow,
  },
}
