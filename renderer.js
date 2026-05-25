const ACCENT = {
  claude: '#ff7d4d',
  codex: '#cbd0c0',
  openai: '#10a37f',
  azureopenai: '#0078d4',
  cursor: '#00bfa5',
  copilot: '#a855f7',
  windsurf: '#34e8bb',
  kiro: '#ff8a3d',
  opencode: '#3b82f6',
  opencodego: '#2563eb',
  alibaba: '#ff6a00',
  augment: '#6366f1',
  jetbrains: '#ff3399',
  warp: '#938bb4',
  elevenlabs: '#111111',
  kilo: '#f27027',
  kimi: '#e8e8e8',
  moonshot: '#7c3aed',
  kimik2: '#4c00ff',
  doubao: '#f04438',
  grok: '#cfcfcf',
  groq: '#f55036',
  gemini: '#4f8cff',
  openrouter: '#9bb8ff',
  perplexity: '#20d5c7',
  mistral: '#ff500f',
  codebuff: '#44ff00',
  commandcode: '#f4f4f0',
  crof: '#66f05d',
  venice: '#00d3b7',
  deepseek: '#4d9cff',
  deepgram: '#6467f2',
  stepfun: '#2196f3',
  llmproxy: '#24b47e',
  ollama: '#888888',
  abacus: '#38bdf8',
  amp: '#ffb13d',
  factory: '#ff6b35',
  antigravity: '#60ba7e',
  minimax: '#fe603c',
  manus: '#34322d',
  vertexai: '#4285f4',
  synthetic: '#141414',
  mimo: '#ff6900',
  bedrock: '#ff9900',
  zai: '#e85a6a',
}
const GLYPH = {
  claude: '✦',
  codex: '◍',
  openai: 'AI',
  azureopenai: 'AZ',
  cursor: 'C',
  copilot: 'CP',
  windsurf: 'W',
  kiro: 'KR',
  opencode: 'OC',
  opencodego: 'GO',
  alibaba: 'AL',
  augment: 'AG',
  jetbrains: 'JB',
  warp: 'WP',
  elevenlabs: '11',
  kilo: 'KL',
  kimi: 'K',
  moonshot: 'MS',
  kimik2: 'K2',
  doubao: 'DB',
  grok: '⊛',
  groq: 'GQ',
  gemini: '✧',
  openrouter: '⇄',
  perplexity: 'PX',
  mistral: 'M',
  codebuff: 'CB',
  commandcode: 'CC',
  crof: 'CR',
  venice: 'VE',
  deepseek: '◐',
  deepgram: 'DG',
  stepfun: 'SF',
  llmproxy: 'LP',
  ollama: 'OL',
  abacus: 'AB',
  amp: '⚡',
  factory: 'D',
  antigravity: 'AG',
  minimax: 'MM',
  manus: 'M',
  vertexai: 'V',
  synthetic: 'S',
  mimo: 'MI',
  bedrock: 'AWS',
  zai: 'Z',
}
const PROVIDER_ICON = {
  claude: 'claude.svg',
  codex: 'openai.svg',
  openai: 'openai.svg',
  azureopenai: null,
  cursor: null,
  copilot: null,
  windsurf: null,
  kiro: null,
  opencode: null,
  opencodego: null,
  alibaba: null,
  augment: null,
  jetbrains: null,
  warp: null,
  elevenlabs: null,
  kilo: null,
  kimi: 'kimi.svg',
  moonshot: null,
  kimik2: null,
  doubao: null,
  grok: 'grok.svg',
  groq: null,
  gemini: 'gemini.svg',
  openrouter: 'openrouter.svg',
  perplexity: null,
  mistral: null,
  codebuff: null,
  commandcode: null,
  crof: null,
  venice: null,
  deepseek: 'deepseek.svg',
  deepgram: null,
  stepfun: null,
  llmproxy: null,
  ollama: null,
  abacus: null,
  amp: 'amp.svg',
  factory: null,
  antigravity: null,
  minimax: null,
  manus: null,
  vertexai: null,
  synthetic: null,
  mimo: null,
  bedrock: null,
  zai: null,
}
// Providers wired by user-pasted secrets (API key, cookie header, etc.).
const KEY_PROVIDERS = new Set([
  'openai',
  'azureopenai',
  'cursor',
  'copilot',
  'opencode',
  'opencodego',
  'alibaba',
  'augment',
  'warp',
  'elevenlabs',
  'kilo',
  'openrouter',
  'groq',
  'perplexity',
  'mistral',
  'codebuff',
  'commandcode',
  'crof',
  'venice',
  'moonshot',
  'kimik2',
  'doubao',
  'deepseek',
  'deepgram',
  'stepfun',
  'llmproxy',
  'ollama',
  'abacus',
  'factory',
  'antigravity',
  'minimax',
  'manus',
  'vertexai',
  'synthetic',
  'mimo',
  'bedrock',
  'zai',
])

