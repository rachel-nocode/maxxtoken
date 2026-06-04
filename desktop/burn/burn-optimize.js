/* BURN Optimize — the in-popover Optimize screen. Classic script: reuses the
   Burn design system (burnHeader, burnSegBar, burnSectionHead, burnFooter,
   burnProvGlyph, burnIcon) and renders Signals from window.OptimizeDetect.

   One card = one signal. Collapsed by default; expands for the math, breakdown,
   source, actions. Multiple cards open at once (it's a dashboard, not Burn's
   single-focus list). Sorted by $ desc. See optimize-handoff/{SPEC,CARDS}.md. */

// dim lime for the "already-paid" reset meter (theme-aware; not a BURN token)
function optLimeDim() {
  return burnState && burnState.app && burnState.app.lightMode ? '#A2B079' : '#88BE2E'
}

function optHasSignals(state) {
  const m = state && state.optimizeModel
  if (!m || !Array.isArray(m.signals)) return false
  return m.signals.some((s) => !optIsHidden(state, s))
}

// Hidden = snoozed (time) or dismissed-and-not-yet-moved. Delegates the rule to
// the pure predicate in optimize-detect so it stays testable.
function optIsHidden(state, signal) {
  const store = (state && state.optStore) || {}
  const record = store[signal.id]
  if (!record) return false
  if (window.OptimizeDetect && window.OptimizeDetect.isSignalHidden) {
    return window.OptimizeDetect.isSignalHidden(signal, record, Date.now())
  }
  return !!(record.snoozedUntil && Date.now() < record.snoozedUntil) || !!record.dismissedAt
}

// ----- meters (collapsed viz) — 28-cell geometry matching burnSegBar ---------
function optCells(litFn, cells = 28, height = 5, gap = 2) {
  let html = ''
  for (let i = 0; i < cells; i++) {
    html += `<span style="${bstyle({ flex: 1, height, background: litFn(i) })}"></span>`
  }
  return `<div style="${bstyle({ display: 'flex', gap, width: '100%' })}">${html}</div>`
}

function optMeter(meter) {
  if (!meter) return ''
  const cells = 28
  if (meter.type === 'split') {
    const good = Math.round((Math.max(0, Math.min(100, meter.good)) / 100) * cells)
    return optCells((i) => (i < good ? BURN.lime : BURN.warn))
  }
  if (meter.type === 'headroom') {
    const used = Math.round((Math.max(0, Math.min(100, meter.used)) / 100) * cells)
    return optCells((i) => (i < used ? BURN.lime : BURN.text4))
  }
  if (meter.type === 'reset') {
    const used = Math.round((Math.max(0, Math.min(100, meter.used)) / 100) * cells)
    const dim = optLimeDim()
    return optCells((i) => (i < used ? dim : BURN.text4))
  }
  if (meter.type === 'ratio') {
    // log scale track with a lime healthy band + a warn marker at the value.
    const L = Math.log10(0.001)
    const R = Math.log10(1000)
    const posOf = (v) => {
      const c = Math.max(0.001, Math.min(1000, Number(v) || 0.001))
      return ((Math.log10(c) - L) / (R - L)) * 100
    }
    const bandLo = posOf(meter.lo)
    const bandHi = posOf(meter.hi)
    const mark = posOf(meter.value)
    return (
      `<div style="${bstyle({ position: 'relative', height: 6, width: '100%', background: BURN.text4, borderRadius: 1 })}">` +
      `<div style="${bstyle({ position: 'absolute', top: 0, bottom: 0, left: `${bandLo}%`, width: `${Math.max(2, bandHi - bandLo)}%`, background: BURN.lime, opacity: 0.5 })}"></div>` +
      `<div style="${bstyle({ position: 'absolute', top: -2, width: 3, height: 10, left: `calc(${Math.max(0, Math.min(100, mark))}% - 1px)`, background: BURN.warn })}"></div>` +
      `</div>`
    )
  }
  if (meter.type === 'pace') {
    // lime up to where you SHOULD be by now; warn for the over-pace beyond it.
    const used = Math.round((Math.max(0, Math.min(100, meter.used)) / 100) * cells)
    const exp = Math.round((Math.max(0, Math.min(100, meter.expected)) / 100) * cells)
    return optCells((i) => (i < exp ? BURN.lime : i < used ? BURN.warn : BURN.text4))
  }
  if (meter.type === 'bloat') {
    // warn-lit bar showing how heavy the per-message setup is (vs a 40K ceiling)
    const lit = Math.round((Math.max(0, Math.min(100, meter.filled)) / 100) * cells)
    return optCells((i) => (i < lit ? BURN.warn : BURN.text4))
  }
  if (meter.type === 'dormant') {
    return (
      `<div style="${bstyle({ position: 'relative', height: 2, width: '100%', background: BURN.text4 })}">` +
      `<span style="${bstyle({ position: 'absolute', right: 0, top: -3, width: 2, height: 8, background: BURN.warn })}"></span>` +
      `</div>`
    )
  }
  return ''
}

