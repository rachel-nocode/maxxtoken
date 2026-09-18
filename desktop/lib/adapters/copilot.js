const crypto = require('crypto')
const { getKey } = require('../secrets')
const { readLocalCopilotToken } = require('../copilot-auth')
const { fetchWithTimeout } = require('../http')

const USAGE_URL = 'https://api.github.com/copilot_internal/user'
const USER_ORGS_URL = 'https://api.github.com/user/orgs?per_page=100'

// Cache the locally-discovered token so we don't re-read files / spawn `gh`
// on every snapshot. Short TTL keeps it fresh after a re-login.
const LOCAL_TOKEN_TTL_MS = 5 * 60 * 1000
let localTokenCache = { token: null, at: 0 }
const orgCache = new Map()

function localToken(now = Date.now()) {
  if (now - localTokenCache.at < LOCAL_TOKEN_TTL_MS) return localTokenCache.token
  let token = null
  try {
    token = readLocalCopilotToken()
  } catch {
    token = null
  }
  localTokenCache = { token: token || null, at: now }
  return localTokenCache.token
}

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
  const entitlement = num(snapshot.entitlement)
  const remaining = num(snapshot.remaining)
  if (snapshot.unlimited === true || entitlement === -1 || remaining === -1 || entitlement === 0) return null

  let percentRemaining = pct(snapshot.percent_remaining)
  if (percentRemaining == null && entitlement > 0 && remaining != null) {
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
  const credits =
    usableQuota(direct.premium_interactions) ||
    findDynamicQuota(direct, (name) => name.includes('premium') || name.includes('ai_credit'))
  const chat =
    usableQuota(direct.chat) ||
    findDynamicQuota(direct, (name) => name.includes('chat'))
  const completions =
    usableQuota(direct.completions) ||
    findDynamicQuota(direct, (name) => name.includes('completion'))
  const hasSnapshotUsage = Boolean(credits || chat || completions)
  const legacyChat = hasSnapshotUsage ? null : quotaFromCounts(body?.monthly_quotas, body?.limited_user_quotas, 'chat')
  const legacyCompletions = hasSnapshotUsage ? null : quotaFromCounts(body?.monthly_quotas, body?.limited_user_quotas, 'completions')
  const premiumRaw = direct.premium_interactions && typeof direct.premium_interactions === 'object'
    ? direct.premium_interactions
    : null
  const extraUsage = credits && premiumRaw?.overage_permitted === true
    ? Math.max(0, num(premiumRaw.overage_count) || 0)
    : null
  const personalCredits = !credits && (num(premiumRaw?.credits_used) || 0) > 0
    ? Math.max(0, num(premiumRaw.credits_used))
    : null
  const isOrgManaged = body?.token_based_billing === true && !credits && !chat && !completions && !legacyChat && !legacyCompletions
  return {
    credits,
    chat: chat || legacyChat,
    completions: completions || legacyCompletions,
    extraUsage,
    personalCredits,
    isOrgManaged,
  }
}

function planLabel(raw) {
  const plan = String(raw || '').trim()
  if (!plan || plan === 'unknown') return 'Copilot'
  return 'Copilot ' + plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase()
}

function parseUsage(body) {
  const quotas = quotaSnapshots(body)
  if (!quotas.credits && !quotas.chat && !quotas.completions && !quotas.isOrgManaged) throw new Error('No Copilot quota data')
  return {
    connected: true,
    plan: planLabel(body?.copilot_plan),
    credits: quotas.credits,
    premium: quotas.credits || quotas.completions,
    chat: quotas.chat,
    completions: quotas.completions,
    extraUsage: quotas.extraUsage,
    personalCredits: quotas.personalCredits,
    isOrgManaged: quotas.isOrgManaged,
    resetAt: parseDate(body?.quota_reset_date),
    lastActive: Date.now(),
  }
}

function orgLogins(body) {
  if (!Array.isArray(body)) return []
  return body.map((item) => String(item?.login || '').trim()).filter(Boolean)
}

