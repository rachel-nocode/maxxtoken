const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const QUOTA_PATH = '/api/monitor/usage/quota/limit'
const MODEL_USAGE_PATH = '/api/monitor/usage/model-usage'
const SUBSCRIPTION_PATH = '/api/biz/subscription/list'

const REGIONS = {
  global: 'https://api.z.ai',
  'bigmodel-cn': 'https://open.bigmodel.cn',
}

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function parseSaved(value) {
  const text = clean(value)
  if (!text) return {}
  if (!text.startsWith('{')) return { apiKey: text }
  try {
    const json = JSON.parse(text)
    return {
      apiKey: clean(json.apiKey || json.api_key || json.token),
      apiHost: clean(json.apiHost || json.api_host || json.host || json.baseURL || json.baseUrl),
      quotaURL: clean(json.quotaURL || json.quotaUrl || json.quota_url),
      region: clean(json.region || json.apiRegion || json.api_region),
    }
  } catch {
    return {}
  }
}

function normalizeRegion(value) {
  const text = clean(value)
  if (!text) return 'global'
  const lower = text.toLowerCase()
  if (lower === 'bigmodelcn' || lower === 'bigmodel_cn' || lower === 'cn' || lower === 'china') return 'bigmodel-cn'
  return REGIONS[lower] ? lower : 'global'
}

function withScheme(raw) {
  const text = clean(raw)
  if (!text) return null
  return /^https?:\/\//i.test(text) ? text : `https://${text}`
}

function urlFromBase(raw, path) {
  const text = withScheme(raw)
  if (!text) return null
  try {
    const url = new URL(text)
    if (!url.pathname || url.pathname === '/') url.pathname = path
    return url.toString()
  } catch {
    return null
  }
}

function resolveCredentials() {
  const saved = parseSaved(getKey('zai'))
  const env = process.env
  return {
    apiKey: clean(env.ZAI_API_KEY) || clean(env.Z_AI_API_KEY) || clean(env.GLM_API_KEY) || saved.apiKey || null,
    apiHost: clean(env.Z_AI_API_HOST) || saved.apiHost || null,
    quotaURL: clean(env.Z_AI_QUOTA_URL) || saved.quotaURL || null,
    region: normalizeRegion(env.Z_AI_API_REGION || saved.region),
  }
}

function quotaURL({ region = 'global', apiHost = null, quotaURL: override = null } = {}) {
  if (override) {
    const url = withScheme(override)
    if (url) return url
  }
  if (apiHost) {
    const url = urlFromBase(apiHost, QUOTA_PATH)
    if (url) return url
  }
  return urlFromBase(REGIONS[normalizeRegion(region)], QUOTA_PATH)
}

function modelUsageURL({ region = 'global', apiHost = null } = {}) {
  if (apiHost) {
    const url = urlFromBase(apiHost, MODEL_USAGE_PATH)
    if (url) return url
  }
  return urlFromBase(REGIONS[normalizeRegion(region)], MODEL_USAGE_PATH)
}

function subscriptionURL({ region = 'global', apiHost = null } = {}) {
  if (apiHost) {
    const url = urlFromBase(apiHost, SUBSCRIPTION_PATH)
    if (url) return url
  }
  return urlFromBase(REGIONS[normalizeRegion(region)], SUBSCRIPTION_PATH)
}

function number(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function clampPct(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, n))
}

function windowMinutes(unit, count) {
  const n = number(count)
  if (!n || n <= 0) return null
  if (unit === 5) return n
  if (unit === 3) return n * 60
  if (unit === 1) return n * 24 * 60
  if (unit === 6) return n * 7 * 24 * 60
  return null
}

function windowDescription(unit, count) {
  const n = number(count)
  if (!n || n <= 0) return null
  const unitName = unit === 5 ? 'minute' : unit === 3 ? 'hour' : unit === 1 ? 'day' : unit === 6 ? 'week' : null
  if (!unitName) return null
  return `${n} ${unitName}${n === 1 ? '' : 's'}`
}

function usedPercent(limit) {
  const total = number(limit.usage)
  if (total && total > 0) {
    let usedRaw = null
    const remaining = number(limit.remaining)
    const currentValue = number(limit.currentValue)
    if (remaining != null) {
      const usedFromRemaining = total - remaining
      usedRaw = currentValue != null ? Math.max(usedFromRemaining, currentValue) : usedFromRemaining
    } else if (currentValue != null) {
      usedRaw = currentValue
    }
    if (usedRaw != null) return clampPct((Math.max(0, Math.min(total, usedRaw)) / total) * 100)
  }
  return clampPct(limit.percentage)
}

function parseLimit(raw) {
  if (!raw || typeof raw !== 'object') return null
  const type = clean(raw.type || raw.name)
  if (type !== 'TOKENS_LIMIT' && type !== 'CREDIT_LIMIT' && type !== 'TIME_LIMIT') return null
  const unit = number(raw.unit) ?? 0
  const count = number(raw.number) ?? 0
  const description = windowDescription(unit, count)
  const resetMs = number(raw.nextResetTime)
  return {
    type,
    unit,
    number: count,
    usage: number(raw.usage),
    currentValue: number(raw.currentValue),
    remaining: number(raw.remaining),
    percentage: clampPct(raw.percentage),
    usedPct: usedPercent(raw),
    usageDetails: Array.isArray(raw.usageDetails) ? raw.usageDetails : [],
    nextResetAt: resetMs ? resetMs : null,
    windowMinutes: windowMinutes(unit, count),
    windowLabel: description ? `${description} window` : null,
    isMCPMonthlyMarker: type === 'TIME_LIMIT' && unit === 5 && count === 1,
  }
}