const $ = (id) => document.getElementById(id)
let snap = null
const expandedProviders = new Set()
let refreshingProvider = null
let viewMode = 'usage'

function money(n) {
  const v = Math.round(n)
  return '$' + v.toLocaleString('en-US')
}

function moneyExact(n) {
  return '$' + n.toFixed(2)
}

function tokens(n) {
  const v = Math.round(Number(n) || 0)
  const compact = (value, suffix) => value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, '') + suffix
  if (v >= 1000000) return compact(v / 1000000, 'M')
  if (v >= 1000) return compact(v / 1000, 'K')
  return v.toLocaleString('en-US')
}

function moneyMaybeExact(n) {
  return typeof n === 'number' && Number.isFinite(n) ? moneyExact(n) : '—'
}

function h(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function countdown(resetAt) {
  if (!resetAt) return '—'
  let s = Math.floor((resetAt - Date.now()) / 1000)
  if (s <= 0) return 'resetting'
  const d = Math.floor(s / 86400)
  s -= d * 86400
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  const pad = (n) => String(n).padStart(2, '0')
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`
  return `${pad(h)}h ${pad(m)}m ${pad(s % 60)}s`
}

function starRow(stars) {
  let out = ''
  for (let i = 0; i < 5; i++) {
    out += `<span class="${i < stars ? 'on' : 'off'}">★</span>`
  }
  return out
}

function providerIcon(id, fallback) {
  const icon = PROVIDER_ICON[id]
  if (!icon) return `<span class="prov-icon">${h(fallback)}</span>`
  return `<span class="prov-icon has-img provider-${h(id)}"><img src="assets/providers/${h(icon)}" alt="" /></span>`
}

function usageTone(pct) {
  if (pct >= 90) return 'usage-max'
  if (pct >= 75) return 'usage-hot'
  if (pct >= 50) return 'usage-warm'
  return 'usage-good'
}

function windowRow(w) {
  const usedPct = Math.max(0, Math.min(100, Math.round(w.usedPct || 0)))
  const leftPct = Math.max(0, 100 - usedPct)
  const left = w.resetAt ? w.resetAt - Date.now() : Infinity
  const urgent =
    w.resetAt &&
    ((w.kind === '5h' && left < 90 * 60000 && w.usedPct < 50) ||
      (w.kind !== '5h' && left < 2 * 86400000 && w.usedPct < 60))
  const kindLabel = w.kind === '5h' ? '5-hour window' : w.kind === 'cycle' ? 'billing cycle' : '7-day window'
  return `
      <div class="win">
        <div class="win-head">
        <span class="activity-dot live"></span>${h(w.label)}
        <span class="win-kind">${kindLabel}</span>
      </div>
      <div class="win-bar"><span class="${usageTone(usedPct)}" style="width:${usedPct}%"></span></div>
      <div class="win-foot">
        <span><b>${usedPct}%</b> used · ${leftPct}% left</span>
        <span class="reset ${urgent ? 'urgent' : ''} mono" data-reset="${w.resetAt || ''}">
          ${countdown(w.resetAt)}
        </span>
      </div>
    </div>`
}

function providerCard(p) {
  const accent = ACCENT[p.id] || '#8b8f84'
  const glyph = GLYPH[p.id] || p.name[0]
  const refreshing = refreshingProvider === p.id
  const refreshButton = `
    <button class="prov-refresh ${refreshing ? 'checking' : ''}" data-provider-refresh="${h(p.id)}" aria-label="Refresh ${h(p.name)} usage" ${refreshing ? 'disabled' : ''}>
      ${ICON_REFRESH}
    </button>`

  if (!p.connected) {
    const msg = p.manual
      ? 'No local CLI. Tracked manually — set its cost in settings.'
      : p.error || 'Not detected on this Mac. Use its CLI once to connect.'
    return `
      <div class="prov off" style="--accent:${accent}">
        <div class="prov-top">
          ${providerIcon(p.id, glyph)}
          <span class="prov-id">
            <span class="prov-name">${h(p.name)}</span>
            <span class="prov-sub">${h(p.plan)}</span>
          </span>
          ${refreshButton}
        </div>
        <div class="prov-off-msg">${h(msg)}</div>
      </div>`
  }

  const usedPct = p.capturedPct == null ? null : Math.max(0, Math.min(100, Math.round(p.capturedPct)))
  const pct = usedPct == null ? '—' : `${usedPct}%`
  const hasWindows = p.windows && p.windows.length
  const expanded = expandedProviders.has(p.id)

  let body = ''
  if (p.error) {
    body = `<div class="prov-error">⚠ ${h(p.error)}</div>`
  } else if (expanded && hasWindows) {
    body = `<div class="win-list">${p.windows.map(windowRow).join('')}</div>`
  } else if (expanded) {
    body = `
      <div class="prov-reset">
        <span>${p.resetKind === 'weekly' ? 'Weekly limit resets' : 'Plan renews'}</span>
        <span class="reset-chip ${p.urgent ? 'urgent' : ''} mono" data-reset="${p.resetAt || ''}">
          ${countdown(p.resetAt)}
        </span>
      </div>`
  }

  const extra = (p.extra || [])
    .map((d) => `<span>${h(d.label)} <b>${h(d.value)}</b></span>`)
    .join('')
  const meter = `<div class="prov-meter"><span class="${usageTone(usedPct || 0)}" style="width:${usedPct || 0}%"></span></div>`
  const tokenUsage = p.tokenUsage || null
  const showTokens = viewMode === 'tokens'
  const hasTokenSource = tokenUsage && Number.isFinite(Number(tokenUsage.total))
  const usageLabel = showTokens ? 'tokens' : p.usageLabel || 'used'
  const pctDisplay = showTokens ? (hasTokenSource ? tokens(tokenUsage.total) : '—') : pct
  const expandLabel = expanded ? 'Collapse details' : 'Show details'

  return `
    <div class="prov ${expanded ? 'open' : ''} ${p.urgent ? 'urgent' : ''}" style="--accent:${accent}">
      <div class="prov-top">
        ${providerIcon(p.id, glyph)}
        <span class="prov-id">
          <span class="prov-name">${h(p.name)}</span>
          <span class="prov-sub">
            <span class="activity-dot ${p.activity}"></span>
            ${h(p.plan)}
          </span>
        </span>
        <span class="prov-pct">
          <span class="pn mono">${pctDisplay}</span>
          <span class="pl">${h(usageLabel)}</span>
        </span>
        ${refreshButton}
        <button class="prov-expand" data-provider-toggle="${h(p.id)}" aria-label="${expandLabel} for ${h(p.name)}" aria-expanded="${expanded}">
          ${expanded ? ICON_CHEVRON_UP : ICON_CHEVRON_DOWN}
        </button>
      </div>
      ${showTokens ? '' : meter}
      ${body}
      ${
        expanded
          ? `<div class="prov-stats"><span>Measure <b>${h(p.valueLabel || 'usage')}</b></span>${extra}</div>`
          : ''
      }
    </div>`
}

function render() {
  if (!snap) return
  const t = snap.totals
  $('cycle-pill').textContent = `${snap.cycle.label} · ${snap.cycle.daysLeft}d left`
  const tokenTotals = t.tokens || { input: 0, cached: 0, output: 0, total: 0, providerCount: 0 }
  const showTokens = viewMode === 'tokens'
  $('mode-usage').classList.toggle('active', !showTokens)
  $('mode-tokens').classList.toggle('active', showTokens)
  $('receipt-meter').hidden = showTokens
  $('t-captured').textContent = showTokens ? tokens(tokenTotals.total) : money(t.spent ?? t.captured)
  $('t-burned').textContent = showTokens ? tokens(tokenTotals.input) : money(t.left ?? t.remaining ?? t.burned)
  $('t-runway').textContent = showTokens ? tokens(tokenTotals.output) : fmtRunway(combinedRunwayMs())
  $('t-captured-label').textContent = showTokens ? 'total tokens' : 'spent value'
  $('t-burned-label').textContent = showTokens ? 'input tokens' : 'left to maxx'
  $('t-runway-label').textContent = showTokens ? 'output tokens' : 'time left to maxx'
  $('t-meter').style.width = (t.capturedPct || 0) + '%'
  $('t-meter').className = usageTone(t.capturedPct || 0)
  $('t-stars').innerHTML = starRow(snap.rating.stars)
  $('t-verdict').textContent = snap.rating.verdict
  const estimates = t.estimatedPlanCount ? ` · ${t.estimatedPlanCount} estimated` : ''
  $('foot-left').textContent = showTokens
    ? tokenTotals.providerCount
      ? `${tokens(tokenTotals.total)} tokens across ${tokenTotals.providerCount} tracked plans`
      : 'No token sources yet'
    : `${money(t.left ?? t.remaining)} left · ${money(t.spent ?? t.captured)} spent across ${t.planCount} detected plans${estimates}`
  $('list').innerHTML = snap.providers.map(providerCard).join('')
  if (!showTokens) renderRunway()
}

// Combined runway = sum of each connected provider's soonest window reset.
// That is the total time banked across the whole stack before value burns.
function combinedRunwayMs() {
  if (!snap) return 0
  let total = 0
  for (const p of snap.providers) {
    if (!p.connected) continue
    let soonest = Infinity
    for (const w of p.windows || []) {
      if (w.resetAt) soonest = Math.min(soonest, w.resetAt - Date.now())
    }
    if (soonest === Infinity && p.resetAt) soonest = p.resetAt - Date.now()
    if (Number.isFinite(soonest) && soonest > 0) total += soonest
  }
  return total
}

function fmtRunway(ms) {
  if (ms <= 0) return '0h'
  let s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  s -= d * 86400
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function renderRunway() {
  if (viewMode === 'tokens') return
  const el = document.getElementById('t-runway')
  if (el) el.textContent = fmtRunway(combinedRunwayMs())
}

function tickCountdowns() {
  document.querySelectorAll('[data-reset]').forEach((el) => {
    const r = Number(el.dataset.reset)
    if (r) el.textContent = countdown(r)
  })
  renderRunway()
}

/* ---------- icons ---------- */
const ICON_REFRESH = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 3.5v3h-3"/><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7l1.8 1.7"/></svg>`
const ICON_CHEVRON_DOWN = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6 8 10.5 12.5 6"/></svg>`
const ICON_CHEVRON_UP = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 10 8 5.5 12.5 10"/></svg>`

/* ---------- settings ---------- */
let config = null
let apiKeyState = {}

function settingsRow(id, p) {
  const accent = ACCENT[id] || '#8b8f84'
  const glyph = GLYPH[id] || p.name[0]
  const detected = snap?.providers?.find((provider) => provider.id === id)
  const connected = !!detected?.connected
  const plan = detected?.plan || p.plan
  const isKey = KEY_PROVIDERS.has(id)
  const hasKey = !!apiKeyState[id]
  let state
  if (connected) state = 'detected'
  else if (isKey && !hasKey)
    state =
      id === 'cursor' || id === 'opencode' || id === 'opencodego' || id === 'alibaba' || id === 'ollama' || id === 'abacus' || id === 'factory' || id === 'augment' || id === 'perplexity' || id === 'mimo'
        ? 'add cookie'
        : 'add API key'
  else if (isKey && hasKey)
    state =
      id === 'cursor' || id === 'opencode' || id === 'opencodego' || id === 'alibaba' || id === 'ollama' || id === 'abacus' || id === 'factory' || id === 'augment' || id === 'perplexity' || id === 'mimo'
        ? 'cookie saved · waiting'
        : 'key saved · waiting'
  else state = p.enabled ? 'waiting' : 'off'
  const keyRow = isKey
    ? `
      <div class="key-row" data-key-row="${h(id)}">
        <input class="key-input" type="password" placeholder="${id === 'cursor' ? 'Cookie: WorkosCursorSessionToken=...' : id === 'opencode' || id === 'opencodego' ? 'Cookie: auth=...; __Host-auth=...' : id === 'alibaba' ? 'cpk-... or Cookie: login_aliyunid_ticket=...' : id === 'ollama' ? 'OLLAMA_API_KEY or Cookie: session=...' : id === 'abacus' ? 'Cookie: apps.abacus.ai session...' : id === 'factory' ? 'Cookie: access-token=... or Bearer ...' : id === 'antigravity' ? '{\"access_token\":\"...\",\"project_id\":\"optional\"}' : id === 'minimax' ? 'MINIMAX_CODING_API_KEY or Cookie/curl' : id === 'manus' ? 'session_id=... or MANUS_SESSION_TOKEN' : id === 'vertexai' ? 'gcloud ADC, access token, or credentials JSON' : id === 'synthetic' ? 'SYNTHETIC_API_KEY' : id === 'mimo' ? 'Cookie: api-platform_serviceToken=...; userId=...' : id === 'bedrock' ? '{\"accessKeyID\":\"...\",\"secretAccessKey\":\"...\",\"region\":\"us-east-1\",\"budget\":250}' : id === 'augment' ? 'Cookie: __Secure-next-auth.session-token=...' : id === 'perplexity' ? 'Cookie: __Secure-authjs.session-token=...' : id === 'mistral' ? 'Cookie: ory_session_...; csrftoken=...' : id === 'commandcode' ? 'Cookie: __Secure-better-auth.session_token=...' : id === 'warp' ? 'wpa_...' : id === 'kilo' ? 'KILO_API_KEY or run kilo login' : id === 'codebuff' ? 'CODEBUFF_API_KEY or run codebuff login' : id === 'crof' ? 'CROF_API_KEY' : id === 'venice' ? 'VENICE_API_KEY' : id === 'deepgram' ? '{\"apiKey\":\"...\",\"projectID\":\"optional\"}' : id === 'stepfun' ? 'Oasis-Token=...' : id === 'llmproxy' ? '{\"apiKey\":\"...\",\"baseURL\":\"https://proxy.example.com\"}' : id === 'zai' ? 'Z_AI_API_KEY or {\"apiKey\":\"...\",\"region\":\"bigmodel-cn\"}' : id === 'elevenlabs' ? 'ELEVENLABS_API_KEY' : id === 'moonshot' ? 'MOONSHOT_API_KEY' : id === 'kimik2' ? 'KIMI_K2_API_KEY' : id === 'doubao' ? 'ARK_API_KEY' : id === 'azureopenai' ? '{\"apiKey\":\"...\",\"endpoint\":\"...\",\"deploymentName\":\"...\"}' : id === 'groq' ? 'GROQ_API_KEY' : id === 'copilot' ? 'GitHub OAuth token' : id === 'openrouter' ? 'sk-or-...' : id === 'openai' ? 'sk-admin-...' : 'sk-...'}" autocomplete="off" spellcheck="false" />
        <button class="key-save" data-key-save="${h(id)}">${hasKey ? 'Replace' : 'Save'}</button>
        ${id === 'copilot' ? `<button class="key-save" data-copilot-login>${hasKey ? 'Reconnect' : 'Connect'}</button>` : ''}
        ${hasKey ? `<button class="key-clear" data-key-clear="${h(id)}" title="Remove saved key">×</button>` : ''}
      </div>`
    : ''
  return `
    <div class="sub-row ${isKey ? 'has-key-row' : ''}" data-id="${h(id)}" style="--accent:${accent}">
      <div class="sub-row-main">
        ${providerIcon(id, glyph)}
        <span class="sub-info">
          <div class="sn">${h(p.name)}</div>
          <div class="sp">${h(plan)} · ${state}</div>
        </span>
        <span class="toggle ${p.enabled ? 'on' : ''}" data-toggle></span>
      </div>
      ${keyRow}
    </div>`
}

function onboardingRow(id, p) {
  const accent = ACCENT[id] || '#8b8f84'
  const glyph = GLYPH[id] || p.name[0]
  return `
    <div class="sub-row" data-id="${h(id)}" style="--accent:${accent}">
      <div class="sub-row-main">
        ${providerIcon(id, glyph)}
        <span class="sub-info">
          <div class="sn">${h(p.name)}</div>
          <div class="sp">${h(p.plan)}</div>
        </span>
        <span class="toggle ${p.enabled ? 'on' : ''}" data-toggle></span>
      </div>
    </div>`
}

function renderOnboarding() {
  $('onboarding-list').innerHTML = Object.entries(config.providers)
    .map(([id, p]) => onboardingRow(id, p))
    .join('')
  $('onboarding-list')
    .querySelectorAll('[data-toggle]')
    .forEach((el) => {
      el.addEventListener('click', () => el.classList.toggle('on'))
    })
}

function renderSettings() {
  $('settings-body').innerHTML = Object.entries(config.providers)
    .map(([id, p]) => settingsRow(id, p))
    .join('')
  $('open-at-login').classList.toggle('on', config.openAtLogin !== false)
  $('missions-toggle').classList.toggle('on', config.missions === true)
  $('missions-toggle').onclick = () => $('missions-toggle').classList.toggle('on')
  $('settings-body')
    .querySelectorAll('[data-toggle]')
    .forEach((el) => {
      el.addEventListener('click', () => el.classList.toggle('on'))
    })
  $('settings-body')
    .querySelectorAll('[data-key-save]')
    .forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.keySave
        const row = btn.closest('[data-key-row]')
        const input = row && row.querySelector('.key-input')
        const key = (input && input.value) || ''
        if (!key.trim()) return
        btn.disabled = true
        btn.textContent = 'Saving…'
        try {
          await window.maxx.setApiKey(id, key.trim())
          apiKeyState = await window.maxx.getApiKeyState()
          renderSettings()
        } catch (err) {
          btn.disabled = false
          btn.textContent = 'Save'
          console.error(err)
        }
      })
    })
  $('settings-body')
    .querySelectorAll('[data-key-clear]')
    .forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.keyClear
        await window.maxx.setApiKey(id, '')
        apiKeyState = await window.maxx.getApiKeyState()
        renderSettings()
      })
    })
  $('settings-body')
    .querySelectorAll('[data-copilot-login]')
    .forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true
        btn.textContent = 'Opening…'
        try {
          const login = await window.maxx.startCopilotLogin()
          btn.textContent = `Code ${login.userCode}`
          const res = await window.maxx.completeCopilotLogin(login.id)
          if (res.snap) {
            snap = res.snap
            render()
          }
          apiKeyState = await window.maxx.getApiKeyState()
          renderSettings()
        } catch (err) {
          btn.disabled = false
          btn.textContent = 'Retry'
          console.error(err)
        }
      })
    })
  $('open-at-login').onclick = () => $('open-at-login').classList.toggle('on')
}

