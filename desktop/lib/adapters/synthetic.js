const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const QUOTAS_URL = 'https://api.synthetic.new/v2/quotas'

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
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function resolveAPIKey() {
  return (
    clean(process.env.SYNTHETIC_API_KEY) ||
    clean(process.env.synthetic_api_key) ||
    clean(process.env.SYNTHETIC_TOKEN) ||
    clean(getKey('synthetic'))
  )
}

function firstValue(payload, keys, mapper = (value) => value) {
  for (const key of keys) {
    if (payload[key] == null) continue
    const value = mapper(payload[key])
    if (value != null) return value
  }
  return null
}

const PLAN_KEYS = ['plan', 'planName', 'plan_name', 'subscription', 'subscriptionPlan', 'tier', 'package', 'packageName']
const LABEL_KEYS = ['name', 'label', 'type', 'period', 'scope', 'title', 'id']
const PERCENT_USED_KEYS = ['percentUsed', 'usedPercent', 'usagePercent', 'usage_percent', 'used_percent', 'percent_used', 'percent']
const PERCENT_REMAINING_KEYS = ['percentRemaining', 'remainingPercent', 'remaining_percent', 'percent_remaining']
const LIMIT_KEYS = ['limit', 'messageLimit', 'message_limit', 'messages', 'maxRequests', 'max_requests', 'requestLimit', 'request_limit', 'quota', 'max', 'total', 'capacity', 'allowance']
const USED_KEYS = ['used', 'usage', 'usedMessages', 'used_messages', 'messagesUsed', 'messages_used', 'requests', 'requestCount', 'request_count', 'consumed', 'spent']
const REMAINING_KEYS = ['remaining', 'left', 'available', 'balance']
const RESET_KEYS = ['resetAt', 'reset_at', 'resetsAt', 'resets_at', 'renewAt', 'renew_at', 'renewsAt', 'renews_at', 'nextTickAt', 'next_tick_at', 'nextRegenAt', 'next_regen_at', 'periodEnd', 'period_end', 'expiresAt', 'expires_at', 'endAt', 'end_at']
const REGEN_AMOUNT_KEYS = ['nextRegenCredits', 'next_regen_credits']
const TICK_PERCENT_KEYS = ['tickPercent', 'tick_percent', 'nextTickPercent', 'next_tick_percent']
const COST_LIMIT_KEYS = ['maxCredits', 'max_credits']
const COST_REMAINING_KEYS = ['remainingCredits', 'remaining_credits']
const COST_USED_KEYS = ['usedCredits', 'used_credits']
const WINDOW_MINUTES_KEYS = ['windowMinutes', 'window_minutes', 'periodMinutes', 'period_minutes']
const WINDOW_HOURS_KEYS = ['windowHours', 'window_hours', 'periodHours', 'period_hours']
const WINDOW_DAYS_KEYS = ['windowDays', 'window_days', 'periodDays', 'period_days']
const WINDOW_SECONDS_KEYS = ['windowSeconds', 'window_seconds', 'periodSeconds', 'period_seconds']
const WINDOW_STRING_KEYS = ['window', 'windowLabel', 'window_label', 'period', 'periodLabel', 'period_label']

function normalizedPercent(value) {
  const n = number(value)
  if (n == null) return null
  return n <= 1 ? n * 100 : n
}

function windowMinutesFromText(value) {
  const text = clean(value)
  if (!text) return null
  const normalized = text.toLowerCase().replace(/\s+/g, '')
  const suffixes = [
    ['minutes', 1], ['minute', 1], ['mins', 1], ['min', 1], ['m', 1],
    ['hours', 60], ['hour', 60], ['hrs', 60], ['hr', 60], ['h', 60],
    ['days', 1440], ['day', 1440], ['d', 1440],
  ].sort((a, b) => b[0].length - a[0].length)
  for (const [suffix, multiplier] of suffixes) {
    if (!normalized.endsWith(suffix)) continue
    const amount = number(normalized.slice(0, -suffix.length))
    return amount > 0 ? Math.round(amount * multiplier) : null
  }
  return null
}

