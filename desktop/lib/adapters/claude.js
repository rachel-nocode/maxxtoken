const fs = require('fs')
const os = require('os')
const path = require('path')

const { readClaudeCredentialCandidates, persistClaudeCredentials } = require('../auth')
const { loadDesktopCredential } = require('../claude-desktop-auth')
const { PersistentEventCache, cacheIdentity } = require('../event-cache')
const { fetchWithTimeout } = require('../http')

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const PROFILE_URL = 'https://api.anthropic.com/api/oauth/profile'
const REFRESH_URL = 'https://platform.claude.com/v1/oauth/token'
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const SCOPES =
  'user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload'
const REFRESH_BUFFER_MS = 5 * 60 * 1000
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000
const DEFAULT_TOKEN_HISTORY_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 30000

const liveStateByAccount = new Map()

function accountLiveState(account) {
  const key = account?.identityStamp || account?.id || 'unscoped'
  if (!liveStateByAccount.has(key)) liveStateByAccount.set(key, { cachedUsage: null, cachedUsageAt: 0, rateLimitedUntil: 0, tokenFingerprint: null, profile: null })
  return liveStateByAccount.get(key)
}

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
  }, REQUEST_TIMEOUT_MS)
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
  }, REQUEST_TIMEOUT_MS)
}

async function fetchProfile(token) {
  return fetchWithTimeout(PROFILE_URL, {
    headers: {
      Authorization: 'Bearer ' + token.trim(),
      Accept: 'application/json',
      'anthropic-beta': 'oauth-2025-04-20',
    },
  }, REQUEST_TIMEOUT_MS)
}

function profileIdentity(profile) {
  const accountId = cleanText(profile?.account?.uuid)?.toLowerCase()
  const organizationId = cleanText(profile?.organization?.uuid)?.toLowerCase()
  if (!accountId) return null
  return organizationId ? `${accountId}|${organizationId}` : accountId
}

function livePlanLabel(profile, oauth) {
  const organization = profile?.organization || {}
  const tier = cleanText(organization.rate_limit_tier)
  const type = cleanText(organization.organization_type)
  const multiplier = tier?.match(/(\d+)x/i)?.[1]
  const base = type ? type.charAt(0).toUpperCase() + type.slice(1) : planLabel(oauth)
  return multiplier && !String(base).includes(`${multiplier}x`) ? `${base} ${multiplier}x` : base
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

function firstUsageWindow(data, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(data || {}, key)) {
      return { key, window: data[key], present: true }
    }
  }
  return { key: null, window: null, present: false }
}

function usageWindowFromDef(data, def) {
  const found = firstUsageWindow(data, def.keys)
  const w = found.window
  if (w && typeof w.utilization === 'number') {
    return {
      label: def.label,
      kind: def.kind,
      usedPct: Math.round(w.utilization),
      resetAt: toMs(w.resets_at),
      periodMs: def.periodMs,
    }
  }
  if (def.keepWhenPresent && found.present) {
    return {
      label: def.label,
      kind: def.kind,
      usedPct: 0,
      resetAt: null,
      periodMs: def.periodMs,
    }
  }
  return null
}

// Mid-2026 API shape: a `limits` array replaces the flat five_hour/seven_day
// buckets (kind: session | weekly_all | weekly_scoped, scoped per-model).
function windowsFromLimits(limits) {
  const windows = []
  for (const l of limits) {
    if (!l || typeof l.percent !== 'number') continue
    if (l.kind === 'session' || l.group === 'session') {
      windows.push({
        label: 'Session',
        kind: '5h',
        usedPct: Math.round(l.percent),
        resetAt: toMs(l.resets_at),
        periodMs: 5 * 3600e3,
      })
      continue
    }
    const scopeName = cleanText(l.scope?.model?.display_name) || cleanText(l.scope?.surface?.display_name)
    windows.push({
      label: l.kind === 'weekly_all' || !scopeName ? 'Weekly' : scopeName,
      kind: '7d',
      usedPct: Math.round(l.percent),
      resetAt: toMs(l.resets_at),
      periodMs: 7 * 86400e3,
    })
  }
  return windows
}

