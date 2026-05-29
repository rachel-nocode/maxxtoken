/* BURN Home — provider list. Collapsed rows (expanded panel = step 3).
   Classic script. burnRenderHome returns the screen's inner HTML; the shell
   (burn-app.js) wraps it in the viewport-filling window. */

function burnProviderRow(p, expanded) {
  const burning = p.status === 'warn'
  const rowBg = burning ? BURN.warnRowBg : BURN.surface2

  const topRow =
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 })}">` +
    burnProvGlyph(p.id, 14, BURN.text) +
    `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontWeight: 700, fontSize: 13, letterSpacing: -0.1 })}">${burnEsc(p.name)}</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9.5, color: BURN.text2, letterSpacing: 0.5, textTransform: 'uppercase' })}">${burnEsc(p.plan)}</span>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    burnSparkline({ data: p.spark, color: burning ? BURN.warn : BURN.lime, width: 56, height: 14 }) +
    `<span style="${bstyle({
      fontFamily: BURN_FONT.mono,
      fontSize: 15,
      fontWeight: 700,
      color: burning ? BURN.warnText : BURN.text,
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: -0.3,
      minWidth: 36,
      textAlign: 'right',
    })}">${p.used}%</span>` +
    `<button type="button" data-burn-chevron="${burnEsc(p.id)}" aria-label="Toggle detail" style="${bstyle({
      width: 22,
      height: 22,
      borderRadius: 2,
      background: BURN.surface,
      border: `1px solid ${BURN.border}`,
      cursor: 'pointer',
      padding: 0,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: BURN.text2,
    })}"><span class="burn-chev-down">${burnIcon('chevron-down', 11, BURN.text2)}</span><span class="burn-chev-up">${burnIcon('chevron-up', 11, BURN.text2)}</span></button>` +
    `</div>`

  const caption =
    `<div style="${bstyle({
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 6,
      fontFamily: BURN_FONT.mono,
      fontSize: 9,
      color: BURN.text2,
      letterSpacing: 0.4,
      fontVariantNumeric: 'tabular-nums',
    })}">` +
    `<span>5H ${p.s5h}% · 7D ${p.w7d}%</span>` +
    `<span>RESET ${burnEsc(p.reset.toUpperCase())}</span>` +
    `</div>`

  const collapsed =
    `<div data-burn-row="${burnEsc(p.id)}" style="${bstyle({ padding: '11px 14px', cursor: 'pointer' })}">` +
    topRow +
    burnSegBar({ pct: p.used, burning }) +
    caption +
    `</div>`

  // Detail panel is always in the DOM; the .open class drives the 120ms
  // max-height transition (expand and collapse both animate).
  const detail = `<div class="burn-detail">${burnProviderExpanded(p)}</div>`

  return (
    `<div class="burn-prov${expanded ? ' open' : ''}" data-burn-prov="${burnEsc(p.id)}" style="${bstyle({ borderBottom: `1px solid ${BURN.border}`, background: rowBg })}">` +
    collapsed +
    detail +
    `</div>`
  )
}

// Window bar block (SESSION · 5H / WEEKLY · 7D).
function burnWindowBar(label, pct, reset, burning) {
  const head =
    `<div style="${bstyle({ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9.5, color: BURN.text2, letterSpacing: 0.7 })}">${burnEsc(label)}</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 14, fontWeight: 700, color: burning ? BURN.warnText : BURN.text, fontVariantNumeric: 'tabular-nums' })}">` +
    `${pct}<span style="${bstyle({ fontSize: 9, color: BURN.text2 })}">%</span></span>` +
    `</div>`
  const caption =
    `<div style="${bstyle({ marginTop: 5, fontFamily: BURN_FONT.mono, fontSize: 9, color: BURN.text2, letterSpacing: 0.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums' })}">` +
    `RESETS IN ${burnEsc(reset.toUpperCase())}</div>`
  return `<div>${head}${burnSegBar({ pct, burning })}${caption}</div>`
}

function burnCostRow(label, tok, usd) {
  return (
    `<div style="${bstyle({
      display: 'grid',
      gridTemplateColumns: '1fr auto auto',
      gap: 10,
      fontFamily: BURN_FONT.mono,
      fontSize: 11.5,
      fontVariantNumeric: 'tabular-nums',
      padding: '5px 0',
    })}">` +
    `<span style="${bstyle({ color: BURN.text2 })}">${burnEsc(label)}</span>` +
    `<span style="${bstyle({ color: BURN.text })}">${burnFormatTokensM(tok)} tokens</span>` +
    `<span style="${bstyle({ color: usd > 0 ? BURN.limeText : BURN.text2 })}">${usd > 0 ? '$' + usd.toFixed(2) : '—'}</span>` +
    `</div>`
  )
}

