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

function optCachePromptRows(state, signal) {
  if (!signal || signal.kind !== 'cache') return ''
  const prompts = [
    {
      id: 'prefix',
      title: 'Prefix audit',
      text: 'Review my project instructions and repeated prompts. Move stable rules/examples to the top, put task-specific details at the end, and remove duplicate instructions. Do not edit files; give me a patch plan first.',
    },
    {
      id: 'dedup',
      title: 'Dedup instructions',
      text: 'Find repeated instructions in this conversation/project config that could be consolidated into one stable prefix. Return: keep, remove, move-to-end.',
    },
    {
      id: 'cache',
      title: 'Cache friendliness',
      text: 'Audit this prompt for cache friendliness. Identify anything dynamic near the top that should move later, and anything stable that should stay first.',
    },
  ]
  const rows = prompts.map((p) => {
    const key = `${signal.id}:prompt:${p.id}`
    const open = !!(state.optPromptOpen && state.optPromptOpen[key])
    const copied = state.optCopiedCmd === key
    return (
      `<div style="${bstyle({ borderTop: `1px solid ${BURN.border}` })}">` +
      `<div style="${bstyle({ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', padding: '7px 0' })}">` +
      `<button type="button" data-burn-opt-prompt-toggle="${burnEsc(key)}" style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, background: 'transparent', border: 'none', color: BURN.text, padding: 0, cursor: 'pointer', textAlign: 'left' })}">` +
      burnIcon(open ? 'chevron-up' : 'chevron-down', 11, BURN.text2) +
      `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10.5, fontWeight: 700, color: BURN.text, letterSpacing: 0.3, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}">${burnEsc(p.title)}</span>` +
      `</button>` +
      `<button type="button" data-burn-opt-copy-text="${burnEsc(key)}::${burnEsc(encodeURIComponent(p.text))}" style="${bstyle({ background: 'transparent', border: `1px solid ${BURN.accentBtnBorder}`, borderRadius: 2, color: BURN.limeText, fontFamily: BURN_FONT.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', padding: '4px 7px', cursor: 'pointer', whiteSpace: 'nowrap' })}">${copied ? 'Copied' : 'Copy'}</button>` +
      `</div>` +
      (open ? `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11.5, color: BURN.text2, lineHeight: 1.45, padding: '0 0 8px 19px' })}">${burnEsc(p.text)}</div>` : '') +
      `</div>`
    )
  }).join('')
  return burnSectionHead('PROMPTS', 'copy') + rows
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
      (() => {
        const copied = scan.copiedPrompt === (f.ignorePattern || f.detail || String(i))
        return (
      `<div style="${bstyle({ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '6px 0', borderTop: `1px solid ${BURN.border}`, alignItems: 'center' })}">` +
      `<div style="${bstyle({ minWidth: 0 })}">` +
      `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10.5, fontWeight: 700, color: BURN.text, letterSpacing: 0.3, textTransform: 'uppercase' })}">${burnEsc(f.action || 'Fix')}</div>` +
      `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11.5, color: BURN.text2, lineHeight: 1.35, overflowWrap: 'anywhere' })}">${burnEsc(f.detail || '')}</div>` +
      (f.ignorePattern ? `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9.5, color: BURN.text3, marginTop: 2, overflowWrap: 'anywhere' })}">Suggested manual rule: ${burnEsc(f.ignorePattern)}</div>` : '') +
      `</div>` +
      `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 7 })}">` +
      `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10, color: BURN.limeText, fontVariantNumeric: 'tabular-nums' })}">${Number(f.estimatedTokens) > 0 ? burnEsc(f.tokenLabel || '') : ''}</span>` +
      (f.promptText ? `<button type="button" data-burn-opt-copy-prompt="${burnEsc(`${s.provider}:${i}`)}" style="${bstyle({ background: 'transparent', border: `1px solid ${BURN.accentBtnBorder}`, borderRadius: 2, color: BURN.limeText, fontFamily: BURN_FONT.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', padding: '4px 7px', cursor: 'pointer' })}">${copied ? 'Copied' : 'Copy prompt'}</button>` : '') +
      (f.path ? `<button type="button" data-burn-opt-reveal="${burnEsc(`${s.provider}:${i}`)}" style="${bstyle({ background: 'transparent', border: `1px solid ${BURN.border}`, borderRadius: 2, color: BURN.text3, fontFamily: BURN_FONT.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', padding: '4px 7px', cursor: 'pointer' })}">Show</button>` : '') +
      `</div>` +
      `</div>`
        )
      })()
    )).join('')
    : `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11.5, color: BURN.text2, lineHeight: 1.45 })}">No obvious context bloat found.</div>`
  return (
    `<div style="${bstyle({ display: 'flex', flexDirection: 'column', gap: 7 })}">` +
    burnSectionHead('CLEANUP PROMPTS', scan.folderName || '') +
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
  const cachePrompts = optCachePromptRows(state, s)
  if (cachePrompts) blocks.push(cachePrompts)

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

function optTopFixRow(signal) {
  if (!signal) return ''
  const alert = signal.severity === 'alert'
  const accent = alert ? BURN.warn : BURN.lime
  const saving = Number(signal.saving) > 0
    ? `${signal.softSaving ? '≈' : ''}$${Math.round(signal.saving)}`
    : signal.metric
  return (
    `<button type="button" data-burn-opt-card="${burnEsc(signal.id)}" style="${bstyle({
      width: '100%',
      display: 'grid',
      gridTemplateColumns: 'auto minmax(0, 1fr) auto',
      gap: 9,
      alignItems: 'center',
      padding: '7px 14px',
      border: 'none',
      borderBottom: `1px solid ${BURN.border}`,
      background: BURN.surface,
      color: BURN.text,
      cursor: 'pointer',
      textAlign: 'left',
    })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9, fontWeight: 700, color: accent, letterSpacing: 0.6, textTransform: 'uppercase' })}">Top Fix</span>` +
    `<span style="${bstyle({ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10.5, fontWeight: 700, color: BURN.text, letterSpacing: 0.25, textTransform: 'uppercase' })}">${burnEsc(signal.title)}</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9, color: BURN.text3, marginLeft: 8 })}">${burnEsc(signal.providerName || '')}</span>` +
    `</span>` +
    `<span style="${bstyle({ display: 'inline-flex', alignItems: 'center', gap: 7 })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10.5, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums' })}">${burnEsc(saving)}</span>` +
    burnIcon('chevron-down', 11, BURN.text2) +
    `</span>` +
    `</button>`
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

// ----- screen ----------------------------------------------------------------
function burnRenderOptimize(state) {
  const model = state.optimizeModel || { signals: [], providers: [], counts: { total: 0, alerts: 0 }, recoverable: 0, scannedAt: Date.now() }
  const filter = state.optFilter || 'ALL'
  const visible = model.signals
    .filter((s) => !optIsHidden(state, s))
    .filter((s) => filter === 'ALL' || s.provider === filter || (Array.isArray(s.providers) && s.providers.includes(filter)))
    .sort((a, b) => b.saving - a.saving)

  const cardsHtml = visible.length
    ? visible.map((s) => optCard(state, s)).join('')
    : optHealthyState()
  const body = cardsHtml

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
    optTopFixRow(visible[0]) +
    optFilterRow(state, model) +
    `<div class="burn-body" style="${bstyle({ flex: 1, overflowY: 'auto' })}">${body}</div>` +
    burnFooter({ items: footer })
  )
}