// ----- expanded detail blocks ------------------------------------------------
function optDetailRow(row) {
  const tone = row.tone === 'warn' ? BURN.warnText : row.tone === 'lime' ? BURN.limeText : BURN.text2
  return (
    `<div style="${bstyle({ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, fontFamily: BURN_FONT.mono, fontSize: 11.5, fontVariantNumeric: 'tabular-nums', padding: '3px 0' })}">` +
    `<span style="${bstyle({ color: BURN.text2 })}">${burnEsc(row.l)}</span>` +
    `<span style="${bstyle({ color: tone, fontWeight: row.strong ? 700 : 400 })}">${burnEsc(row.v)}</span>` +
    `</div>`
  )
}

function optBarRow(b, dim) {
  const color = dim ? optLimeDim() : BURN.lime
  const cells = 20
  const lit = Math.round((Math.max(0, Math.min(100, b.pct)) / 100) * cells)
  const bar = optCells((i) => (i < lit ? color : BURN.text4), cells, 3)
  return (
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8, fontFamily: BURN_FONT.mono, fontSize: 10.5 })}">` +
    `<span style="${bstyle({ color: BURN.text2, minWidth: 64 })}">${burnEsc(b.name)}</span>` +
    `<span style="${bstyle({ flex: 1 })}">${bar}</span>` +
    `<span style="${bstyle({ color: BURN.text, minWidth: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' })}">${b.pct}%</span>` +
    `</div>`
  )
}

function optGhostBtn(label, action, id) {
  return (
    `<button type="button" data-burn-opt-action="${burnEsc(action)}:${burnEsc(id)}" style="${bstyle({
      background: 'transparent',
      border: `1px solid ${BURN.border}`,
      borderRadius: 2,
      color: BURN.text2,
      fontFamily: BURN_FONT.mono,
      fontSize: 10.5,
      fontWeight: 600,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      padding: '6px 10px',
      cursor: 'pointer',
    })}">${burnEsc(label)}</button>`
  )
}

