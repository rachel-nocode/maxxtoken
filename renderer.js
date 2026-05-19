const ACCENT = {
  claude: '#ff7d4d',
  codex: '#cbd0c0',
  kimi: '#e8e8e8',
  grok: '#cfcfcf',
  gemini: '#4f8cff',
  cursor: '#cfd2d6',
}
const GLYPH = {
  claude: '✦',
  codex: '◍',
  kimi: 'K',
  grok: '⊛',
  gemini: '✧',
  cursor: '➜',
}
const PROVIDER_ICON = {
  claude: 'claude.svg',
  codex: 'openai.svg',
  kimi: 'kimi.svg',
  grok: 'grok.svg',
  gemini: 'gemini.svg',
  cursor: 'cursor.svg',
}

const $ = (id) => document.getElementById(id)
let snap = null
const expandedProviders = new Set()
let refreshingProvider = null

function money(n) {
  const v = Math.round(n)
  return '$' + v.toLocaleString('en-US')
}

function moneyExact(n) {
  return '$' + n.toFixed(2)
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
  const kindLabel = w.kind === '5h' ? '5-hour window' : '7-day window'
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
      ↻
    </button>`

  if (!p.connected) {
    const msg = p.manual
      ? 'No local CLI. Tracked manually — set its cost in settings.'
      : 'Not detected on this Mac. Use its CLI once to connect.'
    return `
      <div class="prov off" style="--accent:${accent}">
        <div class="prov-top">
          ${providerIcon(p.id, glyph)}
          <span class="prov-id">
            <span class="prov-name">${h(p.name)}</span>
            <span class="prov-sub">${h(p.plan)} · ${money(p.monthly)}/mo</span>
          </span>
          ${refreshButton}
        </div>
        <div class="prov-off-msg">${h(msg)}</div>
      </div>`
  }

  const usedPct = p.capturedPct == null ? null : Math.max(0, Math.min(100, Math.round(p.capturedPct)))
  const pct = usedPct == null ? '—' : usedPct
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
  const usedMoney = moneyExact(p.capturedValue || 0)
  const leftMoney = moneyExact(p.burnValue || 0)
  const expandLabel = expanded ? 'Collapse details' : 'Show details'

  return `
    <div class="prov ${expanded ? 'open' : ''} ${p.urgent ? 'urgent' : ''}" style="--accent:${accent}">
      <div class="prov-top">
        ${providerIcon(p.id, glyph)}
        <span class="prov-id">
          <span class="prov-name">${h(p.name)}</span>
          <span class="prov-sub">
            <span class="activity-dot ${p.activity}"></span>
            ${h(p.plan)} · ${money(p.monthly)}/mo
          </span>
        </span>
        <span class="prov-pct">
          <span class="pn mono">${pct}%</span>
          <span class="pl">used</span>
        </span>
        ${refreshButton}
        <button class="prov-expand" data-provider-toggle="${h(p.id)}" aria-label="${expandLabel} for ${h(p.name)}" aria-expanded="${expanded}">
          ${expanded ? '⌃' : '⌄'}
        </button>
      </div>
      ${meter}
      <div class="prov-summary">
        <span><b>${usedMoney}</b> put to work</span>
        <span class="prov-money"><b>${leftMoney}</b> left to maxx</span>
      </div>
      ${body}
      ${expanded && extra ? `<div class="prov-stats">${extra}</div>` : ''}
    </div>`
}

function render() {
  if (!snap) return
  const t = snap.totals
  $('cycle-pill').textContent = `${snap.cycle.label} · ${snap.cycle.daysLeft}d left`
  $('t-captured').textContent = money(t.captured)
  $('t-burned').textContent = money(t.remaining ?? t.burned)
  $('t-meter').style.width = (t.capturedPct || 0) + '%'
  $('t-meter').className = usageTone(t.capturedPct || 0)
  $('t-stars').innerHTML = starRow(snap.rating.stars)
  $('t-verdict').textContent = snap.rating.verdict
  $('foot-left').textContent = `${money(t.captured)} / ${money(t.monthly)} put to work across ${t.planCount} detected plans`
  $('list').innerHTML = snap.providers.map(providerCard).join('')
  renderRunway()
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

/* ---------- settings ---------- */
let config = null
let terminals = []

function settingsRow(id, p) {
  const accent = ACCENT[id] || '#8b8f84'
  const glyph = GLYPH[id] || p.name[0]
  const detected = snap?.providers?.find((provider) => provider.id === id)
  const connected = !!detected?.connected
  const plan = detected?.plan || p.plan
  const monthly = Number(detected?.monthly ?? p.monthly) || 0
  const price = monthly > 0 ? `${money(monthly)}/mo auto` : 'not counted'
  const state = connected ? 'detected' : p.enabled ? 'waiting' : 'off'
  return `
    <div class="sub-row" data-id="${h(id)}" style="--accent:${accent}">
      ${providerIcon(id, glyph)}
      <span class="sub-info">
        <div class="sn">${h(p.name)}</div>
        <div class="sp">${h(plan)} · ${state}</div>
      </span>
      <span class="price-chip">${h(price)}</span>
      <span class="toggle ${p.enabled ? 'on' : ''}" data-toggle></span>
    </div>`
}

function renderSettings() {
  $('settings-body').innerHTML = Object.entries(config.providers)
    .map(([id, p]) => settingsRow(id, p))
    .join('')
  $('open-at-login').classList.toggle('on', config.openAtLogin !== false)
  const selected = terminals.some((terminal) => terminal.id === config.terminal)
    ? config.terminal
    : terminals[0]?.id || 'Terminal'
  $('terminal-pref').innerHTML = terminals.length
    ? terminals
        .map((terminal) => `<option value="${h(terminal.id)}">${h(terminal.name)}</option>`)
        .join('')
    : '<option value="Terminal">Terminal</option>'
  $('terminal-pref').value = selected
  $('settings-body')
    .querySelectorAll('[data-toggle]')
    .forEach((el) => {
      el.addEventListener('click', () => el.classList.toggle('on'))
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
    terminal: $('terminal-pref').value || 'Terminal',
    providers,
  }
}

function showView(id) {
  for (const v of ['view-main', 'view-forge', 'view-settings']) {
    $(v).hidden = v !== id
  }
}
const showMain = () => showView('view-main')
const showSettings = () => showView('view-settings')

/* ---------- Idea Stream ---------- */
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
  $('forge-stage').innerHTML = ideaCard(forgeIdeas[forgeIndex])
  const has = !!forgeIdeas[forgeIndex]
  $('forge-start').disabled = !has
  $('forge-more').disabled = !has
  $('forge-block').disabled = !has
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

async function openForge() {
  showView('view-forge')
  await loadForge()
}

$('forge-btn').addEventListener('click', openForge)
$('forge-back').addEventListener('click', showMain)
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
  $('forge-start').disabled = true
  $('forge-note').textContent = 'Pick a folder…'
  const res = await window.maxx.forgeStart(idea)
  if (res.canceled) {
    $('forge-note').textContent = ''
    $('forge-start').disabled = false
  } else if (res.ok) {
    $('forge-note').textContent = `Launched in ${res.terminal} → building ${idea.title}`
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
$('settings-btn').addEventListener('click', async () => {
  ;[config, terminals] = await Promise.all([window.maxx.getConfig(), window.maxx.getTerminals()])
  renderSettings()
  showSettings()
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

async function init() {
  snap = await window.maxx.getSnapshot()
  render()
}
init()
setInterval(tickCountdowns, 1000)
