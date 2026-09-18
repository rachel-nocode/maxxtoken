const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const accounts = require('../lib/provider-accounts')
const claude = require('../lib/adapters/claude')
const codex = require('../lib/adapters/codex')
const desktopAuth = require('../lib/claude-desktop-auth')
const aggregate = require('../lib/aggregate')
const localApi = require('../lib/local-api')
const tokenCost = require('../lib/token-cost')
const usageExport = require('../lib/usage-export')

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-accounts-'))
}

function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value))
}

function response(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    async json() { return body },
  }
}

test('account instance ids are stable opaque identities and discovery deduplicates default with Swap', () => {
  const home = tmp()
  const custom = path.join(home, 'custom-claude')
  writeJSON(path.join(custom, '.claude.json'), {
    oauthAccount: { accountUuid: 'User-1', organizationUuid: 'Org-1', emailAddress: 'private@example.test', organizationName: 'Studio' },
  })
  writeJSON(path.join(home, '.claude-swap-backup', 'sequence.json'), {
    accounts: { 1: { uuid: 'USER-1', organizationUuid: 'ORG-1', email: 'private@example.test', organizationName: 'Studio' } },
  })

  const found = accounts.discoverClaudeAccounts({ home, env: { CLAUDE_CONFIG_DIR: custom } })
  assert.equal(found.length, 1)
  assert.match(found[0].id, /^claude@[0-9a-f]{12}$/)
  assert.equal(found[0].id, accounts.instanceId('claude', 'user-1|org-1'))
  assert.deepEqual(found[0].sourceKinds.sort(), ['claudeSwap', 'defaultHome'])
  assert.equal(found[0].label, 'Studio')
  assert.equal(JSON.stringify(accounts.publicAccount(found[0])).includes('private@example.test'), false)
})

test('Codex Swap accounts remain separate by workspace and never derive ids from email', () => {
  const home = tmp()
  const root = path.join(home, 'xswap')
  writeJSON(path.join(root, 'accounts.json'), {
    schema_version: 1,
    main_home: path.join(home, '.codex'),
    accounts: [
      { number: 1, alias: 'Work', home: path.join(root, 'one'), identity: { account_id: 'acct-one', email: 'same@example.test' } },
      { number: 2, alias: 'Personal', home: path.join(root, 'two'), identity: { account_id: 'acct-two', email: 'same@example.test' } },
    ],
  })
  const found = accounts.discoverCodexAccounts({ home, env: { XSWAP_HOME: root }, skipKeychain: true })
  assert.equal(found.length, 2)
  assert.notEqual(found[0].id, found[1].id)
  assert.deepEqual(found.map((item) => item.label), ['Work', 'Personal'])
})

test('Claude Desktop safe-storage cache decrypts read-only and selects the scoped organization token', () => {
  const password = 'fixture-password'
  const key = desktopAuth.deriveKey(password)
  const accountId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const cacheKey = `acct:${accountId}|cccccccc-cccc-4ccc-8ccc-cccccccccccc:${organizationId}:https://api.anthropic.com:user:profile user:inference`
  const plaintext = Buffer.from(JSON.stringify({ [cacheKey]: { token: 'fixture-token', expiresAt: Date.now() + 3600000 } }))
  const cipher = crypto.createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
  const encrypted = Buffer.concat([Buffer.from('v10'), cipher.update(plaintext), cipher.final()])
  const decoded = desktopAuth._private.decodeCache(encrypted.toString('base64'), key)
  const selected = desktopAuth.selectCredential([decoded], { accountId, organizationId })
  assert.equal(selected.token, 'fixture-token')
  assert.equal(selected.scopes.includes('user:profile'), true)
})

test('Claude Desktop account-scoped cache entry shadows its legacy alias regardless of order', () => {
  const accountId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const suffix = `cccccccc-cccc-4ccc-8ccc-cccccccccccc:${organizationId}:https://api.anthropic.com:user:profile user:inference`
  const selected = desktopAuth.selectCredential([{
    [suffix]: { token: 'legacy-token', expiresAt: Date.now() + 7200000 },
    [`acct:${accountId}|${suffix}`]: { token: 'scoped-token', expiresAt: Date.now() + 3600000 },
  }], { accountId, organizationId })
  assert.equal(selected.token, 'scoped-token')
})

