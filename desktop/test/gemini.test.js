const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const aggregate = require('../lib/aggregate')
const gemini = require('../lib/adapters/gemini')
const providerDetection = require('../lib/provider-detection')
const BurnMetrics = require('../burn/burn-metrics')

const cycle = {
  startMs: Date.parse('2026-09-01T00:00:00Z'),
  endMs: Date.parse('2026-10-01T00:00:00Z'),
  daysElapsed: 18,
  daysLeft: 12,
}

function makeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-gemini-'))
}

function writeSession(root, project, name, modified) {
  const file = path.join(root, '.gemini', 'tmp', project, 'chats', name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{"type":"fake-test-fixture"}\n')
  fs.utimesSync(file, modified, modified)
  return file
}

function loadBurnProviderHelpers() {
  const context = { Date, BurnMetrics }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../burn/burn-adapt.js'), 'utf8'), context)
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../burn/burn-home.js'), 'utf8'), context)
  return context
}

test('Gemini recognizes a custom CLI home immediately after sign-in', () => {
  const home = makeHome()
  const root = path.join(home, 'custom-gemini-state')
  try {
    fs.mkdirSync(root, { recursive: true })
    fs.writeFileSync(path.join(root, 'oauth_creds.json'), '{}')

    const usage = gemini.read(cycle, { env: { GEMINI_CLI_HOME: root } })
    const detections = providerDetection.detectLocalProviders({
      home: path.join(home, 'unused-default-home'),
      env: { GEMINI_CLI_HOME: root },
      execFileSync: () => { throw new Error('not installed') },
    })

    assert.equal(usage.connected, true)
    assert.equal(usage.connectionSource, 'auth')
    assert.equal(usage.sessions, 0)
    assert.equal(detections.gemini.evidence, path.join(root, 'oauth_creds.json'))
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('Gemini counts saved chat sessions without treating logs and tool outputs as sessions', () => {
  const home = makeHome()
  const root = path.join(home, '.gemini')
  const first = new Date('2026-09-10T12:00:00Z')
  const second = new Date('2026-09-11T12:00:00Z')
  try {
    writeSession(home, 'alpha', 'session-first.json', first)
    writeSession(home, 'alpha', 'session-second.jsonl', second)
    writeSession(home, 'alpha', 'session-before-cycle.json', new Date('2026-08-20T12:00:00Z'))
    fs.writeFileSync(path.join(root, 'tmp', 'alpha', 'logs.json'), '{}')
    fs.mkdirSync(path.join(root, 'tmp', 'alpha', 'tool-outputs'), { recursive: true })
    fs.writeFileSync(path.join(root, 'tmp', 'alpha', 'tool-outputs', 'run.txt'), 'fixture')

    const usage = gemini.read(cycle, { home })

    assert.equal(usage.connected, true)
    assert.equal(usage.connectionSource, 'local-history')
    assert.equal(usage.sessions, 2)
    assert.equal(usage.activeDays, 2)
    assert.equal(usage.lastActive, second.getTime())
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('Gemini provider always exposes its local activity as a headline window', async () => {
  const home = makeHome()
  try {
    fs.mkdirSync(path.join(home, '.gemini'), { recursive: true })
    fs.writeFileSync(path.join(home, '.gemini', 'oauth_creds.json'), '{}')

    const provider = await aggregate._private.buildProvider(
      'gemini',
      { name: 'Gemini', plan: 'Pro', monthly: 20 },
      cycle,
      {},
      { home, env: {} },
    )

    assert.equal(provider.connected, true)
    assert.equal(provider.capturedPct, 0)
    assert.deepEqual(provider.windows.map((window) => ({
      label: window.label,
      kind: window.kind,
      usedPct: window.usedPct,
      valueLabel: window.valueLabel,
      forecastEligible: window.forecastEligible,
    })), [{ label: 'Activity estimate', kind: 'cycle', usedPct: 0, valueLabel: '0% active', forecastEligible: false }])

    const burn = loadBurnProviderHelpers()
    const adapted = burn.burnAdaptProvider(provider, {
      now: cycle.startMs + 86400000,
      metricLayouts: {
        gemini: {
          version: 1,
          order: [],
          primary: [],
          hidden: [],
          knownMetricIds: [],
        },
      },
    })
    const headline = burn.burnPrimaryDisplayMetric(adapted)
    assert.equal(headline.label, 'ACTIVITY ESTIMATE')
    assert.equal(headline.value, '0% ACTIVE')
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})
