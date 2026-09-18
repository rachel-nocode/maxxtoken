const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const BurnMetrics = require('../burn/burn-metrics')
const config = require('../lib/config')
const { trayPinnedStateFromSnapshot } = require('../lib/tray-burn-icon')

function loadClassic(file, context = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'burn', file), 'utf8')
  vm.createContext(context)
  vm.runInContext(source, context)
  return context
}

function provider() {
  return {
    id: 'claude',
    name: 'Claude',
    connected: true,
    capturedPct: 42,
    remainingPct: 58,
    spentValue: 84,
    leftValue: 116,
    valueLabel: 'live quota',
    windows: [
      { label: 'Session', kind: '5h', usedPct: 42, remainingPct: 58, resetAt: Date.now() + 3600000 },
      { label: 'Weekly', kind: '7d', usedPct: 31, remainingPct: 69, resetAt: Date.now() + 86400000 },
      { label: 'Sonnet', kind: '7d', usedPct: 10, resetAt: Date.now() + 86400000 },
      { label: 'Opus', kind: '7d', usedPct: 20, resetAt: Date.now() + 86400000 },
      { label: 'Agent SDK', kind: 'agent-sdk-credit', valueLabel: '$15 / $200', resetAt: Date.now() + 86400000 },
    ],
    extra: [{ label: 'Extra usage', value: '$12.34' }],
    tokenUsage: {
      total: 300,
      modelBreakdowns: [
        { model: 'claude-sonnet', total: 200, costUSD: 0.001234, costAccuracy: 'estimate', pricingSource: 'models.dev' },
        { model: 'future-model', total: 100, costUSD: null },
      ],
    },
  }
}

test('OU-03 registry keeps bounded windows, scalar balances, extras, and model rows reachable', () => {
  const metrics = BurnMetrics.registryForProvider(provider())
  assert.equal(metrics.filter((metric) => metric.type === 'window').length, 5)
  assert.ok(metrics.some((metric) => metric.label === 'Agent SDK'))
  assert.ok(metrics.some((metric) => metric.label === 'Extra usage'))
  assert.ok(metrics.some((metric) => metric.label === 'Plan value left'))
  assert.ok(metrics.some((metric) => metric.label === 'future-model'))

  const result = BurnMetrics.applyLayout(metrics, null)
  assert.equal(result.primary.length, 2)
  assert.equal(result.primary.length + result.expanded.length, metrics.length)
})

test('OU-05 layout migration preserves hidden rows and appends each new metric once', () => {
  const original = BurnMetrics.registryForProvider(provider())
  const hiddenId = original[0].id
  const saved = BurnMetrics.reconcileLayout({
    order: original.map((metric) => metric.id),
    primary: [original[1].id],
    hidden: [hiddenId],
    knownMetricIds: original.map((metric) => metric.id),
  }, original)
  const changedProvider = provider()
  changedProvider.extra.push({ label: 'New balance', value: '7' })
  const changed = BurnMetrics.registryForProvider(changedProvider)
  const migrated = BurnMetrics.reconcileLayout(saved, changed)
  const migratedAgain = BurnMetrics.reconcileLayout(migrated, changed)
  assert.ok(migrated.hidden.includes(hiddenId))
  assert.equal(migrated.order.length, changed.length)
  assert.deepEqual(migratedAgain, migrated)

  const temporarilyMissing = changed.filter((metric) => metric.id !== hiddenId)
  const withoutHidden = BurnMetrics.reconcileLayout(migrated, temporarilyMissing)
  const returned = BurnMetrics.reconcileLayout(withoutHidden, changed)
  assert.ok(returned.hidden.includes(hiddenId))
  assert.ok(!returned.primary.includes(hiddenId))
})

