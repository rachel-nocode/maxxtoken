/* OPTIMIZE detection layer — turns the live snapshot we ALREADY collect into
   money-saving Signals. Pure CommonJS: no electron, no I/O. Same input as the
   Burn adapter (snapshot.providers[]) so it stays in lockstep with burn-adapt.js.

   Step 1 ships the three ZERO-NEW-DATA detectors that the current snapshot
   fully supports:
     - cache  : cache-read vs fresh input  (tokenUsage.input / .cached)
     - ratio  : generation vs context in   (tokenUsage.output / input+cached)
     - reset  : paid weekly cap left to expire (windows[].usedPct + resetAt)

   Plan right-sizing and Dormant are intentionally NOT here yet — they need a
   tier-ladder map + weekly-peak aggregation, and lastActive propagated into the
   snapshot (today it's dropped in aggregate). See optimize-handoff/DATA.md.

   Output shape === optimize-handoff/reference/optimize-data.jsx `Signal`. */

// ---------------------------------------------------------------------------
// CONFIG — every threshold + estimation knob lives here so we can tune them
// during testing without touching detector logic. Mirror Burn's warn-levels:
// these should graduate into config.js once the numbers settle.
// ---------------------------------------------------------------------------
const CONFIG = {
  cache: {
    alertBelow: 0.4, // hit rate < 40% => alert
    nudgeBelow: 0.7, // < 70% => nudge, else ok (filtered out)
    minInputM: 50, // ignore providers with < 50M input/30d (too small to matter)
    targetHitRate: 0.8, // realistically achievable cache hit with a stable prefix;
    //                      "missed" = tokens that SHOULD be cached but aren't
    minSaving: 5, // suppress signals worth < $5/mo
  },
  ratio: {
    lo: 0.3, // healthy band low
    hi: 3.0, // healthy band high
    alertOutside: { lo: 0.1, hi: 6 }, // way outside + real spend => alert
    minInputM: 50,
    trimmableShare: 0.15, // est. fraction of input spend that's trimmable context
    minSaving: 5,
  },
  reset: {
    expiringPctOver: 60, // > 60% of weekly cap unused
    withinMs: 48 * 3600 * 1000, // and reset is < 48h away
    weeksPerMonth: 4.345,
    minSaving: 5,
  },
  // Coding-agent providers are input-heavy BY DESIGN (read codebase, write small
  // edit) — a 30d ratio always looks "wasteful" and would cry wolf. So ratio
  // does NOT auto-fire for these; instead the UI offers an opt-in per-day
  // drill-down (dailyRatioSeries). Cache still auto-fires for them — pinning a
  // prefix genuinely helps agents. Note: in this app `claude`=Claude Code,
  // `codex`=Codex/ChatGPT CLI — both agentic.
  agenticProviders: [
    'claude', 'codex', 'cursor', 'copilot', 'windsurf', 'kilo', 'opencode',
    'opencodego', 'factory', 'jetbrains', 'commandcode', 'augment', 'cline',
    'aider', 'zed',
  ],
  // Snooze hides a signal for a fixed window; dismiss hides it until the
  // underlying metric moves materially (re-trigger deltas below). See
  // optimize-handoff/DATA.md "Re-trigger after Dismiss".
  snoozeDays: 30,
  retrigger: {
    cacheDropPts: 10, // cache hit % falls another 10pts → resurface
    resetRisePts: 10, // reset expiring % climbs another 10pts → resurface
    ratioRelChange: 0.25, // ratio moves ±25% → resurface
  },
}

// Prompt-caching docs by provider family — the cache card's "how to pin a
// prefix" deep-link. Falls back to the Anthropic guide.
const CACHE_DOCS = {
  claude: 'https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching',
  anthropic: 'https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching',
  codex: 'https://platform.openai.com/docs/guides/prompt-caching',
  openai: 'https://platform.openai.com/docs/guides/prompt-caching',
  chatgpt: 'https://platform.openai.com/docs/guides/prompt-caching',
  gemini: 'https://ai.google.dev/gemini-api/docs/caching',
  _default: 'https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching',
}

function cacheDocFor(providerId) {
  return CACHE_DOCS[providerId] || CACHE_DOCS._default
}

function isAgentic(providerId) {
  return CONFIG.agenticProviders.includes(providerId)
}

// Flat subscription (Max/Pro $X/mo) vs usage-based/API billing. On a flat plan
// the per-token bill is sunk — better caching/trimming buys HEADROOM (quota),
// not a smaller invoice. Only usage-based providers yield hard recoverable $.
function isFlatPlan(provider) {
  return Number(provider && provider.monthly) > 0
}

