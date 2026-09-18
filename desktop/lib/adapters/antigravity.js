const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const https = require('https')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')
const conversationHistory = require('./antigravity-history')

const BASE = 'https://cloudcode-pa.googleapis.com'
const LOAD_CODE_ASSIST = `${BASE}/v1internal:loadCodeAssist`
const FETCH_MODELS = `${BASE}/v1internal:fetchAvailableModels`
const RETRIEVE_QUOTA = `${BASE}/v1internal:retrieveUserQuota`
const RETRIEVE_QUOTA_SUMMARY = `${BASE}/v1internal:retrieveUserQuotaSummary`
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const LS_SERVICE = 'exa.language_server_pb.LanguageServerService'
const SESSION_MS = 5 * 60 * 60 * 1000
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const refreshedAccessTokens = new Map()

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

function parseDate(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function parseCredentials(raw) {
  const text = clean(raw)
  if (!text) return null
  if (!text.startsWith('{')) return { accessToken: text }
  try {
    return parseCredentialObject(JSON.parse(text))
  } catch {
    return null
  }
}

function parseCredentialObject(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const direct = {
    accessToken: clean(json.access_token || json.accessToken),
    refreshToken: clean(json.refresh_token || json.refreshToken),
    expiryDate: parseDate(json.expiry ?? json.expiry_date ?? json.expires_at ?? json.expiresAt),
    idToken: clean(json.id_token || json.idToken),
    email: clean(json.email),
    projectID: clean(json.project_id || json.projectId),
    clientID: clean(json.client_id || json.clientId),
    clientSecret: clean(json.client_secret || json.clientSecret),
  }
  if (direct.accessToken || direct.refreshToken) return direct
  for (const key of ['token', 'tokens', 'oauth', 'oauth2', 'credentials', 'auth']) {
    const nested = parseCredentialObject(json[key])
    if (nested) return nested
  }
  return null
}

function unwrapGoKeyring(raw) {
  const text = clean(raw)
  if (!text) return null
  const prefix = 'go-keyring-base64:'
  if (!text.startsWith(prefix)) return text
  try {
    return clean(Buffer.from(text.slice(prefix.length), 'base64').toString('utf8'))
  } catch {
    return null
  }
}

function parseKeychainCredentials(raw) {
  const text = unwrapGoKeyring(raw)
  if (!text) return null
  if (text.startsWith('Bearer ')) return parseCredentials(text.slice('Bearer '.length))
  return parseCredentials(text)
}

function loadKeychainCredentials(options = {}) {
  const platform = options.platform || process.platform
  if (platform !== 'darwin') return null
  const execImpl = options.execFileSync || execFileSync
  try {
    const raw = execImpl(
      '/usr/bin/security',
      ['find-generic-password', '-s', 'gemini', '-a', 'antigravity', '-w'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 4000,
        maxBuffer: 1024 * 1024,
      },
    )
    return parseKeychainCredentials(raw)
  } catch {
    return null
  }
}

function parseCommandFlag(command, flag) {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = String(command || '').match(new RegExp(`(?:^|\\s)${escaped}(?:=|\\s+)(?:"([^"]+)"|'([^']+)'|([^\\s]+))`))
  return clean(match && (match[1] || match[2] || match[3]))
}

function parseLanguageServerProcesses(output) {
  const candidates = []
  for (const rawLine of String(output || '').split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(\d+)\s+(.+)$/)
    if (!match) continue
    const command = match[2]
    const lower = command.toLowerCase()
    const isLanguageServer = /(?:^|[/\\])language_server(?:_[^/\\\s]+)?(?:\s|$)/i.test(command)
    const isAgy = /(?:^|[/\\])agy(?:\s|$)/i.test(command)
    if (!isLanguageServer && !isAgy) continue
    if (isLanguageServer && !lower.includes('antigravity')) continue
    const port = number(parseCommandFlag(command, '--extension_server_port'))
    if (!port || port <= 0 || port >= 65536) continue
    const csrf =
      parseCommandFlag(command, '--extension_server_csrf_token') ||
      parseCommandFlag(command, '--csrf_token')
    if (!csrf) continue
    candidates.push({ pid: Number(match[1]), port, csrf })
  }
  return candidates
}

function parseListeningPorts(output) {
  const ports = new Set()
  for (const match of String(output || '').matchAll(/TCP\s+(?:\[[^\]]+\]|[^:\s]+):(\d+)\s+\(LISTEN\)/g)) {
    const port = number(match[1])
    if (port > 0 && port < 65536) ports.add(port)
  }
  return [...ports]
}

