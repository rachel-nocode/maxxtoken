const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const GLOBAL = {
  platformBase: 'https://platform.minimax.io',
  apiBase: 'https://api.minimax.io',
}
const CHINA = {
  platformBase: 'https://platform.minimaxi.com',
  apiBase: 'https://api.minimaxi.com',
}
const REMAINS_PATH = '/v1/api/openplatform/coding_plan/remains'
const BILLING_PATH = '/account/amount'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text || null
}

function number(value) {
  if (value == null || value === '') return null
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
  const n = Number(value)
  if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeCookieHeader(raw) {
  let text = clean(raw)
  if (!text) return null
  const cookieFlag = text.match(/(?:--cookie|-b)\s+(['"])(.*?)\1/i)
  if (cookieFlag) text = cookieFlag[2]
  const header = text.match(/(?:-H\s+)?(['"])?cookie\s*:\s*([^'"\n\r]+)\1?/i)
  if (header) text = header[2]
  text = text.replace(/^cookie\s*:/i, '').trim()
  const pairs = []
  for (const chunk of text.split(';')) {
    const index = chunk.indexOf('=')
    if (index <= 0) continue
    const name = chunk.slice(0, index).trim()
    const value = chunk.slice(index + 1).trim()
    if (name && value && !/\s/.test(name)) pairs.push(`${name}=${value}`)
  }
  return pairs.length ? pairs.join('; ') : null
}

function authorizationToken(raw) {
  const match = String(raw || '').match(/(?:authorization\s*:\s*)?bearer\s+([A-Za-z0-9._~+/=-]+)/i)
  return clean(match && match[1])
}

function groupID(raw) {
  const text = String(raw || '')
  const header = text.match(/(?:groupid|group_id)\s*:\s*([A-Za-z0-9._:-]+)/i)
  if (header) return clean(header[1])
  const cookie = text.match(/(?:^|[;\s])(?:groupid|group_id)=([^;\s]+)/i)
  return clean(cookie && cookie[1])
}

function apiKeyKind(value) {
  const key = clean(value)
  if (!key) return null
  if (key.startsWith('sk-cp-')) return 'codingPlan'
  if (key.startsWith('sk-api-')) return 'standard'
  return 'unknown'
}

function parseCredentials(raw) {
  const text = clean(raw)
  if (!text) return {}
  let apiKey = null
  let cookieHeader = normalizeCookieHeader(text)
  let bearerToken = authorizationToken(text)
  let group = groupID(text)
  let region = null

  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text)
      apiKey = clean(json.apiKey || json.api_key || json.token)
      cookieHeader = normalizeCookieHeader(json.cookieHeader || json.cookie || json.session) || cookieHeader
      bearerToken = clean(json.authorizationToken || json.authorization_token || json.bearerToken || json.accessToken) || bearerToken
      group = clean(json.groupID || json.groupId || json.group_id) || group
      region = clean(json.region)
    } catch {
      /* fall through */
    }
  }

  if (!apiKey && /^sk-[A-Za-z0-9_-]+/.test(text)) apiKey = text
  return { apiKey, cookieHeader, bearerToken, groupID: group, region }
}

function resolveCredentials() {
  const saved = parseCredentials(getKey('minimax'))
  const envCookie = parseCredentials(process.env.MINIMAX_COOKIE || process.env.MINIMAX_COOKIE_HEADER)
  const envApi = clean(process.env.MINIMAX_CODING_API_KEY) || clean(process.env.MINIMAX_API_KEY)
  return {
    apiKey: envApi || saved.apiKey || null,
    cookieHeader: envCookie.cookieHeader || saved.cookieHeader || null,
    bearerToken: envCookie.bearerToken || clean(process.env.MINIMAX_AUTHORIZATION_TOKEN) || saved.bearerToken || null,
    groupID: envCookie.groupID || clean(process.env.MINIMAX_GROUP_ID) || saved.groupID || null,
    region: clean(process.env.MINIMAX_REGION) || saved.region || null,
  }
}

function regionURLs(region) {
  const base = String(region || '').toLowerCase().includes('cn') || String(region || '').toLowerCase().includes('china') ? CHINA : GLOBAL
  return {
    platformBase: clean(process.env.MINIMAX_HOST) || base.platformBase,
    apiBase: base.apiBase,
    remainsURL: clean(process.env.MINIMAX_REMAINS_URL) || `${base.apiBase}${REMAINS_PATH}`,
    billingURL: clean(process.env.MINIMAX_BILLING_HISTORY_URL) || `${base.platformBase}${BILLING_PATH}`,
  }
}

function serviceDisplayName(value) {
  const text = clean(value) || 'Usage'
  const key = text.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const names = {
    'text generation': 'Text Generation',
    'text to speech': 'Text to Speech',
    image: 'Image',
    'image generation': 'Image Generation',
    'text to video': 'Text to Video',
    'image to video': 'Image to Video',
    'music generation': 'Music Generation',
    'music generation · v2.6': 'Music Generation · v2.6',
    'music cover': 'Music Cover',
    'lyrics generation': 'Lyrics Generation',
    'image understanding': 'Image Understanding',
  }
  return names[key] || text
}

function windowMinutesFromType(value) {
  const text = String(value || '').toLowerCase()
  if (text.includes('today') || text.includes('day')) return 1440
  if (text.includes('week')) return 7 * 24 * 60
  const hours = text.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?/)
  if (hours) return Number(hours[1]) * 60
  const minutes = text.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?/)
  if (minutes) return Number(minutes[1])
  return null
}

function parseTimeRangeReset(value, now = Date.now()) {
  const text = clean(value)
  if (!text) return null
  const dated = text.match(/-\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2}\s+\d{1,2}:\d{2})/)
  if (dated) return timestamp(dated[1].replace(/\//g, '-'))
  const clock = text.match(/-\s*(\d{1,2}):(\d{2})/)
  if (!clock) return null
  const date = new Date(now)
  date.setHours(Number(clock[1]), Number(clock[2]), 0, 0)
  if (date.getTime() <= now) date.setDate(date.getDate() + 1)
  return date.getTime()
}

function serviceUsage(raw, now = Date.now()) {
  const limit = number(raw.limit ?? raw.total ?? raw.quota)
  const usage = number(raw.usage ?? raw.used ?? raw.used_count) || 0
  const remaining = limit == null ? number(raw.remaining) : Math.max(0, limit - usage)
  const providedPct = number(raw.percent ?? raw.used_percent ?? raw.usedPct)
  const usedPct = providedPct == null ? (limit > 0 ? clampPct((usage / limit) * 100) : 0) : clampPct(providedPct)
  const windowMinutes = windowMinutesFromType(raw.window_type || raw.windowType)
  return {
    label: serviceDisplayName(raw.service_type || raw.serviceType || raw.name),
    usage,
    limit,
    remaining,
    usedPct,
    windowMinutes,
    resetAt: timestamp(raw.reset_at || raw.resetsAt || raw.end_time) || parseTimeRangeReset(raw.time_range || raw.timeRange, now),
  }
}

function baseRespError(payload) {
  const base = payload?.base_resp || payload?.baseResp || payload?.base_response
  const code = number(base?.status_code ?? base?.statusCode ?? payload?.status_code)
  if (code == null || code === 0) return null
  const message = clean(base?.status_msg || base?.statusMessage || payload?.message || payload?.msg) || `MiniMax status ${code}`
  const err = new Error(message)
  if (code === 1004 || /login|cookie|auth|unauthorized|credential/i.test(message)) err.invalidCredentials = true
  return err
}

function payloadData(json) {
  return json?.data && typeof json.data === 'object' ? json.data : json || {}
}

function planName(payload) {
  return (
    clean(payload.plan_name) ||
    clean(payload.current_plan_title) ||
    clean(payload.current_subscribe_title) ||
    clean(payload.combo_title) ||
    clean(payload.current_combo_card?.title)
  )
}

function parseCodingPlanRemains(json, now = Date.now()) {
  const data = payloadData(json)
  const err = baseRespError(json) || baseRespError(data)
  if (err) throw err

  const rawServices = Array.isArray(data.services) ? data.services : Array.isArray(json?.services) ? json.services : []
  if (rawServices.length) {
    const services = rawServices.map((service) => serviceUsage(service, now))
    const primary = services.find((service) => service.label === 'Text Generation') || services[0]
    return {
      connected: true,
      planName: planName(data),
      services,
      availablePrompts: primary?.limit ?? null,
      currentPrompts: primary?.usage ?? null,
      remainingPrompts: primary?.remaining ?? null,
      usedPct: primary?.usedPct ?? null,
      windowMinutes: primary?.windowMinutes ?? null,
      resetsAt: primary?.resetAt ?? null,
      lastActive: now,
    }
  }

  const remains = Array.isArray(data.model_remains) ? data.model_remains[0] : data
  const total = number(remains?.current_interval_total_count ?? data.current_interval_total_count)
  const remaining = number(remains?.current_interval_usage_count ?? data.current_interval_usage_count)
  const used = total == null || remaining == null ? null : Math.max(0, total - remaining)
  const start = timestamp(remains?.start_time ?? data.start_time)
  const end = timestamp(remains?.end_time ?? data.end_time)
  const windowMinutes = start && end ? Math.round((end - start) / 60000) : windowMinutesFromType(remains?.window_type)
  const services = []

  if (total != null) {
    services.push({
      label: 'Text Generation',
      usage: used || 0,
      limit: total,
      remaining,
      usedPct: total > 0 && used != null ? clampPct((used / total) * 100) : 0,
      windowMinutes,
      resetAt: end,
    })
  }

  const weeklyTotal = number(remains?.current_weekly_total_count ?? data.current_weekly_total_count)
  const weeklyRemaining = number(remains?.current_weekly_usage_count ?? data.current_weekly_usage_count)
  if (weeklyTotal > 0) {
    const weeklyUsed = Math.max(0, weeklyTotal - (weeklyRemaining || 0))
    services.push({
      label: 'Weekly',
      usage: weeklyUsed,
      limit: weeklyTotal,
      remaining: weeklyRemaining,
      usedPct: clampPct((weeklyUsed / weeklyTotal) * 100),
      windowMinutes: 7 * 24 * 60,
      resetAt: timestamp(remains?.weekly_end_time ?? data.weekly_end_time),
    })
  }

  const primary = services[0]
  return {
    connected: true,
    planName: planName(data),
    services,
    availablePrompts: total,
    currentPrompts: used,
    remainingPrompts: remaining,
    usedPct: primary?.usedPct ?? null,
    windowMinutes,
    resetsAt: end,
    lastActive: now,
  }
}

function recordDate(record) {
  const ymd = clean(record.ymd)
  if (ymd && /^\d{8}$/.test(ymd)) return new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))).getTime()
  if (ymd && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(ymd)) return timestamp(ymd.replace(/\//g, '-'))
  return timestamp(record.created_at ?? record.createdAt ?? record.consume_time ?? record.consumeTime)
}

function parseBillingSummary(json, now = Date.now()) {
  const data = payloadData(json)
  const err = baseRespError(json) || baseRespError(data)
  if (err) throw err
  const records = Array.isArray(data.charge_records)
    ? data.charge_records
    : Array.isArray(data.records)
      ? data.records
      : Array.isArray(data.list)
        ? data.list
        : []
  const startToday = new Date(now)
  startToday.setHours(0, 0, 0, 0)
  const todayMs = startToday.getTime()
  const start30 = todayMs - 29 * 86400000
  const methods = new Map()
  const models = new Map()
  const daily = new Map()
  let todayTokens = 0
  let todayCash = 0
  let last30DaysTokens = 0
  let last30DaysCash = 0

  for (const record of records) {
    const status = clean(record.result || record.status)
    if (status && status.toUpperCase() !== 'SUCCESS') continue
    const date = recordDate(record)
    if (!date || date < start30 || date >= todayMs + 86400000) continue
    const tokens =
      (number(record.consume_token) ?? null) != null
        ? number(record.consume_token)
        : (number(record.consume_input_token) || 0) + (number(record.consume_output_token) || 0)
    const cash = number(record.consume_cash_after_voucher) ?? number(record.consume_cash) ?? 0
    const method = clean(record.method)
    const model = clean(record.model)
    last30DaysTokens += tokens || 0
    last30DaysCash += cash
    if (date >= todayMs) {
      todayTokens += tokens || 0
      todayCash += cash
    }
    const key = new Date(date).toISOString().slice(0, 10)
    daily.set(key, (daily.get(key) || 0) + (tokens || 0))
    if (method) methods.set(method, (methods.get(method) || 0) + (tokens || 0))
    if (model) models.set(model, (models.get(model) || 0) + (tokens || 0))
  }

  const top = (map) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, tokens]) => ({ name, tokens }))[0] || null

  return {
    todayTokens,
    todayCash,
    last30DaysTokens,
    last30DaysCash,
    dailyTokens: Object.fromEntries(daily),
    topMethod: top(methods),
    topModel: top(models),
  }
}

