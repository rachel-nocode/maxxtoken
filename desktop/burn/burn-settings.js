/* BURN Settings — provider rows + collapsible groups. Classic script.
   Provider list is sourced from config.providers (every configured provider,
   ordered by config.providerOrder), matching the legacy settings screen.
   Toggles/collapsibles/cookies live in session state; Reveal config/log and
   Save delegate to existing IPC. Full config persistence is a follow-up. */

// Option lists mirror the legacy settings selects (index.html) so saved values
// stay compatible with the config schema.
const BURN_OPT_THRESHOLD = [['50,20', '50% + 20% left'], ['40,15', '40% + 15% left'], ['25,10', '25% + 10% left'], ['20,0', '20% + depleted']]
const BURN_OPT_ALERT_HOURS = [['6', '6h before reset'], ['12', '12h before reset'], ['24', '24h before reset'], ['48', '48h before reset'], ['72', '72h before reset']]
const BURN_OPT_RESERVE = [['15', '15% unused'], ['25', '25% unused'], ['40', '40% unused'], ['60', '60% unused']]
const BURN_OPT_TRAY = [['burnbar', 'BURN bars'], ['pins', 'Metric pins'], ['left', 'Value left'], ['spent', 'Spent value'], ['percent', 'Used percent'], ['target', 'Next maxx'], ['reset', 'Next reset'], ['tokens', 'Tokens']]
const BURN_OPT_METER = [['used', 'Usage used'], ['left', 'Usage left']]
const BURN_OPT_HISTORY = [['1', 'Today'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '365 days']]
const BURN_OPT_WARN = [['inherit', 'Warn auto'], ['off', 'Warn off'], ['15', 'Warn 15%'], ['25', 'Warn 25%'], ['40', 'Warn 40%'], ['60', 'Warn 60%']]
const BURN_OPT_METRIC_PLACE = [['primary', 'Always'], ['expanded', 'Details'], ['hidden', 'Hidden']]
const BURN_OPT_PIN = [['none', 'No pin'], ['bar', 'Pin bar'], ['text', 'Pin text']]
const BURN_OPT_APPEARANCE = [['system', 'System'], ['dark', 'Dark'], ['light', 'Light']]
const BURN_OPT_DENSITY = [['comfortable', 'Comfortable'], ['compact', 'Compact']]
const BURN_OPT_TIME = [['system', 'System'], ['12h', '12 hour'], ['24h', '24 hour']]
const BURN_OPT_RESET = [['countdown', 'Countdown'], ['exact', 'Exact time']]
const BURN_OPT_LOG_LEVEL = [['error', 'Errors'], ['warn', 'Warnings'], ['info', 'Info'], ['debug', 'Debug']]
const BURN_OPT_UPDATE_CHANNEL = [['stable', 'Stable'], ['beta', 'Beta']]

function burnPricingFallbackGroup(state) {
  const fallback = state.unknownModelFallback || { enabled: false, models: {} }
  const providerRows = Object.entries(state.pricingFallbackOptions || {}).filter(([providerId, choices]) => {
    return (Array.isArray(choices) && choices.length > 0) || !!fallback.models?.[providerId]
  }).map(([providerId, choices]) => {
    const saved = String(fallback.models?.[providerId] || '')
    const options = [['', 'No model'], ...(Array.isArray(choices) ? choices.map((item) => [item.id, item.title || item.id]) : [])]
    if (saved && !options.some(([id]) => id === saved)) options.push([saved, `${saved} (saved, unavailable)`])
    const providerName = state.config?.providers?.[providerId]?.name || providerId
    return burnDropdownRow(providerName, `fallback:${providerId}`, saved, options)
  }).join('')
  const body = `<div style="${bstyle({ padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 2 })}">` +
    burnDropdownRow('Unknown-model estimates', 'fallbackEnabled', fallback.enabled ? 'on' : 'off', [['off', 'Off'], ['on', 'On']]) +
    providerRows +
    `<div style="${bstyle({ padding: '7px 11px', color: BURN.text3, fontSize: 9.5, lineHeight: 1.4 })}">Known rates stay unchanged. Unknown-model warnings remain visible, including when a saved fallback is no longer available.</div></div>`
  return `<div style="${bstyle({ padding: '14px 14px 0' })}">` +
    burnCollapsibleHead('PRICING FALLBACK', fallback.enabled ? 'ON' : 'OFF', state.pricingOpen, 'pricing') +
    (state.pricingOpen ? body : '') + `</div>`
}

