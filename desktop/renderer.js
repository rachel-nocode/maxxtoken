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
  alibabatokenplan: '#ff6a00',
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
  t3chat: '#f56647',
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
  alibabatokenplan: 'TP',
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
  t3chat: 'T3',
}
const PROVIDER_ICON = {
  abacus: 'abacus.svg',
  alibaba: 'alibaba.svg',
  alibabatokenplan: 'alibaba.svg',
  amp: 'amp.svg',
  antigravity: 'antigravity.svg',
  augment: 'augment.svg',
  bedrock: 'bedrock.svg',
  claude: 'claude.svg',
  codex: 'codex.svg',
  codebuff: 'codebuff.svg',
  commandcode: 'commandcode.svg',
  copilot: 'copilot.svg',
  crof: 'crof.svg',
  cursor: 'cursor.svg',
  deepgram: 'deepgram.svg',
  deepseek: 'deepseek.svg',
  doubao: 'doubao.svg',
  elevenlabs: 'elevenlabs.svg',
  factory: 'factory.svg',
  gemini: 'gemini.svg',
  grok: 'grok.svg',
  groq: 'groq.svg',
  jetbrains: 'jetbrains.svg',
  kilo: 'kilo.svg',
  kimi: 'kimi.svg',
  kimik2: 'kimi.svg',
  kiro: 'kiro.svg',
  llmproxy: 'llmproxy.svg',
  manus: 'manus.svg',
  mimo: 'mimo.svg',
  minimax: 'minimax.svg',
  mistral: 'mistral.svg',
  ollama: 'ollama.svg',
  opencode: 'opencode.svg',
  opencodego: 'opencodego.svg',
  openai: 'openai.svg',
  azureopenai: null,
  moonshot: null,
  openrouter: 'openrouter.svg',
  perplexity: 'perplexity.svg',
  stepfun: 'stepfun.svg',
  synthetic: 'synthetic.svg',
  t3chat: 't3chat.svg',
  venice: 'venice.svg',
  vertexai: 'vertexai.svg',
  warp: 'warp.svg',
  windsurf: 'windsurf.svg',
  zai: 'zai.svg',
}
// Providers wired by user-pasted secrets (API key, cookie header, etc.).
const KEY_PROVIDERS = new Set([
  'openai',
  'azureopenai',
  'cursor',
  'copilot',
  'windsurf',
  'opencode',
  'opencodego',
  'alibaba',
  'alibabatokenplan',
  'augment',
  'warp',
  'elevenlabs',
  'kilo',
  'openrouter',
  'grok',
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
  'amp',
  'factory',
  'antigravity',
  'minimax',
  'manus',
  'vertexai',
  'synthetic',
  'mimo',
  'bedrock',
  'zai',
  't3chat',
])

const $ = (id) => document.getElementById(id)
let snap = null
const expandedProviders = new Set()
let refreshingProvider = null
let viewMode = 'usage'
let receiptCollapsed = localStorage.getItem('maxxtoken-receipt-collapsed') !== 'false'

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

