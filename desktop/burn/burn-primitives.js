/* BURN primitives — string-template components. Classic script.
   Interaction is wired by burn-app.js via [data-burn-*] attributes;
   these functions only produce markup. */

// Capability status comes from the main provider registry through config.
function burnProviderVisible(p) {
  return (p?.status || 'supported') !== 'hidden'
}
// By id, looked up against the full config — for screens (Home) whose provider
// objects come from the snapshot and may not carry the tier field.
function burnProviderVisibleById(state, id) {
  return burnProviderVisible(state && state.config && state.config.providers && state.config.providers[id])
}

// THE progress bar. 28×5 default; 20×3 for per-model sub-bars.
function burnSegBar({ pct, burning = false, cells = 28, height = 5, gap = 2 }) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0))
  const lit = Math.round((clamped / 100) * cells)
  const litColor = burning ? BURN.warn : BURN.lime
  let cellsHtml = ''
  for (let i = 0; i < cells; i++) {
    cellsHtml += `<span style="${bstyle({
      flex: 1,
      height,
      background: i < lit ? litColor : BURN.text4,
    })}"></span>`
  }
  return `<div style="${bstyle({ display: 'flex', gap, width: '100%' })}">${cellsHtml}</div>`
}

// 56×14 polyline of the last-9 sync ticks.
function burnSparkline({ data, color, width = 56, height = 14, strokeWidth = 1.2 }) {
  const series = Array.isArray(data) && data.length ? data : [0]
  const max = Math.max(...series) * 1.1 || 1
  const step = width / Math.max(1, series.length - 1)
  const pts = series
    .map((v, i) => `${(i * step).toFixed(2)},${(height - (v / max) * height).toFixed(2)}`)
    .join(' ')
  return (
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Recent usage trend">` +
    `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" ` +
    `stroke-linecap="square" stroke-linejoin="miter" /></svg>`
  )
}

function burnBtnStyle(active) {
  return bstyle({
    width: 30,
    height: 30,
    borderRadius: 9,
    background: active ? BURN.accentBtnBg : BURN.surface,
    border: `1px solid ${active ? BURN.accentBtnBorder : BURN.border}`,
    cursor: 'pointer',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: BURN.text2,
  })
}

// The 48pt header. Home mode (wordmark) when no backLabel; subpage mode otherwise.
function burnHeader({ title = 'BURN', backLabel = '', diamondActive = false, settingsActive = false, optimizeActive = false, hasSignals = false }) {
  let left
  if (backLabel) {
    const backBtn =
      `<button type="button" data-burn-nav="back" style="${bstyle({
        background: BURN.surface,
        border: `1px solid ${BURN.border}`,
        borderRadius: 8,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 8px',
        height: 28,
        color: BURN.limeText,
        fontFamily: BURN_FONT.mono,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
      })}">‹ BACK</button>`
    const label =
      `<span style="${bstyle({
        fontFamily: BURN_FONT.mono,
        fontSize: 10,
        color: BURN.text2,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
      })}">· ${burnEsc(backLabel)}</span>`
    left = backBtn + label
  } else {
    const tile = burnBrandMark(20)
    const wordmark =
      `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 13, fontWeight: 700, letterSpacing: -0.2 })}">` +
      `Maxx<span style="${bstyle({ color: BURN.limeText })}">Token</span></span>`
    // Brand acts as a Home link — always returns to the usage screen.
    left =
      `<button type="button" data-burn-nav="home" aria-label="Home" style="${bstyle({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: 'inherit',
      })}">${tile}${wordmark}</button>`
  }

  // Optimize entry — sliders glyph, always lime so it reads as the primary
  // money-saving affordance (per optimize-handoff/ENTRYPOINT.md). Fresh-signal
  // dot pinned top-right when there's at least one un-actioned signal.
  const optimizeDot = hasSignals
    ? `<span style="${bstyle({
        position: 'absolute',
        top: -3,
        right: -3,
        width: 7,
        height: 7,
        borderRadius: 7,
        background: BURN.lime,
        boxShadow: `0 0 6px ${BURN.lime}`,
      })}"></span>`
    : ''
  const optimize =
    `<span style="${bstyle({ position: 'relative', display: 'inline-flex' })}">` +
    `<button type="button" data-burn-nav="optimize" aria-label="Optimize" style="${burnBtnStyle(true)}">${burnIcon('sliders', 14, BURN.limeText)}</button>` +
    optimizeDot +
    `</span>`
  // Token Coach entry (beta) — pulse glyph next to Optimize.
  const coach =
    `<button type="button" data-burn-nav="coach" aria-label="Token Coach" style="${burnBtnStyle(true)}">${burnIcon('pulse', 14, BURN.limeText)}</button>`
  // Missions hidden from UI (code retained). Render nothing for the diamond entry.
  const diamond = ''
  void diamondActive
  const gear =
    `<button type="button" data-burn-nav="settings" aria-label="Settings" style="${burnBtnStyle(settingsActive)}">${burnIcon('settings', 13, settingsActive ? BURN.lime : BURN.text2)}</button>`

  return (
    `<div style="${bstyle({
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '12px 14px 10px',
      borderBottom: `1px solid ${BURN.border}`,
    })}">${left}<span style="${bstyle({ flex: 1 })}"></span>${optimize}${coach}${diamond}${gear}</div>`
  )
}

