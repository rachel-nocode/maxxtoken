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
      background: checked ? 'rgba(182,255,60,0.06)' : BURN.surface2,
      border: `1px solid ${checked ? 'rgba(182,255,60,0.30)' : BURN.borderHi}`,
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

const burnGhostBtn = bstyle({
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

const burnPrimaryBtn = bstyle({
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

function burnModelOptions(state) {
  return (state.providers || []).map((p) => ({
    id: p.id,
    name: p.name,
    plan: p.plan,
    used: p.used,
    action: p._raw?.connected !== false ? 'auto-start' : 'copy',
  }))
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
    folderSection + modelsSection + goalSection +
    `</div>`

  const footer =
    `<div style="${bstyle({ display: 'flex', gap: 6, padding: 10, borderTop: `1px solid ${BURN.border}`, background: BURN.surface })}">` +
    `<button type="button" data-burn-nav="back" style="${burnGhostBtn}">BACK</button>` +
    `<button type="button" data-burn-action="copy-goal" style="${burnGhostBtn}">COPY GOAL</button>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<button type="button" data-burn-action="start-mission" style="${burnPrimaryBtn}">Start mission →</button>` +
    `</div>`

  return burnHeader({ backLabel: 'NEW MISSION' }) + body + footer
}