function burnProxyGroup(state) {
  const proxy = state.proxySettings || {}
  const field = (key, label, type = 'text', placeholder = '') => `<label style="${bstyle({ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: BURN.text2 })}">${label}<input data-burn-proxy="${key}" type="${type}" autocomplete="off" spellcheck="false" placeholder="${burnEsc(placeholder)}" value="${burnEsc(proxy[key] || '')}" style="${bstyle({ minWidth: 0, padding: '9px 10px', background: BURN.bg, color: BURN.text, border: `1px solid ${BURN.borderHi}`, borderRadius: 8 })}" /></label>`
  return `<div style="${bstyle({ padding: '14px 14px 0' })}">` +
    burnCollapsibleHead('NETWORK PROXY', proxy.enabled ? 'ON' : 'OFF', state.proxyOpen, 'proxy') +
    (state.proxyOpen ? `<div style="${bstyle({ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 11px' })}"><label style="${bstyle({ color: BURN.text, fontSize: 12 })}"><input data-burn-proxy="enabled" type="checkbox" ${proxy.enabled ? 'checked' : ''} /> Use proxy for provider requests</label>${field('url', 'Proxy address', 'text', 'https://proxy.example:8080')}${field('username', 'Username (optional)')}${field('password', 'Password (optional)', 'password', proxy.hasCredentials ? 'Saved securely; leave blank to keep' : '')}<div style="${bstyle({ display: 'flex', gap: 8 })}"><button type="button" data-burn-action="save-proxy" style="${burnGhostBtn()}">Apply proxy</button>${proxy.hasCredentials ? `<button type="button" data-burn-action="clear-proxy-auth" style="${burnGhostBtn()}">Clear login</button>` : ''}</div><div role="status" style="${bstyle({ color: BURN.text2, fontSize: 10, lineHeight: 1.5 })}">${burnEsc(proxy.notice || 'HTTP, HTTPS, and SOCKS5 supported. Local requests connect directly. Credentials are saved securely.')}</div></div>` : '') + '</div>'
}