// Quiet freshness strip + per-window risk count.
function burnLiveStrip({ streams = 0, burning = 0, label = '', stale = 0, syncing = false } = {}) {
  const dot = `<span class="burn-live-dot"></span>`
  const text = label || `${syncing ? 'REFRESHING' : 'LIVE'} · ${streams} PROVIDER${streams === 1 ? '' : 'S'}`
  const burnCount =
    burning > 0
      ? `<span style="${bstyle({ color: BURN.warnText })}">${burning} BURNING</span>`
      : stale > 0
        ? `<span style="${bstyle({ color: BURN.text2 })}">${stale} STALE</span>`
        : ''
  return (
    `<div style="${bstyle({
      padding: '7px 14px 9px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontFamily: BURN_FONT.mono,
      fontSize: 9.5,
      color: BURN.text2,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      background: BURN.surface,
    })}">${dot}<span>${burnEsc(text)}</span><span style="${bstyle({ flex: 1 })}"></span>${burnCount}</div>`
  )
}

// 32×18 hard-rect toggle. toggleKey routes the click in burn-app.
function burnSwitch(toggleKey, on, label = 'Toggle setting') {
  return (
    `<button type="button" data-burn-toggle="${burnEsc(toggleKey)}" role="switch" aria-label="${burnEsc(label)}" aria-checked="${on ? 'true' : 'false'}" style="${bstyle({
      width: 32,
      height: 18,
      padding: 0,
      background: on ? BURN.lime : BURN.text4,
      border: 'none',
      borderRadius: 10,
      cursor: 'pointer',
      position: 'relative',
      flex: '0 0 auto',
    })}"><span style="${bstyle({
      position: 'absolute',
      top: 2,
      left: on ? 16 : 2,
      width: 14,
      height: 14,
      background: on ? BURN.bg : BURN.text2,
      borderRadius: 8,
      transition: 'left 120ms ease',
    })}"></span></button>`
  )
}

// Collapsible group head. collapseKey routes the toggle in burn-app.
function burnCollapsibleHead(label, right, open, collapseKey) {
  return (
    `<button type="button" data-burn-collapse="${burnEsc(collapseKey)}" aria-expanded="${open ? 'true' : 'false'}" style="${bstyle({
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '9px 11px',
      background: BURN.surface2,
      border: `1px solid ${BURN.borderHi}`,
      borderRadius: 10,
      cursor: 'pointer',
      color: BURN.text,
      fontFamily: BURN_FONT.mono,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.6,
    })}">` +
    `<span style="${bstyle({ color: BURN.lime })}">${burnEsc(label)}</span>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<span style="${bstyle({ color: BURN.text2, fontWeight: 400, textTransform: 'uppercase' })}">${burnEsc(right)}</span>` +
    burnIcon(open ? 'chevron-up' : 'chevron-down', 11, BURN.text2) +
    `</button>`
  )
}