function collectSettings() {
  const providers = { ...config.providers }
  $('settings-body')
    .querySelectorAll('.sub-row')
    .forEach((row) => {
      const id = row.dataset.id
      providers[id] = {
        ...providers[id],
        enabled: row.querySelector('[data-toggle]').classList.contains('on'),
      }
    })
  return {
    billingDay: Number(config.billingDay) || 1,
    openAtLogin: $('open-at-login').classList.contains('on'),
    onboardingComplete: config.onboardingComplete === true,
    missions: $('missions-toggle').classList.contains('on'),
    providers,
  }
}

function collectOnboarding() {
  const providers = { ...config.providers }
  $('onboarding-list')
    .querySelectorAll('.sub-row')
    .forEach((row) => {
      const id = row.dataset.id
      providers[id] = {
        ...providers[id],
        enabled: row.querySelector('[data-toggle]').classList.contains('on'),
      }
    })
  return {
    ...config,
    onboardingComplete: true,
    providers,
  }
}

function showView(id) {
  for (const v of ['view-main', 'view-onboarding', 'view-forge', 'view-missions', 'view-settings']) {
    $(v).hidden = v !== id
  }
}
const showMain = () => showView('view-main')
const showSettings = () => showView('view-settings')

/* ---------- Idea Stream ---------- */
// CLIs that accept the mission prompt as an argument → "Start build" auto-runs.
// Anything else → the button becomes "Copy prompt" so the user pastes it in.
const PROMPT_CLI = new Set(['claude', 'codex', 'gemini'])
let forgeIdeas = []
let forgeIndex = 0