function listeningPorts(pid, execImpl = execFileSync) {
  try {
    const output = execImpl('/usr/sbin/lsof', ['-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 4000,
      maxBuffer: 1024 * 1024,
    })
    return parseListeningPorts(output)
  } catch {
    return []
  }
}

function discoverLanguageServers(options = {}) {
  const execImpl = options.execFileSync || execFileSync
  try {
    const output = execImpl('/bin/ps', ['-ax', '-o', 'pid=,command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 4000,
      maxBuffer: 4 * 1024 * 1024,
    })
    return parseLanguageServerProcesses(output).map((candidate) => ({
      ...candidate,
      ports: listeningPorts(candidate.pid, execImpl),
    }))
  } catch {
    return []
  }
}

function antigravityBinaryCandidates(options = {}) {
  const env = options.env || process.env
  const home = options.home || os.homedir()
  return [
    env.ANTIGRAVITY_LANGUAGE_SERVER_PATH,
    '/Applications/Antigravity.app/Contents/Resources/bin/language_server',
    path.join(home, 'Applications', 'Antigravity.app', 'Contents', 'Resources', 'bin', 'language_server'),
  ].filter(Boolean)
}

function extractBundledOAuthClients(value) {
  const text = Buffer.isBuffer(value) ? value.toString('latin1') : String(value || '')
  const ids = [...new Set([...text.matchAll(/[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com/gi)].map((match) => match[0]))]
  const secrets = [...new Set([...text.matchAll(/GOCSPX-[A-Za-z0-9_-]{28}/g)].map((match) => match[0]))]
  return ids.flatMap((clientID) => secrets.map((clientSecret) => ({ clientID, clientSecret })))
}

function loadBundledOAuthClients(options = {}) {
  const fsImpl = options.fs || fs
  for (const file of antigravityBinaryCandidates(options)) {
    try {
      const clients = extractBundledOAuthClients(fsImpl.readFileSync(file))
      if (clients.length) return clients
    } catch {
      /* try the next installed-app location */
    }
  }
  return []
}

function defaultCredentialsPath() {
  return path.join(os.homedir(), '.codexbar', 'antigravity', 'oauth_creds.json')
}

function loadFileCredentials(file = defaultCredentialsPath()) {
  try {
    return parseCredentials(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function resolveCredentials(options = {}) {
  const envSource = options.env || process.env
  const env =
    parseCredentials(envSource.ANTIGRAVITY_OAUTH_CREDENTIALS_JSON) ||
    parseCredentials(envSource.ANTIGRAVITY_ACCESS_TOKEN) ||
    parseCredentials(envSource.ANTIGRAVITY_TOKEN)
  const native = loadKeychainCredentials(options)
  if (native) return { ...native, source: 'keychain', oauthClients: loadBundledOAuthClients(options) }
  const savedKey = Object.prototype.hasOwnProperty.call(options, 'savedKey') ? options.savedKey : getKey('antigravity')
  const saved = parseCredentials(savedKey) || env || loadFileCredentials(options.credentialsPath)
  return saved ? { ...saved, source: 'manual' } : null
}

function shouldRefresh(credentials, now = Date.now()) {
  return credentials?.expiryDate && credentials.expiryDate - now <= 60000
}

function refreshTokenFingerprint(refreshToken) {
  const token = clean(refreshToken)
  return token ? crypto.createHash('sha256').update(token).digest('hex') : null
}

function withCachedAccessToken(credentials, now = Date.now()) {
  const fingerprint = refreshTokenFingerprint(credentials?.refreshToken)
  const cached = fingerprint ? refreshedAccessTokens.get(fingerprint) : null
  if (!cached || cached.expiryDate - now <= 60000) return credentials
  return { ...credentials, ...cached }
}

function cacheRefreshedAccessToken(credentials) {
  const fingerprint = refreshTokenFingerprint(credentials?.refreshToken)
  if (!fingerprint || !credentials?.accessToken || !credentials?.expiryDate) return
  if (refreshedAccessTokens.size >= 8) refreshedAccessTokens.clear()
  refreshedAccessTokens.set(fingerprint, {
    accessToken: credentials.accessToken,
    idToken: credentials.idToken,
    expiryDate: credentials.expiryDate,
  })
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

function claims(credentials) {
  const payload = decodeJWT(credentials?.idToken)
  return {
    email: clean(payload.email) || clean(credentials?.email),
    hostedDomain: clean(payload.hd),
  }
}

function planFromCodeAssist(response, credentialClaims = {}) {
  const planType = clean(response?.planInfo?.planType)
  if (planType) return planType
  const tierID = clean(response?.currentTier?.id)
  if (tierID === 'standard-tier') return 'Paid'
  if (tierID === 'free-tier') return credentialClaims.hostedDomain ? 'Workspace' : 'Free'
  if (tierID === 'legacy-tier') return 'Legacy'
  return clean(response?.currentTier?.name)
}

function projectReference(value) {
  if (typeof value === 'string') return clean(value)
  return clean(value?.id || value?.projectId)
}

function projectIDFromCodeAssist(response) {
  return projectReference(response?.cloudaicompanionProject)
}

function pickOnboardTier(response) {
  const tiers = Array.isArray(response?.allowedTiers) ? response.allowedTiers : []
  return (
    clean(tiers.find((tier) => tier?.isDefault && clean(tier.id))?.id) ||
    clean(tiers.find((tier) => clean(tier.id))?.id) ||
    clean(response?.paidTier?.id) ||
    clean(response?.currentTier?.id)
  )
}

async function postJSON(endpoint, accessToken, body, timeoutMs = 10000) {
  const res = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'antigravity',
      },
      body: JSON.stringify(body || {}),
    },
    timeoutMs,
  )
  const text = await res.text()
  if (res.status === 401) throw new Error('Antigravity Google auth expired')
  if (res.status === 403) {
    const err = new Error(text.trim() || 'Antigravity remote API permission denied')
    err.permissionDenied = true
    throw err
  }
  if (!res.ok) throw new Error(`Antigravity HTTP ${res.status}: ${text.slice(0, 200)}`)
  return text.trim() ? JSON.parse(text) : {}
}

function loopbackRequest(url, init = {}, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const transport = parsed.protocol === 'https:' ? https : http
    const req = transport.request({
      protocol: parsed.protocol,
      hostname: '127.0.0.1',
      port: parsed.port,
      path: parsed.pathname,
      method: init.method || 'GET',
      headers: init.headers || {},
      rejectUnauthorized: false,
      timeout: timeoutMs,
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: async () => body,
        })
      })
    })
    req.on('timeout', () => req.destroy(new Error('Antigravity language server timed out')))
    req.on('error', reject)
    if (init.body) req.write(init.body)
    req.end()
  })
}

