const crypto = require('crypto')
const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
const SAFARI_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Safari/605.1.15'

const REGIONS = {
  intl: {
    id: 'intl',
    gatewayBase: 'https://modelstudio.console.alibabacloud.com',
    dashboard:
      'https://modelstudio.console.alibabacloud.com/ap-southeast-1/?tab=coding-plan#/efm/coding_plan',
    consoleReferer: 'https://modelstudio.console.alibabacloud.com/ap-southeast-1/?tab=coding-plan',
    consoleRPCBase: 'https://bailian-singapore-cs.alibabacloud.com',
    consoleDomain: 'modelstudio.console.alibabacloud.com',
    consoleSite: 'MODELSTUDIO_ALIBABACLOUD',
    commodityCode: 'sfm_codingplan_public_intl',
    currentRegionID: 'ap-southeast-1',
    consoleRPCAction: 'IntlBroadScopeAspnGateway',
  },
  cn: {
    id: 'cn',
    gatewayBase: 'https://bailian.console.aliyun.com',
    dashboard: 'https://bailian.console.aliyun.com/cn-beijing/?tab=model#/efm/coding_plan',
    consoleReferer: 'https://bailian.console.aliyun.com/cn-beijing/?tab=model',
    consoleRPCBase: 'https://bailian-cs.console.aliyun.com',
    consoleDomain: 'bailian.console.aliyun.com',
    consoleSite: 'BAILIAN_ALIYUN',
    commodityCode: 'sfm_codingplan_public_cn',
    currentRegionID: 'cn-beijing',
    consoleRPCAction: 'BroadScopeAspnGateway',
  },
}

const CONSOLE_RPC_PRODUCT = 'sfm_bailian'
const CONSOLE_QUOTA_API = 'zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2'

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if (text.toLowerCase().startsWith('cookie:')) text = text.slice(7).trim()
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function parseSaved(value) {
  const text = clean(value)
  if (!text) return {}
  try {
    const json = JSON.parse(text)
    if (json && typeof json === 'object') {
      return {
        apiKey: clean(json.apiKey || json.key || json.token),
        cookieHeader: clean(json.cookieHeader || json.cookie || json.session),
        region: clean(json.region),
        host: clean(json.host),
        quotaURL: clean(json.quotaURL || json.quotaUrl),
      }
    }
  } catch {
    /* fall through */
  }
  return text.includes('=') || text.includes(';') ? { cookieHeader: text } : { apiKey: text }
}

function regionID(raw = process.env.ALIBABA_CODING_PLAN_REGION || process.env.ALIBABA_REGION) {
  const text = clean(raw)?.toLowerCase()
  if (text === 'cn' || text === 'china' || text === 'china-mainland' || text === 'mainland') return 'cn'
  return 'intl'
}

function region(raw) {
  return REGIONS[regionID(raw)] || REGIONS.intl
}

function resolveCredentials() {
  const saved = parseSaved(getKey('alibaba'))
  const envCookie = clean(process.env.ALIBABA_CODING_PLAN_COOKIE)
  const envKey =
    clean(process.env.ALIBABA_CODING_PLAN_API_KEY) ||
    clean(process.env.ALIBABA_QWEN_API_KEY) ||
    clean(process.env.DASHSCOPE_API_KEY)

  return {
    apiKey: envKey || saved.apiKey || null,
    cookieHeader: normalizeCookieHeader(envCookie || saved.cookieHeader),
    region: region(saved.region || undefined),
    host: clean(process.env.ALIBABA_CODING_PLAN_HOST) || saved.host || null,
    quotaURL: clean(process.env.ALIBABA_CODING_PLAN_QUOTA_URL) || saved.quotaURL || null,
  }
}

function normalizeCookieHeader(raw) {
  const text = clean(raw)
  if (!text || !text.includes('=')) return null
  const pairs = []
  for (const chunk of text.split(';')) {
    const index = chunk.indexOf('=')
    if (index < 0) continue
    const name = chunk.slice(0, index).trim()
    const value = chunk.slice(index + 1).trim()
    if (name && value) pairs.push(`${name}=${value}`)
  }
  return pairs.length ? pairs.join('; ') : null
}

