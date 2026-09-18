const assert = require('node:assert/strict')
const test = require('node:test')

const { buildLimitsContract } = require('../lib/limits-contract')

const NOW = Date.parse('2026-09-17T12:00:00Z')

function snapshot() {
  return {
    generatedAt: NOW - 1000,
    providers: [
      {
        id: 'claude@123456789abc', providerFamily: 'claude', account: { id: 'claude@123456789abc' },
        name: 'Claude · Private Org', plan: 'Max', connected: true, lastUpdatedAt: NOW - 1000,
        totalValue: 100, spentValue: 25, leftValue: 75, valueUnit: 'dollars', capturedPct: 25, valueAccuracy: 'estimate', valueLabel: 'configured plan allocation',
        windows: [
          { label: 'Session', kind: '5h', usedPct: 20, remainingPct: 80, resetAt: NOW + 1000, periodMs: 18000000 },
          { label: 'Session', kind: '5h', usedPct: 30, remainingPct: 70, resetAt: NOW + 2000, periodMs: 36000000 },
        ],
      },
      { id: 'openrouter', name: 'OpenRouter', connected: false, error: 'synthetic provider failure' },
    ],
  }
}

test('limits contract exposes stable raw resources, safe account IDs and freshness', () => {
  const contract = buildLimitsContract(snapshot(), { now: NOW })
  assert.equal(contract.schemaVersion, '1.0')
  assert.equal(contract.providers.length, 2)
  const claude = contract.providers[0]
  assert.equal(claude.accountId, 'claude@123456789abc')
  assert.equal(claude.name, 'Claude')
  assert.equal(claude.freshness.state, 'fresh')
  assert.equal(claude.resources.length, 3)
  assert.equal(new Set(claude.resources.map((resource) => resource.id)).size, 3)
  assert.deepEqual(claude.resources[0], {
    id: claude.resources[0].id,
    providerId: 'claude@123456789abc',
    providerFamily: 'claude',
    accountId: 'claude@123456789abc',
    type: 'quota',
    label: 'Session',
    unit: 'percent',
    used: 20,
    limit: 100,
    remaining: 80,
    usedPercent: 20,
    resetAt: NOW + 1000,
    periodMs: 18000000,
    accuracy: 'live',
    source: null,
    freshness: { state: 'fresh', observedAt: NOW - 1000, ageMs: 1000 },
    error: null,
  })
  assert.equal(claude.resources[2].unit, 'usd')
  assert.equal(claude.resources[2].remaining, 75)
  assert.equal(claude.resources[2].accuracy, 'estimate')
  assert.equal(claude.resources[2].source, 'configured plan allocation')
  assert.equal(contract.errors[0].code, 'provider_unavailable')
  assert.doesNotMatch(JSON.stringify(contract), /Private Org|synthetic provider failure/)
})

test('limits contract marks cached and missing providers explicitly', () => {
  const raw = snapshot()
  raw.cached = true
  raw.providers[0].account = { id: 'email@example.com' }
  const contract = buildLimitsContract(raw, { now: NOW })
  assert.equal(contract.providers[0].freshness.state, 'stale')
  assert.equal(contract.providers[0].accountId, 'claude@123456789abc')
  assert.equal(contract.providers[1].freshness.state, 'missing')
  assert.equal(contract.providers[1].error.code, 'provider_unavailable')
})

test('provider filters accept family or instance IDs', () => {
  assert.equal(buildLimitsContract(snapshot(), { providerIds: ['claude'] }).providers.length, 1)
  assert.equal(buildLimitsContract(snapshot(), { providerIds: ['claude@123456789abc'] }).providers.length, 1)
  assert.equal(buildLimitsContract(snapshot(), { providerIds: ['unknown'] }).providers.length, 0)
})

test('resource IDs survive window reorder and use raw USD fields', () => {
  const raw = snapshot()
  raw.providers[0].windows.push({ id: 'overage', label: 'Overage', kind: 'monthly', spentUSD: 2, totalUSD: 10, leftUSD: 8 })
  const first = buildLimitsContract(raw, { now: NOW }).providers[0].resources
  raw.providers[0].windows.reverse()
  const second = buildLimitsContract(raw, { now: NOW }).providers[0].resources
  assert.deepEqual(first.map((resource) => resource.id).sort(), second.map((resource) => resource.id).sort())
  const overage = second.find((resource) => resource.label === 'Overage')
  assert.equal(overage.unit, 'usd')
  assert.equal(overage.used, 2)
  assert.equal(overage.limit, 10)
  assert.equal(overage.remaining, 8)
})

test('partial refresh failures are stale and missing measurements are explicit', () => {
  const raw = snapshot()
  raw.providers[0].refreshError = 'fixture refresh failed'
  raw.providers[0].windows.push({ id: 'unknown-pool', label: 'Unknown pool', kind: 'weekly' })
  const provider = buildLimitsContract(raw, { now: NOW }).providers[0]
  assert.equal(provider.freshness.state, 'stale')
  assert.equal(provider.error.code, 'partial_provider_error')
  const missing = provider.resources.find((resource) => resource.label === 'Unknown pool')
  assert.equal(missing.freshness.state, 'missing')
  assert.equal(missing.error.code, 'missing_measurement')
  assert.doesNotMatch(JSON.stringify(provider), /fixture refresh failed/)
})
