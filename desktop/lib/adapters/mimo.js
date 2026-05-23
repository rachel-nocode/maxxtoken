const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const DEFAULT_API_URL = 'https://platform.xiaomimimo.com/api/v1'
const BALANCE_REFERER = 'https://platform.xiaomimimo.com/#/console/balance'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'

const REQUIRED_COOKIES = new Set(['api-platform_serviceToken', 'userId'])
const KNOWN_COOKIES = new Set([...REQUIRED_COOKIES, 'api-platform_ph', 'api-platform_slh'])

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function number(value) {
  if (value == null || value === '') return null
  if (typeof value === 'string') value = value.trim().replace(/[$,]/g, '')
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function clampPct(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function timestamp(value) {
  if (value == null || value === '') return null
  const n = number(value)
  if (n != null) {
    if (n > 1e12) return n
    if (n > 1e9) return n * 1000
  }
  let text = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) text = text.replace(' ', 'T') + 'Z'
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : null
}

function cookieText(raw) {
  let text = clean(raw)
  if (!text) return null

  const cookieFlag = text.match(/(?:--cookie|-b)\s+(['"])([\s\S]*?)\1/i)
  if (cookieFlag) return cookieFlag[2].trim()

  const headerFlag = text.match(/(?:-H|--header)\s+(['"])cookie\s*:\s*([\s\S]*?)\1/i)
  if (headerFlag) return headerFlag[2].trim()

  const inlineHeader = text.match(/cookie\s*:\s*([^\n\r]+)/i)
  if (inlineHeader) return inlineHeader[1].replace(/^['"]|['"]$/g, '').trim()

  return text
}

function cookiePairs(raw) {
  const text = cookieText(raw)
  if (!text) return []
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

function normalizedCookieHeader(raw) {
  const pairs = cookiePairs(raw)
  if (!pairs.length) return null
  const byName = {}
  for (const pair of pairs) {
    if (!KNOWN_COOKIES.has(pair.name)) continue
    const value = clean(pair.value)
    if (value) byName[pair.name] = value
  }
  for (const name of REQUIRED_COOKIES) {
    if (!byName[name]) return null
  }
  return Object.keys(byName)
    .sort()
    .map((name) => `${name}=${byName[name]}`)
    .join('; ')
}

function parseSaved(raw) {
  const text = clean(raw)
  if (!text) return null
  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text)
      const direct = normalizedCookieHeader(json.cookieHeader || json.cookie || json.cookies || json.header)
      if (direct) return direct
      if (json.serviceToken || json.service_token || json.userId || json.user_id) {
        return normalizedCookieHeader(
          [
            `api-platform_serviceToken=${json.serviceToken || json.service_token || ''}`,
            `userId=${json.userId || json.user_id || ''}`,
            json.ph ? `api-platform_ph=${json.ph}` : '',
            json.slh ? `api-platform_slh=${json.slh}` : '',
          ]
            .filter(Boolean)
            .join('; '),
        )
      }
    } catch {
      /* fall through */
    }
  }
  return normalizedCookieHeader(text)
}

function apiBase(env = process.env) {
  const raw = clean(env.MIMO_API_URL || env.mimo_api_url) || DEFAULT_API_URL
  try {
    const url = new URL(raw)
    return url.toString().replace(/\/$/, '')
  } catch {
    return DEFAULT_API_URL
  }
}

function parseBalanceResponse(json, now = Date.now()) {
  if (!json || typeof json !== 'object') throw new Error('Missing MiMo balance payload')
  if (json.code !== 0) {
    if (json.code === 401) throw new Error('Xiaomi MiMo login required')
    if (json.code === 403) throw new Error('Xiaomi MiMo browser session expired')
    throw new Error(`Could not parse Xiaomi MiMo balance: ${json.message || `code ${json.code}`}`)
  }
  const data = json.data || {}
  const balance = number(data.balance)
  const currency = clean(data.currency)
  if (balance == null) throw new Error('Could not parse Xiaomi MiMo balance: invalid balance value')
  if (!currency) throw new Error('Could not parse Xiaomi MiMo balance: missing currency')
  return {
    connected: true,
    balance,
    currency,
    updatedAt: now,
    lastActive: now,
  }
}

function parseTokenPlanDetail(json) {
  if (!json || typeof json !== 'object' || json.code !== 0 || !json.data) {
    return { planCode: null, planPeriodEnd: null, planExpired: false }
  }
  const data = json.data
  return {
    planCode: clean(data.planCode),
    planPeriodEnd: timestamp(data.currentPeriodEnd),
    planExpired: data.expired === true,
  }
}

function parseTokenPlanUsage(json) {
  if (!json || typeof json !== 'object' || json.code !== 0) {
    return { tokenUsed: 0, tokenLimit: 0, tokenPercent: 0 }
  }
  const monthUsage = json.data && json.data.monthUsage
  const firstItem = monthUsage && Array.isArray(monthUsage.items) ? monthUsage.items[0] : null
  if (!firstItem) return { tokenUsed: 0, tokenLimit: 0, tokenPercent: 0 }
  const used = number(firstItem.used) || 0
  const limit = number(firstItem.limit) || 0
  const rawPercent = number(firstItem.percent ?? monthUsage.percent)
  return {
    tokenUsed: Math.round(used),
    tokenLimit: Math.round(limit),
    tokenPercent: rawPercent == null ? (limit > 0 ? used / limit : 0) : rawPercent,
  }
}

function parseCombinedSnapshot(balanceJSON, detailJSON, usageJSON, now = Date.now()) {
  const balance = parseBalanceResponse(balanceJSON, now)
  const detail = parseTokenPlanDetail(detailJSON)
  const usage = parseTokenPlanUsage(usageJSON)
  return {
    ...balance,
    ...detail,
    ...usage,
  }
}

function browserCookieFiles(home = os.homedir()) {
  const roots = [
    path.join(home, 'Library/Application Support/Google/Chrome'),
    path.join(home, 'Library/Application Support/Google/Chrome Beta'),
    path.join(home, 'Library/Application Support/Google/Chrome Canary'),
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

function cookieRecordsFromFiles(files = browserCookieFiles()) {
  const records = []
  const names = [...KNOWN_COOKIES].map((name) => `'${name}'`).join(',')
  const chromiumQuery = `
    select host_key, path, name, value, expires_utc
    from cookies
    where (host_key like '%xiaomimimo.com%' or host_key like '%platform.xiaomimimo.com%')
      and name in (${names})
      and value != '';
  `
  const firefoxQuery = `
    select host, path, name, value, expiry
    from moz_cookies
    where (host like '%xiaomimimo.com%' or host like '%platform.xiaomimimo.com%')
      and name in (${names})
      and value != '';
  `
  for (const file of files) {
    const isFirefox = file.endsWith('cookies.sqlite')
    const out = sqliteQuery(file, isFirefox ? firefoxQuery : chromiumQuery)
    for (const line of out.split(/\r?\n/)) {
      if (!line.trim()) continue
      const [domain, cookiePath, name, value, expiresRaw] = line.split('|')
      if (!domain || !name || !value) continue
      const expires = number(expiresRaw) || 0
      records.push({
        domain,
        path: cookiePath || '/',
        name,
        value,
        expiresAt: isFirefox ? expires * 1000 : chromeExpiryMs(expires),
      })
    }
  }
  return records
}

function chromeExpiryMs(value) {
  if (!(value > 0)) return 0
  return Math.round(value / 1000 - 11644473600000)
}

function matchesMiMoRequest(record) {
  const host = 'platform.xiaomimimo.com'
  const domain = String(record.domain || '').toLowerCase().replace(/^\./, '')
  if (!domain || (host !== domain && !host.endsWith(`.${domain}`))) return false

  const requestPath = '/api/v1/balance'
  const cookiePath = record.path || '/'
  if (requestPath === cookiePath || cookiePath === '/') return true
  if (!requestPath.startsWith(cookiePath)) return false
  if (cookiePath.endsWith('/')) return true
  return requestPath[cookiePath.length] === '/'
}

function recordSortKey(record) {
  return [String(record.path || '').length, String(record.domain || '').replace(/^\./, '').length, record.expiresAt || 0]
}

function headerFromRecords(records, now = Date.now()) {
  const byName = {}
  for (const record of records) {
    if (!KNOWN_COOKIES.has(record.name)) continue
    if (!clean(record.value)) continue
    if (record.expiresAt && record.expiresAt < now) continue
    if (!matchesMiMoRequest(record)) continue
    const existing = byName[record.name]
    if (!existing) {
      byName[record.name] = record
      continue
    }
    const lhs = recordSortKey(existing)
    const rhs = recordSortKey(record)
    if (rhs[0] > lhs[0] || (rhs[0] === lhs[0] && (rhs[1] > lhs[1] || (rhs[1] === lhs[1] && rhs[2] >= lhs[2])))) {
      byName[record.name] = record
    }
  }
  return normalizedCookieHeader(
    Object.keys(byName)
      .sort()
      .map((name) => `${name}=${byName[name].value}`)
      .join('; '),
  )
}

function browserHeaders(files = browserCookieFiles()) {
  const header = headerFromRecords(cookieRecordsFromFiles(files))
  return header ? [header] : []
}

function resolveCookieHeaders({ includeBrowser = true } = {}) {
  const candidates = [
    parseSaved(getKey('mimo')),
    parseSaved(process.env.MIMO_COOKIE || process.env.mimo_cookie),
    parseSaved(process.env.MIMO_COOKIE_HEADER || process.env.mimo_cookie_header),
  ]
  if (includeBrowser) candidates.push(...browserHeaders())
  return candidates.filter((header, index, all) => header && all.indexOf(header) === index)
}

async function fetchJSON(url, cookieHeader) {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: cookieHeader,
        Origin: 'https://platform.xiaomimimo.com',
        Referer: BALANCE_REFERER,
        'User-Agent': USER_AGENT,
        'x-timeZone': 'UTC+01:00',
      },
    },
    15000,
  )
  const text = await res.text()
  if (res.status === 401) throw new Error('Xiaomi MiMo login required')
  if (res.status === 403) throw new Error('Xiaomi MiMo browser session expired')
  if (!res.ok) throw new Error(`Xiaomi MiMo HTTP ${res.status}: ${text.slice(0, 200)}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Could not parse Xiaomi MiMo response')
  }
}

async function fetchUsage(cookieHeader, env = process.env) {
  const normalized = normalizedCookieHeader(cookieHeader)
  if (!normalized) throw new Error('Xiaomi MiMo requires the api-platform_serviceToken and userId cookies')

  const base = apiBase(env)
  const balanceJSON = await fetchJSON(`${base}/balance`, normalized)
  const [detailJSON, usageJSON] = await Promise.all([
    fetchJSON(`${base}/tokenPlan/detail`, normalized).catch(() => null),
    fetchJSON(`${base}/tokenPlan/usage`, normalized).catch(() => null),
  ])
  return parseCombinedSnapshot(balanceJSON, detailJSON, usageJSON)
}

async function read() {
  const headers = resolveCookieHeaders()
  if (!headers.length) {
    return { connected: false, error: 'No Xiaomi MiMo session found. Log in at platform.xiaomimimo.com or paste Cookie header.' }
  }

  let lastError = null
  for (const header of headers) {
    try {
      return { ...(await fetchUsage(header)), cookieNames: [...REQUIRED_COOKIES] }
    } catch (err) {
      lastError = err
    }
  }
  return { connected: false, error: lastError && lastError.message ? lastError.message : String(lastError) }
}

module.exports = {
  read,
  _private: {
    apiBase,
    browserCookieFiles,
    browserHeaders,
    cookiePairs,
    cookieRecordsFromFiles,
    fetchUsage,
    headerFromRecords,
    normalizedCookieHeader,
    parseBalanceResponse,
    parseCombinedSnapshot,
    parseSaved,
    parseTokenPlanDetail,
    parseTokenPlanUsage,
    resolveCookieHeaders,
  },
}
