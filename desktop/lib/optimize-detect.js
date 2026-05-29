/* OPTIMIZE detection layer — turns the live snapshot we ALREADY collect into
   money-saving Signals. Pure CommonJS: no electron, no I/O. Same input as the
   Burn adapter (snapshot.providers[]) so it stays in lockstep with burn-adapt.js.

   Detectors that ride only on the snapshot we already collect:
     - cache   : cache-read vs fresh input  (tokenUsage.input / .cached)
     - ratio   : generation vs context in   (tokenUsage.output / input+cached)
     - reset   : paid weekly cap left to expire (windows[].usedPct + resetAt)
     - dormant : flat plan you pay for but haven't used (provider.lastUpdatedAt)

   Dormant is the first detector that yields HARD recoverable $ — a flat
   subscription sitting idle is the whole monthly bill, cancellable today. It
   rides on provider.lastUpdatedAt, which already carries the adapter's raw
   lastActive ms (aggregate.js: activityLastUpdatedAt). Adapters that can't
   report a real last-use time backfill it to "now" (aggregate.js:3425), so the
   worst case is a missed dormant flag — never a false "cancel this" on a plan
   that's actually in use.

   Plan right-sizing is still NOT here — it needs a tier-ladder map +
   weekly-peak aggregation. See optimize-handoff/DATA.md.

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
  dormant: {
    idleDays: 21, // no activity for 21+ days => dormant candidate (nudge)
    alertDays: 30, // 30+ days idle => a whole unused billing cycle (alert)
    minMonthly: 5, // ignore sub-$5 plans — not worth a cancel prompt
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

const DAY_MS = 86400000

// whole days between a past ms timestamp and `now` (null if missing/future)
function daysSince(ts, now) {
  const t = Number(ts)
  if (!Number.isFinite(t) || t <= 0) return null
  const d = (now - t) / DAY_MS
  return d >= 0 ? d : null
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
  const valueLabel = flat ? 'Room reclaimed' : 'Wasted on repeats'
  return {
    id: `${provider.id}:cache`,
    kind: 'cache',
    provider: provider.id,
    providerName: providerName(provider),
    plan: planLabel(provider),
    severity,
    title: 'PAYING TWICE FOR SAME TEXT',
    metric: `${hitPct}%`,
    metricValue: hitPct, // raw number for re-trigger comparison
    metricUnit: 'REUSED',
    signal: flat
      ? 'Plan allowance spent re-sending text that could be free.'
      : 'You keep re-sending the same text and paying each time.',
    saving,
    savingNote: flat ? 'ROOM LEFT' : '/MO',
    softSaving: flat, // flat-plan caching buys quota, not a smaller bill
    fix: 'Keep the start of your prompts identical so it gets reused free.',
    source: 'reused text · new text',
    action: { type: 'external', url: cacheDocFor(provider.id) },
    meter: { type: 'split', good: hitPct },
    detail: {
      rows: [
        { l: 'Text sent · 30d', v: `${fmtTokRaw(totalIn)} tok` },
        { l: 'Reused free', v: `${fmtTokRaw(cached)} · ${hitPct}%`, tone: 'lime' },
        { l: 'Paid again', v: `${fmtTokRaw(input)} · ${100 - hitPct}%`, tone: 'warn' },
        { l: valueLabel, v: `${fmtUSD(saving)} / mo`, tone: flat ? 'lime' : 'warn', strong: true },
      ],
      barsTitle: bars ? 'REUSED BY MODEL' : null,
      bars,
      note: flat
        ? 'On a flat plan this is room you get back, not a smaller bill — reusing text lets you do more before hitting your limit.'
        : null,
      primary: 'How to reuse text →',
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
  const valueLabel = flat ? 'Room reclaimed' : 'Worth cutting'

  return {
    id: `${provider.id}:ratio`,
    kind: 'ratio',
    provider: provider.id,
    providerName: providerName(provider),
    plan: planLabel(provider),
    severity,
    title: 'SENDING MORE THAN YOU GET BACK',
    metric: ratio < 0.1 ? ratio.toFixed(3) : ratio.toFixed(2),
    metricValue: ratio,
    metricUnit: 'REPLY ÷ SENT',
    signal: inputHeavy
      ? `You send ${mult ? mult + '×' : 'far'} more text than the AI writes back.`
      : 'The AI is writing far more than you send it.',
    saving,
    savingNote: flat ? 'ROOM LEFT' : '/MO',
    softSaving: flat, // flat-plan trimming buys quota, not a smaller bill
    fix: inputHeavy
      ? 'Send a short summary instead of the whole history.'
      : 'Set a reply length limit — something is over-generating.',
    source: 'text sent · text received',
    action: { type: 'providerLink', kind: 'dashboard' },
    meter: { type: 'ratio', value: clampNum(ratio, 0.001, 999), lo: CONFIG.ratio.lo, hi: CONFIG.ratio.hi },
    detail: {
      rows: [
        { l: 'Text sent · 30d', v: `${fmtTokRaw(totalIn)} tok` },
        { l: 'AI replies · 30d', v: `${fmtTokRaw(output)} tok` },
        { l: 'Good range', v: `${CONFIG.ratio.lo} – ${CONFIG.ratio.hi}`, tone: 'lime' },
        { l: valueLabel, v: `${fmtUSD(saving)} / mo`, tone: 'lime', strong: true },
      ],
      barsTitle: null,
      bars: null,
      note: inputHeavy
        ? 'You are paying to re-send text, not to get answers. Sending a short summary instead of the whole thread cuts the bill.'
        : 'The AI is writing far more than you send — check for runaway replies or a missing length limit.',
      primary: 'See biggest jobs →',
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
    title: 'HEAVY-DAY CHECK',
    metric: row.ratio < 0.1 ? row.ratio.toFixed(3) : row.ratio.toFixed(2),
    metricUnit: `REPLY ÷ SENT · ${dayKey}`,
    signal: inputHeavy
      ? `On ${dayKey} you sent ${mult ? mult + '×' : 'far'} more text than the AI wrote back.`
      : `The AI wrote far more than you sent on ${dayKey}.`,
    saving,
    savingNote: '/DAY',
    softSaving: true, // never counted in the headline recoverable total
    fix: 'Send a short summary to cut re-sent text on heavy days.',
    source: `daily text in/out · ${dayKey}`,
    meter: { type: 'ratio', value: clampNum(row.ratio, 0.001, 999), lo: CONFIG.ratio.lo, hi: CONFIG.ratio.hi },
    detail: {
      rows: [
        { l: 'Text sent', v: `${fmtTokRaw(row.totalIn)} tok` },
        { l: 'AI replies', v: `${fmtTokRaw(row.output)} tok` },
        { l: 'Reused', v: `${row.cacheHitPct}%`, tone: row.cacheHitPct >= 50 ? 'lime' : 'warn' },
        { l: 'Good range', v: `${CONFIG.ratio.lo} – ${CONFIG.ratio.hi}`, tone: 'lime' },
      ],
      barsTitle: null,
      bars: null,
      note: 'Coding agents send a lot of text by nature — this is for spotting one unusually wasteful day, not a constant alarm.',
      primary: 'See biggest jobs →',
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
    title: 'PAID CREDIT ABOUT TO EXPIRE',
    metric: `${expiring}%`,
    metricValue: expiring,
    metricUnit: 'GOING UNUSED',
    signal: "Most of what you paid for this week will vanish unused.",
    saving,
    savingNote: 'WORTH',
    softSaving: true, // excluded from the headline recoverable total
    fix: `Run big jobs before it resets in ${resetLabel(resetAt, now)}.`,
    source: 'reset time · weekly use %',
    action: { type: 'providerLink', kind: 'dashboard' },
    meter: { type: 'reset', used },
    detail: {
      rows: [
        { l: 'Used this week', v: `${used}%` },
        { l: 'Resets in', v: resetLabel(resetAt, now), tone: 'lime' },
        { l: 'Vanishing unused', v: `${expiring}% · ≈${fmtUSD(saving)}`, tone: 'lime', strong: true },
      ],
      barsTitle: null,
      bars: null,
      note: 'You already paid for this. Running big jobs before the reset turns it from waste into work.',
      primary: 'Remind me before reset →',
    },
  }
}

// ---------------------------------------------------------------------------
// DETECTOR 4 — dormant subscription (first HARD recoverable $)
// A flat plan (monthly > 0) with no activity for weeks is the whole bill going
// to waste — cancel/pause recovers it in full. Rides on provider.lastUpdatedAt
// (raw lastActive ms). Usage-based plans yield nothing here (no idle = no bill),
// so we only fire on flat subscriptions. Never fires on a plan used recently,
// and adapters that can't report a real last-use time look "active" → skipped.
// ---------------------------------------------------------------------------
function detectDormant(provider, now) {
  if (!isFlatPlan(provider)) return null // usage-based: idle already costs $0
  const monthly = Number(provider.monthly) || 0
  if (monthly < CONFIG.dormant.minMonthly) return null
  if (provider.activity === 'live') return null // used within ~2d — obviously active
  const idle = daysSince(provider.lastUpdatedAt, now)
  if (idle == null || idle < CONFIG.dormant.idleDays) return null

  const idleDays = Math.floor(idle)
  const saving = monthly // cancel/pause recovers the entire monthly bill
  const severity = idleDays >= CONFIG.dormant.alertDays ? 'alert' : 'nudge'
  const cycles = idleDays >= CONFIG.dormant.alertDays ? Math.floor(idleDays / 30) : 0

  return {
    id: `${provider.id}:dormant`,
    kind: 'dormant',
    provider: provider.id,
    providerName: providerName(provider),
    plan: planLabel(provider),
    severity,
    title: 'PAYING FOR SOMETHING UNUSED',
    metric: `${idleDays}d`,
    metricValue: idleDays,
    metricUnit: 'UNUSED',
    signal:
      cycles >= 1
        ? `Paid plan untouched ${idleDays} days — ${cycles} full month${cycles > 1 ? 's' : ''} wasted.`
        : `Paid plan untouched for ${idleDays} days.`,
    saving,
    savingNote: '/MO',
    softSaving: false, // real recoverable: cancelling cuts the bill in full
    fix: 'Cancel or pause this plan if you no longer use it.',
    source: 'last used · monthly cost',
    action: { type: 'providerLink', kind: 'dashboard' },
    meter: { type: 'dormant' },
    detail: {
      rows: [
        { l: 'Last used', v: `${idleDays}d ago`, tone: 'warn' },
        { l: 'Monthly cost', v: `${fmtUSD(monthly)} / mo` },
        { l: 'Could save', v: `${fmtUSD(saving)} / mo`, tone: 'lime', strong: true },
      ],
      barsTitle: null,
      bars: null,
      note: 'This plan has sat unused for weeks. If you no longer need it, cancelling or pausing takes the full monthly cost straight off your bill.',
      primary: 'Manage subscription →',
    },
  }
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------
const DETECTORS = [detectCache, detectRatio, detectReset, detectDormant]

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
  _detectors: { detectCache, detectRatio, detectReset, detectDormant },
  _fmt: { fmtUSD, fmtTokRaw, pct },
}

// Dual-mode: CommonJS for the CLI/main process, browser global for the burn
// renderer (loaded as a classic <script> — no bundler). Pure module, no deps.
if (typeof module !== 'undefined' && module.exports) module.exports = OPTIMIZE_API
if (typeof window !== 'undefined') window.OptimizeDetect = OPTIMIZE_API
