/* BURN Mission Setup — folder / models / goal form. Classic script.
   Models list is derived from live adapted providers. Folder pick, copy, and
   start delegate to existing window.maxx IPC. */

function burnModelCheck(m, checked) {
  const box =
    `<span style="${bstyle({
      width: 14,
      height: 14,
      flex: '0 0 auto',
      background: checked ? BURN.lime : 'transparent',
      border: `1px solid ${checked ? BURN.lime : BURN.borderHi}`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    })}">${checked ? burnCheckTick(BURN.bg) : ''}</span>`

  return (
    `<button type="button" data-burn-model="${burnEsc(m.id)}" style="${bstyle({
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '9px 10px',
      width: '100%',
      textAlign: 'left',
      background: checked ? BURN.accentWashBg : BURN.surface2,
      border: `1px solid ${checked ? BURN.accentBtnBorder : BURN.borderHi}`,
      borderRadius: 2,
      cursor: 'pointer',
    })}">` +
    box +
    burnProvGlyph(m.id, 13, BURN.text) +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 12, fontWeight: 700, color: BURN.text, letterSpacing: 0.3 })}">${burnEsc(m.name.toUpperCase())}</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9.5, color: BURN.text2, letterSpacing: 0.4, textTransform: 'uppercase' })}">${burnEsc(m.plan)} · ${m.used}%</span>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9.5, letterSpacing: 0.5, textTransform: 'uppercase', color: m.action === 'auto-start' ? BURN.lime : BURN.text2 })}">${m.action === 'auto-start' ? 'AUTO-START' : 'COPY PROMPT'}</span>` +
    `</button>`
  )
}

// Functions, not const strings: read BURN live at render time so the colors
// follow the active theme. (As precomputed consts they froze the dark palette
// at load and the buttons stayed bright lime after a light-mode toggle.)
function burnGhostBtn() {
  return bstyle({
    padding: '8px 12px',
    background: 'transparent',
    color: BURN.text2,
    border: `1px solid ${BURN.border}`,
    borderRadius: 2,
    fontFamily: BURN_FONT.mono,
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    cursor: 'pointer',
  })
}

function burnPrimaryBtn() {
  return bstyle({
    padding: '9px 16px',
    background: BURN.lime,
    color: BURN.bg,
    border: 'none',
    borderRadius: 2,
    fontFamily: BURN_FONT.mono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    cursor: 'pointer',
  })
}

function burnModelOptions(state) {
  return (state.providers || []).map((p) => ({
    id: p.id,
    name: p.name,
    plan: p.plan,
    used: p.used,
    action: p._raw?.connected !== false ? 'auto-start' : 'copy',
  }))
}

function burnPreflightPanel(state) {
  const pf = state.missionPreflight
  const loading = state.missionPreflightLoading
  let tone = BURN.text2
  let title = loading ? 'Estimating…' : 'Preflight estimate'
  let body = 'Pick a folder, model, and goal to estimate token burn before launch.'
  let meta = 'SAVE MODE'

  if (pf && pf.ok) {
    const risky = pf.window && Number(pf.window.reserveAfterPct) < 40
    tone = risky ? BURN.warnText : BURN.limeText
    title = `${pf.estimate.lowLabel}-${pf.estimate.highLabel} tokens`
    body = pf.summary
    meta = pf.window
      ? `${pf.providerName || 'MODEL'} · ${pf.window.freePct}% FREE · RESETS ${String(pf.window.resetLabel || '').toUpperCase()}`
      : `${pf.providerName || 'MODEL'} · ESTIMATE`
  } else if (pf && pf.missing) {
    meta = `NEEDS ${pf.missing.join(' + ').toUpperCase()}`
  } else if (pf && pf.error) {
    tone = BURN.warnText
    body = pf.error
    meta = 'CHECK FAILED'
  }

  const reasons = pf && pf.ok && Array.isArray(pf.reasons)
    ? pf.reasons.slice(0, 2).map((r) => (
      `<div style="${bstyle({ display: 'flex', gap: 7, alignItems: 'baseline', fontFamily: BURN_FONT.sans, fontSize: 11.5, color: BURN.text2, lineHeight: 1.4 })}">` +
      `<span style="${bstyle({ width: 3, height: 3, background: r.kind === 'short-window' ? BURN.warn : BURN.lime, flex: '0 0 auto' })}"></span>` +
      `<span>${burnEsc(r.text)}</span>` +
      `</div>`
    )).join('')
    : ''

  return (
    `<div style="${bstyle({ border: `1px solid ${BURN.borderHi}`, background: BURN.surface2, borderRadius: 2 })}">` +
    `<div style="${bstyle({ display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 10px', borderBottom: `1px solid ${BURN.border}` })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 11, fontWeight: 700, color: tone, letterSpacing: 0.4, textTransform: 'uppercase' })}">${burnEsc(title)}</span>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 8.5, color: BURN.text3, letterSpacing: 0.5, textTransform: 'uppercase' })}">${burnEsc(meta)}</span>` +
    `</div>` +
    `<div style="${bstyle({ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 7 })}">` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12, color: BURN.text2, lineHeight: 1.45 })}">${burnEsc(body)}</div>` +
    reasons +
    `</div>` +
    `</div>`
  )
}

