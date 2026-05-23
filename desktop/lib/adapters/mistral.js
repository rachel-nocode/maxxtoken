const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const BASE_URL = 'https://admin.mistral.ai'

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if (text.toLowerCase().startsWith('cookie:')) text = text.slice(7).trim()
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function cookiePairs(cookieHeader) {
  const header = clean(cookieHeader)
  if (!header) return []
  return header
    .split(';')
    .map((part) => {
      const index = part.indexOf('=')
      if (index < 0) return null
      const name = part.slice(0, index).trim()
      const value = part.slice(index + 1).trim()
      return name ? { name, value } : null
    })
    .filter(Boolean)
}

function normalizeCookie(cookieHeader) {
  const pairs = cookiePairs(cookieHeader)
  if (!pairs.some((pair) => pair.name.startsWith('ory_session_'))) return null
  return pairs.map((pair) => `${pair.name}=${pair.value}`).join('; ')
}

function csrfToken(cookieHeader) {
  return cookiePairs(cookieHeader).find((pair) => pair.name === 'csrftoken')?.value || null
}

function resolveCookie() {
  return (
    normalizeCookie(process.env.MISTRAL_COOKIE) ||
    normalizeCookie(process.env.MISTRAL_COOKIE_HEADER) ||
    normalizeCookie(getKey('mistral'))
  )
}

