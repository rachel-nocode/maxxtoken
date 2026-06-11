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
let snapshotLoading = false
let syncingNow = false
const expandedProviders = new Set()
let activeSaveProvider = null
let saveModeScanResult = null
let refreshingProvider = null
let modelFitGoal = ''
let modelFitDir = ''
let modelFitResult = null
let modelFitLoading = false
const THEME_KEY = 'maxxtoken-theme'

function currentTheme() {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
}

function applyTheme(theme = currentTheme()) {
  document.documentElement.dataset.theme = theme
  if (document.body) document.body.dataset.theme = theme
  localStorage.setItem(THEME_KEY, theme)
}

applyTheme()

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

function usageMeterMode() {
  return config?.usageMeterMode === 'left' ? 'left' : 'used'
}

function meterDisplay(usedPct, remainingPct = null) {
  const used = Math.max(0, Math.min(100, Math.round(Number(usedPct) || 0)))
  if (usageMeterMode() === 'left') {
    const explicit = Number(remainingPct)
    const left = Number.isFinite(explicit)
      ? Math.max(0, Math.min(100, Math.round(explicit)))
      : 100 - used
    return { pct: left, value: `${left}%`, label: 'left', title: `${left}% left` }
  }
  return { pct: used, value: `${used}%`, label: 'used', title: `${used}% used` }
}

function quotaWarningMarkers(kind) {
  return quotaWarningThresholdsFor(kind)
    .map((threshold) => Number(threshold))
    .filter((threshold) => Number.isFinite(threshold) && threshold > 0)
    .map((threshold) => {
      const t = Math.max(0, Math.min(99, Math.round(threshold)))
      return usageMeterMode() === 'left' ? t : 100 - t
    })
    .filter((pct) => pct > 0 && pct < 100)
    .sort((a, b) => a - b)
    .map((pct) => `<i class="quota-marker" style="left:${pct}%" aria-hidden="true"></i>`)
    .join('')
}

function meterWithMarkers(pct, tone, kind, className = 'prov-meter') {
  return `<div class="usage-bar-slot"><div class="${className}"><span class="${tone}" style="width:${pct}%"></span>${quotaWarningMarkers(kind)}</div></div>`
}

function compactWindowLabel(w) {
  const kind = quotaWarningKind(w)
  if (kind === 'session') return '5H'
  if (kind === 'weekly') return '7D'
  if (w?.kind === 'cycle') return '30D'
  return String(w?.label || w?.kind || 'usage').slice(0, 4).toUpperCase()
}

function compactMeterFill(pct, kind, remainingPct = null) {
  const usedPct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)))
  const meter = meterDisplay(usedPct, remainingPct)
  const tone = usageTone(usedPct)
  return `<div class="prov-meter prov-meter-compact"><span class="${tone}" style="width:${meter.pct}%"></span>${quotaWarningMarkers(kind)}</div>`
}

function compactPaceRail(w, usedPct) {
  const expectedPct =
    w.pace && Number.isFinite(Number(w.pace.expectedUsedPercent))
      ? Math.max(0, Math.min(100, Math.round(Number(w.pace.expectedUsedPercent))))
      : usedPct
  const projectedPct =
    w.pace && Number.isFinite(Number(w.pace.projectedAtResetPercent))
      ? Number(w.pace.projectedAtResetPercent)
      : null
  return paceRailSvg(usedPct, expectedPct, projectedPct)
}

function collapsedFallbackLine(pct, kind) {
  const usedPct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)))
  const meter = meterDisplay(usedPct)
  const label = kind === 'weekly' ? '7D' : '5H'
  return `
    <div class="prov-window-bars">
      <div class="prov-window-line" title="Usage · ${h(meter.title)}">
        <span class="prov-window-label mono">${label}</span>
        ${compactMeterFill(usedPct, kind)}
        <span class="prov-window-pct mono">${h(meter.value)}</span>
      </div>
    </div>`
}

function pickCollapsedWindows(windows = []) {
  const has = (w) => w && Number.isFinite(Number(w.usedPct))
  const lower = (w) => String(`${w?.label || ''} ${w?.kind || ''}`).toLowerCase()
  const session = windows.find((w) => has(w) && quotaWarningKind(w) === 'session' && lower(w).includes('session'))
    || windows.find((w) => has(w) && quotaWarningKind(w) === 'session')
  const weekly = windows.find((w) => has(w) && quotaWarningKind(w) === 'weekly' && lower(w).includes('weekly'))
    || windows.find((w) => has(w) && quotaWarningKind(w) === 'weekly')
  const picked = [session, weekly].filter(Boolean)
  for (const window of windows) {
    if (picked.length >= 2) break
    if (has(window) && !picked.includes(window)) picked.push(window)
  }
  return picked.slice(0, 2)
}

function fallbackUsageRow(pct, kind) {
  const usedPct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)))
  const meter = meterDisplay(usedPct)
  const tierLabel = kind === 'weekly' ? 'WEEKLY · 7D' : 'SESSION · 5H'
  return `
    <div class="usage-window onpace">
      <div class="usage-window-head">
        <span class="usage-window-name">Usage</span>
        <span class="usage-window-tier mono">${tierLabel}</span>
      </div>
      ${meterWithMarkers(meter.pct, usageTone(usedPct), kind)}
      <div class="usage-window-foot">
        <span class="usage-window-pct mono">${h(meter.value).replace('%', '<i>%</i>')} ${h(meter.label)}</span>
        <span class="usage-window-reset mono">—</span>
      </div>
    </div>`
}

function collapsedWindowBars(p, fallbackPct, fallbackKind) {
  const windows = pickCollapsedWindows(p.windows || [])
  if (!windows.length) return collapsedFallbackLine(fallbackPct, fallbackKind)
  return `
    <div class="prov-window-bars">
      ${windows
        .map((w) => {
          const pct = Math.max(0, Math.min(100, Math.round(Number(w.usedPct) || 0)))
          const meter = meterDisplay(pct, w.remainingPct)
          return `
            <div class="prov-window-line" title="${h(w.label || 'Usage')} · ${h(meter.title)}">
              <span class="prov-window-label mono">${h(compactWindowLabel(w))}</span>
              ${usageMeterMode() === 'left' ? compactMeterFill(pct, quotaWarningKind(w), w.remainingPct) : compactPaceRail(w, pct)}
              <span class="prov-window-pct mono">${h(meter.value)}</span>
            </div>`
        })
        .join('')}
    </div>`
}

