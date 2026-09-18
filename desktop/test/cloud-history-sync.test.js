const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const sync = require('../lib/cloud-history-sync')

const NOW = Date.UTC(2026, 8, 17, 12)

function provider(id, day, total, options = {}) {
  return {
    id,
    providerFamily: id.split('@')[0],
    name: id,
    connected: true,
    tokenUsage: {
      source: options.source || 'local logs',
      total,
      dailyBreakdown: [{
        date: day,
        input: Math.floor(total / 2),
        cached: 0,
        output: total - Math.floor(total / 2),
        total,
        costUSD: options.costUSD,
        modelBreakdowns: [{ model: options.model || 'model-a', input: 0, cached: 0, output: total, total }],
      }],
    },
  }
}

test('sync documents contain only normalized usage and opaque ownership', () => {
  const providers = [
    { ...provider('claude@123456789abc', '2026-09-17', 100), accessToken: 'must-not-sync', rawLogs: ['private'] },
    provider('cursor', '2026-09-17', 900),
  ]
  providers[0].tokenUsage.rawTranscript = 'must-not-sync'
  const document = sync.buildHistoryDocument(providers, {
    deviceId: 'device_12345678',
    deviceName: 'Work Mac',
    now: NOW,
  })
  const text = JSON.stringify(document)
  assert.equal(document.accounts.length, 1)
  assert.equal(document.accounts[0].accountId, 'claude@123456789abc')
  assert.doesNotMatch(text, /accessToken|rawLogs|rawTranscript|must-not-sync|cursor/i)
})

test('peer history merges only matching account ownership and never Cursor', () => {
  const local = [
    provider('claude@aaaaaaaaaaaa', '2026-09-17', 100),
    provider('claude@bbbbbbbbbbbb', '2026-09-17', 200),
    provider('cursor', '2026-09-17', 300),
  ]
  const peer = sync.buildHistoryDocument([
    provider('claude@aaaaaaaaaaaa', '2026-09-17', 40),
    provider('claude@bbbbbbbbbbbb', '2026-09-17', 60),
    provider('cursor', '2026-09-17', 1000),
  ], { deviceId: 'peer_device_123', deviceName: 'Peer', now: NOW })

  const merged = sync.applyPeerHistory(local, [peer], { deviceId: 'local_device_123', now: NOW })
  assert.equal(merged[0].tokenUsage.total, 140)
  assert.equal(merged[1].tokenUsage.total, 260)
  assert.equal(merged[2].tokenUsage.total, 300)
})

test('newest document per device wins and model/day rows merge', () => {
  const old = sync.buildHistoryDocument([provider('codex@123456789abc', '2026-09-17', 10)], {
    deviceId: 'peer_device_123', deviceName: 'Peer', now: NOW - 1000,
  })
  const latest = sync.buildHistoryDocument([provider('codex@123456789abc', '2026-09-17', 25)], {
    deviceId: 'peer_device_123', deviceName: 'Peer', now: NOW,
  })
  const merged = sync.applyPeerHistory(
    [provider('codex@123456789abc', '2026-09-17', 5)],
    [old, latest],
    { deviceId: 'local_device_123', now: NOW },
  )
  assert.equal(merged[0].tokenUsage.total, 30)
  assert.equal(merged[0].tokenUsage.dailyBreakdown[0].modelBreakdowns[0].total, 30)
})

test('known and unknown costs preserve paired coverage and provenance', () => {
  const known = provider('claude@123456789abc', '2026-09-17', 100)
  Object.assign(known.tokenUsage.dailyBreakdown[0], {
    costUSD: 2,
    pricedCostUSD: 2,
    pricedTokens: 100,
    costAccuracy: 'estimate',
    pricingSource: 'built-in',
  })
  Object.assign(known.tokenUsage.dailyBreakdown[0].modelBreakdowns[0], {
    costUSD: 2,
    costAccuracy: 'estimate',
    pricingSource: 'built-in',
  })
  const unknown = provider('claude@123456789abc', '2026-09-17', 200, { model: 'custom-model' })
  unknown.tokenUsage.dailyBreakdown[0].unpricedModels = ['custom-model']
  const peer = sync.buildHistoryDocument([unknown], {
    deviceId: 'peer_device_123', deviceName: 'Peer', now: NOW,
  })
  const merged = sync.applyPeerHistory([known], [peer], { deviceId: 'local_device_123', now: NOW })[0]
  const day = merged.tokenUsage.dailyBreakdown[0]
  assert.equal(day.total, 300)
  assert.equal(day.costUSD, 2)
  assert.equal(day.pricedCostUSD, 2)
  assert.equal(day.pricedTokens, 100)
  assert.equal(day.unpricedTokens, 200)
  assert.equal(day.costCoverage, 'partial')
  assert.deepEqual(day.unpricedModels, ['custom-model'])
  assert.equal(day.pricingSource, 'built-in')
})

