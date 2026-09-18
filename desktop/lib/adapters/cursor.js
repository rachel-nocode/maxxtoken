const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const BASE = 'https://cursor.com'
const DASHBOARD_BASE = 'https://api2.cursor.sh'
const DASHBOARD_TIMEOUT_MS = 5000
const GROK_BOT_METHOD = 'GetSandUsageStatus'
const CREDITS_METHOD = 'GetCreditGrantsBalance'
const EXPORT_PATH = '/api/dashboard/export-usage-events-csv'
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

function cursorUsageBuckets({ totalPct, autoPct, apiPct, resetAt }) {
  return [
    { label: 'Total Usage', usedPct: totalPct },
    { label: 'Cursor Models', usedPct: autoPct },
    { label: 'Other Models', usedPct: apiPct },
  ]
    .filter((bucket) => bucket.usedPct != null)
    .map((bucket) => ({ ...bucket, resetAt }))
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
    usageBuckets: cursorUsageBuckets({ totalPct: planPercentUsed, autoPct, apiPct, resetAt }),
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
    usageBuckets: cursorUsageBuckets({ totalPct: planPercentUsed, autoPct, apiPct, resetAt }),
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

function parseGrokBotUsage(value) {
  if (!value || typeof value !== 'object') return null
  if (value.usesPooledEnterpriseAllowance === true || value.hasNonZeroIncludedLimit === false || value.includedLimitZero === true) return null
  const usedPct = percent(value.usagePercent)
  if (usedPct == null) return null
  return {
    label: 'Grok Bot',
    usedPct,
    resetAt: parseDate(value.nextResetTimestampUtc),
  }
}

function parseCreditBalance(grants, stripe) {
  const hasGrants = grants?.hasCreditGrants === true
  const grantTotal = hasGrants ? Number(grants.totalCents) : 0
  const grantUsed = hasGrants ? Number(grants.usedCents) : 0
  const stripeValue = Number(stripe?.customerBalance)
  const prepaid = Number.isFinite(stripeValue) && stripeValue < 0 ? Math.abs(stripeValue) : 0
  const total = (Number.isFinite(grantTotal) && grantTotal > 0 ? grantTotal : 0) + prepaid
  const used = Number.isFinite(grantUsed) && grantUsed > 0 ? grantUsed : 0
  return total > 0 ? centsToUsd(Math.max(0, total - used)) : null
}

function parseRequestBasedUsage(value) {
  const bucket = value?.['gpt-4']
  const limit = Number(bucket?.maxRequestUsage)
  if (!Number.isFinite(limit) || limit <= 0) return null
  const used = Number(bucket.numRequests)
  const start = parseDate(value.startOfMonth)
  return {
    label: 'Requests',
    used: Number.isFinite(used) && used >= 0 ? used : 0,
    limit,
    usedPct: percent(((Number.isFinite(used) && used >= 0 ? used : 0) / limit) * 100),
    resetAt: start == null ? null : start + 30 * 86400000,
  }
}

function jwtSubject(accessToken) {
  const parts = String(accessToken || '').split('.')
  if (parts.length < 2) return null
  try {
    const json = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return typeof json.sub === 'string' && json.sub.trim() ? json.sub.trim() : null
  } catch {
    return null
  }
}

function sessionCookieFromAccessToken(accessToken) {
  const subject = jwtSubject(accessToken)
  if (!subject) return null
  const parts = subject.split('|')
  const userID = parts.length > 1 ? parts[1] : parts[0]
  if (!userID) return null
  return `WorkosCursorSessionToken=${encodeURIComponent(`${userID}::${accessToken}`)}`
}

async function cursorREST(pathname, cookie, options = {}) {
  if (!cookie) return null
  const request = options.fetchWithTimeout || fetchWithTimeout
  const res = await request(`${BASE}${pathname}`, {
    headers: { Cookie: cookie, Accept: options.accept || 'application/json', 'User-Agent': 'MaxxToken' },
  }, options.timeout || 15000)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res
}

function parseCSVRecords(csv) {
  const records = []
  let row = []
  let field = ''
  let quoted = false
  let closedQuote = false
  for (let i = 0; i < String(csv).length; i++) {
    const char = String(csv)[i]
    if (quoted) {
      if (char === '"') {
        if (String(csv)[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
          closedQuote = true
        }
      } else {
        field += char
      }
      continue
    }
    if (closedQuote && char !== ',' && char !== '\n' && char !== '\r') {
      throw new Error('Cursor usage CSV is structurally malformed')
    }
    if (char === '"') {
      if (field.length) throw new Error('Cursor usage CSV is structurally malformed')
      quoted = true
      closedQuote = false
    } else if (char === ',') {
      row.push(field)
      field = ''
      closedQuote = false
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''))
      records.push(row)
      row = []
      field = ''
      closedQuote = false
    } else if (char === '\r' && closedQuote && String(csv)[i + 1] === '\n') {
      /* newline is handled on the next byte */
    } else {
      field += char
    }
  }
  if (quoted) throw new Error('Cursor usage CSV is structurally malformed')
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''))
    records.push(row)
  }
  return records
}