function burnDiagnosticsGroup(state) {
  const diagnostic = state.diagnostics || {}
  const cli = state.cliStatus || {}
  const cliHealthy = cli.healthy ?? (cli.compatible ?? cli.versionMatched)
  const cliLabel = cli.checking
    ? 'Checking…'
    : cli.error
      ? `Unavailable · ${burnSafeError(cli.error)}`
      : cli.installed
        ? `${cliHealthy === false ? 'Needs repair' : 'Installed'}${cli.version || cli.installedVersion ? ` · ${cli.version || cli.installedVersion}` : ''}`
        : 'Not installed'
  const cliAction = cli.checking ? 'Checking…' : cli.installed ? (cliHealthy === false ? 'Repair CLI' : 'Reinstall CLI') : 'Install CLI'
  const cliPath = cli.path || ''
  const pathHint = cli.installed && cli.pathConfigured === false ? 'Restart the shell or add the install directory to PATH.' : ''
  const body = `<div style="${bstyle({ padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 2 })}">` +
    burnDropdownRow('Log level', 'logLevel', diagnostic.logLevel || 'info', BURN_OPT_LOG_LEVEL) +
    `<div style="${bstyle({ padding: '9px 11px', borderBottom: `1px solid ${BURN.border}` })}"><div style="${bstyle({ color: BURN.text, fontSize: 12.5 })}">Debug log</div><div title="${burnEsc(diagnostic.logPath || 'Unavailable')}" style="${bstyle({ color: BURN.text3, fontFamily: BURN_FONT.mono, fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingTop: 3 })}">${burnEsc(diagnostic.logPath || 'Path unavailable')}</div><div style="${bstyle({ display: 'flex', gap: 6, paddingTop: 7 })}"><button type="button" data-burn-action="copy-log-path"${diagnostic.logPath ? '' : ' disabled'} style="${burnGhostBtn()}">Copy path</button><button type="button" data-burn-action="reveal-log"${diagnostic.logPath ? '' : ' disabled'} style="${burnGhostBtn()}">Reveal</button></div></div>` +
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderBottom: `1px solid ${BURN.border}` })}"><div style="${bstyle({ flex: 1, minWidth: 0 })}"><div style="${bstyle({ color: BURN.text, fontSize: 12.5 })}">Command line</div><div role="status" style="${bstyle({ color: cli.error || cliHealthy === false ? BURN.warnText : BURN.text3, fontSize: 9.5, paddingTop: 2 })}">${burnEsc(cliLabel)}</div>${cliPath ? `<div title="${burnEsc(cliPath)}" style="${bstyle({ color: BURN.text3, fontFamily: BURN_FONT.mono, fontSize: 8.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingTop: 2 })}">${burnEsc(cliPath)}</div>` : ''}${pathHint ? `<div style="${bstyle({ color: BURN.warnText, fontSize: 9, paddingTop: 2 })}">${burnEsc(pathHint)}</div>` : ''}</div><button type="button" data-burn-action="install-cli"${cli.checking ? ' disabled' : ''} style="${burnGhostBtn()}">${burnEsc(cliAction)}</button>${cli.installed ? `<button type="button" data-burn-action="uninstall-cli"${cli.checking ? ' disabled' : ''} style="${burnGhostBtn()}">Uninstall</button>` : ''}</div>` +
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px' })}"><div style="${bstyle({ flex: 1, color: BURN.text2, fontSize: 10.5 })}">Reset preferences and layout. Saved credentials remain in secure storage.</div><button type="button" data-burn-action="reset-settings" style="${burnGhostBtn()}">Reset settings</button></div>` +
    (diagnostic.notice ? `<div role="status" style="${bstyle({ padding: '0 11px 8px', color: /copied|updated|preserved/i.test(diagnostic.notice) ? BURN.limeText : BURN.warnText, fontSize: 9.5 })}">${burnEsc(diagnostic.notice)}</div>` : '') +
    `</div>`
  return `<div style="${bstyle({ padding: '14px 14px 0' })}">` +
    burnCollapsibleHead('DIAGNOSTICS & CLI', String(diagnostic.logLevel || 'info').toUpperCase(), state.diagnosticsOpen, 'diagnostics') +
    (state.diagnosticsOpen ? body : '') + `</div>`
}

function burnCookiePlaceholder(id, auth) {
  if (id === 'cursor') return 'Cookie: WorkosCursorSessionToken=...'
  if (auth === 'cookie') return 'Cookie: sso=...; sso-rw=... or Bearer ...'
  return 'API key (sk-...)'
}

// Provider visibility (burnProviderVisible) lives in burn-primitives.js — the
// single tier gate shared by Home and Settings.

// Provider drag order: user override → config.providerOrder → config insertion.
function burnProviderOrder(state) {
  const provs = state.config?.providers || {}
  const instances = (state.providers || []).filter((provider) => provider?._raw?.providerFamily && provider.id !== provider._raw.providerFamily)
  const instanceFamilies = new Set(instances.map((provider) => provider._raw.providerFamily))
  const configFor = (id) => {
    const found = (state.providers || []).find((provider) => provider.id === id)
    return provs[id] || provs[found?._raw?.providerFamily]
  }
  const ok = (id) => !instanceFamilies.has(id) && configFor(id) && burnProviderVisible(configFor(id))
  const ids = [...instances.map((provider) => provider.id), ...Object.keys(provs).filter((id) => !instanceFamilies.has(id))]
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
    const detected = (state.providers || []).find((dp) => dp.id === id)
    const family = detected?._raw?.providerFamily || id
    const p = provs[id] || provs[family] || {}
    const isKey = p.auth === 'key' || p.auth === 'cookie'
    const hasKey = !!apiKeyState[id] || !!apiKeyState[family]
    const plan = detected?.plan || p.plan || ''
    let status
    if (detected?._raw?.connected) status = 'detected'
    else if (p.auth === 'auto') status = 'auto-detecting login'
    else if (isKey && !hasKey) status = p.auth === 'cookie' ? 'add cookie' : 'add key'
    else if (isKey && hasKey) status = 'saved · waiting'
    else status = p.enabled !== false ? 'waiting' : 'off'
    return {
      id,
      family,
      name: detected?.name || p.name || family,
      sub: `${p.status === 'experimental' ? 'experimental · ' : ''}${detected?._raw?.account?.label ? detected._raw.account.label + ' · ' : ''}${plan ? plan + ' · ' : ''}${status}`,
      cookie: isKey,
      auth: p.auth,
    }
  })
}

