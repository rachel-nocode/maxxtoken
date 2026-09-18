/* BURN adapter — maps the live snapshot (window.maxx.getSnapshot) into the
   Provider/footer shapes the burn screens render. Classic script.
   Replaceable: the real detection layer owns the source data; this only
   reshapes it. Missing fields degrade gracefully. */

function burnPad2(n) {
  return String(n).padStart(2, '0')
}

// resetAt (ms epoch) → 'XXh XXm' (<1d) or 'Xd XXh' (>=1d). Mixed-case; the
// renderer uppercases at display time.
function burnFormatReset(resetAt) {
  if (!resetAt) return '—'
  const diff = resetAt - Date.now()
  if (diff <= 0) return '00h 00m'
  const totalMin = Math.floor(diff / 60000)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const mins = totalMin % 60
  if (days >= 1) return `${days}d ${burnPad2(hours)}h`
  return `${burnPad2(hours)}h ${burnPad2(mins)}m`
}

function burnFindWindow(windows, kind) {
  if (!Array.isArray(windows)) return null
  if (kind === '5h') return windows.find((w) => w.kind === '5h') || null
  // weekly = anything that isn't the 5h session or the 30d billing cycle
  return windows.find((w) => w.kind !== '5h' && w.kind !== 'cycle') || null
}