function ideaCard(idea) {
  if (!idea) {
    return `<div class="forge-empty">No more ideas. Tap Skip to pull a stranger batch.</div>`
  }
  const dots = Array.from({ length: 3 }, (_, i) =>
    `<span class="${i < idea.complexity ? 'on' : 'off'}">●</span>`,
  ).join('')
  const source = idea.source === 'bank' ? 'IDEA BANK' : h(idea.source || 'Claude').toUpperCase()
  const tags = Array.isArray(idea.tags) ? idea.tags : []
  const tagHtml = tags.length
    ? `<div class="idea-tags">${tags.map((tag) => `<span>${h(tag)}</span>`).join('')}</div>`
    : ''
  return `
    <div class="idea-card">
      <div class="idea-top">
        <span class="idea-title">${h(idea.title)}</span>
        <span class="idea-source">${source}</span>
      </div>
      <p class="idea-pitch">${h(idea.pitch)}</p>
      ${tagHtml}
      ${idea.whyNow ? `<div class="idea-hook now"><b>Why now —</b> ${h(idea.whyNow)}</div>` : ''}
      ${idea.moonshot ? `<div class="idea-hook moonshot"><b>Moonshot —</b> ${h(idea.moonshot)}</div>` : ''}
      ${idea.firstTinyBuild ? `<div class="idea-hook"><b>Tiny first build —</b> ${h(idea.firstTinyBuild)}</div>` : ''}
      ${idea.viralHook ? `<div class="idea-hook"><b>Share hook —</b> ${h(idea.viralHook)}</div>` : ''}
      ${idea.killMetric ? `<div class="idea-hook kill"><b>Kill metric —</b> ${h(idea.killMetric)}</div>` : ''}
      <div class="idea-meta">
        <span class="idea-chip">Complexity <span class="dots">${dots}</span></span>
        <span class="idea-chip">Build <b>~${h(idea.buildMinutes)}m</b></span>
        ${idea.stack ? `<span class="idea-chip">${h(idea.stack)}</span>` : ''}
      </div>
      <div class="idea-cli">
        Builds with <code>${h(idea.cli)}</code> — start tiny, compound hard.
      </div>
    </div>`
}

