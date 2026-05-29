const assert = require('node:assert/strict')
const test = require('node:test')

const providerStatus = require('../lib/provider-status')
const { parseStatusPageStatus, statusForProvider, statusesForProviders, _private } = providerStatus

function fakeFetcher(json, ok = true, status = 200) {
  return async () => ({ ok, status, json: async () => json })
}

test('parseStatusPageStatus maps indicators and labels', () => {
  const minor = parseStatusPageStatus({ status: { indicator: 'minor', description: 'Partial' }, page: { updated_at: '2026-05-29T00:00:00Z' } })
  assert.equal(minor.indicator, 'minor')
  assert.equal(minor.label, 'Partial outage')
  assert.equal(minor.description, 'Partial')
  assert.ok(Number.isFinite(minor.updatedAt))

  const ok = parseStatusPageStatus({ status: { indicator: 'none', description: 'All Systems Operational' } })
  assert.equal(ok.indicator, 'none')
  assert.equal(ok.label, 'Operational')

  const bogus = parseStatusPageStatus({ status: { indicator: 'weird' } })
  assert.equal(bogus.indicator, 'unknown')
})

test('statusForProvider resolves windsurf via its statuspage', async () => {
  _private.resetCacheForTesting()
  const status = await statusForProvider(
    'windsurf',
    fakeFetcher({ status: { indicator: 'major', description: 'Editor degraded' }, page: { updated_at: '2026-05-29T12:00:00Z' } }),
    Date.now(),
  )
  assert.equal(status.indicator, 'major')
  assert.equal(status.label, 'Major outage')
  assert.equal(status.url, 'https://status.windsurf.com')
})

test('statusForProvider returns null for providers without a status source', async () => {
  _private.resetCacheForTesting()
  const status = await statusForProvider('minimax', fakeFetcher({}), Date.now())
  assert.equal(status, null)
})

test('statusForProvider degrades to unknown on fetch failure', async () => {
  _private.resetCacheForTesting()
  const status = await statusForProvider('claude', async () => { throw new Error('network down') }, Date.now())
  assert.equal(status.indicator, 'unknown')
  assert.equal(status.source, 'error')
})

test('statusesForProviders only queries known sources', async () => {
  _private.resetCacheForTesting()
  const statuses = await statusesForProviders(
    ['claude', 'minimax', 'windsurf'],
    fakeFetcher({ status: { indicator: 'none', description: 'All Systems Operational' } }),
    Date.now(),
  )
  assert.ok(statuses.claude)
  assert.ok(statuses.windsurf)
  assert.equal(statuses.minimax, undefined)
})
