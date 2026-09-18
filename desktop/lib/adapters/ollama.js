const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const SETTINGS_URL = 'https://ollama.com/settings'
const TAGS_URL = 'https://ollama.com/api/tags'
const CLOUD_USAGE_PATH = '/api/usage'
const CLOUD_ACCOUNT_PATH = '/api/me'
const OPENSSH_MAGIC = Buffer.from('openssh-key-v1\0')
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

const SESSION_COOKIE_NAMES = new Set([
  'session',
  '__Secure-session',
  'ollama_session',
  '__Host-ollama_session',
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
])

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if (text.toLowerCase().startsWith('cookie:')) text = text.slice(7).trim()
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function isSessionCookieName(name) {
  return (
    SESSION_COOKIE_NAMES.has(name) ||
    name.startsWith('__Secure-next-auth.session-token.') ||
    name.startsWith('next-auth.session-token.')
  )
}

function normalizeCookieHeader(raw) {
  const text = clean(raw)
  if (!text || !text.includes('=')) return null
  const pairs = []
  let hasSession = false
  for (const chunk of text.split(';')) {
    const index = chunk.indexOf('=')
    if (index < 0) continue
    const name = chunk.slice(0, index).trim()
    const value = chunk.slice(index + 1).trim()
    if (!name || !value) continue
    if (isSessionCookieName(name)) hasSession = true
    pairs.push(`${name}=${value}`)
  }
  return hasSession && pairs.length ? pairs.join('; ') : null
}

function parseSaved(value) {
  const text = clean(value)
  if (!text) return {}
  try {
    const json = JSON.parse(text)
    if (json && typeof json === 'object') {
      return {
        apiKey: clean(json.apiKey || json.key || json.token),
        cookieHeader: normalizeCookieHeader(json.cookieHeader || json.cookie || json.session),
      }
    }
  } catch {
    /* fall through */
  }
  const cookieHeader = normalizeCookieHeader(text)
  return cookieHeader ? { cookieHeader } : { apiKey: text }
}

function resolveCredentials(options = {}) {
  const env = options.env || process.env
  const saved = parseSaved(options.savedKey ?? getKey('ollama'))
  return {
    cookieHeader:
      normalizeCookieHeader(env.OLLAMA_COOKIE) ||
      normalizeCookieHeader(env.OLLAMA_SESSION_COOKIE) ||
      saved.cookieHeader ||
      null,
    apiKey: clean(env.OLLAMA_API_KEY) || clean(env.OLLAMA_KEY) || saved.apiKey || null,
  }
}

function sshString(reader) {
  if (reader.offset + 4 > reader.buffer.length) return null
  const length = reader.buffer.readUInt32BE(reader.offset)
  reader.offset += 4
  if (reader.offset + length > reader.buffer.length) return null
  const value = reader.buffer.subarray(reader.offset, reader.offset + length)
  reader.offset += length
  return value
}

function parseOpenSSHEd25519(pem) {
  const body = String(pem || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('-----'))
    .join('')
  let blob
  try {
    blob = Buffer.from(body, 'base64')
  } catch {
    return null
  }
  if (!blob.subarray(0, OPENSSH_MAGIC.length).equals(OPENSSH_MAGIC)) return null
  const outer = { buffer: blob, offset: OPENSSH_MAGIC.length }
  const cipher = sshString(outer)
  const kdf = sshString(outer)
  const kdfOptions = sshString(outer)
  if (!cipher?.equals(Buffer.from('none')) || !kdf?.equals(Buffer.from('none')) || !kdfOptions) return null
  if (outer.offset + 4 > blob.length || blob.readUInt32BE(outer.offset) !== 1) return null
  outer.offset += 4
  const publicBlob = sshString(outer)
  const privateSection = sshString(outer)
  if (!publicBlob || !privateSection) return null

  const inner = { buffer: privateSection, offset: 0 }
  if (inner.offset + 8 > privateSection.length) return null
  const check1 = privateSection.readUInt32BE(inner.offset)
  const check2 = privateSection.readUInt32BE(inner.offset + 4)
  inner.offset += 8
  if (check1 !== check2) return null
  const type = sshString(inner)
  const repeatedPublic = sshString(inner)
  const privateKey = sshString(inner)
  if (!type?.equals(Buffer.from('ssh-ed25519')) || !repeatedPublic || privateKey?.length !== 64) return null
  const seed = privateKey.subarray(0, 32)
  try {
    const keyObject = crypto.createPrivateKey({
      key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
      format: 'der',
      type: 'pkcs8',
    })
    const rawPublic = crypto.createPublicKey(keyObject).export({ format: 'der', type: 'spki' }).subarray(-32)
    const publicReader = { buffer: publicBlob, offset: 0 }
    const publicType = sshString(publicReader)
    const declaredPublic = sshString(publicReader)
    if (!publicType?.equals(Buffer.from('ssh-ed25519')) || !declaredPublic?.equals(rawPublic) || !repeatedPublic.equals(rawPublic)) return null
    return { publicKeyBase64: publicBlob.toString('base64'), seed: Buffer.from(seed) }
  } catch {
    return null
  }
}

