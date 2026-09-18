const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const path = require('node:path')
const test = require('node:test')

const cursor = require('../lib/adapters/cursor')
const grok = require('../lib/adapters/grok')
const ollama = require('../lib/adapters/ollama')
const openrouter = require('../lib/adapters/openrouter')
const opencodego = require('../lib/adapters/opencode-go')
const providerDetection = require('../lib/provider-detection')

test('cursor optional meters keep real zeros and malformed CSV fails loudly', () => {
  assert.deepEqual(cursor._private.parseGrokBotUsage({
    usagePercent: 0,
    hasNonZeroIncludedLimit: true,
    nextResetTimestampUtc: '2026-09-20T00:00:00Z',
  }), {
    label: 'Grok Bot',
    usedPct: 0,
    resetAt: Date.parse('2026-09-20T00:00:00Z'),
  })
  assert.equal(cursor._private.parseCreditBalance({ hasCreditGrants: true, totalCents: 1000, usedCents: 250 }, { customerBalance: -500 }), 12.5)
  assert.equal(cursor._private.parseCreditBalance({ hasCreditGrants: false }, { customerBalance: 0 }), null)
  assert.throws(() => cursor._private.parseUsageCSV('Date,Model\n2026-01-01,"broken'), /structurally malformed/)
  assert.throws(() => cursor._private.parseUsageCSV('Date,Model\n2026-01-01,"model"suffix'), /structurally malformed/)
})

test('cursor export aggregates measured model and daily history while rejecting bad rows', () => {
  const csv = [
    'Date,Model,Input (w/ Cache Write),Input (w/o Cache Write),Cache Read,Output Tokens,Cost',
    '2026-09-16T12:00:00Z,gpt-5,10,20,5,7,0.25',
    '2026-09-16T13:00:00Z,gpt-5,-1,20,5,7,0.25',
  ].join('\n')
  const parsed = cursor._private.parseUsageCSV(csv)
  const usage = cursor._private.aggregateUsageCSV(parsed)
  assert.equal(parsed.rejectedRows, 1)
  assert.equal(usage.total, 42)
  assert.equal(usage.dailyBreakdown[0].date, '2026-09-16')
  assert.equal(usage.modelBreakdowns[0].model, 'gpt-5')
})

test('provider history uses local calendar days across UTC boundaries', () => {
  const script = `
    const cursor = require('./lib/adapters/cursor')
    const grok = require('./lib/adapters/grok')
    const opencode = require('./lib/adapters/opencode-go')
    const timestamp = Date.parse('2026-09-16T06:30:00Z')
    process.stdout.write(JSON.stringify([
      cursor._private.dayKey(timestamp),
      grok._private.dayKey(timestamp),
      opencode._private.localDayKey(timestamp),
    ]))
  `
  const output = childProcess.execFileSync(process.execPath, ['-e', script], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, TZ: 'America/Los_Angeles' },
    encoding: 'utf8',
  })
  assert.deepEqual(JSON.parse(output), ['2026-09-15', '2026-09-15', '2026-09-15'])
})

test('provider exports preserve unknown and partial measured costs', () => {
  const header = 'Date,Model,Input (w/ Cache Write),Input (w/o Cache Write),Cache Read,Output Tokens,Cost'
  const cursorUsage = cursor._private.aggregateUsageCSV(cursor._private.parseUsageCSV([
    header,
    '2026-09-16T12:00:00Z,priced,10,0,0,0,0.25',
    '2026-09-16T13:00:00Z,unknown,20,0,0,0,',
  ].join('\n')))
  assert.equal(cursorUsage.costUSD, 0.25)
  assert.equal(cursorUsage.costAccuracy, 'measured')
  assert.deepEqual(cursorUsage.unpricedModels, ['unknown'])
  assert.equal(cursorUsage.modelBreakdowns.find((row) => row.model === 'unknown').costUSD, null)

  const missingCostEvent = {
    timestamp: Date.parse('2026-09-16T12:00:00Z'),
    eventID: 'missing-cost',
    model: 'grok-unknown',
    input: 10,
    cached: 0,
    output: 2,
    total: 12,
    costUSD: null,
  }
  const grokUsage = grok._private.aggregateCompletedTurns([missingCostEvent], Date.parse('2026-09-17T00:00:00Z'), 30)
  assert.equal(grokUsage.costUSD, null)
  assert.deepEqual(grokUsage.unpricedModels, ['grok-unknown'])
})

