const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const preflight = require('../lib/preflight-estimate')

test('preflight estimates mission token range and short-window impact', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-preflight-'))
  try {
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'Keep scope tight.\n'.repeat(80))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
    fs.mkdirSync(path.join(dir, 'src'))
    fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'console.log("hello")\n'.repeat(500))

    const result = preflight.estimateMissionPreflight({
      dir,
      goal: 'Add a compact token-saving preview before starting this mission.',
      modelIds: ['claude'],
      models: [{ id: 'claude', name: 'Claude', cli: 'claude', selected: true }],
      snapshot: {
        providers: [{
          id: 'claude',
          name: 'Claude',
          connected: true,
          windows: [{ label: 'Session', kind: '5h', usedPct: 70, resetAt: Date.parse('2026-06-04T14:00:00Z') }],
        }],
      },
      now: Date.parse('2026-06-04T12:00:00Z'),
    })

    assert.equal(result.ok, true)
    assert.equal(result.providerId, 'claude')
    assert.equal(result.providerName, 'Claude')
    assert.equal(result.window.usedPct, 70)
    assert.ok(result.estimate.lowTokens > 1000)
    assert.ok(result.estimate.highTokens > result.estimate.lowTokens)
    assert.ok(result.estimate.highWindowPct > 0)
    assert.equal(result.reasons[0].kind, 'short-window')
    assert.match(result.summary, /5-hour window/i)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('preflight returns actionable missing-input states', () => {
  const result = preflight.estimateMissionPreflight({ dir: '', goal: '', modelIds: [] })
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, ['folder', 'goal', 'model'])
})
