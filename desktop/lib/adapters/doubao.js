const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const ENDPOINT = 'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions'
const PROBE_MODELS = ['doubao-seed-2.0-code', 'doubao-1.5-pro-32k', 'doubao-lite-32k']

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function resolveKey() {
  return (
    clean(process.env.ARK_API_KEY) ||
    clean(process.env.VOLCENGINE_API_KEY) ||
    clean(process.env.DOUBAO_API_KEY) ||
    clean(getKey('doubao'))
  )
}

function headerValue(headers, name) {
  if (!headers) return null
  if (typeof headers.get === 'function') return clean(headers.get(name))
  const needle = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === needle) return clean(value)
  }
  return null
}

function intHeader(headers, name) {
  const value = headerValue(headers, name)
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function parseResetTime(value, now = Date.now()) {
  const text = clean(value)
  if (!text) return null

  let seconds = 0
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)([dhms])/gi)) {
    const amount = Number(match[1])
    if (!Number.isFinite(amount)) continue
    const unit = match[2].toLowerCase()
    if (unit === 'd') seconds += amount * 86400
    else if (unit === 'h') seconds += amount * 3600
    else if (unit === 'm') seconds += amount * 60
    else if (unit === 's') seconds += amount
  }
  if (seconds > 0) return now + seconds * 1000

  const plainSeconds = Number(text)
  if (Number.isFinite(plainSeconds)) return now + plainSeconds * 1000

  const parsed = Date.parse(text)
  if (Number.isFinite(parsed)) return parsed

  return null
}

function parseSnapshot(status, headers, json = null, now = Date.now(), model = null) {
  const remaining = intHeader(headers, 'x-ratelimit-remaining-requests')
  const limit = intHeader(headers, 'x-ratelimit-limit-requests')
  const resetTime = parseResetTime(headerValue(headers, 'x-ratelimit-reset-requests'), now)
  const totalTokens =
    remaining == null && limit == null && json?.usage?.total_tokens != null
      ? Math.max(0, Math.trunc(Number(json.usage.total_tokens) || 0))
      : null
  const limitRequests = Math.max(0, limit || 0)
  const remainingRequests = Math.max(0, remaining || 0)
  const used = limitRequests > 0 ? Math.max(0, limitRequests - remainingRequests) : 0
  const usedPct = limitRequests > 0 ? Math.max(0, Math.min(100, (used / limitRequests) * 100)) : 0

  return {
    connected: true,
    remainingRequests,
    limitRequests,
    resetTime,
    apiKeyValid: status === 200 || status === 429,
    totalTokens,
    usedPct,
    model,
    lastActive: now,
  }
}

function compactText(text, maxLength = 200) {
  const collapsed = String(text || '')
    .split(/\r?\n/)
    .join(' ')
    .trim()
  return collapsed.length > maxLength ? collapsed.slice(0, maxLength) + '...' : collapsed
}

function apiErrorSummary(status, text) {
  try {
    const json = JSON.parse(text)
    const message = json?.error?.message || json?.message
    if (message) return compactText(message)
  } catch {
    /* fall back to text */
  }
  return compactText(text) || `HTTP ${status}`
}

async function probe(apiKey, model) {
  const res = await fetchWithTimeout(
    ENDPOINT,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    },
    15000,
  )

  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  if (res.status !== 200 && res.status !== 429) {
    const error = new Error(`Doubao API error (${res.status}): ${apiErrorSummary(res.status, text)}`)
    error.status = res.status
    throw error
  }

  return parseSnapshot(res.status, res.headers, json, Date.now(), model)
}

async function read() {
  const key = resolveKey()
  if (!key) return { connected: false }

  let lastError = null
  for (const model of PROBE_MODELS) {
    try {
      return await probe(key, model)
    } catch (err) {
      if (err && (err.status === 403 || err.status === 404)) {
        lastError = err
        continue
      }
      if (err && err.status === 401) return { connected: false, error: 'Doubao API key rejected' }
      return { connected: false, error: err && err.message ? err.message : String(err) }
    }
  }

  return { connected: false, error: lastError && lastError.message ? lastError.message : 'All Doubao probe models failed' }
}

module.exports = {
  read,
  _private: {
    clean,
    parseResetTime,
    parseSnapshot,
    resolveKey,
  },
}
