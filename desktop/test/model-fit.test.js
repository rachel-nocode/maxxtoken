const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const modelFit = require('../lib/model-fit')

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-model-fit-'))
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'Keep scope tight.\n'.repeat(40))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
  fs.mkdirSync(path.join(dir, 'src'))
  fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'console.log("hello")\n'.repeat(200))
  return dir
}

test('model fit ranks underused soon-resetting provider above overpaced provider', () => {
  const dir = makeProject()
  try {
    const now = Date.parse('2026-06-04T12:00:00Z')
    const result = modelFit.recommendModelFit({
      dir,
      goal: 'Add a small Optimize tab planner for choosing the best model.',
      models: [
        { id: 'claude', name: 'Claude', cli: 'claude', selected: true },
        { id: 'codex', name: 'Codex', cli: 'codex', selected: true },
      ],
      snapshot: {
        providers: [
          {
            id: 'claude',
            name: 'Claude',
            connected: true,
            windows: [
              { label: 'Session', kind: '5h', usedPct: 10, resetAt: now + 2 * 60 * 60 * 1000 },
              { label: 'Weekly', kind: '7d', usedPct: 20, resetAt: now + 24 * 60 * 60 * 1000 },
            ],
            tokenUsage: { total: 200_000, input: 120_000, cached: 40_000, output: 40_000, costUSD: 2 },
          },
          {
            id: 'codex',
            name: 'Codex',
            connected: true,
            windows: [
              {
                label: 'Session',
                kind: '5h',
                usedPct: 76,
                resetAt: now + 2 * 60 * 60 * 1000,
                pace: { projectedAtResetPercent: 148 },
              },
              { label: 'Weekly', kind: '7d', usedPct: 78, resetAt: now + 24 * 60 * 60 * 1000 },
            ],
            tokenUsage: { total: 300_000, input: 200_000, cached: 30_000, output: 70_000, costUSD: 6 },
          },
        ],
      },
      now,
    })

    assert.equal(result.ok, true)
    assert.equal(result.recommendations[0].providerId, 'claude')
    assert.equal(result.recommendations[0].label, 'Best pick')
    assert.equal(result.balance.find((row) => row.providerId === 'claude').state, 'spend')
    assert.equal(result.balance.find((row) => row.providerId === 'codex').state, 'save')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('model fit penalizes tasks that would drain short-window reserve', () => {
  const dir = makeProject()
  try {
    const now = Date.parse('2026-06-04T12:00:00Z')
    const result = modelFit.recommendModelFit({
      dir,
      goal: 'Run a focused implementation pass.',
      models: [
        { id: 'claude', name: 'Claude', cli: 'claude', selected: true },
        { id: 'codex', name: 'Codex', cli: 'codex', selected: true },
      ],
      snapshot: {
        providers: [
          {
            id: 'claude',
            name: 'Claude',
            connected: true,
            windows: [{ label: 'Session', kind: '5h', usedPct: 72, resetAt: now + 90 * 60 * 1000 }],
          },
          {
            id: 'codex',
            name: 'Codex',
            connected: true,
            windows: [{ label: 'Session', kind: '5h', usedPct: 8, resetAt: now + 90 * 60 * 1000 }],
          },
        ],
      },
      now,
    })

    assert.equal(result.ok, true)
    assert.equal(result.recommendations[0].providerId, 'codex')
    assert.ok(result.recommendations.find((row) => row.providerId === 'claude').cautions.some((text) => /reserve/i.test(text)))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('model fit returns missing-input states', () => {
  const result = modelFit.recommendModelFit({ dir: '', goal: '', models: [] })
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, ['folder', 'goal', 'model'])
})
