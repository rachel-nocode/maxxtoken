const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const ENDPOINT = 'https://api.manus.im/user.v1.UserService/GetAvailableCredits'
const COOKIE_NAME = 'session_id'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function number(value) {
  if (value == null || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function clampPct(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function timestamp(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function cookiePairs(raw) {
  let text = clean(raw)
  if (!text) return []
  const cookieFlag = text.match(/(?:--cookie|-b)\s+(['"])(.*?)\1/i)
  if (cookieFlag) text = cookieFlag[2]
  const header = text.match(/(?:-H\s+)?(['"])?cookie\s*:\s*([^'"\n\r]+)\1?/i)
  if (header) text = header[2]
  text = text.replace(/^cookie\s*:/i, '').trim()
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

function sessionToken(raw) {
  const text = clean(raw)
  if (!text) return null
  if (!text.includes('=') && !text.includes(';') && !/\s/.test(text)) return text
  const match = cookiePairs(text).find((pair) => pair.name.toLowerCase() === COOKIE_NAME)
  return clean(match && match.value)
}

function parseSaved(raw) {
  const text = clean(raw)
  if (!text) return null
  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text)
      return sessionToken(json.sessionToken || json.session_token || json.sessionID || json.session_id || json.cookieHeader || json.cookie)
    } catch {
      /* fall through */
    }
  }
  return sessionToken(text)
}

function cookieHeader(token) {
  return `${COOKIE_NAME}=${token}`
}

function browserCookieFiles(home = os.homedir()) {
  const roots = [
    path.join(home, 'Library/Application Support/Google/Chrome'),
    path.join(home, 'Library/Application Support/BraveSoftware/Brave-Browser'),
    path.join(home, 'Library/Application Support/Microsoft Edge'),
    path.join(home, 'Library/Application Support/Arc/User Data'),
  ]
  const files = []
  for (const root of roots) {
    try {
      for (const profile of fs.readdirSync(root)) {
        for (const rel of ['Cookies', 'Network/Cookies']) {
          const file = path.join(root, profile, rel)
          if (fs.existsSync(file)) files.push(file)
        }
      }
    } catch {
      /* best effort */
    }
  }

  const firefoxRoot = path.join(home, 'Library/Application Support/Firefox/Profiles')
  try {
    for (const profile of fs.readdirSync(firefoxRoot)) {
      const file = path.join(firefoxRoot, profile, 'cookies.sqlite')
      if (fs.existsSync(file)) files.push(file)
    }
  } catch {
    /* best effort */
  }
  return [...new Set(files)]
}

function sqliteQuery(file, query) {
  try {
    return execFileSync('sqlite3', [`file:${file}?mode=ro`, query], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    })
  } catch {
    return ''
  }
}

function browserTokens(files = browserCookieFiles()) {
  const tokens = []
  const chromiumQuery = "select value from cookies where host_key like '%manus.im%' and lower(name)='session_id' and value != '';"
  const firefoxQuery = "select value from moz_cookies where host like '%manus.im%' and lower(name)='session_id' and value != '';"
  for (const file of files) {
    const query = file.endsWith('cookies.sqlite') ? firefoxQuery : chromiumQuery
    const out = sqliteQuery(file, query)
    for (const line of out.split(/\r?\n/)) {
      const token = sessionToken(line)
      if (token && !tokens.includes(token)) tokens.push(token)
    }
  }
  return tokens
}

function resolveTokens({ includeBrowser = true } = {}) {
  const candidates = [
    parseSaved(getKey('manus')),
    parseSaved(process.env.MANUS_SESSION_TOKEN || process.env.manus_session_token),
    parseSaved(process.env.MANUS_SESSION_ID || process.env.manus_session_id),
    parseSaved(process.env.MANUS_COOKIE || process.env.manus_cookie),
  ]
  if (includeBrowser) candidates.push(...browserTokens())
  return candidates.filter((token, index, all) => token && all.indexOf(token) === index)
}

function findCreditsPayload(json) {
  if (!json || typeof json !== 'object') return null
  for (const key of ['data', 'result', 'response', 'availableCredits']) {
    if (json[key] && typeof json[key] === 'object') return json[key]
  }
  return json
}

function containsCreditsField(json) {
  const keys = [
    'totalCredits',
    'freeCredits',
    'periodicCredits',
    'addonCredits',
    'refreshCredits',
    'maxRefreshCredits',
    'proMonthlyCredits',
    'eventCredits',
  ]
  return !!json && typeof json === 'object' && keys.some((key) => Object.prototype.hasOwnProperty.call(json, key))
}

function parseCreditsResponse(json, now = Date.now()) {
  const payload = findCreditsPayload(json)
  if (!containsCreditsField(payload)) throw new Error('Manus response missing expected credits fields')
  const proMonthlyCredits = number(payload.proMonthlyCredits)
  const periodicCredits = number(payload.periodicCredits)
  const maxRefreshCredits = number(payload.maxRefreshCredits)
  const refreshCredits = number(payload.refreshCredits)
  const totalCredits = number(payload.totalCredits)
  const freeCredits = number(payload.freeCredits)
  return {
    connected: true,
    totalCredits,
    freeCredits,
    periodicCredits,
    addonCredits: number(payload.addonCredits),
    refreshCredits,
    maxRefreshCredits,
    proMonthlyCredits,
    eventCredits: number(payload.eventCredits),
    nextRefreshTime: timestamp(payload.nextRefreshTime),
    refreshInterval: clean(payload.refreshInterval),
    monthlyUsedPct: proMonthlyCredits > 0 ? clampPct(((proMonthlyCredits - periodicCredits) / proMonthlyCredits) * 100) : null,
    refreshUsedPct: maxRefreshCredits > 0 ? clampPct(((maxRefreshCredits - refreshCredits) / maxRefreshCredits) * 100) : null,
    lastActive: now,
  }
}

async function fetchCredits(token) {
  const res = await fetchWithTimeout(
    ENDPOINT,
    {
      method: 'POST',
      body: '{}',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Cookie: cookieHeader(token),
        Origin: 'https://manus.im',
        Referer: 'https://manus.im/',
        'Connect-Protocol-Version': '1',
        'User-Agent': USER_AGENT,
      },
    },
    15000,
  )
  const text = await res.text()
  if (res.status === 401 || res.status === 403) throw new Error('Manus session token is invalid or expired')
  if (!res.ok) throw new Error(`Manus HTTP ${res.status}: ${text.slice(0, 200)}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Could not parse Manus credits response')
  }
}

async function read() {
  const tokens = resolveTokens()
  if (!tokens.length) return { connected: false, error: 'Manus session_id cookie not configured or found in browser scan' }

  let lastError = null
  for (const token of tokens) {
    try {
      return { ...parseCreditsResponse(await fetchCredits(token)), cookieName: COOKIE_NAME }
    } catch (err) {
      lastError = err
    }
  }
  return { connected: false, error: lastError && lastError.message ? lastError.message : String(lastError) }
}

module.exports = {
  read,
  _private: {
    browserCookieFiles,
    browserTokens,
    cookieHeader,
    cookiePairs,
    parseCreditsResponse,
    parseSaved,
    resolveTokens,
    sessionToken,
  },
}
