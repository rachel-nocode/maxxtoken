const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const BurnReport = require('../burn/burn-report')

function provider(id, dailyBreakdown) {
  return { id, name: id, tokenUsage: { source: 'test history', dailyBreakdown } }
}

test('preserves date-only local calendar keys west of UTC', () => {
  const previous = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    const report = BurnReport.build({ providers: [provider('codex', [
      { date: '2026-09-17', totalTokens: 100, costUSD: 1 },
    ])] }, { period: 'today', now: new Date('2026-09-17T12:00:00-07:00').getTime() })
    assert.equal(report.startDate, '2026-09-17')
    assert.equal(report.slices[0].tokens, 100)
  } finally {
    process.env.TZ = previous
  }
})

test('emits all 30 calendar days and marks missing observations', () => {
  const report = BurnReport.build({ providers: [provider('claude', [
    { date: '2026-09-17', totalTokens: 10, costUSD: 0 },
  ])] }, { period: '30d', now: new Date('2026-09-17T12:00:00Z').getTime() })
  assert.equal(report.days.length, 30)
  assert.equal(report.days.at(-1).observed, true)
  assert.equal(report.days.filter((day) => !day.observed).length, 29)
})

test('cost per MTok excludes partial rows without precise priced coverage', () => {
  const report = BurnReport.build({ providers: [
    provider('partial', [{ date: '2026-09-17', totalTokens: 2_000_000, costUSD: 10, unpricedModels: ['unknown'] }]),
    provider('paired', [{ date: '2026-09-17', totalTokens: 1_000_000, costUSD: 20 }]),
    provider('precise-partial', [{ date: '2026-09-17', totalTokens: 4_000_000, costUSD: 30, pricedTokens: 1_000_000, pricedCostUSD: 5, unpricedModels: ['other'] }]),
  ] }, { period: 'today', now: new Date('2026-09-17T12:00:00Z').getTime() })
  assert.equal(report.projection('costPerMTok').slices.length, 2)
  assert.equal(report.totals.pairedTokens, 2_000_000)
  assert.equal(report.totals.pairedUSD, 25)
  assert.equal(report.totals.costPerMTok, 12.5)
})

test('selected period controls model totals and preserves partial model pricing', () => {
  const snapshot = { providers: [provider('codex', [
    { date: '2026-09-17', totalTokens: 100, costUSD: 1, modelBreakdowns: [{ model: 'a', totalTokens: 100, costUSD: 1 }] },
    { date: '2026-09-16', totalTokens: 200, costUSD: 2, modelBreakdowns: [{ model: 'a', totalTokens: 100 }, { model: 'b', totalTokens: 100, costUSD: 2 }] },
  ])] }
  const now = new Date('2026-09-17T12:00:00Z').getTime()
  const today = BurnReport.build(snapshot, { period: 'today', now })
  const yesterday = BurnReport.build(snapshot, { period: 'yesterday', now })
  assert.deepEqual(today.models.map((model) => model.label), ['a'])
  assert.deepEqual(yesterday.models.map((model) => model.label).sort(), ['a', 'b'])
  assert.equal(yesterday.models.find((model) => model.label === 'a').unpriced, true)
})

test('combined usage is compact by default and reveals the full report on demand', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'burn', 'burn-home.js'), 'utf8')
  const context = {
    BurnReport,
    Date,
    BURN: {
      accentBtnBg: '#222', accentBtnBorder: '#555', border: '#333', borderHi: '#444',
      lime: '#9f3', limeText: '#af4', surface2: '#181818', text: '#fff', text2: '#aaa',
      text3: '#777', text4: '#444',
    },
    BURN_FONT: { mono: 'monospace', sans: 'sans-serif' },
    bstyle: (styles) => Object.entries(styles).map(([key, value]) => `${key}:${value}`).join(';'),
    burnEsc: (value) => String(value),
    burnGhostBtn: () => '',
    burnIcon: (name) => `<i>${name}</i>`,
  }
  vm.createContext(context)
  vm.runInContext(source, context)
  const today = new Date().toISOString().slice(0, 10)
  const base = {
    lastSnap: { providers: [provider('codex', [{ date: today, totalTokens: 100, costUSD: 1 }])] },
    reportPeriod: '30d', reportMetric: 'cost', reportModelsOpen: false,
    openUsagePrefs: { combinedUsageExpanded: false },
  }
  const collapsed = context.burnReportCard(base)
  assert.match(collapsed, /aria-expanded="false"/)
  assert.match(collapsed, /30 days · \$1\.00/)
  assert.doesNotMatch(collapsed, /data-burn-report-metric/)

  const expanded = context.burnReportCard({ ...base, openUsagePrefs: { combinedUsageExpanded: true } })
  assert.match(expanded, /aria-expanded="true"/)
  assert.match(expanded, /id="burn-report-details"/)
  assert.match(expanded, /data-burn-report-metric="cost"/)
})

test('BURN loads active report, settings, sharing, clocks, and credit controls', () => {
  const root = path.join(__dirname, '..')
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  const app = fs.readFileSync(path.join(root, 'burn', 'burn-app.js'), 'utf8')
  const home = fs.readFileSync(path.join(root, 'burn', 'burn-home.js'), 'utf8')
  const settings = fs.readFileSync(path.join(root, 'burn', 'burn-settings.js'), 'utf8')
  const primitives = fs.readFileSync(path.join(root, 'burn', 'burn-primitives.js'), 'utf8')
  const css = fs.readFileSync(path.join(root, 'burn', 'burn.css'), 'utf8')
  assert.match(index, /burn\/burn-report\.js/)
  assert.match(home, /data-burn-report-period/)
  assert.match(home, /data-burn-report-toggle/)
  assert.match(home, /combinedUsageExpanded/)
  assert.match(home, /data-burn-share=/)
  assert.match(home, /data-burn-clock=/)
  assert.match(home, /data-burn-credit=/)
  assert.match(home, /aria-hidden=.*inert/)
  assert.match(css, /\.burn-detail[\s\S]*visibility:\s*hidden/)
  assert.match(settings, /Projected near exhaustion/)
  assert.match(settings, /Cross-Mac history sync/)
  assert.match(settings, /Global popover shortcut/)
  assert.match(primitives, /role="switch" aria-label=/)
  assert.match(primitives, /data-burn-collapse=.*aria-expanded=/)
  assert.match(app, /getOpenUsagePrefs/)
  assert.match(app, /combinedUsageExpanded/)
  assert.match(app, /setGlobalShortcut/)
})