function burnFiniteNumber(v) {
  if (v == null || (typeof v === 'string' && !v.trim())) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const BURN_FORECAST_STALE_MS = 5 * 60 * 1000
function burnClampPct(v) {
  const n = burnFiniteNumber(v)
  return n == null ? null : Math.max(0, Math.min(100, Math.round(n)))
}

function burnProviderForecastIsStale(provider, now = Date.now(), staleAfterMs = BURN_FORECAST_STALE_MS) {
  if (!provider?.connected || provider?.error || provider?.activity === 'stale') return true
  const lastUpdatedAt = burnFiniteNumber(provider?.lastUpdatedAt)
  if (lastUpdatedAt != null && lastUpdatedAt > 0 && now - lastUpdatedAt > staleAfterMs) return true
  const source = `${provider?.sourceLabel || ''} ${provider?.valueLabel || ''}`.toLowerCase()
  if (source.includes('cached')) return true
  return (provider?.extra || []).some((item) => {
    const text = `${item?.label || ''} ${item?.value || ''}`.toLowerCase()
    return text.includes('cached') || text.includes('last good')
  })
}

function burnUnavailableForecast(availability, label, detail) {
  return {
    availability,
    projectedUsedPct: null,
    projectedLeftPct: null,
    projectedOverPct: null,
    expectedUsedPct: null,
    markerUsedPct: null,
    markerLeftPct: null,
    evenPaceUsedPct: null,
    evenPaceLeftPct: null,
    label,
    detail,
    tone: 'muted',
  }
}

function burnForecastForWindow(window, options = {}) {
  const now = burnFiniteNumber(options.now) ?? Date.now()
  if (options.stale) return burnUnavailableForecast('stale', 'Forecast paused', 'Waiting for fresh usage')

  const usedPct = window?.usedPct == null ? null : burnFiniteNumber(window.usedPct)
  if (usedPct == null) return burnUnavailableForecast('unavailable', 'Forecast unavailable', 'Usage percentage is missing')

  const resetAt = window?.resetAt == null ? null : burnFiniteNumber(window.resetAt)
  if (resetAt == null) return burnUnavailableForecast('missing-reset', 'Forecast unavailable', 'Reset time is missing')
  if (resetAt <= now) return burnUnavailableForecast('reset', 'Resetting now', 'Waiting for the new window')
  if (window?.forecastEligible === false) {
    const detail = window.forecastDisabledReason === 'synthetic-reset'
      ? 'Local rolling reset is inferred'
      : window.forecastDisabledReason === 'inferred-quota'
        ? 'Local quota and reset are inferred'
      : 'This window has no authoritative forecast'
    return burnUnavailableForecast('unavailable', 'Forecast unavailable', detail)
  }
  const pace = window?.pace
  const projected = burnFiniteNumber(pace?.projectedAtResetPercent)
  const expected = burnFiniteNumber(pace?.expectedUsedPercent)
  if (projected == null || expected == null) {
    return burnUnavailableForecast('unavailable', 'Forecast unavailable', 'Not enough timing data')
  }

  const projectedUsedPct = Math.max(0, Math.round(projected))
  const projectedLeftPct = Math.max(0, Math.round(100 - projectedUsedPct))
  const projectedOverPct = Math.max(0, Math.round(projectedUsedPct - 100))
  const expectedUsedPct = burnClampPct(expected)
  const exhausted = usedPct >= 100
  const over = projectedOverPct > 0
  const label = exhausted
    ? '0% left · cap reached'
    : over
      ? `~${projectedOverPct}% over cap at reset`
      : `~${projectedLeftPct}% left at reset`

  return {
    availability: exhausted ? 'exhausted' : 'ready',
    projectedUsedPct,
    projectedLeftPct,
    projectedOverPct,
    expectedUsedPct,
    markerUsedPct: burnClampPct(projectedUsedPct),
    markerLeftPct: burnClampPct(projectedLeftPct),
    evenPaceUsedPct: expectedUsedPct,
    evenPaceLeftPct: expectedUsedPct == null ? null : 100 - expectedUsedPct,
    label,
    detail: over && exhausted
      ? `~${projectedOverPct}% excess demand at reset · Est. at current pace`
      : 'Est. at current pace',
    tone: exhausted || over || projectedUsedPct >= 90 ? 'warn' : 'ok',
  }
}

function burnWindowCaption(window) {
  const label = String(window?.label || window?.kind || 'Window').toUpperCase()
  const kind = String(window?.kind || '').toLowerCase()
  if (kind === '5h') return '5H'
  if (kind === '7d') return '7D'
  if (kind === 'cycle') return label
  return label
}

function burnFindPrimaryWindow(windows, kind, providerId) {
  if (providerId === 'codex') {
    const label = kind === '5h' ? 'session' : 'weekly'
    return (windows || []).find((w) => String(w?.label || '').trim().toLowerCase() === label) || null
  }
  return burnFindWindow(windows, kind)
}

function burnPrimaryWindows(windows, providerId) {
  if (providerId === 'cursor') {
    return (windows || []).filter((w) => burnFiniteNumber(w?.usedPct) != null).slice(0, 3)
  }
  const session = burnFindPrimaryWindow(windows, '5h', providerId)
  const weekly = burnFindPrimaryWindow(windows, 'weekly', providerId)
  const agentSdk = (windows || []).find((w) => w.kind === 'agent-sdk-credit')
  const primary = [session, weekly].filter(Boolean)
  if (agentSdk) primary.push(agentSdk)
  if (primary.length) return primary
  return (windows || []).slice(0, 1)
}

function burnWindowValue(window) {
  if (window?.valueLabel) return String(window.valueLabel).toUpperCase()
  const pct = burnFiniteNumber(window?.usedPct)
  return pct == null ? '—' : `${burnPct(pct)}%`
}

function burnPct(v) {
  return Math.max(0, Math.min(100, Math.round(Number(v) || 0)))
}

function burnLeftPct(usedPct, remainingPct) {
  const explicit = burnFiniteNumber(remainingPct)
  if (explicit != null) return burnPct(explicit)
  const used = burnFiniteNumber(usedPct)
  return used == null ? null : burnPct(100 - used)
}

function burnMeterMode(options) {
  return options?.usageMeterMode === 'left' ? 'left' : 'used'
}

function burnMeterForPct(usedPct, remainingPct, options) {
  const mode = burnMeterMode(options)
  if (mode === 'left') {
    const left = burnLeftPct(usedPct, remainingPct)
    return {
      pct: left == null ? 0 : left,
      value: left == null ? '—' : `${left}%`,
      label: 'LEFT',
      summary: left == null ? '—' : `${left}% LEFT`,
    }
  }
  const used = burnFiniteNumber(usedPct)
  const pct = used == null ? 0 : burnPct(used)
  return {
    pct,
    value: used == null ? '—' : `${pct}%`,
    label: 'USED',
    summary: used == null ? '—' : `${pct}%`,
  }
}

function burnAdaptMetric(metric, provider, options, forecastStale) {
  if (metric.type !== 'window') return { ...metric }
  const window = metric.source || {}
  const meter = burnMeterForPct(window.usedPct, window.remainingPct, options)
  return {
    ...metric,
    label: burnWindowCaption(window),
    kind: window.kind || null,
    usedPct: burnFiniteNumber(window.usedPct),
    remainingPct: burnLeftPct(window.usedPct, window.remainingPct),
    pct: burnFiniteNumber(window.usedPct) == null ? null : meter.pct,
    value: window.valueLabel ? burnWindowValue(window) : meter.summary,
    resetAt: burnFiniteNumber(window.resetAt),
    reset: burnFormatReset(window.resetAt),
    forecast: burnForecastForWindow(window, { now: options.now, stale: forecastStale }),
  }
}

// 9-tick history for the sparkline. Prefer a window's historySeries; fall back
// to a flat line at the headline used%.
function burnSpark(windows, used) {
  const src = burnFindWindow(windows, '5h') || burnFindWindow(windows, 'weekly') || (windows || [])[0]
  const series = Array.isArray(src?.historySeries) ? src.historySeries : []
  if (series.length >= 2) {
    return series.slice(-9).map((p) => burnPct(p.usedPct))
  }
  return Array(9).fill(burnPct(used))
}

// Burning = on pace to blow the cap before reset. Pace data preferred;
// otherwise fall back to a high-usage heuristic.
function burnStatus(provider, windows) {
  const connected = provider.connected !== false
  const used = Number(provider.capturedPct)
  if (!connected || !Number.isFinite(used) || used <= 0) return 'idle'
  for (const w of windows || []) {
    const projected = Number(w?.pace?.projectedAtResetPercent)
    if (Number.isFinite(projected) && projected >= 90) return 'warn'
  }
  if (windows?.some((w) => burnPct(w.usedPct) >= 85)) return 'warn'
  return 'ok'
}

function burnAdaptProvider(provider, options = {}) {
  const windows = Array.isArray(provider.windows) ? provider.windows : []
  const providerFamily = provider.providerFamily || provider.id
  const session = burnFindPrimaryWindow(windows, '5h', providerFamily)
  const weekly = burnFindPrimaryWindow(windows, 'weekly', providerFamily)
  const used = burnPct(provider.capturedPct)
  const meterSource = session || provider
  const meter = burnMeterForPct(
    meterSource.usedPct ?? provider.capturedPct,
    meterSource === provider ? provider.remainingPct : meterSource.remainingPct,
    options,
  )
  const status = burnStatus(provider, windows)
  const forecastStale = options.forecastStale === true || burnProviderForecastIsStale(
    provider,
    burnFiniteNumber(options.now) ?? Date.now(),
    burnFiniteNumber(options.forecastStaleAfterMs) ?? BURN_FORECAST_STALE_MS,
  )
  // Reset shown on the collapsed row: prefer the soonest window reset.
  const resetWindows = providerFamily === 'codex' ? burnPrimaryWindows(windows, providerFamily) : windows
  const resets = [...resetWindows.map((w) => w.resetAt), provider.resetAt].filter(Boolean)
  const soonest = resets.length ? Math.min(...resets) : null
  const displayWindows = burnPrimaryWindows(windows, providerFamily)
    .filter((w) => w && (w.kind !== 'cycle' ? true : w?.label))
    .map((w) => {
      const forecast = burnForecastForWindow(w, { now: options.now, stale: forecastStale })
      return {
        label: burnWindowCaption(w),
        kind: w.kind || null,
        usedPct: burnFiniteNumber(w.usedPct),
        remainingPct: burnLeftPct(w.usedPct, w.remainingPct),
        pct: burnFiniteNumber(w.usedPct) == null ? null : burnMeterForPct(w.usedPct, w.remainingPct, options).pct,
        value: w.valueLabel ? burnWindowValue(w) : burnMeterForPct(w.usedPct, w.remainingPct, options).summary,
        resetAt: burnFiniteNumber(w.resetAt),
        reset: burnFormatReset(w.resetAt),
        forecast,
      }
    })

  const registry = typeof BurnMetrics !== 'undefined' ? BurnMetrics.registryForProvider(provider) : []
  const layoutResult = typeof BurnMetrics !== 'undefined'
    ? BurnMetrics.applyLayout(registry, options.metricLayouts?.[provider.id])
    : { layout: null, primary: [], expanded: [], hidden: [] }
  const adaptRegistered = (metric) => burnAdaptMetric(metric, provider, options, forecastStale)
  const primaryMetrics = layoutResult.primary.map(adaptRegistered)
  const expandedMetrics = layoutResult.expanded.map(adaptRegistered)
  const metrics = [...primaryMetrics, ...expandedMetrics]

  const primaryKind = session?.kind || weekly?.kind || null
  const primaryLabel = burnWindowCaption(session || weekly || {})
  const primaryForecastWindow = displayWindows.find((w) => w.kind === primaryKind && w.label === primaryLabel)
    || displayWindows[0]
    || null

  return {
    id: provider.id,
    name: provider.name || provider.id,
    plan: provider.plan || '',
    used,
    meterPct: meter.pct,
    meterValue: meter.value,
    meterLabel: meter.label,
    s5h: session ? burnPct(session.usedPct) : 0,
    w7d: weekly ? burnPct(weekly.usedPct) : used,
    windowSummary: displayWindows.map((w) => `${w.label} ${w.value}`).join(' · '),
    windows: displayWindows,
    metrics,
    primaryMetrics,
    expandedMetrics,
    metricLayout: layoutResult.layout,
    primaryForecast: primaryForecastWindow?.forecast || null,
    primaryForecastWindow: primaryForecastWindow?.label || null,
    status,
    reset: burnFormatReset(soonest),
    sessionReset: burnFormatReset(session?.resetAt ?? soonest),
    weeklyReset: burnFormatReset(weekly?.resetAt ?? soonest),
    spark: burnSpark(windows, used),
    _raw: provider, // expanded panel (step 3) reads token/model detail from here
  }
}

function burnAdaptProviders(snap, options = {}) {
  const providers = Array.isArray(snap?.providers) ? snap.providers : []
  const now = burnFiniteNumber(options.now) ?? Date.now()
  const generatedAt = burnFiniteNumber(snap?.generatedAt)
  const staleAfterMs = burnFiniteNumber(options.forecastStaleAfterMs) ?? BURN_FORECAST_STALE_MS
  const forecastStale = generatedAt != null && now - generatedAt > staleAfterMs
  return providers.map((provider) => burnAdaptProvider(provider, { ...options, now, forecastStale, forecastStaleAfterMs: staleAfterMs }))
}

function burnFormatUsd(n) {
  const v = Number(n) || 0
  return `$${Math.round(v)}`
}

function burnFormatSync(generatedAt) {
  if (!generatedAt) return '—'
  const mins = Math.max(0, Math.round((Date.now() - generatedAt) / 60000))
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h`
}

// Token count (already in millions) → '5.5B' / '87M' / '400K' per DATA.md.
function burnFormatTokensM(m) {
  if (m == null || Number.isNaN(Number(m))) return '—'
  const v = Number(m) || 0
  if (v >= 1000) return `${(v / 1000).toFixed(1)}B`
  if (v >= 1) return `${v % 1 === 0 ? v : Math.round(v * 10) / 10}M`
  return `${Math.round(v * 1000)}K`
}

function burnToM(raw) {
  const number = burnFiniteNumber(raw)
  return number == null ? null : number / 1e6
}

function burnLocalDayKey(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return `${date.getFullYear()}-${burnPad2(date.getMonth() + 1)}-${burnPad2(date.getDate())}`
}

function burnNormalizeDayKey(value) {
  const text = String(value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  return burnLocalDayKey(value)
}

function burnCalendarKeys(now = Date.now()) {
  const date = new Date(now)
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)
  return { today: burnLocalDayKey(today), yesterday: burnLocalDayKey(yesterday), first30: burnLocalDayKey(first) }
}

function burnCostKind(value) {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'hypothetical') return 'hypothetical'
  if (normalized === 'estimate' || normalized === 'estimated') return 'estimated'
  return 'measured'
}

function burnPricingDetail(container, models = []) {
  const unpriced = Array.isArray(container?.unpricedModels)
    ? container.unpricedModels.map(String)
    : models.filter((row) => row.usd == null).map((row) => row.name)
  const sources = Array.isArray(container?.pricingSources)
    ? container.pricingSources.map(String)
    : container?.pricingSource ? [String(container.pricingSource)] : []
  const accuracy = burnCostKind(container?.costAccuracy)
  return {
    accuracy,
    source: sources.length ? [...new Set(sources)].join(', ') : accuracy === 'measured' ? String(container?.source || 'provider data') : 'rate source unavailable',
    unpricedModels: [...new Set(unpriced)],
  }
}

// Best-effort expansion detail from the raw snapshot provider. Calendar rows
// retain unknown token/cost values instead of coercing them to zero.
function burnAdaptExpanded(raw, options = {}) {
  const usage = raw?.tokenUsage || null
  const hasTokenSource = !!usage && burnFiniteNumber(usage.total) != null
  const events = Number(usage?.events ?? usage?.requests) || 0

  // Raw token millions (unrounded); burn-home formats via burnFormatTokensM so
  // sub-million precision survives and matches burnCostRow's formatting.
  const inOut = {
    in: hasTokenSource ? burnToM(usage.input) ?? 0 : null,
    cached: hasTokenSource ? burnToM(usage.cached) ?? 0 : null,
    out: hasTokenSource ? burnToM(usage.output) ?? 0 : null,
    events,
  }

  const dailyRaw = Array.isArray(usage?.dailyBreakdown)
    ? usage.dailyBreakdown
    : Array.isArray(usage?.dailyUsage)
      ? usage.dailyUsage
      : []
  const daily = dailyRaw
    .map((row) => ({
      date: burnNormalizeDayKey(row.date || row.dayKey || row.day),
      tok: burnToM(row.total ?? row.totalTokens),
      usd: burnFiniteNumber(row.costUSD),
      costAccuracy: row.costAccuracy || usage?.costAccuracy || null,
      pricingSource: row.pricingSource || (Array.isArray(row.pricingSources) ? row.pricingSources.join(', ') : usage?.pricingSource),
      unpricedModels: Array.isArray(row.unpricedModels) ? row.unpricedModels.map(String) : [],
    }))
    .filter((row) => row.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1)) // newest first

  const sumKnown = (arr, pick) => {
    const values = arr.map(pick).filter((value) => value != null && Number.isFinite(Number(value)))
    return values.length ? values.reduce((sum, value) => sum + Number(value), 0) : null
  }
  const keys = burnCalendarKeys(options.now ?? Date.now())
  const byDate = new Map(daily.map((row) => [row.date, row]))
  const inLast30 = daily.filter((row) => row.date >= keys.first30 && row.date <= keys.today)
  const unavailable = { tok: null, usd: null, available: false, pricing: burnPricingDetail(usage) }
  const periodRow = (row) => row
    ? { ...row, available: true, pricing: burnPricingDetail({ ...usage, ...row, unpricedModels: row.unpricedModels.length ? row.unpricedModels : usage?.unpricedModels }) }
    : { ...unavailable }
  const tokens = hasTokenSource
    ? {
        today: periodRow(byDate.get(keys.today)),
        yest: periodRow(byDate.get(keys.yesterday)),
        last30: inLast30.length ? {
          tok: sumKnown(inLast30, (row) => row.tok),
          usd: sumKnown(inLast30, (row) => row.usd),
          available: true,
          pricing: burnPricingDetail(usage),
        } : { ...unavailable },
      }
    : {
        today: { tok: null, usd: null },
        yest: { tok: null, usd: null },
        last30: { tok: null, usd: null },
      }

  const breakdowns = Array.isArray(usage?.modelBreakdowns)
    ? usage.modelBreakdowns
    : Array.isArray(usage?.topModels)
      ? usage.topModels
      : []
  const totalTok = breakdowns.reduce((acc, r) => acc + (Number(r.total ?? r.totalTokens) || 0), 0) || 1
  const models = hasTokenSource ? breakdowns
    .map((r) => {
      const tokRaw = Number(r.total ?? r.totalTokens) || 0
      return {
        name: r.model || r.modelName || 'unknown',
        burn: Math.round((tokRaw / totalTok) * 100),
        tok: burnToM(tokRaw),
        usd: burnFiniteNumber(r.costUSD),
        costAccuracy: r.costAccuracy || usage?.costAccuracy || null,
        pricingSource: r.pricingSource || usage?.pricingSource || null,
        pricingModel: r.pricingModel || null,
      }
    })
    .sort((a, b) => b.burn - a.burn) : []

  const pricing = burnPricingDetail(usage, models)
  const omitted = pricing.unpricedModels.length
  const costMeta = hasTokenSource
    ? `${omitted ? 'partial ' : ''}${pricing.accuracy} · ${pricing.source}`
    : 'billing usage only'
  return { inOut, tokens, models, pricing, costMeta, hasTokenSource, hasDailyUsage: daily.length > 0 }
}

function burnAdaptFooter(snap) {
  const totals = snap?.totals || {}
  const spent = totals.spent ?? totals.captured ?? 0
  const left = totals.left ?? totals.remaining ?? 0
  return [
    { l: 'PLAN USED', v: burnFormatUsd(spent), tone: 'lime' },
    { l: 'PLAN LEFT', v: burnFormatUsd(left), tone: 'warn' },
    {
      l: snap?.refresh?.nextRefreshAt ? 'NEXT REFRESH' : 'SYNC',
      v: snap?.refresh?.nextRefreshAt ? burnFormatReset(snap.refresh.nextRefreshAt) : 'SYNC',
      tone: 'text',
      action: 'sync',
    },
  ]
}
