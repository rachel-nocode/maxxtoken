const crypto = require('crypto')
const { canonicalProviderId } = require('./provider-ids')

const SCHEMA_VERSION = '1.0'
const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000

function finite(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function slug(value) {
  return String(value || 'resource')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'resource'
}

function safeAccountId(provider) {
  for (const value of [provider?.accountId, provider?.account?.id, provider?.id]) {
    if (/^[a-z0-9_-]+@[0-9a-f]{12}$/i.test(String(value || ''))) return String(value)
  }
  return null
}

function providerFamily(provider) {
  return canonicalProviderId(provider?.providerFamily || String(provider?.id || '').split('@')[0])
}

function observedAt(provider, snapshot) {
  return finite(provider?.lastUpdatedAt)
}

function freshnessFor(provider, snapshot, now, staleAfterMs) {
  const observed = observedAt(provider, snapshot)
  const ageMs = observed == null ? null : Math.max(0, now - observed)
  let state = 'fresh'
  if (!provider?.connected || observed == null) state = 'missing'
  else if (
    snapshot?.cached || provider?.stale === true || provider?.refreshError || provider?.error ||
    provider?.activity === 'stale' || ageMs > staleAfterMs
  ) state = 'stale'
  return { state, observedAt: observed, ageMs }
}

function publicError(provider, freshness) {
  if (provider?.error || provider?.refreshError) {
    return {
      code: provider.connected ? 'partial_provider_error' : 'provider_unavailable',
      message: provider.connected ? 'Provider returned partial limit data.' : 'Provider limit data is unavailable.',
      retryable: true,
    }
  }
  if (freshness.state === 'missing') {
    return { code: 'missing_limit_data', message: 'Provider limit data is unavailable.', retryable: true }
  }
  return null
}

function normalizeUnit(value) {
  const key = String(value || '').trim().toLowerCase()
  if (['dollar', 'dollars', 'usd', '$'].includes(key)) return 'usd'
  if (['request', 'requests'].includes(key)) return 'requests'
  if (['token', 'tokens'].includes(key)) return 'tokens'
  if (['credit', 'credits'].includes(key)) return 'credits'
  if (key === 'percent' || key === '%') return 'percent'
  return key || 'unknown'
}

function windowResource(provider, window, freshness, now) {
  const rawUsed = finite(window?.used ?? window?.spent ?? window?.consumed ?? window?.spentUSD)
  const rawLimit = finite(window?.limit ?? window?.total ?? window?.allowance ?? window?.totalUSD)
  const rawRemaining = finite(window?.remaining ?? window?.left ?? window?.leftUSD)
  const creditUSD = finite(window?.creditUSD)
  const usedPercent = finite(window?.usedPct)
  const remainingPercent = finite(window?.remainingPct) ?? (usedPercent == null ? null : Math.max(0, 100 - usedPercent))
  let unit = normalizeUnit(window?.unit || window?.valueUnit || (
    window?.spentUSD != null || window?.totalUSD != null || window?.leftUSD != null ? 'usd' : null
  ))
  let used = rawUsed
  let limit = rawLimit
  let remaining = rawRemaining
  if (creditUSD != null && unit === 'unknown' && rawUsed == null && rawLimit == null && rawRemaining == null) {
    unit = 'usd'
    remaining = creditUSD
  } else if (unit === 'unknown' && usedPercent != null) {
    unit = 'percent'
    used = usedPercent
    limit = 100
    remaining = remainingPercent
  }
  const measurementMissing = used == null && limit == null && remaining == null && usedPercent == null
  const resetAt = finite(window?.resetAt)
  const resourceFreshness = {
    ...freshness,
    ...(measurementMissing ? { state: 'missing' } : {}),
    ...(!measurementMissing && resetAt != null && resetAt < now ? { state: 'stale' } : {}),
  }
  const explicitId = window?.resourceId || window?.metricId || window?.id
  const identity = explicitId
    ? `explicit|${explicitId}`
    : `${window?.kind || 'window'}|${window?.label || ''}|${finite(window?.periodMs) ?? ''}|${unit}`
  return {
    _key: identity,
    _base: `${provider.id}:quota:${slug(explicitId || `${window?.kind || 'window'}-${window?.label || ''}`)}`,
    providerId: provider.id,
    providerFamily: providerFamily(provider),
    accountId: safeAccountId(provider),
    type: 'quota',
    label: String(window?.label || window?.kind || 'Allowance'),
    unit,
    used,
    limit,
    remaining,
    usedPercent,
    resetAt,
    periodMs: finite(window?.periodMs),
    accuracy: window?.accuracy || window?.valueAccuracy || 'live',
    source: window?.source || window?.valueSource || null,
    freshness: resourceFreshness,
    error: resourceFreshness.state === 'missing'
      ? { code: measurementMissing ? 'missing_measurement' : 'missing_limit_data', message: 'Limit data is unavailable.', retryable: true }
      : null,
  }
}

function balanceResource(provider, freshness) {
  const total = finite(provider?.totalValue)
  const used = finite(provider?.spentValue)
  const remaining = finite(provider?.leftValue)
  const usedPercent = finite(provider?.capturedPct)
  if (total == null && used == null && remaining == null && usedPercent == null) return null
  const unit = normalizeUnit(provider?.valueUnit)
  return {
    _key: `balance|${unit}`,
    _base: `${provider.id}:balance:${unit}`,
    providerId: provider.id,
    providerFamily: providerFamily(provider),
    accountId: safeAccountId(provider),
    type: 'balance',
    label: provider?.usageLabel ? String(provider.usageLabel) : 'Plan balance',
    unit,
    used,
    limit: total,
    remaining,
    usedPercent,
    resetAt: finite(provider?.resetAt),
    periodMs: null,
    accuracy: provider?.valueAccuracy || 'unknown',
    source: provider?.valueLabel || null,
    freshness: { ...freshness },
    error: freshness.state === 'missing'
      ? { code: 'missing_limit_data', message: 'Balance data is unavailable.', retryable: true }
      : null,
  }
}

function assignResourceIds(resources) {
  const unique = new Map()
  for (const resource of resources) {
    const key = `${resource._base}\0${resource._key}`
    const current = unique.get(key)
    if (!current || (finite(resource.resetAt) ?? -1) > (finite(current.resetAt) ?? -1)) unique.set(key, resource)
  }
  return [...unique.values()].map((resource) => {
    const suffix = crypto.createHash('sha256').update(resource._key).digest('hex').slice(0, 8)
    const { _base, _key, ...publicResource } = resource
    return { id: `${_base}-${suffix}`, ...publicResource }
  })
}

function matchesProvider(provider, rawIds) {
  if (!rawIds?.length) return true
  const id = canonicalProviderId(provider?.id)
  const family = providerFamily(provider)
  return rawIds.some((raw) => {
    const wanted = canonicalProviderId(raw)
    return wanted === id || wanted === family
  })
}

function buildLimitsContract(snapshot, options = {}) {
  const now = finite(options.now) ?? Date.now()
  const staleAfterMs = finite(options.staleAfterMs) ?? DEFAULT_STALE_AFTER_MS
  const requestedIds = Array.isArray(options.providerIds) ? options.providerIds.filter(Boolean) : []
  const allProviders = Array.isArray(snapshot?.providers) ? snapshot.providers : []
  const selected = allProviders.filter((provider) => matchesProvider(provider, requestedIds))
  const providers = selected.map((provider) => {
    const freshness = freshnessFor(provider, snapshot, now, staleAfterMs)
    const candidates = (provider.windows || []).map((window) => windowResource(provider, window, freshness, now))
    const balance = balanceResource(provider, freshness)
    if (balance) candidates.push(balance)
    const resources = assignResourceIds(candidates)
    return {
      id: provider.id,
      providerFamily: providerFamily(provider),
      accountId: safeAccountId(provider),
      name: provider.account ? String(provider.name || providerFamily(provider)).split(' · ')[0] : (provider.name ?? null),
      plan: provider.plan ?? null,
      connected: provider.connected === true,
      freshness,
      error: publicError(provider, freshness),
      resources,
    }
  })
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: finite(snapshot?.generatedAt),
    providers,
    errors: providers.filter((provider) => provider.error).map((provider) => ({ providerId: provider.id, ...provider.error })),
  }
}

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_STALE_AFTER_MS,
  buildLimitsContract,
  matchesProvider,
  _private: { finite, slug, safeAccountId, normalizeUnit, freshnessFor, assignResourceIds },
}
