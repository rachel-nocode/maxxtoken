/* BURN Settings — provider rows + collapsible groups. Classic script.
   Provider list derives from live adapted providers (plus the OpenAI API row).
   Toggles/collapsibles/cookies live in session state; Reveal config/log and
   Save delegate to existing IPC. Full config persistence is a follow-up. */

const BURN_COOKIE_PROVIDERS = new Set(['cursor', 'grok', 'openai'])

function burnCookiePlaceholder(id) {
  return id === 'cursor'
    ? 'Cookie: WorkosCursorSessionToken=...'
    : 'Cookie: sso=...; sso-rw=... or Bearer ...'
}

// Build the settings provider list once per snapshot, preserving any user
// drag order already in state.
function burnSettingsProviders(state) {
  const base = (state.providers || []).map((p) => ({
    id: p.id,
    name: p.name,
    sub: `${p.plan} · detected`,
    cookie: BURN_COOKIE_PROVIDERS.has(p.id),
  }))
  if (!base.some((p) => p.id === 'openai')) {
    base.push({ id: 'openai', name: 'OpenAI API', sub: 'Admin API · add API key', cookie: true })
  }
  const order = state.settingsOrder || []
  if (order.length) {
    base.sort((a, b) => {
      const ia = order.indexOf(a.id)
      const ib = order.indexOf(b.id)
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
    })
  }
  return base
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
    burnSettingDropdown('WARN AUTO') +
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
        `<button type="button" data-burn-action="save-cookie" data-cookie-id="${burnEsc(pv.id)}" style="${burnGhostBtn}">SAVE</button>` +
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

function burnRenderSettings(state) {
  const provs = burnSettingsProviders(state)
  const enabled = state.settingsEnabled || {}
  const cookies = state.cookies || {}
  const notifs = state.notifs
  const app = state.app

  const banner =
    `<div style="${bstyle({
      margin: 14,
      padding: '9px 11px',
      background: 'rgba(182,255,60,0.05)',
      border: '1px solid rgba(182,255,60,0.20)',
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
        burnDropdownRow('Session warning', '50% + 20% left') +
        burnDropdownRow('Weekly warning', '50% + 20% left') +
        burnDropdownRow('Alert window', '48h before reset') +
        burnDropdownRow('Reserve floor', '25% unused') +
        `</div>`
      : '') +
    `</div>`

  const appGroup =
    `<div style="${bstyle({ padding: '14px 14px 0' })}">` +
    burnCollapsibleHead('APP', 'DARK · VALUE LEFT', state.appOpen, 'app') +
    (state.appOpen
      ? `<div style="${bstyle({ padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 2 })}">` +
        burnDropdownRow('Menu bar', 'Value left') +
        burnDropdownRow('Token history', '30 days') +
        burnToggleRow('Light mode', app.lightMode, 'app:lightMode') +
        burnToggleRow('Open at login', app.openAtLogin, 'app:openAtLogin') +
        `</div>`
      : '') +
    `</div>`

  const updatesGroup =
    `<div style="${bstyle({ padding: 14 })}">` +
    burnCollapsibleHead('UPDATES', (state.version || 'v0.2.3-beta.1').toUpperCase(), false, 'updates') +
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
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<button type="button" data-burn-action="save-config" style="${burnPrimaryBtn}">Save</button>` +
    `</div>`

  return burnHeader({ backLabel: 'DETECTED PROVIDERS', settingsActive: true }) + body + footer
}
