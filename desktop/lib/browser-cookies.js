// Shared browser-cookie reader. Pulls session cookies for a given set of hosts
// straight out of the local browser cookie stores so cookie-authenticated
// providers (OpenCode Go, Perplexity, …) work zero-paste — the user is already
// logged into the site in a browser, so there is nothing to copy.
//
// Note on encryption: modern Chromium browsers (Chrome/Brave/Edge/Arc) store
// the cookie body in `encrypted_value` (AES, key in the login Keychain) and
// leave the `value` column empty. We read `value` only — so this resolves real
// headers from Firefox and any browser keeping plaintext values, and quietly
// yields nothing for encrypted Chromium stores. Same behaviour as the existing
// Cursor adapter; saved-key / env paste remain the fallback.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

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
    const query = firefox
      ? `select host, path, name, value from moz_cookies where (${firefoxClause}) and value != '';`
      : `select host_key, path, name, value from cookies where (${chromiumClause}) and value != '';`
    const rows = parseCookieRows(sqliteQuery(file, query), label)
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
  _private: { sqliteQuery, parseCookieRows, cookieHeaderFromRecords },
}