function renderIdea() {
  const idea = forgeIdeas[forgeIndex]
  $('forge-stage').innerHTML = ideaCard(idea)
  const has = !!idea
  $('forge-start').disabled = !has
  $('forge-more').disabled = !has
  $('forge-block').disabled = !has
  const startBtn = $('forge-start')
  if (has && !PROMPT_CLI.has(idea.cli)) {
    startBtn.textContent = '⧉ Copy prompt'
    startBtn.dataset.mode = 'copy'
    startBtn.title = `${idea.cli} can't take a prompt directly — copy it and paste it in`
  } else {
    startBtn.textContent = '✦ Start build'
    startBtn.dataset.mode = 'start'
    startBtn.title = ''
  }
}

async function sendIdeaFeedback(feedback, idea = forgeIdeas[forgeIndex]) {
  if (!idea) return
  try {
    await window.maxx.forgeFeedback({ feedback, idea })
  } catch {
    /* feedback should never block the stream */
  }
}

async function nextIdea(note = '') {
  forgeIndex++
  if (forgeIndex >= forgeIdeas.length) {
    await loadForge()
  } else {
    renderIdea()
  }
  $('forge-note').textContent = note
}

async function loadForge() {
  $('forge-target').textContent = 'Pulling moonshots…'
  $('forge-stage').innerHTML = `<div class="forge-empty">Asking your fullest model for strange app ideas…</div>`
  $('forge-note').textContent = ''
  const { target, ideas } = await window.maxx.forgeIdeas()
  forgeIdeas = ideas
  forgeIndex = 0
  $('forge-target').innerHTML =
    `Routed to <b>${h(target.name)}</b> — your fullest plan. Pick a moonshot, ship the first tiny version.`
  renderIdea()
}

