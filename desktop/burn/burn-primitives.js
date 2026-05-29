/* BURN primitives — string-template components. Classic script.
   Interaction is wired by burn-app.js via [data-burn-*] attributes;
   these functions only produce markup. */

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
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">` +
    `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" ` +
    `stroke-linecap="square" stroke-linejoin="miter" /></svg>`
  )
}

function burnBtnStyle(active) {
  return bstyle({
    width: 26,
    height: 26,
    borderRadius: 2,
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
function burnHeader({ title = 'BURN', backLabel = '', diamondActive = false, settingsActive = false }) {
  let left
  if (backLabel) {
    const backBtn =
      `<button type="button" data-burn-nav="back" style="${bstyle({
        background: BURN.surface,
        border: `1px solid ${BURN.border}`,
        borderRadius: 2,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 8px',
        height: 22,
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

  const diamond =
    `<button type="button" data-burn-nav="missions" aria-label="Missions" style="${burnBtnStyle(diamondActive)}">${burnDiamondGlyph(11)}</button>`
  const gear =
    `<button type="button" data-burn-nav="settings" aria-label="Settings" style="${burnBtnStyle(settingsActive)}">${burnIcon('settings', 13, settingsActive ? BURN.lime : BURN.text2)}</button>`

  return (
    `<div style="${bstyle({
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '11px 14px',
      borderBottom: `1px solid ${BURN.border}`,
    })}">${left}<span style="${bstyle({ flex: 1 })}"></span>${diamond}${gear}</div>`
  )
}

// Glowing lime dot + mono caption + right-aligned warn count.
function burnLiveStrip({ streams = 0, burning = 0, label = '' } = {}) {
  const dot = `<span class="burn-live-dot"></span>`
  const text = label || `LIVE · ${streams} STREAMS`
  const burnCount =
    burning > 0
      ? `<span style="${bstyle({ color: BURN.warnText })}">${burning} BURNING</span>`
      : ''
  return (
    `<div style="${bstyle({
      padding: '8px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontFamily: BURN_FONT.mono,
      fontSize: 9.5,
      color: BURN.text2,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      borderBottom: `1px solid ${BURN.border}`,
      background: BURN.surface,
    })}">${dot}<span>${burnEsc(text)}</span><span style="${bstyle({ flex: 1 })}"></span>${burnCount}</div>`
  )
}

// 32×18 hard-rect toggle. toggleKey routes the click in burn-app.
function burnSwitch(toggleKey, on) {
  return (
    `<button type="button" data-burn-toggle="${burnEsc(toggleKey)}" role="switch" aria-checked="${on ? 'true' : 'false'}" style="${bstyle({
      width: 32,
      height: 18,
      padding: 0,
      background: on ? BURN.lime : BURN.text4,
      border: 'none',
      borderRadius: 2,
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
      transition: 'left 120ms ease',
    })}"></span></button>`
  )
}

// Collapsible group head. collapseKey routes the toggle in burn-app.
function burnCollapsibleHead(label, right, open, collapseKey) {
  return (
    `<button type="button" data-burn-collapse="${burnEsc(collapseKey)}" style="${bstyle({
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '9px 11px',
      background: BURN.surface2,
      border: `1px solid ${BURN.borderHi}`,
      borderRadius: 2,
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
    burnSwitch(toggleKey, on) +
    `</div>`
  )
}

// Real, interactive dropdown: a styled native <select>. data-burn-select routes
// the change to burnState in burn-app. options = [[value, label], ...].
function burnSelect(key, value, options) {
  const opts = options
    .map(([v, label]) => `<option value="${burnEsc(v)}"${String(v) === String(value) ? ' selected' : ''}>${burnEsc(label)}</option>`)
    .join('')
  return (
    `<span style="${bstyle({ position: 'relative', display: 'inline-flex', alignItems: 'center' })}">` +
    `<select data-burn-select="${burnEsc(key)}" style="${bstyle({
      appearance: 'none',
      WebkitAppearance: 'none',
      padding: '5px 24px 5px 8px',
      background: BURN.bg,
      border: `1px solid ${BURN.border}`,
      borderRadius: 2,
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
    burnSelect(key, value, options) +
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
      borderRadius: 2,
      padding: '7px 9px',
    })}">` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 8.5, color: BURN.text2, letterSpacing: 0.6 })}">${burnEsc(label)}</div>` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 13, fontWeight: 700, color: BURN.text, fontVariantNumeric: 'tabular-nums', marginTop: 3 })}">${burnEsc(value)}</div>` +
    `</div>`
  )
}

// 3-tile stats strip (SPENT · LEFT · SYNC).
function burnFooter({ items, syncing = false } = {}) {
  const tiles = items || [
    { l: 'SPENT', v: '$181', tone: 'lime' },
    { l: 'LEFT', v: '$421', tone: 'warn' },
    { l: 'SYNC', v: '15m', tone: 'text', action: 'sync' },
  ]
  const toneColor = { lime: BURN.limeText, warn: BURN.warnText, text: BURN.text }
  const tilesHtml = tiles
    .map((it) => {
      const color = it.color || toneColor[it.tone] || BURN.text
      const tileStyle = bstyle({
        flex: 1,
        background: BURN.bg,
        border: `1px solid ${BURN.border}`,
        borderRadius: 2,
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        textAlign: 'left',
        cursor: it.action ? 'pointer' : 'default',
      })
      // Sync tile: refresh icon (spins while syncing) pinned to the top-right
      // corner, with the bold word 'SYNC' as the tile's main label so it reads
      // clearly as the button that syncs all model usage.
      const labelRow = it.action
        ? `<span style="${bstyle({ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: 11 })}">` +
          `<span class="${syncing ? 'burn-spin' : ''}" style="${bstyle({ display: 'inline-flex' })}">${burnIcon('refresh', 13, BURN.text2)}</span></span>`
        : `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 8.5, color: BURN.text2, letterSpacing: 0.6 })}">${burnEsc(it.l)}</span>`
      const valueText = it.action ? (syncing ? 'SYNCING' : 'SYNC') : it.v
      const value = `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 12, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', letterSpacing: it.action ? 0.6 : 0 })}">${burnEsc(valueText)}</span>`
      const tag = it.action ? 'button' : 'div'
      const attrs = it.action ? ` type="button" data-burn-action="${burnEsc(it.action)}"` : ''
      return `<${tag}${attrs} style="${tileStyle}">${labelRow}${value}</${tag}>`
    })
    .join('')
  return (
    `<div style="${bstyle({
      display: 'flex',
      gap: 6,
      padding: 8,
      borderTop: `1px solid ${BURN.border}`,
      background: BURN.surface,
    })}">${tilesHtml}</div>`
  )
}