test('pi Claude usage parser preserves recorded cost and token buckets', () => {
  const rows = claude._private.parsePiClaudeUsageFromText(JSON.stringify({
    id: 'msg-1', type: 'message', timestamp: '2026-09-17T12:00:00Z',
    message: {
      role: 'assistant', provider: 'anthropic', model: 'claude-sonnet-4-5',
      usage: { input: 10, cacheWrite: 3, cacheRead: 4, output: 5, totalTokens: 22, cost: { total: 0.42 } },
    },
  }))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].total, 22)
  assert.equal(rows[0].recordedCostUSD, 0.42)
})

test('Claude token cost uses pi recorded cost once and estimates only non-pi tokens', () => {
  const measured = tokenCost.withTokenCost('claude', {
    modelBreakdowns: [{
      model: 'claude-sonnet-4-5', input: 13, uncachedInput: 10, cacheCreation: 3,
      cacheRead: 4, cached: 4, output: 5, total: 22, recordedCostUSD: 0.42,
      recordedInput: 13, recordedUncachedInput: 10, recordedCacheCreation: 3,
      recordedCacheRead: 4, recordedCached: 4, recordedOutput: 5, recordedTotal: 22,
    }],
  })
  assert.equal(measured.costUSD, 0.42)
  assert.equal(measured.costAccuracy, 'measured')
  assert.equal(measured.modelBreakdowns[0].costUSD, 0.42)

  const mixed = tokenCost.withTokenCost('claude', {
    modelBreakdowns: [{
      model: 'claude-sonnet-4-5', input: 113, uncachedInput: 110, cacheCreation: 3,
      cacheRead: 4, cached: 4, output: 15, total: 132, recordedCostUSD: 0.42,
      recordedInput: 13, recordedUncachedInput: 10, recordedCacheCreation: 3,
      recordedCacheRead: 4, recordedCached: 4, recordedOutput: 5, recordedTotal: 22,
    }],
  })
  assert.ok(Math.abs(mixed.costUSD - 0.42045) < 1e-12)
  assert.equal(mixed.costAccuracy, 'mixed')
  assert.equal(mixed.modelBreakdowns[0].costAccuracy, 'mixed')
})

test('Claude multi-account history omits unattributed and foreign sessions', () => {
  const account = { accountId: 'acct-a', organizationId: 'org-a', allowsUnattributedHistory: false }
  const owned = [
    JSON.stringify({ ownerAccountUuid: 'acct-a', ownerOrganizationUuid: 'org-a' }),
    JSON.stringify({ type: 'assistant', timestamp: '2026-09-17T12:00:00Z', message: { id: 'm', model: 'claude', usage: { input_tokens: 1, output_tokens: 1 } } }),
  ].join('\n')
  const foreign = JSON.stringify({ ownerAccountUuid: 'acct-b', ownerOrganizationUuid: 'org-b' })
  assert.equal(claude._private.claudeFileOwnedByAccount('/tmp/session.jsonl', owned, account), true)
  assert.equal(claude._private.claudeFileOwnedByAccount('/tmp/foreign.jsonl', foreign, account), false)
  assert.equal(claude._private.claudeFileOwnedByAccount('/tmp/unknown.jsonl', '{}', account), false)
})

test('reset-credit parsing keeps embedded count when optional expiry fetch fails', () => {
  const parsed = codex._private.parseResetCredits(null, { available_count: 3 }, { error: 'timeline unavailable' })
  assert.equal(parsed.availableCount, 3)
  assert.equal(parsed.expiryAvailable, false)
  assert.deepEqual(parsed.credits, [])
  assert.equal(parsed.error, 'timeline unavailable')
})

test('reset-credit parsing falls back from a dedicated null count to the embedded count', () => {
  const parsed = codex._private.parseResetCredits({ available_count: null, credits: [] }, { available_count: 4 })
  assert.equal(parsed.availableCount, 4)
})

