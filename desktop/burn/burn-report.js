/* Calendar-accurate cross-provider token and API-equivalent cost reports.
   UMD: browser global BurnReport + CommonJS export for tests. */
(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.BurnReport = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DAY = 86400000

  function finite(value) {
    if (value == null || (typeof value === 'string' && !value.trim())) return null
    const number = Number(value)
    return Number.isFinite(number) ? number : null
  }

  function dayKey(value) {
    const text = String(value == null ? '' : value).trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
    const date = value instanceof Date ? value : new Date(value)
    if (!Number.isFinite(date.getTime())) return null
    const pad = (number) => String(number).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }

  function calendarKeys(now, count) {
    const current = new Date(now == null ? Date.now() : now)
    const midnight = new Date(current.getFullYear(), current.getMonth(), current.getDate())
    return Array.from({ length: count }, (_, index) => {
      const offset = count - index - 1
      return dayKey(new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate() - offset))
    })
  }

  function normalizePeriod(value) {
    return value === 'today' || value === 'yesterday' ? value : '30d'
  }

  function periodKeys(period, now) {
    const keys = calendarKeys(now, 30)
    if (period === 'today') return [keys[keys.length - 1]]
    if (period === 'yesterday') return [keys[keys.length - 2]]
    return keys
  }

  function normalizeModel(row, fallback) {
    const tokens = finite(row?.totalTokens ?? row?.total ?? row?.tokens ?? row?.tokenCount)
    const usd = finite(row?.costUSD ?? row?.usd ?? row?.cost)
    return {
      id: String(row?.model || row?.modelName || row?.name || fallback || 'unknown'),
      label: String(row?.model || row?.modelName || row?.name || fallback || 'Unknown model'),
      tokens,
      usd,
      source: row?.source || row?.pricingSource || null,
      estimated: /estimate|hypothetical/i.test(String(row?.costAccuracy || row?.accuracy || '')),
      unpriced: usd == null,
    }
  }

  function dailyRows(usage) {
    const source = Array.isArray(usage?.dailyBreakdown)
      ? usage.dailyBreakdown
      : Array.isArray(usage?.dailyUsage)
        ? usage.dailyUsage
        : []
    return source.map((row) => {
      const models = Array.isArray(row?.modelBreakdowns)
        ? row.modelBreakdowns
        : Array.isArray(row?.models)
          ? row.models
          : Array.isArray(row?.topModels)
            ? row.topModels
            : []
      return {
        date: dayKey(row?.date || row?.dayKey || row?.day),
        tokens: finite(row?.totalTokens ?? row?.total ?? row?.tokens),
        usd: finite(row?.costUSD ?? row?.usd ?? row?.cost),
        pricedTokens: finite(row?.pricedTokens ?? row?.pricedTokenCount),
        pricedUSD: finite(row?.pricedCostUSD ?? row?.pricedUSD),
        source: row?.source || usage?.source || null,
        estimated: /estimate|hypothetical/i.test(String(row?.costAccuracy || usage?.costAccuracy || '')),
        unpricedModels: Array.isArray(row?.unpricedModels) ? row.unpricedModels.map(String) : [],
        partialCost: row?.partialCost === true || row?.costCoverage === 'partial',
        models: models.map((model, index) => normalizeModel(model, `model-${index + 1}`)),
      }
    }).filter((row) => row.date)
  }

  function sumKnown(rows, field) {
    const known = rows.map((row) => finite(row[field])).filter((value) => value != null)
    return known.length ? known.reduce((sum, value) => sum + value, 0) : null
  }

  function pairedForRow(row) {
    if (row.pricedTokens != null && row.pricedUSD != null) return { tokens: row.pricedTokens, usd: row.pricedUSD }
    if (row.tokens != null && row.usd != null && !row.partialCost && !(row.unpricedModels || []).length) return { tokens: row.tokens, usd: row.usd }
    return null
  }

  function addModels(target, rows) {
    for (const row of rows) {
      for (const model of row.models || []) {
        const current = target.get(model.id) || { ...model, tokens: null, usd: null }
        if (model.tokens != null) current.tokens = (current.tokens || 0) + model.tokens
        if (model.usd != null) current.usd = (current.usd || 0) + model.usd
        current.estimated = current.estimated || model.estimated
        current.unpriced = current.unpriced || model.unpriced
        target.set(model.id, current)
      }
    }
  }

  function providerSlice(provider, keys) {
    const usage = provider?.tokenUsage
    if (!usage) return null
    const byDate = new Map(dailyRows(usage).map((row) => [row.date, row]))
    const selected = keys.map((key) => byDate.get(key)).filter(Boolean)
    if (!selected.length) return null
    const models = new Map()
    addModels(models, selected)
    const tokens = sumKnown(selected, 'tokens')
    const usd = sumKnown(selected, 'usd')
    const pairedRows = selected.map(pairedForRow).filter(Boolean)
    const pairedTokens = sumKnown(pairedRows, 'tokens')
    const pairedUSD = sumKnown(pairedRows, 'usd')
    const unpricedModels = [...new Set(selected.flatMap((row) => row.unpricedModels || []))]
    return {
      id: String(provider.id),
      providerFamily: String(provider.providerFamily || provider.id).split(':')[0],
      name: String(provider.name || provider.providerFamily || provider.id),
      accountLabel: provider.account?.label || null,
      tokens,
      usd,
      pairedTokens,
      pairedUSD,
      costPerMTok: pairedTokens > 0 && pairedUSD != null ? pairedUSD / (pairedTokens / 1000000) : null,
      observedDays: selected.length,
      source: usage.source || selected.find((row) => row.source)?.source || null,
      estimated: selected.some((row) => row.estimated),
      partialCost: unpricedModels.length > 0 || selected.some((row) => row.partialCost || (row.tokens != null && row.usd == null)),
      unpricedModels,
      models: [...models.values()].sort((a, b) => (b.tokens || 0) - (a.tokens || 0)),
    }
  }

  function projectionSlices(slices, metric) {
    const qualified = slices.filter((slice) => {
      if (metric === 'tokens') return slice.tokens != null
      if (metric === 'costPerMTok') return slice.costPerMTok != null
      return slice.usd != null
    })
    const amount = (slice) => metric === 'tokens' ? slice.tokens : metric === 'costPerMTok' ? slice.costPerMTok : slice.usd
    return qualified.sort((a, b) => amount(b) - amount(a)).map((slice) => ({ ...slice, displayAmount: amount(slice) }))
  }

  function build(snapshot, options) {
    const now = finite(options?.now) ?? Date.now()
    const period = normalizePeriod(options?.period)
    const keys = periodKeys(period, now)
    const providers = Array.isArray(snapshot?.providers) ? snapshot.providers : []
    const slices = providers.map((provider) => providerSlice(provider, keys)).filter(Boolean)
    const chartKeys = period === '30d' ? calendarKeys(now, 30) : keys
    const rowsByProvider = providers.map((provider) => ({ provider, rows: dailyRows(provider?.tokenUsage) }))
    const days = chartKeys.map((date) => {
      const rows = rowsByProvider.flatMap(({ rows }) => rows.filter((row) => row.date === date))
      const pairedRows = rows.map(pairedForRow).filter(Boolean)
      const pairedTokens = sumKnown(pairedRows, 'tokens')
      const pairedUSD = sumKnown(pairedRows, 'usd')
      return {
        date,
        observed: rows.length > 0,
        providerCount: rows.length,
        tokens: sumKnown(rows, 'tokens'),
        usd: sumKnown(rows, 'usd'),
        costPerMTok: pairedTokens > 0 && pairedUSD != null ? pairedUSD / (pairedTokens / 1000000) : null,
      }
    })
    const paired = slices.filter((slice) => slice.pairedTokens > 0 && slice.pairedUSD != null)
    const pairedTokens = paired.reduce((sum, slice) => sum + slice.pairedTokens, 0)
    const pairedUSD = paired.reduce((sum, slice) => sum + slice.pairedUSD, 0)
    const modelMap = new Map()
    for (const slice of slices) addModels(modelMap, [{ models: slice.models }])
    return {
      period,
      startDate: keys[0],
      endDate: keys[keys.length - 1],
      days,
      slices,
      totals: {
        tokens: sumKnown(slices, 'tokens'),
        usd: sumKnown(slices, 'usd'),
        costPerMTok: pairedTokens > 0 ? pairedUSD / (pairedTokens / 1000000) : null,
        pairedTokens: pairedTokens || null,
        pairedUSD: paired.length ? pairedUSD : null,
      },
      coverage: {
        providerCount: slices.length,
        costProviders: slices.filter((slice) => slice.usd != null).length,
        tokenProviders: slices.filter((slice) => slice.tokens != null).length,
        pairedProviders: paired.length,
        partial: slices.some((slice) => slice.partialCost),
      },
      models: [...modelMap.values()].sort((a, b) => (b.tokens || 0) - (a.tokens || 0)),
      projection(metric) {
        const normalized = metric === 'tokens' || metric === 'costPerMTok' ? metric : 'cost'
        return {
          metric: normalized,
          total: normalized === 'tokens' ? this.totals.tokens : normalized === 'costPerMTok' ? this.totals.costPerMTok : this.totals.usd,
          slices: projectionSlices(this.slices, normalized),
        }
      },
    }
  }

  return { build, dayKey, calendarKeys, periodKeys }
})