function optScanResults(state, s) {
  if (s.kind !== 'configBloat') return ''
  const loading = !!(state.optContextScanLoading && state.optContextScanLoading[s.provider])
  const scan = state.optContextScan && state.optContextScan[s.provider]
  if (loading) {
    return `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10.5, color: BURN.text2, letterSpacing: 0.4 })}">Scanning folder...</div>`
  }
  if (!scan) return ''
  if (scan.ok === false) {
    return `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11.5, color: BURN.warnText, lineHeight: 1.45 })}">${burnEsc(scan.error || 'Could not scan that folder.')}</div>`
  }
  const rows = Array.isArray(scan.findings) ? scan.findings.slice(0, 5) : []
  const list = rows.length
    ? rows.map((f, i) => (
      `<div style="${bstyle({ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '6px 0', borderTop: `1px solid ${BURN.border}`, alignItems: 'center' })}">` +
      `<div style="${bstyle({ minWidth: 0 })}">` +
      `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10.5, fontWeight: 700, color: BURN.text, letterSpacing: 0.3, textTransform: 'uppercase' })}">${burnEsc(f.action || 'Fix')}</div>` +
      `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11.5, color: BURN.text2, lineHeight: 1.35, overflowWrap: 'anywhere' })}">${burnEsc(f.detail || '')}</div>` +
      `</div>` +
      `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 7 })}">` +
      `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10, color: BURN.limeText, fontVariantNumeric: 'tabular-nums' })}">${Number(f.estimatedTokens) > 0 ? burnEsc(f.tokenLabel || '') : ''}</span>` +
      (f.path ? `<button type="button" data-burn-opt-reveal="${burnEsc(`${s.provider}:${i}`)}" style="${bstyle({ background: 'transparent', border: `1px solid ${BURN.border}`, borderRadius: 2, color: BURN.text2, fontFamily: BURN_FONT.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', padding: '4px 7px', cursor: 'pointer' })}">Finder</button>` : '') +
      `</div>` +
      `</div>`
    )).join('')
    : `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11.5, color: BURN.text2, lineHeight: 1.45 })}">No obvious context bloat found.</div>`
  return (
    `<div style="${bstyle({ display: 'flex', flexDirection: 'column', gap: 7 })}">` +
    burnSectionHead('REVIEW LIST', scan.folderName || '') +
    `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11.5, color: BURN.text2, lineHeight: 1.45 })}">${burnEsc(scan.summary || '')}</div>` +
    list +
    `</div>`
  )
}

function optCardExpanded(state, s) {
  const d = s.detail || {}
  const blocks = []

  if (Array.isArray(d.rows) && d.rows.length) {
    blocks.push(burnSectionHead('WHY', 'estimate') + d.rows.map(optDetailRow).join(''))
  }
  if (Array.isArray(d.bars) && d.bars.length) {
    const dim = d.barsTone === 'dim'
    blocks.push(
      burnSectionHead(d.barsTitle || 'BY MODEL', '') +
        `<div style="${bstyle({ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 })}">` +
        d.bars.map((b) => optBarRow(b, dim)).join('') +
        `</div>` +
        (d.barsNote ? `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11, color: BURN.text2, lineHeight: 1.5, marginTop: 6 })}">${burnEsc(d.barsNote)}</div>` : ''),
    )
  }
  if (d.note) {
    blocks.push(`<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12, color: BURN.text2, lineHeight: 1.55 })}">${burnEsc(d.note)}</div>`)
  }
  if (s.source) {
    blocks.push(`<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9, color: BURN.text3, letterSpacing: 0.4, textTransform: 'uppercase' })}">DATA: ${burnEsc(s.source)}</div>`)
  }
  const scanResults = optScanResults(state, s)
  if (scanResults) blocks.push(scanResults)

  const primary =
    `<button type="button" data-burn-opt-action="primary:${burnEsc(s.id)}" style="${bstyle({
      background: BURN.lime,
      color: BURN.bg,
      border: 'none',
      borderRadius: 2,
      fontFamily: BURN_FONT.mono,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.3,
      padding: '7px 11px',
      cursor: 'pointer',
    })}">${burnEsc(d.primary || 'Apply →')}</button>`
  const actions =
    `<div style="${bstyle({ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 })}">` +
    primary +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    optGhostBtn('Later', 'snooze', s.id) +
    optGhostBtn('Dismiss', 'dismiss', s.id) +
    `</div>`

  return (
    `<div style="${bstyle({ padding: '12px 14px 14px', borderTop: `1px dashed ${BURN.border}`, display: 'flex', flexDirection: 'column', gap: 14 })}">` +
    blocks.join('') +
    actions +
    `</div>`
  )
}

