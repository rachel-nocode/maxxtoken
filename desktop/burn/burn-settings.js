/* BURN Settings — provider rows + collapsible groups. Classic script.
   Provider list is sourced from config.providers (every configured provider,
   ordered by config.providerOrder), matching the legacy settings screen.
   Toggles/collapsibles/cookies live in session state; Reveal config/log and
   Save delegate to existing IPC. Full config persistence is a follow-up. */

// Providers authenticated by a user-pasted secret (API key / cookie header).
// Mirrors KEY_PROVIDERS in renderer.js.
const BURN_KEY_PROVIDERS = new Set([
  'openai', 'azureopenai', 'cursor', 'copilot', 'windsurf', 'opencode', 'opencodego',
  'alibaba', 'alibabatokenplan', 'augment', 'warp', 'elevenlabs', 'kilo', 'openrouter',
  'grok', 'groq', 'perplexity', 'mistral', 'codebuff', 'commandcode', 'crof', 'venice',
  'moonshot', 'kimik2', 'doubao', 'deepseek', 'deepgram', 'stepfun', 'llmproxy', 'ollama',
  'abacus', 'amp', 'factory', 'antigravity', 'minimax', 'manus', 'vertexai', 'synthetic',
  'mimo', 'bedrock', 'zai', 't3chat',
])

const BURN_COOKIE_IDS = new Set([
  'cursor', 'windsurf', 'opencode', 'opencodego', 'alibaba', 'ollama', 'abacus', 'amp',
  'factory', 'augment', 'perplexity', 'mimo', 't3chat', 'grok',
])

// Option lists mirror the legacy settings selects (index.html) so saved values
// stay compatible with the config schema.
const BURN_OPT_THRESHOLD = [['50,20', '50% + 20% left'], ['40,15', '40% + 15% left'], ['25,10', '25% + 10% left'], ['20,0', '20% + depleted']]
const BURN_OPT_ALERT_HOURS = [['6', '6h before reset'], ['12', '12h before reset'], ['24', '24h before reset'], ['48', '48h before reset'], ['72', '72h before reset']]
const BURN_OPT_RESERVE = [['15', '15% unused'], ['25', '25% unused'], ['40', '40% unused'], ['60', '60% unused']]
const BURN_OPT_TRAY = [['burnbar', 'BURN bars'], ['left', 'Value left'], ['spent', 'Spent value'], ['percent', 'Used percent'], ['target', 'Next maxx'], ['reset', 'Next reset'], ['tokens', 'Tokens']]
const BURN_OPT_METER = [['used', 'Usage used'], ['left', 'Usage left']]
const BURN_OPT_HISTORY = [['1', 'Today'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '365 days']]
const BURN_OPT_WARN = [['inherit', 'Warn auto'], ['off', 'Warn off'], ['15', 'Warn 15%'], ['25', 'Warn 25%'], ['40', 'Warn 40%'], ['60', 'Warn 60%']]

function burnCookiePlaceholder(id) {
  if (id === 'cursor') return 'Cookie: WorkosCursorSessionToken=...'
  if (BURN_COOKIE_IDS.has(id)) return 'Cookie: sso=...; sso-rw=... or Bearer ...'
  return 'API key (sk-...)'
}

// Provider visibility (burnProviderVisible) lives in burn-primitives.js — the
// single tier gate shared by Home and Settings.

// Provider drag order: user override → config.providerOrder → config insertion.
function burnProviderOrder(state) {
  const provs = state.config?.providers || {}
  const ok = (id) => provs[id] && burnProviderVisible(provs[id])
  const ids = Object.keys(provs)
  const seen = new Set()
  const out = []
  for (const id of state.settingsOrder || []) if (ok(id) && !seen.has(id)) { seen.add(id); out.push(id) }
  for (const id of state.config?.providerOrder || []) if (ok(id) && !seen.has(id)) { seen.add(id); out.push(id) }
  for (const id of ids) if (ok(id) && !seen.has(id)) { seen.add(id); out.push(id) }
  return out
}

