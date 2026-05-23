const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const API_URL = 'https://platform.stepfun.com/api/step.openapi.devcenter.Dashboard/QueryStepPlanRateLimit'
const PLAN_STATUS_URL = 'https://platform.stepfun.com/api/step.openapi.devcenter.Dashboard/GetStepPlanStatus'
const WEB_ID = 'c8a1002d2c457e758785a9979832217c7c0b884c'

const BASE_HEADERS = {
  'content-type': 'application/json',
  'oasis-appid': '10300',
  'oasis-platform': 'web',
  'oasis-webid': WEB_ID,
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
}

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function normalizeToken(raw) {
  const text = clean(raw)
  if (!text) return null
  const match = text.match(/(?:^|;\s*)Oasis-Token=([^;]+)/)
  return clean(match ? match[1] : text)
}

function parseSavedConfig(raw) {
  const text = clean(raw)
  if (!text) return {}
  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text)
      return {
        token: normalizeToken(json.token || json.oasisToken || json.oasis_token || json.cookie || json.cookieHeader),
      }
    } catch {
      return {}
    }
  }
  return { token: normalizeToken(text) }
}

function resolveToken() {
  const saved = parseSavedConfig(getKey('stepfun'))
  return normalizeToken(process.env.STEPFUN_TOKEN) || saved.token || null
}

function number(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function timestamp(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n * 1000 : null
}

function clampPct(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function parseSnapshot(json, now = Date.now(), planName = null) {
  if (!json || typeof json !== 'object') throw new Error('Invalid StepFun response')
  if (json.status !== 1) throw new Error(json.message || json.desc || String(json.code || 'StepFun API error'))
  const fiveHourUsageLeftRate = number(json.five_hour_usage_left_rate)
  const weeklyUsageLeftRate = number(json.weekly_usage_left_rate)
  const fiveHourUsageResetTime = timestamp(json.five_hour_usage_reset_time)
  const weeklyUsageResetTime = timestamp(json.weekly_usage_reset_time)
  if (
    fiveHourUsageLeftRate == null ||
    weeklyUsageLeftRate == null ||
    fiveHourUsageResetTime == null ||
    weeklyUsageResetTime == null
  ) {
    throw new Error('Missing usage rate or reset time fields')
  }

  return {
    connected: true,
    fiveHourUsageLeftRate,
    weeklyUsageLeftRate,
    fiveHourUsageResetTime,
    weeklyUsageResetTime,
    fiveHourUsedPct: clampPct((1 - fiveHourUsageLeftRate) * 100),
    weeklyUsedPct: clampPct((1 - weeklyUsageLeftRate) * 100),
    planName: clean(planName),
    lastActive: now,
  }
}

function planNameFromStatus(json) {
  return clean(json?.subscription?.name)
}

function cookie(token) {
  return `Oasis-Token=${token}; Oasis-Webid=${WEB_ID}`
}

async function postJSON(url, token) {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        ...BASE_HEADERS,
        Cookie: cookie(token),
      },
      body: '{}',
    },
    15000,
  )
  const text = await res.text()
  if (!res.ok) {
    const error = new Error(`StepFun HTTP ${res.status}`)
    error.status = res.status
    throw error
  }
  return text ? JSON.parse(text) : {}
}

async function read() {
  const token = resolveToken()
  if (!token) return { connected: false, error: 'StepFun Oasis-Token not configured' }
  try {
    const usage = await postJSON(API_URL, token)
    let planName = null
    try {
      planName = planNameFromStatus(await postJSON(PLAN_STATUS_URL, token))
    } catch {
      planName = null
    }
    return parseSnapshot(usage, Date.now(), planName)
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) return { connected: false, error: 'StepFun token rejected' }
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    normalizeToken,
    parseSavedConfig,
    parseSnapshot,
    planNameFromStatus,
    resolveToken,
  },
}
