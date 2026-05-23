const crypto = require('crypto')
const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
const SAFARI_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Safari/605.1.15'

const GATEWAY_BASE = 'https://bailian-cs.console.aliyun.com'
const DASHBOARD_ORIGIN = 'https://bailian.console.aliyun.com'
const DASHBOARD_URL = 'https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/token-plan'
const CURRENT_REGION_ID = 'cn-beijing'
const API_NAME = 'zeldaEasy.bailian-commerce.tokenPlan.queryTokenPlanInstanceInfo'
const COMMODITY_CODE = 'sfm_tokenplanteams_dp_cn'

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
        cookieHeader: clean(json.cookieHeader || json.cookie || json.session),
        host: clean(json.host),
        quotaURL: clean(json.quotaURL || json.quotaUrl),
      }
    }
  } catch {
    /* fall through */
  }
  return { cookieHeader: text }
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

function resolveCredentials() {
  const saved = parseSaved(getKey('alibabatokenplan'))
  return {
    cookieHeader: normalizeCookieHeader(process.env.ALIBABA_TOKEN_PLAN_COOKIE || saved.cookieHeader),
    host: clean(process.env.ALIBABA_TOKEN_PLAN_HOST) || saved.host || null,
    quotaURL: clean(process.env.ALIBABA_TOKEN_PLAN_QUOTA_URL) || saved.quotaURL || null,
  }
}