function paceRailSvg(usedPct, expectedPct, projectedPct = null) {
  const a = Math.max(0, Math.min(100, usedPct))
  const e = Math.max(0, Math.min(100, expectedPct))
  const ahead = a < e - 2
  const behind = a > e + 2
  const uid = `pr${Math.random().toString(36).slice(2, 9)}`
  const tickX = Math.max(0, Math.min(99.6, e - 0.2))
  const burnout = Number.isFinite(projectedPct) && projectedPct >= 100 && a < 100
  // Theme-aware stripe green: the bright lime washes out on the light paper bg,
  // so deepen it to match the rest of the light theme.
  const stripe = currentTheme() === 'light' ? '#5faa12' : '#b6f24a'
  return `
    <div class="prov-rail ${ahead ? 'reserve' : behind ? 'deficit' : 'onpace'}">
      <svg class="prov-rail-svg" viewBox="0 0 100 18" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id="${uid}" patternUnits="userSpaceOnUse" width="3" height="10" patternTransform="rotate(45)">
            <rect width="1.5" height="10" fill="${stripe}"/>
          </pattern>
        </defs>
        <rect class="pr-track" x="0" y="4" width="100" height="10"/>
        <rect class="pr-fill" x="0" y="4" width="${behind ? e : a}" height="10"/>
        ${behind ? `<rect class="pr-stripes" x="${e}" y="4" width="${Math.max(0, a - e)}" height="10" fill="url(#${uid})"/>` : ''}
        ${ahead ? `<rect class="pr-reserve" x="${a}" y="15.2" width="${e - a}" height="1.2"/>` : ''}
        ${burnout ? `<rect class="pr-burnout" x="99.2" y="2" width="0.8" height="14"/>` : ''}
        <rect class="pr-tick" x="${tickX}" y="2" width="0.8" height="14"/>
      </svg>
    </div>`
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

function windowRow(w) {
  const usedPct = Math.max(0, Math.min(100, Math.round(w.usedPct || 0)))
  const meter = meterDisplay(usedPct, w.remainingPct)
  const expectedPct =
    w.pace && Number.isFinite(Number(w.pace.expectedUsedPercent))
      ? Math.max(0, Math.min(100, Math.round(Number(w.pace.expectedUsedPercent))))
      : usedPct
  const left = w.resetAt ? w.resetAt - Date.now() : Infinity
  const urgent =
    w.resetAt &&
    ((w.kind === '5h' && left < 90 * 60000 && w.usedPct < 50) ||
      (w.kind !== '5h' && left < 2 * 86400000 && w.usedPct < 60))
  const tierLabel =
    w.kind === '5h'
      ? 'SESSION · 5H'
      : w.kind === 'cycle'
        ? 'BILLING · 30D'
        : w.kind === 'agent-sdk-credit'
          ? 'CREDIT · MO'
          : 'WEEKLY · 7D'
  const ahead = expectedPct - usedPct > 2
  const behind = usedPct - expectedPct > 2
  const paceClass = ahead ? 'ahead' : behind ? 'behind' : 'onpace'
  const projectedPct = w.pace && Number.isFinite(Number(w.pace.projectedAtResetPercent))
    ? Number(w.pace.projectedAtResetPercent)
    : null
  const isCredit = w.kind === 'agent-sdk-credit'
  const footValue =
    isCredit && Number.isFinite(Number(w.spentUSD))
      ? usageMeterMode() === 'left'
        ? `${h(moneyExact(Math.max(0, Number(w.leftUSD) || 0)))} left`
        : `${h(moneyExact(Number(w.spentUSD)))} / ${h(money(w.creditUSD))} used`
      : isCredit && w.valueLabel
        ? h(w.valueLabel)
        : `${h(meter.value).replace('%', '<i>%</i>')} ${h(meter.label)}`
  return `
    <div class="usage-window ${paceClass}">
      <div class="usage-window-head">
        <span class="usage-window-name">${h(w.label)}</span>
        <span class="usage-window-tier mono">${h(tierLabel)}</span>
      </div>
      ${usageMeterMode() === 'left' ? meterWithMarkers(meter.pct, usageTone(usedPct), quotaWarningKind(w)) : paceRailSvg(usedPct, expectedPct, projectedPct)}
      <div class="usage-window-foot">
        <span class="usage-window-pct mono">${footValue}</span>
        <span class="usage-window-reset mono ${urgent ? 'urgent' : ''}" data-reset="${w.resetAt || ''}">${countdown(w.resetAt)}</span>
      </div>
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
  return `<span class="status-pill ${h(status.indicator || 'unknown')}" title="${h(label)}" aria-label="${h(label)}" role="img"></span>`
}

function providerLinkStack(p) {
  const links = p.links || {}
  const status = p.status || {}
  const statusLabel = status.description || status.label || 'Status page'
  const items = [
    links.status
      ? `
        <button class="provider-mini-link status ${h(status.indicator || 'unknown')}" data-provider-id="${h(p.id)}" data-provider-link="status" aria-label="Open ${h(p.name)} status" title="${h(statusLabel)}"></button>`
      : null,
    links.dashboard
      ? `
        <button class="provider-mini-link dashboard" data-provider-id="${h(p.id)}" data-provider-link="dashboard" aria-label="Open ${h(p.name)} usage dashboard" title="Usage dashboard">
          ${ICON_CHART}
        </button>`
      : null,
  ].filter(Boolean)
  if (!items.length) return ''
  return `<span class="provider-link-stack">${items.join('')}</span>`
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

// Short, glanceable label for an active provider incident.
const INCIDENT_LABEL = {
  minor: 'Degraded',
  major: 'Outage',
  critical: 'Critical',
  maintenance: 'Maintenance',
}

// Only minor/major/critical/maintenance are "active" incidents worth a badge.
// 'none' (operational) and 'unknown' (status page unreachable) stay silent.
function isActiveIncident(status) {
  return !!status && Object.prototype.hasOwnProperty.call(INCIDENT_LABEL, status.indicator)
}

// A clickable incident pill rendered next to the provider name when its status
// page reports a live issue. Opens the provider status page (reuses the
// data-provider-link handler). Full detail lives in the tooltip.
function providerIncidentBadge(p) {
  const status = p.status
  if (!isActiveIncident(status)) return ''
  const label = INCIDENT_LABEL[status.indicator]
  const detail = [status.label || label]
  if (status.description) detail.push(status.description)
  if (status.updatedAt) detail.push(`updated ${syncAge(status.updatedAt)}`)
  return `
    <button class="prov-incident ${h(status.indicator)}" data-provider-id="${h(p.id)}" data-provider-link="status" aria-label="${h(p.name)} status: ${h(detail.join(' — '))}" title="${h(detail.join(' — '))}">
      ${h(label)}
    </button>`
}

// "Why is this number old?" — the tooltip text behind the activity dot.
function freshnessHint(p) {
  const base = p.lastUpdatedAt ? `Updated ${syncAge(p.lastUpdatedAt)}` : 'No successful update yet'
  if (p.error) return `${base}. Last refresh failed: ${p.error}`
  if (p.activity === 'stale') return `${base}. No new ${p.name} activity since — showing last known usage.`
  if (p.activity === 'live') return `${base}. Live — recently active.`
  return `${base}.`
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

function tokenNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function tokenPercent(part, total) {
  const t = Math.max(1, tokenNumber(total))
  return Math.round((tokenNumber(part) / t) * 100)
}

function burnCause(provider, options = {}) {
  const id = provider.id
  const providerName = provider.name || (id === 'codex' ? 'Codex' : id === 'claude' ? 'Claude' : 'this provider')
  const model = options.model || 'this model'
  const usage = provider.tokenUsage || {}
  const total = tokenNumber(usage.total)
  const input = tokenNumber(usage.input)
  const cached = tokenNumber(usage.cached)
  const output = tokenNumber(usage.output)
  const uncachedInput = tokenNumber(usage.uncachedInput ?? Math.max(0, input - cached))
  const cacheCreation = tokenNumber(usage.cacheCreation)
  const priorityEvents = tokenNumber(usage.priorityEvents)
  const events = tokenNumber(usage.events || usage.requests)
  const inputPct = tokenPercent(uncachedInput || input, total)
  const cachedPct = tokenPercent(cached + cacheCreation, total)
  const outputPct = tokenPercent(output, total)
  const tokenSplit = `${inputPct}% fresh input, ${cachedPct}% cache, ${outputPct}% output`

  if (id === 'codex' && priorityEvents && (!events || priorityEvents / events >= 0.25)) {
    return {
      label: 'Agent work',
      text: `${model} shows ${priorityEvents} priority events. That is multi-step agent work, not one light chat.`,
      action: `For ${providerName}, split the next task into one checkpoint and stop before follow-up cleanup.`,
    }
  }
  if (id === 'claude' && cacheCreation && tokenPercent(cacheCreation, total) >= 25) {
    return {
      label: 'Context rebuild',
      text: `${model} spent ${tokens(cacheCreation)} creating cache. Claude likely rebuilt project context.`,
      action: 'Before next Claude run, compact first and point it at only the files for this change.',
    }
  }
  if (inputPct >= 45) {
    return {
      label: 'Large context load',
      text: `${model} burned ${tokens(uncachedInput || input)} on fresh input (${tokenSplit}).`,
      action: `Next ${providerName} run: reference 1-3 files, avoid whole folders, and ask for a plan before edits.`,
    }
  }
  if (outputPct >= 40) {
    return {
      label: 'Long output',
      text: `${model} generated ${tokens(output)} output tokens (${tokenSplit}).`,
      action: `Next ${providerName} run: ask for patch-only output, one file at a time, no recap.`,
    }
  }
  if (cachedPct >= 40) {
    return {
      label: 'Cached context read',
      text: `${model} reread ${tokens(cached + cacheCreation)} cached tokens (${tokenSplit}).`,
      action: `Next ${providerName} run: compact or start fresh, then paste a short handoff instead of carrying the whole thread.`,
    }
  }
  return {
    label: 'Mixed burn',
    text: `${model} split burn across sources (${tokenSplit}).`,
    action: `Next ${providerName} run: keep the task narrow and stop after the first passing check.`,
  }
}

function modelBurnCause(provider, row, rowTotal) {
  return burnCause({
    id: provider?.id,
    name: provider?.name,
    tokenUsage: {
      ...row,
      total: rowTotal,
      priorityEvents: row.priorityEvents ?? provider?.tokenUsage?.priorityEvents,
      events: row.events ?? row.requests,
    },
  }, {
    model: row.model || row.modelName || 'this model',
  })
}

function modelBurnTip(cause) {
  return `
    <div class="token-model-tip" role="tooltip">
      <b>${h(cause.label)}</b>
      <p>${h(cause.action)}</p>
      <span>${h(cause.text)}</span>
    </div>`
}

function providerCliName(provider) {
  return {
    claude: 'claude',
    codex: 'codex',
    cursor: 'cursor',
    windsurf: 'windsurf',
    gemini: 'gemini',
    opencode: 'opencode',
    opencodego: 'opencode',
  }[provider?.id] || provider?.name || 'this model'
}

function focusedSavePrompt(provider, signal) {
  const name = provider?.name || 'this model'
  const extra = signal?.kind === 'output'
    ? 'Return patch-only output. Do not reprint full files.'
    : signal?.kind === 'agent'
      ? 'Stop after the first checkpoint and wait for confirmation.'
      : signal?.kind === 'input'
        ? 'Do not scan unrelated folders or read files outside the list.'
        : 'Ignore prior chat unless pasted here.'
  return `Use ${name} in Save Mode.

Goal: [one concrete result]
Relevant files: [1-3 file paths]
Current blocker: [one sentence]
Next check: [command/test]

Rules:
- First give a 3-bullet plan.
- Then change only what is needed.
- ${extra}
- No recap. No broad repo scan.`
}

function handoffSavePrompt(provider) {
  const name = provider?.name || 'the model'
  return `Continue in ${name} from this short handoff only:

Goal: [one result]
Files touched: [paths]
What changed: [2-4 bullets]
Current blocker: [one sentence]
Next check: [command/test]

Ignore prior chat unless pasted here. Keep output short.`
}

function stopLossPrompt(provider) {
  const name = provider?.name || 'this model'
  return `Stop-loss rule for ${name}:

If the first fix fails twice, stop.
Report:
- files changed
- command/test run
- exact failure
- next file or question needed

Do not keep guessing across the repo.`
}

function compactCommand(provider, signal) {
  if (provider?.id === 'claude') {
    return signal?.kind === 'cache-create'
      ? '/compact Keep only the current goal, changed files, failing command, and next action.'
      : '/clear\n\n' + handoffSavePrompt(provider)
  }
  if (provider?.id === 'codex') return handoffSavePrompt(provider)
  if (provider?.id === 'cursor') return 'Start a new chat, attach only the relevant files, then paste:\n\n' + focusedSavePrompt(provider, signal)
  return focusedSavePrompt(provider, signal)
}

function strongestSaveSignal(provider) {
  if (!provider?.tokenUsage) return null
  const usage = provider.tokenUsage
  const total = tokenNumber(usage.total)
  if (!total) return null
  const input = tokenNumber(usage.input)
  const cached = tokenNumber(usage.cached)
  const output = tokenNumber(usage.output)
  const uncachedInput = tokenNumber(usage.uncachedInput ?? Math.max(0, input - cached))
  const cacheCreation = tokenNumber(usage.cacheCreation)
  const priorityEvents = tokenNumber(usage.priorityEvents)
  const events = tokenNumber(usage.events || usage.requests)
  const rows = Array.isArray(usage.dailyBreakdown) ? usage.dailyBreakdown : Array.isArray(usage.dailyUsage) ? usage.dailyUsage : []
  const topDay = rows
    .map((row) => ({ date: String(row.date || row.dayKey || row.day || ''), total: tokenNumber(row.total ?? row.totalTokens) }))
    .filter((row) => row.date && row.total > 0)
    .sort((a, b) => b.total - a.total)[0]
  const averageDay = rows.length ? rows.reduce((sum, row) => sum + tokenNumber(row.total ?? row.totalTokens), 0) / rows.length : 0
  const spike = topDay && averageDay > 0 && topDay.total >= averageDay * 1.6
  const candidates = []
  const add = (kind, score, label, evidence, action) => {
    if (score > 0) candidates.push({ kind, score, label, evidence, action })
  }

  add(
    'agent',
    provider.id === 'codex' && priorityEvents && (!events || priorityEvents / events >= 0.25) ? 98 : 0,
    'Agent loop risk',
    `${priorityEvents} priority events in ${provider.name}.`,
    'Use one checkpoint and stop before cleanup loops.',
  )
  add(
    'cache-create',
    cacheCreation ? tokenPercent(cacheCreation, total) + 30 : 0,
    'Context rebuild',
    `${tokens(cacheCreation)} cache-creation tokens.`,
    'Compact first and point the next run at fewer files.',
  )
  add(
    'cache',
    cached ? tokenPercent(cached, total) : 0,
    'Cached context reread',
    `${tokens(cached)} cached tokens, ${tokenPercent(cached, total)}% of burn.`,
    'Start fresh with a short handoff instead of carrying the whole thread.',
  )
  add(
    'input',
    uncachedInput ? tokenPercent(uncachedInput, total) : 0,
    'Large fresh input',
    `${tokens(uncachedInput)} fresh input tokens, ${tokenPercent(uncachedInput, total)}% of burn.`,
    'Reference 1-3 files and avoid whole-folder scans.',
  )
  add(
    'output',
    output ? tokenPercent(output, total) : 0,
    'Long output',
    `${tokens(output)} output tokens, ${tokenPercent(output, total)}% of burn.`,
    'Ask for patch-only output and one file at a time.',
  )
  add(
    'spike',
    spike ? 75 : 0,
    'Daily spike',
    `${topDay.date} used ${tokens(topDay.total)}, about ${Math.round(topDay.total / averageDay)}x normal.`,
    'Use Save Mode for the next similar task and compare after sync.',
  )

  const winner = candidates.sort((a, b) => b.score - a.score)[0]
  if (!winner || winner.score < 40) return null
  return {
    ...winner,
    providerId: provider.id,
    providerName: provider.name,
    compactText: compactCommand(provider, winner),
    focusedPrompt: focusedSavePrompt(provider, winner),
    handoffPrompt: handoffSavePrompt(provider),
    stopLossText: stopLossPrompt(provider),
    cli: providerCliName(provider),
  }
}

function saveModePanel(provider, signal) {
  const scan = saveModeScanResult && saveModeScanResult.providerId === provider.id ? saveModeScanResult : null
  const scanSummary = scan
    ? scan.canceled
      ? 'Scan canceled.'
      : scan.findings?.length
        ? `${scan.findings.length} context bloat candidates in ${scan.folderName}.`
        : `No obvious context bloat found in ${scan.folderName}.`
    : 'Optional: scan a project folder for files agents should not read by default.'
  return `
    <div class="save-mode-panel">
      <div class="save-mode-head">
        <span>Save Mode</span>
        <button class="save-mode-close" data-save-close="${h(provider.id)}" aria-label="Close Save Mode">${ICON_CLOSE}</button>
      </div>
      <b>${h(signal.label)}</b>
      <p>${h(signal.evidence)} ${h(signal.action)}</p>
      <div class="save-mode-actions">
        <button data-save-copy="${h(provider.id)}" data-save-kind="compact">Copy reset</button>
        <button data-save-copy="${h(provider.id)}" data-save-kind="focused">Copy prompt</button>
        <button data-save-copy="${h(provider.id)}" data-save-kind="stop">Copy stop rule</button>
        <button data-save-scan="${h(provider.id)}">Scan bloat</button>
      </div>
      <div class="save-mode-note">${h(scanSummary)}</div>
      ${scan?.findings?.length ? `
        <div class="save-mode-findings">
          ${scan.findings.slice(0, 4).map((item) => `<span>${h(item.label)} · ${h(item.detail)}</span>`).join('')}
        </div>` : ''}
    </div>`
}

function modelBreakdownRows(tokenUsage, provider) {
  const rows = Array.isArray(tokenUsage?.modelBreakdowns)
    ? tokenUsage.modelBreakdowns
    : Array.isArray(tokenUsage?.topModels)
      ? tokenUsage.topModels
      : []
  const total = Math.max(1, Number(tokenUsage?.total) || 0)
  return rows
    .filter((row) => Number(row?.total) > 0)
    .slice(0, 5)
    .map((row) => {
      const model = row.model || row.modelName || 'unknown'
      const rowTotal = Number(row.total) || 0
      const pct = Math.max(3, Math.round((rowTotal / total) * 100))
      const cost = Number(row.costUSD)
      const costText = Number.isFinite(cost) ? `${moneyMaybeExact(cost)} est.` : 'tokens only'
      const detail = [
        Number(row.input) > 0 ? `${tokens(row.input)} in` : null,
        Number(row.cached) > 0 ? `${tokens(row.cached)} cached` : null,
        Number(row.output) > 0 ? `${tokens(row.output)} out` : null,
      ].filter(Boolean).join(' · ')
      const cause = modelBurnCause(provider, row, rowTotal)
      return `
        <div class="token-model-row" tabindex="0" aria-label="${h(`${model}: ${cause.label}. ${cause.action}`)}">
          <div class="token-model-head">
            <span class="token-model-name" title="${h(model)}">${h(model)}</span>
            <span class="token-model-total mono">${tokens(rowTotal)}</span>
          </div>
          <div class="token-model-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
          <div class="token-model-foot">
            <span>${h(detail || 'token total')}</span>
            <span>${h(costText)}</span>
          </div>
          ${modelBurnTip(cause)}
        </div>`
    })
    .join('')
}

function localDayKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function tokenCostLine(label, usage) {
  const total = Number(usage?.total) || 0
  const cost = Number(usage?.costUSD)
  const hasCost = usage?.hasCost !== false || total === 0
  const costText = hasCost && Number.isFinite(cost) ? moneyMaybeExact(cost) : 'tokens only'
  return `
    <div class="token-cost-row">
      <span>${h(label)}</span>
      <b>${h(costText)} · ${tokens(total)} tokens</b>
    </div>`
}

function tokenCostRows(tokenUsage) {
  const rows = Array.isArray(tokenUsage?.dailyBreakdown)
    ? tokenUsage.dailyBreakdown
    : Array.isArray(tokenUsage?.dailyUsage)
      ? tokenUsage.dailyUsage
      : []
  const byDay = new Map()
  for (const row of rows) {
    const key = String(row?.date || row?.dayKey || row?.day || '')
    if (!key) continue
    const prev = byDay.get(key) || { total: 0, costUSD: 0, hasCost: false }
    const cost = Number(row.costUSD)
    byDay.set(key, {
      total: prev.total + (Number(row.total ?? row.totalTokens) || 0),
      costUSD: prev.costUSD + (Number.isFinite(cost) ? cost : 0),
      hasCost: prev.hasCost || Number.isFinite(cost),
    })
  }
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const todayUsage = byDay.get(localDayKey(today)) || { total: 0, costUSD: 0, hasCost: true }
  const yesterdayUsage = byDay.get(localDayKey(yesterday)) || { total: 0, costUSD: 0, hasCost: true }
  const totalCost = Number(tokenUsage?.costUSD)
  const hasTotalCost = Number.isFinite(totalCost) || rows.some((row) => Number.isFinite(Number(row.costUSD)))
  const totalUsage = {
    total: Number(tokenUsage?.total) || rows.reduce((sum, row) => sum + (Number(row.total ?? row.totalTokens) || 0), 0),
    costUSD: Number.isFinite(totalCost)
      ? totalCost
      : rows.reduce((sum, row) => sum + (Number(row.costUSD) || 0), 0),
    hasCost: hasTotalCost,
  }
  const historyDays = Number(tokenUsage?.historyDays) || 30
  const costLabel = tokenUsage?.costAccuracy === 'hypothetical' ? 'hypothetical' : 'estimated'
  return `
    <div class="token-costs">
      <div class="token-models-head">
        <span>Cost</span>
        <b>${h(costLabel)}</b>
      </div>
      ${tokenCostLine('Today', todayUsage)}
      ${tokenCostLine('Yesterday', yesterdayUsage)}
      ${tokenCostLine(`Last ${historyDays} days`, totalUsage)}
    </div>`
}

function serviceTierRows(tokenUsage) {
  const rows = Array.isArray(tokenUsage?.serviceTierBreakdowns)
    ? tokenUsage.serviceTierBreakdowns
    : Array.isArray(tokenUsage?.serviceTiers)
      ? tokenUsage.serviceTiers
      : []
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

function tokenDetails(tokenUsage, provider) {
  const costRows = tokenCostRows(tokenUsage)
  const tierRows = serviceTierRows(tokenUsage)
  const modelRows = modelBreakdownRows(tokenUsage, provider)
  if (!costRows && !tierRows && !modelRows) return ''
  const modelBreakdowns = tokenUsage.modelBreakdowns || tokenUsage.topModels || []
  const hiddenCount = Math.max(0, modelBreakdowns.length - 5)
  return `
    ${costRows}
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

  const meterKind = p.windows?.some((w) => quotaWarningKind(w) === 'weekly') ? 'weekly' : 'session'
  const collapsedMeters = collapsedWindowBars(p, usedPct || 0, meterKind)
  const summaryMeter = fallbackUsageRow(usedPct || 0, meterKind)
  const tokenUsage = p.tokenUsage || null
  const hasTokenSource = tokenUsage && Number.isFinite(Number(tokenUsage.total))
  const expandLabel = expanded ? 'Collapse details' : 'Show details'
  const linkStack = providerLinkStack(p)
  const expandedTokenDetails = expanded
    ? hasTokenSource
      ? tokenDetails(tokenUsage, p)
      : '<div class="token-missing">No token source yet</div>'
    : ''
  const saveSignal = config?.saveModeSuggestions === true && hasTokenSource ? strongestSaveSignal(p) : null
  const saveMode = saveSignal && expanded
    ? activeSaveProvider === p.id
      ? saveModePanel(p, saveSignal)
      : `
        <button class="save-mode-nudge" data-save-open="${h(p.id)}">
          <span>Reduce next run</span>
          <b>${h(saveSignal.label)}</b>
        </button>`
    : ''

  const stale = p.activity === 'stale' && !p.error
  const incidentBadge = providerIncidentBadge(p)
  const statusPanel = expanded && isActiveIncident(p.status) ? providerStatusPanel(p.status) : ''

  return `
    <div class="prov ${expanded ? 'open' : ''} ${p.urgent ? 'urgent' : ''} ${stale ? 'stale' : ''}" style="--accent:${accent}">
      <div class="prov-top">
        ${providerIcon(p.id, glyph)}
        <span class="prov-id">
          <span class="prov-name">${h(p.name)}</span>
          <span class="prov-sub">
            <span class="prov-fresh" title="${h(freshnessHint(p))}"><span class="activity-dot ${p.activity}"></span></span>
            <span class="prov-plan">${h(p.plan)}</span>
            ${incidentBadge}
          </span>
        </span>
        <span class="prov-pct">
          <span class="pn mono">${pct}</span>
          <span class="pl">${h(p.usageLabel || 'used')}</span>
        </span>
        ${linkStack}
        ${refreshButton}
        <button class="prov-expand" data-provider-toggle="${h(p.id)}" aria-label="${expandLabel} for ${h(p.name)}" aria-expanded="${expanded}">
          ${expanded ? ICON_CHEVRON_UP : ICON_CHEVRON_DOWN}
        </button>
      </div>
      ${expanded ? (hasWindows ? '' : summaryMeter) : collapsedMeters}
      ${body}
      ${statusPanel}
      ${expandedTokenDetails}
      ${saveMode}
    </div>`
}

const SYNC_INTERVAL_MINUTES = 15
const SYNC_INTERVAL_MS = SYNC_INTERVAL_MINUTES * 60 * 1000

function syncAge(generatedAt) {
  if (!generatedAt) return 'never'
  const ageSec = Math.max(0, Math.floor((Date.now() - generatedAt) / 1000))
  if (ageSec < 12) return 'just now'
  if (ageSec < 60) return `${ageSec}s ago`
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h ago`
  return '1d+ ago'
}

function formatSyncChip(generatedAt, loading = false) {
  if (loading) return { label: 'Sync', value: 'Syncing', className: 'syncing', title: 'Syncing usage now.' }
  const ageMs = generatedAt ? Date.now() - generatedAt : Number.POSITIVE_INFINITY
  return {
    label: 'Sync',
    value: `Every ${SYNC_INTERVAL_MINUTES}m`,
    className: ageMs > SYNC_INTERVAL_MS ? 'stale' : '',
    title: `Auto-sync every ${SYNC_INTERVAL_MINUTES} minutes. Last sync: ${syncAge(generatedAt)}.`,
  }
}

function footerChip(label, valueHtml, extraClass = '') {
  return `<span class="foot-chip ${extraClass}"><span class="fc-l">${label}</span><span class="fc-v num-display">${valueHtml}</span></span>`
}

function syncFooterChip(sync) {
  return `
    <button type="button" class="foot-chip sync-chip ${sync.className || ''}" id="sync-now" title="${h(sync.title)}" aria-label="${h(sync.title)}">
      <span class="fc-l">${h(sync.label)}</span>
      <span class="fc-v num-display">${h(sync.value)}</span>
    </button>`
}

function saveSignalForProvider(id) {
  const provider = (snap?.providers || []).find((p) => p.id === id)
  const signal = provider ? strongestSaveSignal(provider) : null
  return { provider, signal }
}

function modelFitProviderIds() {
  return (snap?.providers || [])
    .filter((provider) => provider.connected)
    .map((provider) => provider.id)
    .slice(0, 4)
}

function modelFitResults() {
  if (modelFitLoading) return '<div class="model-fit-note">Scoring live quota, reset timing, and estimated task size...</div>'
  if (!modelFitResult) return '<div class="model-fit-note">Pick a folder, describe the job, then let MaxxToken rank the best subscription to use.</div>'
  if (modelFitResult.ok === false) {
    const missing = Array.isArray(modelFitResult.missing) ? modelFitResult.missing.join(', ') : 'inputs'
    return `<div class="model-fit-note warn">Missing ${h(missing)}.</div>`
  }
  const recs = Array.isArray(modelFitResult.recommendations) ? modelFitResult.recommendations.slice(0, 3) : []
  const balance = Array.isArray(modelFitResult.balance) ? modelFitResult.balance : []
  const estimate = modelFitResult.estimate?.summary ? `<div class="model-fit-estimate">${h(modelFitResult.estimate.summary)}</div>` : ''
  return `
    ${estimate}
    <div class="model-fit-recs">
      ${recs.map((row) => `
        <div class="model-fit-rec ${h(row.tone || 'neutral')}">
          <div>
            <span>${h(row.label)}</span>
            <b>${h(row.providerName)}</b>
          </div>
          <i class="mono">${h(row.score)}</i>
          <p>${h([...(row.reasons || []), ...(row.cautions || [])][0] || row.action || 'Use for this job.')}</p>
        </div>`).join('')}
    </div>
    <div class="model-fit-balance">
      ${balance.map((row) => `
        <span class="${h(row.state)}">
          <b>${h(row.providerName)}</b>
          ${h(row.state === 'spend' ? 'spend now' : row.state === 'save' ? 'save quota' : 'balanced')}
        </span>`).join('')}
    </div>`
}

function modelFitCard() {
  const folderLabel = modelFitDir ? modelFitDir.split(/[\\/]/).filter(Boolean).pop() : 'No folder picked'
  const disabled = modelFitLoading ? 'disabled' : ''
  return `
    <div class="model-fit-card">
      <div class="model-fit-head">
        <span>${ICON_DIAL}</span>
        <div>
          <b>Best model for this job</b>
          <small>Balance underused plans against quota risk.</small>
        </div>
      </div>
      <div class="model-fit-folder">
        <button type="button" class="ghost-btn" data-model-fit-folder ${disabled}>Pick folder</button>
        <span title="${h(modelFitDir || '')}">${h(folderLabel)}</span>
      </div>
      <textarea id="model-fit-goal" class="model-fit-goal" placeholder="Describe the job you are about to run...">${h(modelFitGoal)}</textarea>
      <button type="button" class="model-fit-run" data-model-fit-run ${disabled}>
        ${modelFitLoading ? 'Scoring...' : 'Rank models'}
      </button>
      <div class="model-fit-output">${modelFitResults()}</div>
    </div>`
}

function skeletonProviderCards(count = 4) {
  return Array.from({ length: count }, () => `
    <div class="prov prov-skeleton" aria-hidden="true">
      <div class="prov-top">
        <span class="prov-icon sk-shimmer"></span>
        <span class="prov-id">
          <span class="sk-line wide"></span>
          <span class="sk-line narrow"></span>
        </span>
        <span class="sk-pct sk-shimmer"></span>
      </div>
      <div class="prov-meter sk-shimmer" aria-hidden="true"></div>
    </div>`).join('')
}

function skeletonFooterChips() {
  const chip = (label) => `
    <span class="foot-chip foot-chip-skeleton">
      <span class="fc-l">${label}</span>
      <span class="fc-v num-display">—</span>
    </span>`
  return chip('Spent') + chip('Left') + chip('Plans') + chip('Sync')
}

function forgeStageSkeleton(count = 3) {
  return `<div class="forge-stage-skeleton">${skeletonProviderCards(count)}</div>`
}

function mainEmptyPanel() {
  return `
    <div class="state-panel" role="status">
      <div class="state-mark" aria-hidden="true">✦</div>
      <h2>No plans connected yet</h2>
      <p>Run a provider CLI once on this Mac, or paste a key in Settings. Claude is the fastest first win.</p>
      <div class="state-actions">
        <button type="button" class="primary-btn" id="empty-open-settings">Open Settings</button>
        <button type="button" class="ghost-btn" id="empty-rescan">Scan again</button>
      </div>
    </div>`
}

function bindMainListActions() {
  const openSettings = $('empty-open-settings')
  if (openSettings) openSettings.onclick = () => showSettings()
  const rescan = $('empty-rescan')
  if (rescan) {
    rescan.onclick = async () => {
      snapshotLoading = true
      render()
      try {
        snap = await window.maxx.getSnapshot()
      } catch {
        /* next snapshot push can recover */
      }
      snapshotLoading = false
      render()
    }
  }
}

function renderFooterTotals() {
  const footEl = $('foot-left')
  if (!footEl) return
  if (!snap || snapshotLoading) {
    footEl.innerHTML = skeletonFooterChips()
    return
  }
  const t = snap.totals || {}
  const planVal = t.estimatedPlanCount ? `${t.planCount}<i>·${t.estimatedPlanCount}e</i>` : `${t.planCount ?? 0}`
  const sync = formatSyncChip(snap.generatedAt, syncingNow)
  footEl.innerHTML =
    footerChip('Spent', money(t.spent ?? t.captured), 'spent-chip') +
    footerChip('Left', money(t.left ?? t.remaining), 'left-chip') +
    footerChip('Plans', planVal) +
    syncFooterChip(sync)
}

function renderMainList() {
  const list = $('list')
  if (!list) return
  if (snapshotLoading || !snap) {
    list.innerHTML = skeletonProviderCards()
    return
  }
  const connected = (snap.providers || []).filter((p) => p.connected)
  if (!connected.length) {
    list.innerHTML = mainEmptyPanel()
    bindMainListActions()
    return
  }
  list.innerHTML = modelFitCard() + snap.providers.map(providerCard).join('')
}

function render() {
  renderFooterTotals()
  renderMainList()
}

function tickCountdowns() {
  document.querySelectorAll('[data-reset]').forEach((el) => {
    const r = Number(el.dataset.reset)
    if (r) el.textContent = countdown(r)
  })
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
const ICON_REFRESH = `<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.2 7.2A5.8 5.8 0 0 1 14.4 6"/><path d="M14.4 3.2V6h-2.8"/><path d="M14.8 12.8A5.8 5.8 0 0 1 5.6 14"/><path d="M5.6 16.8V14h2.8"/></svg>`
const ICON_SETTINGS = `<svg viewBox="0 0 18 18" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.6 2h2.8l.4 2c.45.15.88.4 1.25.72l1.95-.65 1.4 2.43-1.55 1.35c.08.48.08.82 0 1.3l1.55 1.35-1.4 2.43-1.95-.65c-.37.32-.8.57-1.25.72l-.4 2H7.6l-.4-2c-.45-.15-.88-.4-1.25-.72L4 12.93 2.6 10.5l1.55-1.35a4.2 4.2 0 0 1 0-1.3L2.6 6.5 4 4.07l1.95.65c.37-.32.8-.57 1.25-.72L7.6 2Z"/><circle cx="9" cy="9" r="2.15"/></svg>`
const ICON_DIAMOND = `<svg ${ICON_ATTRS}><polygon points="7,1.5 12.5,7 7,12.5 1.5,7"/></svg>`
const ICON_DIAMOND_FILLED = `<svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><polygon points="7,1.5 12.5,7 7,12.5 1.5,7"/></svg>`
const ICON_PULSE = `<svg ${ICON_ATTRS}><polyline points="0.5,7 3,7 4.5,3 7,11 8.5,7 13.5,7"/></svg>`
const ICON_LIST = `<svg ${ICON_ATTRS}><line x1="2" y1="3.5" x2="12" y2="3.5"/><line x1="2" y1="7" x2="12" y2="7"/><line x1="2" y1="10.5" x2="12" y2="10.5"/></svg>`
const ICON_CHART = `<svg ${ICON_ATTRS}><line x1="2.5" y1="11.5" x2="2.5" y2="7"/><line x1="7" y1="11.5" x2="7" y2="2.5"/><line x1="11.5" y1="11.5" x2="11.5" y2="5"/></svg>`
const ICON_CREDIT_CARD = `<svg ${ICON_ATTRS}><rect x="2" y="3.5" width="10" height="7" rx="0"/><line x1="2" y1="5.5" x2="12" y2="5.5"/><line x1="3.5" y1="8.5" x2="5.5" y2="8.5"/></svg>`
const ICON_HEARTBEAT = `<svg ${ICON_ATTRS}><polyline points="1,7 3.5,7 5,3 7,11 8.5,7 13,7"/></svg>`
const ICON_CLOSE = `<svg ${ICON_ATTRS}><line x1="3.5" y1="3.5" x2="10.5" y2="10.5"/><line x1="10.5" y1="3.5" x2="3.5" y2="10.5"/></svg>`
const ICON_CLOCK = `<svg ${ICON_ATTRS}><circle cx="7" cy="7" r="4.5"/><polyline points="7,4.5 7,7.2 9,8.5"/></svg>`
const ICON_DIAL = `<svg ${ICON_ATTRS}><circle cx="7" cy="7" r="4.5"/><path d="M7 7 L10 5"/><path d="M3.5 9.5 A4.5 4.5 0 0 1 10.5 9.5"/></svg>`
const ICON_STACK = `<svg ${ICON_ATTRS}><path d="M2.5 4.5 L7 2.5 L11.5 4.5 L7 6.5 Z"/><path d="M2.5 7 L7 9 L11.5 7"/><path d="M2.5 9.5 L7 11.5 L11.5 9.5"/></svg>`
const ICON_SHARE = `<svg ${ICON_ATTRS}><circle cx="4" cy="7" r="1.6"/><circle cx="10.5" cy="3.8" r="1.6"/><circle cx="10.5" cy="10.2" r="1.6"/><line x1="5.5" y1="6.2" x2="9" y2="4.5"/><line x1="5.5" y1="7.8" x2="9" y2="9.5"/></svg>`

/* ---------- settings ---------- */
let config = null
let apiKeyState = {}
let providerDetections = {}
const MISSIONS_ENABLED = false

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
  const isKey = KEY_PROVIDERS.has(id)
  const hasKey = !!apiKeyState[id]
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
        <span class="toggle ${p.enabled ? 'on' : ''}" data-toggle></span>
      </div>
      ${keyRow}
    </div>`
}

function onboardingRow(id, p) {
  const accent = ACCENT[id] || '#8b8f84'
  const glyph = GLYPH[id] || p.name[0]
  const detection = providerDetections[id]
  const detail = detection?.detected ? `detected · ${detection.reason || 'local evidence'}` : p.plan
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

// Which provider tiers the UI lists. Phase 1: only 'core' (the popular agents).
// Phase 2 will reveal 'extended' behind a "more providers" drawer. 'hidden' never lists.
// Missing tier falls back to 'core' so legacy configs never blank out.
const VISIBLE_PROVIDER_TIERS = new Set(['core'])
function isVisibleProvider(p) {
  return VISIBLE_PROVIDER_TIERS.has((p && p.tier) || 'core')
}

function renderOnboarding() {
  $('onboarding-list').innerHTML = Object.entries(config.providers)
    .filter(([, p]) => isVisibleProvider(p))
    .map(([id, p]) => onboardingRow(id, p))
    .join('')
  $('onboarding-list')
    .querySelectorAll('[data-toggle]')
    .forEach((el) => {
      el.addEventListener('click', () => el.classList.toggle('on'))
    })
}

function updatePrefMetas() {
  const toggleIds = ['maxx-alerts-toggle', 'session-quota-toggle', 'quota-warning-toggle', 'save-mode-toggle']
  if (MISSIONS_ENABLED) toggleIds.unshift('missions-toggle')
  const onCount = toggleIds
    .filter((id) => $(id) && $(id).classList.contains('on')).length
  const notif = $('pref-meta-notifications')
  if (notif) notif.textContent = onCount === 0 ? 'all off' : `${onCount} on`
  const trayLabel = {
    burnbar: 'burn bars', left: 'value left', spent: 'spent', percent: 'used %', target: 'next maxx', reset: 'next reset', tokens: 'tokens',
  }[($('tray-metric') && $('tray-metric').value) || 'burnbar'] || 'burn bars'
  const meterLabel = (($('usage-meter-mode') && $('usage-meter-mode').value) || config?.usageMeterMode) === 'left' ? 'left bars' : 'used bars'
  const themeLabel = currentTheme() === 'light' ? 'light' : 'dark'
  const app = $('pref-meta-app')
  if (app) app.textContent = `${themeLabel} · ${trayLabel} · ${meterLabel}`
  const upd = $('pref-meta-updates')
  if (upd && updateState && updateState.version) upd.textContent = `v${updateState.version}`
}

function orderedProviderEntries() {
  const order = Array.isArray(config.providerOrder) ? config.providerOrder : []
  const seen = new Set()
  const out = []
  for (const id of order) {
    if (config.providers[id] && isVisibleProvider(config.providers[id]) && !seen.has(id)) {
      seen.add(id); out.push([id, config.providers[id]])
    }
  }
  for (const [id, p] of Object.entries(config.providers)) {
    if (!seen.has(id) && isVisibleProvider(p)) out.push([id, p])
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
  const missionsToggle = $('missions-toggle')
  if (MISSIONS_ENABLED && missionsToggle) missionsToggle.classList.toggle('on', config.missions === true)
  $('maxx-alerts-toggle').classList.toggle('on', config.maxxAlertsEnabled !== false)
  $('session-quota-toggle').classList.toggle('on', config.sessionQuotaNotificationsEnabled !== false)
  $('quota-warning-toggle').classList.toggle('on', config.quotaWarningNotificationsEnabled === true)
  $('save-mode-toggle').classList.toggle('on', config.saveModeSuggestions === true)
  $('theme-toggle').classList.toggle('on', currentTheme() === 'light')
  $('maxx-alert-hours').value = String(config.maxxAlertHours || 48)
  $('maxx-alert-reserve').value = String(config.maxxAlertReservePct || 25)
  $('quota-warning-session').value = thresholdValue(config.quotaWarningSessionThresholds || config.quotaWarningThresholds)
  $('quota-warning-weekly').value = thresholdValue(config.quotaWarningWeeklyThresholds || config.quotaWarningThresholds)
  $('tray-metric').value = config.trayMetric || 'burnbar'
  $('usage-meter-mode').value = config.usageMeterMode || 'used'
  $('token-history-days').value = String(config.tokenHistoryDays || 30)
  if (MISSIONS_ENABLED && missionsToggle) {
    missionsToggle.onclick = () => {
      missionsToggle.classList.toggle('on')
      updatePrefMetas()
    }
  }
  $('maxx-alerts-toggle').onclick = () => { $('maxx-alerts-toggle').classList.toggle('on'); updatePrefMetas() }
  $('session-quota-toggle').onclick = () => { $('session-quota-toggle').classList.toggle('on'); updatePrefMetas() }
  $('quota-warning-toggle').onclick = () => { $('quota-warning-toggle').classList.toggle('on'); updatePrefMetas() }
  $('save-mode-toggle').onclick = () => { $('save-mode-toggle').classList.toggle('on'); updatePrefMetas() }
  $('theme-toggle').onclick = () => {
    const next = currentTheme() === 'light' ? 'dark' : 'light'
    applyTheme(next)
    $('theme-toggle').classList.toggle('on', next === 'light')
    updatePrefMetas()
  }
  // Assign rather than addEventListener: renderSettings runs on every open, so
  // a listener would stack a fresh duplicate each time; onchange replaces.
  document.querySelectorAll('.settings-billing select').forEach((el) => { el.onchange = updatePrefMetas })
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
    trayMetric: $('tray-metric').value || 'burnbar',
    usageMeterMode: $('usage-meter-mode').value || 'used',
    tokenHistoryDays: Number($('token-history-days').value) || 30,
    saveModeSuggestions: $('save-mode-toggle').classList.contains('on'),
    onboardingComplete: config.onboardingComplete === true,
    missions: MISSIONS_ENABLED ? ($('missions-toggle') && $('missions-toggle').classList.contains('on')) : false,
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
  const views = ['view-main', 'view-onboarding', 'view-forge', 'view-settings']
  if (MISSIONS_ENABLED) views.splice(3, 0, 'view-missions')
  for (const v of views) {
    $(v).hidden = v !== id
  }
}
function setPopoverMode(mode) {
  if (window.maxx?.setPopoverMode) window.maxx.setPopoverMode(mode).catch(() => {})
}
const showMain = () => {
  setPopoverMode('full')
  showView('view-main')
}
const showSettings = () => {
  setPopoverMode('full')
  showView('view-settings')
}

/* ---------- Idea Stream ---------- */
// CLIs that accept the mission prompt as an argument → "Start build" auto-runs.
// Anything else → the button becomes "Copy prompt" so the user pastes it in.
const PROMPT_CLI = new Set(['claude', 'codex', 'gemini'])
let forgeIdeas = []
let forgeIndex = 0
let missionContext = { models: [], history: [] }
let missionFolder = ''
let burnIdeas = []
let burnTarget = null

function setMissionLoading(id, loading) {
  const el = $(id)
  if (!el) return
  el.classList.toggle('loading', loading)
  el.disabled = !!loading
}

function renderMissionHubInfo() {
  const info = {
    project: [
      { icon: ICON_DIAL, label: 'multi-model', title: 'Routes work across selected models' },
      { icon: ICON_CLOCK, label: '2 min setup', title: 'Expected setup time' },
      { icon: ICON_STACK, label: 'goal file + terminal', title: 'Mission output' },
    ],
    burn: [
      { icon: ICON_DIAL, label: 'live signals', title: 'Uses current usage and idea signals' },
      { icon: ICON_CLOCK, label: 'few sec load', title: 'Fetches ranked ideas before opening' },
      { icon: ICON_STACK, label: 'ranked build cards', title: 'Mission output' },
    ],
  }
  document.querySelectorAll('[data-mission-info]').forEach((el) => {
    const items = info[el.dataset.missionInfo] || []
    el.innerHTML = items
      .map((item) => `<i title="${h(item.title)}">${item.icon}<span>${h(item.label)}</span></i>`)
      .join('')
  })
}

function ideaCard(idea) {
  if (!idea) {
    return `<div class="forge-empty">No more ideas. Tap Skip to pull a stranger batch.</div>`
  }
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
        ${missionMetricChips(idea)}
      </div>
      <div class="idea-cli">
        Builds with <code>${h(idea.cli)}</code> — start tiny, compound hard.
      </div>
    </div>`
}

function complexityDots(value) {
  const score = Math.min(3, Math.max(1, Number(value) || 2))
  return Array.from({ length: 3 }, (_, i) => `<span class="${i < score ? 'on' : 'off'}"></span>`).join('')
}

function missionProgress(idea) {
  const complexity = Math.min(3, Math.max(1, Number(idea?.complexity) || 2))
  const minutes = Math.min(180, Math.max(30, Number(idea?.buildMinutes) || 90))
  return Math.max(24, Math.min(100, Math.round((complexity / 3) * 45 + (minutes / 180) * 55)))
}

function missionMetricChips(idea) {
  const minutes = Number(idea?.buildMinutes) || 90
  const stack = String(idea?.stack || '').trim()
  return [
    `<span class="idea-chip metric-chip" title="Complexity">${ICON_DIAL}<span class="dots">${complexityDots(idea?.complexity)}</span></span>`,
    `<span class="idea-chip metric-chip" title="Build time">${ICON_CLOCK}<b>~${h(minutes)}m</b></span>`,
    stack ? `<span class="idea-chip metric-chip stack-chip" title="Stack">${ICON_STACK}<span>${h(stack)}</span></span>` : '',
  ].filter(Boolean).join('')
}

function renderIdea() {
  const idea = forgeIdeas[forgeIndex]
  $('forge-stage').innerHTML = ideaCard(idea)
  const has = !!idea
  $('forge-start').disabled = !has
  $('forge-more').disabled = !has
  $('forge-block').disabled = !has
  const startBtn = $('forge-start')
  startBtn.classList.add('build-action')
  startBtn.style.setProperty('--build-progress', has ? `${missionProgress(idea)}%` : '0%')
  if (has && !PROMPT_CLI.has(idea.cli)) {
    startBtn.innerHTML = `<span>${ICON_SHARE} Copy prompt</span>`
    startBtn.dataset.mode = 'copy'
    startBtn.title = `${idea.cli} can't take a prompt directly — copy it and paste it in`
  } else {
    startBtn.innerHTML = `<span>${ICON_SHARE} Start build</span>`
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
  $('forge-stage').innerHTML = forgeStageSkeleton(3)
  $('forge-note').textContent = ''
  const { target, ideas } = await window.maxx.forgeIdeas()
  forgeIdeas = ideas
  forgeIndex = 0
  $('forge-target').innerHTML =
    `Routed to <b>${h(target.name)}</b> — your fullest plan. Pick a moonshot, ship the first tiny version.`
  renderIdea()
}

async function startForge() {
  setPopoverMode('full')
  showView('view-forge')
  await loadForge()
}

function renderMissionModels() {
  const models = Array.isArray(missionContext.models) ? missionContext.models : []
  const openBtn = $('mission-open-settings')
  if (openBtn) openBtn.onclick = () => showSettings()
  $('mission-model-list').innerHTML = models.length
    ? models
        .map((m, i) => {
          const used = m.usedPct == null ? 'usage unknown' : `${m.usedPct}% used`
          const prompt = m.supportsPrompt ? 'auto-start' : 'copy prompt'
          return `
            <label class="mission-model">
              <input type="checkbox" data-mission-model="${h(m.id)}" ${m.selected ? 'checked' : ''}>
              <span>
                <b>${i + 1}. ${h(m.name)}</b>
                <small>${h(m.plan || m.cli)} · ${h(used)} · ${h(prompt)}</small>
              </span>
            </label>`
        })
        .join('')
    : `
      <div class="state-panel" role="status">
        <div class="state-mark" aria-hidden="true">◇</div>
        <h2>Connect a CLI first</h2>
        <p>Enable a provider with a local CLI, then come back to route missions.</p>
        <div class="state-actions">
          <button type="button" class="primary-btn" id="mission-open-settings">Open Settings</button>
        </div>
      </div>`
}

function renderMissionHistory() {
  const rows = Array.isArray(missionContext.history) ? missionContext.history.slice(0, 6) : []
  const el = $('mission-history')
  el.hidden = !rows.length
  el.innerHTML = rows.length
    ? `
      <div class="mission-history-head">Recent missions</div>
      ${rows
        .map((m) => {
          const dir = String(m.dir || '').split('/').filter(Boolean).pop() || 'project'
          const date = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
          const model = m.cli ? `Sent to ${m.cli}` : 'Goal copied'
          const width = m.status === 'failed' ? 12 : 34
          return `
            <div class="mission-history-item">
              <div class="mission-history-top">
                <b>${h(m.title || 'Project Mission')}</b>
                <span>${h(date)}</span>
              </div>
              <div class="mission-history-meta">${h(dir)} · ${h(model)}</div>
              <div class="mission-progress"><span style="width:${width}%"></span></div>
            </div>`
        })
        .join('')}`
    : ''
}

function renderBurnIdeas() {
  const target = burnTarget || {}
  const targetBits = [
    target.name ? `Use ${target.name}` : 'Use your fullest model',
    target.usedPct == null ? null : `${target.usedPct}% used`,
    Number.isFinite(Number(target.leftValue)) ? `${money(target.leftValue)} left` : null,
  ].filter(Boolean)
  $('burn-target').innerHTML = targetBits.length
    ? `${h(targetBits.join(' · '))}`
    : 'Finding the model with the most left…'
  $('burn-list').innerHTML = burnIdeas.length
    ? burnIdeas
        .slice(0, 3)
        .map((idea, i) => {
          const canStart = PROMPT_CLI.has(idea.cli)
          const action = canStart ? 'Start build' : 'Copy prompt'
          const reason = idea.rankReason || idea.signal || idea.whyNow || ''
          const progress = missionProgress(idea)
          return `
            <div class="burn-card">
              <div class="burn-card-top">
                <span>#${i + 1}</span>
                <b>${h(idea.title)}</b>
              </div>
              <p>${h(idea.pitch)}</p>
              ${idea.signal ? `<div class="burn-signal">${h(idea.signal)}</div>` : ''}
              ${reason ? `<div class="burn-reason">${h(reason)}</div>` : ''}
              <div class="burn-card-foot">
                <div class="burn-metrics">${missionMetricChips(idea)}</div>
                <button class="${canStart ? 'forge-start' : 'forge-more'} build-action" style="--build-progress:${progress}%" data-burn-action="${canStart ? 'start' : 'copy'}" data-burn-index="${i}">
                  <span>${ICON_SHARE} ${action}</span>
                </button>
              </div>
            </div>`
        })
        .join('')
    : burnTarget
      ? `<div class="forge-empty">No burn ideas found.</div>`
      : `<div class="mission-loading"><span></span><b>Loading goal burn ideas…</b></div>`
}

async function loadBurnChallenges() {
  burnIdeas = []
  burnTarget = null
  $('burn-note').textContent = 'Checking Google Trends, Hacker News, and GitHub…'
  $('burn-list').innerHTML = forgeStageSkeleton(2)
  renderBurnIdeas()
  const res = await window.maxx.burnIdeas()
  burnIdeas = Array.isArray(res.ideas) ? res.ideas : []
  burnTarget = res.target || null
  $('burn-note').textContent = burnIdeas.length ? 'Pick one to spend that model.' : 'No burn ideas found.'
  renderBurnIdeas()
}

async function loadMissionContext() {
  missionContext = await window.maxx.missionContext()
  renderMissionModels()
  renderMissionHistory()
}

function renderMissions() {
  const enabled = config && config.missions === true
  $('missions-consent').hidden = enabled
  $('missions-hub').hidden = !enabled
  const actions = document.querySelector('#view-missions .settings-actions')
  if (actions) actions.hidden = enabled
  if (enabled) {
    setPopoverMode('compact')
    renderMissionHubInfo()
    $('mission-options').hidden = false
    $('mission-project-form').hidden = true
    $('mission-burn-panel').hidden = true
    $('mission-history').hidden = false
    $('mission-note').textContent = ''
    $('missions-hub-note').textContent = ''
    renderMissionHistory()
    loadMissionContext().catch(() => {
      $('mission-model-list').innerHTML = `<div class="forge-empty">Could not load models.</div>`
    })
  }
}

function selectedMissionModels() {
  return Array.from(document.querySelectorAll('[data-mission-model]:checked')).map((el) => el.dataset.missionModel)
}

function missionPayload() {
  return {
    dir: missionFolder,
    goal: $('mission-goal').value,
    models: selectedMissionModels(),
  }
}

function showProjectMission() {
  setPopoverMode('full')
  $('mission-options').hidden = true
  $('mission-project-form').hidden = false
  $('mission-burn-panel').hidden = true
  $('mission-history').hidden = true
  $('mission-note').textContent = ''
  $('missions-hub-note').textContent = ''
}

function missionBack() {
  if (!$('mission-project-form').hidden || !$('mission-burn-panel').hidden) {
    showMissionHub()
    return
  }
  showMain()
}

function showMissionHub(note = '') {
  setPopoverMode('compact')
  $('mission-project-form').hidden = true
  $('mission-burn-panel').hidden = true
  $('mission-options').hidden = false
  $('mission-history').hidden = false
  $('mission-note').textContent = ''
  $('missions-hub-note').textContent = note
  renderMissionHistory()
}

async function showBurnChallenge() {
  setPopoverMode('full')
  $('mission-options').hidden = true
  $('mission-project-form').hidden = true
  $('mission-burn-panel').hidden = false
  $('mission-history').hidden = true
  $('missions-hub-note').textContent = ''
  await loadBurnChallenges()
}

// Missions are opt-in, then the button opens the mission launcher.
async function openForge() {
  if (!MISSIONS_ENABLED) return
  if (!config) config = await window.maxx.getConfig()
  setPopoverMode('compact')
  showView('view-missions')
  renderMissions()
}

async function openGoalBurn() {
  await openForge()
  if (config?.missions !== true) return
  setMissionLoading('mission-burn', true)
  showBurnChallenge().catch((err) => {
    $('burn-note').textContent = err && err.message ? err.message : 'Could not load burn ideas.'
  }).finally(() => {
    setMissionLoading('mission-burn', false)
  })
}

$('forge-back').addEventListener('click', showMain)
if (MISSIONS_ENABLED) {
  $('forge-btn').addEventListener('click', openForge)
  $('missions-back').addEventListener('click', missionBack)
  $('missions-decline').addEventListener('click', async () => {
    config = await window.maxx.setMissions(false)
    showMain()
  })
  $('missions-enable').addEventListener('click', async () => {
    config = await window.maxx.setMissions(true)
    renderMissions()
  })
  $('mission-project').addEventListener('click', () => {
    setMissionLoading('mission-project', true)
    requestAnimationFrame(() => {
      showProjectMission()
      setMissionLoading('mission-project', false)
    })
  })
  $('mission-project-back').addEventListener('click', () => {
    showMissionHub()
  })
  $('mission-burn').addEventListener('click', () => {
    setMissionLoading('mission-burn', true)
    showBurnChallenge().catch((err) => {
      $('burn-note').textContent = err && err.message ? err.message : 'Could not load burn ideas.'
    }).finally(() => {
      setMissionLoading('mission-burn', false)
    })
  })
  $('mission-burn-back').addEventListener('click', () => showMissionHub())
  $('mission-burn-refresh').addEventListener('click', () => {
    loadBurnChallenges().catch((err) => {
      $('burn-note').textContent = err && err.message ? err.message : 'Could not refresh burn ideas.'
    })
  })
}
$('burn-list').addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-burn-action]')
  if (!btn) return
  const idea = burnIdeas[Number(btn.dataset.burnIndex)]
  if (!idea) return
  btn.disabled = true
  const action = btn.dataset.burnAction
  $('burn-note').textContent = action === 'copy' ? 'Copying Goal Forge prompt…' : 'Pick a folder…'
  try {
    const res = action === 'copy' ? await window.maxx.burnCopy(idea) : await window.maxx.burnStart(idea)
    if (res.canceled) {
      $('burn-note').textContent = ''
    } else if (res.ok) {
      $('burn-note').textContent =
        action === 'copy'
          ? `Copied prompt for ${idea.cli}.`
          : res.promptLaunched
            ? `Launched ${res.cli} in ${res.terminal}. Goal copied too.`
            : `Opened ${res.cli}. Goal copied for paste.`
    } else {
      $('burn-note').textContent = 'Could not start burn challenge: ' + (res.error || 'unknown')
    }
  } catch (err) {
    $('burn-note').textContent = err && err.message ? err.message : 'Could not run burn challenge.'
  } finally {
    btn.disabled = false
  }
})
$('mission-folder').addEventListener('click', async () => {
  $('mission-note').textContent = 'Pick a folder…'
  const res = await window.maxx.missionPickFolder()
  if (res.canceled) {
    $('mission-note').textContent = ''
    return
  }
  if (res.ok) {
    missionFolder = res.dir
    $('mission-folder-label').textContent = res.dir
    $('mission-note').textContent = ''
  }
})
$('mission-copy').addEventListener('click', async () => {
  $('mission-copy').disabled = true
  $('mission-note').textContent = 'Forging goal…'
  try {
    const res = await window.maxx.missionCopyGoal(missionPayload())
    $('mission-note').textContent = res.ok ? `Copied. Wrote ${res.goalPath}` : 'Could not copy goal.'
  } catch (err) {
    $('mission-note').textContent = err && err.message ? err.message : 'Could not copy goal.'
  } finally {
    $('mission-copy').disabled = false
  }
})
$('mission-start').addEventListener('click', async () => {
  $('mission-start').disabled = true
  $('mission-note').textContent = 'Starting mission…'
  try {
    const res = await window.maxx.missionStartProject(missionPayload())
    if (res.ok) {
      missionContext.history = [res.mission, ...(Array.isArray(missionContext.history) ? missionContext.history : [])].filter(Boolean)
      $('mission-goal').value = ''
      showMissionHub(res.promptLaunched ? `Sent to ${res.cli}. Goal copied too.` : `Opened ${res.cli}. Goal copied for paste.`)
    } else {
      $('mission-note').textContent = 'Could not open terminal: ' + (res.error || 'unknown')
    }
  } catch (err) {
    $('mission-note').textContent = err && err.message ? err.message : 'Could not start mission.'
  } finally {
    $('mission-start').disabled = false
  }
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
$('foot-left').addEventListener('click', (event) => {
  const sync = event.target.closest('#sync-now')
  if (!sync || syncingNow) return
  syncingNow = true
  renderFooterTotals()
  window.maxx
    .syncNow()
    .then((next) => {
      if (next && next.providers) snap = next
    })
    .catch(() => {
      /* the next scheduled sync can recover */
    })
    .finally(() => {
      syncingNow = false
      render()
    })
})

$('list').addEventListener('click', (event) => {
  const modelFitFolder = event.target.closest('[data-model-fit-folder]')
  if (modelFitFolder) {
    window.maxx.missionPickFolder().then((result) => {
      if (result?.ok && result.dir) {
        modelFitDir = result.dir
        modelFitResult = null
        render()
      }
    }).catch(() => {})
    return
  }

  const modelFitRun = event.target.closest('[data-model-fit-run]')
  if (modelFitRun) {
    const goalEl = $('model-fit-goal')
    modelFitGoal = goalEl ? goalEl.value : modelFitGoal
    modelFitLoading = true
    modelFitResult = null
    render()
    window.maxx.modelFitRecommend({
      dir: modelFitDir,
      goal: modelFitGoal,
      models: modelFitProviderIds(),
    }).then((result) => {
      modelFitResult = result
    }).catch((err) => {
      modelFitResult = { ok: false, missing: [err && err.message ? err.message : 'planner'] }
    }).finally(() => {
      modelFitLoading = false
      render()
    })
    return
  }

  const saveOpen = event.target.closest('[data-save-open]')
  if (saveOpen) {
    activeSaveProvider = saveOpen.dataset.saveOpen
    saveModeScanResult = null
    render()
    return
  }

  const saveClose = event.target.closest('[data-save-close]')
  if (saveClose) {
    activeSaveProvider = null
    saveModeScanResult = null
    render()
    return
  }

  const saveCopy = event.target.closest('[data-save-copy]')
  if (saveCopy) {
    const { provider, signal } = saveSignalForProvider(saveCopy.dataset.saveCopy)
    if (!provider || !signal) return
    const kind = saveCopy.dataset.saveKind
    const text = kind === 'compact'
      ? signal.compactText
      : kind === 'stop'
        ? signal.stopLossText
        : signal.focusedPrompt
    const original = saveCopy.textContent
    saveCopy.disabled = true
    window.maxx.copyText(text).then(() => {
      saveCopy.textContent = 'Copied'
      setTimeout(() => {
        saveCopy.disabled = false
        saveCopy.textContent = original
      }, 900)
    }).catch(() => {
      saveCopy.disabled = false
      saveCopy.textContent = original
    })
    return
  }

  const saveScan = event.target.closest('[data-save-scan]')
  if (saveScan) {
    const providerId = saveScan.dataset.saveScan
    saveScan.disabled = true
    saveScan.textContent = 'Scanning…'
    window.maxx.scanContextBloat(providerId).then((result) => {
      saveModeScanResult = {
        providerId,
        canceled: result?.canceled === true,
        folderName: result?.folderName || 'folder',
        findings: Array.isArray(result?.findings) ? result.findings : [],
      }
    }).catch(() => {
      saveModeScanResult = { providerId, folderName: 'folder', findings: [] }
    }).finally(() => {
      render()
    })
    return
  }

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

$('list').addEventListener('input', (event) => {
  if (event.target && event.target.id === 'model-fit-goal') {
    modelFitGoal = event.target.value
  }
})

if ($('close-btn')) $('close-btn').addEventListener('click', () => window.maxx.close())
$('onboarding-skip').addEventListener('click', async () => {
  const btn = $('onboarding-skip')
  btn.disabled = true
  try {
    config = { ...config, onboardingComplete: true }
    snap = await window.maxx.saveConfig(config)
    render()
    showMain()
  } finally {
    btn.disabled = false
  }
})
$('onboarding-start').addEventListener('click', async () => {
  const btn = $('onboarding-start')
  const originalText = btn.textContent
  btn.disabled = true
  btn.textContent = 'Scanning…'
  try {
    config = collectOnboarding()
    snap = await window.maxx.saveConfig(config)
    render()
    showMain()
  } finally {
    btn.textContent = originalText
    btn.disabled = false
  }
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
$('export-usage').addEventListener('click', async () => {
  const btn = $('export-usage')
  const label = btn.textContent
  btn.disabled = true
  btn.textContent = 'Exporting…'
  try {
    const res = await window.maxx.exportUsage()
    btn.textContent = res && res.ok ? 'Exported ✓' : label
  } catch (err) {
    btn.textContent = 'Export failed'
    console.error(err)
  } finally {
    setTimeout(() => { btn.textContent = label; btn.disabled = false }, 1800)
  }
})
$('save-config').addEventListener('click', async () => {
  const btn = $('save-config')
  btn.disabled = true
  try {
    snap = await window.maxx.saveConfig(collectSettings())
    render()
    showMain()
    btn.textContent = 'Save'
  } catch (err) {
    btn.textContent = 'Save failed — retry'
    console.error(err)
  } finally {
    btn.disabled = false
  }
})

window.maxx.onSnapshot((s) => {
  snap = s
  snapshotLoading = false
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
      if (detection?.detected && config.providers?.[id] && isVisibleProvider(config.providers[id])) {
        config.providers[id] = { ...config.providers[id], enabled: true }
      }
    }
    renderOnboarding()
    showView('view-onboarding')
    const footLeft = $('foot-left')
    if (footLeft) footLeft.innerHTML = skeletonFooterChips()
    return
  }
  showMain()
  snapshotLoading = true
  render()
  try {
    snap = await window.maxx.getSnapshot()
  } catch {
    snap = null
  }
  snapshotLoading = false
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