// Per-provider-family blended token rates ($/token) for $ estimates when the
// snapshot has no costUSD. Conservative mid-tier numbers; refine with real
// model-mix data later. cacheRead ~= 10% of input across Claude/OpenAI.
const FAMILY_RATES = {
  claude: { input: 3e-6, cacheRead: 3e-7, output: 1.5e-5 },
  codex: { input: 1.25e-6, cacheRead: 1.25e-7, output: 1e-5 },
  openai: { input: 1.25e-6, cacheRead: 1.25e-7, output: 1e-5 },
  chatgpt: { input: 1.25e-6, cacheRead: 1.25e-7, output: 1e-5 },
  grok: { input: 3e-6, cacheRead: 7.5e-7, output: 1.5e-5 },
  gemini: { input: 1.25e-6, cacheRead: 3.125e-7, output: 1e-5 },
  _default: { input: 2e-6, cacheRead: 2e-7, output: 1e-5 },
}

function ratesFor(providerId) {
  return FAMILY_RATES[providerId] || FAMILY_RATES._default
}

// ---------------------------------------------------------------------------
// formatters — mirror optimize-data.jsx / burn-adapt.js so the UI is identical
// ---------------------------------------------------------------------------
function fmtUSD(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return '$' + Math.round(Number(n)).toLocaleString('en-US')
}

