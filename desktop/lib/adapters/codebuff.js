const fs = require('fs')
const os = require('os')
const path = require('path')
const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const DEFAULT_BASE = 'https://www.codebuff.com'
const CREDENTIALS_FILE = path.join(os.homedir(), '.config', 'manicode', 'credentials.json')

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text || null
}

function parseAuthToken(text) {
  try {
    const json = JSON.parse(String(text || ''))
    return clean(json.default?.authToken) || clean(json.authToken)
  } catch {
    return null
  }
}

function fileToken(file = CREDENTIALS_FILE) {
  try {
    return parseAuthToken(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function resolveToken() {
  const env = clean(process.env.CODEBUFF_API_KEY)
  if (env) return { token: env, source: 'env' }
  const saved = clean(getKey('codebuff'))
  if (saved) return { token: saved, source: 'saved' }
  const local = fileToken()
  if (local) return { token: local, source: 'cli' }
  return null
}

function baseURL() {
  const raw = clean(process.env.CODEBUFF_API_URL)
  if (!raw) return DEFAULT_BASE
  try {
    const url = new URL(raw)
    return url.origin
  } catch {
    return DEFAULT_BASE
  }
}

function num(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function str(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function parseDate(value) {
  const n = num(value)
  if (n != null) return n > 10_000_000_000 ? n : n * 1000
  const ms = Date.parse(String(value || ''))
  return Number.isFinite(ms) ? ms : null
}

function parseUsagePayload(root) {
  const json = root && typeof root === 'object' ? root : {}
  return {
    used: num(json.usage) ?? num(json.used),
    total: num(json.quota) ?? num(json.limit),
    remaining: num(json.remainingBalance) ?? num(json.remaining),
    nextQuotaReset: parseDate(json.next_quota_reset ?? json.nextQuotaReset),
    autoTopUpEnabled:
      typeof json.autoTopupEnabled === 'boolean'
        ? json.autoTopupEnabled
        : typeof json.auto_topup_enabled === 'boolean'
          ? json.auto_topup_enabled
          : null,
  }
}

function parseSubscriptionPayload(root) {
  const json = root && typeof root === 'object' ? root : {}
  const subscription = json.subscription && typeof json.subscription === 'object' ? json.subscription : {}
  const rateLimit = json.rateLimit && typeof json.rateLimit === 'object' ? json.rateLimit : {}
  const user = json.user && typeof json.user === 'object' ? json.user : {}
  return {
    tier:
      str(subscription.displayName) ??
      str(json.displayName) ??
      str(subscription.tier) ??
      str(json.tier) ??
      str(subscription.scheduledTier),
    status: str(subscription.status),
    billingPeriodEnd: parseDate(subscription.billingPeriodEnd ?? subscription.currentPeriodEnd),
    weeklyUsed: num(rateLimit.weeklyUsed) ?? num(rateLimit.used),
    weeklyLimit: num(rateLimit.weeklyLimit) ?? num(rateLimit.limit),
    weeklyResetsAt: parseDate(rateLimit.weeklyResetsAt),
    email: str(json.email) ?? str(user.email),
  }
}

async function fetchJSON(url, options, timeout = 15000) {
  const res = await fetchWithTimeout(url, options, timeout)
  const text = await res.text()
  if (res.status === 401 || res.status === 403) throw new Error('Codebuff token is invalid or expired.')
  if (res.status === 404) throw new Error('Codebuff usage endpoint was not found.')
  if (res.status >= 500) throw new Error(`Codebuff service unavailable (${res.status}).`)
  if (!res.ok) throw new Error(`Codebuff HTTP ${res.status}`)
  try {
    return JSON.parse(text || '{}')
  } catch {
    throw new Error('Could not parse Codebuff response.')
  }
}

async function fetchUsage(token, base) {
  return parseUsagePayload(
    await fetchJSON(`${base}/api/v1/usage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fingerprintId: 'maxxtoken-usage' }),
    }),
  )
}

async function fetchSubscription(token, base) {
  try {
    return parseSubscriptionPayload(
      await fetchJSON(
        `${base}/api/user/subscription`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        },
        5000,
      ),
    )
  } catch {
    return null
  }
}

async function read() {
  const auth = resolveToken()
  if (!auth) return { connected: false }
  try {
    const base = baseURL()
    const [usage, subscription] = await Promise.all([fetchUsage(auth.token, base), fetchSubscription(auth.token, base)])
    return {
      connected: true,
      source: auth.source,
      creditsUsed: usage.used,
      creditsTotal: usage.total,
      creditsRemaining: usage.remaining,
      nextQuotaReset: usage.nextQuotaReset,
      autoTopUpEnabled: usage.autoTopUpEnabled,
      weeklyUsed: subscription?.weeklyUsed ?? null,
      weeklyLimit: subscription?.weeklyLimit ?? null,
      weeklyResetsAt: subscription?.weeklyResetsAt ?? null,
      billingPeriodEnd: subscription?.billingPeriodEnd ?? null,
      tier: subscription?.tier ?? null,
      subscriptionStatus: subscription?.status ?? null,
      email: subscription?.email ?? null,
      lastActive: Date.now(),
    }
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    parseAuthToken,
    parseUsagePayload,
    parseSubscriptionPayload,
  },
}