function withPathAndQuery(rawHost, path, query) {
  const base = new URL(clean(rawHost)?.match(/^https?:\/\//i) ? clean(rawHost) : `https://${clean(rawHost)}`)
  base.pathname = path
  base.search = ''
  for (const [name, value] of Object.entries(query || {})) base.searchParams.set(name, value)
  base.hash = ''
  return base.toString()
}

function quotaURL(selectedRegion, { host, quotaURL } = {}) {
  if (quotaURL) return clean(quotaURL)?.match(/^https?:\/\//i) ? clean(quotaURL) : `https://${clean(quotaURL)}`
  const base = host || selectedRegion.gatewayBase
  return withPathAndQuery(base, '/data/api.json', {
    action: CONSOLE_QUOTA_API,
    product: 'broadscope-bailian',
    api: 'queryCodingPlanInstanceInfoV2',
    currentRegionId: selectedRegion.currentRegionID,
  })
}

function consoleQuotaURL(selectedRegion, { host, quotaURL } = {}) {
  if (quotaURL) return clean(quotaURL)?.match(/^https?:\/\//i) ? clean(quotaURL) : `https://${clean(quotaURL)}`
  const base = host || selectedRegion.consoleRPCBase
  return withPathAndQuery(base, '/data/api.json', {
    action: selectedRegion.consoleRPCAction,
    product: CONSOLE_RPC_PRODUCT,
    api: CONSOLE_QUOTA_API,
    _v: 'undefined',
  })
}

function dashboardURL(selectedRegion, host) {
  if (!host) return selectedRegion.dashboard
  const base = new URL(clean(host).match(/^https?:\/\//i) ? clean(host) : `https://${clean(host)}`)
  const target = new URL(selectedRegion.dashboard)
  base.pathname = target.pathname
  base.search = target.search
  base.hash = target.hash
  return base.toString()
}

function gatewayBaseURL(selectedRegion, host) {
  const base = new URL(host ? (clean(host).match(/^https?:\/\//i) ? clean(host) : `https://${clean(host)}`) : selectedRegion.gatewayBase)
  base.pathname = ''
  base.search = ''
  base.hash = ''
  return base.toString().replace(/\/$/, '')
}

function apiRequestBody(selectedRegion) {
  return JSON.stringify({
    queryCodingPlanInstanceInfoRequest: {
      commodityCode: selectedRegion.commodityCode,
    },
  })
}

function consoleRequestBody(selectedRegion, secToken, anonymousID) {
  const cornerstoneParam = {
    feTraceId: crypto.randomUUID().toLowerCase(),
    feURL: selectedRegion.dashboard,
    protocol: 'V2',
    console: 'ONE_CONSOLE',
    productCode: 'p_efm',
    domain: selectedRegion.consoleDomain,
    consoleSite: selectedRegion.consoleSite,
    userNickName: '',
    userPrincipalName: '',
    xsp_lang: 'en-US',
  }
  if (anonymousID) cornerstoneParam['X-Anonymous-Id'] = anonymousID

  const params = {
    Api: CONSOLE_QUOTA_API,
    V: '1.0',
    Data: {
      queryCodingPlanInstanceInfoRequest: {
        commodityCode: selectedRegion.commodityCode,
        onlyLatestOne: true,
      },
      cornerstoneParam,
    },
  }

  const body = new URLSearchParams()
  body.set('params', JSON.stringify(params))
  body.set('region', selectedRegion.currentRegionID)
  body.set('sec_token', secToken)
  return body.toString()
}

function expandedJSON(value) {
  if (Array.isArray(value)) return value.map(expandedJSON)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, nested] of Object.entries(value)) out[key] = expandedJSON(nested)
    return out
  }
  if (typeof value === 'string') {
    try {
      const nested = JSON.parse(value)
      if (nested && (typeof nested === 'object' || Array.isArray(nested))) return expandedJSON(nested)
    } catch {
      /* leave scalar string */
    }
  }
  return value
}

function parseNumber(raw) {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function parseString(raw) {
  const text = clean(raw)
  return text || null
}

function parseDate(raw) {
  const n = parseNumber(raw)
  if (n != null) {
    if (n > 1000000000000) return n
    if (n > 1000000000) return n * 1000
  }
  const text = parseString(raw)
  if (!text) return null
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : null
}

function parseBool(raw) {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  const text = parseString(raw)?.toLowerCase()
  if (!text) return null
  if (['true', '1', 'yes', 'active', 'valid'].includes(text)) return true
  if (['false', '0', 'no', 'inactive', 'invalid', 'expired'].includes(text)) return false
  return null
}

function anyString(keys, dict) {
  for (const key of keys) {
    const value = parseString(dict?.[key])
    if (value) return value
  }
  return null
}

function anyNumber(keys, dict) {
  for (const key of keys) {
    const value = parseNumber(dict?.[key])
    if (value != null) return value
  }
  return null
}

function anyDate(keys, dict) {
  for (const key of keys) {
    const value = parseDate(dict?.[key])
    if (value != null) return value
  }
  return null
}

function anyBool(keys, dict) {
  for (const key of keys) {
    const value = parseBool(dict?.[key])
    if (value != null) return value
  }
  return null
}

function findFirstValue(keys, value, parser) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstValue(keys, item, parser)
      if (found != null) return found
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const key of keys) {
      const parsed = parser(value[key])
      if (parsed != null) return parsed
    }
    for (const nested of Object.values(value)) {
      const found = findFirstValue(keys, nested, parser)
      if (found != null) return found
    }
  }
  return null
}

function findFirstArray(keys, value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstArray(keys, item)
      if (found) return found
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const key of keys) {
      if (Array.isArray(value[key])) return value[key]
    }
    for (const nested of Object.values(value)) {
      const found = findFirstArray(keys, nested)
      if (found) return found
    }
  }
  return null
}

function findFirstDictionary(keys, value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstDictionary(keys, item)
      if (found) return found
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const key of keys) {
      const found = value[key]
      if (found && typeof found === 'object' && !Array.isArray(found)) return found
    }
    for (const nested of Object.values(value)) {
      const found = findFirstDictionary(keys, nested)
      if (found) return found
    }
  }
  return null
}

