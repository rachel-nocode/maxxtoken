const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')

function loadStore(root, encryptionAvailable = true) {
  const source = fs.readFileSync(path.join(__dirname, '../lib/browser-keys-store.js'), 'utf8')
  const module = { exports: {} }
  const safeStorage = {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (text) => Buffer.from(text).map((byte) => byte ^ 0xa5),
    decryptString: (buffer) => Buffer.from(buffer).map((byte) => byte ^ 0xa5).toString('utf8'),
  }
  vm.runInNewContext(source, {
    module,
    require: (id) => {
      if (id === 'electron') return { app: { getPath: () => root }, safeStorage }
      return require(id)
    },
  })
  return module.exports
}

test('derived Claude key cache is encrypted on disk and survives a store reload', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-key-store-'))
  const entry = {
    'Claude Safe Storage': { key: Buffer.alloc(16, 7).toString('base64') },
  }
  assert.equal(loadStore(root).saveAll(entry), true)
  const raw = fs.readFileSync(path.join(root, 'browser-keys.bin'))
  assert.equal(raw.includes(Buffer.from('Claude Safe Storage')), false)
  assert.equal(raw.includes(Buffer.from(entry['Claude Safe Storage'].key)), false)
  assert.deepEqual(JSON.parse(JSON.stringify(loadStore(root).loadAll())), entry)
  assert.equal(fs.statSync(path.join(root, 'browser-keys.bin')).mode & 0o777, 0o600)
})

test('key cache fails closed when Electron encryption is unavailable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-key-store-'))
  const store = loadStore(root, false)
  assert.equal(store.saveAll({ 'Claude Safe Storage': { key: 'fixture-key' } }), false)
  assert.deepEqual(JSON.parse(JSON.stringify(store.loadAll())), {})
  assert.equal(fs.existsSync(path.join(root, 'browser-keys.bin')), false)
})
