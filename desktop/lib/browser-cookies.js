// Shared browser-cookie reader. Pulls session cookies for a given set of hosts
// straight out of the local browser cookie stores so cookie-authenticated
// providers (OpenCode Go, Perplexity, …) work zero-paste — the user is already
// logged into the site in a browser, so there is nothing to copy.
//
// Encryption: modern Chromium browsers (Chrome/Brave/Edge/Arc) store the cookie
// body in `encrypted_value` (AES-128-CBC, key derived from a per-browser
// "Safe Storage" password in the login Keychain) and leave `value` empty. We
// decrypt those (see decryptChromiumValue) plus read plaintext Firefox values.
// First Keychain access prompts macOS to allow this app — one-time per browser.
// Saved-key / env paste remain the fallback if Keychain access is declined.

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

// Every Chromium-family browser uses the same cookie store format and the same
// "<Product> Safe Storage" macOS Keychain item for the AES key — so supporting a
// new one is just another row here: [label, AppSupport-relative root, services].
// `services` is an ordered list of candidate Keychain service names; we try each
// until one returns a password (a wrong guess fast-fails as "item not found"
// with no prompt, so listing extras for browsers whose exact name we can't
// verify, e.g. ChatGPT Atlas, degrades gracefully instead of breaking).
const CHROMIUM_BROWSERS = [
  ['Chrome', 'Google/Chrome', ['Chrome Safe Storage']],
  ['Chrome Beta', 'Google/Chrome Beta', ['Chrome Safe Storage']],
  ['Chrome Dev', 'Google/Chrome Dev', ['Chrome Safe Storage']],
  ['Chrome Canary', 'Google/Chrome Canary', ['Chromium Safe Storage']],
  ['Chromium', 'Chromium', ['Chromium Safe Storage']],
  ['Brave', 'BraveSoftware/Brave-Browser', ['Brave Safe Storage']],
  ['Brave Beta', 'BraveSoftware/Brave-Browser-Beta', ['Brave Safe Storage']],
  ['Brave Nightly', 'BraveSoftware/Brave-Browser-Nightly', ['Brave Safe Storage']],
  ['Microsoft Edge', 'Microsoft Edge', ['Microsoft Edge Safe Storage']],
  ['Edge Beta', 'Microsoft Edge Beta', ['Microsoft Edge Safe Storage']],
  ['Edge Dev', 'Microsoft Edge Dev', ['Microsoft Edge Safe Storage']],
  ['Arc', 'Arc/User Data', ['Arc Safe Storage']],
  ['Dia', 'Dia/User Data', ['Dia Safe Storage']],
  ['Vivaldi', 'Vivaldi', ['Vivaldi Safe Storage']],
  ['Opera', 'com.operasoftware.Opera', ['Opera Safe Storage']],
  ['Opera GX', 'com.operasoftware.OperaGX', ['Opera Safe Storage']],
  ['Opera Neon', 'com.operasoftware.OperaNeon', ['Opera Safe Storage']],
  ['Comet', 'Comet', ['Comet Safe Storage']],
  // ChatGPT Atlas (OpenAI) — exact bundle dir / Keychain name unverified, so we
  // probe the likely roots and service names; the misses cost nothing.
  ['ChatGPT Atlas', 'Atlas', ['Atlas Safe Storage', 'ChatGPT Safe Storage']],
  ['ChatGPT Atlas', 'com.openai.atlas', ['Atlas Safe Storage', 'ChatGPT Safe Storage']],
  ['ChatGPT Atlas', 'ChatGPT/Atlas', ['Atlas Safe Storage', 'ChatGPT Safe Storage']],
]

// Cache derived AES keys per Keychain service (and remember failures as null so
// a declined prompt isn't re-triggered on every cookie row).
const chromiumKeyCache = new Map()

// Keys/declines injected by the main process from its persistent encrypted
// store. The snapshot worker is a short-lived fork, so without this it would
// re-run `security` (and re-trigger the macOS Keychain prompt) on every refresh.
// With it, the worker only ever hits the Keychain for a service it has never
// successfully read — once, then the main process persists the result.
let injectedServices = {}
// Keys/declines discovered during THIS process run, reported back to main so it
// can persist them (holds the derived key so a future run skips the Keychain).
const discoveredKeys = {}
const DECLINE_TTL_MS = 24 * 60 * 60 * 1000
// A timed-out Keychain prompt is NOT a decline — the dialog was shown but not
// answered in time. Back off only briefly so a refresh right after the user
// grants access retries soon, instead of silently never tracking for a day.
const RETRY_COOLDOWN_MS = 10 * 60 * 1000
// Long enough for a human to answer a surprise "Safe Storage" password dialog
// (the 4s we used before killed `security` before they could type → ETIMEDOUT
// → no key → cookie-auth providers like OpenCode Go never connected).
const KEYCHAIN_TIMEOUT_MS = 15000