// ----- one card --------------------------------------------------------------
function optCard(state, s) {
  const expanded = !!(state.optExpanded && state.optExpanded[s.id])
  const alert = s.severity === 'alert'
  const accent = alert ? BURN.warn : BURN.lime
  const accentText = alert ? BURN.warnText : BURN.limeText
  const tagText = alert ? 'ALERT' : 'TIP'
  const wash = alert ? BURN.warnRowBg : BURN.accentWashBg
  const savingColor = alert ? BURN.warnText : BURN.limeText
  const savePrefix = s.softSaving ? '≈' : ''

  const head =
    `<div data-burn-opt-card="${burnEsc(s.id)}" style="${bstyle({ padding: '11px 14px 11px 12px', cursor: 'pointer', background: expanded ? wash : 'transparent' })}">` +
    // line 1
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 })}">` +
    `<span style="${bstyle({ width: 3, height: 3, background: accent })}"></span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 11, fontWeight: 700, color: BURN.text, letterSpacing: 0.3 })}">${burnEsc(s.title)}</span>` +
    burnProvGlyph(s.provider, 12, BURN.text3) +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9.5, color: BURN.text3, letterSpacing: 0.3 })}">${burnEsc(s.providerName)}</span>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
      `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 8.5, fontWeight: 700, color: accentText, border: `1px solid ${accent}`, borderRadius: 2, padding: '2px 5px', letterSpacing: 0.5 })}">${tagText}</span>` +
    `</div>` +
    // line 2 — metric · meter · $
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 12 })}">` +
    `<div style="${bstyle({ minWidth: 58 })}">` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 22, fontWeight: 700, color: accentText, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5 })}">${burnEsc(s.metric)}</div>` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 8, color: BURN.text3, letterSpacing: 0.4, marginTop: 3 })}">${burnEsc(s.metricUnit)}</div>` +
    `</div>` +
    `<div style="${bstyle({ flex: 1 })}">${optMeter(s.meter)}</div>` +
    `<div style="${bstyle({ textAlign: 'right', minWidth: 52 })}">` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 17, fontWeight: 700, color: savingColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' })}">${savePrefix}$${Math.round(s.saving)}</div>` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 8, color: BURN.text3, letterSpacing: 0.3, marginTop: 3 })}">${burnEsc(s.savingNote)}</div>` +
    `</div>` +
    `</div>` +
    // line 3 — fix + chevron
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 })}">` +
    `<span style="${bstyle({ color: accentText })}">↳</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12, color: BURN.text2, flex: 1, lineHeight: 1.4 })}">${burnEsc(s.fix)}</span>` +
    burnIcon(expanded ? 'chevron-up' : 'chevron-down', 11, BURN.text2) +
    `</div>` +
    `</div>`

  return (
    `<div style="${bstyle({ display: 'flex', borderBottom: `1px solid ${BURN.border}` })}">` +
    `<span style="${bstyle({ width: 3, flex: '0 0 auto', background: accent })}"></span>` +
    `<div style="${bstyle({ flex: 1, minWidth: 0 })}">${head}${expanded ? optCardExpanded(state, s) : ''}</div>` +
    `</div>`
  )
}

