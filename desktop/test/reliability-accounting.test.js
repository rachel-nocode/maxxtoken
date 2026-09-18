const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const claude = require('../lib/adapters/claude')
const codex = require('../lib/adapters/codex')
const opencodego = require('../lib/adapters/opencode-go')
const { PersistentEventCache, cacheIdentity } = require('../lib/event-cache')
const pricingSupplement = require('../lib/pricing-supplement')
const tokenCost = require('../lib/token-cost')

function temporaryDirectory(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
}

test('persistent event cache reuses normalized rows and invalidates append, truncate, rotate, and schema changes', () => {
  const root = temporaryDirectory('maxxtoken-event-cache')
  const source = path.join(root, 'session.jsonl')
  fs.writeFileSync(source, 'private prompt one\n')
  let parses = 0
  const parse = (text) => {
    parses++
    return [{ bytes: Buffer.byteLength(text), tokens: text.split(/\s+/).filter(Boolean).length }]
  }
  const options = { namespace: 'fixture', schemaVersion: 1, identity: 'account-a:30', root: path.join(root, 'cache') }
  const cold = new PersistentEventCache(options)
  assert.equal(cold.get(source, parse)[0].tokens, 3)
  assert.equal(cold.finish([source]).misses, 1)

  const warm = new PersistentEventCache(options)
  assert.equal(warm.get(source, parse)[0].tokens, 3)
  assert.equal(warm.finish([source]).hits, 1)
  assert.equal(parses, 1)

  fs.appendFileSync(source, 'private prompt two\n')
  const appended = new PersistentEventCache(options)
  assert.equal(appended.get(source, parse)[0].tokens, 6)
  appended.finish([source])

  fs.writeFileSync(source, 'short\n')
  const truncated = new PersistentEventCache(options)
  assert.equal(truncated.get(source, parse)[0].tokens, 1)
  truncated.finish([source])

  const rotated = `${source}.old`
  fs.renameSync(source, rotated)
  fs.writeFileSync(source, 'fresh\n')
  const replacement = new PersistentEventCache(options)
  assert.equal(replacement.get(source, parse)[0].tokens, 1)
  replacement.finish([source])

  const upgraded = new PersistentEventCache({ ...options, schemaVersion: 2 })
  upgraded.get(source, parse)
  upgraded.finish([source])
  assert.equal(parses, 5)

  const cacheText = fs.readdirSync(path.join(root, 'cache'), { recursive: true })
    .filter((file) => String(file).endsWith('.json'))
    .map((file) => fs.readFileSync(path.join(root, 'cache', file), 'utf8'))
    .join('\n')
  assert.doesNotMatch(cacheText, /private prompt|fresh/)
  fs.rmSync(root, { recursive: true })
})

test('event cache identities separate account and history period', () => {
  assert.notEqual(
    cacheIdentity('codex', { identityStamp: 'one' }, 30),
    cacheIdentity('codex', { identityStamp: 'two' }, 30),
  )
  assert.notEqual(
    cacheIdentity('codex', { identityStamp: 'one' }, 7),
    cacheIdentity('codex', { identityStamp: 'one' }, 30),
  )
})