function usageURL(now = new Date()) {
  const url = new URL('/api/billing/v2/usage', BASE_URL)
  url.searchParams.set('month', String(now.getUTCMonth() + 1))
  url.searchParams.set('year', String(now.getUTCFullYear()))
  return url
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function buildPriceIndex(prices = []) {
  const index = new Map()
  for (const price of prices || []) {
    const metric = clean(price?.billing_metric)
    const group = clean(price?.billing_group)
    const value = num(price?.price)
    if (metric && group) index.set(`${metric}::${group}`, value)
  }
  return index
}

function entryUnits(entry) {
  return Math.max(0, Math.trunc(num(entry?.value_paid ?? entry?.value)))
}

function entryCost(entry, units, prices) {
  const metric = clean(entry?.billing_metric)
  const group = clean(entry?.billing_group)
  return metric && group ? units * (prices.get(`${metric}::${group}`) || 0) : 0
}

function displayModelName(raw, entry) {
  return clean(entry?.billing_display_name) || String(raw || '').split('::')[0] || String(raw || '')
}

function dayKey(timestamp) {
  const text = clean(timestamp)
  return text && text.length >= 10 ? text.slice(0, 10) : null
}

function addDaily(daily, modelName, kind, entry, prices, countsTokens) {
  const day = dayKey(entry?.timestamp)
  if (!day) return
  const units = entryUnits(entry)
  const cost = entryCost(entry, units, prices)
  const bucket = daily.get(day) || {
    day,
    cost: 0,
    inputTokens: 0,
    cachedTokens: 0,
    outputTokens: 0,
    models: new Map(),
  }
  const modelDisplay = displayModelName(modelName, entry)
  const model = bucket.models.get(modelDisplay) || {
    name: modelDisplay,
    cost: 0,
    inputTokens: 0,
    cachedTokens: 0,
    outputTokens: 0,
  }
  bucket.cost += cost
  model.cost += cost
  if (countsTokens) {
    if (kind === 'input') {
      bucket.inputTokens += units
      model.inputTokens += units
    } else if (kind === 'cached') {
      bucket.cachedTokens += units
      model.cachedTokens += units
    } else {
      bucket.outputTokens += units
      model.outputTokens += units
    }
  }
  bucket.models.set(modelDisplay, model)
  daily.set(day, bucket)
}

function aggregateModel(modelName, modelData, prices, daily, countsTokens) {
  const totals = { input: 0, cached: 0, output: 0, cost: 0 }
  for (const [kind, key] of [
    ['input', 'input'],
    ['output', 'output'],
    ['cached', 'cached'],
  ]) {
    for (const entry of modelData?.[key] || []) {
      const units = entryUnits(entry)
      const cost = entryCost(entry, units, prices)
      totals[kind] += countsTokens ? units : 0
      totals.cost += cost
      addDaily(daily, modelName, kind, entry, prices, countsTokens)
    }
  }
  return totals
}

function aggregateCategoryModels(models, prices, daily, countsTokens) {
  const totals = { input: 0, cached: 0, output: 0, cost: 0, modelCount: 0 }
  for (const [modelName, modelData] of Object.entries(models || {})) {
    totals.modelCount += countsTokens ? 1 : 0
    const next = aggregateModel(modelName, modelData, prices, daily, countsTokens)
    totals.input += next.input
    totals.cached += next.cached
    totals.output += next.output
    totals.cost += next.cost
  }
  return totals
}

function addTotals(total, next) {
  total.totalInputTokens += next.input
  total.totalCachedTokens += next.cached
  total.totalOutputTokens += next.output
  total.totalCost += next.cost
  total.modelCount += next.modelCount
}

function parseDate(value) {
  const parsed = Date.parse(clean(value))
  return Number.isFinite(parsed) ? parsed : null
}

function parseResponse(json, now = Date.now()) {
  if (!json || typeof json !== 'object') throw new Error('Invalid Mistral billing response')
  const prices = buildPriceIndex(json.prices || [])
  const daily = new Map()
  const result = {
    connected: true,
    totalCost: 0,
    currency: clean(json.currency) || 'EUR',
    currencySymbol: clean(json.currency_symbol) || '€',
    totalInputTokens: 0,
    totalCachedTokens: 0,
    totalOutputTokens: 0,
    modelCount: 0,
    startDate: parseDate(json.start_date),
    endDate: parseDate(json.end_date),
    lastActive: now,
  }

  addTotals(result, aggregateCategoryModels(json.completion?.models, prices, daily, true))
  for (const category of [json.ocr, json.connectors, json.audio]) {
    addTotals(result, aggregateCategoryModels(category?.models, prices, daily, false))
  }
  addTotals(result, aggregateCategoryModels(json.libraries_api?.pages?.models, prices, daily, false))
  addTotals(result, aggregateCategoryModels(json.libraries_api?.tokens?.models, prices, daily, true))
  addTotals(result, aggregateCategoryModels(json.fine_tuning?.training, prices, daily, false))
  addTotals(result, aggregateCategoryModels(json.fine_tuning?.storage, prices, daily, false))

  result.totalTokens = result.totalInputTokens + result.totalCachedTokens + result.totalOutputTokens
  result.daily = Array.from(daily.values())
    .map((bucket) => ({
      ...bucket,
      totalTokens: bucket.inputTokens + bucket.cachedTokens + bucket.outputTokens,
      models: Array.from(bucket.models.values())
        .map((model) => ({ ...model, totalTokens: model.inputTokens + model.cachedTokens + model.outputTokens }))
        .sort((a, b) => b.totalTokens - a.totalTokens || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.day.localeCompare(b.day))
  return result
}

function compactText(text, maxLength = 200) {
  const collapsed = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  return collapsed.length > maxLength ? collapsed.slice(0, maxLength) + '...' : collapsed
}

async function read() {
  const cookie = resolveCookie()
  if (!cookie) return { connected: false, error: 'Mistral cookie header missing or missing ory_session_* cookie' }
  try {
    const res = await fetchWithTimeout(
      usageURL().toString(),
      {
        headers: {
          Accept: '*/*',
          Cookie: cookie,
          Referer: 'https://admin.mistral.ai/organization/usage',
          Origin: BASE_URL,
          ...(csrfToken(cookie) ? { 'X-CSRFTOKEN': csrfToken(cookie) } : {}),
        },
      },
      15000,
    )
    const text = await res.text()
    if (res.status === 401 || res.status === 403) return { connected: false, error: 'Mistral session expired or invalid' }
    if (!res.ok) return { connected: false, error: `Mistral HTTP ${res.status}: ${compactText(text)}` }
    try {
      return parseResponse(JSON.parse(text), Date.now())
    } catch (err) {
      return { connected: false, error: err && err.message ? err.message : 'Could not parse Mistral billing response' }
    }
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    csrfToken,
    normalizeCookie,
    parseResponse,
    resolveCookie,
    usageURL,
  },
}
