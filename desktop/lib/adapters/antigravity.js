const fs = require('fs')
const os = require('os')
const path = require('path')

const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const BASE = 'https://cloudcode-pa.googleapis.com'
const LOAD_CODE_ASSIST = `${BASE}/v1internal:loadCodeAssist`
const FETCH_MODELS = `${BASE}/v1internal:fetchAvailableModels`
const RETRIEVE_QUOTA = `${BASE}/v1internal:retrieveUserQuota`
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

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
    const json = JSON.parse(text)
    return {
      accessToken: clean(json.access_token || json.accessToken),
      refreshToken: clean(json.refresh_token || json.refreshToken),
      expiryDate: parseDate(json.expiry_date ?? json.expiresAt),
      idToken: clean(json.id_token || json.idToken),
      email: clean(json.email),
      projectID: clean(json.project_id || json.projectId),
      clientID: clean(json.client_id || json.clientId),
      clientSecret: clean(json.client_secret || json.clientSecret),
    }
  } catch {
    return null
  }
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

function resolveCredentials() {
  const env =
    parseCredentials(process.env.ANTIGRAVITY_OAUTH_CREDENTIALS_JSON) ||
    parseCredentials(process.env.ANTIGRAVITY_ACCESS_TOKEN) ||
    parseCredentials(process.env.ANTIGRAVITY_TOKEN)
  return parseCredentials(getKey('antigravity')) || env || loadFileCredentials()
}

function shouldRefresh(credentials, now = Date.now()) {
  return credentials?.expiryDate && credentials.expiryDate - now <= 60000
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

async function refreshAccessToken(credentials) {
  if (!credentials?.refreshToken || !credentials?.clientID || !credentials?.clientSecret) {
    throw new Error('Antigravity refresh token or OAuth client is missing')
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
    10000,
  )
  const text = await res.text()
  if (!res.ok) throw new Error('Antigravity Google auth expired')
  const json = JSON.parse(text)
  const accessToken = clean(json.access_token)
  if (!accessToken) throw new Error('Could not parse Antigravity refresh response')
  return {
    ...credentials,
    accessToken,
    idToken: clean(json.id_token) || credentials.idToken,
    expiryDate: number(json.expires_in) ? Date.now() + number(json.expires_in) * 1000 : credentials.expiryDate,
  }
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
        }
      : null
  return [
    toWindow('Claude', claude || fallback),
    toWindow('Gemini Pro', geminiPro),
    toWindow('Gemini Flash', geminiFlash),
  ].filter(Boolean)
}

async function read() {
  let credentials = resolveCredentials()
  if (!credentials?.accessToken) return { connected: false, error: 'Antigravity OAuth credentials not configured' }
  try {
    if (shouldRefresh(credentials)) credentials = await refreshAccessToken(credentials)
    const credentialClaims = claims(credentials)
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

    return {
      connected: true,
      modelQuotas: quotas,
      windows: selectedWindows(quotas),
      accountEmail: credentialClaims.email,
      accountPlan: planFromCodeAssist(codeAssist, credentialClaims),
      projectID: projectID || null,
      lastActive: Date.now(),
    }
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    claims,
    fallbackRepresentative,
    familyFor,
    mergeVerifiedQuotas,
    parseCredentials,
    parseModelQuotas,
    parseQuotaBuckets,
    planFromCodeAssist,
    projectIDFromCodeAssist,
    representative,
    selectedWindows,
    shouldVerifyQuotas,
  },
}