function planNameFromData(data) {
  return clean(data?.planName || data?.plan || data?.plan_type || data?.packageName || data?.level)
}

function parseUsageSnapshot(json, now = Date.now()) {
  if (!json || typeof json !== 'object') throw new Error('Invalid z.ai response')
  if (json.success === false) {
    const message = json.msg || 'z.ai API error'
    const error = new Error(message)
    if (/coding plan/i.test(message)) error.noCodingPlan = true
    throw error
  }
  if (json.code != null && Number(json.code) !== 200) throw new Error(json.msg || 'z.ai API error')
  if (!json.data || typeof json.data !== 'object') throw new Error('Missing data')

  const tokenLimits = []
  let timeLimit = null
  for (const raw of json.data.limits || []) {
    const entry = parseLimit(raw)
    if (!entry) continue
    if (entry.type === 'TOKENS_LIMIT' || entry.type === 'CREDIT_LIMIT') {
      if (entry.usedPct == null) throw new Error('Missing z.ai quota percentage')
      tokenLimits.push(entry)
    }
    if (entry.type === 'TIME_LIMIT') {
      if (entry.currentValue == null || entry.usage == null || entry.currentValue < 0 || entry.usage < 0) {
        throw new Error('Missing z.ai web-search usage')
      }
      timeLimit = entry
    }
  }

  tokenLimits.sort((a, b) => (a.windowMinutes ?? Number.MAX_SAFE_INTEGER) - (b.windowMinutes ?? Number.MAX_SAFE_INTEGER))
  const sessionTokenLimit = tokenLimits.find((limit) => limit.windowMinutes != null && limit.windowMinutes < 24 * 60) || null
  const tokenLimit = [...tokenLimits].reverse().find((limit) => limit.windowMinutes == null || limit.windowMinutes >= 24 * 60) || null

  return {
    connected: true,
    tokenLimit,
    sessionTokenLimit,
    timeLimit,
    planName: planNameFromData(json.data),
    modelUsage: null,
    lastActive: now,
  }
}

function parseSubscription(json) {
  if (!json || typeof json !== 'object') return null
  const list = Array.isArray(json.data) ? json.data : []
  for (const item of list) {
    const plan = clean(item?.productName || item?.planName || item?.name)
    if (plan) return plan
  }
  return null
}

function parseModelUsage(json) {
  if (!json || typeof json !== 'object') throw new Error('Invalid z.ai model usage response')
  if (json.success !== true || json.code !== 200) throw new Error(json.msg || 'z.ai model usage API error')
  const data = json.data || {}
  const modelDataList = Array.isArray(data.modelDataList) ? data.modelDataList : []
  let totalTokens = 0
  const modelNames = []
  const models = modelDataList.map((item) => {
    const modelName = clean(item?.modelName)
    if (modelName) modelNames.push(modelName)
    const tokensUsage = Array.isArray(item?.tokensUsage) ? item.tokensUsage.map((n) => number(n)) : []
    totalTokens += tokensUsage.reduce((sum, n) => sum + (n || 0), 0)
    return { modelName, tokensUsage }
  })
  return {
    xTime: Array.isArray(data.x_time) ? data.x_time : [],
    modelDataList: models,
    modelNames,
    totalTokens,
  }
}

function formatLocalHour(date, endOfHour = false) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${endOfHour ? '59:59' : '00:00'}`
}

function modelUsageQueryURL(base) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0)
  const url = new URL(base)
  url.searchParams.set('startTime', formatLocalHour(start))
  url.searchParams.set('endTime', formatLocalHour(now, true))
  return url.toString()
}

async function getJSON(url, apiKey, headers = {}, timeoutMs = 15000) {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        ...headers,
      },
    },
    timeoutMs,
  )
  const text = await res.text()
  if (!res.ok) {
    const error = new Error(`z.ai HTTP ${res.status}: ${text.slice(0, 200)}`)
    error.status = res.status
    throw error
  }
  if (!text.trim()) throw new Error('Empty response body')
  return JSON.parse(text)
}

async function read(options = {}) {
  const credentials = options.credentials || resolveCredentials()
  if (!credentials.apiKey) return { connected: false, needsKey: true, error: 'z.ai API token not configured' }
  try {
    const get = options.getJSON || getJSON
    const quota = await get(quotaURL(credentials), credentials.apiKey)
    const snapshot = parseUsageSnapshot(quota, options.now || Date.now())
    try {
      snapshot.planName = parseSubscription(await get(subscriptionURL(credentials), credentials.apiKey)) || snapshot.planName
    } catch {
      /* plan label is optional; preserve required quota data */
    }
    try {
      const usage = await get(
        modelUsageQueryURL(modelUsageURL(credentials)),
        credentials.apiKey,
        { 'Content-Type': 'application/json' },
        10000,
      )
      snapshot.modelUsage = parseModelUsage(usage)
    } catch {
      snapshot.modelUsage = null
    }
    return snapshot
  } catch (err) {
    return {
      connected: false,
      needsKey: err?.status === 401 || err?.status === 403,
      error: err?.noCodingPlan
        ? 'No active GLM Coding Plan. Subscribe at z.ai/subscribe to see usage.'
        : err && err.message ? err.message : String(err),
    }
  }
}

module.exports = {
  read,
  _private: {
    clean,
    modelUsageQueryURL,
    modelUsageURL,
    parseLimit,
    parseModelUsage,
    parseSaved,
    parseSubscription,
    parseUsageSnapshot,
    quotaURL,
    resolveCredentials,
    subscriptionURL,
    windowMinutes,
  },
}