// Build the full settings provider list from config, with a detected/waiting
// sub-label derived from the live snapshot + saved-key state.
function burnSettingsProviders(state) {
  const provs = state.config?.providers || {}
  const apiKeyState = state.apiKeyState || {}
  return burnProviderOrder(state).map((id) => {
    const p = provs[id] || {}
    const detected = (state.providers || []).find((dp) => dp.id === id)
    const isKey = BURN_KEY_PROVIDERS.has(id)
    const hasKey = !!apiKeyState[id]
    const plan = detected?.plan || p.plan || ''
    let status
    if (detected?._raw?.connected) status = 'detected'
    else if (isKey && !hasKey) status = BURN_COOKIE_IDS.has(id) ? 'add cookie' : 'add key'
    else if (isKey && hasKey) status = 'saved · waiting'
    else status = p.enabled !== false ? 'waiting' : 'off'
    return {
      id,
      name: p.name || detected?.name || id,
      sub: `${plan ? plan + ' · ' : ''}${status}`,
      cookie: isKey,
    }
  })
}

function burnProvSettingRow(pv, enabled, cookieVal) {
  const main =
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' })}">` +
    `<span style="${bstyle({ cursor: 'grab', display: 'inline-flex', flex: '0 0 auto' })}" aria-hidden="true">${burnIcon('list', 11, BURN.text2)}</span>` +
    burnProvGlyph(pv.id, 15, enabled ? BURN.text : BURN.text2) +
    `<div style="${bstyle({ flex: 1, minWidth: 0 })}">` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 13, fontWeight: 700, color: BURN.text, letterSpacing: -0.1 })}">${burnEsc(pv.name)}</div>` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9.5, color: BURN.text2, letterSpacing: 0.4, marginTop: 1, textTransform: 'uppercase' })}">${burnEsc(pv.sub)}</div>` +
    `</div>` +
    burnSelect(`warn:${pv.id}`, (burnState.provAlert && burnState.provAlert[pv.id]) || 'inherit', BURN_OPT_WARN) +
    burnSwitch(`prov:${pv.id}`, enabled) +
    `</div>`

  const cookieRow =
    pv.cookie && enabled
      ? `<div style="${bstyle({ padding: '0 12px 12px', display: 'flex', gap: 6 })}">` +
        `<input type="text" data-burn-cookie="${burnEsc(pv.id)}" value="${burnEsc(cookieVal || '')}" placeholder="${burnEsc(burnCookiePlaceholder(pv.id))}" style="${bstyle({
          flex: 1,
          padding: '7px 9px',
          background: BURN.bg,
          border: `1px solid ${BURN.border}`,
          borderRadius: 2,
          color: BURN.text2,
          fontFamily: BURN_FONT.mono,
          fontSize: 10.5,
          letterSpacing: 0.2,
          outline: 'none',
        })}" />` +
        `<button type="button" data-burn-action="save-cookie" data-cookie-id="${burnEsc(pv.id)}" style="${burnGhostBtn()}">${
          (burnState.cookieSaved && burnState.cookieSaved[pv.id])
            ? `<span style="${bstyle({ display: 'inline-flex', alignItems: 'center', gap: 5, color: BURN.limeText })}">${burnCheckTick(BURN.limeText)}SAVED</span>`
            : 'SAVE'
        }</button>` +
        `</div>`
      : ''

  return (
    `<div draggable="true" data-burn-drag="${burnEsc(pv.id)}" style="${bstyle({
      border: `1px solid ${enabled ? BURN.borderHi : BURN.border}`,
      borderRadius: 2,
      background: enabled ? BURN.surface2 : BURN.surface,
      opacity: enabled ? 1 : 0.6,
    })}">${main}${cookieRow}</div>`
  )
}

