const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const SETTINGS_URL = 'https://ollama.com/settings'
const TAGS_URL = 'https://ollama.com/api/tags'

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

function resolveCredentials() {
  const saved = parseSaved(getKey('ollama'))
  return {
    cookieHeader:
      normalizeCookieHeader(process.env.OLLAMA_COOKIE) ||
      normalizeCookieHeader(process.env.OLLAMA_SESSION_COOKIE) ||
      saved.cookieHeader ||
      null,
    apiKey: clean(process.env.OLLAMA_API_KEY) || clean(process.env.OLLAMA_KEY) || saved.apiKey || null,
  }
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

async function read() {
  const credentials = resolveCredentials()
  try {
    if (credentials.cookieHeader) return await fetchWeb(credentials.cookieHeader)
    if (credentials.apiKey) return await fetchAPI(credentials.apiKey)
    return { connected: false, error: 'Ollama session cookie or API key not configured' }
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
  },
}
