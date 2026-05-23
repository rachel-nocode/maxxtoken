const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const API_BASE = 'https://api.commandcode.ai'
const WEB_ORIGIN = 'https://commandcode.ai'

const PLANS = {
  'individual-go': { id: 'individual-go', displayName: 'Go', monthlyCreditsUSD: 10 },
  'individual-pro': { id: 'individual-pro', displayName: 'Pro', monthlyCreditsUSD: 30 },
  'individual-max': { id: 'individual-max', displayName: 'Max', monthlyCreditsUSD: 150 },
  'individual-ultra': { id: 'individual-ultra', displayName: 'Ultra', monthlyCreditsUSD: 300 },
}

const SESSION_COOKIE_NAMES = [
  '__Host-better-auth.session_token',
  '__Secure-better-auth.session_token',
  'better-auth.session_token',
]

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if (text.toLowerCase().startsWith('cookie:')) text = text.slice(7).trim()
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function cookieOverride(raw) {
  const text = clean(raw)
  if (!text) return null
  if (!text.includes('=') && !text.includes(';')) {
    return {
      name: '__Secure-better-auth.session_token',
      token: text,
      headerValue: `__Secure-better-auth.session_token=${text}`,
    }
  }

  const pairs = new Map()
  for (const chunk of text.split(';')) {
    const index = chunk.indexOf('=')
    if (index < 0) continue
    const name = chunk.slice(0, index).trim()
    const value = chunk.slice(index + 1).trim()
    if (name && value) pairs.set(name.toLowerCase(), { name, value })
  }
  for (const expected of SESSION_COOKIE_NAMES) {
    const match = pairs.get(expected.toLowerCase())
    if (match) return { name: match.name, token: match.value, headerValue: `${match.name}=${match.value}` }
  }
  return null
}

function resolveCookie() {
  const saved = getKey('commandcode')
  const override =
    cookieOverride(process.env.COMMANDCODE_COOKIE) ||
    cookieOverride(process.env.COMMANDCODE_SESSION_TOKEN) ||
    cookieOverride(process.env.COMMAND_CODE_COOKIE) ||
    cookieOverride(process.env.COMMAND_CODE_SESSION_TOKEN) ||
    cookieOverride(saved)
  return override?.headerValue || null
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function parseDate(value) {
  const parsed = Date.parse(clean(value))
  return Number.isFinite(parsed) ? parsed : null
}

function parseCredits(json) {
  const credits = json?.credits
  if (!credits || typeof credits !== 'object') throw new Error("Credits: missing 'credits' object")
  if (credits.monthlyCredits == null) throw new Error('Credits: missing monthlyCredits')
  return {
    monthlyCredits: num(credits.monthlyCredits),
    purchasedCredits: num(credits.purchasedCredits),
    premiumMonthlyCredits: num(credits.premiumMonthlyCredits),
    opensourceMonthlyCredits: num(credits.opensourceMonthlyCredits),
  }
}

function parseSubscription(json) {
  if (!(json?.success === true)) return null
  const data = json.data
  if (!data || typeof data !== 'object') return null
  const planID = clean(data.planId)
  if (!planID) throw new Error('Subscriptions: missing planId')
  return {
    planID,
    status: clean(data.status) || 'unknown',
    currentPeriodEnd: parseDate(data.currentPeriodEnd),
  }
}

function planForID(planID) {
  return PLANS[String(planID || '').toLowerCase()] || null
}

function parseSnapshot(creditsJson, subscriptionJson, now = Date.now()) {
  const credits = parseCredits(creditsJson)
  const subscription = parseSubscription(subscriptionJson)
  const plan = subscription ? planForID(subscription.planID) : null
  if (subscription && subscription.status.toLowerCase() === 'active' && !plan) {
    throw new Error(`Unknown Command Code plan: ${subscription.planID}`)
  }

  const monthlyCreditsTotal = plan?.monthlyCreditsUSD ?? null
  const monthlyCreditsUsed =
    monthlyCreditsTotal == null
      ? null
      : Math.max(0, Math.min(monthlyCreditsTotal, monthlyCreditsTotal - credits.monthlyCredits))
  const usedPct =
    monthlyCreditsTotal && monthlyCreditsTotal > 0
      ? Math.max(0, Math.min(100, (monthlyCreditsUsed / monthlyCreditsTotal) * 100))
      : credits.monthlyCredits > 0 || credits.purchasedCredits > 0
        ? 0
        : null

  return {
    connected: true,
    ...credits,
    plan,
    monthlyCreditsTotal,
    monthlyCreditsUsed,
    usedPct,
    billingPeriodEnd: subscription?.currentPeriodEnd || null,
    subscriptionStatus: subscription?.status || null,
    lastActive: now,
  }
}

function formatUSD(value) {
  const n = num(value)
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: n < 100 ? 2 : 0,
    maximumFractionDigits: n < 100 ? 2 : 0,
  })
}

function compactText(text, maxLength = 240) {
  const collapsed = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  return collapsed.length > maxLength ? collapsed.slice(0, maxLength) + '...' : collapsed
}

async function requestJSON(path, cookieHeader) {
  const res = await fetchWithTimeout(
    `${API_BASE}${path}`,
    {
      headers: {
        Cookie: cookieHeader,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Origin: WEB_ORIGIN,
        Referer: `${WEB_ORIGIN}/`,
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      },
    },
    15000,
  )
  const text = await res.text()
  if (res.status === 401 || res.status === 403) {
    const error = new Error('Command Code session is invalid or expired')
    error.status = res.status
    throw error
  }
  if (!res.ok) {
    const error = new Error(`Command Code HTTP ${res.status}: ${compactText(text)}`)
    error.status = res.status
    throw error
  }
  return text ? JSON.parse(text) : {}
}

async function read() {
  const cookie = resolveCookie()
  if (!cookie) return { connected: false, error: 'Command Code session cookie not configured' }
  try {
    const [credits, subscription] = await Promise.all([
      requestJSON('/internal/billing/credits', cookie),
      requestJSON('/internal/billing/subscriptions', cookie),
    ])
    return parseSnapshot(credits, subscription)
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    cookieOverride,
    formatUSD,
    parseCredits,
    parseSnapshot,
    parseSubscription,
    planForID,
    resolveCookie,
  },
}
