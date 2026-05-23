const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const ENDPOINT = 'https://crof.ai/usage_api/'
const RESET_TZ = 'America/Chicago'

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function resolveKey() {
  return clean(process.env.CROF_API_KEY) || clean(process.env.CROFAI_API_KEY) || clean(getKey('crof'))
}

function num(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function timeZoneParts(date, timeZone = RESET_TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const out = {}
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = Number(part.value)
  }
  if (out.hour === 24) out.hour = 0
  return out
}

function zonedTimeToUTC(year, month, day, hour, minute, second, timeZone = RESET_TZ) {
  const target = Date.UTC(year, month - 1, day, hour, minute, second)
  let guess = target
  for (let i = 0; i < 3; i++) {
    const parts = timeZoneParts(new Date(guess), timeZone)
    const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    guess -= asUTC - target
  }
  return guess
}

function nextCentralMidnight(now = Date.now()) {
  const local = timeZoneParts(new Date(now), RESET_TZ)
  const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1, 12, 0, 0))
  return zonedTimeToUTC(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, 0, RESET_TZ)
}

function parseUsage(json, now = Date.now()) {
  const credits = Math.max(0, num(json?.credits) ?? 0)
  const requestsPlan = Math.max(0, num(json?.requests_plan ?? json?.requestsPlan) ?? 0)
  const usableRequests = Math.max(0, num(json?.usable_requests ?? json?.usableRequests) ?? 0)
  const boundedUsable = requestsPlan > 0 ? Math.min(requestsPlan, usableRequests) : usableRequests
  const remainingPct = requestsPlan > 0 ? Math.floor((boundedUsable / requestsPlan) * 100) : 0
  return {
    connected: true,
    credits,
    requestsPlan,
    usableRequests,
    requestsUsed: requestsPlan > 0 ? Math.max(0, requestsPlan - boundedUsable) : 0,
    usedPct: requestsPlan > 0 ? Math.max(0, Math.min(100, 100 - remainingPct)) : 100,
    resetAt: nextCentralMidnight(now),
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
    if (res.status === 401 || res.status === 403) return { connected: false, error: 'Crof API key rejected' }
    if (!res.ok) return { connected: false, error: `Crof HTTP ${res.status}` }
    try {
      return parseUsage(JSON.parse(text))
    } catch {
      return { connected: false, error: 'Could not parse Crof usage response' }
    }
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    nextCentralMidnight,
    parseUsage,
    resolveKey,
  },
}