function windowMinutes(payload) {
  const minutes = firstValue(payload, WINDOW_MINUTES_KEYS, number)
  if (minutes != null) return Math.round(minutes)
  const hours = firstValue(payload, WINDOW_HOURS_KEYS, number)
  if (hours != null) return Math.round(hours * 60)
  const days = firstValue(payload, WINDOW_DAYS_KEYS, number)
  if (days != null) return Math.round(days * 1440)
  const seconds = firstValue(payload, WINDOW_SECONDS_KEYS, number)
  if (seconds != null) return Math.round(seconds / 60)
  const text = firstValue(payload, WINDOW_STRING_KEYS, clean)
  return windowMinutesFromText(text)
}

function windowDescription(minutes) {
  if (!(minutes > 0)) return null
  if (minutes % 1440 === 0) {
    const days = minutes / 1440
    return `${days} day${days === 1 ? '' : 's'} window`
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'} window`
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'} window`
}

function providerCost(payload, usedPercent, resetsAt) {
  const limit = firstValue(payload, COST_LIMIT_KEYS, number)
  if (limit == null) return null
  const remaining = firstValue(payload, COST_REMAINING_KEYS, number)
  const usedFromPayload = firstValue(payload, COST_USED_KEYS, number)
  const nextRegenAmount = firstValue(payload, REGEN_AMOUNT_KEYS, number)
  const used =
    usedFromPayload != null
      ? usedFromPayload
      : remaining != null
        ? Math.max(0, limit - remaining)
        : (clampPct(usedPercent) / 100) * limit
  return {
    used,
    limit,
    currencyCode: 'USD',
    period: 'Weekly',
    resetsAt,
    nextRegenAmount,
  }
}

function isQuotaPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const keyGroups = [LIMIT_KEYS, USED_KEYS, REMAINING_KEYS, PERCENT_USED_KEYS, PERCENT_REMAINING_KEYS]
  return keyGroups.some((keys) => firstValue(payload, keys, number) != null)
}

function parseQuota(payload) {
  if (!isQuotaPayload(payload)) return null
  const label = firstValue(payload, LABEL_KEYS, clean)
  let usedPercent = normalizedPercent(firstValue(payload, PERCENT_USED_KEYS))
  const remainingPercent = normalizedPercent(firstValue(payload, PERCENT_REMAINING_KEYS))
  if (usedPercent == null && remainingPercent != null) usedPercent = 100 - remainingPercent

  let limit = firstValue(payload, LIMIT_KEYS, number)
  let used = firstValue(payload, USED_KEYS, number)
  let remaining = firstValue(payload, REMAINING_KEYS, number)
  if (usedPercent == null) {
    if (limit == null && used != null && remaining != null) limit = used + remaining
    if (used == null && limit != null && remaining != null) used = Math.max(0, limit - remaining)
    if (remaining == null && limit != null && used != null) remaining = Math.max(0, limit - used)
    if (limit > 0 && used != null) usedPercent = (used / limit) * 100
  }
  if (usedPercent == null) return null

  const mins = windowMinutes(payload)
  const resetsAt = firstValue(payload, RESET_KEYS, timestamp)
  return {
    label,
    usedPercent: clampPct(usedPercent),
    windowMinutes: mins,
    resetsAt,
    resetDescription: resetsAt ? null : windowDescription(mins),
    nextRegenPercent: normalizedPercent(firstValue(payload, TICK_PERCENT_KEYS)),
    cost: providerCost(payload, usedPercent, resetsAt),
    limit,
    used,
    remaining,
  }
}

function namedQuota(candidate, label) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || !isQuotaPayload(candidate)) return null
  return candidate.label || candidate.name ? candidate : { ...candidate, label }
}

