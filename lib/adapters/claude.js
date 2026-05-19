const { readClaudeCredentials, persistClaudeCredentials } = require('../auth')
const { fetchWithTimeout } = require('../http')

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const REFRESH_URL = 'https://platform.claude.com/v1/oauth/token'
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const SCOPES =
  'user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload'
const REFRESH_BUFFER_MS = 5 * 60 * 1000
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000

let cachedUsage = null
let cachedUsageAt = 0
let rateLimitedUntil = 0

function toMs(resetsAt) {
  if (!resetsAt) return null
  if (typeof resetsAt === 'number') return resetsAt < 1e12 ? resetsAt * 1000 : resetsAt
  const p = Date.parse(resetsAt)
  return Number.isFinite(p) ? p : null
}

async function refresh(creds) {
  const oauth = creds.data.claudeAiOauth
  if (!oauth.refreshToken) return null
  const resp = await fetchWithTimeout(REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: oauth.refreshToken,
      client_id: CLIENT_ID,
      scope: SCOPES,
    }),
  }, 15000)
  if (!resp.ok) {
    if (resp.status === 400 || resp.status === 401) {
      throw 'Session expired. Run `claude` to log in again.'
    }
    return null
  }
  const body = await resp.json()
  if (!body.access_token) return null
  oauth.accessToken = body.access_token
  if (body.refresh_token) oauth.refreshToken = body.refresh_token
  if (typeof body.expires_in === 'number') {
    oauth.expiresAt = Date.now() + body.expires_in * 1000
  }
  persistClaudeCredentials(creds)
  return oauth.accessToken
}

async function fetchUsage(token) {
  return fetchWithTimeout(USAGE_URL, {
    headers: {
      Authorization: 'Bearer ' + token.trim(),
      Accept: 'application/json',
      'anthropic-beta': 'oauth-2025-04-20',
      'User-Agent': 'claude-code/2.1.69',
    },
  }, 10000)
}

function retryAfterMs(headers) {
  const raw = headers.get('retry-after')
  if (!raw) return DEFAULT_RATE_LIMIT_BACKOFF_MS
  const seconds = Number.parseInt(raw, 10)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const dateMs = Date.parse(raw)
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now())
  return DEFAULT_RATE_LIMIT_BACKOFF_MS
}

function planLabel(oauth) {
  const sub = oauth.subscriptionType
  if (!sub) return 'Claude'
  const base = sub.charAt(0).toUpperCase() + sub.slice(1)
  const tier = String(oauth.rateLimitTier || '').match(/(\d+)x/)
  return tier ? `${base} ${tier[1]}x` : base
}

function windowsFromUsage(data) {
  const defs = [
    { key: 'five_hour', label: 'Session', kind: '5h', periodMs: 5 * 3600e3 },
    { key: 'seven_day', label: 'Weekly', kind: '7d', periodMs: 7 * 86400e3 },
    { key: 'seven_day_sonnet', label: 'Sonnet', kind: '7d', periodMs: 7 * 86400e3 },
    { key: 'seven_day_omelette', label: 'Claude Design', kind: '7d', periodMs: 7 * 86400e3 },
  ]
  const windows = []
  for (const d of defs) {
    const w = data[d.key]
    if (w && typeof w.utilization === 'number') {
      windows.push({
        label: d.label,
        kind: d.kind,
        usedPct: Math.round(w.utilization),
        resetAt: toMs(w.resets_at),
        periodMs: d.periodMs,
      })
    }
  }
  return windows
}

function resultFromUsage(plan, data, cached = false) {
  const windows = windowsFromUsage(data)
  const extra = []
  if (data.extra_usage && data.extra_usage.is_enabled) {
    // credits are reported in cents
    const used = (Number(data.extra_usage.used_credits) || 0) / 100
    const limit = (Number(data.extra_usage.monthly_limit) || 0) / 100
    extra.push({ label: 'Extra usage', value: `$${used.toFixed(2)} / $${limit.toFixed(0)}` })
  }
  if (cached) extra.push({ label: 'Status', value: 'cached live usage' })
  return { connected: true, plan, windows, extra, lastActive: cached ? cachedUsageAt : Date.now() }
}

async function read() {
  const creds = readClaudeCredentials()
  if (!creds) return { connected: false }
  const oauth = creds.data.claudeAiOauth
  const plan = planLabel(oauth)

  try {
    let token = oauth.accessToken
    if (!token) throw 'Not logged in. Run `claude` to authenticate.'
    if (oauth.expiresAt && oauth.expiresAt - Date.now() < REFRESH_BUFFER_MS) {
      const t = await refresh(creds)
      if (t) token = t
    }

    if (Date.now() < rateLimitedUntil && cachedUsage) {
      return resultFromUsage(plan, cachedUsage, true)
    }

    let resp = await fetchUsage(token)
    if (resp.status === 401) {
      const t = await refresh(creds)
      if (t) resp = await fetchUsage(t)
    }
    if (resp.status === 429) {
      rateLimitedUntil = Date.now() + retryAfterMs(resp.headers)
      if (cachedUsage) return resultFromUsage(plan, cachedUsage, true)
      return { connected: true, plan, windows: [], error: 'Rate limited — try again soon.' }
    }
    if (!resp.ok) {
      return { connected: true, plan, windows: [], error: `Usage API error (${resp.status}).` }
    }

    const data = await resp.json()
    cachedUsage = data
    cachedUsageAt = Date.now()
    rateLimitedUntil = 0
    return resultFromUsage(plan, data)
  } catch (e) {
    if (cachedUsage) return resultFromUsage(plan, cachedUsage, true)
    return { connected: true, plan, windows: [], error: typeof e === 'string' ? e : 'Usage fetch failed.' }
  }
}

module.exports = { read }
