/* BURN Token Coach — the in-popover Daily Verdict screen (beta).
   Classic script: reuses the Burn design system (burnHeader, burnFooter,
   bstyle, BURN tokens) and renders verdict cards delivered over IPC
   (window.maxx.coachVerdicts). PRD section 5: every card is
   what happened → what it cost → what to do instead, evidence collapsed.

   Cards are designed to be screenshot-able — they are the marketing. */

// Amber for yellow severity (BURN has lime/warn only); theme-aware like optLimeDim.
function coachAmber() {
  return burnState && burnState.app && burnState.app.lightMode ? '#B07A10' : '#FFB13C'
}

function coachSeverityColor(severity) {
  if (severity === 'red') return BURN.warn
  if (severity === 'yellow') return coachAmber()
  return BURN.lime
}

function coachSeverityLabel(severity) {
  if (severity === 'red') return 'HEAVY WASTE'
  if (severity === 'yellow') return 'WASTE'
  return 'GOOD HABIT'
}

// Evidence keys worth showing a human, in display order.
const COACH_EVIDENCE_LABELS = {
  agentType: 'agent',
  sessionId: 'session',
  requestCount: 'messages',
  peakContextTokens: 'peak re-sent',
  resentTokens: 're-sent total',
  weightedResentTokens: 'weighted waste',
  flaggedTurns: 'flagged asks',
  evaluableTurns: 'asks checked',
  observedReasoningWaste: 'observed overhead',
  assumedWaste: 'estimated overhead',
  assumedOverkillShare: 'estimate share',
  sessionsEvaluated: 'sessions checked',
  missSessions: 'sessions affected',
  averageHitRatio: 'avg cache hits',
  targetHitRatio: 'target cache hits',
  collisionCount: 'times hit the wall',
  spikeWindowMinutes: 'burst window (min)',
  samplesSeen: 'samples',
  pctOfLimit: '% of limit',
  windowKind: 'limit window',
}

function coachFmtEvidence(key, value) {
  if (value == null) return null
  if (key === 'averageHitRatio' || key === 'targetHitRatio') return `${Math.round(value * 100)}%`
  if (key === 'assumedOverkillShare') return `${Math.round(value * 100)}% of turn`
  if (key === 'pctOfLimit') return `${value}%`
  if (typeof value === 'number' && value >= 10_000) return burnFormatTokensM(burnToM(value))
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  return null
}

function coachEvidenceRows(verdict) {
  const rows = []
  for (const key of Object.keys(COACH_EVIDENCE_LABELS)) {
    const formatted = coachFmtEvidence(key, verdict.evidence ? verdict.evidence[key] : null)
    if (formatted == null) continue
    rows.push(
      `<div style="${bstyle({ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0' })}">` +
        `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10.5, color: BURN.text3, letterSpacing: 0.6, textTransform: 'uppercase' })}">${burnEsc(COACH_EVIDENCE_LABELS[key])}</span>` +
        `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 11, color: BURN.text2 })}">${burnEsc(formatted)}</span>` +
        `</div>`,
    )
  }
  return rows.join('')
}