function windowsFromUsage(data) {
  if (Array.isArray(data?.limits) && data.limits.length) {
    const windows = windowsFromLimits(data.limits)
    if (windows.length) return windows
  }
  const defs = [
    { keys: ['five_hour'], label: 'Session', kind: '5h', periodMs: 5 * 3600e3 },
    { keys: ['seven_day'], label: 'Weekly', kind: '7d', periodMs: 7 * 86400e3 },
    { keys: ['seven_day_oauth_apps'], label: 'OAuth Apps', kind: '7d', periodMs: 7 * 86400e3 },
    { keys: ['seven_day_sonnet'], label: 'Sonnet', kind: '7d', periodMs: 7 * 86400e3, keepWhenPresent: true },
    { keys: ['seven_day_opus'], label: 'Opus', kind: '7d', periodMs: 7 * 86400e3, keepWhenPresent: true },
    {
      keys: [
        'seven_day_design',
        'seven_day_claude_design',
        'claude_design',
        'design',
        'seven_day_omelette',
        'omelette',
        'omelette_promotional',
      ],
      label: 'Claude Design',
      kind: '7d',
      periodMs: 7 * 86400e3,
      keepWhenPresent: true,
    },
    {
      keys: [
        'seven_day_routines',
        'seven_day_claude_routines',
        'claude_routines',
        'routines',
        'routine',
        'seven_day_cowork',
        'cowork',
      ],
      label: 'Daily Routines',
      kind: '7d',
      periodMs: 7 * 86400e3,
      keepWhenPresent: true,
    },
  ]
  const windows = []
  for (const d of defs) {
    const window = usageWindowFromDef(data, d)
    if (window) windows.push(window)
  }
  return windows
}

function resultFromUsage(plan, data, cached = false, options = {}) {
  const windows = windowsFromUsage(data)
  const extra = []
  let extraUsage = null
  if (data.extra_usage && data.extra_usage.is_enabled) {
    // credits are reported in cents
    const used = (Number(data.extra_usage.used_credits) || 0) / 100
    const limit = (Number(data.extra_usage.monthly_limit) || 0) / 100
    const utilization = Number(data.extra_usage.utilization)
    extraUsage = {
      usedUSD: used,
      limitUSD: limit,
      utilization: Number.isFinite(utilization) ? utilization : limit > 0 ? (used / limit) * 100 : 0,
    }
    extra.push({ label: 'Extra usage', value: `$${used.toFixed(2)} / $${limit.toFixed(0)}` })
  }
  if (cached) extra.push({ label: 'Status', value: 'cached live usage' })
  // Heavy: the token-history disk scan only runs on heavy (hourly) pulls. Light
  // pulls return null and the aggregator carries forward the last scanned data.
  const tokenUsage = options.skipTokenHistory ? null : scanClaudeTokenUsage(null, Date.now(), options.tokenHistoryDays, options)
  if (tokenUsage?.historyTotal) {
    extra.push({ label: tokenHistoryLabel(tokenUsage.historyDays), value: formatInteger(tokenUsage.historyTotal) })
  }
  return { connected: true, plan, windows, extra, extraUsage, tokenUsage, lastActive: cached ? options.cachedUsageAt : Date.now() }
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

function coworkProjectsRoots(home = os.homedir(), account = null) {
  const base = path.join(home, 'Library', 'Application Support', 'Claude', 'local-agent-mode-sessions')
  const roots = []
  function dirs(folder) {
    try {
      return fs.readdirSync(folder, { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => path.join(folder, item.name))
    } catch {
      return []
    }
  }
  for (const accountDir of dirs(base)) {
    if (account?.accountId && path.basename(accountDir).toLowerCase() !== account.accountId.toLowerCase()) continue
    for (const orgDir of dirs(accountDir)) {
      if (account?.organizationId && path.basename(orgDir).toLowerCase() !== account.organizationId.toLowerCase()) continue
      const holders = dirs(orgDir)
      for (const holder of holders) {
        const candidates = path.basename(holder) === 'agent' ? dirs(holder) : [holder]
        for (const candidate of candidates) roots.push(path.join(candidate, '.claude', 'projects'))
      }
    }
  }
  return roots
}

function piSessionRoot(env = process.env, home = os.homedir()) {
  return path.resolve(String(env.PI_CODING_AGENT_SESSION_DIR || path.join(home, '.pi', 'agent', 'sessions')))
}

function piLogFiles(root = piSessionRoot(), sinceMs = Date.now() - DEFAULT_TOKEN_HISTORY_DAYS * DAY_MS) {
  return claudeLogFiles([root], sinceMs)
}

function parsePiClaudeUsageFromText(text, file = '') {
  const rows = []
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.includes('"usage"')) continue
    let row
    try { row = JSON.parse(line) } catch { continue }
    const message = row?.message
    const usage = message?.usage
    if (row?.type !== 'message' || message?.role !== 'assistant' || !usage) continue
    if (!['anthropic', 'claude-agent-sdk'].includes(String(message.provider || '').toLowerCase())) continue
    const when = tokenTimestamp(row.timestamp)
    if (!when) continue
    const cacheCreate = Math.max(0, Number(usage.cacheWrite) || 0)
    const cached = Math.max(0, Number(usage.cacheRead) || 0)
    const input = Math.max(0, Number(usage.input) || 0) + cacheCreate
    const output = Math.max(0, Number(usage.output) || 0)
    const total = Math.max(0, Number(usage.totalTokens) || input + cached + output)
    if (!total) continue
    rows.push({
      file,
      when,
      day: localDayKey(when),
      model: cleanText(message.model) || 'unknown',
      input,
      uncachedInput: Math.max(0, Number(usage.input) || 0),
      cacheCreation: cacheCreate,
      cacheRead: cached,
      cached,
      output,
      total,
      messageId: cleanText(row.id),
      requestId: 'pi',
      recordedCostUSD: Number(usage?.cost?.total) > 0 ? Number(usage.cost.total) : null,
      pathRole: 'pi',
      isSidechain: false,
    })
  }
  return rows
}

