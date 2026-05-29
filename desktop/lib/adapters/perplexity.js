const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')
const { readCookieHeader } = require('../browser-cookies')

const COOKIE_HOSTS = ['perplexity.ai']

const ENDPOINT = 'https://www.perplexity.ai/rest/billing/credits?version=2.18&source=default'
const COOKIE_NAMES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
]
const DEFAULT_COOKIE = '__Secure-next-auth.session-token'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'

function num(value) {
  if (value == null || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function ts(value) {
  const n = num(value)
  if (!n) return null
  return n > 1_000_000_000_000 ? n : n * 1000
}

function parseCookiePairs(raw) {
  const text = String(raw || '')
    .replace(/^Cookie:\s*/i, '')
    .trim()
  if (!text) return []
  const out = []
  for (const part of text.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const name = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (name && value) out.push({ name, value })
  }
  return out
}

function reassembleChunked(cookies, baseName) {
  const chunks = new Map()
  for (const cookie of cookies) {
    const lower = cookie.name.toLowerCase()
    const prefix = `${baseName.toLowerCase()}.`
    if (!lower.startsWith(prefix)) continue
    const index = Number(lower.slice(prefix.length))
    if (Number.isInteger(index) && index >= 0) chunks.set(index, cookie.value)
  }
  if (!chunks.has(0)) return null
  const max = Math.max(...chunks.keys())
  const parts = []
  for (let i = 0; i <= max; i++) {
    if (!chunks.has(i)) return null
    parts.push(chunks.get(i))
  }
  return parts.join('')
}

function cookieCandidates(raw) {
  const text = String(raw || '').trim()
  if (!text) return []
  if (!text.includes('=') && !text.includes(';')) {
    return COOKIE_NAMES.map((name) => ({ name, token: text }))
  }

  const cookies = parseCookiePairs(text)
  const lower = new Map(cookies.map((cookie) => [cookie.name.toLowerCase(), cookie]))
  const out = []
  for (const name of COOKIE_NAMES) {
    const match = lower.get(name.toLowerCase())
    if (match) out.push({ name: match.name, token: match.value })
    const chunked = reassembleChunked(cookies, name)
    if (chunked) out.push({ name, token: chunked })
  }
  return out
}

function resolveCandidates(options = {}) {
  const saved = getKey('perplexity')
  const envCookie = process.env.PERPLEXITY_COOKIE || process.env.perplexity_cookie
  const envToken = process.env.PERPLEXITY_SESSION_TOKEN || process.env.perplexity_session_token
  // Zero-paste fallback: pull the session cookie from a logged-in browser.
  const browser = readCookieHeader({
    hosts: COOKIE_HOSTS,
    cookieNames: COOKIE_NAMES,
    home: options.home,
    files: options.browserCookieFiles,
  })
  return [
    ...cookieCandidates(saved),
    ...cookieCandidates(envCookie),
    ...cookieCandidates(envToken),
    ...cookieCandidates(browser),
  ].filter(
    (item, index, all) => item.token && all.findIndex((other) => other.name === item.name && other.token === item.token) === index,
  )
}

async function fetchCredits(candidate) {
  const res = await fetchWithTimeout(
    ENDPOINT,
    {
      headers: {
        Accept: 'application/json',
        Cookie: `${candidate.name}=${candidate.token}`,
        Origin: 'https://www.perplexity.ai',
        Referer: 'https://www.perplexity.ai/account/usage',
        'User-Agent': USER_AGENT,
      },
    },
    15000,
  )
  const text = await res.text()
  if (res.status === 401 || res.status === 403) throw new Error('Perplexity session cookie is invalid or expired.')
  if (!res.ok) throw new Error(`Perplexity HTTP ${res.status}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Could not parse Perplexity usage response.')
  }
}

function grantAmount(grant) {
  return num(grant.amount_cents ?? grant.amountCents)
}

function grantExpiry(grant) {
  return ts(grant.expires_at_ts ?? grant.expiresAtTs)
}

function parseCreditsResponse(json, now = Date.now()) {
  const grants = Array.isArray(json.credit_grants) ? json.credit_grants : Array.isArray(json.creditGrants) ? json.creditGrants : []
  const active = grants.filter((grant) => {
    const expiry = grantExpiry(grant)
    return !expiry || expiry > now
  })
  const recurring = active.filter((grant) => grant.type === 'recurring')
  const promo = active.filter((grant) => grant.type === 'promotional')
  const purchased = active.filter((grant) => grant.type === 'purchased')

  const recurringTotalCents = Math.max(0, recurring.reduce((sum, grant) => sum + grantAmount(grant), 0))
  const promoTotalCents = Math.max(0, promo.reduce((sum, grant) => sum + grantAmount(grant), 0))
  const purchasedFromGrants = Math.max(0, purchased.reduce((sum, grant) => sum + grantAmount(grant), 0))
  const purchasedFromField = Math.max(0, num(json.current_period_purchased_cents ?? json.currentPeriodPurchasedCents))
  const purchasedTotalCents = Math.max(purchasedFromGrants, purchasedFromField)
  const totalUsageCents = Math.max(0, num(json.total_usage_cents ?? json.totalUsageCents))

  let remainingUsage = totalUsageCents
  const recurringUsedCents = Math.min(remainingUsage, recurringTotalCents)
  remainingUsage -= recurringUsedCents
  const purchasedUsedCents = Math.min(remainingUsage, purchasedTotalCents)
  remainingUsage -= purchasedUsedCents
  const promoUsedCents = Math.min(remainingUsage, promoTotalCents)

  const renewalDate = ts(json.renewal_date_ts ?? json.renewalDateTs)
  const promoExpiration = promo.map(grantExpiry).filter(Boolean).sort((a, b) => a - b)[0] || null
  const balanceCents = Math.max(0, num(json.balance_cents ?? json.balanceCents))
  const poolTotalCents = recurringTotalCents + promoTotalCents + purchasedTotalCents
  const totalCents = Math.max(poolTotalCents, totalUsageCents + balanceCents)
  const plan = recurringTotalCents > 0 ? (recurringTotalCents < 5000 ? 'Pro' : 'Max') : null

  return {
    connected: true,
    plan,
    balanceCents,
    totalUsageCents,
    totalCents,
    recurringTotalCents,
    recurringUsedCents,
    promoTotalCents,
    promoUsedCents,
    purchasedTotalCents,
    purchasedUsedCents,
    renewalDate,
    promoExpiration,
    lastActive: now,
  }
}

async function read() {
  const candidates = resolveCandidates()
  if (!candidates.length) return { connected: false }

  let lastError = null
  for (const candidate of candidates) {
    try {
      return { ...parseCreditsResponse(await fetchCredits(candidate)), cookieName: candidate.name }
    } catch (err) {
      lastError = err
    }
  }
  return { connected: false, error: lastError && lastError.message ? lastError.message : String(lastError) }
}

module.exports = {
  read,
  _private: {
    cookieCandidates,
    parseCreditsResponse,
  },
}