function parseCSVInteger(value) {
  const text = String(value ?? '').trim()
  if (!text) return 0
  if (!/^(?:0|[1-9]\d{0,2}(?:,\d{3})*|[1-9]\d*)$/.test(text)) return null
  const n = Number(text.replace(/,/g, ''))
  return Number.isSafeInteger(n) && n >= 0 ? n : null
}

function parseUsageCSV(csv) {
  const records = parseCSVRecords(csv)
  if (!records.length) throw new Error('Cursor usage CSV is empty')
  const header = records[0].map((value) => value.replace(/^\uFEFF/, '').trim())
  const required = ['Date', 'Model', 'Input (w/ Cache Write)', 'Input (w/o Cache Write)', 'Cache Read', 'Output Tokens']
  const indexes = Object.fromEntries(required.map((name) => [name, header.indexOf(name)]))
  if (required.some((name) => indexes[name] < 0) || new Set(header).size !== header.length) {
    throw new Error('Cursor usage CSV missing or duplicate required columns')
  }
  const costIndex = header.indexOf('Cost')
  const rows = []
  let rejectedRows = 0
  for (const record of records.slice(1)) {
    if (!record.some((value) => String(value).trim())) continue
    if (record.length !== header.length) {
      rejectedRows++
      continue
    }
    const timestamp = Date.parse(record[indexes.Date])
    const model = String(record[indexes.Model] || '').trim()
    const buckets = [
      parseCSVInteger(record[indexes['Input (w/ Cache Write)']]),
      parseCSVInteger(record[indexes['Input (w/o Cache Write)']]),
      parseCSVInteger(record[indexes['Cache Read']]),
      parseCSVInteger(record[indexes['Output Tokens']]),
    ]
    if (!Number.isFinite(timestamp) || !model || buckets.some((value) => value == null)) {
      rejectedRows++
      continue
    }
    const total = buckets.reduce((sum, value) => sum + value, 0)
    if (!Number.isSafeInteger(total)) {
      rejectedRows++
      continue
    }
    const costText = costIndex < 0 ? '' : String(record[costIndex] || '').replace(/[$,]/g, '').trim()
    const cost = costText && Number.isFinite(Number(costText)) ? Math.max(0, Number(costText)) : null
    rows.push({
      timestamp,
      date: dayKey(timestamp),
      model,
      input: buckets[0] + buckets[1],
      cached: buckets[2],
      output: buckets[3],
      total,
      costUSD: cost,
    })
  }
  return { rows, rejectedRows }
}