function burnRenderMissionSetup(state) {
  const selected = state.missionModels || {}
  const models = burnModelOptions(state)
  const selectedCount = models.filter((m) => selected[m.id]).length
  const folder = state.missionFolder
  const goal = state.missionGoal || ''

  const folderSection =
    `<div>` +
    burnSectionHead('FOLDER', folder ? `~/${folder}` : 'NONE') +
    `<div style="${bstyle({ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' })}">` +
    `<button type="button" data-burn-action="pick-folder" style="${bstyle({
      padding: '8px 12px',
      background: BURN.surface2,
      border: `1px solid ${folder ? BURN.lime : BURN.borderHi}`,
      borderRadius: 2,
      color: folder ? BURN.lime : BURN.text,
      fontFamily: BURN_FONT.mono,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: 0.4,
      cursor: 'pointer',
      textTransform: 'uppercase',
    })}">${folder ? burnEsc('~/' + folder) : 'Pick folder'}</button>` +
    (folder
      ? `<span data-burn-action="pick-folder" style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10, color: BURN.text2, cursor: 'pointer' })}">CHANGE</span>`
      : '') +
    `</div></div>`

  const modelsSection =
    `<div>` +
    burnSectionHead('MODELS', `${selectedCount} SELECTED`) +
    `<div style="${bstyle({ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 })}">` +
    models.map((m) => burnModelCheck(m, !!selected[m.id])).join('') +
    `</div></div>`

  const goalSection =
    `<div>` +
    `<div style="${bstyle({ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${BURN.border}`, paddingBottom: 4, fontFamily: BURN_FONT.mono, fontSize: 9.5, letterSpacing: 0.7 })}">` +
    `<span style="${bstyle({ color: BURN.lime, fontWeight: 600 })}">GOAL</span>` +
    `<span id="burn-goal-meta" style="${bstyle({ color: BURN.text2 })}">${goal.length ? goal.length + ' CHAR' : 'OPTIONAL'}</span>` +
    `</div>` +
    `<textarea data-burn-goal placeholder="Ship the smallest useful version of..." style="${bstyle({
      width: '100%',
      height: 78,
      marginTop: 8,
      padding: 10,
      background: BURN.bg,
      border: `1px solid ${BURN.border}`,
      borderRadius: 2,
      color: BURN.text,
      fontFamily: BURN_FONT.mono,
      fontSize: 11.5,
      resize: 'vertical',
      outline: 'none',
      boxSizing: 'border-box',
    })}">${burnEsc(goal)}</textarea>` +
    `</div>`

  const body =
    `<div class="burn-body" style="${bstyle({ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 })}">` +
    folderSection + modelsSection + goalSection + burnPreflightPanel(state) +
    `</div>`

  const footer =
    `<div style="${bstyle({ display: 'flex', gap: 6, padding: 10, borderTop: `1px solid ${BURN.border}`, background: BURN.surface })}">` +
    `<button type="button" data-burn-nav="back" style="${burnGhostBtn()}">BACK</button>` +
    `<button type="button" data-burn-action="copy-goal" style="${burnGhostBtn()}">COPY GOAL</button>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<button type="button" data-burn-action="start-mission" style="${burnPrimaryBtn()}">Start mission →</button>` +
    `</div>`

  return burnHeader({ backLabel: 'NEW MISSION' }) + body + footer
}
