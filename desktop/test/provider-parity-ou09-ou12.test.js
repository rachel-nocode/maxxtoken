const assert = require('node:assert/strict')
const test = require('node:test')

const antigravity = require('../lib/adapters/antigravity')
const antigravityHistory = require('../lib/adapters/antigravity-history')
const aggregate = require('../lib/aggregate')
const copilot = require('../lib/adapters/copilot')
const devin = require('../lib/adapters/devin')
const zai = require('../lib/adapters/zai')
const config = require('../lib/config')
const tokenCost = require('../lib/token-cost')

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

function varint(value) {
  let current = BigInt(value)
  const bytes = []
  do {
    let byte = Number(current & 0x7fn)
    current >>= 7n
    if (current) byte |= 0x80
    bytes.push(byte)
  } while (current)
  return Buffer.from(bytes)
}

function varintField(field, value) {
  return Buffer.concat([varint(BigInt(field) << 3n), varint(value)])
}

function bytesField(field, value) {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return Buffer.concat([varint((BigInt(field) << 3n) | 2n), varint(data.length), data])
}

function generationBlob(timestamp) {
  const usage = Buffer.concat([
    varintField(1, 100),
    varintField(2, 900),
    varintField(3, 200),
    varintField(5, 50),
  ])
  const timestampMessage = varintField(1, timestamp)
  const timing = bytesField(4, timestampMessage)
  const event = Buffer.concat([
    bytesField(19, 'gemini-3.1-pro'),
    bytesField(4, usage),
    bytesField(9, timing),
  ])
  return bytesField(1, event)
}

test('registry exposes Devin and Z.ai as first-class providers', () => {
  const providers = config._private.normalizeProviders({})
  assert.equal(providers.devin.tier, 'core')
  assert.equal(providers.zai.tier, 'extended')
})

test('Devin maps daily, weekly, plan, reset, and measured zero extra balance', () => {
  const usage = devin._private.parseUserStatus({
    userStatus: {
      planStatus: {
        planInfo: { planName: 'Max', hideDailyQuota: false },
        dailyQuotaRemainingPercent: 75,
        weeklyQuotaRemainingPercent: 40,
        dailyQuotaResetAtUnix: 1800000000,
        weeklyQuotaResetAtUnix: 1800500000,
        overageBalanceMicros: '0',
      },
    },
  }, 1700000000000)

  assert.equal(usage.daily.usedPct, 25)
  assert.equal(usage.weekly.usedPct, 60)
  assert.equal(usage.weekly.resetAt, 1800500000000)
  assert.equal(usage.extraBalanceUSD, 0)
  assert.equal(usage.plan, 'Max')
})

test('Devin omitted weekly percentage plus weekly reset means exhausted', () => {
  const usage = devin._private.parseUserStatus({
    userStatus: {
      planStatus: {
        planInfo: { planName: 'Teams', hideDailyQuota: true },
        dailyQuotaRemainingPercent: 30,
        weeklyQuotaResetAtUnix: 1800500000,
      },
    },
  })
  assert.equal(usage.daily, null)
  assert.equal(usage.weekly.usedPct, 100)
  assert.throws(() => devin._private.parseUserStatus({
    userStatus: { planStatus: { weeklyQuotaRemainingPercent: 'schema-drift', weeklyQuotaResetAtUnix: 1800500000 } },
  }), /Invalid Devin weekly quota/)
})

test('Devin CLI auth wins and rejected auth falls back to app login', async () => {
  const calls = []
  const usage = await devin.read({
    sources: [
      { apiKey: 'fake-cli-token', apiServerURL: 'https://cli.invalid', source: 'Devin CLI' },
      { apiKey: 'fake-app-token', apiServerURL: 'https://app.invalid', source: 'Devin app' },
    ],
    fetchWithTimeout: async (url) => {
      calls.push(url)
      return calls.length === 1
        ? response(401, {})
        : response(200, { userStatus: { planStatus: { planInfo: { planName: 'Core' }, weeklyQuotaRemainingPercent: 50 } } })
    },
  })
  assert.equal(usage.connected, true)
  assert.equal(usage.source, 'Devin app')
  assert.equal(calls.length, 2)
})

test('Z.ai maps CREDIT_LIMIT session and weekly windows plus monthly web searches', () => {
  const usage = zai._private.parseUsageSnapshot({
    success: true,
    code: 200,
    data: {
      limits: [
        { type: 'CREDIT_LIMIT', unit: 3, number: 5, percentage: 12, nextResetTime: 1800000000000 },
        { name: 'CREDIT_LIMIT', unit: 6, number: 1, percentage: 34, nextResetTime: 1800500000000 },
        { type: 'TIME_LIMIT', unit: 5, number: 1, usage: 4000, currentValue: 1828, nextResetTime: 1801000000000 },
      ],
    },
  })
  assert.equal(usage.sessionTokenLimit.usedPct, 12)
  assert.equal(usage.tokenLimit.usedPct, 34)
  assert.equal(usage.timeLimit.currentValue, 1828)
  assert.equal(usage.timeLimit.usage, 4000)
})

