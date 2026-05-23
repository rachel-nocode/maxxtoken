const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

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
  try {
    const json = JSON.parse(text)
    if (json && typeof json === 'object') {
      return {
        apiKey: clean(json.apiKey || json.key || json.token),
        baseURL: clean(json.baseURL || json.baseUrl || json.url || json.host || json.enterpriseHost),
      }
    }
  } catch {
    /* fall through */
  }

  const [apiKey, baseURL] = text.split('|').map(clean)
  if (apiKey && baseURL) return { apiKey, baseURL }
  if (/^https?:\/\//i.test(text)) return { baseURL: text }
  return { apiKey: text }
}

function resolveCredentials() {
  const saved = parseSaved(getKey('llmproxy'))
  return {
    apiKey: clean(process.env.LLM_PROXY_API_KEY) || saved.apiKey || null,
    baseURL: clean(process.env.LLM_PROXY_BASE_URL) || saved.baseURL || null,
  }
}

function quotaStatsURL(baseURL) {
  const raw = clean(baseURL)
  if (!raw) throw new Error('Missing LLM Proxy base URL')
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[parts.length - 1] !== 'v1') parts.push('v1')
  parts.push('quota-stats')
  url.pathname = '/' + parts.join('/')
  url.search = ''
  url.hash = ''
  return url.toString()
}

function int(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseDate(value) {
  const text = clean(value)
  if (!text) return null
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : null
}

function clampPercent(value) {
  const n = num(value)
  return n == null ? null : Math.max(0, Math.min(100, n))
}

function tokenTotal(tokens) {
  if (!tokens || typeof tokens !== 'object') return 0
  return int(tokens.input_cached) + int(tokens.input_uncached) + int(tokens.output)
}

function quotaGroups(stats) {
  const raw = stats?.quota_groups
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (raw && typeof raw === 'object') return Object.values(raw).filter(Boolean)
  return []
}

function parseSnapshot(json, updatedAt = Date.now()) {
  if (!json || typeof json !== 'object') throw new Error('Invalid LLM Proxy response')
  const providers = json.providers && typeof json.providers === 'object' ? json.providers : {}
  const summaries = Object.entries(providers)
    .map(([name, stats]) => ({
      name,
      requests: int(stats?.total_requests),
      tokens: tokenTotal(stats?.tokens),
      approximateCostUSD: num(stats?.approx_cost),
    }))
    .sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name))

  const totalRequests =
    json.summary?.total_requests == null ? summaries.reduce((sum, provider) => sum + provider.requests, 0) : int(json.summary.total_requests)
  const totalTokens =
    json.summary?.total_tokens == null ? summaries.reduce((sum, provider) => sum + provider.tokens, 0) : int(json.summary.total_tokens)
  const providerCosts = summaries.map((provider) => provider.approximateCostUSD).filter((value) => value != null)
  const approximateCostUSD =
    json.summary?.approx_cost == null ? (providerCosts.length ? providerCosts.reduce((sum, value) => sum + value, 0) : null) : num(json.summary.approx_cost)

  const groups = Object.values(providers).flatMap(quotaGroups)
  const remainingPercents = groups.map((group) => clampPercent(group.remaining_percent)).filter((value) => value != null)
  const resets = groups.map((group) => parseDate(group.reset_time)).filter((value) => value != null)

  return {
    connected: true,
    providerCount: Object.keys(providers).length,
    credentialCount: Object.values(providers).reduce((sum, stats) => sum + int(stats?.credential_count), 0),
    activeCredentialCount: Object.values(providers).reduce((sum, stats) => sum + int(stats?.active_count), 0),
    exhaustedCredentialCount: Object.values(providers).reduce((sum, stats) => sum + int(stats?.exhausted_count), 0),
    totalRequests,
    totalTokens,
    approximateCostUSD,
    minimumRemainingPercent: remainingPercents.length ? Math.min(...remainingPercents) : null,
    nextResetAt: resets.length ? Math.min(...resets) : null,
    topProviders: summaries,
    lastActive: updatedAt,
  }
}

function compactText(text, maxLength = 240) {
  const collapsed = String(text || '').replace(/\s+/g, ' ').trim()
  return collapsed.length > maxLength ? collapsed.slice(0, maxLength) + '...' : collapsed
}

async function read() {
  const credentials = resolveCredentials()
  if (!credentials.apiKey) return { connected: false, error: 'LLM Proxy API key not configured' }
  if (!credentials.baseURL) return { connected: false, error: 'LLM Proxy base URL not configured' }
  try {
    const res = await fetchWithTimeout(
      quotaStatsURL(credentials.baseURL),
      {
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          Accept: 'application/json',
        },
      },
      15000,
    )
    const text = await res.text()
    if (!res.ok) return { connected: false, error: `LLM Proxy HTTP ${res.status}: ${compactText(text)}` }
    return parseSnapshot(JSON.parse(text))
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    parseSaved,
    parseSnapshot,
    quotaStatsURL,
    resolveCredentials,
  },
}