function withPathAndQuery(rawHost, path, query) {
  const base = new URL(clean(rawHost)?.match(/^https?:\/\//i) ? clean(rawHost) : `https://${clean(rawHost)}`)
  base.pathname = path
  base.search = ''
  for (const [name, value] of Object.entries(query || {})) base.searchParams.set(name, value)
  base.hash = ''
  return base.toString()
}

function quotaURL({ host, quotaURL: override } = {}) {
  if (override) return clean(override)?.match(/^https?:\/\//i) ? clean(override) : `https://${clean(override)}`
  return withPathAndQuery(host || GATEWAY_BASE, '/data/api.json', {
    action: 'BroadScopeAspnGateway',
    product: 'sfm_bailian',
    api: API_NAME,
    _v: 'undefined',
  })
}

function dashboardURL(host) {
  if (!host) return DASHBOARD_URL
  const base = new URL(clean(host).match(/^https?:\/\//i) ? clean(host) : `https://${clean(host)}`)
  const target = new URL(DASHBOARD_URL)
  base.pathname = target.pathname
  base.search = target.search
  base.hash = target.hash
  return base.toString()
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
    /"secToken"\s*:\s*"([^"]+)"/,
    /"sec_token"\s*:\s*"([^"]+)"/,
    /secToken['"]?\s*[:=]\s*['"]([^'"]+)['"]/,
    /sec_token['"]?\s*[:=]\s*['"]([^'"]+)['"]/,
  ]
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

async function resolveSECToken(cookieHeader, options) {
  try {
    const res = await fetchWithTimeout(
      dashboardURL(options.host),
      {
        headers: {
          Cookie: cookieHeader,
          'User-Agent': SAFARI_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      },
      10000,
    )
    if (res.ok) {
      const token = extractSECTokenFromHTML(await res.text())
      if (token) return token
    }
  } catch {
    /* sec_token is optional for some authenticated sessions */
  }
  return extractCookieValue('sec_token', cookieHeader)
}

function requestBody(secToken, anonymousID) {
  const cornerstoneParam = {
    feTraceId: crypto.randomUUID().toLowerCase(),
    feURL: DASHBOARD_URL,
    protocol: 'V2',
    console: 'ONE_CONSOLE',
    productCode: 'p_efm',
    domain: 'bailian.console.aliyun.com',
    consoleSite: 'BAILIAN_ALIYUN',
    userNickName: '',
    userPrincipalName: '',
    xsp_lang: 'zh-CN',
  }
  if (anonymousID) cornerstoneParam['X-Anonymous-Id'] = anonymousID

  const params = {
    Api: API_NAME,
    V: '1.0',
    Data: {
      queryTokenPlanInstanceInfoRequest: {
        commodityCode: COMMODITY_CODE,
        onlyLatestOne: true,
      },
      cornerstoneParam,
    },
  }

  const body = new URLSearchParams()
  body.set('params', JSON.stringify(params))
  body.set('region', CURRENT_REGION_ID)
  if (secToken) body.set('sec_token', secToken)
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

function parseString(raw) {
  const text = String(raw == null ? '' : raw).trim()
  return text || null
}

function parseNumber(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'string') raw = raw.replace(/,/g, '')
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
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
  if (['true', '1', 'yes', 'active', 'valid', 'normal'].includes(text)) return true
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

function findFirstDictionaryWithAny(keys, value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstDictionaryWithAny(keys, item)
      if (found) return found
    }
    return null
  }
  if (value && typeof value === 'object') {
    if (keys.some((key) => value[key] != null)) return value
    for (const nested of Object.values(value)) {
      const found = findFirstDictionaryWithAny(keys, nested)
      if (found) return found
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

const PLAN_NAME_KEYS = [
  'planName',
  'plan_name',
  'packageName',
  'package_name',
  'commodityName',
  'commodity_name',
  'instanceName',
  'instance_name',
  'displayName',
  'display_name',
  'name',
  'title',
  'planType',
  'plan_type',
]
const USED_KEYS = ['usedQuota', 'used_quota', 'usedCredits', 'usedCredit', 'consumedCredits', 'usage', 'used', 'usedAmount', 'consumeAmount']
const TOTAL_KEYS = [
  'totalQuota',
  'total_quota',
  'totalCredits',
  'totalCredit',
  'quota',
  'creditLimit',
  'creditsTotal',
  'monthlyTotalQuota',
  'amount',
]
const REMAINING_KEYS = [
  'remainingQuota',
  'remainQuota',
  'remainingCredits',
  'remainingCredit',
  'availableCredits',
  'balance',
  'remaining',
  'availableAmount',
  'remainAmount',
]
const RESET_KEYS = [
  'nextRefreshTime',
  'resetTime',
  'periodEndTime',
  'billingCycleEnd',
  'billCycleEndTime',
  'expireTime',
  'expirationTime',
  'endTime',
  'validEndTime',
  'instanceEndTime',
]

function activeSignalScore(source) {
  const status = anyString(['status', 'instanceStatus', 'state'], source)?.toUpperCase()
  if (['VALID', 'ACTIVE', 'NORMAL'].includes(status)) return 3
  if (['EXPIRED', 'INVALID', 'INACTIVE', 'DISABLED', 'TERMINATED', 'STOPPED'].includes(status)) return -1
  const active = anyBool(['isActive', 'active'], source)
  if (active != null) return active ? 3 : -1
  return 0
}

function findTokenPlanInstance(payload) {
  const direct = findFirstDictionary(['tokenPlanInstanceInfo', 'token_plan_instance_info', 'instanceInfo', 'instance_info'], payload)
  if (direct) return direct
  const infos = findFirstArray(['tokenPlanInstanceInfos', 'token_plan_instance_infos', 'instanceInfos', 'instances'], payload)
  if (!infos) return null
  return infos
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .sort((a, b) => activeSignalScore(b) - activeSignalScore(a))[0] || null
}

function findQuotaInfo(payload) {
  return (
    findFirstDictionary(['quotaInfo', 'quota_info', 'tokenPlanQuotaInfo', 'token_plan_quota_info'], payload) ||
    findFirstDictionaryWithAny([...USED_KEYS, ...TOTAL_KEYS, ...REMAINING_KEYS], payload)
  )
}

function throwIfErrorPayload(dictionary) {
  const statusCode = findFirstValue(['statusCode', 'status_code', 'code'], dictionary, parseNumber)
  if (statusCode != null && statusCode !== 0 && statusCode !== 200) {
    const message = findFirstValue(['statusMessage', 'status_msg', 'message', 'msg'], dictionary, parseString) || `status code ${statusCode}`
    if (statusCode === 401 || statusCode === 403) throw new Error('Alibaba Token Plan credentials are invalid')
    throw new Error(`Alibaba Token Plan API error: ${message}`)
  }

  const codeText = findFirstValue(['code', 'status', 'statusCode'], dictionary, parseString)?.toLowerCase()
  const messageText = findFirstValue(['message', 'msg', 'statusMessage'], dictionary, parseString)?.toLowerCase()
  if (
    codeText?.includes('needlogin') ||
    codeText?.includes('login') ||
    messageText?.includes('log in') ||
    messageText?.includes('login')
  ) {
    throw new Error('Alibaba Token Plan login required')
  }
}

function parseUsageSnapshot(json, now = Date.now()) {
  const dictionary = expandedJSON(json)
  if (!dictionary || typeof dictionary !== 'object' || Array.isArray(dictionary)) {
    throw new Error('Unexpected Alibaba Token Plan payload')
  }
  throwIfErrorPayload(dictionary)

  const instance = findTokenPlanInstance(dictionary)
  const quota = findQuotaInfo(instance || {}) || findQuotaInfo(dictionary)
  const planName = anyString(PLAN_NAME_KEYS, instance || {}) || findFirstValue(PLAN_NAME_KEYS, dictionary, parseString)
  const usedQuota = quota ? anyNumber(USED_KEYS, quota) : null
  const totalQuota = quota ? anyNumber(TOTAL_KEYS, quota) : null
  const remainingQuota = quota ? anyNumber(REMAINING_KEYS, quota) : null
  const resetsAt = anyDate(RESET_KEYS, instance || {}) || findFirstValue(RESET_KEYS, dictionary, parseDate)

  if (!planName && totalQuota == null && usedQuota == null && remainingQuota == null) {
    throw new Error('Missing Alibaba Token Plan quota data')
  }

  return {
    connected: true,
    planName,
    usedQuota,
    totalQuota,
    remainingQuota,
    resetsAt,
    lastActive: now,
  }
}

function toWindows(snapshot) {
  const total = Number(snapshot?.totalQuota)
  if (!(total > 0)) return []
  const used =
    snapshot.usedQuota != null
      ? Number(snapshot.usedQuota)
      : snapshot.remainingQuota != null
        ? Math.max(0, total - Number(snapshot.remainingQuota))
        : null
  if (used == null || !Number.isFinite(used)) return []
  const normalizedUsed = Math.max(0, Math.min(used, total))
  return [
    {
      label: 'Monthly',
      used: normalizedUsed,
      total,
      usedPct: Math.max(0, Math.min(100, (normalizedUsed / total) * 100)),
      resetAt: snapshot.resetsAt || null,
      periodMs: 30 * 86400000,
    },
  ]
}

async function fetchWithCookie(cookieHeader, options) {
  const secToken = await resolveSECToken(cookieHeader, options)
  const csrf = extractCookieValue('login_aliyunid_csrf', cookieHeader) || extractCookieValue('csrf', cookieHeader)
  const headers = {
    Cookie: cookieHeader,
    Accept: '*/*',
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Requested-With': 'XMLHttpRequest',
    Origin: DASHBOARD_ORIGIN,
    Referer: DASHBOARD_URL,
    'User-Agent': USER_AGENT,
  }
  if (csrf) {
    headers['x-xsrf-token'] = csrf
    headers['x-csrf-token'] = csrf
  }

  const res = await fetchWithTimeout(
    quotaURL(options),
    {
      method: 'POST',
      body: requestBody(secToken, extractCookieValue('cna', cookieHeader)),
      headers,
    },
    20000,
  )
  const text = await res.text()
  if (res.status === 401 || res.status === 403) throw new Error('Alibaba Token Plan login required')
  if (!res.ok) throw new Error(`Alibaba Token Plan HTTP ${res.status}`)
  return parseUsageSnapshot(JSON.parse(text), Date.now())
}

async function read() {
  const credentials = resolveCredentials()
  const options = { host: credentials.host, quotaURL: credentials.quotaURL }
  try {
    if (!credentials.cookieHeader) return { connected: false, error: 'Alibaba Token Plan cookie not configured' }
    const snapshot = await fetchWithCookie(credentials.cookieHeader, options)
    return { ...snapshot, source: 'web', windows: toWindows(snapshot) }
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    dashboardURL,
    normalizeCookieHeader,
    parseSaved,
    parseUsageSnapshot,
    quotaURL,
    requestBody,
    resolveCredentials,
    toWindows,
  },
}