function findQuotaInfo(payload) {
  const direct = findFirstDictionary(['codingPlanQuotaInfo', 'coding_plan_quota_info'], payload)
  if (direct) return direct
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findQuotaInfo(item)
      if (found) return found
    }
    return null
  }
  if (payload && typeof payload === 'object') {
    const hasQuota = [
      'per5HourUsedQuota',
      'per5HourTotalQuota',
      'perWeekUsedQuota',
      'perWeekTotalQuota',
      'perBillMonthUsedQuota',
      'perBillMonthTotalQuota',
    ].some((key) => payload[key] != null)
    if (hasQuota) return payload
    for (const nested of Object.values(payload)) {
      const found = findQuotaInfo(nested)
      if (found) return found
    }
  }
  return null
}

function activeSignalScore(source, now = Date.now()) {
  const status = anyString(['status', 'instanceStatus'], source)?.toUpperCase()
  if (['VALID', 'ACTIVE'].includes(status)) return 3
  if (['EXPIRED', 'INVALID', 'INACTIVE', 'DISABLED', 'TERMINATED', 'STOPPED'].includes(status)) return -1

  const active = anyBool(['isActive', 'active'], source)
  if (active != null) return active ? 3 : -1

  const expiry = anyDate(['endTime', 'periodEndTime', 'expireTime', 'expirationTime'], source)
  if (expiry != null && expiry - now > 0) return 1
  return 0
}

function findPlanName(payload) {
  const infos = findFirstArray(['codingPlanInstanceInfos', 'coding_plan_instance_infos'], payload)
  if (infos) {
    for (const info of infos) {
      if (!info || typeof info !== 'object') continue
      const name = anyString(['planName', 'plan_name', 'instanceName', 'instance_name', 'packageName', 'package_name'], info)
      if (name) return name
    }
  }
  return findFirstValue(['planName', 'plan_name', 'packageName', 'package_name'], payload, parseString)
}

