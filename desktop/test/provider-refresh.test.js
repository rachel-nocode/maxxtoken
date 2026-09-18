const test = require('node:test')
const assert = require('node:assert/strict')
const { collect, failPending } = require('../lib/provider-refresh')
const { snapshotEntries, composeSnapshot } = require('../lib/aggregate')._private

const entry = (id, extra = {}) => ({ id, family: id.split('@')[0], conf: { name: id, plan: 'Test' }, ...extra })

test('startup cache preserves account cards without generic duplicates or old spinners', () => {
  const { restoreCachedRefresh } = require('../lib/provider-refresh')
  const restored = restoreCachedRefresh({ providers: [
    { id: 'claude@aaaaaaaaaaaa', providerFamily: 'claude', refreshState: 'refreshing' },
    { id: 'claude', error: 'Waiting for scheduled refresh.' },
    { id: 'cursor', error: 'Unavailable' },
  ], refresh: { inProgress: true, pendingProviderIds: ['claude@aaaaaaaaaaaa'] } }, 1234)
  assert.deepEqual(restored.enabledProviderIds, ['claude@aaaaaaaaaaaa', 'cursor'])
  assert.equal(restored.providers[0].refreshState, 'idle')
  assert.equal(restored.providers[1].refreshState, 'error')
  assert.deepEqual(restored.refresh, { inProgress: false, pendingProviderIds: [], nextRefreshAt: 1234 })
})

test('fast provider is published while another hangs, then timeout settles only the slow provider', async () => {
  const updates = []
  const result = await collect([entry('fast'), entry('slow')], {
    timeoutMs: 25,
    build: async ({ id }) => id === 'slow' ? new Promise(() => {}) : { id, connected: true, windows: [{ usedPct: 32 }] },
    onProgress: (snapshot) => updates.push(snapshot),
  })
  assert.deepEqual(updates[0].refresh.pendingProviderIds, ['fast', 'slow'])
  assert.equal(updates[1].providers[0].windows[0].usedPct, 32)
  assert.deepEqual(updates[1].refresh.pendingProviderIds, ['slow'])
  assert.equal(result.refresh.inProgress, false)
  assert.equal(result.providers[1].refreshState, 'error')
  assert.equal(result.providers[0].refreshError, null)
})

test('selected refresh keeps untouched results and rejects previous-account data', async () => {
  const result = await collect([entry('codex@aaaaaaaaaaaa', { account: { identityStamp: 'new-owner' } }), entry('cursor', { refresh: false })], {
    previousProviders: [{ id: 'codex@aaaaaaaaaaaa', connected: true, account: { identityStamp: 'old-owner' }, windows: [{ usedPct: 90 }] }, { id: 'cursor', connected: true, windows: [{ usedPct: 10 }] }],
    build: async () => { throw new Error('Cannot refresh') },
  })
  assert.deepEqual(result.providers[0].windows, [])
  assert.equal(result.providers[0].account.identityStamp, 'new-owner')
  assert.equal(result.providers[1].windows[0].usedPct, 10)
  assert.equal(result.providers[1].refreshState, 'idle')
})

test('worker interruption stops pending spinners without changing completed rows', () => {
  const done = { id: 'done', refreshState: 'idle', connected: true }
  const snap = failPending({ refresh: { inProgress: true, pendingProviderIds: ['slow'] }, providers: [done, { id: 'slow', refreshState: 'refreshing' }] }, 'Interrupted')
  assert.equal(snap.providers[0], done)
  assert.equal(snap.providers[1].refreshError, 'Interrupted')
  assert.equal(snap.refresh.inProgress, false)
})

test('provider selection targets an account or family and rejects missing accounts', () => {
  const config = { providers: { claude: { enabled: true }, codex: { enabled: false } } }
  const accounts = [{ id: 'claude@aaaaaaaaaaaa', family: 'claude' }, { id: 'claude@bbbbbbbbbbbb', family: 'claude' }]
  assert.deepEqual(snapshotEntries(config, accounts, ['claude@bbbbbbbbbbbb']).filter((row) => row.refresh).map((row) => row.id), ['claude@bbbbbbbbbbbb'])
  assert.equal(snapshotEntries(config, accounts, ['codex']).find((row) => row.id === 'codex').refresh, true)
  assert.throws(() => snapshotEntries(config, accounts, ['claude@cccccccccccc']), { code: 'UNKNOWN_PROVIDER' })
})

test('progress totals include latest available provider values without converting missing costs to zero', () => {
  const snap = composeSnapshot([{ id: 'claude', connected: true, totalValue: 200, spentValue: 50, leftValue: 150, tokenUsage: { total: 1000, costUSD: null } }], { providerOrder: [], tokenHistoryDays: 30 }, {}, { samples: [], totals: [], tokens: [] }, { inProgress: true })
  assert.equal(snap.totals.spent, 50)
  assert.equal(snap.totals.tokens.costUSD, null)
  assert.equal(snap.refresh.inProgress, true)
})