test('reset-credit preparation requires a nearly exhausted resettable window', async () => {
  const home = tmp()
  const authHome = path.join(home, '.codex')
  writeJSON(path.join(authHome, 'auth.json'), {
    last_refresh: new Date().toISOString(), tokens: { access_token: 'fake-access-token', account_id: 'acct-threshold' },
  })
  const account = {
    id: accounts.instanceId('codex', 'acct-threshold'), accountId: 'acct-threshold',
    identityStamp: accounts.identityDigest('acct-threshold'), authHomes: [authHome], logHomes: [authHome], isDefault: false,
  }
  const fetcher = async (url) => url.endsWith('/rate-limit-reset-credits')
    ? response(200, { available_count: 1, credits: [{ id: 'credit-threshold', status: 'available', expires_at: '2099-09-18T12:00:00Z' }] })
    : response(200, {
        rate_limit: { primary_window: { used_percent: 89, limit_window_seconds: 18000 } },
        additional_rate_limits: [{ rate_limit: { primary_window: { used_percent: 100, limit_window_seconds: 18000 } } }],
      })
  const prepared = await codex.prepareResetCredit(account, 'credit-threshold', { fetcher })
  assert.equal(prepared.ok, false)
  assert.equal(prepared.code, 'nothing_to_reset')
})

test('expired reset credits and expired confirmations cannot reach the consume endpoint', async () => {
  const home = tmp()
  const authHome = path.join(home, '.codex')
  const now = Date.parse('2026-09-17T12:00:00Z')
  writeJSON(path.join(authHome, 'auth.json'), {
    last_refresh: new Date(now).toISOString(), tokens: { access_token: 'fake-access-token', account_id: 'acct-expiry' },
  })
  const account = {
    id: accounts.instanceId('codex', 'acct-expiry'), accountId: 'acct-expiry',
    identityStamp: accounts.identityDigest('acct-expiry'), authHomes: [authHome], logHomes: [authHome], isDefault: false,
  }
  let expiresAt = '2026-09-17T11:00:00Z'
  let consumes = 0
  const fetcher = async (url) => {
    if (url.endsWith('/consume')) { consumes++; return response(200, { code: 'reset' }) }
    if (url.endsWith('/rate-limit-reset-credits')) {
      return response(200, { available_count: 1, credits: [{ id: 'credit-expiry', status: 'available', expires_at: expiresAt }] })
    }
    return response(200, { rate_limit: { primary_window: { used_percent: 95, limit_window_seconds: 18000 } } })
  }
  const expired = await codex.prepareResetCredit(account, 'credit-expiry', { fetcher, now })
  assert.equal(expired.ok, false)
  assert.equal(expired.code, 'no_credit')

  expiresAt = '2026-09-18T12:00:00Z'
  const prepared = await codex.prepareResetCredit(account, 'credit-expiry', { fetcher, now })
  await assert.rejects(
    codex.redeemResetCredit(account, { ...prepared, confirmed: true }, { fetcher, now: now + 15 * 60000 + 1 }),
    /missing or expired/,
  )
  assert.equal(consumes, 0)
})

test('reset-credit redemption requires prepare and confirmation, rechecks identity, and reuses one idempotency key', async () => {
  const home = tmp()
  const authHome = path.join(home, '.codex')
  writeJSON(path.join(authHome, 'auth.json'), {
    last_refresh: new Date().toISOString(),
    tokens: { access_token: 'fake-access-token', account_id: 'acct-1' },
  })
  const account = {
    id: accounts.instanceId('codex', 'acct-1'), family: 'codex', accountId: 'acct-1',
    identityStamp: accounts.identityDigest('acct-1'), authHomes: [authHome], logHomes: [authHome], isDefault: false,
  }
  const expiry = new Date(Date.now() + 86400000).toISOString()
  const requests = []
  const fetcher = async (url, init) => {
    requests.push({ url, init })
    if (url.endsWith('/consume')) return response(200, { code: 'reset' })
    if (url.endsWith('/rate-limit-reset-credits')) {
      return response(200, { available_count: 1, credits: [{ id: 'credit-1', status: 'available', expires_at: expiry }] })
    }
    if (url.endsWith('/usage')) {
      return response(200, { rate_limit: { primary_window: { used_percent: 95, limit_window_seconds: 18000 } }, rate_limit_reset_credits: { available_count: 0 } })
    }
    throw new Error(`unexpected URL ${url}`)
  }

  const prepared = await codex.prepareResetCredit(account, 'credit-1', { fetcher })
  assert.equal(prepared.ok, true)
  assert.match(prepared.redeemRequestId, /^[0-9a-f-]{36}$/)
  await assert.rejects(
    codex.redeemResetCredit(account, { ...prepared, confirmed: false }, { fetcher, skipTokenHistory: true }),
    /explicit confirmation/,
  )
  assert.equal(requests.some((item) => item.url.endsWith('/consume')), false)
  const result = await codex.redeemResetCredit(account, { ...prepared, confirmed: true }, { fetcher, skipTokenHistory: true })
  assert.equal(result.ok, true)
  assert.equal(result.code, 'reset')
  const consume = requests.find((item) => item.url.endsWith('/consume'))
  const body = JSON.parse(consume.init.body)
  assert.equal(body.credit_id, 'credit-1')
  assert.equal(body.redeem_request_id, prepared.redeemRequestId)
})