function headers(credentials = {}) {
  const out = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  }
  if (credentials.cookieHeader) out.Cookie = credentials.cookieHeader
  if (credentials.bearerToken) out.Authorization = `Bearer ${credentials.bearerToken}`
  if (credentials.apiKey) {
    out.Authorization = `Bearer ${credentials.apiKey}`
    out['MM-API-Source'] = 'CodexBar'
  }
  return out
}

async function getJSON(url, credentials, optional = false) {
  const res = await fetchWithTimeout(url, { method: 'GET', headers: headers(credentials) }, 15000)
  const text = await res.text()
  if (res.status === 401 || res.status === 403) {
    const err = new Error('MiniMax credentials rejected')
    err.invalidCredentials = true
    if (optional) return null
    throw err
  }
  if (!res.ok) {
    if (optional) return null
    const err = new Error(`MiniMax HTTP ${res.status}: ${text.slice(0, 200)}`)
    if (res.status === 404) err.notFound = true
    throw err
  }
  if (!text.trim()) return {}
  return JSON.parse(text)
}

async function readViaApi(credentials) {
  const kind = apiKeyKind(credentials.apiKey)
  if (kind === 'standard') throw new Error('MiniMax standard API keys cannot read Coding Plan usage')
  const regions = String(credentials.region || '').toLowerCase().includes('cn') ? ['cn'] : ['global', 'cn']
  let lastError = null
  for (const region of regions) {
    try {
      return parseCodingPlanRemains(await getJSON(regionURLs(region).remainsURL, { apiKey: credentials.apiKey }))
    } catch (err) {
      lastError = err
      if (!err.invalidCredentials && !err.notFound) break
    }
  }
  throw lastError
}

