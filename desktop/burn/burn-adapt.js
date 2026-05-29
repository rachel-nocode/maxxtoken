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

function burnPct(v) {
  return Math.max(0, Math.min(100, Math.round(Number(v) || 0)))
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

function burnAdaptProvider(provider) {
  const windows = Array.isArray(provider.windows) ? provider.windows : []
  const session = burnFindWindow(windows, '5h')
  const weekly = burnFindWindow(windows, 'weekly')
  const used = burnPct(provider.capturedPct)
  const status = burnStatus(provider, windows)
  // Reset shown on the collapsed row: prefer the soonest window reset.
  const resets = windows.map((w) => w.resetAt).filter(Boolean)
  const soonest = resets.length ? Math.min(...resets) : null

  return {
    id: provider.id,
    name: provider.name || provider.id,
    plan: provider.plan || '',
    used,
    s5h: session ? burnPct(session.usedPct) : 0,
    w7d: weekly ? burnPct(weekly.usedPct) : used,
    status,
    reset: burnFormatReset(soonest),
    sessionReset: burnFormatReset(session?.resetAt ?? soonest),
    weeklyReset: burnFormatReset(weekly?.resetAt ?? soonest),
    spark: burnSpark(windows, used),
    _raw: provider, // expanded panel (step 3) reads token/model detail from here
  }
}

function burnAdaptProviders(snap) {
  const providers = Array.isArray(snap?.providers) ? snap.providers : []
  return providers.map(burnAdaptProvider)
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
  const usage = raw?.tokenUsage || {}
  const events = Number(usage.events ?? usage.requests) || 0

  const inOut = {
    in: Math.round(burnToM(usage.input)),
    cached: Math.round(burnToM(usage.cached)),
    out: Math.round(burnToM(usage.output) * 10) / 10,
    events,
  }

  const dailyRaw = Array.isArray(usage.dailyBreakdown)
    ? usage.dailyBreakdown
    : Array.isArray(usage.dailyUsage)
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
  const tokens = {
    today: daily[0] || { tok: 0, usd: 0 },
    yest: daily[1] || { tok: 0, usd: 0 },
    last30: {
      tok: sum(daily.slice(0, 30), (d) => d.tok),
      usd: sum(daily.slice(0, 30), (d) => d.usd),
    },
  }

  const breakdowns = Array.isArray(usage.modelBreakdowns)
    ? usage.modelBreakdowns
    : Array.isArray(usage.topModels)
      ? usage.topModels
      : []
  const totalTok = breakdowns.reduce((acc, r) => acc + (Number(r.total ?? r.totalTokens) || 0), 0) || 1
  const burning = burnStatus(raw, raw?.windows) === 'warn'
  const models = breakdowns
    .map((r) => {
      const tokRaw = Number(r.total ?? r.totalTokens) || 0
      return {
        name: r.model || r.modelName || 'unknown',
        burn: Math.round((tokRaw / totalTok) * 100),
        tok: burnToM(tokRaw),
        usd: Number(r.costUSD) || 0,
        color: burning ? BURN.warn : BURN.lime,
      }
    })
    .sort((a, b) => b.burn - a.burn)

  const costMeta = raw?.id === 'cursor' ? 'plan included' : 'estimated'
  return { inOut, tokens, models, costMeta }
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
