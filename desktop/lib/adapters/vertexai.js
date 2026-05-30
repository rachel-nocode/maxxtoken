const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const MONITORING_BASE = 'https://monitoring.googleapis.com/v3/projects'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USAGE_WINDOW_SECONDS = 24 * 60 * 60
const REFRESH_BUFFER_MS = 5 * 60 * 1000
const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects')

function clean(value) {
  const text = String(value || '').trim()
  return text || null
}

function number(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function clampPct(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function timestamp(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function localDayKey(ms) {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function gcloudConfigDir(env = process.env) {
  return clean(env.CLOUDSDK_CONFIG) || path.join(os.homedir(), '.config', 'gcloud')
}

function credentialsFilePath(env = process.env) {
  return clean(env.GOOGLE_APPLICATION_CREDENTIALS) || path.join(gcloudConfigDir(env), 'application_default_credentials.json')
}

function projectFilePath(env = process.env) {
  return path.join(gcloudConfigDir(env), 'configurations', 'config_default')
}

function loadProjectID(env = process.env) {
  try {
    const text = fs.readFileSync(projectFilePath(env), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const match = line.trim().match(/^project\s*=\s*(.+)$/)
      if (match) return clean(match[1])
    }
  } catch {
    /* fall through */
  }
  return clean(env.GOOGLE_CLOUD_PROJECT) || clean(env.GCLOUD_PROJECT) || clean(env.CLOUDSDK_CORE_PROJECT)
}

function decodeJWT(token) {
  const text = clean(token)
  if (!text || text.split('.').length < 2) return {}
  try {
    const payload = text.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return {}
  }
}

function parseADC(json, env = process.env) {
  if (!json || typeof json !== 'object') return null
  const serviceEmail = clean(json.client_email)
  const privateKey = clean(json.private_key)
  if (serviceEmail && privateKey) {
    return {
      type: 'service_account',
      accessToken: null,
      refreshToken: null,
      clientID: null,
      clientSecret: null,
      projectID: clean(json.project_id) || loadProjectID(env),
      email: serviceEmail,
      expiryDate: null,
    }
  }
  const clientID = clean(json.client_id)
  const clientSecret = clean(json.client_secret)
  const refreshToken = clean(json.refresh_token)
  if (!clientID || !clientSecret || !refreshToken) return null
  const claims = decodeJWT(json.id_token)
  return {
    type: 'user',
    accessToken: clean(json.access_token),
    refreshToken,
    clientID,
    clientSecret,
    projectID: loadProjectID(env),
    email: clean(claims.email),
    expiryDate: timestamp(json.token_expiry),
  }
}

function parseSaved(raw, env = process.env) {
  const text = clean(raw)
  if (!text) return null
  if (!text.startsWith('{')) return { accessToken: text, projectID: loadProjectID(env), type: 'manual' }
  try {
    const json = JSON.parse(text)
    return (
      parseADC(json, env) || {
        type: 'manual',
        accessToken: clean(json.accessToken || json.access_token || json.token),
        refreshToken: clean(json.refreshToken || json.refresh_token),
        clientID: clean(json.clientID || json.clientId || json.client_id),
        clientSecret: clean(json.clientSecret || json.client_secret),
        projectID: clean(json.projectID || json.projectId || json.project_id) || loadProjectID(env),
        email: clean(json.email),
        expiryDate: timestamp(json.expiryDate || json.expiresAt || json.token_expiry),
      }
    )
  } catch {
    return null
  }
}

function loadADC(env = process.env) {
  const file = credentialsFilePath(env)
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'))
    return parseADC(json, env)
  } catch {
    return null
  }
}

function printGcloudAccessToken(env = process.env) {
  try {
    return clean(
      execFileSync('/usr/bin/env', ['gcloud', 'auth', 'application-default', 'print-access-token'], {
        encoding: 'utf8',
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 20000,
      }),
    )
  } catch {
    return null
  }
}

async function refreshToken(credentials) {
  if (!credentials?.refreshToken || !credentials.clientID || !credentials.clientSecret) {
    throw new Error('Vertex AI refresh token or OAuth client is missing')
  }
  const form = new URLSearchParams({
    client_id: credentials.clientID,
    client_secret: credentials.clientSecret,
    refresh_token: credentials.refreshToken,
    grant_type: 'refresh_token',
  })
  const res = await fetchWithTimeout(
    TOKEN_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    },
    15000,
  )
  const text = await res.text()
  if (res.status === 400 || res.status === 401) throw new Error('Vertex AI refresh token expired. Run gcloud auth application-default login again.')
  if (!res.ok) throw new Error(`Vertex AI token refresh failed (${res.status})`)
  const json = JSON.parse(text)
  const accessToken = clean(json.access_token)
  if (!accessToken) throw new Error('Vertex AI token refresh response did not include access_token')
  const claims = decodeJWT(json.id_token)
  return {
    ...credentials,
    accessToken,
    email: clean(claims.email) || credentials.email,
    expiryDate: Date.now() + (number(json.expires_in) || 3600) * 1000,
  }
}

async function resolveCredentials(env = process.env) {
  const saved =
    parseSaved(getKey('vertexai'), env) ||
    parseSaved(env.VERTEXAI_CREDENTIALS_JSON || env.VERTEX_AI_CREDENTIALS_JSON, env) ||
    parseSaved(env.VERTEXAI_ACCESS_TOKEN || env.VERTEX_AI_ACCESS_TOKEN, env)
  const credentials = saved || loadADC(env)
  if (!credentials) return null
  credentials.projectID = credentials.projectID || loadProjectID(env)
  if (credentials.type === 'service_account' && !credentials.accessToken) {
    credentials.accessToken = printGcloudAccessToken(env)
    credentials.expiryDate = Date.now() + 50 * 60 * 1000
  }
  if (credentials.accessToken && credentials.expiryDate && credentials.expiryDate - Date.now() < REFRESH_BUFFER_MS) {
    return refreshToken(credentials)
  }
  return credentials
}

function pointValue(point) {
  return number(point?.value?.doubleValue) ?? number(point?.value?.int64Value)
}

function quotaKey(series) {
  const metricLabels = series?.metric?.labels || {}
  const resourceLabels = series?.resource?.labels || {}
  const quotaMetric = clean(metricLabels.quota_metric) || clean(resourceLabels.quota_id)
  if (!quotaMetric) return null
  return [quotaMetric, clean(metricLabels.limit_name) || '', clean(resourceLabels.location) || 'global'].join('|')
}

function aggregateSeries(series = []) {
  const out = new Map()
  for (const entry of series) {
    const key = quotaKey(entry)
    if (!key) continue
    const values = Array.isArray(entry.points) ? entry.points.map(pointValue).filter((v) => v != null) : []
    if (!values.length) continue
    out.set(key, Math.max(out.get(key) || 0, ...values))
  }
  return out
}

function parseQuotaUsage(usageResponse, limitResponse) {
  const usage = aggregateSeries(usageResponse?.timeSeries || usageResponse || [])
  const limits = aggregateSeries(limitResponse?.timeSeries || limitResponse || [])
  let maxPercent = null
  let matched = 0
  let topKey = null
  for (const [key, limit] of limits) {
    const used = usage.get(key)
    if (!(limit > 0) || used == null) continue
    matched++
    const pct = (used / limit) * 100
    if (maxPercent == null || pct > maxPercent) {
      maxPercent = pct
      topKey = key
    }
  }
  if (maxPercent == null) return null
  return {
    requestsUsedPercent: clampPct(maxPercent),
    matchedSeries: matched,
    usageSeries: usage.size,
    limitSeries: limits.size,
    topKey,
  }
}

async function fetchTimeSeries(accessToken, projectID, filter, pageToken = null) {
  const now = new Date()
  const start = new Date(now.getTime() - USAGE_WINDOW_SECONDS * 1000)
  const url = new URL(`${MONITORING_BASE}/${encodeURIComponent(projectID)}/timeSeries`)
  url.searchParams.set('filter', filter)
  url.searchParams.set('interval.startTime', start.toISOString())
  url.searchParams.set('interval.endTime', now.toISOString())
  url.searchParams.set('aggregation.alignmentPeriod', '3600s')
  url.searchParams.set('aggregation.perSeriesAligner', 'ALIGN_MAX')
  url.searchParams.set('view', 'FULL')
  if (pageToken) url.searchParams.set('pageToken', pageToken)
  const res = await fetchWithTimeout(
    url.toString(),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    },
    30000,
  )
  const text = await res.text()
  if (res.status === 401) throw new Error('Vertex AI request unauthorized. Run gcloud auth application-default login.')
  if (res.status === 403) throw new Error('Vertex AI monitoring access forbidden. Check Cloud Monitoring IAM permissions.')
  if (!res.ok) throw new Error(`Vertex AI monitoring HTTP ${res.status}: ${text.slice(0, 200)}`)
  return text.trim() ? JSON.parse(text) : {}
}

async function fetchAllTimeSeries(accessToken, projectID, filter) {
  let pageToken = null
  const timeSeries = []
  do {
    const json = await fetchTimeSeries(accessToken, projectID, filter, pageToken)
    if (Array.isArray(json.timeSeries)) timeSeries.push(...json.timeSeries)
    pageToken = clean(json.nextPageToken)
  } while (pageToken)
  return { timeSeries }
}

async function fetchQuota(accessToken, projectID) {
  if (!projectID) throw new Error('No Google Cloud project configured. Run gcloud config set project PROJECT_ID.')
  const usageFilter =
    'metric.type="serviceruntime.googleapis.com/quota/allocation/usage" AND resource.type="consumer_quota" AND resource.label.service="aiplatform.googleapis.com"'
  const limitFilter =
    'metric.type="serviceruntime.googleapis.com/quota/limit" AND resource.type="consumer_quota" AND resource.label.service="aiplatform.googleapis.com"'
  const [usage, limits] = await Promise.all([
    fetchAllTimeSeries(accessToken, projectID, usageFilter),
    fetchAllTimeSeries(accessToken, projectID, limitFilter),
  ])
  return parseQuotaUsage(usage, limits)
}

function claudeLogFiles(root = CLAUDE_PROJECTS, limit = 500) {
  const found = []
  function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.jsonl')) {
        try {
          found.push({ file: full, mtime: fs.statSync(full).mtimeMs })
        } catch {
          /* skip */
        }
      }
    }
  }
  walk(root)
  return found
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map((entry) => entry.file)
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

