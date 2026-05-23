const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const USAGE_URL = 'https://api.github.com/copilot_internal/user'

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function pct(value) {
  const n = num(value)
  if (n == null) return null
  return Math.max(0, Math.min(100, n))
}

function parseDate(value) {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function usableQuota(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const entitlement = num(snapshot.entitlement) || 0
  const remaining = num(snapshot.remaining) || 0
  if (entitlement === 0 && remaining === 0 && !snapshot.quota_id) return null

  let percentRemaining = pct(snapshot.percent_remaining)
  if (percentRemaining == null && entitlement > 0) {
    percentRemaining = pct((remaining / entitlement) * 100)
  }
  if (percentRemaining == null) return null

  return {
    entitlement,
    remaining,
    usedPct: Math.max(0, 100 - percentRemaining),
    quotaId: snapshot.quota_id || '',
  }
}

function quotaFromCounts(monthly, limited, key) {
  const entitlement = num(monthly?.[key])
  const remaining = num(limited?.[key])
  if (entitlement == null || remaining == null || entitlement <= 0) return null
  return {
    entitlement,
    remaining,
    usedPct: Math.max(0, 100 - Math.max(0, Math.min(100, (remaining / entitlement) * 100))),
    quotaId: key,
  }
}

function findDynamicQuota(snapshots, match) {
  if (!snapshots || typeof snapshots !== 'object') return null
  for (const [key, value] of Object.entries(snapshots)) {
    const name = key.toLowerCase()
    if (!match(name)) continue
    const quota = usableQuota(value)
    if (quota) return quota
  }
  return null
}

function quotaSnapshots(body) {
  const direct = body?.quota_snapshots || {}
  const premium =
    usableQuota(direct.premium_interactions) ||
    findDynamicQuota(direct, (name) => name.includes('premium') || name.includes('completion') || name.includes('code')) ||
    quotaFromCounts(body?.monthly_quotas, body?.limited_user_quotas, 'completions')
  const chat =
    usableQuota(direct.chat) ||
    findDynamicQuota(direct, (name) => name.includes('chat')) ||
    quotaFromCounts(body?.monthly_quotas, body?.limited_user_quotas, 'chat')
  return { premium, chat }
}

function planLabel(raw) {
  const plan = String(raw || '').trim()
  if (!plan || plan === 'unknown') return 'Copilot'
  return 'Copilot ' + plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase()
}

function parseUsage(body) {
  const quotas = quotaSnapshots(body)
  if (!quotas.premium && !quotas.chat) throw new Error('No Copilot quota data')
  return {
    connected: true,
    plan: planLabel(body?.copilot_plan),
    premium: quotas.premium,
    chat: quotas.chat,
    resetAt: parseDate(body?.quota_reset_date),
    lastActive: Date.now(),
  }
}

async function read() {
  const token = getKey('copilot')
  if (!token) return { connected: false, needsKey: true }

  try {
    const res = await fetchWithTimeout(
      USAGE_URL,
      {
        headers: {
          Authorization: `token ${token.trim()}`,
          Accept: 'application/json',
          'Editor-Version': 'vscode/1.96.2',
          'Editor-Plugin-Version': 'copilot-chat/0.26.7',
          'User-Agent': 'GitHubCopilotChat/0.26.7',
          'X-Github-Api-Version': '2025-04-01',
        },
      },
      15000,
    )
    if (res.status === 401 || res.status === 403) {
      return { connected: false, needsKey: true, error: 'GitHub token rejected' }
    }
    if (!res.ok) return { connected: false, needsKey: true, error: `HTTP ${res.status}` }
    return parseUsage(await res.json())
  } catch (err) {
    return {
      connected: false,
      needsKey: true,
      error: err && err.message ? err.message : String(err),
    }
  }
}

module.exports = {
  read,
  _private: {
    parseUsage,
    quotaSnapshots,
  },
}