test('OU-04 pinned metrics persist order, omit missing data, and honor used or left mode', () => {
  const raw = provider()
  const metrics = BurnMetrics.registryForProvider(raw)
  const layout = BurnMetrics.reconcileLayout(null, metrics)
  const session = metrics.find((metric) => metric.label === 'Session')
  const extra = metrics.find((metric) => metric.label === 'Extra usage')
  const state = trayPinnedStateFromSnapshot({ providers: [raw] }, {
    providerOrder: ['claude'],
    usageMeterMode: 'left',
    metricLayouts: { claude: layout },
    trayPins: [
      { providerId: 'claude', metricId: extra.id, style: 'text' },
      { providerId: 'claude', metricId: session.id, style: 'bar' },
      { providerId: 'claude', metricId: 'claude:window:missing', style: 'bar' },
    ],
  })
  assert.equal(state.bars.length, 1)
  assert.equal(state.bars[0].pct, 58)
  assert.match(state.title, /Claude \$12\.34/)
  assert.doesNotMatch(state.tooltip, /missing/)
})

test('OU-05 config persists normalized layouts, pins, and expanded providers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-layout-'))
  const file = path.join(dir, 'config.json')
  const metricId = 'claude:window:5h-session'
  config.saveConfig({
    providers: { claude: { enabled: true } },
    trayMetric: 'pins',
    trayPins: [
      { providerId: 'claude', metricId, style: 'bar' },
      { providerId: 'claude', metricId: 'claude:window:weekly', style: 'text' },
      { providerId: 'claude', metricId: 'claude:window:third', style: 'text' },
    ],
    metricLayouts: { claude: { order: [metricId], primary: [metricId], hidden: [], knownMetricIds: [metricId] } },
    expandedProviderIds: ['claude', 'unknown'],
  }, file)
  const loaded = config.loadConfig(file)
  assert.equal(loaded.trayMetric, 'pins')
  assert.equal(loaded.trayPins.length, 2)
  assert.deepEqual(loaded.expandedProviderIds, ['claude'])
  assert.deepEqual(loaded.metricLayouts.claude.primary, [metricId])
})

test('OU-05 session changes can be undone without losing the saved metric identity', () => {
  const context = loadClassic('burn-app.js', {
    console,
    window: { maxx: {} },
    document: { readyState: 'loading', addEventListener() {} },
    setTimeout() { return 1 },
    clearTimeout() {},
  })
  vm.runInContext(`
    burnState.metricLayouts = { claude: { version: 1, order: ['metric-a'], primary: ['metric-a'], hidden: [], knownMetricIds: ['metric-a'] } }
    burnSetMetricPlacement('claude', 'metric-a', 'hidden')
  `, context)
  assert.equal(vm.runInContext(`burnState.metricLayouts.claude.hidden[0]`, context), 'metric-a')
  vm.runInContext(`burnRestoreLayoutSnapshot(burnState.layoutUndo.pop())`, context)
  assert.equal(vm.runInContext(`burnState.metricLayouts.claude.primary[0]`, context), 'metric-a')
  assert.equal(vm.runInContext(`burnState.metricLayouts.claude.hidden.length`, context), 0)
})

test('OU-06 stale errors preserve last-good data and include recovery guidance', () => {
  const home = loadClassic('burn-home.js', { Date })
  const healthyDataWithError = {
    metrics: [{ id: 'one' }],
    windows: [],
    _raw: { connected: true, error: 'request timed out', lastUpdatedAt: Date.now() - 60000 },
  }
  const health = home.burnProviderHealth(healthyDataWithError, Date.now())
  assert.equal(health.kind, 'stale')
  assert.match(health.detail, /Check the connection/)
  assert.equal(home.burnProviderHealth({ metrics: [], windows: [], _raw: { connected: false } }, Date.now()).kind, 'error')
})