function modelLooksVertex(model) {
  const text = clean(model)
  return !!(text && text.startsWith('claude-') && text.includes('@'))
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
  if (modelLooksVertex(message.model)) return true
  return containsVertexMetadata({
    metadata: row.metadata,
    request: row.request,
    context: row.context,
    client: row.client,
    messageMetadata: message.metadata,
    messageRequest: message.request,
  })
}

function usageFromEntry(row) {
  const usage = row?.message?.usage
  if (!usage || typeof usage !== 'object') return null
  const cacheCreation = number(usage.cache_creation_input_tokens) || 0
  const uncachedInput = number(usage.input_tokens) || 0
  const input = uncachedInput + cacheCreation
  const cacheRead = number(usage.cache_read_input_tokens) || 0
  const cached = cacheRead
  const output = number(usage.output_tokens) || 0
  if (!input && !cached && !output) return null
  return { input, uncachedInput, cacheCreation, cacheRead, cached, output, total: input + cached + output }
}

function tokenHistoryDays(value) {
  const days = Math.round(Number(value) || 30)
  return Math.max(1, Math.min(365, days))
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

function addUsageToBucket(bucket, usage) {
  bucket.input += usage.input
  bucket.uncachedInput += usage.uncachedInput
  bucket.cacheCreation += usage.cacheCreation
  bucket.cacheRead += usage.cacheRead
  bucket.cached += usage.cached
  bucket.output += usage.output
  bucket.total += usage.total
  bucket.requests += 1
  return bucket
}

function sortedModelBreakdowns(models) {
  return [...models.values()].sort((a, b) => b.total - a.total || a.model.localeCompare(b.model))
}

function scanClaudeVertexUsage(files = claudeLogFiles(), sinceMs = Date.now() - 30 * 86400000, historyDaysValue = 30) {
  const historyDays = tokenHistoryDays(historyDaysValue)
  const totals = { input: 0, uncachedInput: 0, cacheCreation: 0, cacheRead: 0, cached: 0, output: 0, total: 0, requests: 0 }
  const models = new Map()
  const days = new Map()
  let lastActive = 0
  for (const file of files) {
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue
      let row
      try {
        row = JSON.parse(line)
      } catch {
        continue
      }
      if (!isVertexEntry(row)) continue
      const when = timestamp(row.timestamp) || 0
      if (sinceMs && when && when < sinceMs) continue
      const usage = usageFromEntry(row)
      if (!usage) continue
      totals.input += usage.input
      totals.uncachedInput += usage.uncachedInput
      totals.cacheCreation += usage.cacheCreation
      totals.cacheRead += usage.cacheRead
      totals.cached += usage.cached
      totals.output += usage.output
      totals.total += usage.total
      totals.requests += 1
      if (when > lastActive) lastActive = when
      const modelName = clean(row.message?.model) || 'unknown'
      const model = models.get(modelName) || emptyTokenBucket({ model: modelName })
      addUsageToBucket(model, usage)
      models.set(modelName, model)
      const dayKey = localDayKey(when || Date.now())
      const day = days.get(dayKey) || emptyTokenBucket({ date: dayKey, models: new Map() })
      addUsageToBucket(day, usage)
      const dayModel = day.models.get(modelName) || emptyTokenBucket({ model: modelName })
      addUsageToBucket(dayModel, usage)
      day.models.set(modelName, dayModel)
      days.set(dayKey, day)
    }
  }
  if (!totals.requests) return null
  const modelBreakdowns = sortedModelBreakdowns(models)
  const modelNames = modelBreakdowns.map((model) => model.model)
  return {
    ...totals,
    dailyBreakdown: [...days.values()]
      .map((day) => {
        const { models, ...rest } = day
        return { ...rest, modelBreakdowns: sortedModelBreakdowns(models) }
      })
      .sort((a, b) => b.date.localeCompare(a.date)),
    modelBreakdowns,
    modelNames,
    lastActive,
    historyDays,
    source: 'Claude Vertex AI logs',
  }
}