function burnProvSettingRow(pv, enabled, cookieVal) {
  const main =
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px' })}">` +
    `<span style="${bstyle({ cursor: 'grab', display: 'inline-flex', flex: '0 0 auto' })}" aria-hidden="true">${burnIcon('list', 11, BURN.text2)}</span>` +
    burnProvGlyph(pv.family || pv.id, 15, enabled ? BURN.text : BURN.text2) +
    `<div style="${bstyle({ flex: 1, minWidth: 0 })}">` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 13, fontWeight: 700, color: BURN.text, letterSpacing: -0.1 })}">${burnEsc(pv.name)}</div>` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9.5, color: BURN.text2, letterSpacing: 0.4, marginTop: 1, textTransform: 'uppercase' })}">${burnEsc(pv.sub)}</div>` +
    `</div>` +
    burnSelect(`warn:${pv.id}`, (burnState.provAlert && (burnState.provAlert[pv.id] || burnState.provAlert[pv.family])) || 'inherit', BURN_OPT_WARN, `${pv.name} warning`) +
    burnSwitch(`prov:${pv.id}`, enabled, `Track ${pv.name}${pv.sub ? ` · ${pv.sub}` : ''}`) +
    `</div>`

  const cookieRow =
    pv.cookie && enabled
      ? `<div style="${bstyle({ padding: '0 12px 12px', display: 'flex', gap: 6 })}">` +
        `<input type="password" autocomplete="off" spellcheck="false" aria-label="${burnEsc(pv.name)} credential" data-burn-cookie="${burnEsc(pv.family || pv.id)}" value="${burnEsc(cookieVal || '')}" placeholder="${burnEsc(burnCookiePlaceholder(pv.family || pv.id, pv.auth))}" style="${bstyle({
          flex: 1,
          padding: '7px 9px',
          background: BURN.bg,
          border: `1px solid ${BURN.border}`,
          borderRadius: 8,
          color: BURN.text2,
          fontFamily: BURN_FONT.mono,
          fontSize: 10.5,
          letterSpacing: 0.2,
          outline: 'none',
        })}" />` +
        `<button type="button" data-burn-action="save-cookie" data-cookie-id="${burnEsc(pv.family || pv.id)}" style="${burnGhostBtn()}">${
          (burnState.cookieSaved && burnState.cookieSaved[pv.family || pv.id])
            ? `<span style="${bstyle({ display: 'inline-flex', alignItems: 'center', gap: 5, color: BURN.limeText })}">${burnCheckTick(BURN.limeText)}SAVED</span>`
            : 'SAVE'
        }</button>` +
        `</div>`
      : ''

  return (
    `<div draggable="true" data-burn-drag="${burnEsc(pv.id)}" style="${bstyle({
      border: `1px solid ${enabled ? BURN.borderHi : BURN.border}`,
      borderRadius: 12,
      background: enabled ? BURN.surface2 : BURN.surface,
      opacity: enabled ? 1 : 0.6,
    })}">${main}${cookieRow}</div>`
  )
}

function burnMetricPinValue(state, providerId, metricId) {
  return (state.trayPins || []).find((pin) => pin.providerId === providerId && pin.metricId === metricId)?.style || 'none'
}