test('OU-07 calendar periods use exact local dates and do not borrow sparse days', () => {
  const burn = loadClassic('burn-adapt.js', { Date, BurnMetrics })
  const now = new Date(2026, 2, 9, 0, 30).getTime()
  const key = (days) => {
    const date = new Date(2026, 2, 9 - days, 12)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  const expanded = burn.burnAdaptExpanded({
    tokenUsage: {
      total: 30,
      input: 20,
      output: 10,
      dailyBreakdown: [
        { date: key(1), total: 10, costUSD: 0 },
        { date: key(3), total: 20, costUSD: null },
        { date: key(31), total: 500, costUSD: 50 },
      ],
    },
  }, { now })
  assert.equal(expanded.tokens.today.available, false)
  assert.equal(expanded.tokens.today.tok, null)
  assert.equal(expanded.tokens.yest.tok, 0.00001)
  assert.equal(expanded.tokens.yest.usd, 0)
  assert.ok(Math.abs(expanded.tokens.last30.tok - 0.00003) < 1e-12)
  assert.equal(expanded.tokens.last30.usd, 0)

  const measuredZero = burn.burnAdaptExpanded({ tokenUsage: { total: 0, dailyBreakdown: [{ date: key(0), total: 0, costUSD: 0 }] } }, { now })
  assert.equal(measuredZero.hasTokenSource, true)
  assert.equal(measuredZero.tokens.today.available, true)
  assert.equal(measuredZero.tokens.today.tok, 0)
  assert.equal(measuredZero.tokens.today.usd, 0)
})

test('OU-08 pricing keeps unknown rates unknown and exposes partial provenance', () => {
  const burn = loadClassic('burn-adapt.js', { Date, BurnMetrics })
  const today = burn.burnLocalDayKey(Date.now())
  const expanded = burn.burnAdaptExpanded({
    tokenUsage: {
      total: 300,
      input: 200,
      output: 100,
      costUSD: 0.001234,
      costAccuracy: 'estimate',
      pricingSource: 'models.dev',
      unpricedModels: ['future-model'],
      dailyBreakdown: [{ date: today, total: 300, costUSD: 0.001234 }],
      modelBreakdowns: [
        { model: 'priced', total: 200, costUSD: 0.001234, pricingSource: 'models.dev' },
        { model: 'future-model', total: 100, costUSD: null },
      ],
    },
  })
  assert.equal(expanded.models.find((model) => model.name === 'future-model').usd, null)
  assert.equal(expanded.tokens.today.usd, 0.001234)
  assert.equal(expanded.pricing.accuracy, 'estimated')
  assert.equal(expanded.pricing.source, 'models.dev')
  assert.deepEqual(JSON.parse(JSON.stringify(expanded.pricing.unpricedModels)), ['future-model'])
  assert.match(expanded.costMeta, /partial estimated/)
})

test('OU-03/06/08 renderer exposes scalar metrics, recovery controls, and exact pricing details', () => {
  const BURN = { text: '#fff', text2: '#aaa', limeText: '#0f0', warnText: '#f60', warnRowBg: '#210', borderHi: '#555', surface2: '#222' }
  const home = loadClassic('burn-home.js', {
    Date,
    BURN,
    BURN_FONT: { sans: 'sans', mono: 'mono' },
    bstyle: () => '',
    burnEsc: (value) => String(value),
    burnGhostBtn: () => '',
    burnFormatTokensM: (value) => String(value),
    burnCostKind: (value) => value || 'measured',
  })
  assert.match(home.burnMetric({ type: 'scalar', label: 'Extra usage', value: '$12.34' }, 'used'), /Extra usage.*\$12\.34/)
  const failure = home.burnProviderFailure({ detail: 'Reconnect the account.' }, { id: 'claude', _raw: { needsKey: true, links: { dashboard: 'https://example.test', status: 'https://status.example.test' } } })
  assert.match(failure, /refresh:claude/)
  assert.match(failure, /account:claude/)
  assert.match(failure, /status:claude/)
  const priced = home.burnCostRow('Today', { tok: 0.0003, usd: 0.001234, pricing: { accuracy: 'estimated', source: 'models.dev', unpricedModels: ['future-model'] } })
  assert.match(priced, /exact \$0\.001234/)
  assert.match(priced, /omits future-model/)
})
