// OpenRouter usage. The `/auth/key` endpoint returns total spend, optional
// credit cap, and remaining credits for the API key the user provided.
const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const ENDPOINT = 'https://openrouter.ai/api/v1/auth/key'

async function read() {
  const key = getKey('openrouter')
  if (!key) return { connected: false }
  try {
    const res = await fetchWithTimeout(ENDPOINT, {
      headers: { Authorization: `Bearer ${key}` },
    }, 10000)
    if (res.status === 401 || res.status === 403) {
      return { connected: false, error: 'API key rejected' }
    }
    if (!res.ok) return { connected: false, error: `HTTP ${res.status}` }
    const json = await res.json()
    const d = (json && json.data) || {}
    const usage = Number(d.usage) || 0
    // limit can be null (no cap) or a positive number.
    const limit = d.limit == null ? null : Number(d.limit)
    const remaining = d.limit_remaining == null ? null : Number(d.limit_remaining)
    return {
      connected: true,
      usage,
      limit,
      remaining,
      label: d.label || '',
      isFreeTier: !!d.is_free_tier,
      lastActive: Date.now(),
    }
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = { read }
