/* BURN Flow Mode — local checkpoint form. Saves a small resume prompt so users
   can restart after a limit reset without dragging the whole chat forward. */

function burnFlowField(label, key, value, placeholder, height) {
  return (
    `<div>` +
    burnSectionHead(label, value ? `${String(value).length} CHAR` : '') +
    `<textarea data-burn-flow-field="${burnEsc(key)}" placeholder="${burnEsc(placeholder)}" style="${bstyle({
      width: '100%',
      height,
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
      lineHeight: 1.45,
    })}">${burnEsc(value || '')}</textarea>` +
    `</div>`
  )
}

function burnFlowLatest(checkpoint) {
  if (!checkpoint) return ''
  return (
    `<div style="${bstyle({ border: `1px solid ${BURN.border}`, background: BURN.surface2, borderRadius: 2, padding: 10, display: 'flex', flexDirection: 'column', gap: 7 })}">` +
    `<div style="${bstyle({ display: 'flex', alignItems: 'baseline', gap: 8 })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10.5, fontWeight: 700, color: BURN.text, letterSpacing: 0.4, textTransform: 'uppercase' })}">${burnEsc(checkpoint.title || 'Saved flow')}</span>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 8.5, color: BURN.text3, letterSpacing: 0.4 })}">${burnEsc(checkpoint.providerName || '')}</span>` +
    `</div>` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11.5, color: BURN.text2, lineHeight: 1.45 })}">${burnEsc(checkpoint.nextStep || checkpoint.goal || 'Resume prompt ready.')}</div>` +
    `<div style="${bstyle({ display: 'flex', gap: 6 })}">` +
    `<button type="button" data-burn-action="flow-copy" data-flow-id="${burnEsc(checkpoint.id)}" style="${burnGhostBtn()}">Copy resume</button>` +
    (checkpoint.dir ? `<button type="button" data-burn-action="flow-open-folder" style="${burnGhostBtn()}">Open folder</button>` : '') +
    `</div>` +
    `</div>`
  )
}

function burnRenderFlow(state) {
  const form = state.flowForm || {}
  const rec = state.flowRecommendation || (state.optimizeModel && state.optimizeModel.flowMode) || {}
  const checkpoints = Array.isArray(state.flowCheckpoints) ? state.flowCheckpoints : []
  const latest = checkpoints[0] || null
  const meta = rec.recommended
    ? `${rec.providerName || 'MODEL'} · ${rec.freePct}% FREE`
    : 'LOCAL CHECKPOINT'
  const note = state.flowNote || (rec.summary || 'Save a tiny pickup prompt before limits hit.')
  const folder = form.dir ? String(form.dir).replace(/\/+$/, '').split('/').pop() : ''

  const folderSection =
    `<div>` +
    burnSectionHead('FOLDER', folder ? `~/${folder}` : 'NONE') +
    `<div style="${bstyle({ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' })}">` +
    `<button type="button" data-burn-action="flow-pick-folder" style="${bstyle({
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
    `</div></div>`

  const body =
    `<div class="burn-body" style="${bstyle({ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 })}">` +
    `<div style="${bstyle({ border: `1px solid ${rec.recommended ? BURN.accentBtnBorder : BURN.border}`, background: rec.recommended ? BURN.accentWashBg : BURN.surface2, borderRadius: 2, padding: 10 })}">` +
    `<div style="${bstyle({ display: 'flex', alignItems: 'baseline', gap: 8 })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 11, fontWeight: 700, color: rec.recommended ? BURN.limeText : BURN.text, letterSpacing: 0.5, textTransform: 'uppercase' })}">Flow Mode</span>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 8.5, color: BURN.text3, letterSpacing: 0.4, textTransform: 'uppercase' })}">${burnEsc(meta)}</span>` +
    `</div>` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12, color: BURN.text2, lineHeight: 1.45, marginTop: 7 })}">${burnEsc(note)}</div>` +
    `</div>` +
    (latest ? burnFlowLatest(latest) : '') +
    folderSection +
    burnFlowField('GOAL', 'goal', form.goal, 'What are you trying to finish?', 66) +
    burnFlowField('WHAT CHANGED', 'changed', form.changed, 'What did you already do?', 72) +
    burnFlowField('NEXT STEP', 'nextStep', form.nextStep, 'What should the next chat do first?', 66) +
    burnFlowField('NOTES', 'notes', form.notes, 'Blockers, constraints, files to avoid...', 58) +
    `</div>`

  const footer =
    `<div style="${bstyle({ display: 'flex', gap: 6, padding: 10, borderTop: `1px solid ${BURN.border}`, background: BURN.surface, alignItems: 'center' })}">` +
    `<button type="button" data-burn-nav="back" style="${burnGhostBtn()}">Back</button>` +
    `<span style="${bstyle({ flex: 1, fontFamily: BURN_FONT.mono, fontSize: 10, color: BURN.text2, paddingLeft: 6 })}">${burnEsc(state.flowSaveNote || '')}</span>` +
    `<button type="button" data-burn-action="flow-save" style="${burnPrimaryBtn()}">Save checkpoint →</button>` +
    `</div>`

  return burnHeader({ backLabel: 'FLOW MODE', optimizeActive: true }) + body + footer
}
