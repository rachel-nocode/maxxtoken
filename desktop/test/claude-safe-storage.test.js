const test = require('node:test')
const assert = require('node:assert')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const auth = require('../lib/claude-desktop-auth')
const safeStorage = require('../lib/claude-safe-storage')

const ACCOUNT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-claude-safe-storage-'))
}

function writeDesktopCache(home, password = 'fixture-password') {
  const cacheKey = `acct:${ACCOUNT_ID}|cccccccc-cccc-4ccc-8ccc-cccccccccccc:${ORGANIZATION_ID}:https://api.anthropic.com:user:profile user:inference`
  const plaintext = Buffer.from(JSON.stringify({
    [cacheKey]: { token: 'fixture-token', expiresAt: Date.now() + 3600000 },
  }))
  const key = auth.deriveKey(password)
  const cipher = crypto.createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
  const encrypted = Buffer.concat([Buffer.from('v10'), cipher.update(plaintext), cipher.final()])
  const root = path.join(home, 'Library', 'Application Support', 'Claude')
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({
    lastKnownAccountUuid: ACCOUNT_ID,
    'oauth:tokenCacheV2': encrypted.toString('base64'),
  }))
}

function load(home, execFileSync) {
  return auth.loadDesktopCredential({
    home,
    accountId: ACCOUNT_ID,
    organizationId: ORGANIZATION_ID,
    execFileSync,
  })
}

test('approved Claude Safe Storage key is reused by a recreated worker without another Keychain read', () => {
  const home = tempHome()
  writeDesktopCache(home)
  safeStorage.setKeyStore({})
  let reads = 0
  const first = load(home, (_command, args) => {
    reads += 1
    assert.deepEqual(args, ['find-generic-password', '-w', '-s', 'Claude Safe Storage', '-a', 'Claude Key'])
    return 'fixture-password\n'
  })
  assert.equal(first.data.claudeAiOauth.accessToken, 'fixture-token')
  assert.equal(reads, 1)

  const persisted = safeStorage.takeDiscoveredKeys()
  assert.match(persisted['Claude Safe Storage'].key, /^[A-Za-z0-9+/]+=*$/)
  safeStorage.setKeyStore(persisted)
  const second = load(home, () => {
    throw new Error('must not touch Keychain')
  })
  assert.equal(second.data.claudeAiOauth.accessToken, 'fixture-token')
  assert.equal(reads, 1)
})

test('a denied or unavailable Keychain read backs off across recreated workers', () => {
  const home = tempHome()
  writeDesktopCache(home)
  safeStorage.setKeyStore({})
  let reads = 0
  assert.equal(load(home, () => {
    reads += 1
    const error = new Error('denied')
    error.status = 128
    throw error
  }), null)
  assert.equal(reads, 1)

  const persisted = safeStorage.takeDiscoveredKeys()
  assert.ok(persisted['Claude Safe Storage'].declinedUntil > Date.now())
  safeStorage.setKeyStore(persisted)
  assert.equal(load(home, () => {
    reads += 1
    return 'fixture-password'
  }), null)
  assert.equal(reads, 1)
})

test('a timed-out prompt records a shorter cooldown and does not immediately re-prompt', () => {
  const home = tempHome()
  writeDesktopCache(home)
  const now = Date.now()
  safeStorage.setKeyStore({})
  assert.equal(auth.loadDesktopCredential({
    home,
    accountId: ACCOUNT_ID,
    organizationId: ORGANIZATION_ID,
    now,
    execFileSync: () => {
      const error = new Error('timed out')
      error.code = 'ETIMEDOUT'
      throw error
    },
  }), null)
  const entry = safeStorage.takeDiscoveredKeys()['Claude Safe Storage']
  assert.equal(entry.declinedUntil, now + safeStorage._private.RETRY_COOLDOWN_MS)
})

test('the pre-prompt cooldown is reported before the blocking Keychain read starts', () => {
  const home = tempHome()
  writeDesktopCache(home)
  const updates = []
  safeStorage.setKeyStore({})
  safeStorage.setDiscoveryListener((_service, entry) => updates.push(entry))
  const loaded = load(home, () => {
    assert.equal(updates.length, 1)
    assert.ok(updates[0].declinedUntil > Date.now())
    return 'fixture-password'
  })
  safeStorage.setDiscoveryListener(null)
  assert.ok(loaded)
  assert.equal(typeof updates[1].key, 'string')
})

test('invalid or irrelevant desktop caches never touch the Keychain', () => {
  const home = tempHome()
  const root = path.join(home, 'Library', 'Application Support', 'Claude')
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({
    lastKnownAccountUuid: ACCOUNT_ID,
    'oauth:tokenCacheV2': 'not-an-encrypted-cache',
  }))
  safeStorage.setKeyStore({})
  let reads = 0
  assert.equal(load(home, () => { reads += 1; return 'fixture-password' }), null)
  assert.equal(reads, 0)
})

test('an invalid persisted derived key fails closed without reopening Keychain', () => {
  const home = tempHome()
  writeDesktopCache(home)
  safeStorage.setKeyStore({
    'Claude Safe Storage': { key: Buffer.alloc(16, 9).toString('base64') },
  })
  let reads = 0
  assert.equal(load(home, () => { reads += 1; return 'fixture-password' }), null)
  assert.equal(reads, 0)
})

test('standalone unmanaged auth never opens a Keychain prompt it cannot persist', () => {
  const home = tempHome()
  writeDesktopCache(home)
  const authPath = require.resolve('../lib/claude-desktop-auth')
  const storagePath = require.resolve('../lib/claude-safe-storage')
  delete require.cache[authPath]
  delete require.cache[storagePath]
  const unmanagedAuth = require('../lib/claude-desktop-auth')
  let reads = 0
  const loaded = unmanagedAuth.loadDesktopCredential({
    home,
    accountId: ACCOUNT_ID,
    organizationId: ORGANIZATION_ID,
    execFileSync: () => { reads += 1; return 'fixture-password' },
  })
  assert.equal(loaded, null)
  assert.equal(reads, 0)
})
