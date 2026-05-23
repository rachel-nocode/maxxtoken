const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const ENDPOINT = 'https://kimi-k2.ai/api/user/credits'
const CONSUMED_PATHS = [
  ['total_credits_consumed'],
  ['totalCreditsConsumed'],
  ['total_credits_used'],
  ['totalCreditsUsed'],
  ['credits_consumed'],
  ['creditsConsumed'],
  ['consumedCredits'],
  ['usedCredits'],
  ['total'],
  ['usage', 'total'],
  ['usage', 'consumed'],
]
const REMAINING_PATHS = [
  ['credits_remaining'],
  ['creditsRemaining'],
  ['remaining_credits'],
  ['remainingCredits'],
  ['available_credits'],
  ['availableCredits'],
  ['credits_left'],
  ['creditsLeft'],
  ['usage', 'credits_remaining'],
  ['usage', 'remaining'],
]
const AVERAGE_TOKEN_PATHS = [
  ['average_tokens_per_request'],
  ['averageTokensPerRequest'],
  ['average_tokens'],
  ['averageTokens'],
  ['avg_tokens'],
  ['avgTokens'],
]
const TIMESTAMP_PATHS = [['updated_at'], ['updatedAt'], ['timestamp'], ['time'], ['last_update'], ['lastUpdated']]

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function resolveKey() {
  return clean(process.env.KIMI_K2_API_KEY) || clean(process.env.KIMI_API_KEY) || clean(process.env.KIMI_KEY) || clean(getKey('kimik2'))
}

function num(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function dateMs(value) {
  const n = num(value)
  if (n != null) return n > 1_000_000_000_000 ? n : n * 1000
  const ms = Date.parse(String(value || ''))
  return Number.isFinite(ms) ? ms : null
}

function contexts(root) {
  const out = [root]
  for (const key of ['data', 'result', 'usage', 'credits']) {
    if (root[key] && typeof root[key] === 'object' && !Array.isArray(root[key])) out.push(root[key])
  }
  for (const key of ['data', 'result']) {
    const nested = root[key]
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue
    for (const nestedKey of ['usage', 'credits']) {
      if (nested[nestedKey] && typeof nested[nestedKey] === 'object' && !Array.isArray(nested[nestedKey])) out.push(nested[nestedKey])
    }
  }
  return out
}

function valueAt(ctx, path) {
  let cursor = ctx
  for (const part of path) {
    if (!cursor || typeof cursor !== 'object') return null
    cursor = cursor[part]
  }
  return cursor
}

function firstNumber(paths, allContexts) {
  for (const path of paths) {
    for (const ctx of allContexts) {
      const found = num(valueAt(ctx, path))
      if (found != null) return found
    }
  }
  return null
}

function firstDate(paths, allContexts) {
  for (const path of paths) {
    for (const ctx of allContexts) {
      const found = dateMs(valueAt(ctx, path))
      if (found != null) return found
    }
  }
  return null
}

function headerNumber(headers, wanted) {
  if (!headers) return null
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted.toLowerCase()) return num(value)
  }
  return null
}

function parseUsage(json, headers = {}, now = Date.now()) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Root JSON is not an object.')
  const allContexts = contexts(json)
  const consumed = firstNumber(CONSUMED_PATHS, allContexts) || 0
  const remaining = Math.max(0, firstNumber(REMAINING_PATHS, allContexts) ?? headerNumber(headers, 'x-credits-remaining') ?? 0)
  const averageTokens = firstNumber(AVERAGE_TOKEN_PATHS, allContexts)
  return {
    connected: true,
    consumed,
    remaining,
    averageTokens,
    updatedAt: firstDate(TIMESTAMP_PATHS, allContexts) || now,
    lastActive: now,
  }
}

async function read() {
  const key = resolveKey()
  if (!key) return { connected: false }
  try {
    const res = await fetchWithTimeout(
      ENDPOINT,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
        },
      },
      15000,
    )
    const text = await res.text()
    if (res.status === 401 || res.status === 403) return { connected: false, error: 'Kimi K2 API key rejected' }
    if (!res.ok) return { connected: false, error: `Kimi K2 HTTP ${res.status}` }
    try {
      return parseUsage(JSON.parse(text), Object.fromEntries(res.headers.entries()))
    } catch (err) {
      return { connected: false, error: err && err.message ? err.message : 'Could not parse Kimi K2 credits response' }
    }
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    parseUsage,
    resolveKey,
  },
}