function aggregateUsageCSV(parsed) {
  const rows = parsed?.rows || []
  if (!rows.length) return null
  const total = emptyUsageBucket()
  const byDay = new Map()
  const byModel = new Map()
  const add = (bucket, row) => {
    bucket.input += row.input
    bucket.cached += row.cached
    bucket.output += row.output
    bucket.total += row.total
    bucket.requests += 1
    if (row.costUSD == null) bucket.unpricedModels.add(row.model)
    else {
      bucket.costUSD += row.costUSD
      bucket.pricedRows += 1
    }
  }
  for (const row of rows) {
    add(total, row)
    const day = byDay.get(row.date) || emptyUsageBucket({ date: row.date })
    add(day, row)
    byDay.set(row.date, day)
    const model = byModel.get(row.model) || emptyUsageBucket({ model: row.model })
    add(model, row)
    byModel.set(row.model, model)
  }
  const finalize = (bucket) => {
    const { pricedRows, unpricedModels, ...value } = bucket
    return {
      ...value,
      costUSD: pricedRows ? value.costUSD : null,
      costAccuracy: pricedRows ? 'measured' : null,
      pricingSource: pricedRows ? 'Cursor usage export' : null,
      unpricedModels: [...unpricedModels].sort(),
    }
  }
  return {
    ...finalize(total),
    dailyBreakdown: [...byDay.values()].map(finalize).sort((a, b) => b.date.localeCompare(a.date)),
    modelBreakdowns: [...byModel.values()].map(finalize).sort((a, b) => b.total - a.total),
    source: 'Cursor usage export',
    malformedRows: parsed.rejectedRows,
  }
}

function emptyUsageBucket(extra = {}) {
  return { input: 0, cached: 0, output: 0, total: 0, requests: 0, costUSD: 0, pricedRows: 0, unpricedModels: new Set(), ...extra }
}

function dayKey(ms) {
  const date = new Date(ms)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function fetchUsageCSV(cookie, options = {}) {
  if (!cookie) return null
  const now = options.now || Date.now()
  const url = new URL(`${BASE}${EXPORT_PATH}`)
  url.searchParams.set('startDate', String(now - 29 * 86400000))
  url.searchParams.set('endDate', String(now))
  url.searchParams.set('strategy', 'tokens')
  const request = options.fetchWithTimeout || fetchWithTimeout
  const res = await request(url.toString(), {
    headers: { Cookie: cookie, Accept: 'text/csv', 'User-Agent': 'MaxxToken' },
  }, 30000)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return aggregateUsageCSV(parseUsageCSV(await res.text()))
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
        dashboardJSON('GetPlanInfo', appAuth).catch(() => ({})),
        dashboardJSON('GetMe', appAuth).catch(() => ({})),
      ])
      const base = parseDashboardUsage(current, planInfo, user, appAuth)
      const sessionCookie = sessionCookieFromAccessToken(appAuth.accessToken)
      const optional = await Promise.allSettled([
        dashboardJSON(GROK_BOT_METHOD, appAuth),
        dashboardJSON(CREDITS_METHOD, appAuth),
        cursorREST('/api/auth/stripe', sessionCookie, options).then((res) => res?.json()),
        cursorREST(`/api/usage?user=${encodeURIComponent(jwtSubject(appAuth.accessToken)?.split('|').at(-1) || '')}`, sessionCookie, options).then((res) => res?.json()),
        fetchUsageCSV(sessionCookie, options),
      ])
      const value = (index) => optional[index].status === 'fulfilled' ? optional[index].value : null
      const grokBot = parseGrokBotUsage(value(0))
      const requestUsage = parseRequestBasedUsage(value(3))
      const warnings = optional
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason?.message || String(result.reason))
      return {
        ...base,
        usageBuckets: [...base.usageBuckets, grokBot].filter(Boolean),
        creditBalanceUSD: parseCreditBalance(value(1), value(2)),
        requestUsage,
        tokenUsage: value(4),
        warning: warnings.length ? warnings.join('; ') : null,
      }
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
    const [summary, userResult, tokenUsageResult] = await Promise.all([
      getJSON('/api/usage-summary', resolved.cookie),
      getJSON('/api/auth/me', resolved.cookie).catch(() => ({})),
      fetchUsageCSV(resolved.cookie, options).catch((error) => ({ error: error.message || String(error) })),
    ])
    return {
      ...parseUsageSummary(summary, userResult || {}),
      sourceLabel: resolved.sourceLabel,
      tokenUsage: tokenUsageResult?.error ? null : tokenUsageResult,
      warning: tokenUsageResult?.error || null,
    }
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
    parseGrokBotUsage,
    parseCreditBalance,
    parseRequestBasedUsage,
    sessionCookieFromAccessToken,
    parseUsageCSV,
    aggregateUsageCSV,
    fetchUsageCSV,
    dayKey,
  },
}