// Human-readable line for the current updater status.
function burnUpdateStatusText(u) {
  switch (u.status) {
    case 'checking': return 'CHECKING FOR UPDATES…'
    case 'downloading': return `DOWNLOADING ${u.percent || 0}%`
    case 'up-to-date': return 'UP TO DATE'
    case 'ready': return 'UPDATE READY — RESTART TO INSTALL'
    case 'error': return `ERROR: ${String(u.error || 'unknown').slice(0, 80)}`
    case 'dev': return 'DEV BUILD — UPDATES RUN IN THE PACKAGED APP ONLY'
    default: return 'CLICK CHECK TO LOOK FOR UPDATES'
  }
}

// Expanded UPDATES panel: version row + status line + check/install buttons.
function burnUpdatesBody(state) {
  const u = state.update || { status: 'idle' }
  const checking = u.status === 'checking'
  const ready = u.status === 'ready'
  const statusColor =
    u.status === 'error' ? BURN.warnText
      : ready || u.status === 'up-to-date' ? BURN.limeText
      : BURN.text2
  const versionRow =
    `<div style="${bstyle({ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '9px 11px', borderBottom: `1px solid ${BURN.border}` })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12.5, color: BURN.text })}">Current version</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 11, color: BURN.text2, fontVariantNumeric: 'tabular-nums', letterSpacing: 0.4 })}">${burnEsc((state.version || '').toUpperCase())}</span>` +
    `</div>`
  // Idle = nothing to report; let the button speak for itself.
  const statusRow =
    u.status && u.status !== 'idle'
      ? `<div style="${bstyle({ padding: '9px 11px', fontFamily: BURN_FONT.mono, fontSize: 9.5, letterSpacing: 0.5, color: statusColor })}">${burnEsc(burnUpdateStatusText(u))}</div>`
      : ''
  const buttons =
    `<div style="${bstyle({ display: 'flex', gap: 6, padding: '2px 11px 4px' })}">` +
    `<button type="button" data-burn-action="check-updates"${checking ? ' disabled' : ''} style="${burnGhostBtn()}">${checking ? 'Checking…' : 'Check for updates'}</button>` +
    (ready ? `<button type="button" data-burn-action="install-update" style="${burnPrimaryBtn()}">Restart &amp; install</button>` : '') +
    `</div>`
  return `<div style="${bstyle({ padding: '8px 0 0' })}">${versionRow}${statusRow}${buttons}</div>`
}

