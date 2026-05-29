const assert = require('node:assert/strict')
const test = require('node:test')

const { buildUsageExport, SCHEMA } = require('../lib/usage-export')

const SNAPSHOT = {
  generatedAt: 1700000000000,
  cycle: { label: 'May cycle', daysLeft: 3, totalDays: 31 },
  totals: {
    totalValue: 584,
    spent: 178.736,
    left: 405.264,
    capturedPct: 31,
    planCount: 5,
    tokens: {
      input: 2059522480,
      cached: 3562772390,
      output: 14866852,
      total: 5637161722,
      costUSD: 5035.23246,
      historyDays: 30,
      dailyCost: {
        days: [
          { dayKey: '2026-05-27', total: 1000, input: 600, cached: 300, output: 100, costUSD: 1.234 },
          { dayKey: '2026-05-28', total: 2000, input: 1200, cached: 600, output: 200, costUSD: 2.5 },
        ],
      },
    },
  },
  providers: [
    {
      id: 'claude',
      name: 'Claude',
      plan: 'Max 20x',
      connected: true,
      activity: 'live',
      lastUpdatedAt: 1699999000000,
      totalValue: 200,
      spentValue: 88.5,
      leftValue: 111.5,
      capturedPct: 44,
      status: { indicator: 'none', label: 'Operational' },
      error: null,
      tokenUsage: {
        input: 100,
        cached: 50,
        output: 25,
        total: 175,
        costUSD: 3.21,
        source: 'local Claude',
        modelBreakdowns: [{ model: 'opus', input: 100, cached: 50, output: 25, total: 175, costUSD: 3.21 }],
        dailyBreakdown: [{ date: '2026-05-28', input: 100, cached: 50, output: 25, total: 175, costUSD: 3.21 }],
      },
    },
    { id: 'cursor', name: 'Cursor', plan: 'Pro', connected: true, activity: 'stale', tokenUsage: null },
  ],
}

test('buildUsageExport throws without a snapshot', () => {
  assert.throws(() => buildUsageExport(null), /No usage snapshot/)
})

test('buildUsageExport produces a self-describing, rounded payload', () => {
  const out = buildUsageExport(SNAPSHOT, { now: 1700000005000, appVersion: '1.2.3' })
  assert.equal(out.schema, SCHEMA)
  assert.equal(out.exportedAt, '2023-11-14T22:13:25.000Z')
  assert.equal(out.generatedAt, '2023-11-14T22:13:20.000Z')
  assert.deepEqual(out.app, { name: 'MaxxToken', version: '1.2.3' })
  assert.equal(out.totals.budgetUSD, 584)
  assert.equal(out.totals.spentUSD, 178.74) // rounded to 2dp
  assert.equal(out.totals.tokens.total, 5637161722)
  assert.equal(out.totals.tokens.costUSD, 5035.23)
})

test('buildUsageExport includes cross-provider cost history', () => {
  const out = buildUsageExport(SNAPSHOT)
  assert.equal(out.costHistory.length, 2)
  assert.deepEqual(out.costHistory[0], { date: '2026-05-27', total: 1000, input: 600, cached: 300, output: 100, costUSD: 1.23 })
})

test('buildUsageExport maps providers, tokens, models, daily history', () => {
  const out = buildUsageExport(SNAPSHOT)
  assert.equal(out.providers.length, 2)
  const claude = out.providers[0]
  assert.equal(claude.id, 'claude')
  assert.equal(claude.spentUSD, 88.5)
  assert.equal(claude.tokens.total, 175)
  assert.equal(claude.tokens.costUSD, 3.21)
  assert.equal(claude.models[0].model, 'opus')
  assert.equal(claude.dailyHistory[0].date, '2026-05-28')
  assert.equal(claude.lastUpdatedAt, '2023-11-14T21:56:40.000Z')

  const cursor = out.providers[1]
  assert.equal(cursor.tokens, null)
  assert.deepEqual(cursor.models, [])
  assert.deepEqual(cursor.dailyHistory, [])
})