test('reset-credit redemption rejects an account switch before POST', async () => {
  const home = tmp()
  const authHome = path.join(home, '.codex')
  writeJSON(path.join(authHome, 'auth.json'), {
    last_refresh: new Date().toISOString(), tokens: { access_token: 'fake-access-token', account_id: 'acct-1' },
  })
  const account = {
    id: accounts.instanceId('codex', 'acct-1'), accountId: 'acct-1', identityStamp: accounts.identityDigest('acct-1'),
    authHomes: [authHome], logHomes: [authHome], isDefault: false,
  }
  let posts = 0
  const fetcher = async (url) => {
    if (url.endsWith('/consume')) posts++
    if (url.endsWith('/usage')) return response(200, { rate_limit: { primary_window: { used_percent: 95, limit_window_seconds: 18000 } } })
    return response(200, { available_count: 1, credits: [{ id: 'credit-2', status: 'available', expires_at: new Date(Date.now() + 86400000).toISOString() }] })
  }
  const prepared = await codex.prepareResetCredit(account, 'credit-2', { fetcher })
  await assert.rejects(
    codex.redeemResetCredit({ ...account, identityStamp: accounts.identityDigest('acct-2') }, { ...prepared, confirmed: true }, { fetcher }),
    /account changed/,
  )
  assert.equal(posts, 0)
})

test('uncertain reset-credit retry replays the same credit and idempotency key', async () => {
  const home = tmp()
  const authHome = path.join(home, '.codex')
  writeJSON(path.join(authHome, 'auth.json'), {
    last_refresh: new Date().toISOString(), tokens: { access_token: 'fake-access-token', account_id: 'acct-3' },
  })
  const account = {
    id: accounts.instanceId('codex', 'acct-3'), accountId: 'acct-3', identityStamp: accounts.identityDigest('acct-3'),
    authHomes: [authHome], logHomes: [authHome], isDefault: false,
  }
  let consumes = 0
  const bodies = []
  const fetcher = async (url, init) => {
    if (url.endsWith('/consume')) {
      consumes++
      bodies.push(JSON.parse(init.body))
      if (consumes === 1) throw new Error('response lost')
      return response(200, { code: 'already_redeemed' })
    }
    if (url.endsWith('/rate-limit-reset-credits')) {
      return response(200, { available_count: 1, credits: [{ id: 'credit-3', status: 'available', expires_at: new Date(Date.now() + 86400000).toISOString() }] })
    }
    return response(200, { rate_limit: { primary_window: { used_percent: 95, limit_window_seconds: 18000 } }, rate_limit_reset_credits: { available_count: 0 } })
  }
  const prepared = await codex.prepareResetCredit(account, 'credit-3', { fetcher })
  await assert.rejects(codex.redeemResetCredit(account, { ...prepared, confirmed: true }, { fetcher, skipTokenHistory: true }), /response lost/)
  const replay = await codex.redeemResetCredit(account, { ...prepared, confirmed: true }, { fetcher, skipTokenHistory: true })
  assert.equal(replay.ok, true)
  assert.equal(replay.alreadyRedeemed, true)
  assert.deepEqual(bodies[0], bodies[1])
})