async function callLanguageServer(candidate, method, request = loopbackRequest) {
  const scheme = candidate.scheme || 'http'
  const endpoint = `${scheme}://127.0.0.1:${candidate.port}/${LS_SERVICE}/${method}`
  try {
    const res = await request(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Connect-Protocol-Version': '1',
          'x-codeium-csrf-token': candidate.csrf,
        },
        body: JSON.stringify({
          metadata: {
            ideName: 'antigravity',
            extensionName: 'antigravity',
            ideVersion: 'unknown',
            locale: 'en',
          },
        }),
      },
      4000,
    )
    if (!res.ok) return null
    const text = await res.text()
    return text.trim() ? JSON.parse(text) : {}
  } catch {
    return null
  }
}

function planFromLocalStatus(response) {
  const status = response?.userStatus || response?.response?.userStatus
  return clean(status?.userTier?.name || status?.planStatus?.planInfo?.planName)
}

async function readLocalUsage(options = {}) {
  const candidates = options.candidates || discoverLanguageServers(options)
  const request = options.localRequest || loopbackRequest
  for (const candidate of candidates) {
    const endpoints = []
    for (const port of candidate.ports || []) {
      endpoints.push({ ...candidate, port, scheme: 'https' }, { ...candidate, port, scheme: 'http' })
    }
    endpoints.push({ ...candidate, scheme: 'http' })
    for (const endpoint of endpoints) {
      const summary = await callLanguageServer(endpoint, 'RetrieveUserQuotaSummary', request)
      if (!summary) continue
      const windows = parseQuotaSummary(summary)
      if (!windows) continue
      const status = await callLanguageServer(endpoint, 'GetUserStatus', request)
      return {
        connected: true,
        source: 'language-server',
        modelQuotas: [],
        windows,
        accountPlan: planFromLocalStatus(status),
        projectID: null,
        lastActive: Date.now(),
      }
    }
  }
  return null
}