// tokens passed in raw (not millions) → '2.83B' / '880M' / '400K'
function fmtTokRaw(t) {
  const v = Number(t) || 0
  if (v >= 1e9) return (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B'
  if (v >= 1e6) return Math.round(v / 1e6) + 'M'
  if (v >= 1e3) return Math.round(v / 1e3) + 'K'
  return String(Math.round(v))
}

function pct(v) {
  return Math.max(0, Math.min(100, Math.round(Number(v) || 0)))
}

function clampNum(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

// ---------------------------------------------------------------------------
// snapshot field helpers
// ---------------------------------------------------------------------------
function tokenUsage(provider) {
  return provider && provider.tokenUsage ? provider.tokenUsage : null
}

// weekly window = a 7d window that isn't the 5h session or 30d billing cycle
function weeklyWindow(provider) {
  const windows = Array.isArray(provider.windows) ? provider.windows : []
  return (
    windows.find((w) => w.kind === '7d') ||
    windows.find((w) => w.kind !== '5h' && w.kind !== 'cycle') ||
    null
  )
}

function soonestResetAt(provider) {
  const windows = Array.isArray(provider.windows) ? provider.windows : []
  const resets = windows.map((w) => w.resetAt).filter(Boolean)
  return resets.length ? Math.min(...resets) : provider.resetAt || null
}

function resetLabel(resetAt, now) {
  if (!resetAt) return '—'
  const diff = resetAt - now
  if (diff <= 0) return 'reset due'
  const totalMin = Math.floor(diff / 60000)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const mins = totalMin % 60
  if (days >= 1) return `${days}d ${String(hours).padStart(2, '0')}h`
  return `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`
}

function providerName(provider) {
  return provider.name || provider.id
}

function planLabel(provider) {
  return (provider.plan || '').toUpperCase()
}

// per-model cache-hit bars when the breakdown carries input/cached; else null
function cacheBarsByModel(usage) {
  const rows = Array.isArray(usage.modelBreakdowns)
    ? usage.modelBreakdowns
    : Array.isArray(usage.topModels)
      ? usage.topModels
      : []
  const bars = rows
    .map((r) => {
      const input = Number(r.input) || 0
      const cached = Number(r.cached) || 0
      if (input + cached <= 0) return null
      return { name: r.model || r.modelName || 'model', pct: pct((cached / (input + cached)) * 100) }
    })
    .filter(Boolean)
  return bars.length ? bars : null
}

// ---------------------------------------------------------------------------
// DETECTOR 1 — cache efficiency
// ---------------------------------------------------------------------------
function detectCache(provider) {
  const usage = tokenUsage(provider)
  if (!usage) return null
  const input = Number(usage.input) || 0 // fresh / uncached input tokens (30d)
  const cached = Number(usage.cached) || 0 // cache-read tokens (30d)
  const totalIn = input + cached
  if (totalIn <= 0) return null
  if (totalIn < CONFIG.cache.minInputM * 1e6) return null

  const hit = cached / totalIn
  let severity = 'ok'
  if (hit < CONFIG.cache.alertBelow) severity = 'alert'
  else if (hit < CONFIG.cache.nudgeBelow) severity = 'nudge'
  if (severity === 'ok') return null

  const flat = isFlatPlan(provider)
  // On a flat plan an inefficiency is headroom pressure, not bill waste — never
  // alert, never count toward recoverable $.
  if (flat && severity === 'alert') severity = 'nudge'

  const rates = ratesFor(provider.id)
  // "missed" = tokens that SHOULD be cached (up to the achievable ceiling) but
  // aren't, valued at the (input − cacheRead) discount they forgo, over ~30d.
  const missedTokens = Math.max(0, CONFIG.cache.targetHitRate - hit) * totalIn
  const saving = missedTokens * (rates.input - rates.cacheRead)
  if (saving < CONFIG.cache.minSaving) return null

  const hitPct = pct(hit * 100)
  const bars = cacheBarsByModel(usage)
  const valueLabel = flat ? 'Headroom value' : 'Cache discount missed'
  return {
    id: `${provider.id}:cache`,
    kind: 'cache',
    provider: provider.id,
    providerName: providerName(provider),
    plan: planLabel(provider),
    severity,
    title: 'CACHE EFFICIENCY',
    metric: `${hitPct}%`,
    metricValue: hitPct, // raw number for re-trigger comparison
    metricUnit: 'CACHE HIT',
    signal: flat
      ? 'Quota burned re-sending context that could be cached.'
      : 'Most repeated context is re-sent at full price.',
    saving,
    savingNote: flat ? 'HEADROOM' : '/MO',
    softSaving: flat, // flat-plan caching buys quota, not a smaller bill
    fix: 'Pin a stable system-prompt prefix so the cache can hold it.',
    source: 'cached tokens · input tokens',
    action: { type: 'external', url: cacheDocFor(provider.id) },
    meter: { type: 'split', good: hitPct },
    detail: {
      rows: [
        { l: 'Input · 30d', v: `${fmtTokRaw(totalIn)} tok` },
        { l: 'Served from cache', v: `${fmtTokRaw(cached)} · ${hitPct}%`, tone: 'lime' },
        { l: 'Re-sent uncached', v: `${fmtTokRaw(input)} · ${100 - hitPct}%`, tone: 'warn' },
        { l: valueLabel, v: `${fmtUSD(saving)} / mo`, tone: flat ? 'lime' : 'warn', strong: true },
      ],
      barsTitle: bars ? 'CACHE HIT BY MODEL' : null,
      bars,
      note: flat
        ? 'On a flat-rate plan this is quota you could reclaim, not a smaller bill — better caching lets you do more before hitting the cap.'
        : null,
      primary: 'How to pin a prefix →',
    },
  }
}

// ---------------------------------------------------------------------------
// DETECTOR 2 — output / input ratio
// Denominator is input + cached (total context flowing in) so cache-heavy
// providers read correctly — deviates from handoff's bare out/in, on purpose.
// ---------------------------------------------------------------------------
function detectRatio(provider) {
  const usage = tokenUsage(provider)
  if (!usage) return null
  // agentic providers don't auto-fire — handled via on-demand daily drill-down
  if (isAgentic(provider.id)) return null
  const input = Number(usage.input) || 0
  const cached = Number(usage.cached) || 0
  const output = Number(usage.output) || 0
  const totalIn = input + cached
  if (totalIn < CONFIG.ratio.minInputM * 1e6) return null
  if (output <= 0 && totalIn <= 0) return null

  const ratio = totalIn > 0 ? output / totalIn : 999
  if (ratio >= CONFIG.ratio.lo && ratio <= CONFIG.ratio.hi) return null // healthy

  const rates = ratesFor(provider.id)
  const inputSpend = input * rates.input + cached * rates.cacheRead
  const saving = inputSpend * CONFIG.ratio.trimmableShare
  if (saving < CONFIG.ratio.minSaving) return null

  const flat = isFlatPlan(provider)
  const wayOut = ratio < CONFIG.ratio.alertOutside.lo || ratio > CONFIG.ratio.alertOutside.hi
  // Flat plan → headroom, never a hard alert.
  const severity = !flat && wayOut && saving >= 20 ? 'alert' : 'nudge'
  const inputHeavy = ratio < CONFIG.ratio.lo
  const mult = inputHeavy && ratio > 0 ? Math.round(1 / ratio) : null
  const valueLabel = flat ? 'Headroom value' : 'Trimmable spend'

  return {
    id: `${provider.id}:ratio`,
    kind: 'ratio',
    provider: provider.id,
    providerName: providerName(provider),
    plan: planLabel(provider),
    severity,
    title: 'OUTPUT / INPUT RATIO',
    metric: ratio < 0.1 ? ratio.toFixed(3) : ratio.toFixed(2),
    metricValue: ratio,
    metricUnit: 'OUT ÷ IN',
    signal: inputHeavy
      ? `You re-send ${mult ? mult + '×' : 'far'} more context than you generate.`
      : 'Generation is running far ahead of input.',
    saving,
    savingNote: flat ? 'HEADROOM' : '/MO',
    softSaving: flat, // flat-plan trimming buys quota, not a smaller bill
    fix: inputHeavy
      ? 'Trim or summarise stale context between turns.'
      : 'Cap max output / stop runaway generation loops.',
    source: 'input tokens · output tokens',
    action: { type: 'providerLink', kind: 'dashboard' },
    meter: { type: 'ratio', value: clampNum(ratio, 0.001, 999), lo: CONFIG.ratio.lo, hi: CONFIG.ratio.hi },
    detail: {
      rows: [
        { l: 'Context in · 30d', v: `${fmtTokRaw(totalIn)} tok` },
        { l: 'Output · 30d', v: `${fmtTokRaw(output)} tok` },
        { l: 'Healthy range', v: `${CONFIG.ratio.lo} – ${CONFIG.ratio.hi}`, tone: 'lime' },
        { l: valueLabel, v: `${fmtUSD(saving)} / mo`, tone: 'lime', strong: true },
      ],
      barsTitle: null,
      bars: null,
      note: inputHeavy
        ? 'Input-heavy traffic means you pay to re-send context, not to generate. Carrying a summary instead of the full thread cuts the bill.'
        : 'Output far exceeds input — check for runaway generation or missing stop conditions.',
      primary: 'See heaviest prompts →',
    },
  }
}

// ---------------------------------------------------------------------------
// DAILY DRILL-DOWN — for agentic providers. Per-day input/cached/output is
// reconstructed by summing each day's topModels splits (the day row itself only
// carries totalTokens). ~14 days retained for Claude/Codex.
// ---------------------------------------------------------------------------
function dailyRows(provider) {
  const usage = tokenUsage(provider)
  if (!usage) return []
  return Array.isArray(usage.dailyBreakdown)
    ? usage.dailyBreakdown
    : Array.isArray(usage.dailyUsage)
      ? usage.dailyUsage
      : []
}

// → [{ dayKey, input, cached, output, totalIn, ratio, cacheHitPct, costUSD }]
// newest first. Days with no model splits are skipped.
function dailyRatioSeries(provider, opts = {}) {
  const days = opts.days || 14
  const out = []
  for (const day of dailyRows(provider)) {
    const models = Array.isArray(day.topModels) ? day.topModels : []
    let input = 0
    let cached = 0
    let output = 0
    let costUSD = 0
    for (const m of models) {
      input += Number(m.input) || 0
      cached += Number(m.cached) || 0
      output += Number(m.output) || 0
      costUSD += Number(m.costUSD) || 0
    }
    const totalIn = input + cached
    if (totalIn <= 0 && output <= 0) continue
    out.push({
      dayKey: String(day.dayKey || day.date || day.day || ''),
      input,
      cached,
      output,
      totalIn,
      ratio: totalIn > 0 ? output / totalIn : 0,
      cacheHitPct: totalIn > 0 ? pct((cached / totalIn) * 100) : 0,
      costUSD: costUSD || Number(day.costUSD) || 0,
    })
  }
  out.sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1)) // newest first
  return out.slice(0, days)
}

