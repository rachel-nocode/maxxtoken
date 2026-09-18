/* Shared BURN metric catalog. Loaded as a classic renderer script and required
   by the main-process tray renderer. */
(function initBurnMetrics(root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.BurnMetrics = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function burnMetricsFactory() {
  const LAYOUT_VERSION = 1
  const MAX_METRICS = 80
  const MAX_PINS_PER_PROVIDER = 2

  function finite(value) {
    if (value == null || (typeof value === 'string' && !value.trim())) return null
    const number = Number(value)
    return Number.isFinite(number) ? number : null
  }

  function slug(value) {
    return String(value || 'metric')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'metric'
  }

  function uniqueId(base, counts) {
    const seen = counts.get(base) || 0
    counts.set(base, seen + 1)
    return seen ? `${base}-${seen + 1}` : base
  }

  function registryForProvider(provider) {
    const providerId = slug(provider?.id || 'provider')
    const counts = new Map()
    const metrics = []
    const push = (metric) => {
      if (!metric || metrics.length >= MAX_METRICS) return
      metric.id = uniqueId(`${providerId}:${metric.type}:${slug(metric.key || metric.label)}`, counts)
      metric.providerId = provider?.id || providerId
      metric.order = metrics.length
      metrics.push(metric)
    }

    for (const window of Array.isArray(provider?.windows) ? provider.windows : []) {
      const usedPct = finite(window?.usedPct)
      const remainingPct = finite(window?.remainingPct)
      const valueLabel = window?.valueLabel == null ? '' : String(window.valueLabel)
      if (usedPct == null && remainingPct == null && !valueLabel) continue
      push({
        type: 'window',
        key: `${window?.kind || 'window'}-${window?.label || ''}`,
        label: String(window?.label || window?.kind || 'Allowance'),
        usedPct,
        remainingPct,
        value: valueLabel || null,
        resetAt: finite(window?.resetAt),
        source: window,
        defaultPlacement: metrics.filter((item) => item.type === 'window').length < 2 ? 'primary' : 'expanded',
      })
    }

    const scalarRows = [
      provider?.leftValue != null ? { label: 'Plan value left', value: `$${Number(provider.leftValue).toFixed(2)}`, key: 'plan-value-left', provenance: provider.valueLabel } : null,
      provider?.spentValue != null ? { label: 'Plan value used', value: `$${Number(provider.spentValue).toFixed(2)}`, key: 'plan-value-used', provenance: provider.valueLabel } : null,
      ...(Array.isArray(provider?.extra) ? provider.extra : []),
    ].filter(Boolean)
    for (const row of scalarRows) {
      if (row.value == null || String(row.value).trim() === '') continue
      push({
        type: 'scalar',
        key: row.key || row.label,
        label: String(row.label || 'Value'),
        value: String(row.value),
        provenance: row.provenance || row.source || null,
        defaultPlacement: 'expanded',
      })
    }

    const models = Array.isArray(provider?.tokenUsage?.modelBreakdowns)
      ? provider.tokenUsage.modelBreakdowns
      : Array.isArray(provider?.tokenUsage?.topModels)
        ? provider.tokenUsage.topModels
        : []
    for (const row of models) {
      const total = finite(row?.total ?? row?.totalTokens)
      if (total == null) continue
      push({
        type: 'model',
        key: row?.model || row?.modelName || 'unknown',
        label: String(row?.model || row?.modelName || 'Unknown model'),
        value: `${Math.round(total).toLocaleString('en-US')} tokens`,
        costUSD: finite(row?.costUSD),
        pricingSource: row?.pricingSource || null,
        pricingModel: row?.pricingModel || null,
        costAccuracy: row?.costAccuracy || null,
        defaultPlacement: 'expanded',
      })
    }
    return metrics
  }

  function stringList(value) {
    return Array.isArray(value)
      ? [...new Set(value.filter((item) => typeof item === 'string' && item.length <= 180))].slice(0, MAX_METRICS)
      : []
  }

  function normalizeLayout(layout, metricIds) {
    const current = stringList(metricIds)
    const currentSet = new Set(current)
    const raw = layout && typeof layout === 'object' ? layout : {}
    const knownIds = stringList(raw.knownMetricIds)
    const known = new Set(knownIds)
    const hidden = stringList(raw.hidden)
    const hiddenSet = new Set(hidden)
    const primary = stringList(raw.primary).filter((id) => currentSet.has(id) && !hiddenSet.has(id))
    const primarySet = new Set(primary)
    const order = stringList(raw.order).filter((id) => currentSet.has(id))
    const orderSet = new Set(order)
    const metricsById = new Map((raw._metrics || []).map((metric) => [metric.id, metric]))

    for (const id of current) {
      if (!orderSet.has(id)) {
        order.push(id)
        orderSet.add(id)
      }
      if (known.has(id) || hiddenSet.has(id) || primarySet.has(id)) continue
      if (metricsById.get(id)?.defaultPlacement === 'primary' || primary.length < 2) {
        primary.push(id)
        primarySet.add(id)
      }
    }
    return {
      version: LAYOUT_VERSION,
      order,
      primary,
      hidden,
      knownMetricIds: stringList([...knownIds, ...current]),
    }
  }

  function reconcileLayout(layout, metrics) {
    return normalizeLayout({ ...(layout || {}), _metrics: metrics }, metrics.map((metric) => metric.id))
  }

  function applyLayout(metrics, layout) {
    const normalized = reconcileLayout(layout, metrics)
    const byId = new Map(metrics.map((metric) => [metric.id, metric]))
    const ordered = normalized.order.map((id) => byId.get(id)).filter(Boolean)
    const hidden = new Set(normalized.hidden)
    const primary = new Set(normalized.primary)
    return {
      layout: normalized,
      primary: ordered.filter((metric) => !hidden.has(metric.id) && primary.has(metric.id)),
      expanded: ordered.filter((metric) => !hidden.has(metric.id) && !primary.has(metric.id)),
      hidden: ordered.filter((metric) => hidden.has(metric.id)),
    }
  }

  function normalizePins(rawPins, layouts = {}) {
    const pins = []
    const counts = new Map()
    for (const raw of Array.isArray(rawPins) ? rawPins : []) {
      if (!raw || typeof raw !== 'object') continue
      const providerId = String(raw.providerId || '').slice(0, 80)
      const metricId = String(raw.metricId || '').slice(0, 180)
      if (!providerId || !metricId || !layouts[providerId]) continue
      const count = counts.get(providerId) || 0
      if (count >= MAX_PINS_PER_PROVIDER) continue
      counts.set(providerId, count + 1)
      pins.push({ providerId, metricId, style: raw.style === 'text' ? 'text' : 'bar' })
    }
    return pins.slice(0, 12)
  }

  function metricForPin(provider, metricId) {
    return registryForProvider(provider).find((metric) => metric.id === metricId) || null
  }

  function metricPercent(metric, mode = 'used') {
    if (!metric || metric.type !== 'window') return null
    const used = finite(metric.usedPct)
    const left = finite(metric.remainingPct)
    if (mode === 'left') return left == null ? (used == null ? null : 100 - used) : left
    return used == null ? (left == null ? null : 100 - left) : used
  }

  function metricText(metric, mode = 'used') {
    if (!metric) return ''
    if (metric.type === 'window') {
      const pct = metricPercent(metric, mode)
      return pct == null ? '' : `${metric.label} ${Math.round(pct)}% ${mode}`
    }
    return `${metric.label} ${metric.value || ''}`.trim()
  }

  return {
    LAYOUT_VERSION,
    MAX_PINS_PER_PROVIDER,
    registryForProvider,
    reconcileLayout,
    applyLayout,
    normalizePins,
    metricForPin,
    metricPercent,
    metricText,
    _private: { finite, slug, normalizeLayout },
  }
})