async function refreshAccessToken(credentials, options = {}) {
  const clients = []
  if (credentials?.clientID && credentials?.clientSecret) {
    clients.push({ clientID: credentials.clientID, clientSecret: credentials.clientSecret })
  }
  for (const client of credentials?.oauthClients || loadBundledOAuthClients(options)) {
    if (!clients.some((item) => item.clientID === client.clientID && item.clientSecret === client.clientSecret)) clients.push(client)
  }
  if (!credentials?.refreshToken || !clients.length) {
    throw new Error('Antigravity refresh token or OAuth client is missing')
  }
  const request = options.fetchWithTimeout || fetchWithTimeout
  for (const client of clients) {
    const form = new URLSearchParams({
      client_id: client.clientID,
      client_secret: client.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: 'refresh_token',
    })
    try {
      const res = await request(
        TOKEN_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        },
        10000,
      )
      const text = await res.text()
      if (!res.ok) continue
      const json = JSON.parse(text)
      const accessToken = clean(json.access_token)
      if (!accessToken) continue
      return {
        ...credentials,
        accessToken,
        idToken: clean(json.id_token) || credentials.idToken,
        expiryDate: number(json.expires_in) ? Date.now() + number(json.expires_in) * 1000 : credentials.expiryDate,
      }
    } catch {
      /* try the next client embedded in the installed app */
    }
  }
  throw new Error('Antigravity Google auth expired')
}

function parseModelQuotas(response) {
  const models = response?.models && typeof response.models === 'object' ? response.models : {}
  return Object.entries(models)
    .map(([modelId, model]) => {
      const quota = model?.quotaInfo
      if (!quota) return null
      return {
        label: clean(model.displayName || model.label) || modelId,
        modelId,
        remainingFraction: number(quota.remainingFraction),
        resetAt: parseDate(quota.resetTime),
      }
    })
    .filter(Boolean)
}

const SUMMARY_BUCKETS = [
  { bucketID: 'gemini-5h', label: 'Session', periodMs: SESSION_MS },
  { bucketID: 'gemini-weekly', label: 'Weekly', periodMs: WEEK_MS },
  { bucketID: '3p-5h', label: 'Claude', periodMs: SESSION_MS },
  { bucketID: '3p-weekly', label: 'Claude Weekly', periodMs: WEEK_MS },
]

function parseQuotaSummary(response) {
  const groups = response?.response?.groups || response?.groups
  if (!Array.isArray(groups)) return null
  const buckets = groups.flatMap((group) => (Array.isArray(group?.buckets) ? group.buckets : []))
  const byID = new Map()
  for (const bucket of buckets) {
    const id = clean(bucket?.bucketId)
    if (!id || byID.has(id)) continue
    const remainingFraction = number(bucket.remainingFraction)
    if (remainingFraction == null) continue
    byID.set(id, {
      remainingFraction,
      resetAt: parseDate(bucket.resetTime),
    })
  }
  return SUMMARY_BUCKETS.flatMap((spec) => {
    const bucket = byID.get(spec.bucketID)
    if (!bucket) return []
    const remainingPct = clampPct(bucket.remainingFraction * 100)
    return [{
      label: spec.label,
      modelLabel: spec.label,
      modelId: spec.bucketID,
      usedPct: clampPct(100 - remainingPct),
      remainingPct,
      resetAt: bucket.resetAt,
      periodMs: spec.periodMs,
    }]
  })
}

function parseQuotaBuckets(response) {
  const buckets = Array.isArray(response?.buckets) ? response.buckets : []
  const byModel = new Map()
  for (const bucket of buckets) {
    const modelId = clean(bucket.modelId)
    if (!modelId) continue
    const next = {
      label: modelId,
      modelId,
      remainingFraction: number(bucket.remainingFraction),
      resetAt: parseDate(bucket.resetTime),
    }
    const prev = byModel.get(modelId)
    const prevValue = prev?.remainingFraction ?? Number.POSITIVE_INFINITY
    const nextValue = next.remainingFraction ?? Number.POSITIVE_INFINITY
    if (!prev || nextValue < prevValue) byModel.set(modelId, next)
  }
  return [...byModel.values()].sort((a, b) => a.modelId.localeCompare(b.modelId))
}

function shouldVerifyQuotas(quotas) {
  return quotas.length > 0 && quotas.every((quota) => quota.remainingFraction != null && quota.remainingFraction >= 0.999)
}

