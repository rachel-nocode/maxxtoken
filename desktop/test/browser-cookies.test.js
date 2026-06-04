const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const test = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { cookieSessionsForHosts, readCookieHeader, _private } = require('../lib/browser-cookies')
const { parseCookieRows, cookieHeaderFromRecords } = _private

test('parseCookieRows splits tab-separated sqlite output', () => {
  const out = 'opencode.ai\t/\tauth\tABC\n.opencode.ai\t/\t__Host-auth\tXYZ\n\nbad\n'
  const rows = parseCookieRows(out, 'Chrome Default')
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { host: 'opencode.ai', path: '/', name: 'auth', value: 'ABC', label: 'Chrome Default' })
})

test('cookieHeaderFromRecords dedupes by name|host|path', () => {
  const header = cookieHeaderFromRecords([
    { name: 'auth', host: 'opencode.ai', path: '/', value: 'A' },
    { name: 'auth', host: 'opencode.ai', path: '/', value: 'A' },
    { name: 'sid', host: 'opencode.ai', path: '/', value: 'B' },
  ])
  assert.equal(header, 'auth=A; sid=B')
})

test('decryptMacChromiumCookie reads v10 AES-CBC cookie values on macOS', () => {
  const password = 'test safe storage password'
  const host = 'opencode.ai'
  const key = crypto.pbkdf2Sync(password, Buffer.from('saltysalt'), 1003, 16, 'sha1')
  const hostBoundValue = Buffer.concat([crypto.createHash('sha256').update(host).digest(), Buffer.from('auth-cookie-value')])
  const cipher = crypto.createCipheriv('aes-128-cbc', key, Buffer.from(' '.repeat(16)))
  const encrypted = Buffer.concat([Buffer.from('v10'), cipher.update(hostBoundValue), cipher.final()])

  if (process.platform === 'darwin') {
    assert.equal(_private.decryptMacChromiumCookie(encrypted.toString('hex'), password, host), 'auth-cookie-value')
  } else {
    assert.equal(_private.decryptMacChromiumCookie(encrypted.toString('hex'), password, host), '')
  }
})

test('readCookieHeader returns null when no hosts given', () => {
  assert.equal(readCookieHeader({ hosts: [] }), null)
})

test('cookieSessionsForHosts reads a Chromium-style cookie DB', (t) => {
  // Skip gracefully if sqlite3 CLI is unavailable on this machine.
  try {
    execFileSync('sqlite3', ['--version'], { stdio: 'ignore' })
  } catch {
    t.skip('sqlite3 not available')
    return
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxx-cookies-'))
  const dbFile = path.join(dir, 'Cookies')
  execFileSync('sqlite3', [
    dbFile,
    "CREATE TABLE cookies (host_key TEXT, path TEXT, name TEXT, value TEXT, encrypted_value BLOB);" +
    "INSERT INTO cookies VALUES ('opencode.ai','/','auth','tok123',x'');" +
    "INSERT INTO cookies VALUES ('.opencode.ai','/','__Host-auth','host456',x'');" +
    "INSERT INTO cookies VALUES ('other.com','/','junk','nope',x'');",
  ])

  const sessions = cookieSessionsForHosts({
    hosts: ['opencode.ai'],
    cookieNames: ['auth', '__Host-auth'],
    files: [{ file: dbFile, label: 'Chrome Default' }],
  })
  fs.rmSync(dir, { recursive: true, force: true })

  assert.equal(sessions.length, 1)
  assert.match(sessions[0].cookieHeader, /auth=tok123/)
  assert.match(sessions[0].cookieHeader, /__Host-auth=host456/)
  assert.doesNotMatch(sessions[0].cookieHeader, /junk/)
})

test('cookieSessionsForHosts honors cookieNames gate', (t) => {
  try {
    execFileSync('sqlite3', ['--version'], { stdio: 'ignore' })
  } catch {
    t.skip('sqlite3 not available')
    return
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxx-cookies-'))
  const dbFile = path.join(dir, 'Cookies')
  execFileSync('sqlite3', [
    dbFile,
    "CREATE TABLE cookies (host_key TEXT, path TEXT, name TEXT, value TEXT, encrypted_value BLOB);" +
    "INSERT INTO cookies VALUES ('opencode.ai','/','marketing','x',x'');",
  ])
  const sessions = cookieSessionsForHosts({
    hosts: ['opencode.ai'],
    cookieNames: ['auth', '__Host-auth'],
    files: [{ file: dbFile, label: 'Chrome Default' }],
  })
  fs.rmSync(dir, { recursive: true, force: true })
  assert.equal(sessions.length, 0) // no session cookie -> rejected
})
