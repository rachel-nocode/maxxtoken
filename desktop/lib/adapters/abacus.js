const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const COMPUTE_POINTS_URL = 'https://apps.abacus.ai/api/_getOrganizationComputePoints'
const BILLING_INFO_URL = 'https://apps.abacus.ai/api/_getBillingInfo'

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if (text.toLowerCase().startsWith('cookie:')) text = text.slice(7).trim()
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function normalizeCookieHeader(raw) {
  const text = clean(raw)
  if (!text || !text.includes('=')) return null
  const pairs = []
  for (const chunk of text.split(';')) {
    const index = chunk.indexOf('=')
    if (index < 0) continue
    const name = chunk.slice(0, index).trim()
    const value = chunk.slice(index + 1).trim()
    if (name && value) pairs.push(`${name}=${value}`)
  }
  return pairs.length ? pairs.join('; ') : null
}

function parseSaved(value) {
  const text = clean(value)
  if (!text) return {}
  try {
    const json = JSON.parse(text)
    if (json && typeof json === 'object') {
      return {
        cookieHeader: normalizeCookieHeader(json.cookieHeader || json.cookie || json.session),
      }
    }
  } catch {
    /* fall through */
  }
  return { cookieHeader: normalizeCookieHeader(text) }
}

function resolveCookie() {
  const saved = parseSaved(getKey('abacus'))
  return (
    normalizeCookieHeader(process.env.ABACUS_COOKIE) ||
    normalizeCookieHeader(process.env.ABACUS_SESSION_COOKIE) ||
    saved.cookieHeader ||
    null
  )
}

function num(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseDate(value) {
  const text = clean(value)
  if (!text) return null
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : null
}

function parseResultEnvelope(json, endpoint = 'Abacus') {
  if (!json || typeof json !== 'object') throw new Error(`${endpoint}: top-level JSON is not an object`)
  if (json.success === true && json.result && typeof json.result === 'object') return json.result
  const errorMessage = clean(json.error || json.message || json.msg) || 'Unknown error'
  const lower = errorMessage.toLowerCase()
  if (
    lower.includes('expired') ||
    lower.includes('session') ||
    lower.includes('login') ||
    lower.includes('authenticate') ||
    lower.includes('unauthorized') ||
    lower.includes('unauthenticated') ||
    lower.includes('forbidden')
  ) {
    throw new Error('Abacus AI session is unauthorized or expired')
  }
  throw new Error(`${endpoint}: ${errorMessage}`)
}

function parseSnapshot(computePoints, billingInfo = {}) {
  const totalCredits = num(computePoints?.totalComputePoints)
  const creditsLeft = num(computePoints?.computePointsLeft)
  if (totalCredits == null || creditsLeft == null) {
    const keys = Object.keys(computePoints || {}).sort().join(', ')
    throw new Error(`Missing Abacus credit fields. Keys: [${keys}]`)
  }
  const creditsUsed = Math.max(0, totalCredits - creditsLeft)
  const usedPct = totalCredits > 0 ? Math.max(0, Math.min(100, (creditsUsed / totalCredits) * 100)) : 0
  return {
    connected: true,
    creditsUsed,
    creditsLeft: Math.max(0, creditsLeft),
    creditsTotal: totalCredits,
    usedPct,
    resetsAt: parseDate(billingInfo?.nextBillingDate),
    planName: clean(billingInfo?.currentTier),
    lastActive: Date.now(),
  }
}

async function requestJSON(url, method, cookieHeader, timeoutMs = 15000) {
  const res = await fetchWithTimeout(
    url,
    {
      method,
      body: method === 'POST' ? '{}' : undefined,
      headers: {
        Cookie: cookieHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    },
    timeoutMs,
  )
  const text = await res.text()
  if (res.status === 401 || res.status === 403) throw new Error('Abacus AI session is unauthorized or expired')
  if (!res.ok) throw new Error(`Abacus AI HTTP ${res.status}: ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

async function read() {
  const cookieHeader = resolveCookie()
  if (!cookieHeader) return { connected: false, error: 'Abacus AI session cookie not configured' }

  try {
    const computeEnvelope = await requestJSON(COMPUTE_POINTS_URL, 'GET', cookieHeader, 15000)
    let billing = {}
    try {
      billing = parseResultEnvelope(await requestJSON(BILLING_INFO_URL, 'POST', cookieHeader, 5000), 'billing')
    } catch {
      billing = {}
    }
    const compute = parseResultEnvelope(computeEnvelope, 'compute points')
    return parseSnapshot(compute, billing)
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    normalizeCookieHeader,
    parseResultEnvelope,
    parseSaved,
    parseSnapshot,
    resolveCookie,
  },
}