function hasConsumedQuota(quotas) {
  return quotas.some((quota) => quota.remainingFraction != null && quota.remainingFraction < 0.999)
}

function mergeVerifiedQuotas(modelQuotas, verifiedQuotas) {
  const verified = new Map(verifiedQuotas.map((quota) => [quota.modelId.trim().toLowerCase(), quota]))
  const merged = modelQuotas.map((quota) => {
    const match = verified.get(quota.modelId.trim().toLowerCase())
    if (!match) return quota
    verified.delete(quota.modelId.trim().toLowerCase())
    return {
      ...quota,
      remainingFraction: match.remainingFraction ?? quota.remainingFraction,
      resetAt: match.resetAt || quota.resetAt,
    }
  })
  for (const quota of verified.values()) {
    if (quota.remainingFraction != null) merged.push(quota)
  }
  return merged
}

function familyFor(quota) {
  const text = `${quota.modelId || ''} ${quota.label || ''}`.toLowerCase()
  if (text.includes('claude')) return 'claude'
  if (text.includes('gemini') && text.includes('pro')) return 'geminiPro'
  if (text.includes('gemini') && text.includes('flash')) return 'geminiFlash'
  return 'unknown'
}

function selectionPriority(quota, family) {
  const text = `${quota.modelId || ''} ${quota.label || ''}`.toLowerCase()
  const lite = text.includes('lite')
  const autocomplete = text.includes('autocomplete') || text.includes('tab_')
  if (family === 'claude') return 0
  if (family === 'geminiPro') {
    if (text.includes('pro-low') || (text.includes('pro') && text.includes('low'))) return 0
    return !lite && !autocomplete ? 1 : null
  }
  if (family === 'geminiFlash') return !lite && !autocomplete ? 0 : null
  return null
}

function remainingPercent(quota) {
  return clampPct((quota.remainingFraction ?? 0) * 100)
}

function representative(quotas, family) {
  const candidates = quotas
    .map((quota) => ({ quota, family: familyFor(quota), priority: selectionPriority(quota, familyFor(quota)) }))
    .filter((item) => item.family === family && item.priority != null)
  if (!candidates.length) return null
  candidates.sort((a, b) => {
    const aHas = a.quota.remainingFraction != null
    const bHas = b.quota.remainingFraction != null
    if (aHas !== bHas) return aHas ? -1 : 1
    if (a.priority !== b.priority) return a.priority - b.priority
    const pct = remainingPercent(a.quota) - remainingPercent(b.quota)
    if (pct !== 0) return pct
    if (a.quota.resetAt && b.quota.resetAt && a.quota.resetAt !== b.quota.resetAt) return a.quota.resetAt - b.quota.resetAt
    if (a.quota.resetAt && !b.quota.resetAt) return -1
    if (!a.quota.resetAt && b.quota.resetAt) return 1
    return String(a.quota.label).localeCompare(String(b.quota.label))
  })
  return candidates[0].quota
}

function fallbackRepresentative(quotas) {
  if (!quotas.length) return null
  return [...quotas].sort((a, b) => {
    const aHas = a.remainingFraction != null
    const bHas = b.remainingFraction != null
    if (aHas !== bHas) return aHas ? -1 : 1
    const pct = remainingPercent(a) - remainingPercent(b)
    if (pct !== 0) return pct
    return String(a.label).localeCompare(String(b.label))
  })[0]
}

function selectedWindows(modelQuotas) {
  const claude = representative(modelQuotas, 'claude')
  const geminiPro = representative(modelQuotas, 'geminiPro')
  const geminiFlash = representative(modelQuotas, 'geminiFlash')
  const fallback = !claude && !geminiPro && !geminiFlash ? fallbackRepresentative(modelQuotas) : null
  const toWindow = (label, quota) =>
    quota
      ? {
          label,
          modelLabel: quota.label,
          modelId: quota.modelId,
          usedPct: clampPct(100 - remainingPercent(quota)),
          remainingPct: remainingPercent(quota),
          resetAt: quota.resetAt || null,
          periodMs: SESSION_MS,
        }
      : null
  return [
    toWindow('Claude', claude || fallback),
    toWindow('Gemini Pro', geminiPro),
    toWindow('Gemini Flash', geminiFlash),
  ].filter(Boolean)
}