test('nested model arrays are ignored and oversized arrays are rejected', () => {
  const document = sync.buildHistoryDocument([provider('claude@123456789abc', '2026-09-17', 10)], {
    deviceId: 'peer_device_123', deviceName: 'Peer', now: NOW,
  })
  document.accounts[0].days[0].models[0].models = [{ model: 'nested', total: 999 }]
  const validated = sync.validateDocument(document)
  assert.equal(validated.accounts[0].days[0].models[0].models, undefined)

  document.accounts[0].days[0].models = Array.from({ length: 501 }, (_, index) => ({ model: `m${index}`, total: 1 }))
  assert.throws(() => sync.validateDocument(document), /too many model rows/)
})

test('disabling removes only this device and immediately clears peer contributions', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-sync-'))
  const rootDir = path.join(dir, 'Documents', 'MaxxToken', 'History', 'v1')
  fs.mkdirSync(path.join(dir, 'Documents'), { recursive: true })
  const fileStore = sync.createICloudFileStore({ rootDir, containerRoot: path.join(dir, 'Documents') })
  const local = [provider('claude@123456789abc', '2026-09-17', 10)]
  const peer = sync.buildHistoryDocument([provider('claude@123456789abc', '2026-09-17', 15)], {
    deviceId: 'peer_device_123', deviceName: 'Peer', now: NOW,
  })
  await fileStore.writeDocument(peer)
  const manager = sync.createHistorySync({
    platform: 'darwin', fileStore,
    deviceId: 'local_device_123', deviceName: 'Local',
    getProviders: () => local,
  })

  await manager.setEnabled(true)
  assert.equal(manager.mergeHistory(local)[0].tokenUsage.total, 25)
  await manager.setEnabled(false)
  assert.equal(manager.mergeHistory(local)[0].tokenUsage.total, 10)
  assert.equal(fs.existsSync(path.join(rootDir, 'local_device_123.json')), false)
  assert.equal(fs.existsSync(path.join(rootDir, 'peer_device_123.json')), true)
})

test('unsupported systems report the limitation without touching storage', async () => {
  let touched = false
  const manager = sync.createHistorySync({
    platform: 'win32', deviceId: 'local_device_123',
    fileStore: {
      writeDocument: async () => { touched = true },
      loadDocuments: async () => { touched = true },
      deleteDevice: async () => { touched = true },
    },
  })
  await manager.setEnabled(true)
  assert.equal(manager.getStatus().supported, false)
  assert.match(manager.getStatus().error, /only on macOS/)
  assert.equal(touched, false)
})

test('unchanged periodic checks reload peers without rewriting iCloud every minute', async () => {
  let writes = 0
  let loads = 0
  const documents = []
  const fileStore = {
    writeDocument: async (document) => {
      writes += 1
      documents.splice(0, documents.length, document)
    },
    loadDocuments: async () => { loads += 1; return { documents, invalidFiles: [] } },
    deleteDevice: async () => {},
  }
  const manager = sync.createHistorySync({
    platform: 'darwin', fileStore, writeIntervalMs: 300000,
    deviceId: 'local_device_123', deviceName: 'Local',
    getProviders: () => [provider('claude@123456789abc', '2026-09-17', 10)],
  })
  await manager.setEnabled(true)
  await manager.syncNow()
  assert.equal(writes, 1)
  assert.equal(loads, 2)
})

test('invalid synced files are ignored and surfaced in health status', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-sync-invalid-'))
  const rootDir = path.join(dir, 'Documents', 'MaxxToken', 'History', 'v1')
  fs.mkdirSync(rootDir, { recursive: true })
  fs.writeFileSync(path.join(rootDir, 'broken.json'), '{not json')
  const fileStore = sync.createICloudFileStore({ rootDir, containerRoot: path.join(dir, 'Documents') })
  const manager = sync.createHistorySync({
    platform: 'darwin', fileStore,
    deviceId: 'local_device_123', deviceName: 'Local',
    getProviders: () => [provider('grok', '2026-09-17', 10)],
  })
  await manager.setEnabled(true)
  const status = manager.getStatus()
  assert.equal(status.invalidFiles.length, 1)
  assert.match(status.error, /could not be read/)
  assert.ok(status.lastSuccessAt)
})
