const assert = require('node:assert/strict')
const test = require('node:test')

const optimize = require('../lib/optimize-detect')

function snapshot(provider) {
  return {
    generatedAt: Date.parse('2026-06-04T12:00:00Z'),
    providers: [provider],
  }
}

test('save mode stays quiet until enabled', () => {
  const model = optimize.buildOptimizeModel(snapshot({
    id: 'claude',
    name: 'Claude',
    connected: true,
    monthly: 200,
    windows: [{ label: 'Session', kind: '5h', usedPct: 72, resetAt: Date.parse('2026-06-04T14:00:00Z') }],
    configScan: { estTokensPerTurn: 12000, instrLines: 260, instrFile: 'AGENTS.md', mcpServers: 4 },
    tokenUsage: {
      input: 120_000_000,
      cached: 0,
      output: 6_000_000,
      modelBreakdowns: [{ model: 'sonnet', input: 120_000_000, cached: 0, output: 6_000_000 }],
    },
  }), { now: Date.parse('2026-06-04T12:00:00Z') })

  assert.equal(model.saveMode.enabled, false)
  assert.deepEqual(model.saveMode.actions, [])
})

test('save mode surfaces protective actions for an active five-hour window', () => {
  const model = optimize.buildOptimizeModel(snapshot({
    id: 'claude',
    name: 'Claude',
    connected: true,
    monthly: 200,
    windows: [{ label: 'Session', kind: '5h', usedPct: 72, resetAt: Date.parse('2026-06-04T14:00:00Z') }],
    configScan: { estTokensPerTurn: 12000, instrLines: 260, instrFile: 'AGENTS.md', mcpServers: 4 },
    tokenUsage: {
      input: 120_000_000,
      cached: 0,
      output: 6_000_000,
      modelBreakdowns: [{ model: 'sonnet', input: 120_000_000, cached: 0, output: 6_000_000 }],
    },
  }), { now: Date.parse('2026-06-04T12:00:00Z'), saveModeEnabled: true })

  assert.equal(model.saveMode.enabled, true)
  assert.equal(model.saveMode.reservePct, 40)
  assert.ok(model.saveMode.actions.length >= 3)
  assert.deepEqual(
    model.saveMode.actions.map((a) => a.kind).slice(0, 3),
    ['window-guard', 'context-bloat', 'cache-prefix'],
  )
  assert.match(model.saveMode.actions[0].title, /protect/i)
  assert.match(model.saveMode.actions[0].detail, /28% free/)
})

test('flow mode recommends checkpointing when a short window is tight', () => {
  const model = optimize.buildOptimizeModel(snapshot({
    id: 'claude',
    name: 'Claude',
    connected: true,
    monthly: 200,
    windows: [{ label: 'Session', kind: '5h', usedPct: 78, resetAt: Date.parse('2026-06-04T14:00:00Z') }],
  }), { now: Date.parse('2026-06-04T12:00:00Z') })

  assert.equal(model.flowMode.recommended, true)
  assert.equal(model.flowMode.providerId, 'claude')
  assert.equal(model.flowMode.freePct, 22)
  assert.match(model.flowMode.summary, /22% free/)
})

test('flow mode quiet state copy explains recommendation', () => {
  const model = optimize.buildOptimizeModel(snapshot({
    id: 'claude',
    name: 'Claude',
    connected: true,
    monthly: 200,
    windows: [{ label: 'Session', kind: '5h', usedPct: 20, resetAt: Date.parse('2026-06-04T14:00:00Z') }],
  }), { now: Date.parse('2026-06-04T12:00:00Z') })

  assert.equal(model.flowMode.recommended, false)
  assert.equal(model.flowMode.summary, 'Recommended when a 5-hour window drops under 40% free.')
})