function prioritizedQuotaSlots(root) {
  const data = root.data && typeof root.data === 'object' && !Array.isArray(root.data) ? root.data : {}
  const rolling = namedQuota(root.rollingFiveHourLimit, 'Rolling five-hour limit') || namedQuota(data.rollingFiveHourLimit, 'Rolling five-hour limit')
  const weekly = namedQuota(root.weeklyTokenLimit, 'Weekly token limit') || namedQuota(data.weeklyTokenLimit, 'Weekly token limit')
  const searchRoot = root.search && typeof root.search === 'object' ? root.search : {}
  const searchData = data.search && typeof data.search === 'object' ? data.search : {}
  const searchHourly = namedQuota(searchRoot.hourly, 'Search hourly') || namedQuota(searchData.hourly, 'Search hourly')
  const slots = [rolling, weekly, searchHourly]
  return slots.some(Boolean) ? slots : null
}

function extractQuotaObjects(candidate) {
  if (!candidate) return []
  if (Array.isArray(candidate)) return candidate.flatMap(extractQuotaObjects)
  if (typeof candidate !== 'object') return []
  if (isQuotaPayload(candidate)) return [candidate]
  return Object.keys(candidate)
    .sort()
    .flatMap((key) => extractQuotaObjects(candidate[key]))
}

function fallbackQuotaObjects(root) {
  const data = root.data && typeof root.data === 'object' && !Array.isArray(root.data) ? root.data : {}
  const candidates = [
    root.quotas,
    root.quota,
    root.limits,
    root.usage,
    root.entries,
    root.subscription,
    root.data,
    data.quotas,
    data.quota,
    data.limits,
    data.usage,
    data.entries,
    data.subscription,
  ]
  for (const candidate of candidates) {
    const quotas = extractQuotaObjects(candidate)
    if (quotas.length) return quotas
  }
  return []
}

function planName(root) {
  const direct = firstValue(root, PLAN_KEYS, clean)
  if (direct) return direct
  const data = root.data && typeof root.data === 'object' && !Array.isArray(root.data) ? root.data : {}
  return firstValue(data, PLAN_KEYS, clean)
}

function parseUsageResponse(json, now = Date.now()) {
  const root = Array.isArray(json) ? { quotas: json } : json && typeof json === 'object' ? json : {}
  const slots = prioritizedQuotaSlots(root)
  if (slots) {
    const slottedQuotas = slots.map((slot) => (slot ? parseQuota(slot) : null))
    const quotas = slottedQuotas.filter(Boolean)
    if (!quotas.length) throw new Error('Missing Synthetic quota data')
    return {
      connected: true,
      planName: planName(root),
      quotas,
      slottedQuotas,
      updatedAt: now,
    }
  }
  const quotas = fallbackQuotaObjects(root).map(parseQuota).filter(Boolean)
  if (!quotas.length) throw new Error('Missing Synthetic quota data')
  return {
    connected: true,
    planName: planName(root),
    quotas,
    slottedQuotas: null,
    updatedAt: now,
  }
}

async function fetchUsage(apiKey) {
  const res = await fetchWithTimeout(
    QUOTAS_URL,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    },
    15000,
  )
  const text = await res.text()
  if (res.status === 401 || res.status === 403) throw new Error('Invalid Synthetic API credentials')
  if (!res.ok) throw new Error(`Synthetic HTTP ${res.status}: ${text.slice(0, 200)}`)
  return text.trim() ? JSON.parse(text) : {}
}

async function read() {
  const apiKey = resolveAPIKey()
  if (!apiKey) return { connected: false, error: 'Synthetic API key not configured' }
  try {
    return parseUsageResponse(await fetchUsage(apiKey))
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    extractQuotaObjects,
    fallbackQuotaObjects,
    parseQuota,
    parseUsageResponse,
    prioritizedQuotaSlots,
    resolveAPIKey,
    windowMinutesFromText,
  },
}
