const fs = require('fs')
const os = require('os')
const path = require('path')

const { readClaudeCredentials, persistClaudeCredentials } = require('../auth')
const { fetchWithTimeout } = require('../http')

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const REFRESH_URL = 'https://platform.claude.com/v1/oauth/token'
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const SCOPES =
  'user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload'
const REFRESH_BUFFER_MS = 5 * 60 * 1000
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000
const TOKEN_HISTORY_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

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
  const tokenUsage = scanClaudeTokenUsage()
  if (tokenUsage?.last30DaysTotal) extra.push({ label: '30d tokens', value: formatInteger(tokenUsage.last30DaysTotal) })
  return { connected: true, plan, windows, extra, tokenUsage, lastActive: cached ? cachedUsageAt : Date.now() }
}

function formatInteger(value) {
  return Math.round(Number(value) || 0).toLocaleString('en-US')
}

function localDayKey(ms) {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function tokenTimestamp(value) {
  if (!value) return null
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function claudeProjectsRoots(env = process.env, home = os.homedir()) {
  const configured = String(env.CLAUDE_CONFIG_DIR || '').trim()
  if (configured) {
    return configured
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const root = path.resolve(part)
        return path.basename(root) === 'projects' ? root : path.join(root, 'projects')
      })
  }
  return [
    path.join(home, '.config', 'claude', 'projects'),
    path.join(home, '.claude', 'projects'),
  ]
}

function claudeLogFiles(roots = claudeProjectsRoots(), sinceMs = Date.now() - TOKEN_HISTORY_DAYS * DAY_MS) {
  const files = []
  function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
      try {
        const stat = fs.statSync(full)
        if (!sinceMs || stat.mtimeMs >= sinceMs) files.push(full)
      } catch {
        /* ignore unreadable files */
      }
    }
  }
  for (const root of roots) walk(root)
  return [...new Set(files)].sort()
}

const VERTEX_PROVIDER_KEYS = new Set([
  'provider',
  'platform',
  'backend',
  'api_provider',
  'apiprovider',
  'api_type',
  'apitype',
  'source',
  'vendor',
  'client',
])

function cleanText(value) {
  const text = String(value || '').trim()
  return text || null
}

function containsVertexMetadata(value) {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(containsVertexMetadata)
  for (const [key, entry] of Object.entries(value)) {
    const lower = key.toLowerCase()
    if (lower.includes('vertex') || lower.includes('gcp')) return true
    if (VERTEX_PROVIDER_KEYS.has(lower) && typeof entry === 'string' && entry.toLowerCase().includes('vertex')) return true
    if (entry && typeof entry === 'object' && containsVertexMetadata(entry)) return true
  }
  return false
}

function isVertexEntry(row) {
  if (!row || typeof row !== 'object') return false
  if (String(row.requestId || '').includes('_vrtx_')) return true
  const message = row.message && typeof row.message === 'object' ? row.message : {}
  if (String(message.id || '').includes('_vrtx_')) return true
  const model = cleanText(message.model)
  if (model && model.startsWith('claude-') && model.includes('@')) return true
  return containsVertexMetadata({
    metadata: row.metadata,
    request: row.request,
    context: row.context,
    client: row.client,
    messageMetadata: message.metadata,
    messageRequest: message.request,
  })
}

function usageFromRow(row) {
  const usage = row?.message?.usage
  if (!usage || typeof usage !== 'object') return null
  const input = Math.max(0, Number(usage.input_tokens) || 0)
  const cacheCreate = Math.max(0, Number(usage.cache_creation_input_tokens) || 0)
  const cacheRead = Math.max(0, Number(usage.cache_read_input_tokens) || 0)
  const output = Math.max(0, Number(usage.output_tokens) || 0)
  if (!input && !cacheCreate && !cacheRead && !output) return null
  return {
    input: Math.floor(input + cacheCreate),
    cached: Math.floor(cacheRead),
    output: Math.floor(output),
    total: Math.floor(input + cacheCreate + cacheRead + output),
  }
}

function parseClaudeTokenUsageFromText(text, file = '') {
  const keyed = new Map()
  const unkeyed = []

  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.includes('"assistant"') || !line.includes('"usage"')) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row.type !== 'assistant') continue
    if (isVertexEntry(row)) continue
    const usage = usageFromRow(row)
    if (!usage) continue
    const when = tokenTimestamp(row.timestamp)
    if (!when) continue
    const message = row.message && typeof row.message === 'object' ? row.message : {}
    const normalized = {
      ...usage,
      file,
      when,
      day: localDayKey(when),
      model: cleanText(message.model) || 'unknown',
      isSidechain: Boolean(row.isSidechain),
      pathRole: String(file).includes('/subagents/') ? 'subagent' : 'parent',
    }
    const messageId = cleanText(message.id)
    const requestId = cleanText(row.requestId)
    normalized.messageId = messageId
    normalized.requestId = requestId
    if (messageId && requestId) keyed.set(`${messageId}:${requestId}`, normalized)
    else unkeyed.push(normalized)
  }

  return [...keyed.values(), ...unkeyed]
}

function claudeRowKey(row) {
  return row?.messageId && row?.requestId ? `${row.messageId}:${row.requestId}` : null
}

function claudeRowWins(current, candidate) {
  if (!current) return true
  if (current.isSidechain !== candidate.isSidechain) return candidate.isSidechain
  if (current.pathRole !== candidate.pathRole) return candidate.pathRole === 'subagent'
  return String(candidate.file || '') < String(current.file || '')
}

function sumRows(rows) {
  return rows.reduce(
    (sum, row) => {
      sum.input += row.input
      sum.cached += row.cached
      sum.output += row.output
      sum.total += row.total
      return sum
    },
    { input: 0, cached: 0, output: 0, total: 0 },
  )
}

function scanClaudeTokenUsage(files = claudeLogFiles(), now = Date.now()) {
  const sinceMs = now - TOKEN_HISTORY_DAYS * DAY_MS
  const todayKey = localDayKey(now)
  const keyed = new Map()
  const unkeyed = []
  const models = new Map()
  let lastActive = 0

  for (const file of files) {
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const row of parseClaudeTokenUsageFromText(text, file)) {
      if (row.when < sinceMs) continue
      const key = claudeRowKey(row)
      if (key) {
        const current = keyed.get(key)
        if (claudeRowWins(current, row)) keyed.set(key, row)
      } else {
        unkeyed.push(row)
      }
    }
  }

  const rows = [...keyed.keys()].sort().map((key) => keyed.get(key)).filter(Boolean).concat(unkeyed)
  if (!rows.length) return null
  for (const row of rows) {
    if (row.when > lastActive) lastActive = row.when
    models.set(row.model, (models.get(row.model) || 0) + row.total)
  }
  const today = rows.filter((row) => row.day === todayKey)
  const chosen = today.length ? sumRows(today) : sumRows(rows)
  const last30 = sumRows(rows)
  return {
    input: chosen.input,
    cached: chosen.cached,
    output: chosen.output,
    total: chosen.total,
    requests: today.length || rows.length,
    period: today.length ? 'today' : '30d',
    last30DaysTotal: last30.total,
    modelNames: [...models.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    source: 'local Claude logs',
    lastActive,
  }
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

module.exports = {
  read,
  _private: {
    claudeLogFiles,
    claudeProjectsRoots,
    isVertexEntry,
    parseClaudeTokenUsageFromText,
    scanClaudeTokenUsage,
  },
}