function tokenHistoryDays(value) {
  const days = Math.round(Number(value) || DEFAULT_TOKEN_HISTORY_DAYS)
  return Math.max(1, Math.min(365, days))
}

function tokenHistoryLabel(days) {
  return days === 1 ? 'today tokens' : `${days}d tokens`
}

function claudeLogFiles(roots = claudeProjectsRoots(), sinceMs = Date.now() - DEFAULT_TOKEN_HISTORY_DAYS * DAY_MS) {
  const files = []
  const visited = new Set()
  function walk(dir) {
    let canonical
    try { canonical = fs.realpathSync(dir) } catch { return }
    if (visited.has(canonical)) return
    visited.add(canonical)
    let entries
    try {
      entries = fs.readdirSync(canonical, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(canonical, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (entry.isSymbolicLink()) {
        let followed
        try { followed = fs.statSync(full) } catch { continue }
        if (followed.isDirectory()) {
          walk(full)
          continue
        }
        if (!followed.isFile()) continue
      } else if (!entry.isFile()) continue
      if (!entry.name.endsWith('.jsonl')) continue
      try {
        const resolved = fs.realpathSync(full)
        const stat = fs.statSync(resolved)
        if (!sinceMs || stat.mtimeMs >= sinceMs) files.push(resolved)
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

function usageFromUsage(usage) {
  if (!usage || typeof usage !== 'object') return null
  const input = Math.max(0, Number(usage.input_tokens) || 0)
  const cacheCreate = Math.max(0, Number(usage.cache_creation_input_tokens) || 0)
  const cacheRead = Math.max(0, Number(usage.cache_read_input_tokens) || 0)
  const output = Math.max(0, Number(usage.output_tokens) || 0)
  if (!input && !cacheCreate && !cacheRead && !output) return null
  return {
    input: Math.floor(input + cacheCreate),
    uncachedInput: Math.floor(input),
    cacheCreation: Math.floor(cacheCreate),
    cacheRead: Math.floor(cacheRead),
    cached: Math.floor(cacheRead),
    output: Math.floor(output),
    total: Math.floor(input + cacheCreate + cacheRead + output),
    speed: typeof usage.speed === 'string' ? usage.speed : null,
    isFast: usage.speed === 'fast',
  }
}

function usageFromRow(row) {
  return usageFromUsage(row?.message?.usage)
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
      sessionId: cleanText(row.sessionId),
      isSidechain: Boolean(row.isSidechain),
      pathRole: String(file).includes('/subagents/') ? 'subagent' : 'parent',
    }
    const messageId = cleanText(message.id)
    const requestId = cleanText(row.requestId)
    normalized.messageId = messageId
    normalized.requestId = requestId
    const recordedCost = Number(row.costUSD)
    if (row.costUSD != null && Number.isFinite(recordedCost) && recordedCost >= 0) normalized.recordedCostUSD = recordedCost
    if (messageId && requestId) keyed.set(`${messageId}:${requestId}`, normalized)
    else unkeyed.push(normalized)

    const iterations = Array.isArray(message.usage?.iterations) ? message.usage.iterations : []
    let advisorIndex = 0
    for (const iteration of iterations) {
      if (iteration?.type !== 'advisor_message') continue
      const advisorModel = cleanText(iteration.model)
      const advisorUsage = usageFromUsage(iteration)
      if (!advisorModel || !advisorUsage) continue
      const advisor = {
        ...advisorUsage,
        file,
        when,
        day: localDayKey(when),
        model: advisorModel,
        sessionId: cleanText(row.sessionId),
        isSidechain: Boolean(row.isSidechain),
        pathRole: normalized.pathRole,
        messageId: messageId ? `${messageId}:advisor:${advisorIndex}` : null,
        requestId,
      }
      advisorIndex++
      if (advisor.messageId && requestId) keyed.set(`${advisor.messageId}:${requestId}`, advisor)
      else unkeyed.push(advisor)
    }
  }

  return [...keyed.values(), ...unkeyed]
}

function claudeSessionIdentityFromText(text) {
  let organizationId = null
  let accountId = null
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.includes('"ownerOrganizationUuid"')) continue
    let row
    try { row = JSON.parse(line) } catch { continue }
    const org = cleanText(row.ownerOrganizationUuid)?.toLowerCase()
    const account = cleanText(row.ownerAccountUuid)?.toLowerCase()
    if (!org) continue
    if ((organizationId && organizationId !== org) || (accountId && account && accountId !== account)) return { conflicted: true }
    organizationId = org
    if (account) accountId = account
  }
  return organizationId ? { organizationId, accountId, conflicted: false } : null
}

function owningClaudeSessionFile(file) {
  const parts = path.resolve(file).split(path.sep)
  const subagents = parts.lastIndexOf('subagents')
  if (subagents < 1) return file
  const sessionDirectory = parts.slice(0, subagents).join(path.sep) || path.sep
  return `${sessionDirectory}.jsonl`
}

function claudeFileOwnedByAccount(file, text, account, options = {}) {
  if (!account?.organizationId) return account?.allowsUnattributedHistory !== false
  const coworkBase = path.join(options.home || os.homedir(), 'Library', 'Application Support', 'Claude', 'local-agent-mode-sessions') + path.sep
  const canonical = path.resolve(file)
  if (canonical.startsWith(coworkBase)) {
    const relative = canonical.slice(coworkBase.length).split(path.sep)
    return relative[0]?.toLowerCase() === String(account.accountId || '').toLowerCase()
      && relative[1]?.toLowerCase() === String(account.organizationId).toLowerCase()
  }
  const ownerFile = owningClaudeSessionFile(file)
  let ownerText = text
  if (ownerFile !== file) {
    try { ownerText = fs.readFileSync(ownerFile, 'utf8') } catch { return false }
  }
  const identity = claudeSessionIdentityFromText(ownerText)
  if (!identity) return account.allowsUnattributedHistory === true
  if (identity.conflicted) return false
  return identity.organizationId === String(account.organizationId).toLowerCase()
    && (!identity.accountId || identity.accountId === String(account.accountId || '').toLowerCase())
}

function claudeRowKey(row) {
  return row?.messageId && row?.requestId ? `${row.messageId}:${row.requestId}` : null
}

function claudeRowWins(current, candidate) {
  if (!current) return true
  if (current.isSidechain !== candidate.isSidechain) return !candidate.isSidechain
  if (current.total !== candidate.total) return candidate.total > current.total
  if (Boolean(current.speed) !== Boolean(candidate.speed)) return Boolean(candidate.speed)
  if (current.pathRole !== candidate.pathRole) return candidate.pathRole === 'parent'
  return String(candidate.file || '') < String(current.file || '')
}

function sumRows(rows) {
  return rows.reduce(
    (sum, row) => {
      sum.input += row.input
      sum.uncachedInput += row.uncachedInput || 0
      sum.cacheCreation += row.cacheCreation || 0
      sum.cacheRead += row.cacheRead || 0
      sum.cached += row.cached
      sum.output += row.output
      sum.total += row.total
      return sum
    },
    { input: 0, uncachedInput: 0, cacheCreation: 0, cacheRead: 0, cached: 0, output: 0, total: 0 },
  )
}

function emptyTokenBucket(extra = {}) {
  return {
    ...extra,
    input: 0,
    uncachedInput: 0,
    cacheCreation: 0,
    cacheRead: 0,
    cached: 0,
    output: 0,
    total: 0,
    requests: 0,
  }
}

function addRowToBucket(bucket, row) {
  bucket.input += row.input
  bucket.uncachedInput += row.uncachedInput || 0
  bucket.cacheCreation += row.cacheCreation || 0
  bucket.cacheRead += row.cacheRead || 0
  bucket.cached += row.cached
  bucket.output += row.output
  bucket.total += row.total
  bucket.requests += 1
  if (row.recordedCostUSD != null && Number.isFinite(Number(row.recordedCostUSD))) {
    bucket.recordedCostUSD = (bucket.recordedCostUSD ?? 0) + Number(row.recordedCostUSD)
    bucket.recordedInput = (bucket.recordedInput ?? 0) + row.input
    bucket.recordedUncachedInput = (bucket.recordedUncachedInput ?? 0) + (row.uncachedInput || 0)
    bucket.recordedCacheCreation = (bucket.recordedCacheCreation ?? 0) + (row.cacheCreation || 0)
    bucket.recordedCacheRead = (bucket.recordedCacheRead ?? 0) + (row.cacheRead || row.cached || 0)
    bucket.recordedCached = (bucket.recordedCached ?? 0) + row.cached
    bucket.recordedOutput = (bucket.recordedOutput ?? 0) + row.output
    bucket.recordedTotal = (bucket.recordedTotal ?? 0) + row.total
  }
  return bucket
}

function sortedModelBreakdowns(models) {
  return [...models.values()].sort((a, b) => b.total - a.total || a.model.localeCompare(b.model))
}

function scanClaudeTokenUsage(files = null, now = Date.now(), historyDaysValue = DEFAULT_TOKEN_HISTORY_DAYS, options = {}) {
  const historyDays = tokenHistoryDays(historyDaysValue)
  const sinceMs = now - historyDays * DAY_MS
  const account = options.account || null
  let roots
  if (account?.authHome) roots = [path.join(account.authHome, 'projects')]
  else roots = claudeProjectsRoots(options.env || process.env, options.home || os.homedir())
  roots.push(...coworkProjectsRoots(options.home || os.homedir(), account))
  const scanFiles = files || claudeLogFiles(roots, sinceMs)
  const todayKey = localDayKey(now)
  const keyed = new Map()
  const unkeyed = []
  const models = new Map()
  const days = new Map()
  let lastActive = 0
  const cacheOptions = {
    schemaVersion: 2,
    root: options.eventCacheRoot,
    ttlMs: options.eventCacheTTL,
    identity: cacheIdentity('claude', account, historyDays),
  }
  const eventCache = options.disableEventCache ? null : new PersistentEventCache({ namespace: 'claude', ...cacheOptions })

  for (const file of scanFiles) {
    let parsed
    try {
      const ownerFile = owningClaudeSessionFile(file)
      let contextKey = ''
      if (ownerFile !== file) {
        try {
          const ownerStat = fs.statSync(ownerFile)
          contextKey = `${ownerFile}:${ownerStat.dev}:${ownerStat.ino}:${ownerStat.size}:${ownerStat.mtimeMs}`
        } catch {
          contextKey = `${ownerFile}:missing`
        }
      }
      parsed = eventCache
        ? eventCache.get(file, (text, sourceFile) => claudeFileOwnedByAccount(sourceFile, text, account, options)
          ? parseClaudeTokenUsageFromText(text, sourceFile)
          : [], { contextKey })
        : (() => {
            const text = fs.readFileSync(file, 'utf8')
            return claudeFileOwnedByAccount(file, text, account, options) ? parseClaudeTokenUsageFromText(text, file) : []
          })()
    } catch {
      continue
    }
    for (const cachedRow of parsed) {
      const row = { ...cachedRow, file }
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
  eventCache?.finish(scanFiles)

  if (!files && (!account || account.allowsUnattributedHistory)) {
    const piFiles = piLogFiles(piSessionRoot(options.env || process.env, options.home || os.homedir()), sinceMs)
    const piCache = options.disableEventCache ? null : new PersistentEventCache({
      namespace: 'claude-pi',
      ...cacheOptions,
      identity: cacheIdentity('claude-pi', account, historyDays),
    })
    for (const file of piFiles) {
      let parsed
      try {
        parsed = piCache
          ? piCache.get(file, parsePiClaudeUsageFromText)
          : parsePiClaudeUsageFromText(fs.readFileSync(file, 'utf8'), file)
      } catch { continue }
      for (const cachedRow of parsed) {
        const row = { ...cachedRow, file }
        const key = claudeRowKey(row)
        if (key) {
          const current = keyed.get(key)
          if (claudeRowWins(current, row)) keyed.set(key, row)
        } else unkeyed.push(row)
      }
    }
    piCache?.finish(piFiles)
  }

  const candidates = [...keyed.keys()].sort().map((key) => keyed.get(key)).filter(Boolean).concat(unkeyed)
  const byMessage = new Map()
  const withoutMessage = []
  for (const row of candidates) {
    if (!row.messageId) {
      withoutMessage.push(row)
      continue
    }
    const current = byMessage.get(row.messageId)
    if (claudeRowWins(current, row)) byMessage.set(row.messageId, row)
  }
  const rows = [...byMessage.values(), ...withoutMessage]
  if (!rows.length) return null
  for (const row of rows) {
    if (row.when > lastActive) lastActive = row.when
    const model = models.get(row.model) || emptyTokenBucket({ model: row.model })
    addRowToBucket(model, row)
    models.set(row.model, model)
    const day = days.get(row.day) || emptyTokenBucket({ date: row.day, models: new Map() })
    addRowToBucket(day, row)
    const dayModel = day.models.get(row.model) || emptyTokenBucket({ model: row.model })
    addRowToBucket(dayModel, row)
    day.models.set(row.model, dayModel)
    days.set(row.day, day)
  }
  const today = rows.filter((row) => row.day === todayKey)
  const todayTotals = sumRows(today)
  const history = sumRows(rows)
  return {
    input: history.input,
    uncachedInput: history.uncachedInput,
    cacheCreation: history.cacheCreation,
    cacheRead: history.cacheRead,
    cached: history.cached,
    output: history.output,
    total: history.total,
    requests: rows.length,
    period: tokenHistoryLabel(historyDays).replace(' tokens', ''),
    historyDays,
    historyTotal: history.total,
    todayTotal: todayTotals.total,
    last30DaysTotal: historyDays === 30 ? history.total : null,
    dailyBreakdown: [...days.values()]
      .map((day) => {
        const { models, ...rest } = day
        return { ...rest, modelBreakdowns: sortedModelBreakdowns(models) }
      })
      .sort((a, b) => b.date.localeCompare(a.date)),
    modelBreakdowns: sortedModelBreakdowns(models),
    modelNames: sortedModelBreakdowns(models).map((model) => model.model),
    accountingEvents: rows.map((row) => ({
      when: row.when,
      day: row.day,
      model: row.model,
      input: row.input,
      uncachedInput: row.uncachedInput,
      cacheCreation: row.cacheCreation,
      cacheRead: row.cacheRead,
      cached: row.cached,
      output: row.output,
      total: row.total,
      ...(row.speed ? { speed: row.speed, isFast: row.isFast } : {}),
      ...(row.recordedCostUSD != null ? { recordedCostUSD: row.recordedCostUSD } : {}),
    })),
    source: 'local Claude logs',
    lastActive,
  }
}

async function read(options = {}) {
  const account = options.account || null
  const state = accountLiveState(account)
  const credentials = readClaudeCredentialCandidates({
    authHome: account?.authHome,
    isDefault: account?.isDefault,
    env: options.env,
  })
  if (account?.sourceKinds?.includes('claudeDesktop')) {
    const desktop = loadDesktopCredential({ accountId: account.accountId, organizationId: account.organizationId, home: options.home })
    if (desktop) credentials.unshift(desktop)
  }
  const localTokenUsage = options.skipTokenHistory ? null : scanClaudeTokenUsage(null, Date.now(), options.tokenHistoryDays, options)
  if (!credentials.length) {
    return localTokenUsage
      ? { connected: true, plan: null, windows: [], extra: [{ label: 'Status', value: 'local spend only' }], tokenUsage: localTokenUsage, lastActive: localTokenUsage.lastActive }
      : { connected: false }
  }

  let lastError = null
  for (const creds of credentials) {
    const oauth = creds.data.claudeAiOauth
    let plan = planLabel(oauth)

    try {
    let token = oauth.accessToken
    if (!token) throw 'Not logged in. Run `claude` to authenticate.'
    if (oauth.expiresAt && oauth.expiresAt - Date.now() < REFRESH_BUFFER_MS) {
      const t = await refresh(creds)
      if (t) token = t
    }

    const fingerprint = require('crypto').createHash('sha256').update(String(token)).digest('hex')
    if (state.tokenFingerprint && state.tokenFingerprint !== fingerprint) {
      state.cachedUsage = null
      state.cachedUsageAt = 0
      state.rateLimitedUntil = 0
      state.profile = null
    }
    state.tokenFingerprint = fingerprint

    let verifiedProfile = null
    if (account?.identityKey) {
      verifiedProfile = state.profile
      if (!verifiedProfile) {
        const profileResp = await fetchProfile(token)
        if (!profileResp.ok) throw new Error(profileResp.status === 401 || profileResp.status === 403
          ? 'Claude credential rejected for this account.'
          : `Claude account verification failed (${profileResp.status}).`)
        verifiedProfile = await profileResp.json()
      }
      const actualIdentity = profileIdentity(verifiedProfile)
      const expectedIdentity = String(account.identityKey).toLowerCase()
      const identityMatches = expectedIdentity.includes('|')
        ? actualIdentity === expectedIdentity
        : actualIdentity?.split('|')[0] === expectedIdentity
      if (!identityMatches) {
        throw new Error('Claude credential belongs to a different account.')
      }
      state.profile = verifiedProfile
      plan = livePlanLabel(verifiedProfile, oauth)
    }

    if (Date.now() < state.rateLimitedUntil && state.cachedUsage) {
      return resultFromUsage(plan, state.cachedUsage, true, { ...options, cachedUsageAt: state.cachedUsageAt })
    }

    let resp = await fetchUsage(token)
    if (resp.status === 401) {
      const t = await refresh(creds)
      if (t) resp = await fetchUsage(t)
    }
    if (resp.status === 429) {
      state.rateLimitedUntil = Date.now() + retryAfterMs(resp.headers)
      if (state.cachedUsage) return resultFromUsage(plan, state.cachedUsage, true, { ...options, cachedUsageAt: state.cachedUsageAt })
      return { connected: true, plan, windows: [], error: 'Rate limited — try again soon.' }
    }
    if (!resp.ok) {
      return { connected: true, plan, windows: [], error: `Usage API error (${resp.status}).` }
    }

    const data = await resp.json()
    state.cachedUsage = data
    state.cachedUsageAt = Date.now()
    state.rateLimitedUntil = 0
    return resultFromUsage(plan, data, false, options)
  } catch (e) {
      lastError = e
    }
  }
  if (state.cachedUsage) return resultFromUsage(null, state.cachedUsage, true, { ...options, cachedUsageAt: state.cachedUsageAt })
  if (localTokenUsage) return { connected: true, plan: null, windows: [], tokenUsage: localTokenUsage, lastActive: localTokenUsage.lastActive, error: lastError?.message || 'Live usage unavailable.' }
  return { connected: true, plan: null, windows: [], error: lastError?.message || 'Usage fetch failed.' }
}

module.exports = {
  read,
  _private: {
    claudeLogFiles,
    claudeProjectsRoots,
    coworkProjectsRoots,
    parsePiClaudeUsageFromText,
    profileIdentity,
    livePlanLabel,
    isVertexEntry,
    parseClaudeTokenUsageFromText,
    claudeSessionIdentityFromText,
    claudeFileOwnedByAccount,
    scanClaudeTokenUsage,
    tokenHistoryDays,
    tokenHistoryLabel,
    windowsFromLimits,
    windowsFromUsage,
  },
}