test('grok CLI quota keeps zero usage and actual weekly reset', () => {
  const billing = grok._private.parseCliBilling({ config: {
    currentPeriod: {
      type: 'USAGE_PERIOD_TYPE_WEEKLY',
      start: '2026-09-10T00:00:00Z',
      end: '2026-09-17T00:00:00Z',
    },
  } })
  assert.equal(billing.usedPercent, 0)
  assert.equal(billing.resetsAt, Date.parse('2026-09-17T00:00:00Z'))
  assert.equal(billing.paygEnabled, false)
  assert.throws(() => grok._private.parseCliBilling({ config: { currentPeriod: {} } }), /response changed/)
})

test('grok completed-event history uses event time and deduplicates copied events per model', () => {
  const event = JSON.stringify({
    timestamp: '2026-09-15T23:30:00Z',
    params: {
      _meta: { eventId: 'same-event', agentTimestampMs: Date.parse('2026-09-16T01:00:00Z') },
      update: {
        sessionUpdate: 'turn_completed',
        usage: {
          modelUsage: {
            'grok-build': { inputTokens: 100, cachedReadTokens: 40, outputTokens: 20, costUsdTicks: 1_000_000_000 },
          },
        },
      },
    },
  })
  const entries = grok._private.parseCompletedTurnJSONL(`${event}\n${event}\n{broken turn_completed`)
  const usage = grok._private.aggregateCompletedTurns(entries, Date.parse('2026-09-17T00:00:00Z'), 30)
  assert.equal(usage.total, 120)
  assert.equal(usage.costUSD, 0.1)
  const eventDate = new Date(Date.parse('2026-09-16T01:00:00Z'))
  const expectedDay = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`
  assert.equal(usage.dailyBreakdown[0].date, expectedDay)
})

function sshString(value) {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(value)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  return Buffer.concat([length, data])
}

function makeOpenSSHKey() {
  const pair = crypto.generateKeyPairSync('ed25519')
  const jwk = pair.privateKey.export({ format: 'jwk' })
  const seed = Buffer.from(jwk.d, 'base64url')
  const publicRaw = Buffer.from(jwk.x, 'base64url')
  const publicBlob = Buffer.concat([sshString('ssh-ed25519'), sshString(publicRaw)])
  const check = Buffer.alloc(8)
  check.writeUInt32BE(0x12345678, 0)
  check.writeUInt32BE(0x12345678, 4)
  let privateSection = Buffer.concat([
    check,
    sshString('ssh-ed25519'),
    sshString(publicRaw),
    sshString(Buffer.concat([seed, publicRaw])),
    sshString(''),
  ])
  const padding = []
  while ((privateSection.length + padding.length) % 8) padding.push(padding.length + 1)
  privateSection = Buffer.concat([privateSection, Buffer.from(padding)])
  const count = Buffer.alloc(4)
  count.writeUInt32BE(1)
  const blob = Buffer.concat([
    Buffer.from('openssh-key-v1\0'),
    sshString('none'),
    sshString('none'),
    sshString(''),
    count,
    sshString(publicBlob),
    sshString(privateSection),
  ])
  return {
    pem: `-----BEGIN OPENSSH PRIVATE KEY-----\n${blob.toString('base64')}\n-----END OPENSSH PRIVATE KEY-----`,
    publicKey: pair.publicKey,
  }
}

test('ollama native signin parses and signs with the local Ed25519 key', () => {
  const fixture = makeOpenSSHKey()
  const key = ollama._private.parseOpenSSHEd25519(fixture.pem)
  assert.ok(key)
  const authorization = ollama._private.signedAuthorization(key, 'GET', '/api/usage?ts=1700000000')
  const signature = Buffer.from(authorization.split(':')[1], 'base64')
  assert.equal(crypto.verify(null, Buffer.from('GET,/api/usage?ts=1700000000'), fixture.publicKey, signature), true)
})

test('ollama cloud usage maps fractions, charges, missing meters, and no invented resets', () => {
  const usage = ollama._private.parseCloudUsage({
    activity: { cost: '1.25' },
    limits: { weekly: { usage: 0 }, session: { usage: 0.349 } },
  }, { Plan: 'pro', Email: 'user@example.com' }, 1000)
  assert.equal(usage.sessionUsedPercent, 34.9)
  assert.equal(usage.weeklyUsedPercent, 0)
  assert.equal(usage.recentChargesUSD, 1.25)
  assert.equal(usage.sessionResetsAt, null)
  assert.equal(usage.weeklyResetsAt, null)
})

test('ollama local-only installation remains opt-in', () => {
  const detected = providerDetection.detectLocalProviders({
    home: '/missing-home',
    env: {},
    fs: { existsSync: () => false, readdirSync: () => [] },
    execFileSync: (_bin, args) => {
      if (String(args[1]).includes("'ollama'")) return '/usr/local/bin/ollama\n'
      throw new Error('missing')
    },
  })
  assert.equal(detected.ollama, undefined)
})

test('openrouter separates account balance from optional key periods and preserves zeros', async () => {
  assert.deepEqual(openrouter._private.parseCredits({ data: { total_credits: 10, total_usage: 10 } }), {
    lifetimeUsage: 10,
    totalCredits: 10,
    balance: 0,
  })
  const calls = []
  const result = await openrouter.read({
    key: 'fake-token',
    fetchWithTimeout: async (url) => {
      calls.push(url)
      if (url.endsWith('/credits')) return { ok: true, status: 200, json: async () => ({ data: { total_credits: 5, total_usage: 0 } }) }
      return { ok: false, status: 503, json: async () => ({}) }
    },
  })
  assert.equal(result.connected, true)
  assert.equal(result.balance, 5)
  assert.equal(result.keyDetailsAvailable, false)
  assert.equal(calls.length, 2)
  assert.deepEqual(openrouter._private.parseCredits({ data: { total_usage: 2 } }), {
    lifetimeUsage: 2,
    totalCredits: null,
    balance: null,
  })
})

test('opencode hosted history unions channel databases and deduplicates copied message IDs', () => {
  const now = Date.parse('2026-09-17T00:00:00Z')
  const row = {
    id: 'same-message',
    ts: Date.parse('2026-09-16T12:00:00Z'),
    cost: 1.5,
    total: 120,
    input: 100,
    cache_read: 0,
    cache_write: 0,
    output: 20,
    reasoning: 0,
    model: 'gpt-test',
    provider: 'opencode-go',
  }
  const usage = opencodego._private.readHostedUsageHistory({
    now,
    databasePaths: ['/oc/opencode.db', '/oc/opencode-next.db'],
    execFileSync: () => JSON.stringify([row]),
  })
  assert.equal(usage.total, 120)
  assert.equal(usage.costUSD, 1.5)
  assert.equal(usage.requests, 1)
})

test('opencode OpenAI history requires OAuth and excludes positive-cost API traffic', () => {
  const now = Date.parse('2026-09-17T00:00:00Z')
  const rows = [
    { id: 'oauth', ts: now - 1000, cost: 0, total: 15, input: 10, cache_read: 0, cache_write: 0, output: 5, reasoning: 0, model: 'gpt-test', provider: 'openai' },
    { id: 'api', ts: now - 500, cost: 2, total: 25, input: 20, cache_read: 0, cache_write: 0, output: 5, reasoning: 0, model: 'gpt-test', provider: 'openai' },
  ]
  const fs = {
    readFileSync: () => JSON.stringify({ openai: { type: 'oauth', access: 'fake-token' } }),
  }
  const usage = opencodego._private.readCodexOAuthHistory({
    now,
    home: '/home/test',
    env: { OPENCODE_AUTH_FILE: '/oc/auth.json' },
    fs,
    databasePaths: ['/oc/opencode.db'],
    execFileSync: () => JSON.stringify(rows),
  })
  assert.equal(usage.total, 15)
  assert.equal(usage.requests, 1)

  let queried = false
  const apiKeyUsage = opencodego._private.readCodexOAuthHistory({
    now,
    home: '/home/test',
    env: { OPENCODE_AUTH_FILE: '/oc/auth.json' },
    fs: { readFileSync: () => JSON.stringify({ openai: { type: 'api', key: 'fake-token' } }) },
    databasePaths: ['/oc/opencode.db'],
    execFileSync: () => { queried = true; return '[]' },
  })
  assert.equal(apiKeyUsage, null)
  assert.equal(queried, false)
})