function burnProviderMetricSettings(state, providerId) {
  const provider = (state.providers || []).find((item) => item.id === providerId)
  if (!provider?._raw || typeof BurnMetrics === 'undefined') return ''
  const metrics = BurnMetrics.registryForProvider(provider._raw)
  if (!metrics.length) return ''
  const layout = BurnMetrics.reconcileLayout(state.metricLayouts?.[providerId], metrics)
  const byId = new Map(metrics.map((metric) => [metric.id, metric]))
  const open = state.metricOpen?.[providerId] === true
  const rows = layout.order.map((id, index) => {
    const metric = byId.get(id)
    if (!metric) return ''
    const placement = burnMetricPlacement(providerId, id)
    const pin = burnMetricPinValue(state, providerId, id)
    return (
      `<div style="${bstyle({ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 7, alignItems: 'center', padding: '7px 9px', borderTop: `1px solid ${BURN.border}` })}">` +
      `<div style="${bstyle({ minWidth: 0 })}"><div style="${bstyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: BURN.text, fontSize: 11.5, fontWeight: 650 })}">${burnEsc(metric.label)}</div><div style="${bstyle({ color: BURN.text2, fontFamily: BURN_FONT.mono, fontSize: 8.5, textTransform: 'uppercase' })}">${burnEsc(metric.type)}</div></div>` +
      `<div style="${bstyle({ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 })}">` +
      `<button type="button" data-burn-metric-action="up|${burnEsc(providerId)}|${burnEsc(id)}"${index === 0 ? ' disabled' : ''} aria-label="Move ${burnEsc(metric.label)} up" style="${burnGhostBtn()}">↑</button>` +
      `<button type="button" data-burn-metric-action="down|${burnEsc(providerId)}|${burnEsc(id)}"${index === layout.order.length - 1 ? ' disabled' : ''} aria-label="Move ${burnEsc(metric.label)} down" style="${burnGhostBtn()}">↓</button>` +
      burnSelect(`metric|${providerId}|${id}`, placement, BURN_OPT_METRIC_PLACE, `${metric.label} visibility`) +
      burnSelect(`pin|${providerId}|${id}`, pin, BURN_OPT_PIN, `${metric.label} menu bar pin`) +
      `</div></div>`
    )
  }).join('')
  return (
    `<div style="${bstyle({ marginTop: -1, border: `1px solid ${BURN.border}`, borderRadius: '0 0 12px 12px', background: BURN.surface })}">` +
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px' })}">` +
    `<button type="button" data-burn-metric-action="open|${burnEsc(providerId)}|" style="${burnGhostBtn()}">${open ? 'Hide metrics' : `Customize ${metrics.length} metrics`}</button>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<button type="button" data-burn-metric-action="reset|${burnEsc(providerId)}|" style="${burnGhostBtn()}">Reset</button>` +
    `</div>${open ? rows : ''}</div>`
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
  const preferences = state.openUsagePrefs?.updates || { channel: 'stable', automaticChecks: true }
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
  const preferencesRows =
    burnDropdownRow('Channel', 'updateChannel', preferences.channel, BURN_OPT_UPDATE_CHANNEL) +
    burnToggleRow('Check automatically', preferences.automaticChecks, 'pref:updateAutomaticChecks') +
    `<div style="${bstyle({ padding: '2px 11px 9px', color: BURN.text3, fontSize: 9.5, lineHeight: 1.4 })}">Beta releases require opt-in. Manual checks remain available when automatic checks are off.</div>`
  return `<div style="${bstyle({ padding: '8px 0 0' })}">${versionRow}${preferencesRows}${statusRow}${buttons}</div>`
}

// Settings → License (licensing spec section 19.3): key entry always
// available, status display, tiny GRACE note, REVOKED re-enter prompt.
// Unlock buttons use the spec's #FF6B00, not the BURN lime.
const BURN_LICENSE_ORANGE = '#FF6B00'

function burnLicenseSummary() {
  // No gating — always unlocked.
  return 'UNLOCKED'
}

function burnLicenseBody(state) {
  const lic = state.license || {}
  const price = lic.price || '$20'
  const row = (label, value, color) =>
    `<div style="${bstyle({ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 11px', borderBottom: `1px solid ${BURN.border}` })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12.5, color: BURN.text })}">${burnEsc(label)}</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 11, color: color || BURN.text2, letterSpacing: 0.4 })}">${burnEsc(value)}</span>` +
    `</div>`

  // No gating: everything is unlocked. Polar is an optional one-time payment
  // ($20, lifetime upgrades) shown as a Support button.
  const statusRows = row('Token Coach', 'UNLOCKED · LIFETIME', BURN.limeText)

  const buttons =
    `<div style="${bstyle({ display: 'flex', gap: 6, padding: '10px 11px 4px' })}">` +
    `<button type="button" data-burn-action="license-buy" style="${bstyle({
      padding: '8px 14px',
      background: BURN_LICENSE_ORANGE,
      color: '#000000',
      border: 'none',
      borderRadius: 2,
      fontFamily: BURN_FONT.mono,
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      cursor: 'pointer',
    })}">Support — ${burnEsc(price)} one-time</button>` +
    `</div>`

  const pitch = `<div style="${bstyle({ padding: '6px 11px 2px', fontFamily: BURN_FONT.mono, fontSize: 9, letterSpacing: 0.6, color: BURN.text3 })}">FREE & FULLY UNLOCKED. PAY ONCE IF YOU WANT TO SUPPORT — GETS YOU LIFETIME UPGRADES. RUNS LOCAL.</div>`

  return `<div style="${bstyle({ padding: '8px 0 0' })}">${statusRows}${buttons}${pitch}</div>`
}

function burnShortcutRow(state) {
  const shortcut = state.openUsagePrefs?.globalShortcut || ''
  const status = state.openUsagePrefs?.shortcutStatus || {}
  const note = status.error
    ? status.error
    : status.registered
      ? 'Registered'
      : shortcut ? 'Not registered' : 'Disabled'
  return `<div style="${bstyle({ padding: '9px 11px', borderBottom: `1px solid ${BURN.border}` })}">` +
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 7 })}"><span style="${bstyle({ flex: 1, color: BURN.text, fontSize: 12.5 })}">Global popover shortcut</span><input readonly data-burn-shortcut value="${burnEsc(shortcut)}" placeholder="Click, then press keys" aria-label="Global popover shortcut" style="${bstyle({ width: 135, padding: '6px 8px', border: `1px solid ${BURN.border}`, borderRadius: 7, background: BURN.bg, color: BURN.text, fontFamily: BURN_FONT.mono, fontSize: 10, textAlign: 'center' })}"><button type="button" data-burn-shortcut-clear style="${burnGhostBtn()}">Clear</button></div>` +
    `<div role="status" style="${bstyle({ color: status.error ? BURN.warnText : BURN.text2, fontSize: 9.5, paddingTop: 4 })}">${burnEsc(note)} · in popover: ⌘R refresh, ⌘, settings, ⌘K customize, ⌘⇧S share, Esc back/close, ⌘Z undo</div></div>`
}