function findActiveInstanceInfo(payload, now = Date.now()) {
  const infos = findFirstArray(['codingPlanInstanceInfos', 'coding_plan_instance_infos'], payload)
  if (!infos) return null
  let first = null
  let best = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const item of infos) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    first = first || item
    const score = activeSignalScore(item, now)
    if (score > bestScore) {
      best = item
      bestScore = score
    }
  }
  return bestScore > 0 ? best : first
}

function containsPlanInstances(payload) {
  const infos = findFirstArray(['codingPlanInstanceInfos', 'coding_plan_instance_infos'], payload)
  return Array.isArray(infos) && infos.some((item) => item && typeof item === 'object' && !Array.isArray(item))
}

function hasPositiveActivePlanSignal(source, payload, now) {
  if (containsPlanInstances(payload)) return activeSignalScore(source, now) > 0
  return activeSignalScore(source, now) > 0 || activeSignalScore(payload, now) > 0
}

function parsePlanVisibleActiveFallback(payload, instanceInfo, now) {
  const source = instanceInfo || payload
  if (!hasPositiveActivePlanSignal(source, payload, now)) return null
  const planName = findPlanName(source) || findPlanName(payload)
  if (!planName) return null
  return {
    connected: true,
    planName,
    fiveHourUsedQuota: null,
    fiveHourTotalQuota: null,
    fiveHourNextRefreshTime: null,
    weeklyUsedQuota: null,
    weeklyTotalQuota: null,
    weeklyNextRefreshTime: null,
    monthlyUsedQuota: null,
    monthlyTotalQuota: null,
    monthlyNextRefreshTime: null,
    lastActive: now,
  }
}

function parseUsageSnapshot(json, now = Date.now(), authMode = 'web') {
  const dictionary = expandedJSON(json)
  if (!dictionary || typeof dictionary !== 'object' || Array.isArray(dictionary)) {
    throw new Error('Unexpected Alibaba Coding Plan payload')
  }

  const statusCode = findFirstValue(['statusCode', 'status_code', 'code'], dictionary, parseNumber)
  if (statusCode != null && statusCode !== 0 && statusCode !== 200) {
    const message = findFirstValue(['statusMessage', 'status_msg', 'message', 'msg'], dictionary, parseString) || `status code ${statusCode}`
    const lower = message.toLowerCase()
    if (statusCode === 401 || statusCode === 403 || lower.includes('api key') || lower.includes('unauthorized')) {
      throw new Error('Alibaba Coding Plan credentials are invalid')
    }
    throw new Error(`Alibaba Coding Plan API error: ${message}`)
  }

  const codeText = findFirstValue(['code', 'status', 'statusCode'], dictionary, parseString)?.toLowerCase()
  const messageText = findFirstValue(['message', 'msg', 'statusMessage'], dictionary, parseString)?.toLowerCase()
  if ((codeText && codeText.includes('login')) || (messageText && (messageText.includes('log in') || messageText.includes('login')))) {
    throw new Error(authMode === 'api' ? 'Alibaba Coding Plan API key mode unavailable for this account or region' : 'Alibaba Coding Plan console login required')
  }

  const instanceInfo = findActiveInstanceInfo(dictionary, now)
  const infos = findFirstArray(['codingPlanInstanceInfos', 'coding_plan_instance_infos'], dictionary) || []
  const shouldScopeQuota = infos.length > 1 && instanceInfo && activeSignalScore(instanceInfo, now) > 0
  const quota = shouldScopeQuota ? findQuotaInfo(instanceInfo) : findQuotaInfo(instanceInfo || {}) || findQuotaInfo(dictionary)

  if (!quota) {
    const fallback = parsePlanVisibleActiveFallback(dictionary, instanceInfo, now)
    if (fallback) return fallback
    throw new Error('Missing Alibaba Coding Plan quota data')
  }

  const planName = findPlanName(instanceInfo || {}) || findPlanName(dictionary)
  const snapshot = {
    connected: true,
    planName,
    fiveHourUsedQuota: anyNumber(['per5HourUsedQuota', 'perFiveHourUsedQuota'], quota),
    fiveHourTotalQuota: anyNumber(['per5HourTotalQuota', 'perFiveHourTotalQuota'], quota),
    fiveHourNextRefreshTime: anyDate(['per5HourQuotaNextRefreshTime', 'perFiveHourQuotaNextRefreshTime'], quota),
    weeklyUsedQuota: anyNumber(['perWeekUsedQuota'], quota),
    weeklyTotalQuota: anyNumber(['perWeekTotalQuota'], quota),
    weeklyNextRefreshTime: anyDate(['perWeekQuotaNextRefreshTime'], quota),
    monthlyUsedQuota: anyNumber(['perBillMonthUsedQuota', 'perMonthUsedQuota'], quota),
    monthlyTotalQuota: anyNumber(['perBillMonthTotalQuota', 'perMonthTotalQuota'], quota),
    monthlyNextRefreshTime: anyDate(['perBillMonthQuotaNextRefreshTime', 'perMonthQuotaNextRefreshTime'], quota),
    lastActive: now,
  }

  if (!snapshot.fiveHourTotalQuota && !snapshot.weeklyTotalQuota && !snapshot.monthlyTotalQuota) {
    const fallback = parsePlanVisibleActiveFallback(dictionary, instanceInfo, now)
    if (fallback) return fallback
    throw new Error('No Alibaba Coding Plan quota windows found')
  }
  return snapshot
}