async function startForge() {
  showView('view-forge')
  await loadForge()
}

// Missions are opt-in — gate the Idea Stream behind a one-time consent screen.
async function openForge() {
  if (!config) config = await window.maxx.getConfig()
  if (config.missions === true) {
    await startForge()
  } else {
    showView('view-missions')
  }
}

$('forge-btn').addEventListener('click', openForge)
$('forge-back').addEventListener('click', showMain)
$('missions-back').addEventListener('click', showMain)
$('missions-decline').addEventListener('click', async () => {
  config = await window.maxx.setMissions(false)
  showMain()
})
$('missions-enable').addEventListener('click', async () => {
  config = await window.maxx.setMissions(true)
  await startForge()
})
$('forge-skip').addEventListener('click', async () => {
  await sendIdeaFeedback('skip')
  await nextIdea()
})
$('forge-block').addEventListener('click', async () => {
  await sendIdeaFeedback('block')
  await nextIdea('Blocked that vibe.')
})
$('forge-more').addEventListener('click', async () => {
  $('forge-note').textContent = 'Pulling sharper cousins…'
  await sendIdeaFeedback('more')
  await loadForge()
  $('forge-note').textContent = 'Saved. More like this.'
})
$('forge-start').addEventListener('click', async () => {
  const idea = forgeIdeas[forgeIndex]
  if (!idea) return
  if ($('forge-start').dataset.mode === 'copy') {
    await window.maxx.forgeCopy(idea)
    $('forge-note').textContent = `Prompt copied — paste it into ${idea.cli} to start the build.`
    return
  }
  $('forge-start').disabled = true
  $('forge-note').textContent = 'Pick a folder…'
  const res = await window.maxx.forgeStart(idea)
  if (res.canceled) {
    $('forge-note').textContent = ''
    $('forge-start').disabled = false
  } else if (res.ok) {
    $('forge-note').textContent = `Launched in ${res.terminal} → building ${idea.title}`
    // Re-enable so the mission is not stuck greyed out — retry or start another.
    setTimeout(() => {
      if (forgeIdeas[forgeIndex] === idea) $('forge-start').disabled = false
    }, 1600)
  } else {
    $('forge-note').textContent = 'Could not open terminal: ' + (res.error || 'unknown')
    $('forge-start').disabled = false
  }
})