// ----- summary strip ---------------------------------------------------------
function optSummaryStrip(model) {
  const n = model.counts.total
  const k = model.counts.alerts
  const alerts = k > 0 ? `<span style="${bstyle({ color: BURN.warnText })}"> · ${k} ALERT${k > 1 ? 'S' : ''}</span>` : ''
  const rec = Math.round(model.recoverable || 0)
  const head = Math.round(model.headroom || 0)
  // Lead with hard recoverable $. When there's none (all flat-plan headroom),
  // lead with the headroom figure instead so the strip never reads a bare $0.
  let right
  if (rec > 0) {
    right =
      `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 11, fontWeight: 700, color: BURN.limeText, fontVariantNumeric: 'tabular-nums' })}">$${rec}/MO SAVE</span>` +
      (head > 0 ? `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9, color: BURN.text3, letterSpacing: 0.4, marginLeft: 8 })}">+$${head} ROOM</span>` : '')
  } else {
    right = `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 11, fontWeight: 700, color: BURN.limeText, fontVariantNumeric: 'tabular-nums' })}">$${head}/MO ROOM</span>`
  }
  return (
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: `1px solid ${BURN.border}`, background: BURN.surface })}">` +
    `<span class="burn-live-dot"></span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9.5, color: BURN.text2, letterSpacing: 0.6, textTransform: 'uppercase' })}">${n} TIP${n === 1 ? '' : 'S'}${alerts}</span>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    right +
    `</div>`
  )
}

// ----- provider filter -------------------------------------------------------
function optFilterRow(state, model) {
  const active = state.optFilter || 'ALL'
  const chip = (value, label) => {
    const on = active === value
    return (
      `<button type="button" data-burn-opt-filter="${burnEsc(value)}" style="${bstyle({
        fontFamily: BURN_FONT.mono,
        fontSize: 9.5,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        padding: '5px 9px',
        borderRadius: 2,
        cursor: 'pointer',
        background: on ? BURN.accentBtnBg : 'transparent',
        border: `1px solid ${on ? BURN.accentBtnBorder : BURN.border}`,
        color: on ? BURN.limeText : BURN.text3,
      })}">${burnEsc(label)}</button>`
    )
  }
  const chips = [chip('ALL', 'All')].concat(model.providers.map((p) => chip(p.id, p.name)))
  return (
    `<div style="${bstyle({ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${BURN.border}` })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 8.5, color: BURN.text3, letterSpacing: 0.6 })}">FILTER</span>` +
    chips.join('') +
    `</div>`
  )
}

function optSaveModePanel(model) {
  const sm = model.saveMode || { enabled: false, reservePct: 40, actions: [] }
  const enabled = sm.enabled === true
  const actions = Array.isArray(sm.actions) ? sm.actions : []
  const actionRows = enabled
    ? actions.length
      ? actions.map((a) => (
        `<div style="${bstyle({ display: 'grid', gridTemplateColumns: '1fr', gap: 3, padding: '8px 11px', borderTop: `1px solid ${BURN.border}` })}">` +
        `<div style="${bstyle({ display: 'flex', alignItems: 'baseline', gap: 7 })}">` +
        `<span style="${bstyle({ width: 3, height: 3, background: BURN.lime, flex: '0 0 auto' })}"></span>` +
        `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10.5, fontWeight: 700, color: BURN.text, letterSpacing: 0.3, textTransform: 'uppercase' })}">${burnEsc(a.title)}</span>` +
        (a.providerName ? `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9, color: BURN.text3, letterSpacing: 0.3 })}">${burnEsc(a.providerName)}</span>` : '') +
        `</div>` +
        `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11.5, color: BURN.text2, lineHeight: 1.45, paddingLeft: 10 })}">${burnEsc(a.detail)}</div>` +
        `</div>`
      )).join('')
      : `<div style="${bstyle({ padding: '8px 11px', borderTop: `1px solid ${BURN.border}`, fontFamily: BURN_FONT.sans, fontSize: 11.5, color: BURN.text2, lineHeight: 1.45 })}">No urgent saves right now.</div>`
    : `<div style="${bstyle({ padding: '8px 11px', borderTop: `1px solid ${BURN.border}`, fontFamily: BURN_FONT.sans, fontSize: 11.5, color: BURN.text2, lineHeight: 1.45 })}">Shows the best token-saving moves first.</div>`

  return (
    `<div style="${bstyle({ margin: '10px 14px', border: `1px solid ${enabled ? BURN.accentBtnBorder : BURN.border}`, background: enabled ? BURN.accentWashBg : BURN.surface, borderRadius: 2 })}">` +
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px' })}">` +
    `<div style="${bstyle({ flex: 1, minWidth: 0 })}">` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 11, fontWeight: 700, color: enabled ? BURN.limeText : BURN.text, letterSpacing: 0.5, textTransform: 'uppercase' })}">Save Mode</div>` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9, color: BURN.text3, letterSpacing: 0.4, marginTop: 3 })}">${enabled ? `${actions.length} MOVE${actions.length === 1 ? '' : 'S'} · ${sm.reservePct}% RESERVE` : 'OFF'}</div>` +
    `</div>` +
    burnSwitch('opt:saveMode', enabled) +
    `</div>` +
    actionRows +
    `</div>`
  )
}

// ----- healthy / empty state -------------------------------------------------
function optHealthyState() {
  return (
    `<div style="${bstyle({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '46px 24px', textAlign: 'center' })}">` +
    `<div style="${bstyle({ width: 46, height: 46, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: BURN.accentBtnBg, border: `1px solid ${BURN.accentBtnBorder}`, borderRadius: 3 })}">${burnIcon('check', 20, BURN.lime)}</div>` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 13, fontWeight: 700, color: BURN.text, letterSpacing: 1 })}">LOOKS GOOD</div>` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12.5, color: BURN.text2, lineHeight: 1.55, maxWidth: 280 })}">No token waste found right now.</div>` +
    `</div>`
  )
}