// On-demand ratio Signal for one day of an agentic provider (drill-down click).
// Returns null if the day has no usable data.
function detectRatioDaily(provider, dayKey) {
  const row = dailyRatioSeries(provider, { days: 60 }).find((d) => d.dayKey === dayKey)
  if (!row || row.totalIn <= 0) return null
  const rates = ratesFor(provider.id)
  const inputSpend = row.input * rates.input + row.cached * rates.cacheRead
  const saving = inputSpend * CONFIG.ratio.trimmableShare
  const inputHeavy = row.ratio < CONFIG.ratio.lo
  const mult = inputHeavy && row.ratio > 0 ? Math.round(1 / row.ratio) : null
  return {
    id: `${provider.id}:ratio:${dayKey}`,
    kind: 'ratio',
    provider: provider.id,
    providerName: providerName(provider),
    plan: planLabel(provider),
    severity: 'nudge', // drill-down is informational, never an auto-alert
    onDemand: true,
    title: 'SESSION RATIO',
    metric: row.ratio < 0.1 ? row.ratio.toFixed(3) : row.ratio.toFixed(2),
    metricUnit: `OUT ÷ IN · ${dayKey}`,
    signal: inputHeavy
      ? `On ${dayKey} you sent ${mult ? mult + '×' : 'far'} more context than you generated.`
      : `Output ran ahead of input on ${dayKey}.`,
    saving,
    savingNote: '/DAY',
    softSaving: true, // never counted in the headline recoverable total
    fix: 'Trim or summarise stale context to cut re-sent input on heavy days.',
    source: `daily input/output · ${dayKey}`,
    meter: { type: 'ratio', value: clampNum(row.ratio, 0.001, 999), lo: CONFIG.ratio.lo, hi: CONFIG.ratio.hi },
    detail: {
      rows: [
        { l: 'Context in', v: `${fmtTokRaw(row.totalIn)} tok` },
        { l: 'Output', v: `${fmtTokRaw(row.output)} tok` },
        { l: 'Cache hit', v: `${row.cacheHitPct}%`, tone: row.cacheHitPct >= 50 ? 'lime' : 'warn' },
        { l: 'Healthy range', v: `${CONFIG.ratio.lo} – ${CONFIG.ratio.hi}`, tone: 'lime' },
      ],
      barsTitle: null,
      bars: null,
      note: 'Agent sessions are input-heavy by nature — this view is for spotting an unusually wasteful day, not a standing alarm.',
      primary: 'See heaviest prompts →',
    },
  }
}

