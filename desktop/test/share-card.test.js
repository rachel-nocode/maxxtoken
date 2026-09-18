const test = require('node:test')
const assert = require('node:assert/strict')
const { buildCard } = require('../lib/share-card')

function snapshot() {
  return { providers: [{ id: 'claude@123456789abc', providerFamily: 'claude', name: 'Claude', account: { label: 'Private workspace' }, windows: [{ label: 'Weekly', usedPct: 20 }], tokenUsage: { source: 'local logs', dailyBreakdown: [{ date: '2026-09-17', total: 100, costUSD: 1.25 }] } }] }
}

function aggregateSnapshot() {
  return {
    providers: [
      {
        id: 'claude@123456789abc', providerFamily: 'claude', name: 'Claude',
        account: { label: '<Team & One>' },
        tokenUsage: { dailyBreakdown: [
          { date: '2026-09-17', total: 100, costUSD: 1.25, pricedTokens: 80, pricedCostUSD: 1.25, costCoverage: 'partial', unpricedModels: ['custom'] },
          { date: '2026-09-16', total: 250, costUSD: 2.5 },
        ] },
      },
      {
        id: 'codex@123456789abc', providerFamily: 'codex', name: 'Codex',
        account: { label: 'Work' },
        tokenUsage: { dailyBreakdown: [{ date: '2026-09-17', total: 50, costUSD: 0.75 }] },
      },
    ],
  }
}

test('share cards omit account labels and spend before rendering when redacted', () => {
  const card = buildCard(snapshot(), { kind: 'provider', providerId: 'claude@123456789abc', period: 'today', now: new Date(2026, 8, 17, 12).getTime(), redact: { spend: true } })
  assert.doesNotMatch(card.html, /Private workspace|claude@|1\.25/)
  assert.match(card.html, /Spend hidden/)
  assert.match(card.html, /Maxx<span>Token/)
  assert.match(card.html, /default-src 'none'/)
})

test('share cards use selected calendar period and escape provider text', () => {
  const raw = snapshot()
  raw.providers[0].name = '<script>bad()</script>'
  const card = buildCard(raw, { kind: 'provider', providerId: raw.providers[0].id, period: 'today', now: new Date(2026, 8, 17, 12).getTime(), redact: { accountLabels: false } })
  assert.match(card.html, /&lt;script&gt;/)
  assert.doesNotMatch(card.html, /<script>/)
  assert.match(card.html, /Private workspace/)
  assert.equal(card.report.period, 'today')
  assert.throws(() => buildCard(raw, { kind: 'provider', providerId: 'missing' }), /no longer available/)
})

test('aggregate cards render the selected metric for the current period', () => {
  const now = new Date(2026, 8, 17, 12).getTime()
  const tokens = buildCard(aggregateSnapshot(), { kind: 'aggregate', metric: 'tokens', period: 'yesterday', now })
  assert.equal(tokens.report.period, 'yesterday')
  assert.equal(tokens.projection.metric, 'tokens')
  assert.equal(tokens.projection.total, 250)
  assert.match(tokens.html, /Token usage/)
  assert.match(tokens.html, /<strong>250<\/strong>/)
  assert.doesNotMatch(tokens.html, /\$2\.5/)

  const cost = buildCard(aggregateSnapshot(), { kind: 'aggregate', metric: 'cost', period: 'today', now })
  assert.equal(cost.projection.metric, 'cost')
  assert.equal(cost.projection.total, 2)
  assert.match(cost.html, /API-equivalent cost/)
  assert.match(cost.html, /<strong>\$2<sup>\*<\/sup><\/strong>/)
  assert.match(cost.html, /Partial cost coverage/)
})

test('aggregate account labels appear only when explicitly unredacted and remain escaped', () => {
  const options = { kind: 'aggregate', metric: 'tokens', period: 'today', now: new Date(2026, 8, 17, 12).getTime() }
  const hidden = buildCard(aggregateSnapshot(), options)
  assert.doesNotMatch(hidden.html, /Team|Work/)

  const visible = buildCard(aggregateSnapshot(), { ...options, redact: { accountLabels: false } })
  assert.match(visible.html, /Claude · &lt;Team &amp; One&gt;/)
  assert.match(visible.html, /Codex · Work/)
  assert.doesNotMatch(visible.html, /<Team & One>/)
})

test('spend redaction overrides a cost selection without leaking cost values', () => {
  const card = buildCard(aggregateSnapshot(), {
    kind: 'aggregate', metric: 'costPerMTok', period: 'today',
    now: new Date(2026, 8, 17, 12).getTime(), redact: { spend: true, accountLabels: true },
  })
  assert.equal(card.projection.metric, 'tokens')
  assert.match(card.html, /Token usage/)
  assert.match(card.html, /Spend hidden/)
  assert.doesNotMatch(card.html, /\$|Private|Team|Work/)
})