test('Z.ai rejects missing quota values and identifies no-subscription state without zeroing usage', async () => {
  assert.throws(() => zai._private.parseUsageSnapshot({
    success: true,
    code: 200,
    data: { limits: [{ type: 'CREDIT_LIMIT', unit: 3, number: 5 }] },
  }), /percentage/)
  assert.throws(() => zai._private.parseUsageSnapshot({
    success: false,
    code: 500,
    msg: 'current user has no coding plan',
  }), (error) => error.noCodingPlan === true)
  const missingPlan = await zai.read({
    credentials: { apiKey: 'fake-zai-token', region: 'global' },
    getJSON: async () => ({ success: false, code: 500, msg: 'current user has no coding plan' }),
  })
  assert.equal(missingPlan.connected, false)
  assert.equal(missingPlan.needsKey, false)
  assert.match(missingPlan.error, /No active GLM Coding Plan/)
})

test('Z.ai optional subscription and model endpoints preserve primary quota', async () => {
  const usage = await zai.read({
    credentials: { apiKey: 'fake-zai-token', region: 'global' },
    getJSON: async (url) => {
      if (url.includes('/quota/limit')) {
        return { success: true, code: 200, data: { limits: [{ type: 'CREDIT_LIMIT', unit: 3, number: 5, percentage: 9 }] } }
      }
      throw new Error('optional endpoint unavailable')
    },
  })
  assert.equal(usage.connected, true)
  assert.equal(usage.sessionTokenLimit.usedPct, 9)
  assert.equal(usage.planName, null)
  assert.equal(usage.modelUsage, null)
})

test('Copilot distinguishes paid credits, extra usage, free quotas, and org personal counts', () => {
  const paid = copilot._private.parseUsage({
    copilot_plan: 'pro',
    quota_snapshots: {
      premium_interactions: { entitlement: 300, remaining: 120, percent_remaining: 40, overage_permitted: true, overage_count: 7 },
      chat: { entitlement: -1, remaining: -1 },
      completions: { unlimited: true },
    },
  })
  assert.equal(paid.credits.usedPct, 60)
  assert.equal(paid.extraUsage, 7)
  assert.equal(paid.chat, null)

  const free = copilot._private.parseUsage({
    copilot_plan: 'individual',
    quota_snapshots: {
      premium_interactions: { entitlement: 0, remaining: 0 },
      chat: { entitlement: 200, remaining: 180 },
      completions: { entitlement: 2000, remaining: 1500 },
    },
  })
  assert.equal(free.credits, null)
  assert.equal(free.chat.usedPct, 10)
  assert.equal(free.completions.usedPct, 25)

  const org = copilot._private.parseUsage({
    copilot_plan: 'business',
    token_based_billing: true,
    quota_snapshots: { premium_interactions: { entitlement: 0, remaining: 0, credits_used: 2111, overage_permitted: true } },
  })
  assert.equal(org.personalCredits, 2111)
  assert.equal(org.extraUsage, null)
  assert.equal(org.isOrgManaged, true)
})

test('Copilot organization billing keeps credit counts and spend denominator-free', () => {
  const usage = copilot._private.parseOrgBilling({
    usageItems: [
      { product: 'Copilot', unitType: 'ai-units', grossQuantity: 100.5, netAmount: 1.25 },
      { product: 'Copilot', unitType: 'ai-credits', grossQuantity: 50, netAmount: 0.5 },
      { product: 'Copilot', unitType: 'user-months', grossQuantity: 10, netAmount: 190 },
    ],
  })
  assert.deepEqual(usage, { credits: 150.5, spendUSD: 1.75 })
})

test('Copilot optional organization failure preserves personal usage', async () => {
  const usage = await copilot.read({
    token: 'fake-copilot-token',
    fetchWithTimeout: async (url) => {
      if (url.includes('/copilot_internal/user')) {
        return response(200, {
          copilot_plan: 'business',
          token_based_billing: true,
          quota_snapshots: { premium_interactions: { entitlement: 0, remaining: 0, credits_used: 12 } },
        })
      }
      return response(403, {})
    },
  })
  assert.equal(usage.connected, true)
  assert.equal(usage.personalCredits, 12)
  assert.equal(usage.orgBilling, null)
})

