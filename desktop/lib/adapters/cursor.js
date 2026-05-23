const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const BASE = 'https://cursor.com'
const DASHBOARD_BASE = 'https://api2.cursor.sh'
const DASHBOARD_TIMEOUT_MS = 5000
const SESSION_COOKIE_NAMES = new Set([
  'WorkosCursorSessionToken',
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
  'wos-session',
  '__Secure-wos-session',
  'authjs.session-token',
  '__Secure-authjs.session-token',
])
const COOKIE_HOSTS = ['cursor.com', 'cursor.sh']

function cookieHeader(raw) {
  const value = String(raw || '').trim()
  return value.replace(/^cookie:\s*/i, '').trim()
}

function browserCookieFiles(home = os.homedir()) {
  const roots = [
    ['Cursor App', path.join(home, 'Library/Application Support/Cursor')],
    ['Chrome', path.join(home, 'Library/Application Support/Google/Chrome')],
    ['Chrome Beta', path.join(home, 'Library/Application Support/Google/Chrome Beta')],
    ['Chrome Canary', path.join(home, 'Library/Application Support/Google/Chrome Canary')],
    ['Brave', path.join(home, 'Library/Application Support/BraveSoftware/Brave-Browser')],
    ['Microsoft Edge', path.join(home, 'Library/Application Support/Microsoft Edge')],
    ['Arc', path.join(home, 'Library/Application Support/Arc/User Data')],
    ['Dia', path.join(home, 'Library/Application Support/Dia/User Data')],
  ]
  const files = []
  for (const [label, root] of roots) {
    try {
      for (const profile of fs.readdirSync(root)) {
        for (const rel of ['Cookies', 'Network/Cookies']) {
          const file = path.join(root, profile, rel)
          if (fs.existsSync(file)) files.push({ file, label: `${label} ${profile}` })
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
      if (fs.existsSync(file)) files.push({ file, label: `Firefox ${profile}` })
    }
  } catch {
    /* best effort */
  }
  const seen = new Set()
  return files.filter((entry) => {
    if (seen.has(entry.file)) return false
    seen.add(entry.file)
    return true
  })
}

function sqliteQuery(file, query) {
  try {
    return execFileSync('sqlite3', ['-separator', '\t', `file:${file}?mode=ro`, query], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    })
  } catch {
    return ''
  }
}

function sqliteValue(file, key) {
  const escaped = String(key).replace(/'/g, "''")
  return sqliteQuery(file, `select value from ItemTable where key='${escaped}' limit 1;`).trim()
}

function cursorStateDB(home = os.homedir()) {
  return path.join(home, 'Library/Application Support/Cursor/User/globalStorage/state.vscdb')
}

function cliConfigFile(home = os.homedir()) {
  return path.join(home, '.cursor', 'cli-config.json')
}

function dashboardBaseFromCliConfig(home = os.homedir()) {
  try {
    const json = JSON.parse(fs.readFileSync(cliConfigFile(home), 'utf8'))
    const url = String(json.serverConfigCache?.backendUrl || '').trim()
    return /^https:\/\/[^/]+/i.test(url) ? url.replace(/\/+$/, '') : DASHBOARD_BASE
  } catch {
    return DASHBOARD_BASE
  }
}

function appAuthFromState(options = {}) {
  const home = options.home || os.homedir()
  const db = options.stateDB || cursorStateDB(home)
  if (!fs.existsSync(db)) return null
  const accessToken = sqliteValue(db, 'cursorAuth/accessToken')
  if (!accessToken) return null
  return {
    accessToken,
    refreshToken: sqliteValue(db, 'cursorAuth/refreshToken') || null,
    membershipType: sqliteValue(db, 'cursorAuth/stripeMembershipType') || null,
    subscriptionStatus: sqliteValue(db, 'cursorAuth/stripeSubscriptionStatus') || null,
    email: sqliteValue(db, 'cursorAuth/cachedEmail') || null,
    dashboardBase: options.dashboardBase || dashboardBaseFromCliConfig(home),
    sourceLabel: 'Cursor app auth',
  }
}

function parseCookieRows(output, label = 'Browser') {
  const rows = []
  for (const line of String(output || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const [host, cookiePath, name, value] = line.split('\t')
    if (!host || !name || !value) continue
    rows.push({ host, path: cookiePath || '/', name, value, label })
  }
  return rows
}

function cookieHeaderFromRecords(records) {
  const deduped = new Map()
  for (const row of records) {
    if (!row.name || !row.value) continue
    deduped.set(`${row.name}|${row.host}|${row.path}`, `${row.name}=${row.value}`)
  }
  return [...deduped.values()].join('; ')
}

function cookieRecordsFromFiles(files = browserCookieFiles()) {
  const sessions = []
  const seenHeaders = new Set()
  const hostClause = COOKIE_HOSTS
    .map((host) => `host_key like '%${host}%'`)
    .join(' or ')
  const firefoxHostClause = COOKIE_HOSTS
    .map((host) => `host like '%${host}%'`)
    .join(' or ')
  for (const entry of files) {
    const file = typeof entry === 'string' ? entry : entry.file
    const label = typeof entry === 'string' ? 'Browser' : entry.label
    const firefox = file.endsWith('cookies.sqlite')
    const query = firefox
      ? `select host, path, name, value from moz_cookies where (${firefoxHostClause}) and value != '';`
      : `select host_key, path, name, value from cookies where (${hostClause}) and value != '';`
    const rows = parseCookieRows(sqliteQuery(file, query), label)
    if (!rows.length) continue
    const strict = rows.some((row) => SESSION_COOKIE_NAMES.has(row.name))
    if (!strict && !rows.some((row) => /cursor\.(com|sh)$/i.test(row.host.replace(/^\./, '')))) continue
    const header = cookieHeaderFromRecords(rows)
    if (!header || seenHeaders.has(header)) continue
    seenHeaders.add(header)
    sessions.push({ cookieHeader: header, sourceLabel: strict ? label : `${label} domain cookies` })
  }
  return sessions
}

function resolveCookie(options = {}) {
  const saved = cookieHeader(options.savedKey ?? getKey('cursor'))
  if (saved) return { cookie: saved, sourceLabel: 'saved Cookie' }
  const env = cookieHeader(process.env.CURSOR_COOKIE || process.env.CURSOR_SESSION_COOKIE)
  if (env) return { cookie: env, sourceLabel: 'environment Cookie' }
  const browser = cookieRecordsFromFiles(options.browserCookieFiles || browserCookieFiles(options.home))[0]
  if (browser?.cookieHeader) return { cookie: browser.cookieHeader, sourceLabel: browser.sourceLabel }
  return null
}

function centsToUsd(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, n / 100) : 0
}

function percent(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, n))
}