// Seed the cache with persisted keys/declines (called in the worker on startup).
function setBrowserKeyStore(map) {
  injectedServices = map && typeof map === 'object' ? map : {}
}

// Hand back anything derived this run (called after a snapshot to persist).
function takeDiscoveredKeys() {
  return { ...discoveredKeys }
}

// A browser may carry several candidate Keychain service names (we can't always
// know the exact one). Try each in order and return the first key found; a wrong
// candidate fast-fails as "item not found" without prompting. Accepts a single
// string too, so existing callers/tests keep working.
function chromiumKey(serviceOrList) {
  const services = Array.isArray(serviceOrList) ? serviceOrList : [serviceOrList]
  for (const service of services) {
    const key = chromiumKeyOne(service)
    if (key) return key
  }
  return null
}

// Derive the AES key for a browser's encrypted cookies from its Keychain
// "Safe Storage" password: PBKDF2-HMAC-SHA1(password, "saltysalt", 1003, 16).
function chromiumKeyOne(service) {
  if (!service) return null
  if (chromiumKeyCache.has(service)) return chromiumKeyCache.get(service)

  // Prefer a persisted key/decline before ever touching the Keychain — this is
  // what stops the repeated "Safe Storage" prompt across worker restarts.
  const persisted = injectedServices[service]
  if (persisted && persisted.key) {
    const key = Buffer.from(persisted.key, 'base64')
    chromiumKeyCache.set(service, key)
    return key
  }
  if (persisted && persisted.declinedUntil && persisted.declinedUntil > Date.now()) {
    chromiumKeyCache.set(service, null)
    return null
  }

  let key = null
  try {
    const password = execFileSync('security', ['find-generic-password', '-ws', service], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: KEYCHAIN_TIMEOUT_MS,
    }).trim()
    if (password) {
      key = crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1')
      discoveredKeys[service] = { key: key.toString('base64') }
    } else {
      // Item exists but empty — treat as a decline so we don't loop.
      discoveredKeys[service] = { declinedUntil: Date.now() + DECLINE_TTL_MS }
    }
  } catch (err) {
    // ETIMEDOUT means the prompt was shown but unanswered — transient, retry
    // soon. A real "missing item / access denied" backs off for the full day.
    const timedOut = err && (err.code === 'ETIMEDOUT' || err.killed)
    discoveredKeys[service] = {
      declinedUntil: Date.now() + (timedOut ? RETRY_COOLDOWN_MS : DECLINE_TTL_MS),
    }
  }
  chromiumKeyCache.set(service, key)
  return key
}

// Decrypt one Chromium `encrypted_value` (hex). Format: "v10"/"v11" prefix +
// AES-128-CBC ciphertext, IV = 16 spaces. Chrome 130+ prepends the SHA-256 of
// the cookie host to the plaintext, which we strip when present.
function decryptChromiumValue(encHex, key, host) {
  if (!encHex || !key) return null
  try {
    const buf = Buffer.from(encHex, 'hex')
    const prefix = buf.slice(0, 3).toString('latin1')
    if (prefix !== 'v10' && prefix !== 'v11') return null
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
    let out = Buffer.concat([decipher.update(buf.slice(3)), decipher.final()])
    if (host && out.length >= 32) {
      const hostHash = crypto.createHash('sha256').update(host).digest()
      if (out.slice(0, 32).equals(hostHash)) out = out.slice(32)
    }
    return out.toString('utf8') || null
  } catch {
    /* wrong key (declined Keychain) or unsupported scheme */
    return null
  }
}