function quotaWindow(label, used, total, resetAt, periodMs, now = Date.now()) {
  if (!(total > 0)) return null
  const normalizedUsed = Math.max(0, Math.min(used || 0, total))
  let normalizedReset = resetAt || null
  if (label === '5-hour' && normalizedReset != null && normalizedReset - now < 60000) {
    normalizedReset += 5 * 60 * 60000
    if (normalizedReset - now < 60000) normalizedReset = now + 5 * 60 * 60000
  }
  return {
    label,
    used: normalizedUsed,
    total,
    usedPct: Math.max(0, Math.min(100, (normalizedUsed / total) * 100)),
    resetAt: normalizedReset,
    periodMs,
  }
}

function toWindows(snapshot, now = Date.now()) {
  return [
    quotaWindow('5-hour', snapshot.fiveHourUsedQuota, snapshot.fiveHourTotalQuota, snapshot.fiveHourNextRefreshTime, 5 * 60 * 60000, now),
    quotaWindow('Weekly', snapshot.weeklyUsedQuota, snapshot.weeklyTotalQuota, snapshot.weeklyNextRefreshTime, 7 * 86400000, now),
    quotaWindow('Monthly', snapshot.monthlyUsedQuota, snapshot.monthlyTotalQuota, snapshot.monthlyNextRefreshTime, 30 * 86400000, now),
  ].filter(Boolean)
}

function extractCookieValue(name, cookieHeader) {
  for (const part of String(cookieHeader || '').split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key === name && value) return value
  }
  return null
}

function extractSECTokenFromHTML(html) {
  const patterns = [
    /SEC_TOKEN\s*:\s*"([^"]+)"/,
    /SEC_TOKEN\s*:\s*'([^']+)'/,
    /secToken\s*:\s*"([^"]+)"/,
    /sec_token\s*:\s*"([^"]+)"/,
    /sec_token\s*:\s*'([^']+)'/,
    /"SEC_TOKEN"\s*:\s*"([^"]+)"/,
    /"sec_token"\s*:\s*"([^"]+)"/,
  ]
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