function bytes(n) {
  const v = Math.round(Number(n) || 0)
  if (v < 1024) return `${v} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let scaled = v / 1024
  let unit = 0
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024
    unit += 1
  }
  return `${scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[unit]}`
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

function quotaWarningKind(w) {
  const text = `${w?.label || ''} ${w?.kind || ''}`.toLowerCase()
  if (text.includes('week') || text.includes('7d')) return 'weekly'
  if (text.includes('session') || text.includes('rolling') || text.includes('5h') || text.includes('4h')) return 'session'
  return null
}

function quotaWarningThresholdsFor(kind) {
  if (!config || config.quotaWarningNotificationsEnabled !== true) return []
  if (kind === 'session' && config.quotaWarningSessionEnabled === false) return []
  if (kind === 'weekly' && config.quotaWarningWeeklyEnabled === false) return []
  const raw =
    kind === 'weekly'
      ? config.quotaWarningWeeklyThresholds || config.quotaWarningThresholds
      : config.quotaWarningSessionThresholds || config.quotaWarningThresholds
  return Array.isArray(raw) ? raw : [50, 20]
}

function quotaWarningMarkers(kind) {
  return quotaWarningThresholdsFor(kind)
    .map((threshold) => Number(threshold))
    .filter((threshold) => Number.isFinite(threshold) && threshold > 0)
    .map((threshold) => 100 - Math.max(0, Math.min(99, Math.round(threshold))))
    .filter((pct) => pct > 0 && pct < 100)
    .sort((a, b) => a - b)
    .map((pct) => `<i class="quota-marker" style="left:${pct}%" aria-hidden="true"></i>`)
    .join('')
}

function meterWithMarkers(pct, tone, kind, className = 'prov-meter') {
  return `<div class="${className}"><span class="${tone}" style="width:${pct}%"></span>${quotaWarningMarkers(kind)}</div>`
}

function windowHistoryMini(w) {
  const points = Array.isArray(w.historySeries) ? w.historySeries.slice(-24) : []
  if (points.length < 2) return ''
  const first = Number(points[0].usedPct) || 0
  const last = Number(points[points.length - 1].usedPct) || 0
  const trend = last > first ? 'up' : last < first ? 'down' : 'flat'
  const bars = points
    .map((point) => {
      const pct = Math.max(2, Math.min(100, Math.round(Number(point.usedPct) || 0)))
      return `<span style="height:${pct}%" title="${pct}% used"></span>`
    })
    .join('')
  return `
    <div class="win-history ${trend}">
      <div class="win-history-bars" aria-hidden="true">${bars}</div>
      <span>${points.length} samples · ${Math.round(first)}% → ${Math.round(last)}%</span>
    </div>`
}

function paceBarSvg(usedPct, expectedPct, windowLabel, projectedPct) {
  const a = Math.max(0, Math.min(100, usedPct))
  const e = Math.max(0, Math.min(100, expectedPct))
  const ahead = a < e - 2
  const behind = a > e + 2
  const onPace = !ahead && !behind
  const uid = `pb${Math.random().toString(36).slice(2, 9)}`

  // viewBox 100x16. Bar y=5..12 (h=7). Tick y=3..14 (overhang ±2).
  // Reserve = hairline rule below bar (fill-end → tick).
  // Deficit = diagonal lime stripes on bar (tick → fill-end).
  // Burnout flag = red tick at right edge when projected ≥ 100%.
  const tickX = Math.max(0, Math.min(99.7, e - 0.15))
  const projRaw = Number(projectedPct)
  const burnout = Number.isFinite(projRaw) && projRaw >= 100 && a < 100

  // SVG <pattern> does NOT inherit CSS `color` from the element using it.
  // Hardcode lime literal so stripes render lime, not black.
  return `
    <div class="pacebar">
      <svg class="pacebar-svg" viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id="${uid}" patternUnits="userSpaceOnUse" width="3" height="7" patternTransform="rotate(45)">
            <rect width="1.5" height="7" fill="#b6f24a"/>
          </pattern>
        </defs>
        <rect class="pb-track" x="0" y="5" width="100" height="7"/>
        <rect class="pb-fill" x="0" y="5" width="${behind ? e : a}" height="7"/>
        ${behind ? `<rect x="${e}" y="5" width="${Math.max(0, a - e)}" height="7" fill="url(#${uid})"/>` : ''}
        ${burnout ? `<rect class="pb-burnout" x="99.4" y="3" width="0.6" height="11"/>` : ''}
        ${ahead ? `<rect class="pb-reserve" x="${a}" y="13.2" width="${e - a}" height="1.1"/>` : ''}
        <rect class="pb-tick ${onPace ? 'on' : 'off'}" x="${tickX}" y="3" width="0.6" height="11"/>
      </svg>
      ${windowLabel ? `<span class="pacebar-win mono">${h(windowLabel)}</span>` : ''}
    </div>`
}

function windowRow(w) {
  const usedPct = Math.max(0, Math.min(100, Math.round(w.usedPct || 0)))
  const expectedPct =
    w.pace && Number.isFinite(Number(w.pace.expectedUsedPercent))
      ? Math.max(0, Math.min(100, Math.round(Number(w.pace.expectedUsedPercent))))
      : usedPct
  const left = w.resetAt ? w.resetAt - Date.now() : Infinity
  const urgent =
    w.resetAt &&
    ((w.kind === '5h' && left < 90 * 60000 && w.usedPct < 50) ||
      (w.kind !== '5h' && left < 2 * 86400000 && w.usedPct < 60))
  const winLabel = w.kind === '5h' ? '5H' : w.kind === 'cycle' ? '30D' : '7D'
  const tierLabel = w.kind === '5h' ? 'SESSION · 5H' : w.kind === 'cycle' ? 'BILLING · 30D' : 'WEEKLY · 7D'
  const ahead = expectedPct - usedPct > 2
  const behind = usedPct - expectedPct > 2
  const paceClass = ahead ? 'ahead' : behind ? 'behind' : 'onpace'
  const projectedPct = w.pace && Number.isFinite(Number(w.pace.projectedAtResetPercent))
    ? Number(w.pace.projectedAtResetPercent)
    : null
  return `
    <div class="win ${paceClass}">
      <div class="win-row">
        <span class="win-name">${h(w.label)}</span>
        <span class="win-tier mono">${h(tierLabel)}</span>
        <span class="win-pct mono">${usedPct}<i>%</i></span>
        <span class="win-reset mono ${urgent ? 'urgent' : ''}" data-reset="${w.resetAt || ''}">${countdown(w.resetAt)}</span>
      </div>
      ${paceBarSvg(usedPct, expectedPct, winLabel, projectedPct)}
    </div>`
}

function storagePanel(footprint) {
  if (!footprint) return ''
  const components = (footprint.components || []).slice(0, 3)
  const recommendations = (footprint.recommendations || []).slice(0, 2)
  const componentRows = components
    .map(
      (component) => `
        <div class="storage-row">
          <span>${h(component.name || component.path)}</span>
          <b>${bytes(component.bytes)}</b>
        </div>`,
    )
    .join('')
  const recommendationRows = recommendations
    .map((rec) => `<div class="storage-tip">${h(rec.title)} · ${bytes(rec.bytes)}</div>`)
    .join('')
  const empty = footprint.hasLocalData ? '' : '<div class="storage-tip">No local data found</div>'
  const unreadable = footprint.unreadablePaths?.length
    ? `<div class="storage-tip">${footprint.unreadablePaths.length} unreadable item${footprint.unreadablePaths.length === 1 ? '' : 's'} skipped</div>`
    : ''
  return `
    <div class="storage-panel">
      <div class="storage-head">
        <span>Local footprint</span>
        <b>${bytes(footprint.totalBytes)}</b>
      </div>
      ${componentRows}
      ${recommendationRows}
      ${empty}
      ${unreadable}
    </div>`
}

function providerStatusInline(status) {
  if (!status) return ''
  const label = status.description || status.label || 'Status unknown'
  return `<span class="status-pill ${h(status.indicator || 'unknown')}" title="${h(label)}">${h(status.label || 'Status')}</span>`
}

function providerStatusPanel(status) {
  if (!status) return ''
  const detail = status.description ? `<div class="status-detail">${h(status.description)}</div>` : ''
  const link = status.url ? `<div class="status-detail">${h(status.url)}</div>` : ''
  return `
    <div class="provider-status-panel ${h(status.indicator || 'unknown')}">
      <div class="status-head">
        <span>Provider status</span>
        <b>${h(status.label || 'Status unknown')}</b>
      </div>
      ${detail}
      ${link}
    </div>`
}

function providerActions(p) {
  const links = p.links || {}
  const actions = [
    links.dashboard ? ['dashboard', 'Usage dashboard', ICON_CHART] : null,
    links.billing ? ['billing', 'Billing', ICON_CREDIT_CARD] : null,
    links.status ? ['status', 'Status page', ICON_HEARTBEAT] : null,
  ].filter(Boolean)
  if (!actions.length) return ''
  return `
    <div class="provider-actions">
      ${actions
        .map(
          ([kind, label, icon]) => `
            <button class="provider-action" data-provider-id="${h(p.id)}" data-provider-link="${h(kind)}" aria-label="Open ${h(p.name)} ${label}" title="${h(label)}">
              ${icon}
            </button>`,
        )
        .join('')}
    </div>`
}

function modelBreakdownRows(tokenUsage) {
  const rows = Array.isArray(tokenUsage?.modelBreakdowns) ? tokenUsage.modelBreakdowns : []
  const total = Math.max(1, Number(tokenUsage?.total) || 0)
  return rows
    .filter((row) => Number(row?.total) > 0)
    .slice(0, 5)
    .map((row) => {
      const model = row.model || row.modelName || 'unknown'
      const rowTotal = Number(row.total) || 0
      const pct = Math.max(3, Math.round((rowTotal / total) * 100))
      const cost = Number(row.costUSD)
      const pricing = row.pricingSource ? ` · ${row.pricingSource}` : ''
      const costText = Number.isFinite(cost) ? `${moneyMaybeExact(cost)} est.${pricing}` : 'tokens only'
      const detail = [
        Number(row.input) > 0 ? `${tokens(row.input)} in` : null,
        Number(row.cached) > 0 ? `${tokens(row.cached)} cached` : null,
        Number(row.output) > 0 ? `${tokens(row.output)} out` : null,
      ].filter(Boolean).join(' · ')
      return `
        <div class="token-model-row">
          <div class="token-model-head">
            <span class="token-model-name" title="${h(model)}">${h(model)}</span>
            <span class="token-model-total mono">${tokens(rowTotal)}</span>
          </div>
          <div class="token-model-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
          <div class="token-model-foot">
            <span>${h(detail || 'token total')}</span>
            <span>${h(costText)}</span>
          </div>
        </div>`
    })
    .join('')
}

function dayLabel(day) {
  const parts = String(day || '').split('-').map((part) => Number(part))
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return String(day || 'day')
  return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function dailyBreakdownRows(tokenUsage) {
  const rows = Array.isArray(tokenUsage?.dailyBreakdown) ? tokenUsage.dailyBreakdown : []
  const maxTotal = Math.max(...rows.map((row) => Number(row.total) || 0), 1)
  return rows
    .filter((row) => Number(row?.total) > 0)
    .slice(0, 7)
    .map((row) => {
      const total = Number(row.total) || 0
      const pct = Math.max(3, Math.round((total / maxTotal) * 100))
      const cost = Number(row.costUSD)
      const meta = Number.isFinite(cost) ? `${moneyMaybeExact(cost)} est.` : `${row.requests || 0} req`
      return `
        <div class="token-day-row">
          <span class="token-day-label">${h(dayLabel(row.date))}</span>
          <div class="token-day-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
          <span class="token-day-total mono">${tokens(total)}</span>
          <span class="token-day-cost">${h(meta)}</span>
        </div>`
    })
    .join('')
}

function serviceTierRows(tokenUsage) {
  const rows = Array.isArray(tokenUsage?.serviceTierBreakdowns) ? tokenUsage.serviceTierBreakdowns : []
  const total = Math.max(1, Number(tokenUsage?.total) || 0)
  return rows
    .filter((row) => Number(row?.total) > 0)
    .slice(0, 3)
    .map((row) => {
      const tier = row.serviceTier === 'priority' ? 'Priority' : row.serviceTier === 'standard' ? 'Standard' : row.serviceTier || 'Unknown'
      const rowTotal = Number(row.total) || 0
      const pct = Math.max(3, Math.round((rowTotal / total) * 100))
      const detail = [
        Number(row.input) > 0 ? `${tokens(row.input)} in` : null,
        Number(row.cached) > 0 ? `${tokens(row.cached)} cached` : null,
        Number(row.output) > 0 ? `${tokens(row.output)} out` : null,
      ].filter(Boolean).join(' · ')
      return `
        <div class="token-model-row">
          <div class="token-model-head">
            <span class="token-model-name">${h(tier)}</span>
            <span class="token-model-total mono">${tokens(rowTotal)}</span>
          </div>
          <div class="token-model-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
          <div class="token-model-foot">
            <span>${h(detail || 'token total')}</span>
            <span>${h(row.events || 0)} events</span>
          </div>
        </div>`
    })
    .join('')
}

function tokenDetails(tokenUsage) {
  const dailyRows = dailyBreakdownRows(tokenUsage)
  const tierRows = serviceTierRows(tokenUsage)
  const modelRows = modelBreakdownRows(tokenUsage)
  const pricingSources = Array.isArray(tokenUsage?.pricingSources) ? tokenUsage.pricingSources.filter(Boolean) : []
  const pricingText = pricingSources.length ? `${pricingSources.join(' + ')} pricing` : ''
  if (!dailyRows && !tierRows && !modelRows && !pricingText) return ''
  const hiddenCount = Math.max(0, (tokenUsage.modelBreakdowns || []).length - 5)
  return `
    ${pricingText ? `<div class="token-pricing-source">${h(pricingText)}</div>` : ''}
    ${dailyRows ? `
      <div class="token-models token-days">
        <div class="token-models-head">
          <span>Daily burn</span>
          <b>${h(tokenUsage.historyDays || 30)}d</b>
        </div>
        ${dailyRows}
      </div>` : ''}
    ${tierRows ? `
      <div class="token-models">
        <div class="token-models-head">
          <span>Service tier</span>
          ${Number(tokenUsage.priorityEvents) ? `<b>${h(tokenUsage.priorityEvents)} priority</b>` : ''}
        </div>
        ${tierRows}
      </div>` : ''}
    ${modelRows ? `
      <div class="token-models">
        <div class="token-models-head">
          <span>Model burn</span>
          ${hiddenCount ? `<b>+${hiddenCount} more</b>` : ''}
        </div>
        ${modelRows}
      </div>` : ''}`
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
            <span class="prov-sub">${h(p.plan)} · ${money(p.monthly)}/mo</span>
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
  const meterKind = p.windows?.some((w) => quotaWarningKind(w) === 'weekly') ? 'weekly' : 'session'
  const meter = meterWithMarkers(usedPct || 0, usageTone(usedPct || 0), meterKind)
  const usedMoney = moneyMaybeExact(p.spentValue ?? p.capturedValue)
  const leftMoney = moneyMaybeExact(p.leftValue ?? p.burnValue)
  const tokenUsage = p.tokenUsage || null
  const showTokens = viewMode === 'tokens'
  const hasTokenSource = tokenUsage && Number.isFinite(Number(tokenUsage.total))
  const usageLabel = showTokens ? 'tokens' : p.usageLabel || 'used'
  const pctDisplay = showTokens ? (hasTokenSource ? tokens(tokenUsage.total) : '—') : pct
  const valuePrefix = p.valueAccuracy === 'estimate' ? 'est. ' : ''
  const sourceLabel = p.sourceLabel || tokenUsage?.source || ''
  const sourceInline = sourceLabel ? `<span class="source-pill" title="Source">${h(sourceLabel)}</span>` : ''
  const costLine = hasTokenSource && Number.isFinite(Number(tokenUsage.costUSD))
    ? `<span><b>${moneyMaybeExact(Number(tokenUsage.costUSD))}</b> est. cost${tokenUsage.pricingSource ? ` · ${h(tokenUsage.pricingSource)}` : ''}</span>`
    : ''
  const summary = showTokens
    ? hasTokenSource
      ? `
        <span><b>${tokens(tokenUsage.input)}</b> input</span>
        <span><b>${tokens(tokenUsage.cached)}</b> cached</span>
        <span class="prov-money"><b>${tokens(tokenUsage.output)}</b> output</span>
        ${costLine}
        ${sourceInline}`
      : `<span class="token-missing">No token source yet</span>`
    : `
        <span><b>${usedMoney}</b> ${valuePrefix}spent</span>
        <span class="prov-money"><b>${leftMoney}</b> left to maxx</span>
        ${sourceInline}`
  const expandLabel = expanded ? 'Collapse details' : 'Show details'
  const expandedTokenDetails = expanded && showTokens && hasTokenSource ? tokenDetails(tokenUsage) : ''

  return `
    <div class="prov ${expanded ? 'open' : ''} ${p.urgent ? 'urgent' : ''}" style="--accent:${accent}">
      <div class="prov-top">
        ${providerIcon(p.id, glyph)}
        <span class="prov-id">
          <span class="prov-name">${h(p.name)}</span>
          <span class="prov-sub">
            <span class="activity-dot ${p.activity}"></span>
            ${h(p.plan)} · ${money(p.monthly)}/mo
            ${providerStatusInline(p.status)}
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
      <div class="prov-summary">
        ${summary}
      </div>
      ${body}
    </div>`
}

function render() {
  if (!snap) return
  const t = snap.totals
  $('cycle-pill').textContent = `${snap.cycle.label} · ${snap.cycle.daysLeft}d left`
  const tokenTotals = t.tokens || { input: 0, cached: 0, output: 0, total: 0, providerCount: 0 }
  const showTokens = viewMode === 'tokens'
  applyReceiptCollapsed()
  $('mode-usage').classList.toggle('active', !showTokens)
  $('mode-tokens').classList.toggle('active', showTokens)
  $('receipt-meter').hidden = showTokens || receiptCollapsed
  $('t-captured').textContent = showTokens ? tokens(tokenTotals.total) : money(t.spent ?? t.captured)
  $('t-burned').textContent = showTokens ? tokens(tokenTotals.input) : money(t.left ?? t.remaining ?? t.burned)
  $('t-runway').textContent = showTokens ? tokens(tokenTotals.output) : receiptCollapsed ? `${Math.round(t.capturedPct || 0)}%` : fmtRunway(combinedRunwayMs())
  $('t-captured-label').textContent = showTokens ? 'total tokens' : 'spent value'
  $('t-burned-label').textContent = showTokens ? 'input tokens' : 'left to maxx'
  $('t-runway-label').textContent = showTokens ? 'output tokens' : receiptCollapsed ? 'used' : 'time left to maxx'
  $('t-meter').style.width = (t.capturedPct || 0) + '%'
  $('t-meter').className = usageTone(t.capturedPct || 0)
  $('t-stars').innerHTML = starRow(snap.rating.stars)
  $('t-verdict').textContent = snap.rating.verdict
  renderMaxxTarget(showTokens)
  renderTrendStrip(showTokens)
  renderHistoryStrip(showTokens)
  renderResetQueue(showTokens)
  const footEl = $('foot-left')
  if (showTokens) {
    if (tokenTotals.providerCount) {
      const cost = Number(tokenTotals.costUSD)
      footEl.innerHTML = `
        <span class="foot-chip"><span class="fc-l">Tokens</span><span class="fc-v mono">${tokens(tokenTotals.total)}</span></span>
        <span class="foot-chip"><span class="fc-l">Sources</span><span class="fc-v mono">${tokenTotals.providerCount}</span></span>
        <span class="foot-chip"><span class="fc-l">${Number.isFinite(cost) ? 'Est. Cost' : 'Window'}</span><span class="fc-v mono">${Number.isFinite(cost) ? moneyMaybeExact(cost) : `${tokenTotals.historyDays || 30}D`}</span></span>`
    } else {
      footEl.textContent = 'No token sources yet'
    }
  } else {
    const planVal = t.estimatedPlanCount ? `${t.planCount}<i>·${t.estimatedPlanCount}e</i>` : `${t.planCount}`
    footEl.innerHTML = `
      <span class="foot-chip"><span class="fc-l">Left</span><span class="fc-v mono">${money(t.left ?? t.remaining)}</span></span>
      <span class="foot-chip"><span class="fc-l">Spent</span><span class="fc-v mono">${money(t.spent ?? t.captured)}</span></span>
      <span class="foot-chip"><span class="fc-l">Plans</span><span class="fc-v mono">${planVal}</span></span>`
  }
  $('list').innerHTML = snap.providers.map(providerCard).join('')
  if (!showTokens) renderRunway()
}

function applyReceiptCollapsed() {
  const receipt = $('receipt')
  const toggle = $('receipt-toggle')
  if (!receipt || !toggle) return
  receipt.classList.toggle('compact', receiptCollapsed)
  toggle.setAttribute('aria-expanded', String(!receiptCollapsed))
  toggle.setAttribute('aria-label', receiptCollapsed ? 'Expand summary' : 'Collapse summary')
  toggle.title = receiptCollapsed ? 'Expand summary' : 'Collapse summary'
}

function renderHistoryStrip(showTokens) {
  const el = $('history-strip')
  const history = snap?.totals?.history
  const worst = history?.worst
  if (!el) return
  if (showTokens || !worst || !history.sampleCount) {
    el.hidden = true
    el.innerHTML = ''
    return
  }
  const tracked = `${history.sampleCount} reset${history.sampleCount === 1 ? '' : 's'} tracked`
  const miss = worst.missRiskPct != null ? ` · ${Math.round(worst.missRiskPct)}% miss risk` : ''
  const provider = worst.providerName || worst.providerId || 'Provider'
  const windowLabel = worst.windowLabel ? ` ${worst.windowLabel}` : ''
  el.hidden = false
  el.innerHTML = `
    <span class="history-kicker">History</span>
    <b>${h(provider)}${h(windowLabel)}</b>
    <span>usually leaves ${Math.round(worst.averageUnusedPct || 0)}% unused${miss} · ${h(tracked)}</span>`
}

function renderTrendStrip(showTokens) {
  const el = $('trend-strip')
  const trend = snap?.totals?.trend
  if (!el) return
  if (showTokens) {
    renderTokenMixStrip(el)
    return
  }
  if (showTokens || !trend || trend.sampleCount < 2) {
    el.hidden = true
    el.innerHTML = ''
    return
  }
  const delta = Math.round(trend.deltaPct || 0)
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const sign = delta > 0 ? '+' : ''
  const spent = Math.abs(Number(trend.deltaSpent) || 0)
  const windowLabel = trend.hours >= 48 ? `${Math.round(trend.hours / 24)}d` : `${trend.hours}h`
  const copy =
    direction === 'up'
      ? `${sign}${delta} pts captured · ${moneyMaybeExact(spent)} more used`
      : direction === 'down'
        ? `${delta} pts captured · reset or plan mix changed`
        : `flat at ${Math.round(trend.currentPct || 0)}% captured`
  el.hidden = false
  const chart = trendChart(trend.points || [], (point) => point.capturedPct)
  el.innerHTML = `
    <div class="trend-copy">
      <span class="trend-kicker">Trend</span>
      <span class="trend-arrow ${direction}">${direction === 'up' ? '↗' : direction === 'down' ? '↘' : '→'}</span>
      <b>${h(copy)}</b>
      <span>${h(windowLabel)} · ${trend.sampleCount} samples</span>
    </div>
    ${chart}`
}

function trendChart(points, valueForPoint) {
  const values = (points || [])
    .map(valueForPoint)
    .map((value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0))))
  if (values.length < 2) return ''
  return `
    <div class="trend-chart" aria-hidden="true">
      ${values.map((value) => `<span style="height:${Math.max(8, value)}%"></span>`).join('')}
    </div>`
}

function renderTokenMixStrip(el) {
  const tokenTotals = snap?.totals?.tokens || {}
  const trend = snap?.totals?.tokenTrend || null
  const total = Number(tokenTotals.total) || 0
  if (!total || !tokenTotals.providerCount) {
    el.hidden = true
    el.innerHTML = ''
    return
  }
  const parts = [
    ['input', tokenTotals.input || 0],
    ['cached', tokenTotals.cached || 0],
    ['output', tokenTotals.output || 0],
  ].filter(([, value]) => Number(value) > 0)
  el.hidden = false
  const trendCopy = tokenTrendCopy(trend)
  const costCopy = tokenCostCopy(tokenTotals, trend)
  const maxPoint = Math.max(...(trend?.points || []).map((point) => Number(point.total) || 0), 0)
  const chart = trend?.points?.length >= 2 && maxPoint > 0 ? trendChart(trend.points, (point) => (Number(point.total) / maxPoint) * 100) : ''
  el.innerHTML = `
    <div class="trend-copy">
      <span class="trend-kicker">${trendCopy ? 'Token trend' : 'Token mix'}</span>
      ${trendCopy ? `<span class="trend-arrow ${h(trend.direction || 'flat')}">${trend.direction === 'up' ? '↗' : trend.direction === 'down' ? '↘' : '→'}</span>` : ''}
      <b>${tokens(total)}</b>
      <span>${trendCopy || `${tokenTotals.providerCount} sources · ${tokenTotals.historyDays || 30}d window`}${costCopy}</span>
    </div>
    <div class="token-side">
      ${chart}
      <div class="token-mix" aria-hidden="true">
        ${parts
          .map(([name, value]) => {
            const width = Math.max(3, Math.round((Number(value) / total) * 100))
            return `<span class="${name}" style="width:${width}%"></span>`
          })
          .join('')}
      </div>
    </div>`
}

function tokenTrendCopy(trend) {
  if (!trend || trend.sampleCount < 2) return ''
  const delta = Math.round(Number(trend.deltaTotal) || 0)
  const windowLabel = trend.hours >= 48 ? `${Math.round(trend.hours / 24)}d` : `${trend.hours}h`
  const sources = trend.providerCount ? `${trend.providerCount} sources` : 'tracked sources'
  if (delta > 0) return `+${tokens(delta)} over ${windowLabel} · ${sources}`
  if (delta < 0) return `${tokens(Math.abs(delta))} rolled out over ${windowLabel} · ${sources}`
  return `flat over ${windowLabel} · ${sources}`
}

function tokenCostCopy(tokenTotals, trend) {
  const totalCost = Number(tokenTotals?.costUSD)
  const daily = tokenTotals?.dailyCost
  const latestCost = Number(daily?.latest?.costUSD)
  if (Number.isFinite(latestCost)) {
    const deltaCost = Number(daily?.deltaCostUSD)
    const day = dayLabel(daily.latest.dayKey)
    if (Number.isFinite(deltaCost) && deltaCost !== 0) {
      const sign = deltaCost > 0 ? '+' : '-'
      return ` · ${moneyMaybeExact(latestCost)} ${day} · ${sign}${moneyMaybeExact(Math.abs(deltaCost))} vs prev`
    }
    return ` · ${moneyMaybeExact(latestCost)} ${day} est.`
  }
  if (!Number.isFinite(totalCost)) return ''
  const deltaCost = Number(trend?.deltaCostUSD)
  if (Number.isFinite(deltaCost) && deltaCost !== 0) {
    const sign = deltaCost > 0 ? '+' : '-'
    return ` · ${sign}${moneyMaybeExact(Math.abs(deltaCost))} est. cost`
  }
  return ` · ${moneyMaybeExact(totalCost)} est. cost`
}

function renderResetQueue(showTokens) {
  const el = $('reset-queue')
  const queue = snap?.totals?.resetQueue || []
  if (!el) return
  if (showTokens || !queue.length) {
    el.hidden = true
    el.innerHTML = ''
    return
  }
  const rows = queue
    .map((item) => {
      const value = item.valueLeft > 0 ? ` · ${moneyMaybeExact(item.valueLeft)} at risk` : ''
      const risk = item.historyRiskPct ? ` · ${Math.round(item.historyRiskPct)}% miss` : ''
      const label = `${item.providerName} ${item.windowLabel || ''}`.trim()
      return `
        <div class="reset-item ${item.urgent ? 'urgent' : ''}">
          <span class="reset-item-name">${h(label)}</span>
          <span class="reset-item-meta">${Math.round(item.reservePct || 0)}% left${risk}${value}</span>
          <span class="reset-item-time mono" data-reset="${item.resetAt || ''}">${countdown(item.resetAt)}</span>
        </div>`
    })
    .join('')
  el.hidden = false
  el.innerHTML = `
    <div class="reset-queue-head">
      <span>Next resets</span>
      <b>${queue.length}</b>
    </div>
    ${rows}`
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

function renderMaxxTarget(showTokens) {
  const el = $('maxx-target')
  const target = snap?.maxxTarget
  if (!el) return
  if (showTokens || !target) {
    el.hidden = true
    el.innerHTML = ''
    return
  }
  const reset = target.resetAt ? ` · reset ${fmtRunway(Math.max(0, target.resetAt - Date.now()))}` : ''
  const history = target.historyRiskNote
    ? ` · ${h(target.historyRiskNote.toLowerCase())}`
    : target.historyNote
      ? ` · ${h(target.historyNote.toLowerCase())}`
      : ''
  const value = target.valueLeft ? ` · ${money(target.valueLeft)} left` : ''
  el.hidden = false
  el.innerHTML = `
    <span class="target-kicker">Next maxx</span>
    <b>${h(target.name)}</b>
    <span>${h(target.reason)}${history}${value}${reset}</span>
    <button class="maxx-target-action" id="maxx-target-action" title="Open Idea Stream" aria-label="Open Idea Stream">${ICON_DIAMOND_FILLED}</button>`
}

function tickCountdowns() {
  document.querySelectorAll('[data-reset]').forEach((el) => {
    const r = Number(el.dataset.reset)
    if (r) el.textContent = countdown(r)
  })
  renderRunway()
}

/* ---------- icons ---------- */
// ============================================================
// Icon system — 14x14 box, 1px inset, 1.4 stroke, square caps,
// miter joins, no fill (except active/selected state).
// ============================================================
const ICON_ATTRS = 'viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"'

const ICON_CHEVRON_DOWN = `<svg ${ICON_ATTRS}><polyline points="3.5,5.5 7,9 10.5,5.5"/></svg>`
const ICON_CHEVRON_UP = `<svg ${ICON_ATTRS}><polyline points="3.5,8.5 7,5 10.5,8.5"/></svg>`
const ICON_CHEVRON_LEFT = `<svg ${ICON_ATTRS}><polyline points="8.5,3.5 5,7 8.5,10.5"/></svg>`
const ICON_REFRESH = `<svg ${ICON_ATTRS}><path d="M11.5 6.5 A4.5 4.5 0 1 0 11 9.5"/><polyline points="11.5,3.5 11.5,6.5 8.5,6.5"/></svg>`
const ICON_SETTINGS = `<svg ${ICON_ATTRS}><circle cx="7" cy="7" r="2"/><line x1="7" y1="0.5" x2="7" y2="2.5"/><line x1="7" y1="11.5" x2="7" y2="13.5"/><line x1="0.5" y1="7" x2="2.5" y2="7"/><line x1="11.5" y1="7" x2="13.5" y2="7"/><line x1="2.4" y1="2.4" x2="3.8" y2="3.8"/><line x1="10.2" y1="10.2" x2="11.6" y2="11.6"/><line x1="11.6" y1="2.4" x2="10.2" y2="3.8"/><line x1="3.8" y1="10.2" x2="2.4" y2="11.6"/></svg>`
const ICON_DIAMOND = `<svg ${ICON_ATTRS}><polygon points="7,1.5 12.5,7 7,12.5 1.5,7"/></svg>`
const ICON_DIAMOND_FILLED = `<svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><polygon points="7,1.5 12.5,7 7,12.5 1.5,7"/></svg>`
const ICON_PULSE = `<svg ${ICON_ATTRS}><polyline points="0.5,7 3,7 4.5,3 7,11 8.5,7 13.5,7"/></svg>`
const ICON_LIST = `<svg ${ICON_ATTRS}><line x1="2" y1="3.5" x2="12" y2="3.5"/><line x1="2" y1="7" x2="12" y2="7"/><line x1="2" y1="10.5" x2="12" y2="10.5"/></svg>`
const ICON_CHART = `<svg ${ICON_ATTRS}><line x1="2.5" y1="11.5" x2="2.5" y2="7"/><line x1="7" y1="11.5" x2="7" y2="2.5"/><line x1="11.5" y1="11.5" x2="11.5" y2="5"/></svg>`
const ICON_CREDIT_CARD = `<svg ${ICON_ATTRS}><rect x="2" y="3.5" width="10" height="7" rx="0"/><line x1="2" y1="5.5" x2="12" y2="5.5"/><line x1="3.5" y1="8.5" x2="5.5" y2="8.5"/></svg>`
const ICON_HEARTBEAT = `<svg ${ICON_ATTRS}><polyline points="1,7 3.5,7 5,3 7,11 8.5,7 13,7"/></svg>`
const ICON_CLOSE = `<svg ${ICON_ATTRS}><line x1="3.5" y1="3.5" x2="10.5" y2="10.5"/><line x1="10.5" y1="3.5" x2="3.5" y2="10.5"/></svg>`

/* ---------- settings ---------- */
let config = null
let apiKeyState = {}
let providerDetections = {}

function alertReserveSelect(id, p) {
  const value = p.alertsEnabled === false ? 'off' : p.alertReservePct ? String(p.alertReservePct) : 'inherit'
  const option = (v, label) => `<option value="${v}" ${value === v ? 'selected' : ''}>${label}</option>`
  return `
    <select class="alert-select" data-alert-reserve="${h(id)}" title="Reset alert floor">
      ${option('inherit', 'Warn auto')}
      ${option('off', 'Warn off')}
      ${option('15', 'Warn 15%')}
      ${option('25', 'Warn 25%')}
      ${option('40', 'Warn 40%')}
      ${option('60', 'Warn 60%')}
    </select>`
}

function settingsRow(id, p) {
  const accent = ACCENT[id] || '#8b8f84'
  const glyph = GLYPH[id] || p.name[0]
  const detected = snap?.providers?.find((provider) => provider.id === id)
  const connected = !!detected?.connected
  const plan = detected?.plan || p.plan
  const monthly = Number(detected?.monthly ?? p.monthly) || 0
  const isKey = KEY_PROVIDERS.has(id)
  const hasKey = !!apiKeyState[id]
  const price = monthly > 0 ? `${money(monthly)}/mo cap` : 'not counted'
  let state
  if (connected) state = 'detected'
  else if (isKey && !hasKey)
    state =
      id === 'cursor' || id === 'windsurf' || id === 'opencode' || id === 'opencodego' || id === 'alibaba' || id === 'ollama' || id === 'abacus' || id === 'amp' || id === 'factory' || id === 'augment' || id === 'perplexity' || id === 'mimo' || id === 't3chat' || id === 'grok'
        ? 'add cookie'
        : 'add API key'
  else if (isKey && hasKey)
    state =
      id === 'cursor' || id === 'windsurf' || id === 'opencode' || id === 'opencodego' || id === 'alibaba' || id === 'ollama' || id === 'abacus' || id === 'amp' || id === 'factory' || id === 'augment' || id === 'perplexity' || id === 'mimo' || id === 't3chat'
        ? 'cookie saved · waiting'
        : 'key saved · waiting'
  else state = p.enabled ? 'waiting' : 'off'
  const keyRow = isKey
    ? `
      <div class="key-row" data-key-row="${h(id)}">
        <input class="key-input" type="password" placeholder="${id === 'cursor' ? 'Cookie: WorkosCursorSessionToken=...' : id === 'windsurf' ? 'devin_session_token=...; devin_auth1_token=...' : id === 'opencode' || id === 'opencodego' ? 'Cookie: auth=...; __Host-auth=...' : id === 'alibaba' ? 'cpk-... or Cookie: login_aliyunid_ticket=...' : id === 'ollama' ? 'OLLAMA_API_KEY or Cookie: session=...' : id === 'abacus' ? 'Cookie: apps.abacus.ai session...' : id === 'amp' ? 'Cookie: session=...' : id === 'factory' ? 'Cookie: access-token=... or Bearer ...' : id === 'antigravity' ? '{\"access_token\":\"...\",\"project_id\":\"optional\"}' : id === 'minimax' ? 'MINIMAX_CODING_API_KEY or Cookie/curl' : id === 'manus' ? 'session_id=... or MANUS_SESSION_TOKEN' : id === 'vertexai' ? 'gcloud ADC, access token, or credentials JSON' : id === 'synthetic' ? 'SYNTHETIC_API_KEY' : id === 'mimo' ? 'Cookie: api-platform_serviceToken=...; userId=...' : id === 't3chat' ? 'Cookie: session=... or full T3 Chat cURL' : id === 'bedrock' ? '{\"accessKeyID\":\"...\",\"secretAccessKey\":\"...\",\"region\":\"us-east-1\",\"budget\":250}' : id === 'augment' ? 'Cookie: __Secure-next-auth.session-token=...' : id === 'perplexity' ? 'Cookie: __Secure-authjs.session-token=...' : id === 'mistral' ? 'Cookie: ory_session_...; csrftoken=...' : id === 'commandcode' ? 'Cookie: __Secure-better-auth.session_token=...' : id === 'grok' ? 'Cookie: sso=...; sso-rw=... or Bearer ...' : id === 'warp' ? 'wpa_...' : id === 'kilo' ? 'KILO_API_KEY or run kilo login' : id === 'codebuff' ? 'CODEBUFF_API_KEY or run codebuff login' : id === 'crof' ? 'CROF_API_KEY' : id === 'venice' ? 'VENICE_API_KEY' : id === 'deepgram' ? '{\"apiKey\":\"...\",\"projectID\":\"optional\"}' : id === 'stepfun' ? 'Oasis-Token=...' : id === 'llmproxy' ? '{\"apiKey\":\"...\",\"baseURL\":\"https://proxy.example.com\"}' : id === 'zai' ? 'Z_AI_API_KEY or {\"apiKey\":\"...\",\"region\":\"bigmodel-cn\"}' : id === 'elevenlabs' ? 'ELEVENLABS_API_KEY' : id === 'moonshot' ? 'MOONSHOT_API_KEY' : id === 'kimik2' ? 'KIMI_K2_API_KEY' : id === 'doubao' ? 'ARK_API_KEY' : id === 'azureopenai' ? '{\"apiKey\":\"...\",\"endpoint\":\"...\",\"deploymentName\":\"...\"}' : id === 'groq' ? 'GROQ_API_KEY' : id === 'copilot' ? 'GitHub OAuth token' : id === 'openrouter' ? 'sk-or-...' : id === 'openai' ? 'sk-admin-...' : 'sk-...'}" autocomplete="off" spellcheck="false" />
        <button class="key-save" data-key-save="${h(id)}">${hasKey ? 'Replace' : 'Save'}</button>
        ${id === 'copilot' ? `<button class="key-save" data-copilot-login>${hasKey ? 'Reconnect' : 'Connect'}</button>` : ''}
        ${hasKey ? `<button class="key-clear" data-key-clear="${h(id)}" title="Remove saved key">×</button>` : ''}
      </div>`
    : ''
  return `
    <div class="sub-row ${isKey ? 'has-key-row' : ''}" data-id="${h(id)}" draggable="true" style="--accent:${accent}">
      <div class="sub-row-main">
        <span class="drag-handle" aria-label="Drag to reorder" title="Drag to reorder">
          <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
            <circle cx="5" cy="3.5" r="0.6" fill="currentColor"/>
            <circle cx="9" cy="3.5" r="0.6" fill="currentColor"/>
            <circle cx="5" cy="7" r="0.6" fill="currentColor"/>
            <circle cx="9" cy="7" r="0.6" fill="currentColor"/>
            <circle cx="5" cy="10.5" r="0.6" fill="currentColor"/>
            <circle cx="9" cy="10.5" r="0.6" fill="currentColor"/>
          </svg>
        </span>
        ${providerIcon(id, glyph)}
        <span class="sub-info">
          <div class="sn">${h(p.name)}</div>
          <div class="sp">${h(plan)} · ${state}</div>
        </span>
        ${alertReserveSelect(id, p)}
        <span class="price-chip">${h(price)}</span>
        <span class="toggle ${p.enabled ? 'on' : ''}" data-toggle></span>
      </div>
      ${keyRow}
    </div>`
}

function onboardingRow(id, p) {
  const accent = ACCENT[id] || '#8b8f84'
  const glyph = GLYPH[id] || p.name[0]
  const detection = providerDetections[id]
  const detail = detection?.detected ? `detected · ${detection.reason || 'local evidence'}` : `${p.plan} · ${money(p.monthly)}/mo`
  return `
    <div class="sub-row" data-id="${h(id)}" style="--accent:${accent}">
      <div class="sub-row-main">
        ${providerIcon(id, glyph)}
        <span class="sub-info">
          <div class="sn">${h(p.name)}</div>
          <div class="sp">${h(detail)}</div>
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

function updatePrefMetas() {
  const onCount = ['missions-toggle', 'maxx-alerts-toggle', 'session-quota-toggle', 'quota-warning-toggle']
    .filter((id) => $(id) && $(id).classList.contains('on')).length
  const notif = $('pref-meta-notifications')
  if (notif) notif.textContent = onCount === 0 ? 'all off' : `${onCount} on`
  const trayLabel = {
    left: 'value left', spent: 'spent', percent: 'used %', target: 'next maxx', reset: 'next reset', tokens: 'tokens',
  }[($('tray-metric') && $('tray-metric').value) || 'left'] || 'value left'
  const app = $('pref-meta-app')
  if (app) app.textContent = `tray · ${trayLabel}`
  const upd = $('pref-meta-updates')
  if (upd && updateState && updateState.version) upd.textContent = `v${updateState.version}`
}

function orderedProviderEntries() {
  const order = Array.isArray(config.providerOrder) ? config.providerOrder : []
  const seen = new Set()
  const out = []
  for (const id of order) {
    if (config.providers[id] && !seen.has(id)) { seen.add(id); out.push([id, config.providers[id]]) }
  }
  for (const [id, p] of Object.entries(config.providers)) {
    if (!seen.has(id)) out.push([id, p])
  }
  return out
}

function wireSettingsDragAndDrop() {
  const list = $('settings-body')
  if (!list) return
  let dragId = null
  list.querySelectorAll('.sub-row').forEach((row) => {
    row.addEventListener('dragstart', (e) => {
      dragId = row.dataset.id
      row.classList.add('dragging')
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId) } catch {}
    })
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging')
      list.querySelectorAll('.sub-row.drag-over').forEach((el) => el.classList.remove('drag-over'))
      dragId = null
    })
    row.addEventListener('dragover', (e) => {
      e.preventDefault()
      if (!dragId || row.dataset.id === dragId) return
      const rect = row.getBoundingClientRect()
      const before = (e.clientY - rect.top) < rect.height / 2
      list.querySelectorAll('.sub-row.drag-over').forEach((el) => el.classList.remove('drag-over'))
      row.classList.add('drag-over')
      const dragRow = list.querySelector(`.sub-row[data-id="${dragId}"]`)
      if (!dragRow) return
      if (before) row.parentNode.insertBefore(dragRow, row)
      else row.parentNode.insertBefore(dragRow, row.nextSibling)
    })
    row.addEventListener('drop', (e) => { e.preventDefault() })
  })
}

