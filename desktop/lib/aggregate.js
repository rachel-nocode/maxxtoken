const { loadConfig, billingCycle } = require('./config')
const codex = require('./adapters/codex')
const openai = require('./adapters/openai-api')
const azureopenai = require('./adapters/azure-openai')
const claude = require('./adapters/claude')
const cursor = require('./adapters/cursor')
const copilot = require('./adapters/copilot')
const windsurf = require('./adapters/windsurf')
const kiro = require('./adapters/kiro')
const opencode = require('./adapters/opencode')
const opencodego = require('./adapters/opencode-go')
const alibaba = require('./adapters/alibaba')
const alibabaTokenPlan = require('./adapters/alibaba-token-plan')
const augment = require('./adapters/augment')
const jetbrains = require('./adapters/jetbrains')
const warp = require('./adapters/warp')
const elevenlabs = require('./adapters/elevenlabs')
const kilo = require('./adapters/kilo')
const kimi = require('./adapters/kimi')
const moonshot = require('./adapters/moonshot')
const kimik2 = require('./adapters/kimi-k2')
const doubao = require('./adapters/doubao')
const gemini = require('./adapters/gemini')
const grok = require('./adapters/grok')
const groq = require('./adapters/groq')
const openrouter = require('./adapters/openrouter')
const perplexity = require('./adapters/perplexity')
const mistral = require('./adapters/mistral')
const codebuff = require('./adapters/codebuff')
const commandcode = require('./adapters/commandcode')
const crof = require('./adapters/crof')
const venice = require('./adapters/venice')
const deepseek = require('./adapters/deepseek')
const deepgram = require('./adapters/deepgram')
const stepfun = require('./adapters/stepfun')
const llmproxy = require('./adapters/llmproxy')
const ollama = require('./adapters/ollama')
const abacus = require('./adapters/abacus')
const amp = require('./adapters/amp')
const factory = require('./adapters/factory')
const antigravity = require('./adapters/antigravity')
const minimax = require('./adapters/minimax')
const manus = require('./adapters/manus')
const vertexai = require('./adapters/vertexai')
const synthetic = require('./adapters/synthetic')
const mimo = require('./adapters/mimo')
const bedrock = require('./adapters/bedrock')
const zai = require('./adapters/zai')
const t3chat = require('./adapters/t3chat')
const usageHistory = require('./usage-history')
const storageFootprint = require('./storage-footprint')
const providerStatus = require('./provider-status')
const providerLinks = require('./provider-links')
const tokenCost = require('./token-cost')
const logger = require('./logger')
const widgetSnapshot = require('./widget-snapshot')

const PROVIDER_TIMEOUT_MS = 30000
const STATUS_TIMEOUT_MS = 8000
const STALE_PROVIDER_FALLBACK_MS = 6 * 60 * 60 * 1000
const PROVIDER_BUILD_PRIORITY = {
  cursor: 0,
  kimi: 0,
  grok: 0,
  claude: 0,
}

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function buildProviderSafe(id, conf, cycle, config) {
  const start = Date.now()
  try {
    const result = await withTimeout(buildProvider(id, conf, cycle, config), PROVIDER_TIMEOUT_MS, `provider:${id}`)
    const ms = Date.now() - start
    if (ms >= 3000) logger.warn('provider', `${id} slow`, { ms })
    else logger.info('provider', `${id} ok`, { ms })
    return result
  } catch (err) {
    const ms = Date.now() - start
    logger.error('provider', `${id} failed`, { ms, error: err && err.message ? err.message : String(err) })
    return {
      id,
      name: conf.name,
      plan: conf.plan,
      monthly: conf.monthly,
      links: providerLinks.linksForProvider(id),
      connected: false,
      activity: 'none',
      error: err && err.message ? err.message : String(err),
    }
  }
}

const DAY = 86400000
const PACE_MIN_EXPECTED_PCT = 3

function activityState(lastActive) {
  if (!lastActive) return 'none'
  return Date.now() - lastActive < 2 * DAY ? 'live' : 'stale'
}

function activityLastUpdatedAt(lastActive) {
  const ts = Number(lastActive)
  return Number.isFinite(ts) && ts > 0 ? ts : null
}

// A window is "leaking" when it resets soon but is barely used —
// that unused capacity is about to be burned.
function windowUrgent(w) {
  if (!w.resetAt) return false
  const left = w.resetAt - Date.now()
  if (w.kind === '5h') return left < 90 * 60000 && w.usedPct < 50
  return left < 2 * DAY && w.usedPct < 60
}

function nudgeFor(id, capturedPct, urgent) {
  const banks = {
    claude: [
      'Have Claude scope one half-baked app idea into a build plan.',
      'Ask Claude to roast your landing page positioning.',
      'Turn a messy voice note into a launch post.',
    ],
    codex: [
      'Ask Codex to write 3 tests before reset.',
      'Have Codex close one annoying TODO and write the PR notes.',
      'Refactor the ugly helper you keep pretending is fine.',
    ],
    openai: [
      'Run one gnarly prompt through the API and turn the output into a reusable tool.',
      'Use OpenAI API spend on an eval for your best prompt.',
      'Batch-generate variants for the launch asset you keep hand-writing.',
    ],
    azureopenai: [
      'Point Azure OpenAI at one deployment sanity check before it fades into dashboard noise.',
      'Use your Azure deployment on a small eval against your main coding prompt.',
      'Burn idle Azure OpenAI capacity on a model comparison with real project context.',
    ],
    cursor: [
      'Open Cursor on the messiest local project and let Composer cut one sharp path.',
      'Use Cursor to chase one UI papercut from screenshot to diff.',
      'Have Cursor explain the file you keep avoiding, then make the first edit.',
    ],
    copilot: [
      'Spend Copilot premium requests on the one refactor that needs IDE context.',
      'Ask Copilot Chat to turn a TODO cluster into a tiny implementation plan.',
      'Use Copilot to write tests inside the editor while the project is warm.',
    ],
    windsurf: [
      'Open Windsurf and spend the daily pool on one local build loop.',
      'Use Windsurf Cascade to wire the roughest integration before reset.',
      'Let Windsurf explain the code path, then make the smallest shippable edit.',
    ],
    kiro: [
      'Spend Kiro credits on one spec-to-code loop before reset.',
      'Ask Kiro to turn a rough feature into implementation tasks.',
      'Use Kiro to wire one small agentic IDE workflow.',
    ],
    opencode: [
      'Use OpenCode’s 5-hour window on the project that needs a second coding agent.',
      'Have OpenCode turn one messy issue into a diff while Codex handles tests.',
      'Spend the weekly OpenCode pool on a model bake-off against your main agent.',
    ],
    opencodego: [
      'Use OpenCode Go’s short window on a fast parallel coding pass.',
      'Spend the monthly OpenCode Go pool on the weird build you keep postponing.',
      'Pair OpenCode Go against Codex and keep the sharper diff.',
    ],
    alibaba: [
      'Spend Alibaba Coding Plan quota on one tight agent pass before the short window rolls.',
      'Use Bailian/Qwen coding quota on a focused implementation before it turns invisible.',
      'Run Alibaba Coding Plan against your sharpest prompt and compare the token burn.',
    ],
    alibabatokenplan: [
      'Spend Alibaba Token Plan credits on one compact model pass before the month rolls.',
      'Use Bailian Token Plan quota on a focused eval while the balance is visible.',
      'Run Alibaba Token Plan against your sharpest prompt and compare the token burn.',
    ],
    augment: [
      'Use Augment credits on one IDE-native refactor before the cycle rolls.',
      'Let Augment map a thorny code path, then spend the credits on the edit.',
      'Point Augment at the project with the most stale context and make it useful.',
    ],
    jetbrains: [
      'Spend JetBrains AI credits inside the IDE while the project context is already loaded.',
      'Ask JetBrains AI to explain one gnarly class, then make the smallest safe edit.',
      'Use the refill window to burn down one IDE-native refactor.',
    ],
    warp: [
      'Use Warp AI credits to turn one terminal chore into a reusable command.',
      'Ask Warp to explain the failing command, then spend credits on the fix.',
      'Burn add-on credits on the shell workflow you keep doing by hand.',
    ],
    elevenlabs: [
      'Spend ElevenLabs characters on one reusable voice asset.',
      'Use voice slots to prototype the narrator you keep describing.',
      'Burn character credits on a clean audio draft before reset.',
    ],
    kilo: [
      'Spend Kilo credits on one agentic coding pass before the balance sits idle.',
      'Use Kilo Pass on a contained refactor with a clear end state.',
      'Let Kilo handle one parallel implementation while Codex reviews it.',
    ],
    gemini: [
      'Use Gemini to research a competitor for 15 min.',
      'Have Gemini draft a thread from your last build.',
      'Ask Gemini to summarize a long doc you have been avoiding.',
    ],
    kimi: [
      'Point Kimi at a gnarly bug and let it grind.',
      'Have Kimi port a script to another language.',
      'Use Kimi to write docs for an undocumented module.',
    ],
    moonshot: [
      'Spend Moonshot/Kimi API balance on a model bake-off.',
      'Use Moonshot credits to run a long-context Kimi pass.',
      'Turn idle Moonshot balance into one sharp eval today.',
    ],
    kimik2: [
      'Use legacy Kimi K2 credits before they sit stale.',
      'Run Kimi K2 against one gnarly prompt and compare the answer.',
      'Spend Kimi K2 balance on a compact coding-agent pass.',
    ],
    doubao: [
      'Spend Doubao request quota on one fast coding probe.',
      'Use Doubao Ark on a small agent pass before the request window rolls.',
      'Run one Doubao model bake-off against your usual coding prompt.',
    ],
    grok: [
      'Have Grok turn your half-baked idea into a full build plan.',
      'Ask Grok to review the last diff and suggest the next refactor.',
      'Let Grok drive a feature while you steer with high-level prompts.',
    ],
    groq: [
      'Use Groq on the prompt that needs raw speed more than ceremony.',
      'Run a fast Groq pass over one messy draft and keep the sharpest parts.',
      'Spend idle Groq throughput on a quick model comparison before context cools.',
    ],
    chatgpt: ['Brainstorm 5 product experiments for this week.'],
    openrouter: [
      'Pipe OpenRouter through a model bake-off — same prompt, three models, pick a winner.',
      'Have OpenRouter generate 10 product hooks against your last landing page.',
    ],
    perplexity: [
      'Spend Perplexity credits on deep research before the monthly pool refills.',
      'Use Perplexity to build a sourced competitive brief for one feature.',
      'Burn bonus credits on the question you keep half-answering from memory.',
    ],
    mistral: [
      'Spend Mistral API budget on one fast structured-output pass.',
      'Use Mistral on the prompt where cost discipline matters.',
      'Run your current coding prompt through Mistral and compare token burn.',
    ],
    codebuff: [
      'Use Codebuff credits on one focused coding pass before the weekly pool rolls.',
      'Have Codebuff take a parallel swing at the refactor Codex just scoped.',
      'Spend the weekly Codebuff limit on the bug that needs a fresh agent brain.',
    ],
    commandcode: [
      'Spend Command Code credits on one focused agent pass.',
      'Use Command Code before the monthly credits turn into dashboard dust.',
      'Run a compact Command Code pass against your sharpest prompt.',
    ],
    crof: [
      'Use Crof requests before the daily Central-time reset.',
      'Spend Crof credits on one compact agent pass today.',
      'Run Crof against a small bug while another agent handles tests.',
    ],
    venice: [
      'Use Venice API balance on a model experiment before it sits idle.',
      'Spend Venice DIEM on a side-by-side prompt bake-off.',
      'Run one Venice-backed agent pass on a contained task.',
    ],
    deepseek: [
      'Let DeepSeek crunch a long doc into one-page rules for an agent.',
      'Use DeepSeek Reasoner to draft a math/proof-style spec for a tricky feature.',
    ],
    deepgram: [
      'Spend Deepgram usage on one voice workflow you can reuse.',
      'Run a quick transcription or TTS pass and turn it into a content asset.',
      'Use Deepgram token/audio usage on the audio task you keep punting.',
    ],
    stepfun: [
      'Use StepFun before the 5-hour window rolls.',
      'Spend the weekly StepFun pool on one compact coding pass.',
      'Run StepFun against a small prompt while the reset clock is friendly.',
    ],
    llmproxy: [
      'Route one agent pass through LLM Proxy and see which upstream key takes the hit.',
      'Use LLM Proxy before a low remaining quota group becomes the bottleneck.',
      'Compare the proxy’s top providers and move one prompt to the least-burned route.',
    ],
    ollama: [
      'Use Ollama Cloud on one compact local-plus-cloud comparison.',
      'Spend the Ollama session window on the prompt that needs privacy and speed.',
      'Check Ollama weekly usage, then burn a small model pass before it resets.',
    ],
    abacus: [
      'Spend Abacus credits on one focused ChatLLM run before the billing cycle rolls.',
      'Use Abacus AI credits on a contained agent pass while the reset clock is visible.',
      'Turn idle Abacus credits into one practical model comparison today.',
    ],
    amp: [
      'Have Amp ship a refactor with full code review on it.',
      'Spin up an Amp thread to scope your next moonshot end-to-end.',
    ],
    factory: [
      'Spend Droid’s 5-hour window on one tight agent pass before it rolls.',
      'Use Factory/Droid weekly quota on the build loop you keep postponing.',
      'Put Droid on a compact coding prompt and compare the token burn.',
    ],
    antigravity: [
      'Use Antigravity’s lowest remaining model window on a focused coding pass.',
      'Spend Gemini Pro or Claude quota in Antigravity before the reset sneaks up.',
      'Compare Antigravity’s Claude and Gemini pools on the same implementation prompt.',
    ],
    minimax: [
      'Use MiniMax Coding Plan prompts before the short window rolls.',
      'Spend MiniMax Text Generation quota on one compact agent pass.',
      'Run MiniMax against a focused coding prompt and compare the token burn.',
    ],
    manus: [
      'Spend Manus monthly credits on one contained build or research pass.',
      'Use the Manus daily refresh pool before it rolls over.',
      'Run Manus on the workflow that needs a browser-native agent pass.',
    ],
    vertexai: [
      'Spend Vertex Claude tokens on one serious local coding pass.',
      'Use Vertex AI quota before the Google Cloud budget quietly coasts.',
      'Run your Vertex Claude alias on a contained prompt and compare the token burn.',
    ],
    synthetic: [
      'Spend Synthetic’s rolling window on one focused agent pass.',
      'Use Synthetic weekly token regen before it quietly tops out.',
      'Run Synthetic on a browser-native workflow and compare the quota burn.',
    ],
    mimo: [
      'Spend MiMo token-plan credits before the monthly window rolls.',
      'Use Xiaomi MiMo on one compact coding or eval pass while the balance is visible.',
      'Run MiMo against a focused prompt and compare the credit burn.',
    ],
    bedrock: [
      'Check Bedrock spend before AWS billing turns invisible.',
      'Use Bedrock on one focused eval while the monthly budget is visible.',
      'Compare Bedrock cost against your local Claude/Codex token burn.',
    ],
    zai: [
      'Spend z.ai tokens on one contained agent pass before the short window rolls.',
      'Use z.ai MCP quota on the research task you keep doing by hand.',
      'Run z.ai against a compact coding prompt and compare the token burn.',
    ],
    t3chat: [
      'Spend T3 Chat’s short window on one focused prompt before it resets.',
      'Use T3 Chat on a compact model comparison while the monthly pool is visible.',
      'Turn idle T3 Chat usage into one useful answer before the window rolls.',
    ],
  }
  const bank = banks[id] || ['Use it on something you ship today.']
  let pick = bank[0]
  if (capturedPct != null && capturedPct < 40) pick = bank[bank.length - 1]
  return urgent ? pick + ' A window resets soon.' : pick
}

function moneyNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function percent(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, Math.round(n)))
}

function clamp(value, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(min, Math.min(max, n))
}

function periodMsForWindow(w) {
  const explicit = Number(w?.periodMs)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  const minutes = Number(w?.windowMinutes)
  if (Number.isFinite(minutes) && minutes > 0) return minutes * 60000
  if (w?.kind === '5h') return 5 * 3600e3
  if (w?.kind === '7d') return 7 * DAY
  if (w?.kind === 'daily' || w?.kind === '1d') return DAY
  return null
}

function paceStage(delta) {
  const abs = Math.abs(delta)
  if (abs <= 2) return 'on-track'
  if (abs <= 6) return delta >= 0 ? 'slightly-deficit' : 'slightly-reserve'
  if (abs <= 12) return delta >= 0 ? 'deficit' : 'reserve'
  return delta >= 0 ? 'far-deficit' : 'far-reserve'
}

function paceLeftLabel(stage, delta) {
  const value = Math.round(Math.abs(delta))
  if (stage === 'on-track') return 'On pace'
  if (stage.endsWith('deficit')) return `${value}% in deficit`
  return `${value}% in reserve`
}

function paceTone(stage) {
  if (stage === 'on-track') return 'neutral'
  return stage.endsWith('deficit') ? 'deficit' : 'reserve'
}

function paceForWindow(w, now = Date.now()) {
  const resetAt = Number(w?.resetAt)
  const periodMs = periodMsForWindow(w)
  const actual = clamp(w?.usedPct, 0, 100)
  if (!Number.isFinite(resetAt) || !periodMs || actual == null) return null

  const timeUntilReset = resetAt - now
  if (timeUntilReset <= 0 || timeUntilReset > periodMs) return null

  const elapsed = Math.max(0, Math.min(periodMs, periodMs - timeUntilReset))
  const expected = Math.max(0, Math.min(100, (elapsed / periodMs) * 100))
  if (elapsed === 0 && actual > 0) return null
  if (expected < PACE_MIN_EXPECTED_PCT) return null

  const delta = actual - expected
  const stage = paceStage(delta)
  let etaMs = null
  let exhaustsAt = null
  let willLastToReset = false

  if (elapsed > 0 && actual > 0) {
    const rate = actual / elapsed
    const remaining = Math.max(0, 100 - actual)
    const candidate = remaining / rate
    if (candidate >= timeUntilReset) willLastToReset = true
    else {
      etaMs = Math.max(0, Math.round(candidate))
      exhaustsAt = now + etaMs
    }
  } else if (elapsed > 0 && actual === 0) {
    willLastToReset = true
  }

  // Projection at reset = current burn rate extrapolated to full window.
  // rate per period% = actual / expected; at 100% elapsed → actual * 100 / expected.
  let projectedAtResetPercent = null
  if (expected > 0) {
    projectedAtResetPercent = Math.round(Math.min(999, (actual * 100) / expected))
  }

  return {
    stage,
    tone: paceTone(stage),
    deltaPercent: Math.round(delta),
    expectedUsedPercent: Math.round(expected),
    actualUsedPercent: Math.round(actual),
    projectedAtResetPercent,
    etaMs,
    exhaustsAt,
    willLastToReset,
    leftLabel: paceLeftLabel(stage, delta),
  }
}

function addProviderPace(provider, now = Date.now()) {
  if (!provider?.connected || !Array.isArray(provider.windows) || !provider.windows.length) return provider
  const windows = provider.windows.map((w) => {
    const pace = paceForWindow(w, now)
    return pace ? { ...w, pace } : w
  })
  const primary = windows.find((w) => w.kind === '7d' && w.pace)?.pace || windows.find((w) => w.pace)?.pace || null
  return primary ? { ...provider, windows, pace: primary } : { ...provider, windows }
}

let storageFootprintsCache = {}
let storageScanInFlight = false

function addProviderStorageFootprints(providers, nowForTesting = null) {
  // Use cached footprints only — never block snapshot on disk walks.
  // Kick a background scan if cache is stale; next snapshot will see it.
  const ids = (providers || []).map((p) => p.id)
  const missing = ids.some((id) => !storageFootprintsCache[id])
  if (missing && arguments.length > 1) {
    storageFootprintsCache = storageFootprint.scanProviders(ids, process.env, Number(nowForTesting) || Date.now())
  } else if (missing && !storageScanInFlight) {
    storageScanInFlight = true
    setImmediate(() => {
      try {
        storageFootprintsCache = storageFootprint.scanProviders(ids, process.env, Date.now())
        logger.info('storage', 'scan done', { providers: ids.length })
      } catch (err) {
        logger.error('storage', 'scan failed', { error: err && err.message })
      } finally {
        storageScanInFlight = false
      }
    })
  }
  return (providers || []).map((provider) => {
    const footprint = storageFootprintsCache[provider.id]
    if (!footprint) return provider
    const extra = provider.extra ? [...provider.extra] : []
    if (footprint.hasLocalData) {
      extra.push({ label: 'Local data', value: byteCount(footprint.totalBytes) })
    }
    return { ...provider, storageFootprint: footprint, extra }
  })
}

async function addProviderStatuses(providers, now = Date.now()) {
  const statuses = await providerStatus.statusesForProviders((providers || []).map((p) => p.id), undefined, now)
  return (providers || []).map((provider) => {
    const status = statuses[provider.id]
    if (!status) return provider
    const extra = provider.extra ? [...provider.extra] : []
    if (status.indicator !== 'none') extra.push({ label: 'Provider status', value: status.label })
    return { ...provider, status, extra }
  })
}

function soonestResetAt(provider, now = Date.now()) {
  const resets = (provider.windows || [])
    .map((w) => Number(w.resetAt))
    .filter((n) => Number.isFinite(n) && n > now)
  const ownReset = Number(provider.resetAt)
  if (Number.isFinite(ownReset) && ownReset > now) resets.push(ownReset)
  return resets.length ? Math.min(...resets) : null
}

function maxxTargetFromProviders(providers, now = Date.now()) {
  const candidates = []
  for (const provider of providers || []) {
    if (!provider?.connected || provider.capturedPct == null) continue
    if (provider.status && ['major', 'critical'].includes(provider.status.indicator)) continue
    const usedPct = clamp(provider.capturedPct, 0, 100)
    if (usedPct == null || usedPct >= 100) continue

    const reservePct =
      provider.pace?.tone === 'reserve'
        ? Math.max(0, Math.abs(Number(provider.pace.deltaPercent) || 0))
        : Math.max(0, 100 - usedPct)
    if (reservePct <= 0) continue

    const resetAt = soonestResetAt(provider, now)
    const timeLeftMs = resetAt ? Math.max(0, resetAt - now) : 30 * DAY
    const resetPressure = resetAt ? 1 + Math.max(0, 1 - Math.min(timeLeftMs, 7 * DAY) / (7 * DAY)) * 1.5 : 0.75
    const valueLeft = moneyNumber(provider.leftValue ?? provider.burnValue ?? 0)
    const valueWeight = Math.max(10, valueLeft || moneyNumber(provider.monthly) || 10)
    const historicalWastePct = Math.max(0, Number(provider.history?.averageUnusedPct) || 0)
    const historyRiskPct = Math.max(0, Number(provider.history?.missRiskPct) || 0)
    const historyBoost =
      provider.history?.sampleCount >= 2
        ? 1 + Math.min(0.75, historicalWastePct / 100) + Math.min(0.5, historyRiskPct / 200)
        : 1
    const statusBoost = provider.status && ['minor', 'maintenance', 'unknown'].includes(provider.status.indicator) ? 0.55 : 1
    const urgencyBoost = provider.urgent ? 1.35 : 1
    const score = reservePct * valueWeight * resetPressure * urgencyBoost * historyBoost * statusBoost
    const reason = provider.pace?.leftLabel || `${Math.round(100 - usedPct)}% left`
    candidates.push({
      id: provider.id,
      name: provider.name,
      reason,
      historyNote: provider.history?.label || null,
      historyRiskNote: provider.history?.riskLabel || null,
      historicalWastePct: Math.round(historicalWastePct),
      historyRiskPct: Math.round(historyRiskPct),
      historySampleCount: provider.history?.sampleCount || 0,
      reservePct: Math.round(reservePct),
      usedPct: Math.round(usedPct),
      valueLeft,
      resetAt,
      score,
    })
  }

  candidates.sort((a, b) => b.score - a.score || b.reservePct - a.reservePct || a.name.localeCompare(b.name))
  const target = candidates[0]
  if (!target) return null
  return {
    ...target,
    score: Math.round(target.score),
    prompt: target.resetAt ? `${target.reason} before reset` : target.reason,
  }
}

function valueFields(totalValue, spentValue, leftValue, capturedPct, meta = {}) {
  const total = totalValue == null ? null : moneyNumber(totalValue)
  const spent = spentValue == null ? null : moneyNumber(spentValue)
  const left = leftValue == null ? null : moneyNumber(leftValue)
  const usedPct =
    capturedPct == null
      ? total && spent != null
        ? percent((spent / total) * 100)
        : null
      : percent(capturedPct)
  return {
    capturedPct: usedPct,
    remainingPct: usedPct == null ? null : Math.max(0, 100 - usedPct),
    totalValue: total,
    spentValue: spent,
    leftValue: left,
    capturedValue: spent,
    burnValue: left,
    valueLabel: meta.label || 'live usage',
    valueAccuracy: meta.accuracy || 'live',
    valueUnit: meta.unit || 'dollars',
    usageLabel: meta.usageLabel || 'used',
  }
}

function byteCount(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let scaled = value / 1024
  let unit = 0
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024
    unit += 1
  }
  return `${scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[unit]}`
}

function storageTotalsFromProviders(providers) {
  const tracked = providers.filter((p) => p.storageFootprint)
  return {
    totalBytes: tracked.reduce((sum, p) => sum + moneyNumber(p.storageFootprint.totalBytes), 0),
    providerCount: tracked.length,
    localDataProviderCount: tracked.filter((p) => p.storageFootprint.hasLocalData).length,
  }
}

function sourceLabelFromProvider(provider) {
  const tokenSource = provider?.tokenUsage?.source
  if (tokenSource) return String(tokenSource)
  const valueLabel = String(provider?.valueLabel || '').trim()
  if (!valueLabel) return null
  if (provider.valueAccuracy === 'estimate') return 'estimated usage'
  if (provider.valueAccuracy === 'inferred') return valueLabel || 'inferred usage'
  if (provider.valueAccuracy === 'local') return valueLabel || 'local data'
  if (provider.valueAccuracy === 'live') return valueLabel
  return valueLabel || null
}

function addProviderSourceLabels(providers) {
  return (providers || []).map((provider) => {
    if (!provider?.connected) return provider
    const sourceLabel = provider.sourceLabel || sourceLabelFromProvider(provider)
    if (!sourceLabel) return provider
    return { ...provider, sourceLabel }
  })
}

function compactTokenUsageToProvider(tokenUsage) {
  if (!tokenUsage) return null
  return {
    ...tokenUsage,
    modelBreakdowns: tokenUsage.topModels || tokenUsage.modelBreakdowns || [],
    dailyBreakdown: tokenUsage.dailyUsage || tokenUsage.dailyBreakdown || [],
    serviceTierBreakdowns: tokenUsage.serviceTiers || tokenUsage.serviceTierBreakdowns || [],
  }
}

function providerHasUsefulUsage(provider) {
  if (!provider?.connected) return false
  if (provider.capturedPct != null || provider.spentValue != null || provider.leftValue != null) return true
  if ((provider.windows || []).length) return true
  if (provider.primaryWindow || provider.secondaryWindow) return true
  return Number.isFinite(Number(provider.tokenUsage?.total))
}

function providerFromCachedSnapshot(current, cached, generatedAt) {
  const lastUpdatedAt = Date.parse(cached.lastUpdatedAt || '') || generatedAt
  const windows = [cached.primaryWindow, cached.secondaryWindow].filter(Boolean)
  const spent = cached.spentValue == null ? null : moneyNumber(cached.spentValue)
  const left = cached.leftValue == null ? null : moneyNumber(cached.leftValue)
  const total = spent != null && left != null ? spent + left : cached.monthly ?? current.monthly ?? null
  const source = cached.sourceLabel ? `cached ${cached.sourceLabel}` : 'cached usage'
  return {
    ...current,
    name: cached.name || current.name,
    plan: cached.plan || current.plan,
    monthly: cached.monthly ?? current.monthly,
    connected: true,
    needsKey: false,
    activity: 'stale',
    lastUpdatedAt,
    ...valueFields(total, spent, left, cached.capturedPct, {
      label: source,
      accuracy: 'live',
    }),
    windows,
    tokenUsage: compactTokenUsageToProvider(cached.tokenUsage),
    extra: [
      ...((current.extra || []).filter(Boolean)),
      { label: 'Status', value: `last good ${new Date(lastUpdatedAt).toLocaleTimeString()}` },
    ],
    resetAt: cached.resetAt || windows[0]?.resetAt || current.resetAt,
    urgent: cached.urgent === true,
    error: null,
    sourceLabel: source,
  }
}