function coachCard(state, verdict) {
  const color = coachSeverityColor(verdict.severity)
  const open = !!(state.coachOpen && state.coachOpen[verdict.id])
  const costText = verdict.cost && verdict.cost.text ? verdict.cost.text : ''

  const head =
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8 })}">` +
    `<span style="${bstyle({ width: 9, height: 9, background: color, flexShrink: 0 })}"></span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10, fontWeight: 700, color, letterSpacing: 1 })}">${coachSeverityLabel(verdict.severity)}</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10, color: BURN.text3, marginLeft: 'auto' })}">${burnEsc(verdict.rule || '')}</span>` +
    `</div>`

  const title = `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 14.5, fontWeight: 700, color: BURN.text, lineHeight: 1.3 })}">${burnEsc(verdict.title)}</div>`
  const what = `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12.5, color: BURN.text2, lineHeight: 1.55 })}">${burnEsc(verdict.what)}</div>`

  const cost =
    `<div style="${bstyle({ borderTop: `1px solid ${BURN.border}`, borderBottom: `1px solid ${BURN.border}`, padding: '7px 0', display: 'flex', gap: 8, alignItems: 'baseline' })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10, color: BURN.text3, letterSpacing: 0.8 })}">COST</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 12, fontWeight: 700, color })}">${burnEsc(costText)}</span>` +
    `</div>`

  const fix =
    `<div style="${bstyle({ display: 'flex', gap: 8, alignItems: 'baseline' })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10, color: BURN.limeText, letterSpacing: 0.8 })}">FIX →</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12.5, fontWeight: 600, color: BURN.text, lineHeight: 1.45 })}">${burnEsc(verdict.fix)}</span>` +
    `</div>`

  const evidence =
    `<button type="button" data-coach-toggle="${burnEsc(verdict.id)}" style="${bstyle({
      background: 'none',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      fontFamily: BURN_FONT.mono,
      fontSize: 10,
      color: BURN.text3,
      letterSpacing: 0.8,
      textAlign: 'left',
    })}">EVIDENCE ${open ? '▾' : '▸'}</button>` +
    (open
      ? `<div style="${bstyle({ background: BURN.surface2, border: `1px solid ${BURN.border}`, padding: '6px 10px' })}">${coachEvidenceRows(verdict)}</div>`
      : '')

  return (
    `<div style="${bstyle({
      background: BURN.surface,
      border: `1px solid ${BURN.border}`,
      borderLeft: `3px solid ${color}`,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 9,
      marginBottom: 10,
    })}">` +
    head +
    title +
    what +
    cost +
    fix +
    evidence +
    `</div>`
  )
}

function coachEmptyState(message) {
  return (
    `<div style="${bstyle({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '46px 24px', textAlign: 'center' })}">` +
    `<div style="${bstyle({ width: 46, height: 46, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: BURN.accentBtnBg, border: `1px solid ${BURN.accentBtnBorder}`, borderRadius: 3 })}">${burnIcon('check', 20, BURN.lime)}</div>` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 13, fontWeight: 700, color: BURN.text, letterSpacing: 1 })}">NO VERDICTS TODAY</div>` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12.5, color: BURN.text2, lineHeight: 1.55, maxWidth: 280 })}">${burnEsc(message || 'No token waste worth flagging. Keep doing what you are doing.')}</div>` +
    `</div>`
  )
}

function coachBetaStrip(model) {
  const label = model && model.preview ? 'FREE BETA · PREVIEW DATA' : 'FREE BETA'
  return (
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: BURN.accentWashBg, borderBottom: `1px solid ${BURN.accentWashBorder}` })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9.5, fontWeight: 700, color: BURN.limeText, letterSpacing: 1.2 })}">${label}</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11, color: BURN.text2 })}">Daily Verdict — where your tokens went, in plain English.</span>` +
    `</div>`
  )
}

function burnRenderCoach(state) {
  const model = state.coachModel
  let body
  if (state.coachLoading) {
    body = `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 11.5, color: BURN.text3, textAlign: 'center', padding: '46px 0', letterSpacing: 1 })}">READING YOUR USAGE…</div>`
  } else if (!model || model.ok === false) {
    body = coachEmptyState(model && model.error ? model.error : 'Could not read usage data.')
  } else if (!model.verdicts.length) {
    body = coachEmptyState()
  } else {
    body = model.verdicts.map((v) => coachCard(state, v)).join('')
  }

  const reds = model && model.verdicts ? model.verdicts.filter((v) => v.severity === 'red').length : 0
  const footer = [
    { l: 'CARDS', v: String(model && model.verdicts ? model.verdicts.length : 0), tone: reds ? 'warn' : 'lime' },
    { l: 'COACH', v: 'BETA', tone: 'text' },
  ]

  return (
    burnHeader({ backLabel: 'TOKEN COACH' }) +
    coachBetaStrip(model) +
    `<div class="burn-body" style="${bstyle({ flex: 1, overflowY: 'auto', padding: '12px 16px' })}">${body}</div>` +
    burnFooter({ items: footer })
  )
}