// ----- agentic session drill-down (opt-in) ----------------------------------
function optProviderById(state, id) {
  const ps = state.lastSnap && state.lastSnap.providers
  return Array.isArray(ps) ? ps.find((p) => p.id === id) || null : null
}

// one day row: date · ratio · cache% · mini ratio meter · chevron
function optDayRow(pid, d, open) {
  const ratioStr = d.ratio < 0.1 ? d.ratio.toFixed(3) : d.ratio.toFixed(2)
  const cacheTone = d.cacheHitPct >= 50 ? BURN.limeText : BURN.warnText
  const head =
    `<button type="button" data-burn-opt-day="${burnEsc(pid)}:${burnEsc(d.dayKey)}" style="${bstyle({
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 4px',
      background: 'transparent',
      border: 'none',
      borderBottom: `1px solid ${BURN.border}`,
      cursor: 'pointer',
      color: BURN.text,
    })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10.5, color: BURN.text2, minWidth: 74, textAlign: 'left' })}">${burnEsc(d.dayKey)}</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 12, fontWeight: 700, color: BURN.text, minWidth: 46, textAlign: 'left', fontVariantNumeric: 'tabular-nums' })}">${ratioStr}</span>` +
    `<span style="${bstyle({ flex: 1, maxWidth: 90 })}">${optMeter({ type: 'ratio', value: d.ratio, lo: 0.3, hi: 3.0 })}</span>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10, color: cacheTone, fontVariantNumeric: 'tabular-nums' })}">${d.cacheHitPct}% cache</span>` +
    burnIcon(open ? 'chevron-up' : 'chevron-down', 11, BURN.text2) +
    `</button>`

  let detail = ''
  if (open && window.OptimizeDetect && window.OptimizeDetect.detectRatioDaily) {
    const prov = optProviderById(burnState, pid)
    const sig = prov ? window.OptimizeDetect.detectRatioDaily(prov, d.dayKey) : null
    if (sig) {
      detail =
        `<div style="${bstyle({ padding: '10px 4px 12px', display: 'flex', flexDirection: 'column', gap: 8 })}">` +
        (sig.detail.rows || []).map(optDetailRow).join('') +
        (sig.detail.note ? `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11.5, color: BURN.text2, lineHeight: 1.5 })}">${burnEsc(sig.detail.note)}</div>` : '') +
        `</div>`
    }
  }
  return head + detail
}