async function resolveSECToken(cookieHeader, selectedRegion, options) {
  const cookieToken = extractCookieValue('sec_token', cookieHeader)
  try {
    const res = await fetchWithTimeout(
      dashboardURL(selectedRegion, options.host),
      {
        headers: {
          Cookie: cookieHeader,
          'User-Agent': SAFARI_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      },
      15000,
    )
    if (res.ok) {
      const token = extractSECTokenFromHTML(await res.text())
      if (token) return token
    }
  } catch {
    /* try user info */
  }

  try {
    const base = gatewayBaseURL(selectedRegion, options.host)
    const res = await fetchWithTimeout(
      `${base}/tool/user/info.json`,
      {
        headers: {
          Cookie: cookieHeader,
          'User-Agent': SAFARI_USER_AGENT,
          Accept: 'application/json, text/plain, */*',
          Referer: `${base}/`,
        },
      },
      15000,
    )
    if (res.ok) {
      const data = expandedJSON(JSON.parse(await res.text()))
      const token = findFirstValue(['secToken', 'sec_token'], data, parseString)
      if (token) return token
    }
  } catch {
    /* fall back to cookie */
  }

  if (cookieToken) return cookieToken
  throw new Error('Alibaba Coding Plan console login required')
}

async function fetchWithAPIKey(apiKey, selectedRegion, options) {
  const res = await fetchWithTimeout(
    quotaURL(selectedRegion, options),
    {
      method: 'POST',
      body: apiRequestBody(selectedRegion),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
        'X-DashScope-API-Key': apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: selectedRegion.gatewayBase,
        Referer: selectedRegion.dashboard,
        'User-Agent': USER_AGENT,
      },
    },
    15000,
  )
  const text = await res.text()
  if (res.status === 401 || res.status === 403) throw new Error('Alibaba Coding Plan credentials are invalid')
  if (!res.ok) throw new Error(`Alibaba Coding Plan HTTP ${res.status}`)
  return parseUsageSnapshot(JSON.parse(text), Date.now(), 'api')
}

async function fetchWithCookie(cookieHeader, selectedRegion, options) {
  const secToken = await resolveSECToken(cookieHeader, selectedRegion, options)
  const csrf = extractCookieValue('login_aliyunid_csrf', cookieHeader) || extractCookieValue('csrf', cookieHeader)
  const headers = {
    Cookie: cookieHeader,
    Accept: '*/*',
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Requested-With': 'XMLHttpRequest',
    Origin: selectedRegion.gatewayBase,
    Referer: selectedRegion.consoleReferer,
    'User-Agent': USER_AGENT,
  }
  if (csrf) {
    headers['x-xsrf-token'] = csrf
    headers['x-csrf-token'] = csrf
  }

  const res = await fetchWithTimeout(
    consoleQuotaURL(selectedRegion, options),
    {
      method: 'POST',
      body: consoleRequestBody(selectedRegion, secToken, extractCookieValue('cna', cookieHeader)),
      headers,
    },
    15000,
  )
  const text = await res.text()
  if (res.status === 401 || res.status === 403) throw new Error('Alibaba Coding Plan console login required')
  if (!res.ok) throw new Error(`Alibaba Coding Plan HTTP ${res.status}`)
  return parseUsageSnapshot(JSON.parse(text), Date.now(), 'web')
}

function shouldRetryChina(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return (
    message.includes('credentials') ||
    message.includes('http 403') ||
    message.includes('http 404') ||
    message.includes('missing alibaba coding plan quota') ||
    message.includes('no alibaba coding plan quota')
  )
}

async function withRegionFallback(selectedRegion, fn) {
  try {
    return await fn(selectedRegion)
  } catch (err) {
    if (selectedRegion.id !== 'intl' || !shouldRetryChina(err)) throw err
    return fn(REGIONS.cn)
  }
}

async function read() {
  const credentials = resolveCredentials()
  const options = { host: credentials.host, quotaURL: credentials.quotaURL }
  const selectedRegion = credentials.region
  try {
    if (credentials.cookieHeader) {
      const snapshot = await withRegionFallback(selectedRegion, (r) => fetchWithCookie(credentials.cookieHeader, r, options))
      return { ...snapshot, source: 'web', region: selectedRegion.id, windows: toWindows(snapshot) }
    }
    if (credentials.apiKey) {
      const snapshot = await withRegionFallback(selectedRegion, (r) => fetchWithAPIKey(credentials.apiKey, r, options))
      return { ...snapshot, source: 'api', region: selectedRegion.id, windows: toWindows(snapshot) }
    }
    return { connected: false, error: 'Alibaba Coding Plan API key or cookie not configured' }
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    consoleQuotaURL,
    dashboardURL,
    normalizeCookieHeader,
    parseSaved,
    parseUsageSnapshot,
    quotaURL,
    region,
    resolveCredentials,
    toWindows,
  },
}