/* ---------- wire up ---------- */
$('list').addEventListener('click', (event) => {
  const refresh = event.target.closest('[data-provider-refresh]')
  if (refresh) {
    const id = refresh.dataset.providerRefresh
    if (!id || refreshingProvider) return
    refreshingProvider = id
    render()
    window.maxx
      .refreshProvider(id)
      .then((next) => {
        snap = next
      })
      .catch(() => {
        /* the next timed snapshot can recover */
      })
      .finally(() => {
        refreshingProvider = null
        render()
      })
    return
  }

  const button = event.target.closest('[data-provider-toggle]')
  if (!button) return
  const id = button.dataset.providerToggle
  if (!id) return
  if (expandedProviders.has(id)) expandedProviders.delete(id)
  else expandedProviders.add(id)
  render()
})

$('close-btn').addEventListener('click', () => window.maxx.close())
$('mode-usage').addEventListener('click', () => {
  viewMode = 'usage'
  render()
})
$('mode-tokens').addEventListener('click', () => {
  viewMode = 'tokens'
  render()
})
$('onboarding-skip').addEventListener('click', async () => {
  const btn = $('onboarding-skip')
  btn.disabled = true
  config = { ...config, onboardingComplete: true }
  snap = await window.maxx.saveConfig(config)
  render()
  showMain()
  btn.disabled = false
})
$('onboarding-start').addEventListener('click', async () => {
  const btn = $('onboarding-start')
  btn.disabled = true
  btn.textContent = 'Scanning…'
  config = collectOnboarding()
  snap = await window.maxx.saveConfig(config)
  render()
  showMain()
  btn.textContent = 'Scan usage'
  btn.disabled = false
})
$('settings-btn').addEventListener('click', async () => {
  ;[config, apiKeyState] = await Promise.all([
    window.maxx.getConfig(),
    window.maxx.getApiKeyState().catch(() => ({})),
  ])
  renderSettings()
  showSettings()
  try {
    updateState = await window.maxx.getUpdateStatus()
    renderUpdate()
  } catch {
    /* keep last */
  }
})
$('back-btn').addEventListener('click', showMain)
$('open-config').addEventListener('click', () => window.maxx.openConfigFile())
$('save-config').addEventListener('click', async () => {
  snap = await window.maxx.saveConfig(collectSettings())
  render()
  showMain()
})