function loadSigningKey(options = {}) {
  const file = options.keyPath || path.join(options.home || os.homedir(), '.ollama', 'id_ed25519')
  let pem
  try {
    pem = (options.fs || fs).readFileSync(file, 'utf8')
  } catch (err) {
    if (err && err.code === 'ENOENT') return null
    throw new Error("Couldn't read ~/.ollama/id_ed25519")
  }
  const key = parseOpenSSHEd25519(pem)
  if (!key) throw new Error("~/.ollama/id_ed25519 isn't a usable Ollama signing key")
  return key
}

function signedAuthorization(key, method, requestURI) {
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, key.seed]),
    format: 'der',
    type: 'pkcs8',
  })
  const signature = crypto.sign(null, Buffer.from(`${method},${requestURI}`), privateKey)
  return `${key.publicKeyBase64}:${signature.toString('base64')}`
}

async function fetchSigned(pathname, method, key, options = {}) {
  const now = options.now || Date.now()
  const seconds = Math.floor((now instanceof Date ? now.getTime() : Number(now)) / 1000)
  const requestURI = `${pathname}?ts=${seconds}`
  const request = options.fetchWithTimeout || fetchWithTimeout
  const res = await request(`https://ollama.com${requestURI}`, {
    method,
    headers: {
      Authorization: signedAuthorization(key, method, requestURI),
      Accept: 'application/json',
      'User-Agent': 'MaxxToken/1.0',
    },
  }, 15000)
  const text = await res.text()
  if (res.status === 401 || res.status === 403) throw new Error('Not signed in to Ollama Cloud. Run `ollama signin`.')
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Invalid Ollama Cloud response')
  }
}

function parseCloudUsage(json, account = null, now = Date.now()) {
  const limits = json && json.limits
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) throw new Error('Missing Ollama usage data')
  const fraction = (entry) => {
    if (!entry || typeof entry !== 'object') return null
    const value = Number(entry.usage)
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value * 100)) : null
  }
  const activityCost = Number(json.activity?.cost)
  const plan = clean(account?.Plan || account?.plan)
  return {
    connected: true,
    planName: plan ? plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase() : null,
    accountEmail: clean(account?.Email || account?.email),
    sessionUsedPercent: fraction(limits.session),
    weeklyUsedPercent: fraction(limits.weekly),
    sessionResetsAt: null,
    weeklyResetsAt: null,
    recentChargesUSD: Number.isFinite(activityCost) && activityCost >= 0 ? activityCost : null,
    source: 'native signin',
    lastActive: now instanceof Date ? now.getTime() : Number(now),
  }
}

async function fetchNative(key, options = {}) {
  const usage = await fetchSigned(CLOUD_USAGE_PATH, 'GET', key, options)
  let account = null
  let warning = null
  try {
    account = await fetchSigned(CLOUD_ACCOUNT_PATH, 'POST', key, options)
  } catch (err) {
    warning = err && err.message ? err.message : String(err)
  }
  return { ...parseCloudUsage(usage, account, options.now || Date.now()), warning }
}

function firstCapture(text, pattern, flags = '') {
  const match = String(text || '').match(new RegExp(pattern, flags))
  return clean(match?.[1])
}

function parsePlanName(html) {
  return firstCapture(html, 'Cloud Usage\\s*</span>\\s*<span[^>]*>([^<]+)</span>', 'is')
}

function parseAccountEmail(html) {
  const email = firstCapture(html, 'id=["\\\']header-email["\\\'][^>]*>([^<]+)<', 'is')
  return email && email.includes('@') ? email : null
}

