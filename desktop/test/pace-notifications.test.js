const test = require('node:test')
const assert = require('node:assert/strict')

const pace = require('../lib/pace-notifications')

const NOW = 1_800_000_000_000
const RESET = NOW + 4 * 3600000
const PERIOD = 5 * 3600000
const PREFS = { paceAlerts: { nearExhaustion: true, runOut: true } }

function snapshot(projected, options = {}) {
  return {
    generatedAt: options.generatedAt ?? NOW,
    providers: (options.providers || [{ id: 'claude', name: 'Claude', projected }]).map((provider) => ({
      id: provider.id,
      name: provider.name,
      connected: true,
      windows: [{
        label: provider.label || 'Session',
        kind: 'session',
        periodMs: PERIOD,
        resetAt: options.resetAt ?? RESET,
        usedPct: 40,
        pace: {
          projectedAtResetPercent: provider.projected,
          willLastToReset: provider.projected < 100,
          exhaustsAt: provider.projected >= 100 ? NOW + 2 * 3600000 : null,
        },
      }],
    })),
  }
}

function step(snap, state = pace._private.emptyState(), prefs = PREFS, now = NOW) {
  return pace.evaluateSnapshotWithState(snap, prefs, state, now)
}

test('pace notifications prime silently then fire adjacent worsening transitions once', () => {
  let result = step(snapshot(70))
  assert.deepEqual(result.events, [])

  result = step(snapshot(95), result.state)
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].milestone, 'nearExhaustion')

  result = step(snapshot(96), result.state)
  assert.deepEqual(result.events, [])

  result = step(snapshot(110), result.state)
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].milestone, 'runOut')
})

test('a direct healthy to run-out jump sends only the urgent event', () => {
  const primed = step(snapshot(70))
  const result = step(snapshot(120), primed.state)
  assert.deepEqual(result.events.map((event) => event.milestone), ['runOut'])
})

test('recovery and a later reset re-arm notifications', () => {
  let result = step(snapshot(70))
  result = step(snapshot(95), result.state)
  assert.equal(result.events.length, 1)
  result = step(snapshot(70), result.state)
  result = step(snapshot(95), result.state)
  assert.equal(result.events.length, 1)

  const nextNow = RESET + 1000
  result = step(snapshot(95, { generatedAt: nextNow, resetAt: RESET + PERIOD }), result.state, PREFS, nextNow)
  assert.equal(result.events.length, 1)
})

test('disabled milestones are not consumed and fire after opt-in', () => {
  let result = step(snapshot(70))
  result = step(snapshot(95), result.state, { paceAlerts: { nearExhaustion: false, runOut: true } })
  assert.deepEqual(result.events, [])
  result = step(snapshot(95), result.state)
  assert.equal(result.events[0].milestone, 'nearExhaustion')
})

test('stale, invalid, and expired projections are suppressed without disturbing dedupe', () => {
  let result = step(snapshot(70))
  const baseline = result.state
  result = step(snapshot(110, { generatedAt: NOW - 21 * 60000 }), baseline)
  assert.deepEqual(result.events, [])
  result = step(snapshot(110, { resetAt: NOW - 1 }), result.state)
  assert.deepEqual(result.events, [])
  result = step(snapshot(Number.NaN), result.state)
  assert.deepEqual(result.events, [])
  result = step(snapshot(110), result.state)
  assert.equal(result.events[0].milestone, 'runOut')
})

test('simultaneous transitions group into one notification per milestone', () => {
  const providers = [
    { id: 'claude', name: 'Claude', projected: 70 },
    { id: 'codex', name: 'Codex', projected: 70 },
  ]
  let result = step(snapshot(null, { providers }))
  result = step(snapshot(null, { providers: providers.map((provider) => ({ ...provider, projected: 95 })) }), result.state)
  assert.equal(result.events.length, 1)
  assert.deepEqual(result.events[0].providerIds, ['claude', 'codex'])
  assert.match(result.events[0].body, /2 providers/)
})
