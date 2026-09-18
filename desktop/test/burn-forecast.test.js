const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const { _private } = require('../lib/aggregate')
const opencodego = require('../lib/adapters/opencode-go')

const NOW = Date.parse('2026-09-16T18:00:00Z')
const DAY = 24 * 60 * 60 * 1000

function loadClassic(file, context = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'burn', file), 'utf8')
  vm.createContext(context)
  vm.runInContext(source, context)
  return context
}

function weeklyWindow(overrides = {}) {
  return {
    label: 'Weekly',
    kind: '7d',
    usedPct: 25,
    resetAt: NOW + 3.5 * DAY,
    periodMs: 7 * DAY,
    ...overrides,
  }
}

test('pace projects remaining allowance and excess demand at reset', () => {
  const reserve = _private.paceForWindow(weeklyWindow(), NOW)
  assert.equal(reserve.projectedAtResetPercent, 50)
  assert.equal(reserve.projectedLeftPercent, 50)
  assert.equal(reserve.projectedOverPercent, 0)

  const over = _private.paceForWindow(weeklyWindow({ usedPct: 80 }), NOW)
  assert.equal(over.projectedAtResetPercent, 160)
  assert.equal(over.projectedLeftPercent, 0)
  assert.equal(over.projectedOverPercent, 60)
  assert.equal(over.willLastToReset, false)
})

test('pace projects untouched zero and rejects missing, inferred-reset, and rolled-over windows', () => {
  assert.equal(_private.paceForWindow(weeklyWindow({ usedPct: 0 }), NOW).projectedLeftPercent, 100)
  assert.equal(_private.paceForWindow(weeklyWindow({ usedPct: 0, resetAt: NOW + 7 * DAY + 60000 }), NOW).projectedLeftPercent, 100)
  assert.equal(_private.paceForWindow(weeklyWindow({ usedPct: 1, resetAt: NOW + 6.9 * DAY }), NOW).projectedAtResetPercent, 70)
  assert.equal(_private.paceForWindow(weeklyWindow({ resetAt: null }), NOW), null)
  assert.equal(_private.paceForWindow(weeklyWindow({ forecastEligible: false }), NOW), null)
  assert.equal(_private.paceForWindow(weeklyWindow({ resetAt: NOW - 1 }), NOW), null)
})

test('cycle windows forecast immediately with an inferred 30 day period', () => {
  const pace = _private.paceForWindow({
    label: 'Total Usage',
    kind: 'cycle',
    usedPct: 10,
    resetAt: NOW + 27 * DAY,
  }, NOW)
  assert.equal(pace.expectedUsedPercent, 10)
  assert.equal(pace.projectedAtResetPercent, 100)
})

test('calendar-cycle forecast uses the preceding month boundary', () => {
  const now = Date.parse('2026-08-16T00:00:00.000Z')
  const pace = _private.paceForWindow({
    label: 'Total Usage',
    kind: 'cycle',
    usedPct: 50,
    resetAt: Date.parse('2026-09-01T00:00:00.000Z'),
  }, now)
  assert.equal(pace.expectedUsedPercent, 48)
  assert.equal(pace.projectedAtResetPercent, 103)
})

test('provider pacing removes cached and rollover forecasts', () => {
  const cached = _private.addProviderPace({
    connected: true,
    sourceLabel: 'cached usage',
    pace: { projectedAtResetPercent: 70 },
    windows: [{ ...weeklyWindow(), pace: { projectedAtResetPercent: 70 } }],
  }, NOW)
  assert.equal(cached.pace, undefined)
  assert.equal(cached.windows[0].pace, undefined)

  const rolled = _private.addProviderPace({
    connected: true,
    pace: { projectedAtResetPercent: 70 },
    windows: [{ ...weeklyWindow({ resetAt: NOW - 1 }), pace: { projectedAtResetPercent: 70 } }],
  }, NOW)
  assert.equal(rolled.pace, undefined)
  assert.equal(rolled.windows[0].pace, undefined)

  const oldProvider = _private.addProviderPace({
    connected: true,
    activity: 'live',
    lastUpdatedAt: NOW - 6 * 60 * 1000,
    windows: [weeklyWindow()],
  }, NOW)
  assert.equal(oldProvider.windows[0].pace, undefined)

  const staleProvider = _private.addProviderPace({
    connected: true,
    activity: 'stale',
    lastUpdatedAt: NOW,
    windows: [weeklyWindow()],
  }, NOW)
  assert.equal(staleProvider.windows[0].pace, undefined)

  const disconnected = _private.addProviderPace({
    connected: false,
    pace: { projectedAtResetPercent: 70 },
    windows: [{ ...weeklyWindow(), pace: { projectedAtResetPercent: 70 } }],
  }, NOW)
  assert.equal(disconnected.pace, undefined)
  assert.equal(disconnected.windows[0].pace, undefined)
})