function parseOrgBilling(body) {
  const items = Array.isArray(body?.usageItems) ? body.usageItems : null
  if (!items) return null
  const creditItems = items.filter((item) => {
    const product = String(item?.product || '').trim().toLowerCase()
    const unit = String(item?.unitType || '').trim().toLowerCase()
    return product === 'copilot' && (unit === 'ai-units' || unit === 'ai-credits')
  })
  if (!creditItems.length) return null
  return {
    credits: creditItems.reduce((sum, item) => sum + Math.max(0, num(item.grossQuantity) || 0), 0),
    spendUSD: creditItems.reduce((sum, item) => sum + Math.max(0, num(item.netAmount) || 0), 0),
  }
}

function tokenFingerprint(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

function githubHeaders(token, copilot = false) {
  return {
    Authorization: `token ${token.trim()}`,
    Accept: copilot ? 'application/json' : 'application/vnd.github+json',
    'Editor-Version': 'vscode/1.96.2',
    'Editor-Plugin-Version': 'copilot-chat/0.26.7',
    'User-Agent': copilot ? 'GitHubCopilotChat/0.26.7' : 'MaxxToken',
    'X-Github-Api-Version': copilot ? '2025-04-01' : '2022-11-28',
  }
}

async function requestJSON(url, token, options = {}, copilot = false) {
  const request = options.fetchWithTimeout || fetchWithTimeout
  const res = await request(url, { headers: githubHeaders(token, copilot) }, 15000)
  let body = null
  try { body = await res.json() } catch { body = null }
  return { status: res.status, ok: res.ok, body }
}

async function findOrgBilling(token, options = {}) {
  const fingerprint = tokenFingerprint(token)
  const cached = orgCache.get(fingerprint)
  if (cached) {
    try {
      const result = await requestJSON(`https://api.github.com/orgs/${encodeURIComponent(cached)}/settings/billing/usage/summary`, token, options)
      if (result.ok) {
        const usage = parseOrgBilling(result.body)
        if (usage) return { ...usage, org: cached }
        orgCache.delete(fingerprint)
      } else if (result.status === 429 || result.status >= 500) {
        return null
      } else {
        orgCache.delete(fingerprint)
      }
    } catch {
      return null
    }
  }

  let orgs
  try {
    const result = await requestJSON(USER_ORGS_URL, token, options)
    if (!result.ok) return null
    orgs = orgLogins(result.body)
  } catch {
    return null
  }
  for (const org of orgs) {
    try {
      const result = await requestJSON(`https://api.github.com/orgs/${encodeURIComponent(org)}/settings/billing/usage/summary`, token, options)
      if (!result.ok) continue
      const usage = parseOrgBilling(result.body)
      if (!usage) continue
      if (orgCache.size >= 8) orgCache.clear()
      orgCache.set(fingerprint, org)
      return { ...usage, org }
    } catch {
      /* an optional org failure cannot hide personal usage */
    }
  }
  return null
}

async function read(options = {}) {
  // Saved key wins; otherwise reuse a token already on disk (Copilot plugin or gh).
  const token = options.token || getKey('copilot') || localToken()
  if (!token) return { connected: false, needsKey: true }

  try {
    const request = options.fetchWithTimeout || fetchWithTimeout
    const res = await request(
      USAGE_URL,
      {
        headers: githubHeaders(token, true),
      },
      15000,
    )
    if (res.status === 401 || res.status === 403) {
      return { connected: false, needsKey: true, error: 'GitHub token rejected' }
    }
    if (!res.ok) return { connected: false, needsKey: true, error: `HTTP ${res.status}` }
    const usage = parseUsage(await res.json())
    if (usage.isOrgManaged) usage.orgBilling = await findOrgBilling(token, options)
    return usage
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
    findOrgBilling,
    orgLogins,
    parseOrgBilling,
    quotaSnapshots,
    resetOrgCacheForTesting() { orgCache.clear() },
  },
}
