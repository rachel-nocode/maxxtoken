// Shared browser-cookie reader. Pulls session cookies for a given set of hosts
// straight out of the local browser cookie stores so cookie-authenticated
// providers (OpenCode Go, Perplexity, …) work zero-paste — the user is already
// logged into the site in a browser, so there is nothing to copy.
//
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const MAC_CHROMIUM_SALT = Buffer.from('saltysalt')
const MAC_CHROMIUM_IV = Buffer.from(' '.repeat(16))
const keychainCache = new Map()

function browserCookieFiles(home = os.homedir()) {
  const roots = [
    ['Chrome', path.join(home, 'Library/Application Support/Google/Chrome')],
    ['Chrome Beta', path.join(home, 'Library/Application Support/Google/Chrome Beta')],
    ['Chrome Canary', path.join(home, 'Library/Application Support/Google/Chrome Canary')],
    ['Brave', path.join(home, 'Library/Application Support/BraveSoftware/Brave-Browser')],
    ['Microsoft Edge', path.join(home, 'Library/Application Support/Microsoft Edge')],
    ['Arc', path.join(home, 'Library/Application Support/Arc/User Data')],
    ['Dia', path.join(home, 'Library/Application Support/Dia/User Data')],
    ['Vivaldi', path.join(home, 'Library/Application Support/Vivaldi')],
  ]
  const files = []
  for (const [label, root] of roots) {
    try {
      for (const profile of fs.readdirSync(root)) {
        for (const rel of ['Cookies', 'Network/Cookies']) {
          const file = path.join(root, profile, rel)
          if (fs.existsSync(file)) files.push({ file, label: `${label} ${profile}` })
        }
      }
    } catch {
      /* best effort */
    }
  }

  const firefoxRoot = path.join(home, 'Library/Application Support/Firefox/Profiles')
  try {
    for (const profile of fs.readdirSync(firefoxRoot)) {
      const file = path.join(firefoxRoot, profile, 'cookies.sqlite')
      if (fs.existsSync(file)) files.push({ file, label: `Firefox ${profile}` })
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

function macSafeStorageService(label = '') {
  if (label.startsWith('Dia')) return 'Dia Safe Storage'
  if (label.startsWith('Arc')) return 'Arc Safe Storage'
  if (label.startsWith('Brave')) return 'Brave Safe Storage'
  if (label.startsWith('Microsoft Edge')) return 'Microsoft Edge Safe Storage'
  if (label.startsWith('Vivaldi')) return 'Vivaldi Safe Storage'
  if (label.startsWith('Chrome')) return 'Chrome Safe Storage'
  return null
}

function macSafeStoragePassword(service) {
  if (!service || process.platform !== 'darwin') return null
  if (keychainCache.has(service)) return keychainCache.get(service)
  let password = null
  try {
    password = execFileSync('security', ['find-generic-password', '-w', '-s', service], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    }).trim()
  } catch {
    password = null
  }
  keychainCache.set(service, password)
  return password
}

function decryptMacChromiumCookie(hexValue, password, host = '') {
  if (!hexValue || !password || process.platform !== 'darwin') return ''
  let encrypted
  try {
    encrypted = Buffer.from(String(hexValue), 'hex')
  } catch {
    return ''
  }
  if (!encrypted.length) return ''
  const payload = encrypted.subarray(0, 3).toString() === 'v10' || encrypted.subarray(0, 3).toString() === 'v11'
    ? encrypted.subarray(3)
    : encrypted
  try {
    const key = crypto.pbkdf2Sync(password, MAC_CHROMIUM_SALT, 1003, 16, 'sha1')
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, MAC_CHROMIUM_IV)
    let decrypted = Buffer.concat([decipher.update(payload), decipher.final()])
    const hostHash = host ? crypto.createHash('sha256').update(String(host)).digest() : null
    if (hostHash && decrypted.length > hostHash.length && decrypted.subarray(0, hostHash.length).equals(hostHash)) {
      decrypted = decrypted.subarray(hostHash.length)
    }
    return decrypted.toString('utf8')
  } catch {
    return ''
  }
}

function parseCookieRows(output, label = 'Browser', decryptValue = null) {
  const rows = []
  for (const line of String(output || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const [host, cookiePath, name, value, encryptedHex] = line.split('\t')
    const cookieValue = value || (typeof decryptValue === 'function' ? decryptValue(encryptedHex, host) : '')
    if (!host || !name || !cookieValue) continue
    rows.push({ host, path: cookiePath || '/', name, value: cookieValue, label })
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
    const firefox = file.endsWith('cookies.sqlite')
    const password = firefox ? null : macSafeStoragePassword(macSafeStorageService(label))
    const query = firefox
      ? `select host, path, name, value from moz_cookies where (${firefoxClause}) and value != '';`
      : `select host_key, path, name, value, hex(encrypted_value) from cookies where (${chromiumClause}) and (value != '' or length(encrypted_value) > 0);`
    const rows = parseCookieRows(
      sqliteQuery(file, query),
      label,
      password ? (encryptedHex, host) => decryptMacChromiumCookie(encryptedHex, password, host) : null,
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
  _private: { sqliteQuery, parseCookieRows, cookieHeaderFromRecords, decryptMacChromiumCookie, macSafeStorageService },
}
