// Verifies the persisted-key injection that stops the repeated macOS Keychain
// "Safe Storage" prompt: an injected key/decline must be used WITHOUT shelling
// out to `security`, and freshly-derived results must be reported back.
const test = require('node:test')
const assert = require('node:assert')

const cookies = require('../lib/browser-cookies')
const { chromiumKey } = cookies._private

test('injected key is used without touching the Keychain', () => {
  const service = 'Test-Injected Safe Storage'
  const fakeKey = Buffer.alloc(16, 7)
  cookies.setBrowserKeyStore({ [service]: { key: fakeKey.toString('base64') } })
  const key = chromiumKey(service)
  assert.ok(key, 'expected a key back')
  assert.strictEqual(key.toString('base64'), fakeKey.toString('base64'))
  // It must not have been re-derived this run (nothing to report back).
  assert.strictEqual(cookies.takeDiscoveredKeys()[service], undefined)
})

test('a live decline is honored and short-circuits the Keychain', () => {
  const service = 'Test-Declined Safe Storage'
  cookies.setBrowserKeyStore({ [service]: { declinedUntil: Date.now() + 60_000 } })
  assert.strictEqual(chromiumKey(service), null)
  assert.strictEqual(cookies.takeDiscoveredKeys()[service], undefined)
})