test('OpenCode Go local rolling reset cannot become an authoritative forecast', async () => {
  const originalRead = opencodego.read
  opencodego.read = async () => ({
    connected: true,
    usageSource: 'local db',
    rolling: { usedPct: 20, resetAt: NOW + 2.5 * 60 * 60 * 1000 },
    weekly: { usedPct: 25, resetAt: NOW + 3.5 * DAY },
    monthly: { usedPct: 20, resetAt: NOW + 15 * DAY },
    zenBalanceUSD: null,
  })
  try {
    const provider = await _private.buildProvider(
      'opencodego',
      { name: 'OpenCode Go', plan: 'Go', monthly: 10 },
      { endMs: NOW + 15 * DAY },
      { tokenHistoryDays: 30 },
    )
    const rolling = provider.windows.find((window) => window.kind === '5h')
    const weekly = provider.windows.find((window) => window.kind === '7d')
    const monthly = provider.windows.find((window) => window.kind === 'cycle')
    assert.equal(rolling.forecastEligible, false)
    assert.equal(rolling.forecastDisabledReason, 'synthetic-reset')
    assert.equal(weekly.forecastEligible, false)
    assert.equal(weekly.forecastDisabledReason, 'inferred-quota')
    assert.equal(monthly.forecastEligible, false)
    assert.equal(monthly.forecastDisabledReason, 'inferred-quota')

    const paced = _private.addProviderPace(provider, NOW)
    assert.equal(paced.windows.find((window) => window.kind === '5h').pace, undefined)
    assert.equal(paced.windows.find((window) => window.kind === '7d').pace, undefined)
    assert.equal(paced.windows.find((window) => window.kind === 'cycle').pace, undefined)
  } finally {
    opencodego.read = originalRead
  }
})

test('BURN adapter preserves ready forecasts with used and left markers', () => {
  const burn = loadClassic('burn-adapt.js', { Date })
  const raw = weeklyWindow({
    usedPct: 46,
    pace: {
      expectedUsedPercent: 59,
      projectedAtResetPercent: 78,
    },
  })
  const used = burn.burnAdaptProvider({ id: 'codex', name: 'Codex', connected: true, windows: [raw] }, { now: NOW })
  const forecast = used.windows[0].forecast
  assert.equal(forecast.availability, 'ready')
  assert.equal(forecast.projectedLeftPct, 22)
  assert.equal(forecast.projectedOverPct, 0)
  assert.equal(forecast.markerUsedPct, 78)
  assert.equal(forecast.markerLeftPct, 22)
  assert.equal(forecast.evenPaceUsedPct, 59)
  assert.equal(forecast.evenPaceLeftPct, 41)
  assert.equal(forecast.label, '~22% left at reset')
  assert.equal(forecast.detail, 'Est. at current pace')
  assert.equal(used.primaryForecast.label, forecast.label)

  const left = burn.burnAdaptProvider(
    { id: 'codex', name: 'Codex', connected: true, windows: [raw] },
    { now: NOW, usageMeterMode: 'left' },
  )
  assert.equal(left.windows[0].pct, 54)
  assert.equal(left.windows[0].forecast.markerLeftPct, 22)
})

test('collapsed primary forecast follows the session meter source', () => {
  const burn = loadClassic('burn-adapt.js', { Date })
  const session = {
    label: 'Session',
    kind: '5h',
    usedPct: 40,
    resetAt: NOW + 2.5 * 60 * 60 * 1000,
    periodMs: 5 * 60 * 60 * 1000,
    pace: { expectedUsedPercent: 50, projectedAtResetPercent: 80 },
  }
  const weekly = weeklyWindow({
    usedPct: 20,
    pace: { expectedUsedPercent: 50, projectedAtResetPercent: 40 },
  })
  const provider = burn.burnAdaptProvider({
    id: 'codex',
    name: 'Codex',
    connected: true,
    windows: [session, weekly],
  }, { now: NOW })
  assert.equal(provider.meterPct, 40)
  assert.equal(provider.primaryForecastWindow, '5H')
  assert.equal(provider.primaryForecast.projectedUsedPct, 80)
})