function browserCookieFiles(home = os.homedir()) {
  const appSupport = path.join(home, 'Library/Application Support')
  const files = []
  for (const [label, rel, services] of CHROMIUM_BROWSERS) {
    const root = path.join(appSupport, rel)
    try {
      for (const profile of fs.readdirSync(root)) {
        for (const sub of ['Cookies', 'Network/Cookies']) {
          const file = path.join(root, profile, sub)
          if (fs.existsSync(file)) files.push({ file, label: `${label} ${profile}`, keychainService: services })
        }
      }
    } catch {
      /* best effort — browser not installed */
    }
  }

  const firefoxRoot = path.join(home, 'Library/Application Support/Firefox/Profiles')
  try {
    for (const profile of fs.readdirSync(firefoxRoot)) {
      const file = path.join(firefoxRoot, profile, 'cookies.sqlite')
      if (fs.existsSync(file)) files.push({ file, label: `Firefox ${profile}`, keychainService: null })
    }
  } catch {
    /* best effort */
  }

  const seen = new Set()
  return files.filter((entry) => {
    if (seen.has(entry.file)) return false
    seen.add(entry.file)
    return true
  })
}

function sqliteQuery(file, query) {
  try {
    return execFileSync('sqlite3', ['-separator', '\t', `file:${file}?mode=ro`, query], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    })
  } catch {
    return ''
  }
}

function parseCookieRows(output, label = 'Browser') {
  const rows = []
  for (const line of String(output || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const [host, cookiePath, name, value] = line.split('\t')
    if (!host || !name || !value) continue
    rows.push({ host, path: cookiePath || '/', name, value, label })
  }
  return rows
}

// Chromium rows carry both `value` (plaintext, usually empty) and
// `hex(encrypted_value)`; decrypt the latter when the former is empty.
function parseChromiumRows(output, label, service) {
  const key = chromiumKey(service)
  const rows = []
  for (const line of String(output || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const [host, cookiePath, name, value, encHex] = line.split('\t')
    if (!host || !name) continue
    const resolved = value || decryptChromiumValue(encHex, key, host)
    if (!resolved) continue
    rows.push({ host, path: cookiePath || '/', name, value: resolved, label })
  }
  return rows
}

function cookieHeaderFromRecords(records) {
  const deduped = new Map()
  for (const row of records) {
    if (!row.name || !row.value) continue
    deduped.set(`${row.name}|${row.host}|${row.path}`, `${row.name}=${row.value}`)
  }
  return [...deduped.values()].join('; ')
}

// Return one { cookieHeader, sourceLabel } per browser store that has cookies
// for `hosts`. When `cookieNames` is supplied, a store only counts if it holds
// at least one of those named session cookies (avoids shipping junk headers).
function cookieSessionsForHosts({ hosts, cookieNames = null, home = os.homedir(), files = null } = {}) {
  const hostList = (hosts || []).filter(Boolean)
  if (!hostList.length) return []
  const nameSet = cookieNames ? new Set(cookieNames.map((n) => n.toLowerCase())) : null
  const sources = files || browserCookieFiles(home)
  const sessions = []
  const seenHeaders = new Set()

  const chromiumClause = hostList.map((h) => `host_key like '%${h}%'`).join(' or ')
  const firefoxClause = hostList.map((h) => `host like '%${h}%'`).join(' or ')

  for (const entry of sources) {
    const file = typeof entry === 'string' ? entry : entry.file
    const label = typeof entry === 'string' ? 'Browser' : entry.label
    const service = typeof entry === 'string' ? null : entry.keychainService
    const firefox = file.endsWith('cookies.sqlite')
    const rows = firefox
      ? parseCookieRows(
          sqliteQuery(file, `select host, path, name, value from moz_cookies where (${firefoxClause}) and value != '';`),
          label,
        )
      : parseChromiumRows(
          sqliteQuery(file, `select host_key, path, name, value, hex(encrypted_value) from cookies where (${chromiumClause});`),
          label,
          service,
        )
    if (!rows.length) continue
    if (nameSet && !rows.some((row) => nameSet.has(row.name.toLowerCase()))) continue
    const header = cookieHeaderFromRecords(rows)
    if (!header || seenHeaders.has(header)) continue
    seenHeaders.add(header)
    sessions.push({ cookieHeader: header, sourceLabel: label })
  }
  return sessions
}

// Convenience: first matching cookie header string, or null.
function readCookieHeader(options = {}) {
  const session = cookieSessionsForHosts(options)[0]
  return session ? session.cookieHeader : null
}

module.exports = {
  browserCookieFiles,
  cookieSessionsForHosts,
  readCookieHeader,
  setBrowserKeyStore,
  takeDiscoveredKeys,
  _private: { sqliteQuery, parseCookieRows, parseChromiumRows, cookieHeaderFromRecords, decryptChromiumValue, chromiumKey },
}