function parseISODate(text) {
  const raw = firstCapture(text, 'data-time=["\\\']([^"\\\']+)["\\\']')
  if (!raw) return null
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function parsePercent(text) {
  const used = firstCapture(text, '([0-9]+(?:\\.[0-9]+)?)\\s*%\\s*used', 'i')
  if (used != null) return Number(used)
  const width = firstCapture(text, 'width:\\s*([0-9]+(?:\\.[0-9]+)?)%', 'i')
  return width == null ? null : Number(width)
}

function parseUsageBlock(labels, html) {
  const allLabels = Array.isArray(labels) ? labels : [labels]
  for (const label of allLabels) {
    const index = String(html || '').indexOf(label)
    if (index < 0) continue
    const window = String(html).slice(index + label.length, index + label.length + 800)
    const usedPercent = parsePercent(window)
    if (!Number.isFinite(usedPercent)) continue
    return {
      usedPercent: Math.max(0, Math.min(100, usedPercent)),
      resetsAt: parseISODate(window),
    }
  }
  return null
}

function looksSignedOut(html) {
  const lower = String(html || '').toLowerCase()
  const hasSignInHeading = lower.includes('sign in to ollama') || lower.includes('log in to ollama')
  const hasAuthRoute = lower.includes('/api/auth/signin') || lower.includes('/auth/signin')
  const hasLoginRoute =
    lower.includes('action="/login"') ||
    lower.includes("action='/login'") ||
    lower.includes('href="/login"') ||
    lower.includes("href='/login'") ||
    lower.includes('action="/signin"') ||
    lower.includes("action='/signin'") ||
    lower.includes('href="/signin"') ||
    lower.includes("href='/signin'")
  const hasPassword = lower.includes('type="password"') || lower.includes("type='password'") || lower.includes('name="password"') || lower.includes("name='password'")
  const hasEmail = lower.includes('type="email"') || lower.includes("type='email'") || lower.includes('name="email"') || lower.includes("name='email'")
  const hasForm = lower.includes('<form')
  if (hasSignInHeading && hasForm && (hasEmail || hasPassword || hasAuthRoute || hasLoginRoute)) return true
  if (hasForm && (hasAuthRoute || hasLoginRoute)) return true
  return hasForm && hasEmail && hasPassword
}

function parseHTML(html, now = Date.now()) {
  const planName = parsePlanName(html)
  const accountEmail = parseAccountEmail(html)
  const session = parseUsageBlock(['Session usage', 'Hourly usage'], html)
  const weekly = parseUsageBlock('Weekly usage', html)

  if (!session && !weekly) {
    if (looksSignedOut(html)) throw new Error('Not logged in to Ollama')
    throw new Error('Missing Ollama usage data')
  }

  return {
    connected: true,
    planName,
    accountEmail,
    sessionUsedPercent: session?.usedPercent ?? null,
    weeklyUsedPercent: weekly?.usedPercent ?? null,
    sessionResetsAt: session?.resetsAt ?? null,
    weeklyResetsAt: weekly?.resetsAt ?? null,
    source: 'web',
    lastActive: now,
  }
}

function parseTags(json, now = Date.now()) {
  const models = Array.isArray(json?.models) ? json.models : []
  return {
    connected: true,
    planName: 'API key',
    accountEmail: null,
    modelCount: models.length,
    source: 'api',
    lastActive: now,
  }
}

async function fetchWeb(cookieHeader) {
  const res = await fetchWithTimeout(
    SETTINGS_URL,
    {
      headers: {
        Cookie: cookieHeader,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Origin: 'https://ollama.com',
        Referer: SETTINGS_URL,
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      },
    },
    15000,
  )
  const text = await res.text()
  if (res.status === 401 || res.status === 403) throw new Error('Ollama session cookie expired')
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  return parseHTML(text)
}

async function fetchAPI(apiKey) {
  const res = await fetchWithTimeout(
    TAGS_URL,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'User-Agent': 'MaxxToken/1.0',
      },
    },
    15000,
  )
  const text = await res.text()
  if (res.status === 401 || res.status === 403) throw new Error('Ollama API key is invalid or expired')
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  return parseTags(JSON.parse(text))
}

async function read(options = {}) {
  try {
    const signingKey = loadSigningKey(options)
    if (signingKey) return await fetchNative(signingKey, options)
    const credentials = resolveCredentials(options)
    if (credentials.cookieHeader) return await fetchWeb(credentials.cookieHeader)
    if (credentials.apiKey) return await fetchAPI(credentials.apiKey)
    return { connected: false, error: 'Run `ollama signin` to track Ollama Cloud usage' }
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    normalizeCookieHeader,
    parseHTML,
    parseSaved,
    parseTags,
    resolveCredentials,
    parseOpenSSHEd25519,
    loadSigningKey,
    signedAuthorization,
    parseCloudUsage,
    fetchSigned,
  },
}