function burnPrivacySyncGroup(state) {
  const prefs = state.openUsagePrefs || {}
  const sync = state.syncStatus || {}
  const capture = state.captureStatus || {}
  const syncText = sync.supported === false
    ? 'Unavailable on this system'
    : sync.error ? `Error · ${sync.error}`
      : sync.syncing ? 'Syncing…'
        : sync.lastSuccessAt ? `Last synced ${burnRelativeAge(Date.parse(sync.lastSuccessAt) || sync.lastSuccessAt)}`
          : prefs.sync?.enabled ? 'Waiting for first sync' : 'Local only'
  const captureText = capture.supported === false
    ? 'Capture detection unavailable on this system'
    : capture.supportLevel === 'limited' ? (capture.message || 'Limited capture detection')
      : capture.captured && capture.concealUsage ? 'Usage hidden during capture' : 'Masks pinned menu-bar usage during capture'
  return `<div style="${bstyle({ padding: '14px 14px 0' })}">` +
    burnCollapsibleHead('PRIVACY & SYNC', `${prefs.sync?.enabled ? 'SYNC ON' : 'LOCAL'} · ${prefs.capturePrivacy ? 'MASK ON' : 'MASK OFF'}`, state.privacyOpen, 'privacy') +
    (state.privacyOpen ? `<div style="${bstyle({ paddingTop: 8 })}">${burnToggleRow('Mask menu-bar usage during capture', !!prefs.capturePrivacy, 'pref:capturePrivacy')}<div style="${bstyle({ margin: '-4px 11px 7px', color: BURN.text3, fontSize: 9.5 })}">${burnEsc(captureText)}</div>${burnToggleRow('Cross-Mac history sync', !!prefs.sync?.enabled, 'pref:sync')}<div style="${bstyle({ margin: '-4px 11px 7px', color: sync.error ? BURN.warnText : BURN.text3, fontSize: 9.5 })}">${burnEsc(syncText)}${Array.isArray(sync.devices) && sync.devices.length ? ` · ${sync.devices.length} device${sync.devices.length === 1 ? '' : 's'}` : ''}</div></div>` : '') + `</div>`
}