function burnModelRow(m, burning) {
  const top =
    `<div style="${bstyle({ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, fontFamily: BURN_FONT.mono, fontSize: 11, fontVariantNumeric: 'tabular-nums' })}">` +
    `<span style="${bstyle({ color: BURN.text, fontWeight: 600 })}">${burnEsc(m.name)}</span>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<span style="${bstyle({ color: BURN.text2 })}">${burnFormatTokensM(m.tok)} tok</span>` +
    `<span style="${bstyle({ color: m.usd > 0 ? BURN.limeText : BURN.text2, minWidth: 56, textAlign: 'right' })}">${m.usd > 0 ? '$' + m.usd.toFixed(2) : 'incl.'}</span>` +
    `<span style="${bstyle({ color: burning ? BURN.warnText : BURN.text, minWidth: 32, textAlign: 'right', fontWeight: 600 })}">${m.burn}%</span>` +
    `</div>`
  return `<div>${top}${burnSegBar({ pct: m.burn, burning, cells: 20, height: 3 })}</div>`
}

// In-place detail panel below a collapsed row.
function burnProviderExpanded(p) {
  const burning = p.status === 'warn'
  const x = burnAdaptExpanded(p._raw || {})

  const windows =
    burnWindowBar('SESSION · 5H', p.s5h, p.sessionReset || p.reset, burning) +
    burnWindowBar('WEEKLY · 7D', p.w7d, p.weeklyReset || p.reset, burning)

  const cost =
    burnSectionHead('COST', x.costMeta) +
    `<div style="${bstyle({ display: 'flex', flexDirection: 'column', gap: 6 })}">` +
    burnCostRow('Today', x.tokens.today.tok, x.tokens.today.usd) +
    burnCostRow('Yesterday', x.tokens.yest.tok, x.tokens.yest.usd) +
    burnCostRow('Last 30d', x.tokens.last30.tok, x.tokens.last30.usd) +
    `</div>`

  const tokens =
    burnSectionHead('TOKENS', `${x.inOut.events.toLocaleString()} EVENTS`) +
    `<div style="${bstyle({ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 })}">` +
    burnStat('IN', burnFormatTokensM(x.inOut.in)) +
    burnStat('CACHED', burnFormatTokensM(x.inOut.cached)) +
    burnStat('OUT', burnFormatTokensM(x.inOut.out)) +
    `</div>`

  const modelsBody = x.models.length
    ? x.models.map((m) => burnModelRow(m, burning)).join('')
    : `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10, color: BURN.text2, letterSpacing: 0.4 })}">NO MODEL DATA</div>`
  const models =
    burnSectionHead('MODEL BURN', `${x.models.length} ACTIVE`) +
    `<div style="${bstyle({ display: 'flex', flexDirection: 'column', gap: 8 })}">${modelsBody}</div>`

  return (
    `<div style="${bstyle({
      padding: '4px 14px 14px',
      borderTop: `1px dashed ${BURN.border}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    })}">${windows}${cost}${tokens}${models}</div>`
  )
}

// Order home rows to mirror the Settings list: live drag order (settingsOrder)
// → saved providerOrder → snapshot order. A reorder in Settings shows on Home
// immediately (even before Save). Explicit index keeps the sort stable so
// unranked providers hold their snapshot order.
function burnHomeOrder(state) {
  const order = []
  const seen = new Set()
  for (const id of state.settingsOrder || []) if (!seen.has(id)) { seen.add(id); order.push(id) }
  for (const id of state.config?.providerOrder || []) if (!seen.has(id)) { seen.add(id); order.push(id) }
  const rank = new Map(order.map((id, i) => [id, i]))
  return (state.providers || [])
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const ra = rank.has(a.p.id) ? rank.get(a.p.id) : Infinity
      const rb = rank.has(b.p.id) ? rank.get(b.p.id) : Infinity
      return ra === rb ? a.i - b.i : ra - rb
    })
    .map((x) => x.p)
}

function burnRenderHome(state) {
  const providers = burnHomeOrder(state)
  const burning = providers.filter((p) => p.status === 'warn').length
  const rows = providers
    .map((p) => burnProviderRow(p, state.expandedId === p.id))
    .join('')

  return (
    burnHeader({ title: 'BURN' }) +
    burnLiveStrip({ streams: providers.length, burning }) +
    `<div class="burn-body" style="${bstyle({ flex: 1, overflowY: 'auto' })}">${rows}</div>` +
    burnFooter({ items: state.footer, syncing: state.syncing })
  )
}
