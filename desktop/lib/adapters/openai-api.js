const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const COSTS_URL = 'https://api.openai.com/v1/organization/costs'
const COMPLETIONS_URL = 'https://api.openai.com/v1/organization/usage/completions'
const CREDIT_GRANTS_URL = 'https://api.openai.com/v1/dashboard/billing/credit_grants'

function dayStartUTC(date = new Date()) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000
}

function queryURL(base, startTime, endTime, extra = {}) {
  const url = new URL(base)
  url.searchParams.set('start_time', String(startTime))
  url.searchParams.set('end_time', String(endTime))
  url.searchParams.set('bucket_width', '1d')
  url.searchParams.set('limit', String(Math.max(1, Math.round((endTime - startTime) / 86400))))
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value)
  return url.toString()
}

async function getJSON(url, key) {
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        'User-Agent': 'MaxxToken',
      },
    },
    20000,
  )
  if (res.status === 401 || res.status === 403) {
    const err = new Error('API key rejected')
    err.credentialRejected = true
    throw err
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function amountValue(amount) {
  const n = Number(amount && amount.value)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function dayKeyFromStartTime(startTime, fallbackDate = new Date()) {
  const seconds = Number(startTime)
  const date = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : fallbackDate
  return date.toISOString().slice(0, 10)
}

function emptyDailyBucket(date) {
  return { date, input: 0, cached: 0, output: 0, total: 0, requests: 0, costUSD: 0, models: new Map() }
}

function addModelUsage(bucket, modelName, usage) {
  const model = bucket.models.get(modelName) || { model: modelName, input: 0, cached: 0, output: 0, total: 0, requests: 0 }
  model.input += usage.input
  model.cached += usage.cached
  model.output += usage.output
  model.total += usage.total
  model.requests += usage.requests
  bucket.models.set(modelName, model)
}

function sortedModelBreakdowns(models) {
  return [...models.values()].sort((a, b) => b.total - a.total || a.model.localeCompare(b.model))
}

function parseAdminUsage(costs, completions, now = new Date()) {
  let spent = 0
  const lineItems = new Map()
  const days = new Map()
  for (const bucket of costs?.data || []) {
    const date = dayKeyFromStartTime(bucket.start_time, now)
    const day = days.get(date) || emptyDailyBucket(date)
    for (const row of bucket.results || []) {
      const value = amountValue(row.amount)
      spent += value
      day.costUSD += value
      const name = row.line_item || 'API'
      lineItems.set(name, (lineItems.get(name) || 0) + value)
    }
    days.set(date, day)
  }

  const tokens = { input: 0, cached: 0, output: 0, total: 0, requests: 0 }
  const models = new Map()
  for (const bucket of completions?.data || []) {
    const date = dayKeyFromStartTime(bucket.start_time, now)
    const day = days.get(date) || emptyDailyBucket(date)
    for (const row of bucket.results || []) {
      const input = Number(row.input_tokens) || 0
      const cached = Number(row.input_cached_tokens) || 0
      const audioInput = Number(row.input_audio_tokens) || 0
      const output = Number(row.output_tokens) || 0
      const audioOutput = Number(row.output_audio_tokens) || 0
      const requests = Number(row.num_model_requests) || 0
      const total = input + audioInput + output + audioOutput
      const usage = {
        input: input + audioInput,
        cached,
        output: output + audioOutput,
        total,
        requests,
      }
      tokens.input += usage.input
      tokens.cached += cached
      tokens.output += usage.output
      tokens.total += total
      tokens.requests += requests
      const model = row.model || 'Responses and Chat Completions'
      const prev = models.get(model) || { model, input: 0, cached: 0, output: 0, total: 0, requests: 0 }
      prev.input += usage.input
      prev.cached += usage.cached
      prev.output += usage.output
      prev.total += usage.total
      prev.requests += usage.requests
      models.set(model, prev)
      day.input += usage.input
      day.cached += usage.cached
      day.output += usage.output
      day.total += usage.total
      day.requests += usage.requests
      addModelUsage(day, model, usage)
    }
    days.set(date, day)
  }

  const topLineItem = [...lineItems.entries()].sort((a, b) => b[1] - a[1])[0] || null
  const modelBreakdowns = sortedModelBreakdowns(models)
  const dailyBreakdown = [...days.values()]
    .filter((day) => day.total > 0 || day.costUSD > 0)
    .map((day) => {
      const { models, ...rest } = day
      return { ...rest, modelBreakdowns: sortedModelBreakdowns(models) }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
  const topModel = modelBreakdowns[0] || null
  return {
    connected: true,
    source: 'admin-api',
    spent,
    tokens: { ...tokens, dailyBreakdown, modelBreakdowns },
    topLineItem: topLineItem ? { name: topLineItem[0], costUSD: topLineItem[1] } : null,
    topModel,
    lastActive: now.getTime(),
  }
}

function parseCreditBalance(body, now = new Date()) {
  const granted = Math.max(0, Number(body?.total_granted) || 0)
  const used = Math.max(0, Number(body?.total_used) || 0)
  const available = Math.max(0, Number(body?.total_available) || 0)
  const expiries = ((body?.grants && body.grants.data) || [])
    .map((grant) => Number(grant.expires_at))
    .filter((seconds) => Number.isFinite(seconds) && seconds * 1000 > now.getTime())
    .sort((a, b) => a - b)
  return {
    connected: true,
    source: 'billing-api',
    spent: used,
    granted,
    available,
    resetAt: expiries.length ? expiries[0] * 1000 : null,
    tokens: { input: 0, cached: 0, output: 0, total: 0, requests: 0 },
    lastActive: now.getTime(),
  }
}

async function read() {
  const key = getKey('openai')
  if (!key) return { connected: false, needsKey: true }

  const trimmed = key.trim()
  const now = new Date()
  const end = dayStartUTC(now) + 86400
  const start = end - 30 * 86400

  try {
    const [costs, completions] = await Promise.all([
      getJSON(queryURL(COSTS_URL, start, end, { group_by: 'line_item' }), trimmed),
      getJSON(queryURL(COMPLETIONS_URL, start, end, { group_by: 'model' }), trimmed),
    ])
    return parseAdminUsage(costs, completions, now)
  } catch (usageError) {
    try {
      const balance = await getJSON(CREDIT_GRANTS_URL, trimmed)
      return parseCreditBalance(balance, now)
    } catch (balanceError) {
      return {
        connected: false,
        needsKey: true,
        error: balanceError && balanceError.message ? balanceError.message : String(balanceError),
        adminError: usageError && usageError.message ? usageError.message : String(usageError),
      }
    }
  }
}

module.exports = {
  read,
  _private: {
    parseAdminUsage,
    parseCreditBalance,
    queryURL,
    dayKeyFromStartTime,
  },
}