async function read(options = {}) {
  const historyDays = tokenHistoryDays(options.tokenHistoryDays)
  // Heavy disk scan — skipped on light pulls; aggregator carries forward cache.
  const tokenUsage = options.skipTokenHistory
    ? null
    : scanClaudeVertexUsage(claudeLogFiles(), Date.now() - historyDays * 86400000, historyDays)
  let quota = null
  let credentials = null
  let error = null
  try {
    credentials = await resolveCredentials()
    if (credentials?.accessToken) quota = await fetchQuota(credentials.accessToken, credentials.projectID)
  } catch (err) {
    error = err && err.message ? err.message : String(err)
  }

  if (!credentials && !tokenUsage) return { connected: false, error: error || 'Vertex AI gcloud ADC credentials or Claude Vertex logs not found' }
  return {
    connected: true,
    projectID: credentials?.projectID || null,
    email: credentials?.email || null,
    quota,
    tokenUsage,
    lastActive: Math.max(tokenUsage?.lastActive || 0, Date.now()),
    error,
  }
}

module.exports = {
  read,
  _private: {
    aggregateSeries,
    claudeLogFiles,
    containsVertexMetadata,
    credentialsFilePath,
    isVertexEntry,
    loadProjectID,
    parseADC,
    parseQuotaUsage,
    parseSaved,
    quotaKey,
    scanClaudeVertexUsage,
    tokenHistoryDays,
    usageFromEntry,
  },
}