window.maxx.onSnapshot((s) => {
  snap = s
  render()
})

/* ---------- updates ---------- */
let updateState = { status: 'idle', version: '' }

function renderUpdate() {
  const ver = $('update-version')
  const sub = $('update-status')
  const btn = $('check-updates')
  if (!ver || !sub || !btn) return
  const v = updateState.version ? `v${updateState.version}` : 'v—'
  if (ver) ver.textContent = v
  switch (updateState.status) {
    case 'checking':
      sub.textContent = 'checking for updates…'
      btn.textContent = 'Checking…'
      btn.disabled = true
      break
    case 'downloading':
      sub.textContent = `downloading update · ${updateState.percent || 0}%`
      btn.textContent = 'Downloading…'
      btn.disabled = true
      break
    case 'ready':
      sub.textContent = `v${updateState.version} ready — restart to install`
      btn.textContent = 'Restart now'
      btn.disabled = false
      break
    case 'up-to-date':
      sub.textContent = "you're on the latest"
      btn.textContent = 'Check for updates'
      btn.disabled = false
      break
    case 'error':
      sub.textContent = updateState.error || 'check failed'
      btn.textContent = 'Try again'
      btn.disabled = false
      break
    case 'dev':
      sub.textContent = 'dev build · updates disabled'
      btn.textContent = 'Check for updates'
      btn.disabled = true
      break
    default:
      sub.textContent = 'tap to check'
      btn.textContent = 'Check for updates'
      btn.disabled = false
  }
}

window.maxx.onUpdateStatus((s) => {
  updateState = s
  renderUpdate()
})

$('check-updates').addEventListener('click', async () => {
  if (updateState.status === 'ready') {
    await window.maxx.installUpdate()
    return
  }
  await window.maxx.checkUpdates()
})

async function init() {
  config = await window.maxx.getConfig()
  if (!config.onboardingComplete) {
    renderOnboarding()
    showView('view-onboarding')
    $('cycle-pill').textContent = 'first launch'
    $('foot-left').textContent = 'Choose providers, then scan.'
    return
  }
  snap = await window.maxx.getSnapshot()
  render()
  try {
    updateState = await window.maxx.getUpdateStatus()
    renderUpdate()
  } catch {
    /* update status is best-effort */
  }
}
init()
setInterval(tickCountdowns, 1000)