function applyCachedProviderFallbacks(providers, cache = widgetSnapshot.readWidgetSnapshot(), now = Date.now()) {
  const generatedAt = Date.parse(cache?.generatedAt || '')
  if (!Number.isFinite(generatedAt) || now - generatedAt > STALE_PROVIDER_FALLBACK_MS) return providers
  const cachedById = new Map((cache.providers || []).map((provider) => [provider.id, provider]))
  return providers.map((provider) => {
    if (providerHasUsefulUsage(provider)) return provider
    if (!provider?.error) return provider
    const cached = cachedById.get(provider.id)
    if (!providerHasUsefulUsage(cached)) return provider
    logger.warn('provider', `${provider.id} using cached fallback`, { error: provider.error })
    return providerFromCachedSnapshot(provider, cached, generatedAt)
  })
}

function resetQueueFromProviders(providers, now = Date.now()) {
  const horizonMs = 14 * DAY
  const items = []
  for (const provider of providers || []) {
    if (!provider?.connected) continue
    for (const window of provider.windows || []) {
      const resetAt = Number(window.resetAt)
      if (!Number.isFinite(resetAt) || resetAt <= now || resetAt - now > horizonMs) continue
      const usedPct = clamp(window.usedPct, 0, 100)
      if (usedPct == null || usedPct >= 100) continue
      const reservePct = Math.max(0, 100 - usedPct)
      const valueLeft = provider.leftValue != null ? moneyNumber(provider.leftValue) * (reservePct / 100) : null
      items.push({
        providerId: provider.id,
        providerName: provider.name,
        windowLabel: window.label || window.kind || 'Window',
        kind: window.kind || 'cycle',
        usedPct,
        reservePct: Math.round(reservePct),
        resetAt,
        timeLeftMs: resetAt - now,
        valueLeft,
        urgent: windowUrgent(window),
        historyRiskPct: window.history?.missRiskPct || null,
        pace: window.pace
          ? {
              tone: window.pace.tone,
              leftLabel: window.pace.leftLabel,
              willLastToReset: window.pace.willLastToReset,
            }
          : null,
      })
    }
  }
  return items
    .sort((a, b) => a.timeLeftMs - b.timeLeftMs || b.reservePct - a.reservePct || a.providerName.localeCompare(b.providerName))
    .slice(0, 4)
}

function valueFromMonthly(conf, capturedPct, meta) {
  if (capturedPct == null) return valueFields(null, null, null, null, meta)
  const total = moneyNumber(conf.monthly)
  const usedPct = percent(capturedPct)
  const spent = total * (usedPct / 100)
  return valueFields(total, spent, Math.max(0, total - spent), usedPct, meta)
}

function valueFromSpendLeft(spentValue, leftValue, meta) {
  const spent = moneyNumber(spentValue)
  const left = moneyNumber(leftValue)
  return valueFields(spent + left, spent, left, null, meta)
}

