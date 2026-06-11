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
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function burnWindowCaption(window) {
  const label = String(window?.label || window?.kind || 'Window').toUpperCase()
  const kind = String(window?.kind || '').toLowerCase()
  if (kind === '5h') return '5H'
  if (kind === '7d') return '7D'
  if (kind === 'cycle') return label
  return label
}

function burnPrimaryWindows(windows) {
  const session = burnFindWindow(windows, '5h')
  const weekly = burnFindWindow(windows, 'weekly')
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
  const session = burnFindWindow(windows, '5h')
  const weekly = burnFindWindow(windows, 'weekly')
  const used = burnPct(provider.capturedPct)
  const meterSource = session || provider
  const meter = burnMeterForPct(
    meterSource.usedPct ?? provider.capturedPct,
    meterSource === provider ? provider.remainingPct : meterSource.remainingPct,
    options,
  )
  const status = burnStatus(provider, windows)
  // Reset shown on the collapsed row: prefer the soonest window reset.
  const resets = [...windows.map((w) => w.resetAt), provider.resetAt].filter(Boolean)
  const soonest = resets.length ? Math.min(...resets) : null
  const displayWindows = burnPrimaryWindows(windows)
    .filter((w) => w && (w.kind !== 'cycle' ? true : w?.label))
    .map((w) => ({
      label: burnWindowCaption(w),
      pct: burnFiniteNumber(w.usedPct) == null ? null : burnMeterForPct(w.usedPct, w.remainingPct, options).pct,
      value: w.valueLabel ? burnWindowValue(w) : burnMeterForPct(w.usedPct, w.remainingPct, options).summary,
      reset: burnFormatReset(w.resetAt),
    }))

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
  return providers.map((provider) => burnAdaptProvider(provider, options))
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
  return (Number(raw) || 0) / 1e6
}

// Best-effort expansion detail from the raw snapshot provider. Missing cost
// data degrades to 0 (rendered as '—' / 'incl.').
function burnAdaptExpanded(raw) {
  const usage = raw?.tokenUsage || null
  const hasTokenSource = !!usage && Number.isFinite(Number(usage.total)) && Number(usage.total) > 0
  const events = Number(usage?.events ?? usage?.requests) || 0

  // Raw token millions (unrounded); burn-home formats via burnFormatTokensM so
  // sub-million precision survives and matches burnCostRow's formatting.
  const inOut = {
    in: hasTokenSource ? burnToM(usage.input) : null,
    cached: hasTokenSource ? burnToM(usage.cached) : null,
    out: hasTokenSource ? burnToM(usage.output) : null,
    events,
  }

  const dailyRaw = Array.isArray(usage?.dailyBreakdown)
    ? usage.dailyBreakdown
    : Array.isArray(usage?.dailyUsage)
      ? usage.dailyUsage
      : []
  const daily = dailyRaw
    .map((row) => ({
      date: String(row.date || row.dayKey || row.day || ''),
      tok: burnToM(row.total ?? row.totalTokens),
      usd: Number(row.costUSD) || 0,
    }))
    .filter((row) => row.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1)) // newest first

  const sum = (arr, pick) => arr.reduce((acc, x) => acc + pick(x), 0)
  const tokens = hasTokenSource
    ? {
        today: daily[0] || { tok: 0, usd: 0 },
        yest: daily[1] || { tok: 0, usd: 0 },
        last30: {
          tok: daily.length ? sum(daily.slice(0, 30), (d) => d.tok) : burnToM(usage.total),
          usd: daily.length ? sum(daily.slice(0, 30), (d) => d.usd) : Number(usage.costUSD) || 0,
        },
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
        usd: Number(r.costUSD) || 0,
      }
    })
    .sort((a, b) => b.burn - a.burn) : []

  const costMeta = hasTokenSource
    ? usage?.costAccuracy === 'hypothetical'
      ? 'hypothetical'
      : 'estimated'
    : 'billing usage only'
  return { inOut, tokens, models, costMeta, hasTokenSource, hasDailyUsage: daily.length > 0 }
}

function burnAdaptFooter(snap) {
  const totals = snap?.totals || {}
  const spent = totals.spent ?? totals.captured ?? 0
  const left = totals.left ?? totals.remaining ?? 0
  return [
    { l: 'SPENT', v: burnFormatUsd(spent), tone: 'lime' },
    { l: 'LEFT', v: burnFormatUsd(left), tone: 'warn' },
    { l: 'SYNC', v: burnFormatSync(snap?.generatedAt), tone: 'text', action: 'sync' },
  ]
}