test('a consumed credit is not reported successful until refreshed limits load', async () => {
  const home = tmp()
  const authHome = path.join(home, '.codex')
  writeJSON(path.join(authHome, 'auth.json'), {
    last_refresh: new Date().toISOString(), tokens: { access_token: 'fake-access-token', account_id: 'acct-4' },
  })
  const account = {
    id: accounts.instanceId('codex', 'acct-4'), accountId: 'acct-4', identityStamp: accounts.identityDigest('acct-4'),
    authHomes: [authHome], logHomes: [authHome], isDefault: false,
  }
  let consumed = false
  const fetcher = async (url) => {
    if (url.endsWith('/consume')) { consumed = true; return response(200, { code: 'reset' }) }
    if (url.endsWith('/rate-limit-reset-credits')) {
      return response(200, { available_count: 1, credits: [{ id: 'credit-4', status: 'available', expires_at: '2099-09-18T12:00:00Z' }] })
    }
    if (!consumed) return response(200, { rate_limit: { primary_window: { used_percent: 95, limit_window_seconds: 18000 } } })
    return response(503, {})
  }
  const prepared = await codex.prepareResetCredit(account, 'credit-4', { fetcher })
  const result = await codex.redeemResetCredit(account, { ...prepared, confirmed: true }, { fetcher, skipTokenHistory: true })
  assert.equal(result.code, 'reset')
  assert.equal(result.ok, false)
  assert.equal(result.refreshPending, true)
})

test('cached account data never crosses identity stamps', () => {
  const current = [{
    id: 'claude@abc123abc123', providerFamily: 'claude', connected: false, error: 'offline',
    account: { id: 'claude@abc123abc123', identityStamp: 'new-stamp' },
  }]
  const cache = {
    generatedAt: new Date().toISOString(),
    providers: [{
      id: 'claude@abc123abc123', providerFamily: 'claude', connected: true,
      account: { id: 'claude@abc123abc123', identityStamp: 'old-stamp' },
      primaryWindow: { label: 'Weekly', usedPct: 80 },
    }],
  }
  const result = aggregate._private.applyCachedProviderFallbacks(current, cache)
  assert.equal(result[0].connected, false)
})

test('startup cache is rejected unless every account instance matches fresh ownership', () => {
  const stamp = accounts.identityDigest('acct-one')
  const instance = accounts.instanceId('codex', 'acct-one')
  const cache = {
    totals: { spent: 99 },
    providers: [
      { id: instance, providerFamily: 'codex', account: { id: instance, identityStamp: stamp } },
      { id: 'cursor', providerFamily: 'cursor' },
    ],
  }
  const discovered = [{ id: instance, family: 'codex', identityStamp: stamp }]
  assert.equal(accounts.guardCachedSnapshotAccounts(cache, discovered), cache)
  assert.equal(accounts.guardCachedSnapshotAccounts(cache, []), null)
  assert.equal(accounts.guardCachedSnapshotAccounts(cache, [{ ...discovered[0], identityStamp: 'changed' }]), null)
  assert.equal(accounts.guardCachedSnapshotAccounts({ providers: [{ id: 'codex', providerFamily: 'codex' }] }, discovered), null)
  assert.deepEqual(accounts.guardCachedSnapshotAccounts({ providers: [{ id: 'cursor' }] }, []), { providers: [{ id: 'cursor' }] })
})

test('API and export propagate opaque account ids without labels or identity stamps', () => {
  const provider = {
    id: 'codex@123456abcdef', providerFamily: 'codex', name: 'Codex · Work', connected: true,
    account: { id: 'codex@123456abcdef', label: 'Work', identityStamp: 'private-stamp' },
    resetCredits: { availableCount: 2, expiryAvailable: true, credits: [{ id: 'secret-credit-id', expiresAt: 1800000000000 }] },
  }
  const publicProvider = localApi.publicProvider(provider)
  assert.equal(publicProvider.accountId, 'codex@123456abcdef')
  assert.equal(JSON.stringify(publicProvider).includes('private-stamp'), false)
  assert.equal(JSON.stringify(publicProvider).includes('secret-credit-id'), false)
  const exported = usageExport._private.exportProvider(provider)
  assert.equal(exported.accountId, 'codex@123456abcdef')
  assert.equal(JSON.stringify(exported).includes('Work'), false)
  assert.equal(JSON.stringify(exported).includes('private-stamp'), false)
})