function parseDate(value) {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function usagePercent(summary) {
  const plan = summary?.individualUsage?.plan || {}
  const autoPct = percent(plan.autoPercentUsed)
  const apiPct = percent(plan.apiPercentUsed)
  const totalPct = percent(plan.totalPercentUsed)
  if (totalPct != null) return totalPct
  if (autoPct != null && apiPct != null) return (autoPct + apiPct) / 2
  if (autoPct != null) return autoPct
  if (apiPct != null) return apiPct

  const used = Number(plan.used)
  const limit = Number(plan.limit)
  if (Number.isFinite(used) && Number.isFinite(limit) && limit > 0) return (used / limit) * 100
  return 0
}

function planLabel(type) {
  const raw = String(type || '').trim()
  if (!raw) return 'Cursor'
  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase()
      if (lower === 'pro') return 'Pro'
      if (lower === 'plus') return '+'
      if (lower === 'ultra') return 'Ultra'
      if (lower === 'free') return 'Free'
      if (lower === 'trial') return 'Trial'
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join(' ')
    .replace(' +', '+')
}

function priceUSD(value) {
  const match = String(value || '').match(/\$?\s*([0-9]+(?:\.[0-9]+)?)/)
  return match ? Number(match[1]) : null
}

function parseUsageSummary(summary, user = {}) {
  const plan = summary?.individualUsage?.plan || {}
  const onDemand = summary?.individualUsage?.onDemand || {}
  const resetAt = parseDate(summary?.billingCycleEnd)
  const planUsedUSD = centsToUsd(plan.used)
  const planLimitUSD = centsToUsd(plan.limit)
  const onDemandUsedUSD = centsToUsd(onDemand.used)
  const onDemandLimitUSD = onDemand.limit == null ? null : centsToUsd(onDemand.limit)
  const autoPct = percent(plan.autoPercentUsed)
  const apiPct = percent(plan.apiPercentUsed)
  const planPercentUsed = usagePercent(summary)

  return {
    connected: true,
    plan: planLabel(summary?.membershipType),
    planPercentUsed,
    autoPercentUsed: autoPct,
    apiPercentUsed: apiPct,
    planUsedUSD,
    planLimitUSD,
    onDemandUsedUSD,
    onDemandLimitUSD,
    resetAt,
    email: user.email || null,
    name: user.name || null,
    lastActive: Date.now(),
  }
}

function parseMs(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (Number.isFinite(n) && n > 0) return n
  return parseDate(value)
}

function parseDashboardUsage(currentPeriod = {}, planInfoResponse = {}, user = {}, localAuth = {}) {
  const planUsage = currentPeriod.planUsage || {}
  const planInfo = planInfoResponse.planInfo || {}
  const planLimitCents = Number(planUsage.limit ?? planInfo.includedAmountCents)
  const planSpentCents = Number(planUsage.totalSpend ?? planUsage.includedSpend ?? 0)
  const resetAt = parseMs(currentPeriod.billingCycleEnd ?? planInfo.billingCycleEnd)
  const totalPct = percent(planUsage.totalPercentUsed)
  const autoPct = percent(planUsage.autoPercentUsed)
  const apiPct = percent(planUsage.apiPercentUsed)
  const planPercentUsed =
    totalPct ??
    (Number.isFinite(planSpentCents) && Number.isFinite(planLimitCents) && planLimitCents > 0
      ? (planSpentCents / planLimitCents) * 100
      : null)
  const spendLimit = currentPeriod.spendLimitUsage || {}
  const spendLimitUsedUSD = spendLimit.individualUsed == null ? null : centsToUsd(spendLimit.individualUsed)
  const spendLimitLimitUSD = spendLimit.individualLimit == null ? null : centsToUsd(spendLimit.individualLimit)

  return {
    connected: true,
    plan: planLabel(planInfo.planName || localAuth.membershipType),
    planPercentUsed: planPercentUsed ?? 0,
    autoPercentUsed: autoPct,
    apiPercentUsed: apiPct,
    planUsedUSD: Number.isFinite(planSpentCents) ? centsToUsd(planSpentCents) : 0,
    planLimitUSD: Number.isFinite(planLimitCents) ? centsToUsd(planLimitCents) : 0,
    monthlyPriceUSD: priceUSD(planInfo.price),
    onDemandUsedUSD: spendLimitUsedUSD,
    onDemandLimitUSD: spendLimitLimitUSD,
    resetAt,
    email: user.email || localAuth.email || null,
    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.name || null,
    lastActive: Date.now(),
    sourceLabel: localAuth.sourceLabel || 'Cursor app auth',
  }
}

async function getJSON(path, cookie) {
  const res = await fetchWithTimeout(
    BASE + path,
    {
      headers: {
        Accept: 'application/json',
        Cookie: cookie,
        'User-Agent': 'MaxxToken',
      },
    },
    15000,
  )
  if (res.status === 401 || res.status === 403) throw new Error('Cursor session rejected')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function dashboardJSON(method, auth) {
  const res = await fetchWithTimeout(
    `${auth.dashboardBase || DASHBOARD_BASE}/aiserver.v1.DashboardService/${method}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${auth.accessToken}`,
        'Connect-Protocol-Version': '1',
        'Content-Type': 'application/json',
        'User-Agent': 'MaxxToken',
      },
      body: '{}',
    },
    DASHBOARD_TIMEOUT_MS,
  )
  if (res.status === 401 || res.status === 403) throw new Error('Cursor app session rejected')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function read(options = {}) {
  const appAuth = appAuthFromState(options)
  if (appAuth?.accessToken) {
    try {
      const [current, planInfo, user] = await Promise.all([
        dashboardJSON('GetCurrentPeriodUsage', appAuth),
        dashboardJSON('GetPlanInfo', appAuth),
        dashboardJSON('GetMe', appAuth).catch(() => ({})),
      ])
      return parseDashboardUsage(current, planInfo, user, appAuth)
    } catch (err) {
      if (!options.skipCookieFallback) {
        const fallback = await read({ ...options, stateDB: '/dev/null', skipCookieFallback: true })
        if (fallback.connected) return fallback
      }
      return {
        connected: false,
        needsKey: true,
        error: err && err.message ? err.message : String(err),
      }
    }
  }

  const resolved = resolveCookie(options)
  if (!resolved?.cookie) {
    return {
      connected: false,
      needsKey: true,
      error: 'Cursor usage needs a cursor.com browser session or pasted Cookie header.',
    }
  }

  try {
    const [summary, userResult] = await Promise.all([
      getJSON('/api/usage-summary', resolved.cookie),
      getJSON('/api/auth/me', resolved.cookie).catch(() => ({})),
    ])
    return { ...parseUsageSummary(summary, userResult || {}), sourceLabel: resolved.sourceLabel }
  } catch (err) {
    return {
      connected: false,
      needsKey: true,
      error: err && err.message ? err.message : String(err),
    }
  }
}

module.exports = {
  read,
  _private: {
    browserCookieFiles,
    cookieRecordsFromFiles,
    appAuthFromState,
    parseCookieRows,
    resolveCookie,
    cookieHeader,
    parseUsageSummary,
    parseDashboardUsage,
    dashboardBaseFromCliConfig,
  },
}
