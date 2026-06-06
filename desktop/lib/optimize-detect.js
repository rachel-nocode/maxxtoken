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
  // Config bloat (#6): instruction files + MCP servers re-sent EVERY message.
  // Rides on provider.configScan (filled by lib/config-bloat.js in the main
  // process). Fires when the per-turn tax is meaningful OR the instruction file
  // is over the documented target OR several MCP servers are loaded.
  configBloat: {
    minTokensPerTurn: 6000, // below this the per-message tax isn't worth a card
    alertTokensPerTurn: 30000, // way over — only hard-alerts on usage-based plans
    instrLineTarget: 200, // Anthropic's CLAUDE.md guidance: keep under ~200 lines
    mcpNudge: 3, // 3+ loaded MCP servers is enough context fat to mention
    assumedMsgsPerMonth: 900, // ~30 msgs/day — conservative $ estimate basis only
  },
  // Over-powered settings (#7): a coding agent set to a high reasoning effort
  // by default thinks at max on every task. Reasoning bills as OUTPUT (the
  // priciest tokens) — ~3–5x routine cost for no quality gain on simple work.
  // Rides on provider.configScan.settings (Codex config.toml, via config-bloat).
  overdrive: {
    heavyEfforts: ['high', 'xhigh'], // only these defaults are "overdrive"
    trimmableShare: 0.4, // est. share of output reclaimable by right-sizing effort
  },
  // Pace alert (#8): at the current burn rate the weekly cap runs out BEFORE it
  // resets. Rides on window.pace (aggregate.js), which is computed from the
  // provider's API-reported usedPct — accurate, not per-machine. The mirror of
  // detectReset (under-using) → this is over-pacing toward the wall.
  pace: {
    projOver: 115, // projected ≥115% of cap at reset → on track to run out early
    alertProjOver: 140, // ≥140% → hard alert, you'll hit the wall well before reset
    minActualPct: 25, // ignore until the cap is meaningfully used (avoid early noise)
    weekDays: 7, // weekly window length, for the "locked out" estimate
    weeksPerMonth: 4.345,
  },
  saveMode: {
    reservePct: 40, // keep this much of a short window available for important work
    heavyUsedPct: 55,
    maxActions: 4,
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
  // Noisy command output (#9, recommend-only): coding agents run shell commands
  // (installs, git, test runners, builds) whose verbose output floods the
  // context window EVERY run. RTK (rtk-ai/rtk) is a local binary that compresses
  // that output 60–90% before it reaches the agent. We never install or modify
  // anything — the card only shows the user the one-line setup command for their
  // OWN agent and copies it on click. Fires once per supported agent that's
  // connected + has real token usage (so we don't nag on an idle integration).
  commandNoise: {
    agents: ['claude', 'codex', 'cursor'], // default-on set (RTK "full hook" + Codex rules)
    minInput: 1, // require at least 1 input token (real shell user, not a dormant connect)
  },
  snoozeDays: 30,
  retrigger: {
    cacheDropPts: 10, // cache hit % falls another 10pts → resurface
    resetRisePts: 10, // reset expiring % climbs another 10pts → resurface
    ratioRelChange: 0.25, // ratio moves ±25% → resurface
    bloatRiseTokens: 4000, // per-turn tax climbs another 4K tok → resurface
    paceRisePts: 10, // projected-over-cap climbs another 10pts → resurface
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

// "how to trim context" deep-link for the config-bloat card. Falls back to the
// Claude Code cost-management guide.
const BLOAT_DOCS = {
  claude: 'https://code.claude.com/docs/en/costs',
  anthropic: 'https://code.claude.com/docs/en/costs',
  codex: 'https://developers.openai.com/codex/guides/agents-md',
  openai: 'https://developers.openai.com/codex/guides/agents-md',
  chatgpt: 'https://developers.openai.com/codex/guides/agents-md',
  _default: 'https://code.claude.com/docs/en/costs',
}

function bloatDocFor(providerId) {
  return BLOAT_DOCS[providerId] || BLOAT_DOCS._default
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

function sessionWindow(provider) {
  const windows = Array.isArray(provider.windows) ? provider.windows : []
  return (
    windows.find((w) => w.kind === '5h') ||
    windows.find((w) => /5\s*[- ]?\s*hour|session/i.test(`${w.kind || ''} ${w.label || ''}`)) ||
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
    title: 'REUSE REPEATED TEXT',
    metric: `${hitPct}%`,
    metricValue: hitPct, // raw number for re-trigger comparison
    metricUnit: 'REUSED',
    signal: flat
      ? 'Repeated text is using your limit.'
      : 'Repeated text is costing extra.',
    saving,
    savingNote: flat ? 'ROOM LEFT' : '/MO',
    softSaving: flat, // flat-plan caching buys quota, not a smaller bill
    fix: 'Keep repeated instructions at the top.',
    source: 'reused text · new text',
    action: { type: 'external', url: cacheDocFor(provider.id) },
    meter: { type: 'split', good: hitPct },
    detail: {
      rows: [
        { l: 'Sent · 30d', v: `${fmtTokRaw(totalIn)} tok` },
        { l: 'Reused', v: `${fmtTokRaw(cached)} · ${hitPct}%`, tone: 'lime' },
        { l: 'Not reused', v: `${fmtTokRaw(input)} · ${100 - hitPct}%`, tone: 'warn' },
        { l: valueLabel, v: `${fmtUSD(saving)} / mo`, tone: flat ? 'lime' : 'warn', strong: true },
      ],
      barsTitle: bars ? 'REUSED BY MODEL' : null,
      bars,
      note: flat
        ? 'Reuse repeated text to keep more room in your limit.'
        : null,
      primary: 'Set up reuse →',
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
    title: 'SEND LESS CONTEXT',
    metric: ratio < 0.1 ? ratio.toFixed(3) : ratio.toFixed(2),
    metricValue: ratio,
    metricUnit: 'REPLY / SENT',
    signal: inputHeavy
      ? `You send ${mult ? mult + 'x' : 'far'} more than you get back.`
      : 'Replies are much longer than prompts.',
    saving,
    savingNote: flat ? 'ROOM LEFT' : '/MO',
    softSaving: flat, // flat-plan trimming buys quota, not a smaller bill
    fix: inputHeavy
      ? 'Send a short summary, not the whole thread.'
      : 'Set a shorter reply limit.',
    source: 'text sent · text received',
    action: { type: 'providerLink', kind: 'dashboard' },
    meter: { type: 'ratio', value: clampNum(ratio, 0.001, 999), lo: CONFIG.ratio.lo, hi: CONFIG.ratio.hi },
    detail: {
      rows: [
        { l: 'Sent · 30d', v: `${fmtTokRaw(totalIn)} tok` },
        { l: 'Replies · 30d', v: `${fmtTokRaw(output)} tok` },
        { l: 'Good range', v: `${CONFIG.ratio.lo} – ${CONFIG.ratio.hi}`, tone: 'lime' },
        { l: valueLabel, v: `${fmtUSD(saving)} / mo`, tone: 'lime', strong: true },
      ],
      barsTitle: null,
      bars: null,
      note: inputHeavy
        ? 'Short summaries usually cost less than long chat history.'
        : 'Shorter reply limits stop runaway output.',
      primary: 'Review usage →',
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
    title: 'HEAVY DAY',
    metric: row.ratio < 0.1 ? row.ratio.toFixed(3) : row.ratio.toFixed(2),
    metricUnit: `REPLY / SENT · ${dayKey}`,
    signal: inputHeavy
      ? `On ${dayKey}, you sent ${mult ? mult + 'x' : 'far'} more than you got back.`
      : `Replies were unusually long on ${dayKey}.`,
    saving,
    savingNote: '/DAY',
    softSaving: true, // never counted in the headline recoverable total
    fix: 'Use a short summary for days like this.',
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
      note: 'Use this to spot one unusually heavy day.',
      primary: 'Review usage →',
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
    title: 'USE IT BEFORE RESET',
    metric: `${expiring}%`,
    metricValue: expiring,
    metricUnit: 'UNUSED',
    signal: 'Most of this week will reset unused.',
    saving,
    savingNote: 'WORTH',
    softSaving: true, // excluded from the headline recoverable total
    fix: `Run big jobs before reset: ${resetLabel(resetAt, now)}.`,
    source: 'reset time · weekly use %',
    action: { type: 'providerLink', kind: 'dashboard' },
    meter: { type: 'reset', used },
    detail: {
      rows: [
        { l: 'Used this week', v: `${used}%` },
        { l: 'Resets in', v: resetLabel(resetAt, now), tone: 'lime' },
        { l: 'Unused', v: `${expiring}% · ≈${fmtUSD(saving)}`, tone: 'lime', strong: true },
      ],
      barsTitle: null,
      bars: null,
      note: 'Use this before it resets.',
      primary: 'Set reminder →',
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
    title: 'CANCEL UNUSED PLAN',
    metric: `${idleDays}d`,
    metricValue: idleDays,
    metricUnit: 'UNUSED',
    signal:
      cycles >= 1
        ? `Unused for ${idleDays} days.`
        : `Paid plan untouched for ${idleDays} days.`,
    saving,
    savingNote: '/MO',
    softSaving: false, // real recoverable: cancelling cuts the bill in full
    fix: 'Cancel or pause it if you no longer use it.',
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
      note: 'If you no longer need it, cancel or pause it.',
      primary: 'Manage plan →',
    },
  }
}

// ---------------------------------------------------------------------------
// DETECTOR 5 — config bloat (instruction files + MCP re-sent every message)
// Rides on provider.configScan (lib/config-bloat.js, main process). Pure here:
// no I/O, so it still runs in the renderer + CLI. On flat agent plans this is
// HEADROOM (more usage before the limit), never a hard bill — softSaving=true.
// ---------------------------------------------------------------------------
function detectConfigBloat(provider) {
  const scan = provider && provider.configScan
  if (!scan) return null
  const C = CONFIG.configBloat
  const perTurn = Number(scan.estTokensPerTurn) || 0
  const lines = Number(scan.instrLines) || 0
  const mcp = Number(scan.mcpServers) || 0

  const overLines = lines > C.instrLineTarget
  const manyMcp = mcp >= C.mcpNudge
  // Need at least one real reason: a meaningful per-turn tax, an oversized
  // instruction file, or several loaded MCP servers.
  if (perTurn < C.minTokensPerTurn && !overLines && !manyMcp) return null

  const flat = isFlatPlan(provider)
  // Flat subscription (Pro/Max $X/mo) → trimming buys quota, not a smaller bill.
  // Only usage-based billing turns this into a hard alert.
  const severity = !flat && perTurn >= C.alertTokensPerTurn ? 'alert' : 'nudge'

  const rates = ratesFor(provider.id)
  // The config prefix is cached after turn 1, so its marginal cost is the
  // cache-read rate, paid once per message. Value it over a conservative month.
  const saving = perTurn * C.assumedMsgsPerMonth * rates.cacheRead

  const instr = scan.instrFile || 'instructions'
  const reasons = []
  if (overLines) reasons.push(`${instr} is ${lines} lines (aim < ${C.instrLineTarget})`)
  if (manyMcp) reasons.push(`${mcp} MCP server${mcp === 1 ? '' : 's'} loaded`)
  const detailRows = []
  if (scan.instrFile) {
    detailRows.push({
      l: `${instr} size`,
      v: `${lines} lines · ${fmtTokRaw(scan.instrTokens)} tok`,
      tone: overLines ? 'warn' : 'text',
    })
  }
  if (mcp > 0) {
    detailRows.push({
      l: 'MCP servers',
      v: `${mcp} · ≈${fmtTokRaw(scan.mcpTokens)} tok`,
      tone: manyMcp ? 'warn' : 'text',
    })
  }
  detailRows.push({ l: 'Extra per message', v: `${fmtTokRaw(perTurn)} tok`, tone: 'warn', strong: true })
  detailRows.push({
    l: flat ? 'Room reclaimed' : 'Worth cutting',
    v: `≈${fmtUSD(saving)} / mo`,
    tone: 'lime',
    strong: true,
  })

  // meter fills toward a 40K "very bloated" ceiling so the bar reads at a glance.
  const meterPct = pct((perTurn / 40000) * 100)

  return {
    id: `${provider.id}:configBloat`,
    kind: 'configBloat',
    provider: provider.id,
    providerName: providerName(provider),
    plan: planLabel(provider),
    severity,
    title: 'TRIM PER-MESSAGE CONTEXT',
    metric: fmtTokRaw(perTurn),
    metricValue: perTurn,
    metricUnit: 'EXTRA / MSG',
    signal:
      reasons.length > 0
        ? `Every message includes ${reasons.join(' + ')}.`
        : `Every message includes ${fmtTokRaw(perTurn)} setup tokens.`,
    saving,
    savingNote: flat ? 'ROOM' : '/MO',
    softSaving: flat, // flat agent plan → headroom (more usage), not a bill cut
    fix:
      overLines && manyMcp
        ? `Shorten ${instr} and turn off idle MCP servers.`
        : overLines
          ? `Shorten ${instr}. Move details into skills.`
          : manyMcp
            ? 'Turn off MCP servers you are not using.'
            : 'Shorten setup files.',
    source: scan.instrFile ? `${scan.instrFile} + MCP config` : 'MCP config',
    action: { type: 'contextScan' },
    meter: { type: 'bloat', filled: meterPct },
    detail: {
      rows: detailRows,
      barsTitle: null,
      bars: null,
      note: flat
        ? 'Less setup context leaves more room for real work.'
        : 'Less setup context lowers each turn.',
      primary: 'Trim context →',
    },
  }
}

// ---------------------------------------------------------------------------
// DETECTOR 6 — overdrive (reasoning effort set too high by default)
// Codex exposes a default reasoning effort in config.toml; high/xhigh makes
// every task think at max. Reasoning bills as output, so this is the single
// biggest avoidable Codex drain. Pure: rides on the settings we already scanned.
// ---------------------------------------------------------------------------
const EFFORT_INTENSITY = { minimal: 0, low: 1, medium: 2, high: 3, xhigh: 4 }

function detectOverdrive(provider) {
  const scan = provider && provider.configScan
  const settings = scan && scan.settings
  if (!settings) return null
  const effort = String(settings.effort || '').toLowerCase()
  if (!CONFIG.overdrive.heavyEfforts.includes(effort)) return null

  const usage = tokenUsage(provider)
  const output = usage ? Number(usage.output) || 0 : 0
  const flat = isFlatPlan(provider)
  const rates = ratesFor(provider.id)
  // Reasoning bills as output; right-sizing effort reclaims a share of it.
  const saving = output * CONFIG.overdrive.trimmableShare * rates.output

  const planEffort = String(settings.planEffort || '').toLowerCase()
  const rows = [
    { l: 'Default effort', v: effort.toUpperCase(), tone: 'warn', strong: true },
  ]
  if (planEffort) rows.push({ l: 'Plan-mode effort', v: planEffort.toUpperCase(), tone: 'text' })
  if (settings.model) rows.push({ l: 'Model', v: settings.model, tone: 'text' })
  if (output > 0) rows.push({ l: 'AI replies · 30d', v: `${fmtTokRaw(output)} tok` })
  rows.push({
    l: flat ? 'Room reclaimed' : 'Worth cutting',
    v: `≈${fmtUSD(saving)} / mo`,
    tone: 'lime',
    strong: true,
  })

  return {
    id: `${provider.id}:overdrive`,
    kind: 'overdrive',
    provider: provider.id,
    providerName: providerName(provider),
    plan: planLabel(provider),
    severity: 'nudge', // a setting nudge, never a hard alert
    title: 'LOWER DEFAULT EFFORT',
    metric: effort.toUpperCase(),
    metricValue: EFFORT_INTENSITY[effort] != null ? EFFORT_INTENSITY[effort] : 3,
    metricUnit: 'EFFORT',
    signal: `Default effort is ${effort}. Most tasks need less.`,
    saving,
    savingNote: flat ? 'ROOM' : '/MO',
    softSaving: flat, // flat plan → headroom (more usage), not a smaller bill
    fix: `Use medium by default. Raise it only for hard jobs.`,
    source: 'config.toml effort setting',
    action: { type: 'external', url: 'https://developers.openai.com/codex/config-reference' },
    meter: { type: 'bloat', filled: effort === 'xhigh' ? 100 : 78 },
    detail: {
      rows,
      barsTitle: null,
      bars: null,
      note: flat
        ? 'High effort burns your limit faster. Use it only when needed.'
        : 'High effort costs more. Use it only when needed.',
      primary: 'Change effort →',
    },
  }
}

// ---------------------------------------------------------------------------
// DETECTOR 7 — pace alert (on track to run out before reset)
// The early warning $20-plan users beg for. Rides on the weekly window's pace,
// already projected in aggregate.js from API-reported usedPct (global, not
// per-machine). Fires only when the burn rate exhausts the cap BEFORE reset.
// ---------------------------------------------------------------------------
function detectPace(provider, now) {
  const wk = weeklyWindow(provider)
  const pace = (wk && wk.pace) || provider.pace || null
  if (!pace) return null
  if (pace.willLastToReset) return null // current rate lasts to reset — safe
  if (!pace.exhaustsAt) return null // no exhaustion projection available

  const C = CONFIG.pace
  const proj = Number(pace.projectedAtResetPercent) || 0
  const actual = Number(pace.actualUsedPercent) || 0
  if (proj < C.projOver) return null
  if (actual < C.minActualPct) return null // too little used to trust the slope

  const msLeft = pace.exhaustsAt - now
  if (msLeft <= 0) return null // already out — that's a different (post-hoc) state

  const resetAt = (wk && wk.resetAt) || soonestResetAt(provider)
  const daysEarly = resetAt ? Math.max(0, (resetAt - pace.exhaustsAt) / DAY_MS) : 0
  const overshoot = Math.max(0, Math.round(proj - 100))

  // On a flat plan the "value at risk" = the slice of the weekly cap you'll be
  // locked out of (days early / 7). Soft: it's lost capacity, not a bill.
  const monthly = Number(provider.monthly) || 0
  const weeklyCapValue = monthly / C.weeksPerMonth
  const saving = weeklyCapValue > 0 ? (Math.min(daysEarly, C.weekDays) / C.weekDays) * weeklyCapValue : 0

  const severity = proj >= C.alertProjOver ? 'alert' : 'nudge'
  const expected = Number(pace.expectedUsedPercent) || 0
  const daysEarlyLabel = daysEarly >= 1 ? `${Math.round(daysEarly)}d` : '<1d'

  return {
    id: `${provider.id}:pace`,
    kind: 'pace',
    provider: provider.id,
    providerName: providerName(provider),
    plan: planLabel(provider),
    severity,
    title: 'SLOW DOWN THIS WINDOW',
    metric: `+${overshoot}%`,
    metricValue: proj, // for re-trigger comparison
    metricUnit: 'OVER PACE',
    signal: `At this rate, you run out in ${resetLabel(pace.exhaustsAt, now)}.`,
    saving,
    savingNote: 'AT RISK',
    softSaving: true, // lost capacity / headroom, never a hard recoverable bill
    fix: 'Save heavy jobs for later or switch models.',
    source: 'weekly use % · time to reset',
    action: { type: 'providerLink', kind: 'dashboard' },
    meter: { type: 'pace', used: actual, expected },
    detail: {
      rows: [
        { l: 'Used so far', v: `${actual}%`, tone: 'warn', strong: true },
        { l: 'Normal by now', v: `${expected}%` },
        { l: 'Runs out in', v: resetLabel(pace.exhaustsAt, now), tone: 'warn', strong: true },
        { l: 'Resets in', v: resetLabel(resetAt, now), tone: 'lime' },
        ...(saving > 0
          ? [{ l: 'Locked out', v: `${daysEarlyLabel} · ≈${fmtUSD(saving)}`, tone: 'warn' }]
          : []),
      ],
      barsTitle: null,
      bars: null,
      note: 'Slow down now to avoid hitting the limit mid-task.',
      primary: 'Review usage →',
    },
  }
}

// ---------------------------------------------------------------------------
// DETECTOR 9 — noisy command output (RTK recommendation, RECOMMEND-ONLY)
// Verified install/wire commands from rtk-ai/rtk README (master branch) +
// docs/guide/getting-started/supported-agents.md. We copy the command to the
// clipboard; the user runs it themselves. maxxToken installs/edits NOTHING.
//   claude  → rtk init -g            (transparent Bash-tool rewrite; restart CC)
//   codex   → rtk init --global --codex   (rules file Codex follows)
//   cursor  → rtk init --global --agent cursor (transparent rewrite; restart)
// RTK README: "~80% reduction in token usage" over a 30-min session; tagline
// "reduce LLM token consumption by 60-90%". We show that range, labelled est.
// ---------------------------------------------------------------------------
const RTK_SETUP = {
  claude: { cmd: 'rtk init -g', note: 'Restart Claude Code after running it.' },
  codex: { cmd: 'rtk init --global --codex', note: 'Adds a rules file Codex follows.' },
  cursor: { cmd: 'rtk init --global --agent cursor', note: 'Restart Cursor after running it.' },
  gemini: { cmd: 'rtk init --global --gemini', note: 'Restart Gemini CLI after running it.' },
  copilot: { cmd: 'rtk init --global --copilot', note: 'Restart after running it.' },
  opencode: { cmd: 'rtk init --global --opencode', note: 'Restart after running it.' },
}

function detectCommandNoise(provider) {
  const C = CONFIG.commandNoise
  if (!C.agents.includes(provider.id)) return null
  const setup = RTK_SETUP[provider.id]
  if (!setup) return null
  // Only nudge agents the user actually drives — needs real input volume.
  const usage = tokenUsage(provider)
  const totalIn = usage ? (Number(usage.input) || 0) + (Number(usage.cached) || 0) : 0
  if (totalIn < C.minInput) return null

  const install = `# 1. install RTK (once)\nbrew install rtk\n# or: curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh\n\n# 2. wire it into ${providerName(provider)}\n${setup.cmd}`

  return {
    id: `${provider.id}:commandNoise`,
    kind: 'commandNoise',
    provider: provider.id,
    providerName: providerName(provider),
    plan: planLabel(provider),
    severity: 'nudge',
    title: 'SHRINK NOISY COMMAND OUTPUT',
    metric: '60–90%',
    metricValue: 0, // static recommendation — no metric to re-trigger on
    metricUnit: 'LESS NOISE',
    signal: `Installs, git, tests and builds dump long output into context every run.`,
    saving: 0, // recommend-only: token saver, not a $ figure we can claim
    savingNote: 'EST.',
    softSaving: true, // never counts toward recoverable / headroom $
    noDollar: true, // UI: hide the $ column, this is a token/context win
    fix: 'Run RTK to compress that output before the agent reads it.',
    source: 'rtk-ai/rtk (you run it — nothing is changed for you)',
    action: { type: 'copyCmd', text: `${setup.cmd}\n`, full: install },
    meter: { type: 'split', good: 75 }, // lime = noise removed
    detail: {
      rows: [
        { l: 'Tool', v: 'RTK (local binary)', tone: 'text' },
        { l: 'Cuts command output', v: '60–90%', tone: 'lime', strong: true },
        { l: 'Setup command', v: setup.cmd, tone: 'text' },
        { l: 'After', v: setup.note, tone: 'text' },
      ],
      barsTitle: null,
      bars: null,
      note: 'maxxToken changes nothing. Copy the command and run it yourself; RTK trims verbose output (errors and summaries stay). Remove anytime with brew uninstall rtk.',
      primary: 'Copy setup command',
    },
  }
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------
const DETECTORS = [detectCache, detectRatio, detectReset, detectDormant, detectConfigBloat, detectOverdrive, detectPace, detectCommandNoise]

function saveModeAction(kind, title, detail, provider, priority) {
  return {
    kind,
    title,
    detail,
    provider: provider ? provider.id : null,
    providerName: provider ? providerName(provider) : null,
    priority,
  }
}

function buildSaveMode(snapshot, signals, opts = {}) {
  const enabled = opts.saveModeEnabled === true
  const reservePct = CONFIG.saveMode.reservePct
  const actions = []
  if (!enabled) return { enabled: false, reservePct, actions }

  const providers = Array.isArray(snapshot && snapshot.providers) ? snapshot.providers : []
  const byId = new Map(providers.map((p) => [p.id, p]))
  const sessionCandidates = providers
    .map((p) => {
      const w = sessionWindow(p)
      if (!w) return null
      const used = pct(w.usedPct)
      const free = Math.max(0, 100 - used)
      return { provider: p, window: w, used, free }
    })
    .filter(Boolean)
    .sort((a, b) => a.free - b.free)

  const tight = sessionCandidates.find((item) => item.free < reservePct) ||
    sessionCandidates.find((item) => item.used >= CONFIG.saveMode.heavyUsedPct)
  if (tight) {
    const reset = resetLabel(tight.window.resetAt || soonestResetAt(tight.provider), opts.now || Date.now())
    actions.push(saveModeAction(
      'window-guard',
      `Protect ${providerName(tight.provider)} reserve`,
      `${tight.free}% free. Hold heavy jobs until ${reset}.`,
      tight.provider,
      100,
    ))
  }

  const bloat = signals.find((s) => s.kind === 'configBloat')
  if (bloat) {
    actions.push(saveModeAction(
      'context-bloat',
      'Trim per-message context',
      `${bloat.metric} extra each message. ${bloat.fix}`,
      byId.get(bloat.provider),
      90,
    ))
  }

  const cache = signals.find((s) => s.kind === 'cache')
  if (cache) {
    actions.push(saveModeAction(
      'cache-prefix',
      'Reuse prompt text',
      `${cache.metric} reused. Keep repeated instructions at the top.`,
      byId.get(cache.provider),
      80,
    ))
  }

  const overdrive = signals.find((s) => s.kind === 'overdrive')
  if (overdrive) {
    actions.push(saveModeAction(
      'right-size-effort',
      'Lower default effort',
      `${overdrive.metric} is the default. Use high effort only for hard tasks.`,
      byId.get(overdrive.provider),
      70,
    ))
  }

  const roomier = sessionCandidates
    .filter((item) => item.free >= reservePct)
    .sort((a, b) => b.free - a.free)[0]
  if (tight && roomier && roomier.provider.id !== tight.provider.id) {
    actions.push(saveModeAction(
      'route-provider',
      `Route light work to ${providerName(roomier.provider)}`,
      `${roomier.free}% free. Use it for research, copy, or review.`,
      roomier.provider,
      60,
    ))
  }

  actions.sort((a, b) => b.priority - a.priority)
  return {
    enabled: true,
    reservePct,
    actions: actions.slice(0, CONFIG.saveMode.maxActions),
  }
}

// Tool recommendations (e.g. RTK command-noise) fire once PER agent, but they
// recommend the SAME tool — so we collapse the per-agent signals into one
// cross-agent card that's tagged with every eligible agent and carries each
// agent's own copyable setup command. Keyed by kind so future tool detectors
// can opt in the same way.
function mergeToolSignals(signals) {
  const noise = signals.filter((s) => s.kind === 'commandNoise')
  if (noise.length < 2) return signals // 0 or 1 → nothing to merge

  const agents = noise.map((s) => ({
    id: s.provider,
    name: s.providerName,
    cmd: (s.action && s.action.text ? String(s.action.text) : '').trim(),
    note: (s.detail && Array.isArray(s.detail.rows)
      ? (s.detail.rows.find((r) => r.l === 'After') || {}).v
      : '') || '',
  }))
  const base = noise[0]
  const install = 'brew install rtk'
  const block = ['# 1. install RTK once', install, '', '# 2. wire your agent:']
  for (const a of agents) block.push(`# ${a.name}`, a.cmd)

  const merged = {
    ...base,
    id: 'tools:commandNoise',
    provider: base.provider, // first agent → header glyph + a filter match
    providers: agents.map((a) => a.id), // every agent → shows under each filter chip
    providerName: agents.map((a) => a.name).join(' + '),
    agents, // rendered as a per-agent copy list in the expanded card
    action: { type: 'copyCmd', text: `${install}\n`, full: block.join('\n') },
    detail: {
      ...base.detail,
      rows: [
        { l: 'Tool', v: 'RTK (local binary)', tone: 'text' },
        { l: 'Cuts command output', v: '60–90%', tone: 'lime', strong: true },
        { l: 'Install once', v: install, tone: 'text' },
      ],
      primary: 'Copy install command',
    },
  }
  const rest = signals.filter((s) => s.kind !== 'commandNoise')
  rest.push(merged)
  return rest
}

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
  const merged = mergeToolSignals(signals)
  merged.sort((a, b) => b.saving - a.saving)
  return merged
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
    saveMode: buildSaveMode(snapshot, signals, { ...opts, now }),
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
    case 'configBloat':
      return cur >= prev + CONFIG.retrigger.bloatRiseTokens
    case 'overdrive':
      return cur > prev // effort bumped even higher → resurface
    case 'pace':
      return cur >= prev + CONFIG.retrigger.paceRisePts
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
  buildSaveMode,
  isAgentic,
  // exposed for tests / tuning
  CONFIG,
  FAMILY_RATES,
  _detectors: { detectCache, detectRatio, detectReset, detectDormant, detectConfigBloat, detectOverdrive, detectPace, detectCommandNoise },
  _fmt: { fmtUSD, fmtTokRaw, pct },
}

// Dual-mode: CommonJS for the CLI/main process, browser global for the burn
// renderer (loaded as a classic <script> — no bundler). Pure module, no deps.
if (typeof module !== 'undefined' && module.exports) module.exports = OPTIMIZE_API
if (typeof window !== 'undefined') window.OptimizeDetect = OPTIMIZE_API
