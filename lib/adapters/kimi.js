const fs = require('fs')
const os = require('os')
const path = require('path')
const { fetchWithTimeout } = require('../http')

const CRED_PATH = path.join(os.homedir(), '.kimi', 'credentials', 'kimi-code.json')
const USAGE_URL = 'https://api.kimi.com/coding/v1/usages'
const REFRESH_URL = 'https://auth.kimi.com/api/oauth/token'
const CLIENT_ID = '17e5f671-d194-4dfb-9706-5516cb48c098'
const REFRESH_BUFFER_SEC = 5 * 60

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toMs(v) {
  if (v == null) return null
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v
  const p = Date.parse(v)
  return Number.isFinite(p) ? p : null
}

function loadCreds() {
  try {
    const d = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'))
    if (d && (d.access_token || d.refresh_token)) return d
  } catch {
    /* not logged in */
  }
  return null
}

function saveCreds(creds) {
  try {
    fs.writeFileSync(CRED_PATH, JSON.stringify(creds))
  } catch {
    /* best effort */
  }
}

async function refresh(creds) {
  if (!creds.refresh_token) return null
  const resp = await fetchWithTimeout(REFRESH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body:
      'client_id=' +
      encodeURIComponent(CLIENT_ID) +
      '&grant_type=refresh_token&refresh_token=' +
      encodeURIComponent(creds.refresh_token),
  }, 15000)
  if (resp.status === 400 || resp.status === 401) {
    throw 'Session expired. Run `kimi login` to authenticate.'
  }
  if (!resp.ok) return null
  const body = await resp.json()
  if (!body.access_token) return null
  creds.access_token = body.access_token
  if (body.refresh_token) creds.refresh_token = body.refresh_token
  if (typeof body.expires_in === 'number') {
    creds.expires_at = Date.now() / 1000 + body.expires_in
  }
  saveCreds(creds)
  return creds.access_token
}

function fetchUsage(token) {
  return fetchWithTimeout(USAGE_URL, {
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
      'User-Agent': 'MaxxToken',
    },
  }, 10000)
}

function periodMs(window) {
  if (!window) return null
  const duration = num(window.duration)
  if (duration === null || duration <= 0) return null
  const unit = String(window.timeUnit || window.time_unit || '').toUpperCase()
  if (unit.includes('MINUTE')) return duration * 60000
  if (unit.includes('HOUR')) return duration * 3600e3
  if (unit.includes('DAY')) return duration * 86400e3
  if (unit.includes('SECOND')) return duration * 1000
  return null
}

function parseQuota(row) {
  if (!row || typeof row !== 'object') return null
  const limit = num(row.limit)
  if (limit === null || limit <= 0) return null
  let used = num(row.used)
  if (used === null) {
    const remaining = num(row.remaining)
    if (remaining !== null) used = limit - remaining
  }
  if (used === null) return null
  return {
    usedPct: Math.round(Math.max(0, (used / limit) * 100)),
    resetAt: toMs(row.resetTime || row.reset_at || row.resetAt || row.reset_time),
  }
}

function planLabel(data) {
  const level = data?.user?.membership?.level
  if (typeof level !== 'string') return 'Kimi'
  return level
    .replace(/^LEVEL_/, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

function windowsFromData(data) {
  const limits = Array.isArray(data?.limits) ? data.limits : []
  const candidates = []
  for (const item of limits) {
    const detail = item && typeof item.detail === 'object' ? item.detail : item
    const q = parseQuota(detail)
    if (q) candidates.push({ ...q, periodMs: periodMs(item && item.window) })
  }
  candidates.sort((a, b) => (a.periodMs || Infinity) - (b.periodMs || Infinity))

  const session = candidates[0] || null
  let weekly = null
  const usageQuota = parseQuota(data?.usage)
  if (usageQuota) weekly = { ...usageQuota, periodMs: 7 * 86400e3 }
  else weekly = candidates.filter((c) => c !== session).pop() || null

  const windows = []
  if (session) {
    windows.push({
      label: 'Session',
      kind: session.periodMs && session.periodMs <= 6 * 3600e3 ? '5h' : '7d',
      usedPct: session.usedPct,
      resetAt: session.resetAt,
      periodMs: session.periodMs,
    })
  }
  if (weekly && weekly !== session) {
    windows.push({
      label: 'Weekly',
      kind: '7d',
      usedPct: weekly.usedPct,
      resetAt: weekly.resetAt,
      periodMs: weekly.periodMs,
    })
  }
  return windows
}

async function read() {
  const creds = loadCreds()
  if (!creds) return { connected: false }

  try {
    let token = creds.access_token || ''
    const nowSec = Date.now() / 1000
    if (!token || !creds.expires_at || nowSec + REFRESH_BUFFER_SEC >= creds.expires_at) {
      const t = await refresh(creds)
      if (t) token = t
    }
    if (!token) throw 'Not logged in. Run `kimi login` to authenticate.'

    let resp = await fetchUsage(token)
    if (resp.status === 401) {
      const t = await refresh(creds)
      if (t) resp = await fetchUsage(t)
    }
    if (!resp.ok) {
      return { connected: true, plan: 'Kimi', windows: [], error: `Usage API error (${resp.status}).` }
    }
    const data = await resp.json()
    return {
      connected: true,
      plan: planLabel(data),
      windows: windowsFromData(data),
      lastActive: Date.now(),
    }
  } catch (e) {
    return {
      connected: true,
      plan: 'Kimi',
      windows: [],
      error: typeof e === 'string' ? e : 'Usage fetch failed.',
    }
  }
}

module.exports = { read }