test('BURN adapter labels over-cap, exhausted, immediate, missing-reset, and stale states', () => {
  const burn = loadClassic('burn-adapt.js', { Date })
  const over = burn.burnForecastForWindow(weeklyWindow({
    usedPct: 80,
    pace: { expectedUsedPercent: 50, projectedAtResetPercent: 160 },
  }), { now: NOW })
  assert.equal(over.label, '~60% over cap at reset')
  assert.equal(over.projectedLeftPct, 0)

  const exhausted = burn.burnForecastForWindow(weeklyWindow({
    usedPct: 100,
    pace: { expectedUsedPercent: 50, projectedAtResetPercent: 200 },
  }), { now: NOW })
  assert.equal(exhausted.availability, 'exhausted')
  assert.equal(exhausted.label, '0% left · cap reached')
  assert.match(exhausted.detail, /excess demand at reset/)

  const early = burn.burnForecastForWindow(weeklyWindow({ usedPct: 1, resetAt: NOW + 6.9 * DAY, pace: null }), { now: NOW })
  assert.equal(early.availability, 'unavailable')
  const injectedEarly = burn.burnForecastForWindow(weeklyWindow({
    usedPct: 1,
    resetAt: NOW + 6.9 * DAY,
    pace: { expectedUsedPercent: 1, projectedAtResetPercent: 100 },
  }), { now: NOW })
  assert.equal(injectedEarly.availability, 'ready')
  assert.equal(injectedEarly.projectedLeftPct, 0)
  const zero = burn.burnForecastForWindow(weeklyWindow({
    usedPct: 0,
    pace: { expectedUsedPercent: 50, projectedAtResetPercent: 0 },
  }), { now: NOW })
  assert.equal(zero.availability, 'ready')
  assert.equal(zero.projectedLeftPct, 100)
  const missing = burn.burnForecastForWindow(weeklyWindow({ resetAt: null, pace: null }), { now: NOW })
  assert.equal(missing.availability, 'missing-reset')
  const inferredReset = burn.burnForecastForWindow(weeklyWindow({
    forecastEligible: false,
    forecastDisabledReason: 'synthetic-reset',
    pace: { expectedUsedPercent: 50, projectedAtResetPercent: 50 },
  }), { now: NOW })
  assert.equal(inferredReset.availability, 'unavailable')
  assert.equal(inferredReset.detail, 'Local rolling reset is inferred')

  const providers = burn.burnAdaptProviders({
    generatedAt: NOW - 6 * 60 * 1000,
    providers: [{
      id: 'codex',
      name: 'Codex',
      connected: true,
      windows: [weeklyWindow({ pace: { expectedUsedPercent: 50, projectedAtResetPercent: 50 } })],
    }],
  }, { now: NOW })
  assert.equal(providers[0].windows[0].forecast.availability, 'stale')
  assert.equal(providers[0].windows[0].forecast.projectedLeftPct, null)

  const providerStale = burn.burnAdaptProvider({
    id: 'codex',
    name: 'Codex',
    connected: true,
    activity: 'live',
    lastUpdatedAt: NOW - 6 * 60 * 1000,
    windows: [weeklyWindow({ pace: { expectedUsedPercent: 50, projectedAtResetPercent: 50 } })],
  }, { now: NOW })
  assert.equal(providerStale.windows[0].forecast.availability, 'stale')
})

test('forecast rail clearly separates projected endpoint from even pace in either orientation', () => {
  const context = loadClassic('burn-forecast.js', {
    BURN: { warn: '#f60', lime: '#0f0', text: '#fff', text2: '#aaa', text4: '#333' },
    BURN_FONT: { mono: 'monospace' },
    bstyle: (styles) => Object.entries(styles).map(([key, value]) => `${key}:${value}`).join(';'),
    burnEsc: (value) => String(value),
  })
  const forecast = {
    availability: 'ready',
    markerUsedPct: 78,
    markerLeftPct: 22,
    evenPaceUsedPct: 59,
    evenPaceLeftPct: 41,
    label: '~22% left at reset',
    tone: 'ok',
  }
  const defaultBar = context.burnForecastBar({ pct: 46, mode: 'used', forecast })
  assert.match(defaultBar, /Projected endpoint/)
  assert.doesNotMatch(defaultBar, /EVEN PACE/)
  assert.match(defaultBar, /calc\(78% - 1px\)/)

  const used = context.burnForecastBar({ pct: 46, mode: 'used', forecast, showEvenPace: true })
  assert.match(used, /Projected endpoint/)
  assert.match(used, /EVEN PACE 59%/)
  assert.match(used, /calc\(78% - 1px\)/)

  const left = context.burnForecastBar({ pct: 54, mode: 'left', forecast, showEvenPace: true })
  assert.match(left, /EVEN PACE 41%/)
  assert.match(left, /calc\(22% - 1px\)/)
})
