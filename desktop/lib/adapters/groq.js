const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const DEFAULT_API_URL = 'https://api.groq.com/v1'

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function apiURL() {
  const raw = clean(process.env.GROQ_API_URL) || DEFAULT_API_URL
  try {
    return new URL(raw)
  } catch {
    return new URL(DEFAULT_API_URL)
  }
}

function resolveKey() {
  return clean(process.env.GROQ_API_KEY) || clean(getKey('groq'))
}

function appendPath(url, component) {
  const next = new URL(url.toString())
  const base = next.pathname.endsWith('/') ? next.pathname.slice(0, -1) : next.pathname
  next.pathname = `${base}/${component}`
  return next
}

function metricsURL(query, base = apiURL()) {
  let url = appendPath(base, 'metrics')
  url = appendPath(url, 'prometheus')
  url = appendPath(url, 'api')
  url = appendPath(url, 'v1')
  url = appendPath(url, 'query')
  url.searchParams.set('query', query)
  return url
}

function parseScalar(json) {
  if (!json || typeof json !== 'object') throw new Error('Invalid Groq metrics response')
  if (json.status !== 'success') throw new Error(json.error || 'Groq query failed')
  const result = Array.isArray(json.data?.result) ? json.data.result : []
  return result.reduce((sum, series) => {
    const value = Array.isArray(series.value) ? series.value[series.value.length - 1] : null
    const n = Number(value)
    return Number.isFinite(n) ? sum + n : sum
  }, 0)
}

function formatDecimal(value) {
  const n = Number(value) || 0
  if (n >= 100) return n.toFixed(0)
  if (n >= 10) return n.toFixed(1)
  return n.toFixed(2)
}

function parseSnapshot(metrics, now = Date.now()) {
  const requestRatePerSecond = Number(metrics.requests) || 0
  const inputTokenRatePerSecond = Number(metrics.inputTokens) || 0
  const outputTokenRatePerSecond = Number(metrics.outputTokens) || 0
  const promptCacheHitRatePerSecond = Number(metrics.cacheHits) || 0
  const requestsPerMinute = requestRatePerSecond * 60
  const tokensPerMinute = (inputTokenRatePerSecond + outputTokenRatePerSecond) * 60
  const cacheHitsPerMinute = promptCacheHitRatePerSecond * 60
  return {
    connected: true,
    requestRatePerSecond,
    inputTokenRatePerSecond,
    outputTokenRatePerSecond,
    promptCacheHitRatePerSecond,
    requestsPerMinute,
    tokensPerMinute,
    cacheHitsPerMinute,
    requestLabel: `${formatDecimal(requestsPerMinute)} req/min`,
    tokenLabel: `${formatDecimal(tokensPerMinute)} tok/min`,
    cacheLabel: `${formatDecimal(cacheHitsPerMinute)} cache/min`,
    lastActive: now,
  }
}

function compactText(text, maxLength = 500) {
  const collapsed = String(text || '').trim()
  return collapsed.length > maxLength ? collapsed.slice(0, maxLength) + '...' : collapsed
}

async function queryScalar(query, apiKey, base = apiURL()) {
  const res = await fetchWithTimeout(
    metricsURL(query, base).toString(),
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    },
    15000,
  )
  const text = await res.text()
  if (res.status === 401 || res.status === 403) {
    const error = new Error(`Groq metrics access denied: ${compactText(text)}`)
    error.status = res.status
    throw error
  }
  if (!res.ok) {
    const error = new Error(`Groq metrics HTTP ${res.status}: ${compactText(text)}`)
    error.status = res.status
    throw error
  }
  try {
    return parseScalar(JSON.parse(text))
  } catch (err) {
    throw new Error(err && err.message ? err.message : 'Could not parse Groq metrics response')
  }
}

async function read() {
  const key = resolveKey()
  if (!key) return { connected: false }
  try {
    const base = apiURL()
    const [requests, inputTokens, outputTokens, cacheHits] = await Promise.all([
      queryScalar('sum(model_project_id_status_code:requests:rate5m)', key, base),
      queryScalar('sum(model_project_id:tokens_in:rate5m)', key, base),
      queryScalar('sum(model_project_id:tokens_out:rate5m)', key, base),
      queryScalar('sum(model_project_id:prompt_cache_hits:rate5m)', key, base),
    ])
    return parseSnapshot({ requests, inputTokens, outputTokens, cacheHits })
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) return { connected: false, error: 'Groq API key rejected' }
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    apiURL,
    clean,
    formatDecimal,
    metricsURL,
    parseScalar,
    parseSnapshot,
    resolveKey,
  },
}