function burnRenderSettings(state) {
  const provs = burnSettingsProviders(state)
  const enabled = state.settingsEnabled || {}
  const cookies = state.cookies || {}
  const notifs = state.notifs
  const app = state.app
  const cfg = state.cfg || {}
  const traySummary = BURN_OPT_TRAY.find(([value]) => value === cfg.trayMetric)?.[1] || 'BURN bars'
  const meterSummary = BURN_OPT_METER.find(([value]) => value === cfg.usageMeterMode)?.[1] || 'Usage used'

  const banner =
    `<div style="${bstyle({
      margin: 14,
      padding: '9px 11px',
      background: BURN.accentWashBg,
      border: `1px solid ${BURN.accentWashBorder}`,
      borderRadius: 2,
      fontFamily: BURN_FONT.mono,
      fontSize: 10.5,
      color: BURN.text2,
      letterSpacing: 0.3,
      lineHeight: 1.55,
    })}">PLAN VALUES STAY AUTOMATIC. USE THE CONFIG FILE ONLY FOR OVERRIDES.</div>`

  const provRows =
    `<div style="${bstyle({ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 6 })}">` +
    provs.map((pv) => burnProvSettingRow(pv, enabled[pv.id] !== false, cookies[pv.id])).join('') +
    `</div>`

  const notifsCount = Object.values(notifs).filter(Boolean).length
  const notifsGroup =
    `<div style="${bstyle({ padding: '14px 14px 0' })}">` +
    burnCollapsibleHead('NOTIFICATIONS', `${notifsCount} ON`, state.notifsOpen, 'notifs') +
    (state.notifsOpen
      ? `<div style="${bstyle({ padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 2 })}">` +
        burnToggleRow('Idea missions', notifs.ideas, 'notif:ideas') +
        burnToggleRow('Maxx alerts', notifs.alerts, 'notif:alerts') +
        burnToggleRow('Session restored', notifs.restored, 'notif:restored') +
        burnToggleRow('Quota warnings', notifs.quota, 'notif:quota') +
        burnDropdownRow('Session warning', 'sessionThreshold', cfg.sessionThreshold, BURN_OPT_THRESHOLD) +
        burnDropdownRow('Weekly warning', 'weeklyThreshold', cfg.weeklyThreshold, BURN_OPT_THRESHOLD) +
        burnDropdownRow('Alert window', 'alertHours', cfg.alertHours, BURN_OPT_ALERT_HOURS) +
        burnDropdownRow('Reserve floor', 'alertReservePct', cfg.alertReservePct, BURN_OPT_RESERVE) +
        `</div>`
      : '') +
    `</div>`

  const appGroup =
    `<div style="${bstyle({ padding: '14px 14px 0' })}">` +
    burnCollapsibleHead('APP', `${app.lightMode ? 'LIGHT' : 'DARK'} · ${traySummary.toUpperCase()} · ${meterSummary.toUpperCase()}`, state.appOpen, 'app') +
    (state.appOpen
      ? `<div style="${bstyle({ padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 2 })}">` +
        burnDropdownRow('Menu bar', 'trayMetric', cfg.trayMetric, BURN_OPT_TRAY) +
        burnDropdownRow('Usage bars', 'usageMeterMode', cfg.usageMeterMode || 'used', BURN_OPT_METER) +
        burnDropdownRow('Token history', 'tokenHistoryDays', cfg.tokenHistoryDays, BURN_OPT_HISTORY) +
        burnToggleRow('Light mode', app.lightMode, 'app:lightMode') +
        burnToggleRow('Open at login', app.openAtLogin, 'app:openAtLogin') +
        `</div>`
      : '') +
    `</div>`

  const updatesGroup =
    `<div style="${bstyle({ padding: 14 })}">` +
    burnCollapsibleHead('UPDATES', (state.version || 'v0.2.4').toUpperCase(), state.updatesOpen, 'updates') +
    (state.updatesOpen ? burnUpdatesBody(state) : '') +
    `</div>`

  const body =
    `<div class="burn-body" style="${bstyle({ flex: 1, overflowY: 'auto' })}">${banner}${provRows}${notifsGroup}${appGroup}${updatesGroup}</div>`

  const textBtn = bstyle({
    padding: '8px 12px',
    background: 'transparent',
    color: BURN.text2,
    border: 'none',
    fontFamily: BURN_FONT.mono,
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    cursor: 'pointer',
  })
  const footer =
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderTop: `1px solid ${BURN.border}`, background: BURN.surface })}">` +
    `<button type="button" data-burn-action="reveal-config" style="${textBtn}">REVEAL CONFIG</button>` +
    `<button type="button" data-burn-action="reveal-log" style="${textBtn}">REVEAL LOG</button>` +
    `<button type="button" data-burn-action="export-usage" style="${textBtn}">${state.justExported ? 'EXPORTED ✓' : 'EXPORT JSON'}</button>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<button type="button" data-burn-action="save-config"${state.justSaved ? ' disabled' : ''} style="${burnPrimaryBtn()}">${
      state.justSaved
        ? `<span style="${bstyle({ display: 'inline-flex', alignItems: 'center', gap: 6 })}">${burnCheckTick(BURN.bg)}SAVED</span>`
        : 'Save'
    }</button>` +
    `</div>`

  return burnHeader({ backLabel: 'DETECTED PROVIDERS', settingsActive: true }) + body + footer
}