function burnRenderSettings(state) {
  const provs = burnSettingsProviders(state)
  const enabled = state.settingsEnabled || {}
  const cookies = state.cookies || {}
  const notifs = state.notifs
  const app = state.app
  const cfg = state.cfg || {}
  const prefs = state.openUsagePrefs || {}
  const traySummary = BURN_OPT_TRAY.find(([value]) => value === cfg.trayMetric)?.[1] || 'BURN bars'
  const meterSummary = BURN_OPT_METER.find(([value]) => value === cfg.usageMeterMode)?.[1] || 'Usage used'

  const banner =
    `<div style="${bstyle({
      margin: 14,
      padding: '11px 12px',
      background: BURN.accentWashBg,
      border: `1px solid ${BURN.accentWashBorder}`,
      borderRadius: 11,
      fontFamily: BURN_FONT.sans,
      fontSize: 12,
      color: BURN.text2,
      lineHeight: 1.45,
    })}"><strong style="${bstyle({ color: BURN.text })}">Customize your dashboard.</strong> Reorder providers, choose warnings, and control how usage appears.</div>`

  const provRows =
    `<div style="${bstyle({ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 6 })}">` +
    provs.map((pv) => {
      const on = enabled[pv.id] !== undefined ? enabled[pv.id] !== false : enabled[pv.family] !== false
      return burnProvSettingRow(pv, on, cookies[pv.family || pv.id]) + burnProviderMetricSettings(state, pv.id)
    }).join('') +
    `<div style="${bstyle({ display: 'flex', justifyContent: 'flex-end', gap: 6, padding: '4px 0 0' })}"><button type="button" data-burn-metric-action="undo||"${state.layoutUndo?.length ? '' : ' disabled'} style="${burnGhostBtn()}">Undo</button><button type="button" data-burn-metric-action="reset-all||" style="${burnGhostBtn()}">Reset all metrics</button></div>` +
    `</div>`

  const notifsCount = Object.values(notifs).filter(Boolean).length + Object.values(prefs.paceAlerts || {}).filter(Boolean).length
  const notifsGroup =
    `<div style="${bstyle({ padding: '14px 14px 0' })}">` +
    burnCollapsibleHead('NOTIFICATIONS', `${notifsCount} ON`, state.notifsOpen, 'notifs') +
    (state.notifsOpen
      ? `<div style="${bstyle({ padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 2 })}">` +
        burnToggleRow('Maxx alerts', notifs.alerts, 'notif:alerts') +
        burnToggleRow('Session restored', notifs.restored, 'notif:restored') +
        burnToggleRow('Quota warnings', notifs.quota, 'notif:quota') +
        burnToggleRow('Projected near exhaustion', !!prefs.paceAlerts?.nearExhaustion, 'pref:paceNear') +
        burnToggleRow('Projected run out', !!prefs.paceAlerts?.runOut, 'pref:paceRunOut') +
        burnDropdownRow('Session warning', 'sessionThreshold', cfg.sessionThreshold, BURN_OPT_THRESHOLD) +
        burnDropdownRow('Weekly warning', 'weeklyThreshold', cfg.weeklyThreshold, BURN_OPT_THRESHOLD) +
        burnDropdownRow('Alert window', 'alertHours', cfg.alertHours, BURN_OPT_ALERT_HOURS) +
        burnDropdownRow('Reserve floor', 'alertReservePct', cfg.alertReservePct, BURN_OPT_RESERVE) +
        `</div>`
      : '') +
    `</div>`

  const appGroup =
    `<div style="${bstyle({ padding: '14px 14px 0' })}">` +
    burnCollapsibleHead('APP', `${String(prefs.appearance || 'system').toUpperCase()} · ${String(prefs.density || 'comfortable').toUpperCase()} · ${meterSummary.toUpperCase()}`, state.appOpen, 'app') +
    (state.appOpen
      ? `<div style="${bstyle({ padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 2 })}">` +
        burnDropdownRow('Menu bar', 'trayMetric', cfg.trayMetric, BURN_OPT_TRAY) +
        burnDropdownRow('Usage bars', 'usageMeterMode', cfg.usageMeterMode || 'used', BURN_OPT_METER) +
        burnDropdownRow('Token history', 'tokenHistoryDays', cfg.tokenHistoryDays, BURN_OPT_HISTORY) +
        burnDropdownRow('Appearance', 'appearance', prefs.appearance || 'system', BURN_OPT_APPEARANCE) +
        burnDropdownRow('Density', 'density', prefs.density || 'comfortable', BURN_OPT_DENSITY) +
        burnDropdownRow('Time format', 'timeFormat', prefs.timeFormat || 'system', BURN_OPT_TIME) +
        burnDropdownRow('Reset times', 'resetDisplay', prefs.resetDisplay || 'countdown', BURN_OPT_RESET) +
        burnToggleRow('Reduce animations', !!prefs.reduceAnimations, 'pref:reduceAnimations') +
        burnToggleRow('Open at login', app.openAtLogin, 'app:openAtLogin') +
        burnShortcutRow(state) +
        `</div>`
      : '') +
    `</div>`

  const licenseGroup =
    `<div style="${bstyle({ padding: '14px 14px 0' })}">` +
    burnCollapsibleHead('SUPPORT', burnLicenseSummary(state.license), state.licenseOpen, 'license') +
    (state.licenseOpen ? burnLicenseBody(state) : '') +
    `</div>`

  const updatesGroup =
    `<div style="${bstyle({ padding: 14 })}">` +
    burnCollapsibleHead('UPDATES', (state.version || 'v0.2.4').toUpperCase(), state.updatesOpen, 'updates') +
    (state.updatesOpen ? burnUpdatesBody(state) : '') +
    `</div>`

  const body =
    `<div class="burn-body" style="${bstyle({ flex: 1, overflowY: 'auto' })}">${banner}${provRows}${notifsGroup}${appGroup}${burnPrivacySyncGroup(state)}${burnPricingFallbackGroup(state)}${burnProxyGroup(state)}${burnDiagnosticsGroup(state)}${licenseGroup}${updatesGroup}</div>`

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
    `<button type="button" data-burn-action="reveal-config" aria-label="Reveal config file" style="${textBtn}">CONFIG</button>` +
    `<button type="button" data-burn-action="reveal-log" aria-label="Reveal debug log" style="${textBtn}">LOG</button>` +
    `<button type="button" data-burn-action="export-usage" aria-label="Export usage JSON" style="${textBtn}">${state.justExported ? 'EXPORTED ✓' : 'EXPORT'}</button>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<button type="button" data-burn-action="save-config"${state.justSaved ? ' disabled' : ''} style="${burnPrimaryBtn()}">${
      state.justSaved
        ? `<span style="${bstyle({ display: 'inline-flex', alignItems: 'center', gap: 6 })}">${burnCheckTick(BURN.bg)}SAVED</span>`
        : 'Save'
    }</button>` +
    `</div>`

  return burnHeader({ backLabel: 'SETTINGS', settingsActive: true }) + body + footer
}