function withGroupID(url, group) {
  const out = new URL(url)
  if (group) out.searchParams.set('GroupId', group)
  return out.toString()
}

async function readViaWeb(credentials) {
  const urls = regionURLs(credentials.region)
  const remains = parseCodingPlanRemains(
    await getJSON(withGroupID(urls.remainsURL, credentials.groupID), credentials),
  )
  const billingURL = new URL(urls.billingURL)
  billingURL.searchParams.set('page', '1')
  billingURL.searchParams.set('limit', '100')
  billingURL.searchParams.set('aggregate', 'false')
  const billing = await getJSON(billingURL.toString(), credentials, true)
  return {
    ...remains,
    billingSummary: billing ? parseBillingSummary(billing) : null,
  }
}

async function read() {
  const credentials = resolveCredentials()
  if (!credentials.apiKey && !credentials.cookieHeader && !credentials.bearerToken) {
    return { connected: false, error: 'MiniMax coding API key, cookie, or copied curl not configured' }
  }
  try {
    if (credentials.apiKey) {
      try {
        return await readViaApi(credentials)
      } catch (err) {
        if (!credentials.cookieHeader && !credentials.bearerToken) throw err
      }
    }
    return await readViaWeb(credentials)
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    apiKeyKind,
    normalizeCookieHeader,
    parseBillingSummary,
    parseCodingPlanRemains,
    parseCredentials,
    parseTimeRangeReset,
    resolveCredentials,
    serviceUsage,
    windowMinutesFromType,
  },
}