function burnToggleRow(label, on, toggleKey) {
  return (
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderBottom: `1px solid ${BURN.border}` })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12.5, color: BURN.text, flex: 1 })}">${burnEsc(label)}</span>` +
    burnSwitch(toggleKey, on, label) +
    `</div>`
  )
}

// Real, interactive dropdown: a styled native <select>. data-burn-select routes
// the change to burnState in burn-app. options = [[value, label], ...].
function burnSelect(key, value, options, ariaLabel = key) {
  const opts = options
    .map(([v, label]) => `<option value="${burnEsc(v)}"${String(v) === String(value) ? ' selected' : ''}>${burnEsc(label)}</option>`)
    .join('')
  return (
    `<span style="${bstyle({ position: 'relative', display: 'inline-flex', alignItems: 'center' })}">` +
    `<select data-burn-select="${burnEsc(key)}" aria-label="${burnEsc(ariaLabel)}" style="${bstyle({
      appearance: 'none',
      WebkitAppearance: 'none',
      padding: '5px 24px 5px 8px',
      background: BURN.bg,
      border: `1px solid ${BURN.border}`,
      borderRadius: 8,
      color: BURN.text2,
      fontFamily: BURN_FONT.mono,
      fontSize: 9.5,
      letterSpacing: 0.5,
      cursor: 'pointer',
      outline: 'none',
      whiteSpace: 'nowrap',
    })}">${opts}</select>` +
    `<span style="${bstyle({ position: 'absolute', right: 7, display: 'inline-flex', pointerEvents: 'none' })}">${burnIcon('chevron-down', 9, BURN.text2)}</span>` +
    `</span>`
  )
}

function burnDropdownRow(label, key, value, options) {
  return (
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderBottom: `1px solid ${BURN.border}` })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12.5, color: BURN.text, flex: 1 })}">${burnEsc(label)}</span>` +
    burnSelect(key, value, options, label) +
    `</div>`
  )
}

// Section head: lime label + dim right-meta + bottom hairline.
function burnSectionHead(label, right = '') {
  return (
    `<div style="${bstyle({
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      borderBottom: `1px solid ${BURN.border}`,
      paddingBottom: 4,
      fontFamily: BURN_FONT.mono,
      fontSize: 9.5,
      letterSpacing: 0.7,
    })}">` +
    `<span style="${bstyle({ color: BURN.limeText, fontWeight: 600 })}">${burnEsc(label)}</span>` +
    `<span style="${bstyle({ color: BURN.text2 })}">${burnEsc(right)}</span>` +
    `</div>`
  )
}