test('event cache ignores manifest record path traversal', () => {
  const root = temporaryDirectory('maxxtoken-event-cache-path')
  const source = path.join(root, 'session.jsonl')
  fs.writeFileSync(source, 'one\n')
  const options = { namespace: 'fixture', schemaVersion: 1, identity: 'account-a:30', root: path.join(root, 'cache') }
  const first = new PersistentEventCache(options)
  first.get(source, () => [{ total: 1 }])
  first.finish([source])
  const identityDirectory = fs.readdirSync(options.root).map((name) => path.join(options.root, name)).find((item) => fs.statSync(item).isDirectory())
  const manifestFile = path.join(identityDirectory, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  manifest.files[path.resolve(source)].record = '../session.jsonl'
  fs.writeFileSync(manifestFile, JSON.stringify(manifest))
  let parsed = 0
  const second = new PersistentEventCache(options)
  assert.deepEqual(second.get(source, () => { parsed++; return [{ total: 2 }] }), [{ total: 2 }])
  assert.equal(parsed, 1)
  fs.rmSync(root, { recursive: true })
})

test('Claude parser keeps recorded parent cost and prices nested advisor usage separately', () => {
  const line = JSON.stringify({
    type: 'assistant',
    timestamp: '2026-09-17T12:00:00Z',
    requestId: 'request-1',
    costUSD: 1.25,
    message: {
      id: 'message-1',
      model: 'claude-opus-4-6',
      usage: {
        input_tokens: 10,
        output_tokens: 2,
        speed: 'fast',
        iterations: [{ type: 'advisor_message', model: 'claude-haiku-4-5', input_tokens: 20, output_tokens: 4 }],
      },
    },
  })
  const events = claude._private.parseClaudeTokenUsageFromText(line, '/tmp/session/subagents/workflows/agent.jsonl')
  assert.equal(events.length, 2)
  assert.equal(events[0].recordedCostUSD, 1.25)
  assert.equal(events[0].isFast, true)
  assert.equal(events[1].model, 'claude-haiku-4-5')
  assert.equal(events[1].recordedCostUSD, undefined)
})

test('session discovery follows symlinked Claude roots and includes Codex archives', () => {
  const root = temporaryDirectory('maxxtoken-log-discovery')
  const realProjects = path.join(root, 'real-projects')
  fs.mkdirSync(path.join(realProjects, 'workspace'), { recursive: true })
  fs.writeFileSync(path.join(realProjects, 'workspace', 'session.jsonl'), '{}\n')
  const linkedProjects = path.join(root, 'projects')
  fs.symlinkSync(realProjects, linkedProjects)
  assert.equal(claude._private.claudeLogFiles([linkedProjects], 0).length, 1)

  const codexHome = path.join(root, 'codex')
  fs.mkdirSync(path.join(codexHome, 'sessions'), { recursive: true })
  fs.mkdirSync(path.join(codexHome, 'archived_sessions'), { recursive: true })
  fs.writeFileSync(path.join(codexHome, 'sessions', 'rollout-parent.jsonl'), '{}\n')
  fs.writeFileSync(path.join(codexHome, 'archived_sessions', 'rollout-subagent.jsonl'), '{}\n')
  assert.equal(codex._private.rolloutFiles({ logHomes: [codexHome], limit: Infinity }).length, 2)
  fs.rmSync(root, { recursive: true })
})

test('Claude cached workflow ownership invalidates when the parent account changes', () => {
  const root = temporaryDirectory('maxxtoken-claude-owner')
  const parent = path.join(root, 'workspace', 'session.jsonl')
  const child = path.join(root, 'workspace', 'session', 'subagents', 'workflows', 'workflow-1', 'agent.jsonl')
  fs.mkdirSync(path.dirname(child), { recursive: true })
  fs.writeFileSync(parent, JSON.stringify({ ownerOrganizationUuid: 'org-a', ownerAccountUuid: 'user-a' }))
  fs.writeFileSync(child, JSON.stringify({
    type: 'assistant', timestamp: '2026-09-17T12:00:00Z', requestId: 'request-1',
    message: { id: 'message-1', model: 'claude-haiku-4-5', usage: { input_tokens: 10, output_tokens: 2 } },
  }))
  const now = Date.parse('2026-09-17T13:00:00Z')
  const options = {
    account: { id: 'claude@fixture', accountId: 'user-a', organizationId: 'org-a', allowsUnattributedHistory: false },
    eventCacheRoot: path.join(root, 'cache'),
  }
  assert.equal(claude._private.scanClaudeTokenUsage([child], now, 30, options).total, 12)
  fs.writeFileSync(parent, JSON.stringify({ ownerOrganizationUuid: 'org-b', ownerAccountUuid: 'user-a' }))
  assert.equal(claude._private.scanClaudeTokenUsage([child], now, 30, options), null)
  fs.rmSync(root, { recursive: true })
})

test('Codex copied session events deduplicate and pricing applies speed and long context per event', () => {
  const base = {
    when: Date.parse('2026-09-17T12:00:00Z'), day: '2026-09-17', model: 'gpt-5.4',
    serviceTier: 'standard', isFast: false, input: 200000, cached: 0, output: 0, total: 200000,
  }
  const aggregate = codex._private.aggregateTokenUsages([
    { input: 200000, cached: 0, output: 0, total: 200000, events: 1, accountingEvents: [base], modelBreakdowns: [{ model: 'gpt-5.4', input: 200000, cached: 0, output: 0, total: 200000 }] },
    { input: 200000, cached: 0, output: 0, total: 200000, events: 1, accountingEvents: [base], modelBreakdowns: [{ model: 'gpt-5.4', input: 200000, cached: 0, output: 0, total: 200000 }] },
  ])
  assert.equal(aggregate.total, 200000)

  const usage = {
    input: 400000, cached: 0, output: 0, total: 400000,
    modelBreakdowns: [{ model: 'gpt-5.4', input: 400000, cached: 0, output: 0, total: 400000 }],
    accountingEvents: [base, { ...base, when: base.when + 1000, serviceTier: 'priority', isFast: true }],
  }
  const priced = tokenCost.withTokenCost('codex', usage)
  assert.ok(Math.abs(priced.costUSD - 1.5) < 1e-9)
  const longContext = tokenCost.withTokenCost('codex', {
    input: 300000, cached: 0, output: 0, total: 300000,
    modelBreakdowns: [{ model: 'gpt-5.4', input: 300000, cached: 0, output: 0, total: 300000 }],
    accountingEvents: [{ ...base, input: 300000, total: 300000 }],
  })
  assert.ok(Math.abs(longContext.costUSD - 1.5) < 1e-9)
})

test('Codex fallback reprices cached normalized events A to B to off without changing actual model', () => {
  const root = temporaryDirectory('maxxtoken-fallback')
  const source = path.join(root, 'rollout-fixture.jsonl')
  const text = [
    { type: 'session_meta', payload: { id: 'session-fixture' }, timestamp: '2026-09-17T12:00:00Z' },
    { type: 'turn_context', payload: { model: 'future-actual-model', turn_id: 'turn-1' } },
    { type: 'event_msg', payload: { type: 'token_count', turn_id: 'turn-1', info: { last_token_usage: { input_tokens: 1000, cached_input_tokens: 100, output_tokens: 100 } } }, timestamp: '2026-09-17T12:01:00Z' },
  ].map(JSON.stringify).join('\n')
  fs.writeFileSync(source, text)
  const usage = codex._private.readTokenUsage([source], {
    tokenHistoryDays: 30,
    now: Date.parse('2026-09-17T13:00:00Z'),
    eventCacheRoot: path.join(root, 'cache'),
    priorityDatabasePath: path.join(root, 'missing.sqlite'),
    forceRefresh: true,
  })

  tokenCost.configurePricing({ unknownModelFallback: { enabled: true, models: { codex: 'gpt-5-mini' } } })
  const cheap = tokenCost.withTokenCost('codex', usage)
  tokenCost.configurePricing({ unknownModelFallback: { enabled: true, models: { codex: 'gpt-5.5' } } })
  const expensive = tokenCost.withTokenCost('codex', cheap)
  tokenCost.configurePricing({ unknownModelFallback: { enabled: false, models: { codex: 'gpt-5.5' } } })
  const off = tokenCost.withTokenCost('codex', expensive)

  assert.ok(expensive.costUSD > cheap.costUSD)
  assert.equal(cheap.modelBreakdowns[0].model, 'future-actual-model')
  assert.equal(cheap.modelBreakdowns[0].fallbackPricingModel, 'gpt-5-mini')
  assert.deepEqual(cheap.unpricedModels, ['future-actual-model'])
  assert.equal(off.costUSD, undefined)
  assert.equal(off.modelBreakdowns[0].model, 'future-actual-model')
  fs.rmSync(root, { recursive: true })
})

test('known Codex prices ignore fallback and pi OpenAI Codex rows retain recorded accounting', () => {
  tokenCost.configurePricing({ unknownModelFallback: { enabled: true, models: { codex: 'gpt-5.5' } } })
  const known = tokenCost.withTokenCost('codex', {
    input: 1000, cached: 0, output: 0, total: 1000,
    modelBreakdowns: [{ model: 'gpt-5-mini', input: 1000, cached: 0, output: 0, total: 1000 }],
  })
  assert.equal(known.modelBreakdowns[0].pricingModel, 'gpt-5-mini')
  assert.equal(known.modelBreakdowns[0].fallbackPricingModel, undefined)

  const pi = codex._private.parsePiCodexUsage(JSON.stringify({
    id: 'pi-message', type: 'message', timestamp: '2026-09-17T12:00:00Z',
    message: { role: 'assistant', provider: 'openai-codex', model: 'gpt-5.5', usage: { input: 10, output: 2, totalTokens: 12, cost: { total: 0.25 } } },
  }))
  assert.equal(pi.length, 1)
  assert.equal(pi[0].recordedCostUSD, 0.25)

  const openCodeOAuth = opencodego._private.aggregateHistoryRows([{
    id: 'oauth-message', timestamp: Date.parse('2026-09-17T12:00:00Z'), costUSD: 0,
    input: 10, cached: 2, output: 3, total: 15, model: 'gpt-5.5', provider: 'openai',
  }], 'OpenCode OpenAI OAuth')
  assert.equal(openCodeOAuth.accountingEvents[0].model, 'gpt-5.5')
  assert.equal(openCodeOAuth.accountingEvents[0].recordedCostUSD, undefined)
  tokenCost.configurePricing({ unknownModelFallback: { enabled: false, models: {} } })
})

test('pricing supplement validates HTTPS, bounded regex rules, and usable fallback choices', async () => {
  assert.throws(() => pricingSupplement._private.safeURL('http://example.com/prices.json'), /HTTPS/)
  const before = pricingSupplement.current()
  assert.equal(await pricingSupplement.refreshIfNeeded({ url: 'http://example.com/prices.json' }), before)
  const normalized = pricingSupplement._private.normalize({
    pricing: { model: { input_per_million: 1, output_per_million: 2 } },
    alias_rules: [
      { pattern: '(a+)+$', canonical: 'model' },
      { pattern: '^(?<danger>a)$', canonical: 'model' },
      { pattern: '^alias$', canonical: 'model' },
    ],
    fallback_models: { codex: ['model'] },
  })
  assert.equal(normalized.aliasRules.length, 1)
  assert.ok(tokenCost.pricingFallbackOptions('codex').some((option) => option.id === 'gpt-5.5'))
})
