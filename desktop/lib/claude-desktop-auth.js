const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const CONFIG_KEYS = ['oauth:tokenCacheV2', 'oauth:tokenCache']
const API_HOST = 'https://api.anthropic.com'
const USAGE_SCOPE = 'user:profile'
const INFERENCE_SCOPE = 'user:inference'
const PROD_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'

function desktopRoot(home = os.homedir()) {
  return path.join(home, 'Library', 'Application Support', 'Claude')
}

function readConfig(home = os.homedir()) {
  try { return JSON.parse(fs.readFileSync(path.join(desktopRoot(home), 'config.json'), 'utf8')) } catch { return null }
}

function desktopOrganizations(home = os.homedir(), accountId = null) {
  const root = desktopRoot(home)
  const config = readConfig(home)
  const user = String(accountId || config?.lastKnownAccountUuid || '').trim().toLowerCase()
  if (!user) return []
  const organizations = new Set()
  for (const parent of ['claude-code-sessions', 'local-agent-mode-sessions']) {
    const directory = path.join(root, parent, user)
    try {
      for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
        if (item.isDirectory() && /^[0-9a-f-]{30,}$/i.test(item.name)) organizations.add(item.name.toLowerCase())
      }
    } catch { /* absent */ }
  }
  try {
    const history = JSON.parse(fs.readFileSync(path.join(root, 'plan-usage-history.json'), 'utf8'))
    for (const sample of Array.isArray(history?.samples) ? history.samples : []) {
      if (/^[0-9a-f-]{30,}$/i.test(String(sample?.org || ''))) organizations.add(String(sample.org).toLowerCase())
    }
  } catch { /* absent */ }
  return [...organizations].sort()
}

function deriveKey(password) {
  return crypto.pbkdf2Sync(Buffer.from(String(password)), Buffer.from('saltysalt'), 1003, 16, 'sha1')
}

function decryptSafeStorage(encoded, key) {
  const encrypted = Buffer.isBuffer(encoded) ? encoded : Buffer.from(encoded)
  if (encrypted.length <= 3 || encrypted.subarray(0, 3).toString() !== 'v10') throw new Error('Unsupported Claude Desktop credential format.')
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
  return Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()])
}

function safeStoragePassword(options = {}) {
  if (typeof options.password === 'string') return options.password
  try {
    return execFileSync('security', ['find-generic-password', '-w', '-s', 'Claude Safe Storage', '-a', 'Claude Key'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
    }).trim()
  } catch {
    return null
  }
}

function decodeCache(value, key) {
  if (typeof value !== 'string') return null
  try { return JSON.parse(decryptSafeStorage(Buffer.from(value, 'base64'), key).toString('utf8')) } catch { return null }
}

function parseCacheKey(raw, activeAccountId) {
  let key = raw
  let scoped = false
  if (key.startsWith('acct:')) {
    const split = key.indexOf('|')
    if (split < 0 || key.slice(5, split).toLowerCase() !== String(activeAccountId || '').toLowerCase()) return null
    key = key.slice(split + 1)
    scoped = true
  }
  const marker = `:${API_HOST}:`
  const markerAt = key.indexOf(marker)
  const firstColon = key.indexOf(':')
  if (firstColon < 0 || markerAt <= firstColon) return null
  const clientId = key.slice(0, firstColon).toLowerCase()
  const organizationId = key.slice(firstColon + 1, markerAt).toLowerCase()
  const scopes = key.slice(markerAt + marker.length).trim().split(/\s+/).filter(Boolean)
  return { raw, scoped, clientId, organizationId, scopes }
}

function selectCredential(caches, options = {}) {
  const now = Number(options.now) || Date.now()
  const accountId = String(options.accountId || '').toLowerCase()
  const organizationId = String(options.organizationId || '').toLowerCase()
  const shadowed = new Set()
  for (const cache of caches.filter(Boolean)) {
    const legacy = new Map()
    const scoped = new Map()
    for (const [rawKey, value] of Object.entries(cache)) {
      const parsed = parseCacheKey(rawKey, accountId)
      if (!parsed) continue
      const logical = `${parsed.clientId}|${parsed.organizationId}|${parsed.scopes.join(' ')}`
      const destination = parsed.scoped ? scoped : legacy
      destination.set(logical, { parsed, value })
    }
    const normalized = new Map([...legacy, ...scoped])
    const candidates = []
    for (const [logical, entry] of normalized) {
      if (shadowed.has(logical)) continue
      const { parsed, value } = entry
      if (parsed.organizationId !== organizationId || !parsed.scopes.includes(USAGE_SCOPE)) continue
      if (!value || typeof value !== 'object') continue
      const token = typeof value.token === 'string' ? value.token.trim() : ''
      const expiresAt = Number(value.expiresAt)
      if (!token || !Number.isFinite(expiresAt) || expiresAt <= now + 120000) continue
      const fullScope = parsed.scopes.includes(INFERENCE_SCOPE)
      candidates.push({
        token,
        expiresAt,
        subscriptionType: value.subscriptionType || null,
        rateLimitTier: value.rateLimitTier || null,
        scopes: parsed.scopes,
        rank: [parsed.clientId === PROD_CLIENT_ID && fullScope ? 1 : 0, fullScope ? 1 : 0, parsed.scopes.length, expiresAt],
      })
    }
    for (const logical of normalized.keys()) shadowed.add(logical)
    candidates.sort((a, b) => {
      for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return b.rank[i] - a.rank[i]
      return 0
    })
    if (candidates.length) return candidates[0]
  }
  return null
}

function loadDesktopCredential(options = {}) {
  const home = options.home || os.homedir()
  const config = readConfig(home)
  if (!config) return null
  const accountId = String(options.accountId || config.lastKnownAccountUuid || '').toLowerCase()
  if (!accountId || (options.accountId && accountId !== String(config.lastKnownAccountUuid || '').toLowerCase())) return null
  const password = safeStoragePassword(options)
  if (!password) return null
  const key = deriveKey(password)
  const caches = CONFIG_KEYS.map((cacheKey) => decodeCache(config[cacheKey], key))
  const selected = selectCredential(caches, { accountId, organizationId: options.organizationId, now: options.now })
  if (!selected) return null
  return {
    data: {
      claudeAiOauth: {
        accessToken: selected.token,
        expiresAt: selected.expiresAt,
        subscriptionType: selected.subscriptionType,
        rateLimitTier: selected.rateLimitTier,
        scopes: selected.scopes,
      },
    },
    source: 'desktop',
  }
}

module.exports = {
  desktopRoot,
  readConfig,
  desktopOrganizations,
  deriveKey,
  decryptSafeStorage,
  selectCredential,
  loadDesktopCredential,
  _private: { decodeCache, parseCacheKey },
}
