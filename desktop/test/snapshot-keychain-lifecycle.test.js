const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function workerFixture(snapshot, readPassword) {
  const auth = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/claude-safe-storage.js'), 'utf8'), {
    module: auth, Buffer,
    require: (id) => id === 'child_process' ? { execFileSync: readPassword } : require(id),
  })
  const handlers = {}
  const messages = []
  const dependencies = {
    './logger': { info() {}, error() {}, setLevel() {} },
    './aggregate': { snapshot: () => snapshot(auth.exports) },
    './secrets': { setProcessOverride() {}, getProxyCredentials() {} },
    './browser-cookies': { setBrowserKeyStore() {}, takeDiscoveredKeys: () => ({}) },
    './claude-safe-storage': auth.exports,
    './config': { loadConfig: () => ({}) },
    './http': { configureProxy() {} },
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/snapshot-worker.js'), 'utf8'), {
    require: (id) => {
      assert.ok(Object.hasOwn(dependencies, id), `Unexpected worker dependency ${id}`)
      return dependencies[id]
    },
    process: {
      env: {}, connected: true,
      on: (event, handler) => { handlers[event] = handler },
      send: (message) => messages.push(JSON.parse(JSON.stringify(message))),
    },
  })
  return {
    messages,
    run: (browserKeys = {}) => handlers.message({ type: 'snapshot', requestId: 7, browserKeys }),
  }
}

test('worker reports approved key before snapshot completes and a fresh worker reuses it', async () => {
  let complete
  let reads = 0
  const first = workerFixture((auth) => {
    assert.equal(auth.derivedKey().length, 16)
    return new Promise((resolve) => { complete = resolve })
  }, () => { reads += 1; return 'fixture-password' })
  const pending = first.run()
  assert.equal(reads, 1)
  assert.equal(first.messages.some((message) => message.type === 'snapshot-result'), false)
  const approved = first.messages.find((message) => message.keys?.['Claude Safe Storage']?.key)
  assert.ok(approved)
  assert.equal(approved.type, 'keychain-key-update')
  assert.equal(approved.requestId, 7)
  const second = workerFixture((auth) => {
    assert.equal(auth.derivedKey().toString('base64'), approved.keys['Claude Safe Storage'].key)
    return { providers: [] }
  }, () => { throw new Error('A new worker must not read Keychain again') })
  await second.run(approved.keys)
  assert.equal(second.messages.at(-1).ok, true)
  assert.equal(second.messages.filter((message) => message.type === 'keychain-key-update').length, 0)
  complete({ providers: [] })
  await pending
})

test('denied access is reported even when the remainder of the snapshot fails', async () => {
  const first = workerFixture((auth) => {
    assert.equal(auth.derivedKey(), null)
    throw new Error('Unrelated provider failed')
  }, () => { throw new Error('Fixture access denied') })
  await first.run()
  const declined = first.messages.filter((message) => message.type === 'keychain-key-update').at(-1)
  assert.ok(declined.keys['Claude Safe Storage'].declinedUntil > Date.now())
  assert.equal(first.messages.at(-1).ok, false)
  const second = workerFixture((auth) => {
    assert.equal(auth.derivedKey(), null)
    return { providers: [] }
  }, () => { throw new Error('Denied access must survive the failed snapshot') })
  await second.run(declined.keys)
  assert.equal(second.messages.at(-1).ok, true)
  assert.equal(second.messages.filter((message) => message.type === 'keychain-key-update').length, 0)
})