// ---------------------------------------------------------------------------
// DETECTOR 3 — reset-window timing (soft / opportunity)
// ---------------------------------------------------------------------------
function detectReset(provider, now) {
  const wk = weeklyWindow(provider)
  if (!wk) return null
  const used = pct(wk.usedPct)
  const resetAt = wk.resetAt || soonestResetAt(provider)
  if (!resetAt) return null
  const msLeft = resetAt - now
  if (msLeft <= 0 || msLeft > CONFIG.reset.withinMs) return null

  const expiring = 100 - used
  if (expiring <= CONFIG.reset.expiringPctOver) return null

  const monthly = Number(provider.monthly) || 0
  const weeklyCapValue = monthly / CONFIG.reset.weeksPerMonth
  const saving = (expiring / 100) * weeklyCapValue
  if (saving < CONFIG.reset.minSaving) return null

  return {
    id: `${provider.id}:reset`,
    kind: 'reset',
    provider: provider.id,
    providerName: providerName(provider),
    plan: planLabel(provider),
    severity: 'nudge', // reset is opportunity, never alert
    title: 'RESET-WINDOW TIMING',
    metric: `${expiring}%`,
    metricValue: expiring,
    metricUnit: 'CAP EXPIRING',
    signal: "Most of this week's paid cap will reset unused.",
    saving,
    savingNote: 'CAP VALUE',
    softSaving: true, // excluded from the headline recoverable total
    fix: `Front-load heavy jobs before the ${resetLabel(resetAt, now)} reset.`,
    source: 'reset window · weekly usage %',
    action: { type: 'providerLink', kind: 'dashboard' },
    meter: { type: 'reset', used },
    detail: {
      rows: [
        { l: 'Weekly cap used', v: `${used}%` },
        { l: 'Resets in', v: resetLabel(resetAt, now), tone: 'lime' },
        { l: 'Expiring unused', v: `${expiring}% · ≈${fmtUSD(saving)}`, tone: 'lime', strong: true },
      ],
      barsTitle: null,
      bars: null,
      note: 'This capacity is already paid for. Running heavy jobs before the reset converts it from waste into work.',
      primary: 'Set a pre-reset reminder →',
    },
  }
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------
const DETECTORS = [detectCache, detectRatio, detectReset]

// detectSignals(snapshot, { now }) → Signal[] sorted by saving desc.
function detectSignals(snapshot, opts = {}) {
  const now = opts.now || Date.now()
  const providers = Array.isArray(snapshot && snapshot.providers) ? snapshot.providers : []
  const signals = []
  for (const provider of providers) {
    if (provider.connected === false) continue
    for (const detector of DETECTORS) {
      let sig = null
      try {
        sig = detector(provider, now)
      } catch (_e) {
        sig = null // a single bad provider must never crash the panel
      }
      if (sig) signals.push(sig)
    }
  }
  signals.sort((a, b) => b.saving - a.saving)
  return signals
}

// buildOptimizeModel(snapshot) → everything the window needs in one object.
// Headline dedupe: the recoverable total counts only the single biggest-$
// non-soft signal PER PROVIDER (cache + ratio often blame the same fresh-input
// tokens). Every signal still renders; the smaller one is tagged
// countedInTotal:false so the UI can mark it secondary.
function buildOptimizeModel(snapshot, opts = {}) {
  const now = opts.now || Date.now()
  const signals = detectSignals(snapshot, { now })
  const alerts = signals.filter((s) => s.severity === 'alert').length

  // winner = highest-saving non-soft signal per provider
  const topByProvider = new Map()
  for (const s of signals) {
    if (s.softSaving) continue
    const cur = topByProvider.get(s.provider)
    if (!cur || s.saving > cur.saving) topByProvider.set(s.provider, s)
  }
  for (const s of signals) {
    s.countedInTotal = !s.softSaving && topByProvider.get(s.provider) === s
  }
  const recoverable = Array.from(topByProvider.values()).reduce(
    (acc, s) => acc + (Number(s.saving) || 0),
    0,
  )
  // Headroom = soft savings (flat-plan cache/ratio + reset cap value): quota you
  // could reclaim, not bill you'd cut. Shown separately, never in recoverable.
  const headroom = signals
    .filter((s) => s.softSaving)
    .reduce((acc, s) => acc + (Number(s.saving) || 0), 0)

  const providers = Array.from(new Set(signals.map((s) => s.provider))).map((id) => {
    const s = signals.find((x) => x.provider === id)
    return { id, name: s ? s.providerName : id, agentic: isAgentic(id) }
  })
  // agentic providers with token data but no auto-signal still offer drill-down
  const drillable = (Array.isArray(snapshot && snapshot.providers) ? snapshot.providers : [])
    .filter((p) => p.connected !== false && isAgentic(p.id) && tokenUsage(p) && dailyRatioSeries(p, { days: 1 }).length)
    .map((p) => ({ id: p.id, name: providerName(p) }))

  return {
    signals,
    providers,
    drillable, // agentic providers the UI can offer a "session check" on
    counts: { total: signals.length, alerts },
    recoverable,
    headroom,
    scannedAt: snapshot && snapshot.generatedAt ? snapshot.generatedAt : now,
  }
}

// Has a dismissed signal's metric moved materially enough to resurface it?
// Direction is kind-specific: cache is worse when hit% FALLS, reset is worse
// when expiring% RISES, ratio when it moves either way past a relative delta.
function signalMovedPastDelta(signal, record) {
  const prev = record && record.metricValue
  const cur = signal && signal.metricValue
  if (prev == null || cur == null) return false // can't compare → stay hidden
  switch (signal.kind) {
    case 'cache':
      return cur <= prev - CONFIG.retrigger.cacheDropPts
    case 'reset':
      return cur >= prev + CONFIG.retrigger.resetRisePts
    case 'ratio':
      return Math.abs(cur - prev) / (Math.abs(prev) || 1) > CONFIG.retrigger.ratioRelChange
    default:
      return false
  }
}

// Pure visibility decision for one signal given its persistence record.
// record = { snoozedUntil?: ms, dismissedAt?: ms, metricValue?: number }.
function isSignalHidden(signal, record, now) {
  if (!record) return false
  now = now || Date.now()
  if (record.snoozedUntil && now < record.snoozedUntil) return true // snoozed
  if (record.dismissedAt) return !signalMovedPastDelta(signal, record) // dismissed until it moves
  return false
}

const OPTIMIZE_API = {
  detectSignals,
  buildOptimizeModel,
  isSignalHidden,
  // agentic drill-down (opt-in, per-day)
  dailyRatioSeries,
  detectRatioDaily,
  isAgentic,
  // exposed for tests / tuning
  CONFIG,
  FAMILY_RATES,
  _detectors: { detectCache, detectRatio, detectReset },
  _fmt: { fmtUSD, fmtTokRaw, pct },
}

// Dual-mode: CommonJS for the CLI/main process, browser global for the burn
// renderer (loaded as a classic <script> — no bundler). Pure module, no deps.
if (typeof module !== 'undefined' && module.exports) module.exports = OPTIMIZE_API
if (typeof window !== 'undefined') window.OptimizeDetect = OPTIMIZE_API