function renderSettings() {
  $('settings-body').innerHTML = orderedProviderEntries()
    .map(([id, p]) => settingsRow(id, p))
    .join('')
  wireSettingsDragAndDrop()
  $('open-at-login').classList.toggle('on', config.openAtLogin !== false)
  $('missions-toggle').classList.toggle('on', config.missions === true)
  $('maxx-alerts-toggle').classList.toggle('on', config.maxxAlertsEnabled !== false)
  $('session-quota-toggle').classList.toggle('on', config.sessionQuotaNotificationsEnabled !== false)
  $('quota-warning-toggle').classList.toggle('on', config.quotaWarningNotificationsEnabled === true)
  $('maxx-alert-hours').value = String(config.maxxAlertHours || 48)
  $('maxx-alert-reserve').value = String(config.maxxAlertReservePct || 25)
  $('quota-warning-session').value = thresholdValue(config.quotaWarningSessionThresholds || config.quotaWarningThresholds)
  $('quota-warning-weekly').value = thresholdValue(config.quotaWarningWeeklyThresholds || config.quotaWarningThresholds)
  $('tray-metric').value = config.trayMetric || 'left'
  $('token-history-days').value = String(config.tokenHistoryDays || 30)
  $('missions-toggle').onclick = () => { $('missions-toggle').classList.toggle('on'); updatePrefMetas() }
  $('maxx-alerts-toggle').onclick = () => { $('maxx-alerts-toggle').classList.toggle('on'); updatePrefMetas() }
  $('session-quota-toggle').onclick = () => { $('session-quota-toggle').classList.toggle('on'); updatePrefMetas() }
  $('quota-warning-toggle').onclick = () => { $('quota-warning-toggle').classList.toggle('on'); updatePrefMetas() }
  document.querySelectorAll('.settings-billing select').forEach((el) => el.addEventListener('change', updatePrefMetas))
  updatePrefMetas()
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

function thresholdValue(raw) {
  const values = Array.isArray(raw) ? raw.map((value) => Number(value)).filter((value) => Number.isFinite(value)) : [50, 20]
  const sorted = [...new Set(values)].sort((a, b) => b - a)
  const value = sorted.slice(0, 2).join(',')
  return ['50,20', '40,15', '25,10', '20,0'].includes(value) ? value : '50,20'
}

function thresholdsFromSelect(id) {
  return ($(id).value || '50,20').split(',').map((value) => Number(value)).filter((value) => Number.isFinite(value))
}

function collectSettings() {
  const providers = { ...config.providers }
  const providerOrder = []
  $('settings-body')
    .querySelectorAll('.sub-row')
    .forEach((row) => {
      const id = row.dataset.id
      providerOrder.push(id)
      const alertValue = row.querySelector('[data-alert-reserve]')?.value || 'inherit'
      providers[id] = {
        ...providers[id],
        enabled: row.querySelector('[data-toggle]').classList.contains('on'),
        alertsEnabled: alertValue === 'off' ? false : undefined,
        alertReservePct: alertValue === 'inherit' || alertValue === 'off' ? undefined : Number(alertValue),
      }
    })
  return {
    billingDay: Number(config.billingDay) || 1,
    openAtLogin: $('open-at-login').classList.contains('on'),
    maxxAlertsEnabled: $('maxx-alerts-toggle').classList.contains('on'),
    maxxAlertHours: Number($('maxx-alert-hours').value) || 48,
    maxxAlertReservePct: Number($('maxx-alert-reserve').value) || 25,
    sessionQuotaNotificationsEnabled: $('session-quota-toggle').classList.contains('on'),
    quotaWarningNotificationsEnabled: $('quota-warning-toggle').classList.contains('on'),
    quotaWarningSessionEnabled: true,
    quotaWarningWeeklyEnabled: true,
    quotaWarningThresholds: thresholdsFromSelect('quota-warning-session'),
    quotaWarningSessionThresholds: thresholdsFromSelect('quota-warning-session'),
    quotaWarningWeeklyThresholds: thresholdsFromSelect('quota-warning-weekly'),
    trayMetric: $('tray-metric').value || 'left',
    tokenHistoryDays: Number($('token-history-days').value) || 30,
    onboardingComplete: config.onboardingComplete === true,
    missions: $('missions-toggle').classList.contains('on'),
    providerOrder,
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
    startBtn.textContent = 'Copy prompt'
    startBtn.dataset.mode = 'copy'
    startBtn.title = `${idea.cli} can't take a prompt directly — copy it and paste it in`
  } else {
    startBtn.textContent = 'Start build'
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
  const providerLink = event.target.closest('[data-provider-link]')
  if (providerLink) {
    const id = providerLink.dataset.providerId
    const kind = providerLink.dataset.providerLink
    if (id && kind) window.maxx.openProviderLink(id, kind).catch(() => {})
    return
  }

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

$('maxx-target').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-open-forge], .maxx-target-action')
  if (!button) return
  await openForge()
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
$('receipt-toggle').addEventListener('click', () => {
  receiptCollapsed = !receiptCollapsed
  localStorage.setItem('maxxtoken-receipt-collapsed', String(receiptCollapsed))
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
$('open-debug-log').addEventListener('click', () => window.maxx.openDebugLog())
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
    providerDetections = await window.maxx.detectProviders().catch(() => ({}))
    for (const [id, detection] of Object.entries(providerDetections)) {
      if (detection?.detected && config.providers?.[id]) {
        config.providers[id] = { ...config.providers[id], enabled: true }
      }
    }
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