async function buildProvider(id, conf, cycle, config = loadConfig()) {
  const tokenOptions = { tokenHistoryDays: config.tokenHistoryDays }
  const base = { id, name: conf.name, plan: conf.plan, monthly: conf.monthly, links: providerLinks.linksForProvider(id) }

  if (id === 'claude' || id === 'kimi') {
    const d = id === 'claude' ? await claude.read(tokenOptions) : await kimi.read()
    if (!d.connected) return { ...base, connected: false, activity: 'none' }
    const weekly = d.windows.find((w) => w.label === 'Weekly')
    const session = d.windows.find((w) => w.label === 'Session')
    const capturedPct = weekly ? weekly.usedPct : session ? session.usedPct : null
    const urgent = d.windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.plan || conf.plan,
      ...valueFromMonthly(conf, capturedPct, { label: 'live quota', accuracy: 'live' }),
      windows: d.windows,
      tokenUsage: d.tokenUsage || null,
      extra: d.extra || [],
      resetAt: weekly ? weekly.resetAt : session ? session.resetAt : cycle.endMs,
      resetKind: 'weekly',
      urgent,
      activity: d.error ? 'stale' : 'live',
      error: d.error || null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'codex') {
    const d = await codex.read(tokenOptions)
    if (!d.connected) return { ...base, connected: false, activity: 'none' }
    const weekly = (d.windows || []).find((w) => w.label === 'Weekly')
    const session = (d.windows || []).find((w) => w.label === 'Session')
    const capturedPct = weekly ? weekly.usedPct : session ? session.usedPct : null
    const urgent = (d.windows || []).some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.planType ? d.planType[0].toUpperCase() + d.planType.slice(1) : conf.plan,
      ...valueFromMonthly(conf, capturedPct, { label: 'live quota', accuracy: 'live' }),
      windows: d.windows || [],
      tokenUsage: d.tokenUsage || null,
      extra: d.extra || [],
      resetAt: weekly ? weekly.resetAt : session ? session.resetAt : cycle.endMs,
      resetKind: 'weekly',
      urgent,
      activity: activityState(d.lastActive),
      lastUpdatedAt: activityLastUpdatedAt(d.lastActive),
      error: d.error || null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 't3chat') {
    const d = await t3chat.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const windows = d.windows || []
    const baseWindow = windows.find((w) => String(w.label || '').startsWith('Base')) || windows[0] || null
    const overage = windows.find((w) => w.label === 'Overage') || null
    const capturedPct = overage?.usedPct ?? baseWindow?.usedPct ?? null
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.plan || conf.plan,
      ...valueFromMonthly(conf, capturedPct, { label: 'live usage', accuracy: 'live' }),
      windows,
      extra: [
        d.usageBand ? { label: 'Band', value: d.usageBand } : null,
        d.subscriptionStatus ? { label: 'Status', value: d.subscriptionStatus } : null,
        d.lifetimeBalance ? { label: 'Balance', value: `$${Number(d.lifetimeBalance).toFixed(2)}` } : null,
      ].filter(Boolean),
      resetAt: d.resetAt || overage?.resetAt || baseWindow?.resetAt || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      sourceLabel: d.sourceLabel || 'live Cursor usage',
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'openai') {
    const d = await openai.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }

    const total = d.source === 'billing-api' ? d.granted : conf.monthly
    const spent = d.spent || 0
    const capturedPct = total > 0 ? percent((spent / total) * 100) : 0
    const urgent = cycle.daysLeft <= 3 && (capturedPct || 0) < 70
    const tokenTotal = d.tokens?.total || 0
    return {
      ...base,
      connected: true,
      plan: d.source === 'admin-api' ? 'Admin API' : 'API credits',
      monthly: total || base.monthly,
      ...valueFields(total, spent, Math.max(0, total - spent), capturedPct, {
        label: d.source === 'admin-api' ? '30-day API spend' : 'credit balance',
        accuracy: 'live',
      }),
      tokenUsage:
        tokenTotal > 0
          ? {
              input: d.tokens.input,
              cached: d.tokens.cached,
              output: d.tokens.output,
              total: tokenTotal,
              requests: d.tokens.requests,
              dailyBreakdown: d.tokens.dailyBreakdown || [],
              modelBreakdowns: d.tokens.modelBreakdowns || [],
              source: 'OpenAI Admin API',
            }
          : null,
      windows: [
        {
          label: d.source === 'admin-api' ? '30-day spend' : 'Credits',
          kind: 'cycle',
          usedPct: capturedPct || 0,
          resetAt: d.resetAt || cycle.endMs,
          periodMs: null,
        },
      ],
      extra: [
        d.topModel ? { label: 'Top model', value: d.topModel.model } : null,
        d.tokens?.requests ? { label: 'Requests', value: String(d.tokens.requests) } : null,
        d.topLineItem ? { label: 'Top spend', value: d.topLineItem.name } : null,
      ].filter(Boolean),
      resetAt: d.resetAt || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'azureopenai') {
    const d = await azureopenai.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const capturedPct = 0
    return {
      ...base,
      connected: true,
      plan: d.model || conf.plan,
      ...valueFields(conf.monthly, 0, conf.monthly, capturedPct, {
        label: 'active Azure deployment',
        accuracy: 'live',
        unit: 'deployment',
      }),
      windows: [
        {
          label: 'Deployment',
          kind: 'cycle',
          usedPct: 0,
          resetAt: null,
          periodMs: null,
        },
      ],
      extra: [
        { label: 'Endpoint', value: d.endpointHost },
        { label: 'Deployment', value: d.deploymentName },
        d.model ? { label: 'Model', value: d.model } : null,
        { label: 'API version', value: d.apiVersion },
      ].filter(Boolean),
      resetAt: cycle.endMs,
      resetKind: 'deployment',
      urgent: false,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, false),
    }
  }

  if (id === 'cursor') {
    const d = await cursor.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const total = d.planLimitUSD > 0 ? d.planLimitUSD : conf.monthly
    const monthly = d.monthlyPriceUSD > 0 ? d.monthlyPriceUSD : conf.monthly
    const spent = d.planUsedUSD || 0
    const capturedPct = percent(d.planPercentUsed)
    const windows = [
      {
        label: 'Total',
        kind: 'cycle',
        usedPct: capturedPct || 0,
        resetAt: d.resetAt,
        periodMs: null,
      },
      d.autoPercentUsed == null
        ? null
        : {
            label: 'Auto',
            kind: 'cycle',
            usedPct: percent(d.autoPercentUsed) || 0,
            resetAt: d.resetAt,
            periodMs: null,
          },
      d.apiPercentUsed == null
        ? null
        : {
            label: 'API',
            kind: 'cycle',
            usedPct: percent(d.apiPercentUsed) || 0,
            resetAt: d.resetAt,
            periodMs: null,
          },
    ].filter(Boolean)
    const urgent = cycle.daysLeft <= 3 && (capturedPct || 0) < 70
    return {
      ...base,
      connected: true,
      plan: d.plan || conf.plan,
      monthly: monthly || base.monthly,
      ...valueFields(total, spent, Math.max(0, total - spent), capturedPct, {
        label: 'live Cursor usage',
        accuracy: 'live',
      }),
      windows,
      extra: [
        d.onDemandUsedUSD
          ? { label: 'On-demand', value: '$' + d.onDemandUsedUSD.toFixed(2) }
          : null,
        d.email ? { label: 'Signed in', value: d.email } : null,
      ].filter(Boolean),
      resetAt: d.resetAt || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'copilot') {
    const d = await copilot.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const premiumPct = d.premium ? percent(d.premium.usedPct) : null
    const chatPct = d.chat ? percent(d.chat.usedPct) : null
    const capturedPct = premiumPct ?? chatPct ?? 0
    const total = d.premium?.entitlement || d.chat?.entitlement || conf.monthly
    const used = d.premium ? Math.max(0, d.premium.entitlement - d.premium.remaining) : 0
    const windows = [
      d.premium
        ? {
            label: 'Premium',
            kind: 'cycle',
            usedPct: premiumPct || 0,
            resetAt: d.resetAt || cycle.endMs,
            periodMs: null,
          }
        : null,
      d.chat
        ? {
            label: 'Chat',
            kind: 'cycle',
            usedPct: chatPct || 0,
            resetAt: d.resetAt || cycle.endMs,
            periodMs: null,
          }
        : null,
    ].filter(Boolean)
    const urgent = cycle.daysLeft <= 3 && capturedPct < 70
    return {
      ...base,
      connected: true,
      plan: d.plan || conf.plan,
      monthly: total || base.monthly,
      ...valueFields(total, used, Math.max(0, total - used), capturedPct, {
        label: 'live request quota',
        accuracy: 'live',
        unit: 'requests',
      }),
      windows,
      extra: [
        d.premium ? { label: 'Premium left', value: String(Math.round(d.premium.remaining)) } : null,
        d.chat ? { label: 'Chat left', value: String(Math.round(d.chat.remaining)) } : null,
      ].filter(Boolean),
      resetAt: d.resetAt || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'windsurf') {
    const d = await windsurf.read()
    if (!d.connected) return { ...base, connected: false, activity: 'none', error: d.error || null }
    const dailyPct = d.daily ? percent(d.daily.usedPct) : null
    const weeklyPct = d.weekly ? percent(d.weekly.usedPct) : null
    const capturedPct = dailyPct ?? weeklyPct ?? 0
    const total = d.messages?.total || d.flowActions?.total || conf.monthly
    const used = d.messages?.used || d.flowActions?.used || total * ((capturedPct || 0) / 100)
    const windows = [
      d.daily
        ? {
            label: 'Daily',
            kind: 'cycle',
            usedPct: dailyPct || 0,
            resetAt: d.daily.resetAt,
            periodMs: null,
          }
        : null,
      d.weekly
        ? {
            label: 'Weekly',
            kind: '7d',
            usedPct: weeklyPct || 0,
            resetAt: d.weekly.resetAt,
            periodMs: 7 * DAY,
          }
        : null,
    ].filter(Boolean)
    const urgent = cycle.daysLeft <= 3 && capturedPct < 70
    return {
      ...base,
      connected: true,
      plan: d.plan || conf.plan,
      monthly: total || base.monthly,
      ...valueFields(total, used, Math.max(0, total - used), capturedPct, {
        label: d.source || 'Windsurf usage',
        accuracy: d.source === 'Windsurf web session' ? 'live' : 'local',
        unit: 'quota',
      }),
      windows,
      extra: [
        d.messages ? { label: 'Messages left', value: String(Math.round(d.messages.remaining)) } : null,
        d.flowActions ? { label: 'Flow left', value: String(Math.round(d.flowActions.remaining)) } : null,
        { label: 'Source', value: d.source === 'Windsurf web session' ? 'web session' : 'local cache' },
      ].filter(Boolean),
      resetAt: d.daily?.resetAt || d.weekly?.resetAt || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: activityState(d.lastActive),
      lastUpdatedAt: activityLastUpdatedAt(d.lastActive),
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'kiro') {
    const d = await kiro.read()
    if (!d.connected) return { ...base, connected: false, activity: 'none', error: d.error || null }
    const capturedPct = percent(d.creditsPercent)
    const total = d.creditsTotal || null
    const used = d.creditsUsed || 0
    const value =
      total && total > 0
        ? valueFields(total, used, Math.max(0, total - used), capturedPct, {
            label: 'live Kiro credits',
            accuracy: 'live',
            unit: 'credits',
          })
        : valueFields(null, null, null, null, {
            label: 'managed Kiro plan',
            accuracy: 'live',
            unit: 'credits',
          })
    const bonus = d.bonusCredits
    const windows = [
      {
        label: 'Credits',
        kind: 'cycle',
        usedPct: capturedPct || 0,
        resetAt: d.resetAt || cycle.endMs,
        periodMs: null,
      },
      bonus && bonus.total > 0
        ? {
            label: 'Bonus',
            kind: 'cycle',
            usedPct: percent((bonus.used / bonus.total) * 100) || 0,
            resetAt: bonus.expiryDays ? Date.now() + bonus.expiryDays * DAY : null,
            periodMs: null,
          }
        : null,
    ].filter(Boolean)
    const urgent = cycle.daysLeft <= 3 && (capturedPct || 0) < 70
    return {
      ...base,
      connected: true,
      plan: d.plan || conf.plan,
      monthly: total || base.monthly,
      ...value,
      windows,
      extra: [
        { label: 'Credits left', value: String(Math.round(d.creditsRemaining || 0)) },
        bonus ? { label: 'Bonus left', value: String(Math.round(bonus.remaining || 0)) } : null,
        d.email ? { label: 'Signed in', value: d.email } : null,
      ].filter(Boolean),
      resetAt: d.resetAt || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'opencode') {
    const d = await opencode.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const capturedPct = percent(d.weekly?.usedPct ?? d.rolling?.usedPct ?? 0)
    const windows = [
      d.rolling
        ? {
            label: '5-hour',
            kind: '5h',
            usedPct: percent(d.rolling.usedPct) || 0,
            resetAt: d.rolling.resetAt,
            periodMs: 5 * 3600e3,
          }
        : null,
      d.weekly
        ? {
            label: 'Weekly',
            kind: '7d',
            usedPct: percent(d.weekly.usedPct) || 0,
            resetAt: d.weekly.resetAt,
            periodMs: 7 * DAY,
          }
        : null,
    ].filter(Boolean)
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: conf.plan,
      ...valueFromMonthly(conf, capturedPct, {
        label: 'live OpenCode quota',
        accuracy: 'live',
      }),
      windows,
      extra: [
        d.workspaceID ? { label: 'Workspace', value: d.workspaceID } : null,
        { label: 'Source', value: 'web session' },
      ].filter(Boolean),
      resetAt: d.weekly?.resetAt || d.rolling?.resetAt || cycle.endMs,
      resetKind: 'weekly',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'opencodego') {
    const d = await opencodego.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const capturedPct = percent(d.monthly?.usedPct ?? d.weekly?.usedPct ?? d.rolling?.usedPct ?? 0)
    const windows = [
      d.rolling
        ? {
            label: '5-hour',
            kind: '5h',
            usedPct: percent(d.rolling.usedPct) || 0,
            resetAt: d.rolling.resetAt,
            periodMs: 5 * 3600e3,
          }
        : null,
      d.weekly
        ? {
            label: 'Weekly',
            kind: '7d',
            usedPct: percent(d.weekly.usedPct) || 0,
            resetAt: d.weekly.resetAt,
            periodMs: 7 * DAY,
          }
        : null,
      d.monthly
        ? {
            label: 'Monthly',
            kind: 'cycle',
            usedPct: percent(d.monthly.usedPct) || 0,
            resetAt: d.monthly.resetAt,
            periodMs: 30 * DAY,
          }
        : null,
    ].filter(Boolean)
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: conf.plan,
      ...valueFromMonthly(conf, capturedPct, {
        label: 'live OpenCode Go quota',
        accuracy: 'live',
      }),
      windows,
      extra: [
        d.zenBalanceUSD != null ? { label: 'Zen balance', value: '$' + d.zenBalanceUSD.toFixed(2) } : null,
        d.workspaceID ? { label: 'Workspace', value: d.workspaceID } : null,
        { label: 'Source', value: 'web session' },
      ].filter(Boolean),
      resetAt: d.monthly?.resetAt || d.weekly?.resetAt || d.rolling?.resetAt || cycle.endMs,
      resetKind: d.monthly ? 'cycle' : 'weekly',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'alibaba') {
    const d = await alibaba.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const windows = (d.windows || []).map((w) => ({
      label: w.label,
      kind: w.label === '5-hour' ? '5h' : w.label === 'Weekly' ? '7d' : 'cycle',
      usedPct: percent(w.usedPct) || 0,
      resetAt: w.resetAt || null,
      periodMs: w.periodMs || null,
    }))
    const primary = windows.find((w) => w.label === 'Monthly') || windows.find((w) => w.label === 'Weekly') || windows[0]
    const capturedPct = primary ? percent(primary.usedPct) : null
    const totalWindow = (d.windows || []).find((w) => w.label === primary?.label)
    const total = totalWindow?.total || conf.monthly
    const used = totalWindow?.used || (capturedPct == null ? 0 : Math.round((total * capturedPct) / 100))
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.planName || conf.plan,
      monthly: total || base.monthly,
      ...valueFields(total, used, Math.max(0, total - used), capturedPct, {
        label: 'live Alibaba Coding Plan quota',
        accuracy: 'live',
        unit: 'requests',
      }),
      windows,
      extra: [
        d.source ? { label: 'Source', value: d.source === 'api' ? 'API key' : 'web session' } : null,
        d.region ? { label: 'Region', value: d.region === 'cn' ? 'China mainland' : 'International' } : null,
      ].filter(Boolean),
      resetAt: primary?.resetAt || cycle.endMs,
      resetKind: primary?.kind === '5h' ? '5h' : primary?.kind === '7d' ? 'weekly' : 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'alibabatokenplan') {
    const d = await alibabaTokenPlan.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const windows = (d.windows || []).map((w) => ({
      label: w.label,
      kind: 'cycle',
      usedPct: percent(w.usedPct) || 0,
      resetAt: w.resetAt || null,
      periodMs: w.periodMs || null,
    }))
    const primary = windows[0] || null
    const capturedPct = primary ? percent(primary.usedPct) : null
    const totalWindow = (d.windows || [])[0]
    const total = totalWindow?.total || conf.monthly
    const used =
      totalWindow?.used ??
      (d.remainingQuota != null && d.totalQuota != null
        ? Math.max(0, Number(d.totalQuota) - Number(d.remainingQuota))
        : capturedPct == null
          ? 0
          : Math.round((total * capturedPct) / 100))
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.planName || conf.plan,
      monthly: total || base.monthly,
      ...valueFields(total, used, Math.max(0, total - used), capturedPct, {
        label: 'live Alibaba Token Plan quota',
        accuracy: 'live',
        unit: 'credits',
      }),
      windows,
      extra: [
        d.remainingQuota != null ? { label: 'Credits left', value: String(Math.round(Number(d.remainingQuota))) } : null,
        d.source ? { label: 'Source', value: 'web session' } : null,
      ].filter(Boolean),
      resetAt: primary?.resetAt || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'augment') {
    const d = await augment.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const capturedPct = percent(d.usedPct ?? 0)
    const total = d.creditsLimit || conf.monthly
    const used = d.creditsUsed || (d.creditsRemaining != null ? Math.max(0, total - d.creditsRemaining) : 0)
    const urgent = cycle.daysLeft <= 3 && capturedPct < 70
    return {
      ...base,
      connected: true,
      plan: d.plan || conf.plan,
      monthly: total || base.monthly,
      ...valueFields(total, used, Math.max(0, total - used), capturedPct, {
        label: d.source === 'cli' ? 'Auggie CLI credits' : 'live Augment credits',
        accuracy: 'live',
        unit: 'credits',
      }),
      windows: [
        {
          label: 'Credits',
          kind: 'cycle',
          usedPct: capturedPct || 0,
          resetAt: d.resetAt || cycle.endMs,
          periodMs: null,
        },
      ],
      extra: [
        d.creditsRemaining != null ? { label: 'Credits left', value: String(Math.round(d.creditsRemaining)) } : null,
        d.email ? { label: 'Signed in', value: d.email } : null,
        d.balanceStatus ? { label: 'Status', value: d.balanceStatus } : null,
        { label: 'Source', value: d.source === 'cli' ? 'auggie' : 'web session' },
      ].filter(Boolean),
      resetAt: d.resetAt || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'jetbrains') {
    const d = jetbrains.read()
    if (!d.connected) return { ...base, connected: false, activity: 'none', error: d.error || null }
    const capturedPct = percent(d.usedPct)
    const total = d.maximum || conf.monthly
    const used = d.used || 0
    const urgent = cycle.daysLeft <= 3 && capturedPct < 70
    return {
      ...base,
      connected: true,
      plan: d.plan || conf.plan,
      monthly: total || base.monthly,
      ...valueFields(total, used, Math.max(0, total - used), capturedPct, {
        label: 'local JetBrains quota',
        accuracy: 'local',
        unit: 'credits',
      }),
      windows: [
        {
          label: 'Credits',
          kind: 'cycle',
          usedPct: capturedPct || 0,
          resetAt: d.resetAt || cycle.endMs,
          periodMs: null,
        },
      ],
      extra: [
        d.available != null ? { label: 'Credits left', value: String(Math.round(d.available)) } : null,
        d.refillAmount != null ? { label: 'Refill', value: String(Math.round(d.refillAmount)) } : null,
        d.ide ? { label: 'IDE', value: d.ide } : null,
      ].filter(Boolean),
      resetAt: d.resetAt || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: activityState(d.lastActive),
      lastUpdatedAt: activityLastUpdatedAt(d.lastActive),
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'warp') {
    const d = await warp.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const capturedPct = percent(d.usedPct)
    const total = d.isUnlimited ? conf.monthly : d.requestLimit || conf.monthly
    const used = d.isUnlimited ? 0 : d.requestsUsed || 0
    const bonusPct = d.bonusCreditsTotal > 0 ? percent(((d.bonusCreditsTotal - d.bonusCreditsRemaining) / d.bonusCreditsTotal) * 100) : null
    const windows = [
      {
        label: d.isUnlimited ? 'Requests' : 'Credits',
        kind: 'cycle',
        usedPct: capturedPct || 0,
        resetAt: d.resetAt || cycle.endMs,
        periodMs: null,
      },
      d.bonusCreditsTotal > 0 || d.bonusCreditsRemaining > 0
        ? {
            label: 'Add-on credits',
            kind: 'cycle',
            usedPct: bonusPct || 0,
            resetAt: d.bonusNextExpiration || null,
            periodMs: null,
          }
        : null,
    ].filter(Boolean)
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.isUnlimited ? 'Unlimited' : conf.plan,
      monthly: total || base.monthly,
      ...valueFields(total, used, Math.max(0, total - used), capturedPct, {
        label: 'live Warp credits',
        accuracy: 'live',
        unit: 'credits',
      }),
      windows,
      extra: [
        d.isUnlimited ? { label: 'Limit', value: 'Unlimited' } : { label: 'Credits left', value: String(Math.max(0, total - used)) },
        d.bonusCreditsRemaining ? { label: 'Bonus left', value: String(d.bonusCreditsRemaining) } : null,
        d.bonusNextExpirationRemaining ? { label: 'Expiring next', value: String(d.bonusNextExpirationRemaining) } : null,
      ].filter(Boolean),
      resetAt: d.resetAt || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'elevenlabs') {
    const d = await elevenlabs.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const capturedPct = percent(d.usedPct)
    const total = d.characterLimit || conf.monthly
    const used = d.characterCount || 0
    const voicePct = d.voiceLimit > 0 ? percent(((d.voiceSlotsUsed || 0) / d.voiceLimit) * 100) : null
    const proVoicePct =
      d.professionalVoiceLimit > 0 ? percent(((d.professionalVoiceSlotsUsed || 0) / d.professionalVoiceLimit) * 100) : null
    const windows = [
      {
        label: 'Characters',
        kind: 'cycle',
        usedPct: capturedPct || 0,
        resetAt: d.resetAt || cycle.endMs,
        periodMs: null,
      },
      d.voiceLimit > 0
        ? {
            label: 'Voice slots',
            kind: 'cycle',
            usedPct: voicePct || 0,
            resetAt: null,
            periodMs: null,
          }
        : null,
      d.professionalVoiceLimit > 0
        ? {
            label: 'Pro voices',
            kind: 'cycle',
            usedPct: proVoicePct || 0,
            resetAt: null,
            periodMs: null,
          }
        : null,
    ].filter(Boolean)
    const urgent = windows.some(windowUrgent)
    const plan = d.tier ? d.tier.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : conf.plan
    return {
      ...base,
      connected: true,
      plan: d.status && d.status !== 'active' ? `${plan} · ${d.status}` : plan,
      monthly: total || base.monthly,
      ...valueFields(total, used, Math.max(0, total - used), capturedPct, {
        label: 'live ElevenLabs credits',
        accuracy: 'live',
        unit: 'characters',
      }),
      windows,
      extra: [
        { label: 'Characters left', value: String(Math.round(d.remainingCharacters || 0)) },
        d.voiceLimit != null ? { label: 'Voice slots', value: `${Math.round(d.voiceSlotsUsed || 0)} / ${Math.round(d.voiceLimit)}` } : null,
        d.professionalVoiceLimit != null
          ? { label: 'Pro voices', value: `${Math.round(d.professionalVoiceSlotsUsed || 0)} / ${Math.round(d.professionalVoiceLimit)}` }
          : null,
        d.overageAmount ? { label: 'Overage', value: `${d.overageAmount} ${d.overageCurrency || ''}`.trim() } : null,
      ].filter(Boolean),
      resetAt: d.resetAt || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'kilo') {
    const d = await kilo.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const total = d.creditsTotal ?? d.passTotal ?? conf.monthly
    const used = d.creditsUsed ?? d.passUsed ?? 0
    const capturedPct = percent(total > 0 ? (used / total) * 100 : 100)
    const passPct = d.passTotal > 0 ? percent((d.passUsed / d.passTotal) * 100) : null
    const windows = [
      d.creditsTotal != null
        ? {
            label: 'Credits',
            kind: 'cycle',
            usedPct: capturedPct || 0,
            resetAt: cycle.endMs,
            periodMs: null,
          }
        : null,
      d.passTotal != null
        ? {
            label: 'Kilo Pass',
            kind: 'cycle',
            usedPct: passPct || 0,
            resetAt: d.passResetsAt || cycle.endMs,
            periodMs: null,
          }
        : null,
    ].filter(Boolean)
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.plan || conf.plan,
      monthly: total || base.monthly,
      ...valueFields(total, used, Math.max(0, total - used), capturedPct, {
        label: d.source === 'cli' ? 'Kilo CLI credits' : 'live Kilo credits',
        accuracy: 'live',
        unit: 'credits',
      }),
      windows,
      extra: [
        d.creditsRemaining != null ? { label: 'Credits left', value: String(Math.round(d.creditsRemaining)) } : null,
        d.passRemaining != null ? { label: 'Pass left', value: '$' + Number(d.passRemaining).toFixed(2) } : null,
        d.passBonus ? { label: 'Pass bonus', value: '$' + Number(d.passBonus).toFixed(2) } : null,
        d.autoTopUpEnabled != null ? { label: 'Auto top-up', value: d.autoTopUpEnabled ? d.autoTopUpMethod || 'on' : 'off' } : null,
      ].filter(Boolean),
      resetAt: d.passResetsAt || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'gemini') {
    const d = gemini.read(cycle)
    if (!d.connected) return { ...base, connected: false, activity: 'none' }
    const capturedPct = Math.min(100, Math.round((d.activeDays / cycle.daysElapsed) * 100))
    const urgent = cycle.daysLeft <= 3 && capturedPct < 70
    return {
      ...base,
      connected: true,
      ...valueFromMonthly(conf, capturedPct, {
        label: 'activity estimate',
        accuracy: 'estimate',
        usageLabel: 'active',
      }),
      windows: [],
      extra: [
        { label: 'Sessions', value: String(d.sessions) },
        { label: 'Active days', value: `${d.activeDays} / ${cycle.daysElapsed}` },
      ],
      resetAt: cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: activityState(d.lastActive),
      lastUpdatedAt: activityLastUpdatedAt(d.lastActive),
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'moonshot') {
    const d = await moonshot.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const balance = Math.max(0, d.availableBalance || 0)
    const deficit = Math.max(0, d.deficit || 0)
    const money = valueFromSpendLeft(deficit, balance, {
      label: 'live Moonshot balance',
      accuracy: 'live',
    })
    const capturedPct = money.capturedPct || 0
    const urgent = balance > 0 && capturedPct < 50
    return {
      ...base,
      connected: true,
      plan: conf.plan,
      monthly: money.totalValue || base.monthly,
      ...money,
      windows: [
        {
          label: 'Balance',
          kind: 'cycle',
          usedPct: capturedPct,
          resetAt: null,
          periodMs: null,
        },
      ],
      extra: [
        { label: 'Available', value: '$' + balance.toFixed(2) },
        { label: 'Voucher', value: '$' + Number(d.voucherBalance || 0).toFixed(2) },
        deficit ? { label: 'Deficit', value: '$' + deficit.toFixed(2) } : null,
      ].filter(Boolean),
      resetAt: cycle.endMs,
      resetKind: 'balance',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'kimik2') {
    const d = await kimik2.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const money = valueFromSpendLeft(d.consumed || 0, d.remaining || 0, {
      label: 'live Kimi K2 credits',
      accuracy: 'live',
      unit: 'credits',
    })
    const capturedPct = money.capturedPct || 0
    const urgent = d.remaining > 0 && capturedPct < 50
    return {
      ...base,
      connected: true,
      plan: conf.plan,
      monthly: money.totalValue || base.monthly,
      ...money,
      windows: [
        {
          label: 'Credits',
          kind: 'cycle',
          usedPct: capturedPct,
          resetAt: null,
          periodMs: null,
        },
      ],
      extra: [
        { label: 'Credits left', value: String(Number(d.remaining || 0).toFixed(2).replace(/\.00$/, '')) },
        d.averageTokens != null ? { label: 'Avg tokens', value: String(Math.round(d.averageTokens)) } : null,
      ].filter(Boolean),
      resetAt: null,
      resetKind: 'balance',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'grok') {
    const d = await grok.read(cycle, tokenOptions)
    if (!d.connected) return { ...base, connected: false, activity: 'none' }
    const livePct = Number(d.billing?.usedPercent)
    const capturedPct = Number.isFinite(livePct)
      ? Math.round(Math.max(0, Math.min(100, livePct)))
      : Math.min(100, Math.round((d.activeDays / cycle.daysElapsed) * 100))
    const urgent = cycle.daysLeft <= 3 && capturedPct < 70
    return {
      ...base,
      connected: true,
      ...valueFromMonthly(conf, capturedPct, {
        label: d.billing ? 'live quota' : 'activity estimate',
        accuracy: d.billing ? 'live' : 'estimate',
        usageLabel: d.billing ? 'used' : 'active',
      }),
      windows: [],
      extra: [
        d.accountEmail ? { label: 'Account', value: d.accountEmail } : null,
        { label: 'Sessions', value: String(d.sessions) },
        { label: 'Active days', value: `${d.activeDays} / ${cycle.daysElapsed}` },
        d.tokenUsage?.total ? { label: 'Tokens', value: String(Math.round(d.tokenUsage.total)) } : null,
        d.tokenUsage?.modelNames?.length ? { label: 'Models', value: d.tokenUsage.modelNames.slice(0, 2).join(', ') } : null,
      ].filter(Boolean),
      tokenUsage: d.tokenUsage || null,
      resetAt: d.billing?.resetsAt || cycle.endMs,
      resetKind: d.billing?.resetsAt ? 'monthly' : 'cycle',
      urgent,
      activity: d.billing ? 'live' : activityState(d.lastActive),
      lastUpdatedAt: d.billing ? Date.now() : activityLastUpdatedAt(d.lastActive),
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'groq') {
    const d = await groq.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const capturedPct = 0
    return {
      ...base,
      connected: true,
      plan: conf.plan,
      ...valueFields(conf.monthly, 0, conf.monthly, capturedPct, {
        label: 'live Groq metrics',
        accuracy: 'live',
        unit: 'rates',
      }),
      windows: [
        {
          label: 'Requests',
          kind: 'cycle',
          usedPct: 0,
          resetAt: null,
          periodMs: 5 * 60000,
        },
        {
          label: 'Tokens',
          kind: 'cycle',
          usedPct: 0,
          resetAt: null,
          periodMs: 5 * 60000,
        },
      ],
      extra: [
        { label: 'Requests', value: d.requestLabel },
        { label: 'Tokens', value: d.tokenLabel },
        d.cacheHitsPerMinute > 0 ? { label: 'Cache', value: d.cacheLabel } : null,
        { label: 'Source', value: 'Prometheus metrics' },
      ].filter(Boolean),
      resetAt: cycle.endMs,
      resetKind: 'metrics',
      urgent: false,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, false),
    }
  }

  if (id === 'openrouter') {
    const d = await openrouter.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const usage = Math.max(0, d.usage || 0)
    const remaining =
      d.remaining != null
        ? Math.max(0, d.remaining)
        : Math.max(0, (d.limit != null ? d.limit : conf.monthly || usage) - usage)
    const money = valueFromSpendLeft(usage, remaining, {
      label: d.limit != null || d.remaining != null ? 'live API spend' : 'API budget',
      accuracy: d.limit != null || d.remaining != null ? 'live' : 'budget',
    })
    const capturedPct = money.capturedPct || 0
    const urgent = cycle.daysLeft <= 3 && capturedPct < 60
    return {
      ...base,
      connected: true,
      monthly: money.totalValue || base.monthly,
      ...money,
      windows: [],
      extra: [
        { label: 'Spent', value: '$' + usage.toFixed(2) },
        d.limit != null
          ? { label: 'Hard cap', value: '$' + Number(d.limit).toFixed(2) }
          : { label: 'Hard cap', value: 'none' },
      ],
      resetAt: cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'perplexity') {
    const d = await perplexity.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const centsToDollars = (value) => Math.max(0, (Number(value) || 0) / 100)
    const totalCents = d.totalCents || d.recurringTotalCents + d.promoTotalCents + d.purchasedTotalCents
    const usedCents = d.recurringUsedCents + d.promoUsedCents + d.purchasedUsedCents
    const capturedPct = totalCents > 0 ? percent((usedCents / totalCents) * 100) : 0
    const poolWindow = (label, used, total, resetAt = null) =>
      total > 0
        ? {
            label,
            kind: 'cycle',
            usedPct: percent((used / total) * 100) || 0,
            resetAt,
            periodMs: null,
          }
        : null
    const windows = [
      poolWindow('Recurring', d.recurringUsedCents, d.recurringTotalCents, d.renewalDate || cycle.endMs),
      poolWindow('Bonus', d.promoUsedCents, d.promoTotalCents, d.promoExpiration),
      poolWindow('Purchased', d.purchasedUsedCents, d.purchasedTotalCents, null),
    ].filter(Boolean)
    const urgent = windows.some(windowUrgent)
    const total = centsToDollars(totalCents)
    const used = centsToDollars(usedCents)
    return {
      ...base,
      connected: true,
      plan: d.plan || conf.plan,
      monthly: total || base.monthly,
      ...valueFields(total, used, Math.max(0, total - used), capturedPct, {
        label: 'live Perplexity credits',
        accuracy: 'live',
      }),
      windows,
      extra: [
        { label: 'Balance', value: '$' + centsToDollars(d.balanceCents).toFixed(2) },
        d.recurringTotalCents ? { label: 'Recurring', value: '$' + centsToDollars(d.recurringTotalCents).toFixed(2) } : null,
        d.promoTotalCents ? { label: 'Bonus', value: '$' + centsToDollars(d.promoTotalCents).toFixed(2) } : null,
        d.purchasedTotalCents ? { label: 'Purchased', value: '$' + centsToDollars(d.purchasedTotalCents).toFixed(2) } : null,
      ].filter(Boolean),
      resetAt: d.renewalDate || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'mistral') {
    const d = await mistral.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const total = Math.max(conf.monthly || 0, d.totalCost || 0)
    const capturedPct = total > 0 ? percent(((d.totalCost || 0) / total) * 100) : 0
    const urgent = cycle.daysLeft <= 3 && capturedPct < 60
    return {
      ...base,
      connected: true,
      monthly: total || base.monthly,
      ...valueFields(total, d.totalCost || 0, Math.max(0, total - (d.totalCost || 0)), capturedPct, {
        label: 'live Mistral spend',
        accuracy: 'live',
      }),
      windows: [
        {
          label: 'Monthly',
          kind: 'cycle',
          usedPct: capturedPct || 0,
          resetAt: d.endDate || cycle.endMs,
          periodMs: null,
        },
      ],
      tokenUsage:
        d.totalTokens > 0
          ? {
              input: d.totalInputTokens,
              cached: d.totalCachedTokens,
              output: d.totalOutputTokens,
              total: d.totalTokens,
              requests: null,
              source: 'Mistral billing',
            }
          : null,
      extra: [
        { label: 'Spend', value: `${d.currencySymbol}${Number(d.totalCost || 0).toFixed(4)}` },
        { label: 'Models', value: String(d.modelCount || 0) },
        d.totalTokens > 0 ? { label: 'Tokens', value: String(Math.round(d.totalTokens)) } : null,
      ].filter(Boolean),
      resetAt: d.endDate || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'codebuff') {
    const d = await codebuff.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const total =
      d.creditsTotal != null
        ? d.creditsTotal
        : d.creditsUsed != null && d.creditsRemaining != null
          ? d.creditsUsed + d.creditsRemaining
          : d.weeklyLimit || conf.monthly
    const used =
      d.creditsUsed != null
        ? d.creditsUsed
        : d.creditsRemaining != null && total != null
          ? Math.max(0, total - d.creditsRemaining)
          : d.weeklyUsed || 0
    const capturedPct = total > 0 ? percent((used / total) * 100) : 0
    const weeklyPct = d.weeklyLimit > 0 ? percent(((d.weeklyUsed || 0) / d.weeklyLimit) * 100) : null
    const windows = [
      total > 0
        ? {
            label: 'Credits',
            kind: 'cycle',
            usedPct: capturedPct || 0,
            resetAt: d.nextQuotaReset || d.billingPeriodEnd || cycle.endMs,
            periodMs: null,
          }
        : null,
      d.weeklyLimit > 0
        ? {
            label: 'Weekly',
            kind: '7d',
            usedPct: weeklyPct || 0,
            resetAt: d.weeklyResetsAt || null,
            periodMs: 7 * DAY,
          }
        : null,
    ].filter(Boolean)
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.tier || conf.plan,
      monthly: total || base.monthly,
      ...valueFields(total, used, Math.max(0, total - used), capturedPct, {
        label: d.source === 'cli' ? 'Codebuff CLI credits' : 'live Codebuff credits',
        accuracy: 'live',
        unit: 'credits',
      }),
      windows,
      extra: [
        d.creditsRemaining != null ? { label: 'Credits left', value: String(Math.round(d.creditsRemaining)) } : null,
        d.weeklyLimit != null ? { label: 'Weekly left', value: String(Math.max(0, Math.round(d.weeklyLimit - (d.weeklyUsed || 0)))) } : null,
        d.autoTopUpEnabled != null ? { label: 'Auto top-up', value: d.autoTopUpEnabled ? 'on' : 'off' } : null,
        d.email ? { label: 'Signed in', value: d.email } : null,
      ].filter(Boolean),
      resetAt: d.nextQuotaReset || d.weeklyResetsAt || d.billingPeriodEnd || cycle.endMs,
      resetKind: d.weeklyResetsAt ? 'weekly' : 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'commandcode') {
    const d = await commandcode.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const includedTotal = d.monthlyCreditsTotal != null ? d.monthlyCreditsTotal : conf.monthly
    const total = includedTotal || (d.monthlyCreditsRemaining || 0) + (d.purchasedCredits || 0)
    const used =
      d.monthlyCreditsUsed != null
        ? d.monthlyCreditsUsed
        : d.monthlyCreditsTotal != null
          ? Math.max(0, d.monthlyCreditsTotal - (d.monthlyCreditsRemaining || 0))
          : 0
    const capturedPct = d.usedPct == null ? (total > 0 ? percent((used / total) * 100) : 0) : percent(d.usedPct)
    const windows =
      d.monthlyCreditsTotal > 0
        ? [
            {
              label: 'Monthly',
              kind: 'cycle',
              usedPct: capturedPct || 0,
              resetAt: d.billingPeriodEnd || cycle.endMs,
              periodMs: null,
            },
          ]
        : []
    const urgent = windows.some(windowUrgent) || (cycle.daysLeft <= 3 && (capturedPct || 0) < 60)

    return {
      ...base,
      connected: true,
      plan: d.plan?.displayName || conf.plan,
      monthly: total || base.monthly,
      ...valueFields(total, used, Math.max(0, total - used), capturedPct, {
        label: 'live Command Code credits',
        accuracy: 'live',
      }),
      windows,
      extra: [
        { label: 'Monthly left', value: commandcode._private.formatUSD(d.monthlyCreditsRemaining || 0) },
        d.purchasedCredits > 0 ? { label: 'Purchased', value: commandcode._private.formatUSD(d.purchasedCredits) } : null,
        d.premiumMonthlyCredits > 0 ? { label: 'Premium', value: commandcode._private.formatUSD(d.premiumMonthlyCredits) } : null,
        d.opensourceMonthlyCredits > 0 ? { label: 'Open source', value: commandcode._private.formatUSD(d.opensourceMonthlyCredits) } : null,
        d.subscriptionStatus ? { label: 'Status', value: d.subscriptionStatus } : null,
      ].filter(Boolean),
      resetAt: d.billingPeriodEnd || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'crof') {
    const d = await crof.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const capturedPct = percent(d.usedPct)
    const total = d.requestsPlan || conf.monthly
    const used = d.requestsUsed || 0
    const creditPct = d.credits > 0 ? 0 : 100
    const windows = [
      {
        label: 'Requests',
        kind: 'cycle',
        usedPct: capturedPct || 0,
        resetAt: d.resetAt || cycle.endMs,
        periodMs: DAY,
      },
      {
        label: 'Credits',
        kind: 'cycle',
        usedPct: creditPct,
        resetAt: null,
        periodMs: null,
      },
    ]
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: conf.plan,
      monthly: total || base.monthly,
      ...valueFields(total, used, Math.max(0, total - used), capturedPct, {
        label: 'live Crof requests',
        accuracy: 'live',
        unit: 'requests',
      }),
      windows,
      extra: [
        { label: 'Requests left', value: String(Math.round(d.usableRequests || 0)) },
        { label: 'Credits', value: '$' + Number(d.credits || 0).toFixed(2) },
      ],
      resetAt: d.resetAt || cycle.endMs,
      resetKind: 'daily',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'venice') {
    const d = await venice.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const capturedPct = percent(d.usedPct)
    const unit = d.unit === 'diem' ? 'DIEM' : d.unit === 'dollars' ? 'dollars' : 'balance'
    const total = d.total || (d.unit === 'dollars' ? conf.monthly : null)
    const used = d.used || 0
    const left = d.remaining || 0
    const urgent = d.canConsume && left > 0 && capturedPct < 50
    return {
      ...base,
      connected: true,
      plan: d.currency || conf.plan,
      monthly: total || base.monthly,
      ...valueFields(total, used, left, capturedPct, {
        label: 'live Venice balance',
        accuracy: 'live',
        unit,
      }),
      windows: [
        {
          label: d.currency === 'USD' ? 'USD balance' : d.diemEpochAllocation ? 'DIEM epoch' : 'DIEM balance',
          kind: 'cycle',
          usedPct: capturedPct || 0,
          resetAt: null,
          periodMs: null,
        },
      ],
      extra: [
        { label: 'Balance', value: d.label },
        d.usdBalance != null ? { label: 'USD', value: '$' + Number(d.usdBalance).toFixed(2) } : null,
        d.diemBalance != null ? { label: 'DIEM', value: Number(d.diemBalance).toFixed(2) } : null,
      ].filter(Boolean),
      resetAt: cycle.endMs,
      resetKind: 'balance',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'doubao') {
    const d = await doubao.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const capturedPct = percent(d.usedPct)
    const total = d.limitRequests > 0 ? d.limitRequests : conf.monthly
    const used = d.limitRequests > 0 ? Math.max(0, d.limitRequests - d.remainingRequests) : 0
    const windows = [
      {
        label: d.limitRequests > 0 ? 'Requests' : 'API key',
        kind: 'cycle',
        usedPct: capturedPct || 0,
        resetAt: d.resetTime || null,
        periodMs: null,
      },
    ]
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      monthly: total || base.monthly,
      ...valueFields(total, used, Math.max(0, total - used), capturedPct, {
        label: d.limitRequests > 0 ? 'live Doubao requests' : 'active Doubao key',
        accuracy: 'live',
        unit: 'requests',
      }),
      windows,
      tokenUsage:
        d.totalTokens > 0
          ? {
              input: 0,
              cached: 0,
              output: d.totalTokens,
              total: d.totalTokens,
              requests: null,
              source: 'Doubao probe',
            }
          : null,
      extra: [
        d.limitRequests > 0 ? { label: 'Requests left', value: String(Math.round(d.remainingRequests || 0)) } : null,
        d.model ? { label: 'Probe model', value: d.model } : null,
        d.totalTokens ? { label: 'Probe tokens', value: String(Math.round(d.totalTokens)) } : null,
        { label: 'Source', value: 'Volcengine Ark' },
      ].filter(Boolean),
      resetAt: d.resetTime || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'deepseek') {
    const d = await deepseek.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const cap = conf.monthly > 0 ? Math.max(conf.monthly, d.balance) : d.balance
    const used = Math.max(0, cap - d.balance)
    const money = valueFromSpendLeft(used, d.balance, {
      label: 'live credit balance',
      accuracy: used > 0 ? 'inferred' : 'live',
    })
    const capturedPct = money.capturedPct || 0
    const urgent = d.balance > 0 && cycle.daysLeft <= 3 && capturedPct < 50
    return {
      ...base,
      connected: true,
      monthly: money.totalValue || base.monthly,
      ...money,
      windows: [],
      extra: [
        { label: 'Balance', value: '$' + d.balance.toFixed(2) },
        { label: 'Paid', value: '$' + (d.topped || 0).toFixed(2) },
      ],
      resetAt: cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'deepgram') {
    const d = await deepgram.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const capturedPct = 0
    const tokenTotal = d.totalTokens || 0
    return {
      ...base,
      connected: true,
      plan: d.projectCount > 1 ? `${d.projectCount} projects` : d.projectName || conf.plan,
      ...valueFields(conf.monthly, 0, conf.monthly, capturedPct, {
        label: 'live Deepgram usage',
        accuracy: 'live',
        unit: 'usage',
      }),
      windows: [
        {
          label: 'Requests',
          kind: 'cycle',
          usedPct: 0,
          resetAt: null,
          periodMs: null,
        },
      ],
      tokenUsage:
        tokenTotal > 0
          ? {
              input: d.tokensIn,
              cached: 0,
              output: d.tokensOut,
              total: tokenTotal,
              requests: d.requests,
              source: 'Deepgram usage',
            }
          : null,
      extra: [
        { label: 'Requests', value: String(Math.round(d.requests || 0)) },
        d.hours > 0 ? { label: 'Audio', value: `${Number(d.hours).toFixed(1)}h` } : null,
        d.totalHours > 0 ? { label: 'Billable', value: `${Number(d.totalHours).toFixed(1)}h` } : null,
        d.agentHours > 0 ? { label: 'Agent', value: `${Number(d.agentHours).toFixed(1)}h` } : null,
        d.ttsCharacters > 0 ? { label: 'TTS chars', value: String(Math.round(d.ttsCharacters)) } : null,
        d.start && d.end ? { label: 'Period', value: `${d.start} to ${d.end}` } : null,
      ].filter(Boolean),
      resetAt: cycle.endMs,
      resetKind: 'usage',
      urgent: false,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, false),
    }
  }

  if (id === 'stepfun') {
    const d = await stepfun.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const capturedPct = percent(d.weeklyUsedPct ?? d.fiveHourUsedPct)
    const windows = [
      {
        label: '5-hour',
        kind: '5h',
        usedPct: percent(d.fiveHourUsedPct) || 0,
        resetAt: d.fiveHourUsageResetTime,
        periodMs: 5 * 3600e3,
      },
      {
        label: 'Weekly',
        kind: '7d',
        usedPct: percent(d.weeklyUsedPct) || 0,
        resetAt: d.weeklyUsageResetTime,
        periodMs: 7 * DAY,
      },
    ]
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.planName || conf.plan,
      ...valueFromMonthly(conf, capturedPct, {
        label: 'live StepFun quota',
        accuracy: 'live',
        unit: 'quota',
      }),
      windows,
      extra: [
        { label: '5h left', value: Math.round((d.fiveHourUsageLeftRate || 0) * 100) + '%' },
        { label: 'Weekly left', value: Math.round((d.weeklyUsageLeftRate || 0) * 100) + '%' },
      ],
      resetAt: d.fiveHourUsageResetTime || d.weeklyUsageResetTime || cycle.endMs,
      resetKind: 'weekly',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'llmproxy') {
    const d = await llmproxy.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const capturedPct =
      d.minimumRemainingPercent == null ? null : percent(100 - Math.max(0, Math.min(100, d.minimumRemainingPercent)))
    const urgent = capturedPct != null && capturedPct > 85
    return {
      ...base,
      connected: true,
      plan: `${d.activeCredentialCount}/${d.credentialCount} active keys`,
      ...valueFields(null, null, null, capturedPct, {
        label: 'live LLM Proxy quota',
        accuracy: 'live',
        unit: 'requests',
      }),
      windows:
        capturedPct == null
          ? []
          : [
              {
                label: 'Quota',
                kind: 'cycle',
                usedPct: capturedPct,
                resetAt: d.nextResetAt || null,
                periodMs: null,
              },
            ],
      tokenUsage:
        d.totalTokens > 0
          ? {
              input: d.totalTokens,
              cached: 0,
              output: 0,
              total: d.totalTokens,
              requests: d.totalRequests,
              source: 'LLM Proxy quota-stats',
            }
          : null,
      extra: [
        { label: 'Providers', value: String(d.providerCount) },
        { label: 'Requests', value: String(Math.round(d.totalRequests || 0)) },
        { label: 'Tokens', value: String(Math.round(d.totalTokens || 0)) },
        d.approximateCostUSD != null ? { label: 'Approx spend', value: '$' + d.approximateCostUSD.toFixed(2) } : null,
        d.exhaustedCredentialCount > 0 ? { label: 'Exhausted', value: String(d.exhaustedCredentialCount) } : null,
        ...(d.topProviders || []).slice(0, 2).map((provider) => ({
          label: provider.name,
          value: `${Math.round(provider.requests || 0)} req`,
        })),
      ].filter(Boolean),
      resetAt: d.nextResetAt || cycle.endMs,
      resetKind: 'quota',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'ollama') {
    const d = await ollama.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const windows = [
      d.sessionUsedPercent != null
        ? {
            label: 'Session',
            kind: 'session',
            usedPct: percent(d.sessionUsedPercent) || 0,
            resetAt: d.sessionResetsAt || null,
            periodMs: null,
          }
        : null,
      d.weeklyUsedPercent != null
        ? {
            label: 'Weekly',
            kind: '7d',
            usedPct: percent(d.weeklyUsedPercent) || 0,
            resetAt: d.weeklyResetsAt || null,
            periodMs: 7 * DAY,
          }
        : null,
    ].filter(Boolean)
    const primary = windows.find((w) => w.label === 'Weekly') || windows[0]
    const capturedPct = primary ? percent(primary.usedPct) : null
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.planName || conf.plan,
      ...valueFromMonthly(conf, capturedPct, {
        label: d.source === 'api' ? 'Ollama API access' : 'live Ollama Cloud usage',
        accuracy: d.source === 'api' ? 'connected' : 'live',
      }),
      windows,
      extra: [
        d.accountEmail ? { label: 'Signed in', value: d.accountEmail } : null,
        d.modelCount != null ? { label: 'Models', value: String(d.modelCount) } : null,
        d.source ? { label: 'Source', value: d.source === 'api' ? 'API key' : 'web session' } : null,
      ].filter(Boolean),
      resetAt: primary?.resetAt || cycle.endMs,
      resetKind: primary?.kind === '7d' ? 'weekly' : 'session',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'abacus') {
    const d = await abacus.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const capturedPct = percent(d.usedPct)
    const total = d.creditsTotal || conf.monthly
    const used = d.creditsUsed || 0
    const urgent = (d.resetsAt && windowUrgent({ kind: 'cycle', resetAt: d.resetsAt, usedPct: capturedPct || 0 })) || false
    return {
      ...base,
      connected: true,
      plan: d.planName || conf.plan,
      monthly: total || base.monthly,
      ...valueFields(total, used, Math.max(0, total - used), capturedPct, {
        label: 'live Abacus AI credits',
        accuracy: 'live',
        unit: 'credits',
      }),
      windows: [
        {
          label: 'Credits',
          kind: 'cycle',
          usedPct: capturedPct || 0,
          resetAt: d.resetsAt || cycle.endMs,
          periodMs: 30 * DAY,
        },
      ],
      extra: [
        { label: 'Credits left', value: String(Math.round(d.creditsLeft || 0)) },
        { label: 'Used', value: String(Math.round(d.creditsUsed || 0)) },
      ],
      resetAt: d.resetsAt || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'zai') {
    const d = await zai.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const kindFor = (limit) => {
      if (!limit?.windowMinutes) return 'cycle'
      if (limit.windowMinutes <= 5 * 60) return '5h'
      if (limit.windowMinutes === 7 * 24 * 60) return '7d'
      return 'cycle'
    }
    const resetDescription = (limit) => (limit?.isMCPMonthlyMarker ? 'Monthly' : limit?.windowLabel || null)
    const windows = [
      d.tokenLimit
        ? {
            label: 'Tokens',
            kind: kindFor(d.tokenLimit),
            usedPct: percent(d.tokenLimit.usedPct) || 0,
            resetAt: d.tokenLimit.nextResetAt || null,
            periodMs: d.tokenLimit.windowMinutes ? d.tokenLimit.windowMinutes * 60000 : null,
            detail: resetDescription(d.tokenLimit),
          }
        : null,
      d.timeLimit
        ? {
            label: 'MCP',
            kind: 'cycle',
            usedPct: percent(d.timeLimit.usedPct) || 0,
            resetAt: d.timeLimit.nextResetAt || null,
            periodMs: d.timeLimit.isMCPMonthlyMarker ? null : d.timeLimit.windowMinutes ? d.timeLimit.windowMinutes * 60000 : null,
            detail: resetDescription(d.timeLimit),
          }
        : null,
      d.sessionTokenLimit
        ? {
            label: '5-hour',
            kind: '5h',
            usedPct: percent(d.sessionTokenLimit.usedPct) || 0,
            resetAt: d.sessionTokenLimit.nextResetAt || null,
            periodMs: d.sessionTokenLimit.windowMinutes ? d.sessionTokenLimit.windowMinutes * 60000 : 5 * 3600e3,
            detail: resetDescription(d.sessionTokenLimit),
          }
        : null,
    ].filter(Boolean)
    const primary = windows.find((w) => w.label === 'Tokens') || windows[0]
    const capturedPct = primary ? percent(primary.usedPct) : null
    const value = valueFromMonthly(conf, capturedPct, {
      label: 'live z.ai quota',
      accuracy: 'live',
      unit: 'quota',
    })
    const totalModelTokens = d.modelUsage?.totalTokens || 0
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.planName || conf.plan,
      monthly: base.monthly,
      ...value,
      windows,
      tokenUsage:
        totalModelTokens > 0
          ? {
              input: totalModelTokens,
              cached: 0,
              output: 0,
              total: totalModelTokens,
              requests: null,
              source: 'z.ai model usage',
            }
          : null,
      extra: [
        d.sessionTokenLimit ? { label: 'Session', value: `${percent(d.sessionTokenLimit.usedPct) || 0}% used` } : null,
        d.timeLimit ? { label: 'MCP', value: `${percent(d.timeLimit.usedPct) || 0}% used` } : null,
        d.tokenLimit?.usage ? { label: 'Token quota', value: String(Math.round(d.tokenLimit.usage)) } : null,
        totalModelTokens > 0 ? { label: 'Model tokens', value: String(Math.round(totalModelTokens)) } : null,
        d.modelUsage?.modelNames?.length ? { label: 'Models', value: d.modelUsage.modelNames.slice(0, 2).join(', ') } : null,
      ].filter(Boolean),
      resetAt: primary?.resetAt || cycle.endMs,
      resetKind: primary?.kind === '5h' ? '5h' : primary?.kind === '7d' ? 'weekly' : 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'factory') {
    const d = await factory.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const windows =
      d.mode === 'token-rate'
        ? [
            {
              label: '5-hour',
              kind: '5h',
              usedPct: percent(d.standard.fiveHour.usedPct) || 0,
              resetAt: d.standard.fiveHour.resetAt || null,
              periodMs: d.standard.fiveHour.periodMs,
            },
            {
              label: 'Weekly',
              kind: '7d',
              usedPct: percent(d.standard.weekly.usedPct) || 0,
              resetAt: d.standard.weekly.resetAt || null,
              periodMs: d.standard.weekly.periodMs,
            },
            {
              label: 'Monthly',
              kind: 'cycle',
              usedPct: percent(d.standard.monthly.usedPct) || 0,
              resetAt: d.standard.monthly.resetAt || null,
              periodMs: d.standard.monthly.periodMs,
            },
          ]
        : [
            {
              label: 'Standard',
              kind: 'cycle',
              usedPct: percent(d.standard.usedPct) || 0,
              resetAt: d.periodEnd || cycle.endMs,
              periodMs: null,
            },
            {
              label: 'Premium',
              kind: 'cycle',
              usedPct: percent(d.premium.usedPct) || 0,
              resetAt: d.periodEnd || cycle.endMs,
              periodMs: null,
            },
          ]
    const primary =
      windows.find((w) => w.label === 'Weekly') ||
      windows.find((w) => w.label === 'Standard') ||
      windows[0]
    const capturedPct = primary ? percent(primary.usedPct) : null
    const urgent = windows.some(windowUrgent)
    const extraBalance = d.mode === 'token-rate' ? (d.extraUsageBalanceCents || 0) / 100 : null
    const totalTokens = d.mode === 'legacy' ? d.totalUserTokens || 0 : 0
    return {
      ...base,
      connected: true,
      plan: d.planName || d.tier || conf.plan,
      ...valueFromMonthly(conf, capturedPct, {
        label: d.mode === 'token-rate' ? 'live Droid token-rate quota' : 'live Droid quota',
        accuracy: 'live',
        unit: 'quota',
      }),
      windows,
      tokenUsage:
        totalTokens > 0
          ? {
              input: totalTokens,
              cached: 0,
              output: 0,
              total: totalTokens,
              requests: null,
              source: 'Droid usage',
            }
          : null,
      extra: [
        d.organizationName ? { label: 'Org', value: d.organizationName } : null,
        d.accountEmail ? { label: 'Signed in', value: d.accountEmail } : null,
        d.mode === 'token-rate' && extraBalance ? { label: 'Extra usage', value: '$' + extraBalance.toFixed(2) } : null,
        d.mode === 'token-rate' && d.overagePreference ? { label: 'Fallback', value: d.overagePreference } : null,
        d.mode === 'legacy' ? { label: 'Standard tokens', value: String(Math.round(d.standard.userTokens || 0)) } : null,
        d.mode === 'legacy' ? { label: 'Premium tokens', value: String(Math.round(d.premium.userTokens || 0)) } : null,
      ].filter(Boolean),
      resetAt: primary?.resetAt || cycle.endMs,
      resetKind: primary?.kind === '5h' ? '5h' : primary?.kind === '7d' ? 'weekly' : 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'antigravity') {
    const d = await antigravity.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const windows = (d.windows || []).map((w) => ({
      label: w.label,
      kind: 'cycle',
      usedPct: percent(w.usedPct) || 0,
      resetAt: w.resetAt || null,
      periodMs: null,
    }))
    const primary = windows.find((w) => w.label === 'Claude') || windows[0]
    const capturedPct = primary ? percent(primary.usedPct) : null
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.accountPlan || conf.plan,
      ...valueFromMonthly(conf, capturedPct, {
        label: 'live Antigravity quota',
        accuracy: 'live',
        unit: 'quota',
      }),
      windows,
      extra: [
        d.accountEmail ? { label: 'Signed in', value: d.accountEmail } : null,
        d.projectID ? { label: 'Project', value: d.projectID } : null,
        d.modelQuotas?.length ? { label: 'Models', value: String(d.modelQuotas.length) } : null,
        ...(d.windows || []).slice(0, 2).map((w) => ({
          label: w.label,
          value: w.modelLabel,
        })),
      ].filter(Boolean),
      resetAt: primary?.resetAt || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'minimax') {
    const d = await minimax.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const windows = (d.services?.length
      ? d.services
      : [
          {
            label: 'Prompts',
            usedPct: d.usedPct,
            resetAt: d.resetsAt,
            windowMinutes: d.windowMinutes,
            usage: d.currentPrompts,
            remaining: d.remainingPrompts,
            limit: d.availablePrompts,
          },
        ]
    ).map((service) => ({
      label: service.label || 'Prompts',
      kind: service.windowMinutes <= 5 * 60 ? '5h' : service.windowMinutes >= 7 * 24 * 60 ? '7d' : 'cycle',
      usedPct: percent(service.usedPct) || 0,
      resetAt: service.resetAt || null,
      periodMs: service.windowMinutes ? service.windowMinutes * 60000 : null,
    }))
    const primary = windows.find((w) => w.label === 'Text Generation') || windows[0]
    const capturedPct = primary ? percent(primary.usedPct) : null
    const urgent = windows.some(windowUrgent)
    const billing = d.billingSummary || null
    const totalTokens = billing?.last30DaysTokens || 0
    return {
      ...base,
      connected: true,
      plan: d.planName || conf.plan,
      ...valueFromMonthly(conf, capturedPct, {
        label: 'live MiniMax quota',
        accuracy: 'live',
        unit: 'quota',
      }),
      windows,
      tokenUsage:
        totalTokens > 0
          ? {
              input: totalTokens,
              cached: 0,
              output: 0,
              total: totalTokens,
              requests: null,
              source: 'MiniMax billing',
            }
          : null,
      extra: [
        d.remainingPrompts != null ? { label: 'Prompts left', value: String(Math.round(d.remainingPrompts)) } : null,
        billing?.todayTokens ? { label: 'Today tokens', value: String(Math.round(billing.todayTokens)) } : null,
        billing?.last30DaysTokens ? { label: '30d tokens', value: String(Math.round(billing.last30DaysTokens)) } : null,
        billing?.todayCash ? { label: 'Today spend', value: '$' + Number(billing.todayCash).toFixed(2) } : null,
        billing?.last30DaysCash ? { label: '30d spend', value: '$' + Number(billing.last30DaysCash).toFixed(2) } : null,
        billing?.topModel ? { label: 'Top model', value: billing.topModel.name } : null,
        billing?.topMethod ? { label: 'Top method', value: billing.topMethod.name } : null,
      ].filter(Boolean),
      resetAt: primary?.resetAt || cycle.endMs,
      resetKind: primary?.kind === '5h' ? '5h' : primary?.kind === '7d' ? 'weekly' : 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'manus') {
    const d = await manus.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const windows = [
      d.proMonthlyCredits > 0
        ? {
            label: 'Monthly credits',
            kind: 'cycle',
            usedPct: percent(d.monthlyUsedPct) || 0,
            resetAt: cycle.endMs,
            periodMs: null,
          }
        : null,
      d.maxRefreshCredits > 0
        ? {
            label: 'Daily refresh',
            kind: 'cycle',
            usedPct: percent(d.refreshUsedPct) || 0,
            resetAt: d.nextRefreshTime || null,
            periodMs: 24 * 60 * 60000,
          }
        : null,
    ].filter(Boolean)
    const primary = windows[0]
    const capturedPct = primary ? percent(primary.usedPct) : null
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.proMonthlyCredits > 0 ? conf.plan : 'Free',
      ...valueFromMonthly(conf, capturedPct, {
        label: 'live Manus credits',
        accuracy: 'live',
        unit: 'credits',
      }),
      windows,
      extra: [
        { label: 'Balance', value: `${Math.round(d.totalCredits || 0).toLocaleString('en-US')} credits` },
        d.freeCredits ? { label: 'Free', value: String(Math.round(d.freeCredits)) } : null,
        d.periodicCredits != null ? { label: 'Periodic left', value: String(Math.round(d.periodicCredits)) } : null,
        d.refreshCredits != null ? { label: 'Refresh left', value: String(Math.round(d.refreshCredits)) } : null,
        d.addonCredits ? { label: 'Add-on', value: String(Math.round(d.addonCredits)) } : null,
        d.eventCredits ? { label: 'Event', value: String(Math.round(d.eventCredits)) } : null,
        d.cookieName ? { label: 'Cookie', value: d.cookieName } : null,
      ].filter(Boolean),
      resetAt: primary?.resetAt || d.nextRefreshTime || cycle.endMs,
      resetKind: primary?.label === 'Daily refresh' ? 'daily' : 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'vertexai') {
    const d = await vertexai.read(tokenOptions)
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const quotaPct = d.quota?.requestsUsedPercent != null ? percent(d.quota.requestsUsedPercent) : null
    const tokenTotal = d.tokenUsage?.total || 0
    const windows = [
      quotaPct != null
        ? {
            label: 'Quota usage',
            kind: 'cycle',
            usedPct: quotaPct,
            resetAt: null,
            periodMs: 24 * 60 * 60000,
          }
        : null,
    ].filter(Boolean)
    const capturedPct = quotaPct
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.projectID || conf.plan,
      ...valueFromMonthly(conf, capturedPct, {
        label: d.quota ? 'live Vertex quota' : 'Vertex token logs',
        accuracy: d.quota ? 'live' : 'local',
        unit: d.quota ? 'quota' : 'tokens',
      }),
      windows,
      tokenUsage:
        tokenTotal > 0
          ? {
              input: d.tokenUsage.input,
              cached: d.tokenUsage.cached,
              output: d.tokenUsage.output,
              total: tokenTotal,
              requests: d.tokenUsage.requests,
              historyDays: d.tokenUsage.historyDays,
              dailyBreakdown: d.tokenUsage.dailyBreakdown || [],
              modelBreakdowns: d.tokenUsage.modelBreakdowns || [],
              source: d.tokenUsage.source || 'Vertex AI logs',
            }
          : null,
      extra: [
        d.email ? { label: 'Signed in', value: d.email } : null,
        d.projectID ? { label: 'Project', value: d.projectID } : null,
        d.quota?.matchedSeries ? { label: 'Quota series', value: String(d.quota.matchedSeries) } : null,
        tokenTotal > 0 ? { label: 'Tokens', value: String(Math.round(tokenTotal)) } : null,
        d.tokenUsage?.requests ? { label: 'Requests', value: String(Math.round(d.tokenUsage.requests)) } : null,
        d.tokenUsage?.modelNames?.length ? { label: 'Models', value: d.tokenUsage.modelNames.slice(0, 2).join(', ') } : null,
      ].filter(Boolean),
      resetAt: cycle.endMs,
      resetKind: d.quota ? 'quota' : 'usage',
      urgent,
      activity: activityState(d.lastActive),
      lastUpdatedAt: activityLastUpdatedAt(d.lastActive),
      error: d.error || null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'synthetic') {
    const d = await synthetic.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const slots = d.slottedQuotas || d.quotas || []
    const windows = slots
      .map((quota, index) => {
        if (!quota) return null
        const fallback = ['Five-hour quota', 'Weekly tokens', 'Search hourly'][index] || 'Quota'
        const minutes = quota.windowMinutes || (index === 0 ? 5 * 60 : index === 1 ? 7 * 24 * 60 : index === 2 ? 60 : null)
        return {
          label: quota.label || fallback,
          kind: minutes <= 5 * 60 ? '5h' : minutes >= 7 * 24 * 60 ? '7d' : 'cycle',
          usedPct: percent(quota.usedPercent) || 0,
          resetAt: quota.resetsAt || null,
          periodMs: minutes ? minutes * 60000 : null,
        }
      })
      .filter(Boolean)
    const primary = windows.find((w) => w.kind === '5h') || windows.find((w) => w.kind === '7d') || windows[0]
    const capturedPct = primary ? percent(primary.usedPct) : null
    const urgent = windows.some(windowUrgent)
    const cost = (d.quotas || []).find((quota) => quota.cost)?.cost || null
    return {
      ...base,
      connected: true,
      plan: d.planName || conf.plan,
      ...valueFromMonthly(conf, capturedPct, {
        label: 'live Synthetic quota',
        accuracy: 'live',
        unit: 'quota',
      }),
      windows,
      extra: [
        cost ? { label: 'Weekly credits', value: `$${Number(cost.used || 0).toFixed(2)} / $${Number(cost.limit || 0).toFixed(2)}` } : null,
        cost?.nextRegenAmount ? { label: 'Next regen', value: `$${Number(cost.nextRegenAmount).toFixed(2)}` } : null,
        ...(d.quotas || []).slice(0, 3).map((quota) => {
          const detail =
            quota.remaining != null && quota.limit != null
              ? `${Math.round(quota.remaining)} / ${Math.round(quota.limit)} left`
              : `${percent(quota.usedPercent) || 0}% used`
          return { label: quota.label || 'Quota', value: detail }
        }),
      ].filter(Boolean),
      resetAt: primary?.resetAt || cycle.endMs,
      resetKind: primary?.kind === '5h' ? '5h' : primary?.kind === '7d' ? 'weekly' : 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'mimo') {
    const d = await mimo.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const tokenPct = d.tokenLimit > 0 ? percent(d.tokenPercent * 100) : null
    const cap = conf.monthly > 0 ? Math.max(conf.monthly, d.balance) : d.balance
    const used = Math.max(0, cap - d.balance)
    const money = valueFromSpendLeft(used, d.balance, {
      label: 'live MiMo balance',
      accuracy: used > 0 ? 'inferred' : 'live',
      unit: 'credits',
    })
    const windows = [
      d.tokenLimit > 0
        ? {
            label: 'Token plan',
            kind: 'cycle',
            usedPct: tokenPct || 0,
            resetAt: d.planPeriodEnd || null,
            periodMs: null,
          }
        : null,
    ].filter(Boolean)
    const capturedPct = tokenPct ?? money.capturedPct ?? 0
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.planCode ? d.planCode[0].toUpperCase() + d.planCode.slice(1) : conf.plan,
      monthly: money.totalValue || base.monthly,
      ...money,
      capturedPct,
      remainingPct: Math.max(0, 100 - capturedPct),
      windows,
      tokenUsage:
        d.tokenUsed > 0
          ? {
              input: d.tokenUsed,
              cached: 0,
              output: 0,
              total: d.tokenUsed,
              requests: null,
              source: 'MiMo token plan',
            }
          : null,
      extra: [
        { label: 'Balance', value: `${d.currency} ${Number(d.balance || 0).toFixed(2)}` },
        d.tokenLimit > 0 ? { label: 'Credits used', value: `${Math.round(d.tokenUsed).toLocaleString('en-US')} / ${Math.round(d.tokenLimit).toLocaleString('en-US')}` } : null,
        d.planExpired ? { label: 'Plan', value: 'Expired' } : null,
      ].filter(Boolean),
      resetAt: d.planPeriodEnd || cycle.endMs,
      resetKind: d.planPeriodEnd ? 'cycle' : 'balance',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'bedrock') {
    const d = await bedrock.read()
    if (!d.connected) {
      return {
        ...base,
        connected: false,
        activity: 'none',
        needsKey: true,
        error: d.error || null,
      }
    }
    const budget = d.monthlyBudget > 0 ? d.monthlyBudget : Math.max(conf.monthly, d.monthlySpend || 0)
    const spend = Math.max(0, d.monthlySpend || 0)
    const capturedPct = budget > 0 ? percent((spend / budget) * 100) : null
    const resetAt = bedrock._private.endOfCurrentMonth()
    const windows = d.monthlyBudget > 0
      ? [
          {
            label: 'Monthly budget',
            kind: 'cycle',
            usedPct: capturedPct || 0,
            resetAt,
            periodMs: null,
          },
        ]
      : []
    const urgent = windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.region || conf.plan,
      monthly: budget || base.monthly,
      ...valueFields(budget, spend, Math.max(0, budget - spend), capturedPct, {
        label: d.monthlyBudget > 0 ? 'live Bedrock budget' : 'live Bedrock spend',
        accuracy: 'live',
      }),
      windows,
      extra: [
        { label: 'Month spend', value: '$' + spend.toFixed(2) },
        d.monthlyBudget > 0 ? { label: 'Budget', value: '$' + Number(d.monthlyBudget).toFixed(2) } : null,
        d.region ? { label: 'Region', value: d.region } : null,
        { label: 'Source', value: 'AWS Cost Explorer' },
      ].filter(Boolean),
      resetAt,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'amp') {
    const d = await amp.read()
    if (!d.connected) return { ...base, connected: false, activity: 'none', error: d.error || null }
    const isWeb = d.source === 'Amp web session'
    const cap = isWeb ? d.quota : conf.monthly > 0 ? Math.max(conf.monthly, d.balance) : d.balance
    const used = isWeb ? d.used : Math.max(0, cap - d.balance)
    const left = isWeb ? d.remaining : d.balance
    const money = isWeb
      ? valueFields(cap, used, left, d.usedPct, {
          label: 'Amp web session',
          accuracy: 'live',
          unit: 'credits',
        })
      : valueFromSpendLeft(used, left, {
          label: 'live credit balance',
          accuracy: used > 0 ? 'inferred' : 'live',
        })
    const capturedPct = money.capturedPct || 0
    const urgent = isWeb ? d.resetAt && d.resetAt - Date.now() < DAY && capturedPct < 70 : cycle.daysLeft <= 3 && capturedPct < 50
    return {
      ...base,
      plan: d.plan || base.plan,
      connected: true,
      monthly: money.totalValue || base.monthly,
      ...money,
      windows: isWeb
        ? [{
            label: 'Amp Free',
            kind: 'cycle',
            usedPct: capturedPct,
            resetAt: d.resetAt,
            periodMs: d.windowHours > 0 ? d.windowHours * 3600000 : null,
          }]
        : [],
      extra: [
        isWeb ? { label: 'Credits left', value: Number(d.remaining || 0).toFixed(0) } : { label: 'Credits', value: '$' + d.balance.toFixed(2) },
        isWeb && d.hourlyReplenishment ? { label: 'Regen/hr', value: Number(d.hourlyReplenishment).toFixed(0) } : null,
        d.email ? { label: 'Signed in', value: d.email } : null,
        d.source ? { label: 'Source', value: d.source === 'Amp web session' ? 'web session' : 'CLI' } : null,
      ].filter(Boolean),
      resetAt: d.resetAt || cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: 'live',
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  return { ...base, connected: false, activity: 'none', manual: true }
}

function maxxRating(avg) {
  if (avg >= 0.9) return { stars: 5, verdict: 'Elite maxxer. Big AI fears you.' }
  if (avg >= 0.72) return { stars: 4, verdict: 'Solid maxxing. Ship harder.' }
  if (avg >= 0.55) return { stars: 3, verdict: 'Decent. Resets are watching.' }
  if (avg >= 0.35) return { stars: 2, verdict: 'Leaking value. Pick a mission.' }
  return { stars: 1, verdict: 'Donating to Big AI. Fix it.' }
}

async function snapshot() {
  const snapStart = Date.now()
  const config = loadConfig()
  const cycle = billingCycle(config.billingDay)
  try {
    await withTimeout(tokenCost.refreshPricing(), 8000, 'tokenCost.refreshPricing')
  } catch (err) {
    logger.warn('snapshot', 'pricing refresh skipped', { error: err && err.message })
  }

  const enabled = Object.entries(config.providers)
    .filter(([, c]) => c.enabled)
    .sort(([a], [b]) => (PROVIDER_BUILD_PRIORITY[a] ?? 10) - (PROVIDER_BUILD_PRIORITY[b] ?? 10))
  logger.info('snapshot', 'building', { enabledCount: enabled.length })
  let providers = (await Promise.all(enabled.map(([id, c]) => buildProviderSafe(id, c, cycle, config)))).map((p) => addProviderPace(p))
  providers = applyCachedProviderFallbacks(providers).map((p) => addProviderPace(p))
  providers = addProviderStorageFootprints(providers)
  try {
    providers = await withTimeout(addProviderStatuses(providers), STATUS_TIMEOUT_MS, 'addProviderStatuses')
  } catch (err) {
    logger.warn('snapshot', 'status fetch skipped', { error: err && err.message })
  }
  providers = providers.map((p) => (
    p.tokenUsage ? { ...p, tokenUsage: tokenCost.withTokenCost(p.id, p.tokenUsage) } : p
  ))
  const totals = totalsFromProviders(providers)
  const tokenTotals = {
    ...tokenTotalsFromProviders(providers),
    dailyCost: tokenDailyCostFromProviders(providers),
    historyDays: config.tokenHistoryDays,
  }
  const storageTotals = storageTotalsFromProviders(providers)
  const history = usageHistory.recordSnapshot(providers, { totals, tokenTotals })
  providers = usageHistory.applyInsights(providers, history)
  providers = addProviderSourceLabels(providers)
  providers = providers.map((provider) => (
    provider?.connected && !provider.lastUpdatedAt ? { ...provider, lastUpdatedAt: snapStart } : provider
  ))
  // Honor user-defined ordering. Unknown ids drop to end in original order.
  const orderIndex = new Map((config.providerOrder || []).map((id, i) => [id, i]))
  providers = providers.slice().sort((a, b) => {
    const ai = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER
    const bi = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER
    return ai - bi
  })
  const historySummary = usageHistory.historySummary(history)
  const valueTrend = usageHistory.valueTrendSummary(history)
  const tokenTrend = usageHistory.tokenTrendSummary(history)
  const avg = totals.totalValue ? totals.spent / totals.totalValue : 0
  const maxxTarget = maxxTargetFromProviders(providers)
  const resetQueue = resetQueueFromProviders(providers)
  logger.info('snapshot', 'done', { ms: Date.now() - snapStart, providerCount: providers.length })

  return {
    generatedAt: Date.now(),
    cycle: { label: cycle.label, daysLeft: cycle.daysLeft, totalDays: cycle.totalDays },
    totals: {
      monthly: totals.totalValue,
      totalValue: totals.totalValue,
      captured: totals.spent,
      spent: totals.spent,
      burned: totals.left,
      remaining: totals.left,
      left: totals.left,
      capturedPct: totals.capturedPct,
      remainingPct: totals.remainingPct,
      planCount: totals.planCount,
      estimatedPlanCount: totals.estimatedPlanCount,
      tokens: tokenTotals,
      tokenTrend,
      storage: storageTotals,
      history: historySummary,
      trend: valueTrend,
      resetQueue,
    },
    rating: maxxRating(avg),
    maxxTarget,
    providers,
  }
}

function totalsFromProviders(providers) {
  const valued = providers.filter((p) => p.connected && p.totalValue != null && p.spentValue != null && p.leftValue != null)
  const totalValue = valued.reduce((s, p) => s + moneyNumber(p.totalValue), 0)
  const spent = valued.reduce((s, p) => s + moneyNumber(p.spentValue), 0)
  const left = valued.reduce((s, p) => s + moneyNumber(p.leftValue), 0)
  const capturedPct = totalValue ? percent((spent / totalValue) * 100) : 0
  return {
    totalValue,
    spent,
    left,
    capturedPct,
    remainingPct: totalValue ? Math.max(0, 100 - capturedPct) : 100,
    planCount: valued.length,
    estimatedPlanCount: valued.filter((p) => p.valueAccuracy === 'estimate').length,
  }
}

function tokenTotalsFromProviders(providers) {
  const tracked = providers.filter((p) => p.connected && p.tokenUsage && Number.isFinite(p.tokenUsage.total))
  const totals = tracked.reduce(
    (acc, p) => {
      acc.input += moneyNumber(p.tokenUsage.input)
      acc.cached += moneyNumber(p.tokenUsage.cached)
      acc.output += moneyNumber(p.tokenUsage.output)
      acc.total += moneyNumber(p.tokenUsage.total)
      if (Number.isFinite(Number(p.tokenUsage.costUSD))) {
        acc.costUSD += moneyNumber(p.tokenUsage.costUSD)
        acc.costProviderCount += 1
      }
      return acc
    },
    { input: 0, cached: 0, output: 0, total: 0, costUSD: 0, costProviderCount: 0 },
  )
  return {
    ...totals,
    costUSD: totals.costProviderCount ? totals.costUSD : null,
    providerCount: tracked.length,
  }
}

function dayKeyFromRow(row) {
  return row?.date || row?.dayKey || null
}

function tokenDailyCostFromProviders(providers) {
  const byDay = new Map()
  for (const provider of providers || []) {
    if (!provider?.connected || !provider.tokenUsage || !Array.isArray(provider.tokenUsage.dailyBreakdown)) continue
    for (const row of provider.tokenUsage.dailyBreakdown) {
      const dayKey = dayKeyFromRow(row)
      if (!dayKey || Number(row?.total) <= 0) continue
      const day =
        byDay.get(dayKey) || {
          dayKey,
          total: 0,
          input: 0,
          cached: 0,
          output: 0,
          costUSD: 0,
          providerCount: 0,
          costProviderCount: 0,
          providers: new Set(),
          costProviders: new Set(),
        }
      day.total += moneyNumber(row.total)
      day.input += moneyNumber(row.input)
      day.cached += moneyNumber(row.cached)
      day.output += moneyNumber(row.output)
      day.providers.add(provider.id)
      if (Number.isFinite(Number(row.costUSD))) {
        day.costUSD += moneyNumber(row.costUSD)
        day.costProviders.add(provider.id)
      }
      byDay.set(dayKey, day)
    }
  }
  const days = [...byDay.values()]
    .map((day) => ({
      dayKey: day.dayKey,
      total: day.total,
      input: day.input,
      cached: day.cached,
      output: day.output,
      costUSD: day.costProviders.size ? day.costUSD : null,
      providerCount: day.providers.size,
      costProviderCount: day.costProviders.size,
    }))
    .sort((a, b) => String(b.dayKey).localeCompare(String(a.dayKey)))
  if (!days.length) return null
  const latest = days[0]
  const previous = days[1] || null
  const latestCost = Number(latest.costUSD)
  const previousCost = Number(previous?.costUSD)
  return {
    days: days.slice(0, 14),
    latest,
    previous,
    deltaTokens: previous ? Number(latest.total) - Number(previous.total) : null,
    deltaCostUSD: Number.isFinite(latestCost) && Number.isFinite(previousCost) ? latestCost - previousCost : null,
    providerCount: Math.max(...days.map((day) => day.providerCount)),
    costProviderCount: Math.max(...days.map((day) => day.costProviderCount)),
  }
}

module.exports = {
  snapshot,
  _private: {
    valueFromMonthly,
    valueFromSpendLeft,
    totalsFromProviders,
    tokenTotalsFromProviders,
    tokenDailyCostFromProviders,
    paceForWindow,
    addProviderPace,
    maxxTargetFromProviders,
    addProviderStorageFootprints,
    addProviderStatuses,
    storageTotalsFromProviders,
    byteCount,
    sourceLabelFromProvider,
    addProviderSourceLabels,
    applyCachedProviderFallbacks,
    providerHasUsefulUsage,
    resetQueueFromProviders,
  },
}