async function read(options = {}) {
  const withHistory = (usage) => {
    if (!usage?.connected || options.skipTokenHistory) return usage
    const tokenUsage = conversationHistory.scan(options)
    return tokenUsage ? { ...usage, tokenUsage } : usage
  }
  const local = await readLocalUsage(options)
  if (local) return withHistory(local)

  let credentials = resolveCredentials(options)
  if (!credentials?.accessToken) {
    return { connected: false, error: 'Start Antigravity or run agy and sign in, then refresh' }
  }
  try {
    credentials = withCachedAccessToken(credentials)
    if (shouldRefresh(credentials)) {
      if (!credentials.refreshToken || (!(credentials.oauthClients || []).length && (!credentials.clientID || !credentials.clientSecret))) {
        throw new Error('Antigravity login expired — open Antigravity or run agy, then refresh')
      }
      credentials = await refreshAccessToken(credentials, options)
      cacheRefreshedAccessToken(credentials)
    }
    const credentialClaims = claims(credentials)
    let summaryWindows = null
    try {
      summaryWindows = parseQuotaSummary(
        await postJSON(RETRIEVE_QUOTA_SUMMARY, credentials.accessToken, {}),
      )
    } catch (err) {
      if (err && /auth expired/i.test(err.message || '')) throw err
    }
    const codeAssist = await postJSON(LOAD_CODE_ASSIST, credentials.accessToken, {
      metadata: {
        ideType: 'ANTIGRAVITY',
        platform: 'PLATFORM_UNSPECIFIED',
        pluginType: 'GEMINI',
      },
    })
    let projectID = credentials.projectID || projectIDFromCodeAssist(codeAssist)
    if (!projectID) {
      const tierID = pickOnboardTier(codeAssist)
      if (tierID) {
        try {
          const onboard = await postJSON(`${BASE}/v1internal:onboardUser`, credentials.accessToken, {
            tierId: tierID,
            metadata: {
              ideType: 'ANTIGRAVITY',
              platform: 'PLATFORM_UNSPECIFIED',
              pluginType: 'GEMINI',
            },
          })
          projectID = projectReference(onboard?.response?.cloudaicompanionProject)
        } catch {
          projectID = null
        }
      }
    }

    let quotas = []
    if (summaryWindows == null) {
      try {
        quotas = parseModelQuotas(
          await postJSON(FETCH_MODELS, credentials.accessToken, projectID ? { project: projectID } : {}),
        )
        if (shouldVerifyQuotas(quotas)) {
          try {
            const verified = parseQuotaBuckets(
              await postJSON(RETRIEVE_QUOTA, credentials.accessToken, projectID ? { project: projectID } : {}),
            )
            if (hasConsumedQuota(verified)) quotas = mergeVerifiedQuotas(quotas, verified)
          } catch {
            /* optional */
          }
        }
      } catch (err) {
        if (!err.permissionDenied) throw err
        quotas = parseQuotaBuckets(
          await postJSON(RETRIEVE_QUOTA, credentials.accessToken, projectID ? { project: projectID } : {}),
        )
      }
    }

    return withHistory({
      connected: true,
      source: credentials.source || 'credentials',
      modelQuotas: quotas,
      windows: summaryWindows || selectedWindows(quotas),
      accountEmail: credentialClaims.email,
      accountPlan: planFromCodeAssist(codeAssist, credentialClaims),
      projectID: projectID || null,
      lastActive: Date.now(),
    })
  } catch (err) {
    const message = err && err.message ? err.message : String(err)
    const error = credentials.source === 'keychain' && /auth expired|401/i.test(message)
      ? 'Antigravity login expired — open Antigravity or run agy, then refresh'
      : message
    return { connected: false, error }
  }
}

module.exports = {
  read,
  _private: {
    claims,
    fallbackRepresentative,
    familyFor,
    callLanguageServer,
    discoverLanguageServers,
    extractBundledOAuthClients,
    loadBundledOAuthClients,
    loadKeychainCredentials,
    loopbackRequest,
    mergeVerifiedQuotas,
    parseCommandFlag,
    parseCredentials,
    parseKeychainCredentials,
    parseLanguageServerProcesses,
    parseListeningPorts,
    parseModelQuotas,
    parseQuotaBuckets,
    parseQuotaSummary,
    planFromCodeAssist,
    planFromLocalStatus,
    projectIDFromCodeAssist,
    readLocalUsage,
    refreshAccessToken,
    representative,
    resolveCredentials,
    selectedWindows,
    shouldVerifyQuotas,
  },
}