test('Antigravity local protobuf history stays measured and joins native quota', async () => {
  const timestamp = Math.floor(Date.now() / 1000) - 60
  const blob = generationBlob(timestamp)
  const event = antigravityHistory._private.generationEvent(blob)
  assert.equal(event.inputTokens, 1000)
  assert.equal(event.cacheReadTokens, 50)
  assert.equal(event.outputTokens, 200)

  const usage = await antigravity.read({
    candidates: [{ pid: 123, port: 43123, ports: [], csrf: 'fake-csrf' }],
    localRequest: async (url) => url.endsWith('/RetrieveUserQuotaSummary')
      ? response(200, { groups: [{ buckets: [{ bucketId: 'gemini-5h', remainingFraction: 0.8 }] }] })
      : response(200, { userStatus: { userTier: { name: 'Pro' } } }),
    files: ['/fixture/conversation.db'],
    fs: {
      statSync: () => ({ ino: 1, size: 100, mtimeMs: 1 }),
    },
    execFileSync: (_bin, args) => {
      const sql = args[args.length - 1]
      if (sql.includes('pragma_table_info')) return '[]'
      return JSON.stringify([{ idx: 0, hex: blob.toString('hex').toUpperCase() }])
    },
    tokenHistoryDays: 30,
  })

  assert.equal(usage.connected, true)
  assert.equal(usage.windows[0].label, 'Session')
  assert.equal(usage.tokenUsage.total, 1250)
  assert.equal(usage.tokenUsage.measured, true)
  assert.equal(usage.tokenUsage.dailyBreakdown.length, 1)
  assert.equal(usage.tokenUsage.modelBreakdowns[0].model, 'gemini-3.1-pro')
})

test('Antigravity pricing normalizes app display labels without merging unknown models', () => {
  assert.equal(tokenCost._private.normalizeAntigravityModel('Gemini 3.1 Pro (High)'), 'gemini-3.1-pro')
  assert.equal(tokenCost._private.normalizeAntigravityModel('Claude Opus 4.6 (Thinking)'), 'claude-opus-4-6')
  assert.equal(tokenCost._private.normalizeAntigravityModel('future-model-zeta'), 'future-model-zeta')
})

test('aggregate keeps Devin windows and zero extra balance distinct', async () => {
  const original = devin.read
  devin.read = async () => ({
    connected: true,
    plan: 'Max',
    weekly: { usedPct: 100, resetAt: 1800500000000, periodMs: 7 * 86400000 },
    daily: { usedPct: 25, resetAt: 1800000000000, periodMs: 86400000 },
    extraBalanceUSD: 0,
    source: 'Devin CLI',
    lastActive: Date.now(),
  })
  try {
    const providers = config._private.normalizeProviders({})
    const output = await aggregate._private.buildProvider('devin', providers.devin, { endMs: 1801000000000, daysLeft: 10 }, { tokenHistoryDays: 30 })
    assert.deepEqual(output.windows.map((item) => item.label), ['Weekly', 'Daily'])
    assert.deepEqual(output.extra, [
      { label: 'Extra Balance', value: '$0.00' },
      { label: 'Source', value: 'Devin CLI' },
    ])
  } finally {
    devin.read = original
  }
})

test('aggregate keeps Z.ai missing quota unavailable and web-search count measured', async () => {
  const original = zai.read
  const providers = config._private.normalizeProviders({})
  try {
    zai.read = async () => ({ connected: true, planName: null, tokenLimit: null, sessionTokenLimit: null, timeLimit: null, modelUsage: null })
    const missing = await aggregate._private.buildProvider('zai', providers.zai, { endMs: 1801000000000, daysLeft: 10 }, { tokenHistoryDays: 30 })
    assert.equal(missing.capturedPct, null)
    assert.deepEqual(missing.windows, [])

    zai.read = async () => ({
      connected: true,
      planName: 'GLM Coding Max',
      sessionTokenLimit: { usedPct: 12, nextResetAt: 1800000000000, windowMinutes: 300, windowLabel: '5 hours window' },
      tokenLimit: { usedPct: 34, nextResetAt: 1800500000000, windowMinutes: 10080, windowLabel: '1 week window' },
      timeLimit: { usedPct: 45.7, currentValue: 1828, usage: 4000, nextResetAt: 1801000000000, isMCPMonthlyMarker: true },
      modelUsage: null,
    })
    const measured = await aggregate._private.buildProvider('zai', providers.zai, { endMs: 1801000000000, daysLeft: 10 }, { tokenHistoryDays: 30 })
    assert.deepEqual(measured.windows.map((item) => item.label), ['Weekly', 'Web Searches', 'Session'])
    assert.equal(measured.windows[1].valueLabel, '1828 / 4000 searches')
    assert.deepEqual(measured.extra, [{ label: 'Web Searches', value: '1828 / 4000' }])
  } finally {
    zai.read = original
  }
})

test('aggregate renders Copilot personal and organization counts without invented windows', async () => {
  const original = copilot.read
  copilot.read = async () => ({
    connected: true,
    plan: 'Copilot Business',
    credits: null,
    chat: null,
    completions: null,
    personalCredits: 2111,
    extraUsage: null,
    orgBilling: { credits: 298.5, spendUSD: 0 },
    resetAt: null,
  })
  try {
    const providers = config._private.normalizeProviders({})
    const output = await aggregate._private.buildProvider('copilot', providers.copilot, { endMs: 1801000000000, daysLeft: 10 }, { tokenHistoryDays: 30 })
    assert.equal(output.capturedPct, null)
    assert.deepEqual(output.windows, [])
    assert.deepEqual(output.extra, [
      { label: 'Credits used', value: '2111' },
      { label: 'Org Credits', value: '298.5' },
      { label: 'Org Spend', value: '$0.00' },
    ])
  } finally {
    copilot.read = original
  }
})