// Boxed stat tile (IN / CACHED / OUT).
function burnStat(label, value) {
  return (
    `<div style="${bstyle({
      background: BURN.bg,
      border: `1px solid ${BURN.border}`,
      borderRadius: 10,
      padding: '7px 9px',
    })}">` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 8.5, color: BURN.text2, letterSpacing: 0.6 })}">${burnEsc(label)}</div>` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 13, fontWeight: 700, color: BURN.text, fontVariantNumeric: 'tabular-nums', marginTop: 3 })}">${burnEsc(value)}</div>` +
    `</div>`
  )
}

// Compact status strip. Home plan values share a label; other screens keep
// their footer metrics as ordinary inline pairs.
function burnFooter({ items, syncing = false } = {}) {
  const footerItems = items || [
    { l: 'PLAN USED', v: '$181', tone: 'lime' },
    { l: 'PLAN LEFT', v: '$421', tone: 'warn' },
    { l: 'SYNC', v: '15m', tone: 'text', action: 'sync' },
  ]
  const toneColor = { lime: BURN.limeText, warn: BURN.warnText, text: BURN.text }
  const actionItem = footerItems.find((item) => item.action)
  const metrics = footerItems.filter((item) => !item.action)
  const used = metrics.find((item) => ['SPENT', 'PLAN USED', 'PLAN VALUE USED'].includes(String(item.l || '').toUpperCase()))
  const left = metrics.find((item) => ['LEFT', 'PLAN LEFT', 'PLAN VALUE LEFT'].includes(String(item.l || '').toUpperCase()))
  const isPlanValue = !!used && !!left

  const metricPair = (label, item, title = `${item.l}: ${item.v}`) => {
    const color = item.color || toneColor[item.tone] || BURN.text
    return (
      `<span title="${burnEsc(title)}" style="${bstyle({ display: 'inline-flex', alignItems: 'baseline', gap: 4, flex: '0 0 auto' })}">` +
      `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 8.5, color: BURN.text2, letterSpacing: 0.5 })}">${burnEsc(label)}</span>` +
      `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 12, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', flex: '0 0 auto' })}">${burnEsc(item.v)}</span>` +
      `</span>`
    )
  }

  let metricsHtml
  let metricsLabel
  if (isPlanValue) {
    const usedTitle = `Plan value used: ${used.v} · subscription plan value, not billed/API spend`
    const leftTitle = `Plan value left: ${left.v} · unused subscription plan value, not account balance`
    metricsLabel = `${usedTitle}. ${leftTitle}`
    metricsHtml =
      `<span class="burn-footer-plan-prefix" style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 8.5, color: BURN.text2, letterSpacing: 0.6, flex: '0 0 auto' })}">PLAN VALUE</span>` +
      metricPair('USED', used, usedTitle) +
      `<span aria-hidden="true" style="${bstyle({ color: BURN.text3, flex: '0 0 auto' })}">·</span>` +
      metricPair('LEFT', left, leftTitle)
  } else {
    metricsLabel = metrics.map((item) => `${item.l}: ${item.v}`).join('. ')
    metricsHtml = metrics.map((item, index) =>
      `${index ? `<span aria-hidden="true" style="${bstyle({ color: BURN.text3, flex: '0 0 auto' })}">·</span>` : ''}${metricPair(item.l, item)}`
    ).join('')
  }

  let actionHtml = ''
  if (actionItem) {
    const isSync = actionItem.action === 'sync'
    const actionLoading = isSync && syncing
    const actionText = actionLoading ? 'SYNCING' : isSync ? 'SYNC' : actionItem.action === 'opt-rescan' ? 'RESCAN' : (actionItem.l || actionItem.v || actionItem.action).toUpperCase()
    const actionLabel = actionLoading
      ? 'Syncing all providers'
      : isSync
        ? String(actionItem.l || '').toUpperCase() === 'NEXT REFRESH'
          ? `Sync all providers now · next automatic refresh ${actionItem.v}`
          : 'Sync all providers now'
        : actionItem.action === 'opt-rescan'
          ? `Rescan optimization opportunities · last checked ${actionItem.v} ago`
          : `${actionItem.l}: ${actionItem.v}`
    actionHtml =
      `<button type="button" class="burn-footer-action" data-burn-action="${burnEsc(actionItem.action)}" title="${burnEsc(actionLabel)}" aria-label="${burnEsc(actionLabel)}"` +
      `${actionLoading ? ' aria-busy="true" aria-disabled="true" aria-live="polite"' : ''} style="${bstyle({
        alignSelf: 'center',
        minWidth: 76,
        height: 30,
        margin: '0 0 0 10px',
        padding: '0 0 0 10px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 5,
        background: 'transparent',
        border: 'none',
        borderLeft: `1px solid ${BURN.border}`,
        color: BURN.text,
        cursor: actionLoading ? 'default' : 'pointer',
        fontFamily: BURN_FONT.mono,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: 0.5,
      })}">` +
      `<span class="${actionLoading ? 'burn-spin' : ''}" aria-hidden="true" style="${bstyle({ display: 'inline-flex', flex: '0 0 auto' })}">${burnIcon('refresh', 12, BURN.text2)}</span>` +
      `<span class="burn-footer-action-text">${burnEsc(actionText)}</span></button>`
  }

  return (
    `<div class="burn-footer" style="${bstyle({
      height: 38,
      flexShrink: 0,
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      alignItems: 'center',
      padding: '0 12px',
      borderTop: `1px solid ${BURN.border}`,
      background: BURN.surface,
    })}">` +
    `<div role="group" aria-label="${burnEsc(metricsLabel)}" style="${bstyle({ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' })}">${metricsHtml}</div>` +
    actionHtml +
    `</div>`
  )
}
