const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const APP_BASE = 'https://app.factory.ai'
const AUTH_BASE = 'https://auth.factory.ai'
const API_BASE = 'https://api.factory.ai'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if (text.toLowerCase().startsWith('cookie:')) text = text.slice(7).trim()
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function parseCookiePairs(raw) {
  const text = clean(raw)
  if (!text) return []
  const out = []
  for (const chunk of text.split(';')) {
    const index = chunk.indexOf('=')
    if (index <= 0) continue
    const name = chunk.slice(0, index).trim()
    const value = chunk.slice(index + 1).trim()
    if (name && value) out.push({ name, value })
  }
  return out
}

function normalizeCookieHeader(raw) {
  const pairs = parseCookiePairs(raw)
  return pairs.length ? pairs.map((pair) => `${pair.name}=${pair.value}`).join('; ') : null
}

function authorizationBearerToken(raw) {
  const text = String(raw || '')
  const match = text.match(/(?:authorization\s*:\s*)?bearer\s+([A-Za-z0-9._~+/=-]+)/i)
  return clean(match && match[1])
}

function bareBearerToken(raw) {
  const token = clean(raw)
  if (!token || token.includes('=') || token.includes(';') || /\s/.test(token)) return null
  if (token.length >= 40 || token.split('.').length >= 3) return token
  return null
}

function bearerTokenFromHeader(cookieHeader) {
  const token = parseCookiePairs(cookieHeader).find((pair) => pair.name === 'access-token')?.value
  return clean(token)
}

function manualCredentials(raw) {
  const text = clean(raw)
  if (!text) return {}
  let cookieHeader = normalizeCookieHeader(text)
  let bearerToken = authorizationBearerToken(text) || (cookieHeader ? bearerTokenFromHeader(cookieHeader) : null) || bareBearerToken(text)
  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text)
      cookieHeader = normalizeCookieHeader(json.cookieHeader || json.cookie || json.session) || cookieHeader
      bearerToken = clean(json.bearerToken || json.accessToken || json.access_token || json.token) || bearerToken
    } catch {
      /* fall through */
    }
  }
  return { cookieHeader, bearerToken }
}

function resolveCredentials() {
  const saved = manualCredentials(getKey('factory'))
  const env = manualCredentials(process.env.FACTORY_COOKIE || process.env.FACTORY_SESSION || process.env.FACTORY_TOKEN)
  const envBearer = clean(process.env.FACTORY_BEARER_TOKEN || process.env.FACTORY_ACCESS_TOKEN)
  return {
    cookieHeader: env.cookieHeader || saved.cookieHeader || null,
    bearerToken: envBearer || env.bearerToken || saved.bearerToken || null,
  }
}

