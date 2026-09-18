const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const CREDITS_ENDPOINT = 'https://openrouter.ai/api/v1/credits'
const KEY_ENDPOINT = 'https://openrouter.ai/api/v1/key'

function num(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseCredits(json) {
  const data = json && json.data
  if (!data || typeof data !== 'object') throw new Error('Invalid OpenRouter credits response')
  const totalUsage = num(data.total_usage)
  const totalCredits = num(data.total_credits)
  if (totalUsage == null && totalCredits == null) throw new Error('Missing OpenRouter credit totals')
  const lifetimeUsage = totalUsage == null ? null : Math.max(0, totalUsage)
  const purchases = totalCredits == null ? null : Math.max(0, totalCredits)
  return {
    lifetimeUsage,
    totalCredits: purchases,
    balance: purchases == null || lifetimeUsage == null ? null : Math.max(0, purchases - lifetimeUsage),
  }
}

function parseKey(json) {
  const data = json && json.data
  if (!data || typeof data !== 'object') throw new Error('Invalid OpenRouter key response')
  return {
    usage: Math.max(0, num(data.usage) ?? 0),
    dailyUsage: num(data.usage_daily) == null ? null : Math.max(0, num(data.usage_daily)),
    weeklyUsage: num(data.usage_weekly) == null ? null : Math.max(0, num(data.usage_weekly)),
    monthlyUsage: num(data.usage_monthly) == null ? null : Math.max(0, num(data.usage_monthly)),
    limit: data.limit == null ? null : Math.max(0, num(data.limit) ?? 0),
    remaining: data.limit_remaining == null ? null : Math.max(0, num(data.limit_remaining) ?? 0),
    limitReset: data.limit_reset || null,
    label: typeof data.label === 'string' ? data.label : '',
    isFreeTier: data.is_free_tier === true,
  }
}

async function getJSON(endpoint, key, request = fetchWithTimeout) {
  const res = await request(endpoint, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  }, 10000)
  if (res.status === 401 || res.status === 403) throw new Error('API key rejected')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function read(options = {}) {
  const key = options.key || getKey('openrouter')
  if (!key) return { connected: false }
  const request = options.fetchWithTimeout || fetchWithTimeout
  try {
    const credits = parseCredits(await getJSON(CREDITS_ENDPOINT, key, request))
    let keyDetails = null
    let warning = null
    try {
      keyDetails = parseKey(await getJSON(KEY_ENDPOINT, key, request))
    } catch (err) {
      warning = err && err.message ? err.message : String(err)
    }
    return {
      connected: true,
      ...credits,
      ...(keyDetails || {}),
      keyDetailsAvailable: Boolean(keyDetails),
      warning,
      lastActive: Date.now(),
    }
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: { parseCredits, parseKey, getJSON },
}
