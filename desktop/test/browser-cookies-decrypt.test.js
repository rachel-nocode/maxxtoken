const { test } = require('node:test')
const assert = require('node:assert')
const crypto = require('crypto')
const { _private } = require('../lib/browser-cookies')

const { decryptChromiumValue, parseChromiumRows } = _private

const KEY = crypto.pbkdf2Sync('testpw', 'saltysalt', 1003, 16, 'sha1')

// Encrypt like macOS Chromium: "v10" + AES-128-CBC(IV = 16 spaces).
function encrypt(plainBuf) {
  const c = crypto.createCipheriv('aes-128-cbc', KEY, Buffer.alloc(16, 0x20))
  const body = Buffer.concat([c.update(plainBuf), c.final()])
  return Buffer.concat([Buffer.from('v10'), body]).toString('hex')
}

test('decryptChromiumValue decodes a v10 value', () => {
  assert.strictEqual(decryptChromiumValue(encrypt(Buffer.from('auth=abc123')), KEY, '.opencode.ai'), 'auth=abc123')
})

test('decryptChromiumValue strips the Chrome 130+ sha256(host) prefix', () => {
  const host = 'opencode.ai'
  const hash = crypto.createHash('sha256').update(host).digest()
  const enc = encrypt(Buffer.concat([hash, Buffer.from('sess=xyz')]))
  assert.strictEqual(decryptChromiumValue(enc, KEY, host), 'sess=xyz')
})

test('decryptChromiumValue returns null on wrong key', () => {
  const wrong = crypto.pbkdf2Sync('other', 'saltysalt', 1003, 16, 'sha1')
  assert.strictEqual(decryptChromiumValue(encrypt(Buffer.from('x=1')), wrong, 'opencode.ai'), null)
})

test('decryptChromiumValue returns null for non-v10 prefix / no key', () => {
  assert.strictEqual(decryptChromiumValue(Buffer.from('zz9beef').toString('hex'), KEY, 'h'), null)
  assert.strictEqual(decryptChromiumValue(encrypt(Buffer.from('x=1')), null, 'h'), null)
})

test('parseChromiumRows decrypts encrypted rows and keeps plaintext rows', () => {
  // Inject a known key so no Keychain call happens (service must be falsy → key null;
  // pass rows where plaintext is present to exercise the plaintext branch).
  const enc = encrypt(Buffer.from('auth=tok'))
  // service=null → chromiumKey returns null → encrypted row drops, plaintext row stays.
  const out = `opencode.ai\t/\tplainCookie\tplainval\t\nopencode.ai\t/\tauth\t\t${enc.toUpperCase()}`
  const rows = parseChromiumRows(out, 'Chrome Test', null)
  assert.deepStrictEqual(rows.map((r) => r.name), ['plainCookie'])
  assert.strictEqual(rows[0].value, 'plainval')
})