function number(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function timestamp(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function clampPct(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function percentFromRatio(ratio, allowance, used) {
  const n = Number(ratio)
  const unlimitedThreshold = 1_000_000_000_000
  if (Number.isFinite(n)) {
    if (!(n === 0 && used > 0 && allowance > 0 && allowance <= unlimitedThreshold)) {
      if (n >= -0.001 && n <= 1.001) return clampPct(n * 100)
      if (!(allowance > 0 && allowance <= unlimitedThreshold) && n >= -0.1 && n <= 100.1) return clampPct(n)
    }
  }
  if (allowance > unlimitedThreshold) return clampPct((used / 100_000_000) * 100)
  return allowance > 0 ? clampPct((used / allowance) * 100) : 0
}

function parseJWTSubject(token) {
  const text = clean(token)
  if (!text || text.split('.').length < 2) return null
  try {
    const payload = text.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
    const json = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
    return clean(json.sub)
  } catch {
    return null
  }
}

function authIdentity(auth, bearerToken = null) {
  const org = auth?.organization || {}
  const subscription = org.subscription || {}
  const plan = clean(subscription.orbSubscription?.plan?.name)
  const tier = clean(subscription.factoryTier)
  const user = auth?.userProfile || {}
  return {
    planName: plan,
    tier,
    organizationName: clean(org.name),
    accountEmail: clean(user.email),
    userId: clean(user.id) || parseJWTSubject(bearerToken),
  }
}

function parseLegacySnapshot(auth, usageResponse, bearerToken = null, now = Date.now()) {
  const identity = authIdentity(auth, bearerToken)
  const usage = usageResponse?.usage || {}
  const standard = usage.standard || {}
  const premium = usage.premium || {}
  const standardUserTokens = number(standard.userTokens) || 0
  const premiumUserTokens = number(premium.userTokens) || 0
  const standardAllowance = number(standard.totalAllowance) || 0
  const premiumAllowance = number(premium.totalAllowance) || 0
  const periodEnd = timestamp(usage.endDate)
  return {
    connected: true,
    mode: 'legacy',
    ...identity,
    userId: identity.userId || clean(usageResponse?.userId),
    standard: {
      userTokens: standardUserTokens,
      orgTokens: number(standard.orgTotalTokensUsed) || 0,
      allowance: standardAllowance,
      usedPct: percentFromRatio(standard.usedRatio, standardAllowance, standardUserTokens),
    },
    premium: {
      userTokens: premiumUserTokens,
      orgTokens: number(premium.orgTotalTokensUsed) || 0,
      allowance: premiumAllowance,
      usedPct: percentFromRatio(premium.usedRatio, premiumAllowance, premiumUserTokens),
    },
    periodStart: timestamp(usage.startDate),
    periodEnd,
    totalUserTokens: standardUserTokens + premiumUserTokens,
    lastActive: now,
  }
}

function resetAtForWindow(window, now = Date.now()) {
  const seconds = number(window?.secondsRemaining)
  if (seconds && seconds > 0) return now + seconds * 1000
  const end = timestamp(window?.windowEnd)
  return end && end > now ? end : null
}

function parseBillingWindow(window, windowMinutes, now = Date.now()) {
  const resetAt = resetAtForWindow(window, now)
  const hadWindowEnd = window?.windowEnd != null
  const hadSeconds = window?.secondsRemaining != null
  return {
    usedPct: !resetAt && hadWindowEnd && !hadSeconds ? 0 : clampPct(window?.usedPercent),
    resetAt,
    periodMs: windowMinutes ? windowMinutes * 60000 : null,
  }
}

function parseTokenRateSnapshot(auth, billing, bearerToken = null, now = Date.now()) {
  const identity = authIdentity(auth, bearerToken)
  const standard = billing?.limits?.standard
  if (!standard) throw new Error('Missing Factory token rate limits')
  const core = billing?.limits?.core || null
  return {
    connected: true,
    mode: 'token-rate',
    ...identity,
    standard: {
      fiveHour: parseBillingWindow(standard.fiveHour || {}, 5 * 60, now),
      weekly: parseBillingWindow(standard.weekly || {}, 7 * 24 * 60, now),
      monthly: parseBillingWindow(standard.monthly || {}, null, now),
    },
    core: core
      ? {
          fiveHour: parseBillingWindow(core.fiveHour || {}, 5 * 60, now),
          weekly: parseBillingWindow(core.weekly || {}, 7 * 24 * 60, now),
          monthly: parseBillingWindow(core.monthly || {}, null, now),
        }
      : null,
    extraUsageBalanceCents: number(billing?.extraUsageBalanceCents) || 0,
    overagePreference: clean(billing?.overagePreference),
    lastActive: now,
  }
}

function headers(cookieHeader, bearerToken) {
  const out = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: APP_BASE,
    Referer: `${APP_BASE}/`,
    'User-Agent': USER_AGENT,
    'x-factory-client': 'web-app',
  }
  if (cookieHeader) out.Cookie = cookieHeader
  if (bearerToken) out.Authorization = `Bearer ${bearerToken}`
  return out
}

async function getJSON(url, cookieHeader, bearerToken, optional = false) {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      headers: headers(cookieHeader, bearerToken),
    },
    15000,
  )
  const text = await res.text()
  if (res.status === 401 || res.status === 403) {
    if (optional) return null
    throw new Error('Factory session rejected')
  }
  if (!res.ok) {
    if (optional) return null
    throw new Error(`Factory HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  if (!text.trim()) return {}
  return JSON.parse(text)
}

async function fetchWithBase(baseURL, credentials) {
  const auth = await getJSON(`${baseURL}/api/app/auth/me`, credentials.cookieHeader, credentials.bearerToken)
  const identity = authIdentity(auth, credentials.bearerToken)
  const userId = identity.userId
  const billing = await getJSON(`${API_BASE}/api/billing/limits`, credentials.cookieHeader, credentials.bearerToken, true)
  if (billing?.usesTokenRateLimitsBilling && billing?.limits) {
    return parseTokenRateSnapshot(auth, billing, credentials.bearerToken)
  }

  const usageURL = new URL(`${baseURL}/api/organization/subscription/usage`)
  usageURL.searchParams.set('useCache', 'true')
  if (userId) usageURL.searchParams.set('userId', userId)
  const usage = await getJSON(usageURL.toString(), credentials.cookieHeader, credentials.bearerToken)
  return parseLegacySnapshot(auth, usage, credentials.bearerToken)
}

async function read() {
  const credentials = resolveCredentials()
  if (!credentials.cookieHeader && !credentials.bearerToken) return { connected: false, error: 'Factory/Droid cookie or bearer token not configured' }

  const baseURLs = credentials.cookieHeader ? [APP_BASE, AUTH_BASE, API_BASE] : [API_BASE, APP_BASE]
  let lastError = null
  for (const baseURL of baseURLs) {
    try {
      return await fetchWithBase(baseURL, credentials)
    } catch (err) {
      lastError = err
    }
  }
  return { connected: false, error: lastError && lastError.message ? lastError.message : String(lastError) }
}

module.exports = {
  read,
  _private: {
    authIdentity,
    bearerTokenFromHeader,
    manualCredentials,
    normalizeCookieHeader,
    parseBillingWindow,
    parseJWTSubject,
    parseLegacySnapshot,
    parseTokenRateSnapshot,
    percentFromRatio,
    resetAtForWindow,
    resolveCredentials,
  },
}
