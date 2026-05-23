// Amp (Sourcegraph) credit balance. `amp usage` prints a one-line summary like
// "Individual credits: $99.11 remaining" which we parse for the balance.
const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { getKey } = require('../secrets')

const SETTINGS_URL = 'https://ampcode.com/settings'

const EXTRA_PATHS = [
  path.join(os.homedir(), '.local/bin'),
  path.join(os.homedir(), '.bun/bin'),
  path.join(os.homedir(), '.cargo/bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
]

function resolveAmp() {
  for (const dir of EXTRA_PATHS) {
    const candidate = path.join(dir, 'amp')
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return candidate
    } catch {
      /* keep looking */
    }
  }
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue
    const candidate = path.join(dir, 'amp')
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return candidate
    } catch {
      /* keep looking */
    }
  }
  return null
}

function runUsage(bin) {
  return new Promise((resolve) => {
    execFile(bin, ['usage'], { timeout: 8000 }, (err, stdout) => {
      if (err) return resolve({ ok: false, error: err.message || String(err) })
      resolve({ ok: true, out: String(stdout || '') })
    })
  })
}

function clean(value) {
  const text = String(value || '').trim()
  return text || null
}

function normalizeCookieHeader(raw) {
  let text = clean(raw)
  if (!text) return null
  const cookieFlag = text.match(/(?:--cookie|-b)\s+(['"])([\s\S]*?)\1/i)
  if (cookieFlag) text = cookieFlag[2].trim()
  const headerFlag = text.match(/(?:-H|--header)\s+(['"])cookie\s*:\s*([\s\S]*?)\1/i)
  if (headerFlag) text = headerFlag[2].trim()
  text = text.replace(/^cookie\s*:/i, '').trim()
  const pairs = text
    .split(';')
    .map((part) => part.trim())
    .filter((part) => /^[^=\s;]+=/.test(part))
  return pairs.length ? pairs.join('; ') : null
}

function sessionCookieHeader(raw) {
  const header = normalizeCookieHeader(raw)
  if (!header) return null
  const session = header.split(';').map((part) => part.trim()).find((part) => part.startsWith('session='))
  return session || null
}

function extractObject(named, text) {
  const start = String(text || '').indexOf(named)
  if (start === -1) return null
  const brace = String(text).indexOf('{', start + named.length)
  if (brace === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = brace; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(brace, index + 1)
    }
  }
  return null
}

function numberFor(key, text) {
  const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = String(text || '').match(new RegExp(`\\b${escaped}\\b\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`))
  return match ? Number(match[1]) : null
}

function looksSignedOut(html) {
  const lower = String(html || '').toLowerCase()
  return lower.includes('sign in') || lower.includes('log in') || lower.includes('login') || lower.includes('/login')
}

function parseFreeTierHTML(html, now = Date.now()) {
  let object = extractObject('freeTierUsage', html) || extractObject('getFreeTierUsage', html)
  if (!object) {
    if (looksSignedOut(html)) throw new Error('Not logged in to Amp')
    throw new Error('Missing Amp Free usage data')
  }
  const quota = numberFor('quota', object)
  const used = numberFor('used', object)
  const hourlyReplenishment = numberFor('hourlyReplenishment', object)
  const windowHours = numberFor('windowHours', object)
  if (quota == null || used == null || hourlyReplenishment == null) throw new Error('Missing Amp Free usage fields')
  const usedPct = quota > 0 ? Math.max(0, Math.min(100, (used / quota) * 100)) : 0
  const resetAt = quota > 0 && hourlyReplenishment > 0
    ? now + Math.max(0, used / hourlyReplenishment) * 3600000
    : null
  return {
    connected: true,
    source: 'Amp web session',
    plan: 'Amp Free',
    quota,
    used,
    remaining: Math.max(0, quota - used),
    hourlyReplenishment,
    windowHours,
    usedPct,
    resetAt,
    lastActive: now,
  }
}

function resolveCookie() {
  return sessionCookieHeader(process.env.AMP_COOKIE || process.env.AMP_SESSION_COOKIE || getKey('amp'))
}

async function fetchWeb(cookieHeader, fetchImpl = fetch) {
  const res = await fetchImpl(SETTINGS_URL, {
    method: 'GET',
    headers: {
      Cookie: cookieHeader,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: 'https://ampcode.com',
      Referer: SETTINGS_URL,
    },
    redirect: 'manual',
  })
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const location = res.headers?.get?.('location') || ''
    if (/\/(?:auth\/)?(?:sign-?in|login)|returnTo=|redirect/i.test(location)) {
      throw new Error('Amp session cookie expired')
    }
  }
  if (res.status === 401 || res.status === 403) throw new Error('Amp session cookie expired')
  if (!res.ok) throw new Error(`Amp request failed: HTTP ${res.status}`)
  return parseFreeTierHTML(await res.text())
}

async function read(options = {}) {
  const cookie = Object.prototype.hasOwnProperty.call(options, 'cookie')
    ? sessionCookieHeader(options.cookie)
    : resolveCookie()
  if (cookie) {
    try {
      return await fetchWeb(cookie, options.fetch || fetch)
    } catch (err) {
      return { connected: false, error: err && err.message ? err.message : String(err) }
    }
  }

  const bin = resolveAmp()
  if (!bin) return { connected: false }
  const r = await runUsage(bin)
  if (!r.ok) {
    // "Not signed in" surfaces as a non-zero exit — treat as disconnected.
    return { connected: false, error: r.error }
  }
  const balanceMatch = r.out.match(/\$([\d,]+(?:\.\d+)?)\s+remaining/i)
  const emailMatch = r.out.match(/Signed in as\s+([^\s]+)/i)
  if (!balanceMatch) return { connected: false, error: 'Could not parse balance' }
  const balance = Number(balanceMatch[1].replace(/,/g, ''))
  return {
    connected: true,
    source: 'Amp CLI',
    balance,
    email: emailMatch ? emailMatch[1] : '',
    lastActive: Date.now(),
  }
}

module.exports = {
  read,
  _private: {
    normalizeCookieHeader,
    sessionCookieHeader,
    extractObject,
    parseFreeTierHTML,
    fetchWeb,
    resolveAmp,
  },
}