function optDrillProvider(state, p) {
  const open = !!state.optDrillOpen[p.id]
  const prov = optProviderById(state, p.id)
  const series = prov && window.OptimizeDetect ? window.OptimizeDetect.dailyRatioSeries(prov, { days: 10 }) : []
  const headRight = `${series.length} DAY${series.length === 1 ? '' : 'S'}`
  const head =
    `<button type="button" data-burn-opt-drill="${burnEsc(p.id)}" style="${bstyle({
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
    })}">` +
    burnProvGlyph(p.id, 13, BURN.text2) +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 11, fontWeight: 700, color: BURN.text, letterSpacing: 0.3 })}">${burnEsc(p.name)}</span>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9, color: BURN.text2, letterSpacing: 0.5 })}">${headRight}</span>` +
    burnIcon(open ? 'chevron-up' : 'chevron-down', 11, BURN.text2) +
    `</button>`
  const body = open
    ? `<div style="${bstyle({ padding: '4px 11px 8px' })}">` +
      (series.length
        ? series.map((d) => optDayRow(p.id, d, state.optDrillDay[p.id] === d.dayKey)).join('')
        : `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10, color: BURN.text2, padding: '8px 0' })}">NO RECENT DAILY DATA</div>`) +
      `</div>`
    : ''
  return `<div style="${bstyle({ marginBottom: 6 })}">${head}${body}</div>`
}

function optDrillSection(state, model) {
  if (!Array.isArray(model.drillable) || !model.drillable.length) return ''
  return (
    `<div style="${bstyle({ padding: '14px 14px 10px', borderTop: `1px solid ${BURN.border}` })}">` +
    burnSectionHead('HEAVY DAYS', 'optional') +
    `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11.5, color: BURN.text2, lineHeight: 1.5, margin: '8px 0 12px' })}">Open a provider to spot unusually heavy days.</div>` +
    model.drillable.map((p) => optDrillProvider(state, p)).join('') +
    `</div>`
  )
}

// ----- screen ----------------------------------------------------------------
function burnRenderOptimize(state) {
  const model = state.optimizeModel || { signals: [], providers: [], counts: { total: 0, alerts: 0 }, recoverable: 0, scannedAt: Date.now() }
  const filter = state.optFilter || 'ALL'
  const visible = model.signals
    .filter((s) => !optIsHidden(state, s))
    .filter((s) => filter === 'ALL' || s.provider === filter)
    .sort((a, b) => b.saving - a.saving)

  const drill = optDrillSection(state, model)
  const cardsHtml = visible.length
    ? visible.map((s) => optCard(state, s)).join('')
    : drill // if no signals but agentic drill-downs exist, lead with those
      ? ''
      : optHealthyState()
  const body = cardsHtml + drill

  // Summary + footer reflect the CURRENT view (respect filter + dismissals).
  const recoverable = visible
    .filter((s) => s.countedInTotal)
    .reduce((acc, s) => acc + (Number(s.saving) || 0), 0)
  const headroom = visible
    .filter((s) => s.softSaving)
    .reduce((acc, s) => acc + (Number(s.saving) || 0), 0)
  const view = {
    counts: { total: visible.length, alerts: visible.filter((s) => s.severity === 'alert').length },
    recoverable,
    headroom,
  }

  const mins = Math.max(0, Math.round((Date.now() - (model.scannedAt || Date.now())) / 60000))
  const footer = [
    recoverable > 0
      ? { l: 'SAVE', v: `$${Math.round(recoverable)}/mo`, tone: 'lime' }
      : { l: 'ROOM', v: `$${Math.round(headroom)}/mo`, tone: 'lime' },
    { l: 'CHECKED', v: `${mins}m`, tone: 'text', action: 'opt-rescan' },
  ]

  return (
    burnHeader({ backLabel: 'OPTIMIZE', optimizeActive: true, hasSignals: optHasSignals(state) }) +
    optSummaryStrip(view) +
    optSaveModePanel(model) +
    optFilterRow(state, model) +
    `<div class="burn-body" style="${bstyle({ flex: 1, overflowY: 'auto' })}">${body}</div>` +
    burnFooter({ items: footer })
  )
}
