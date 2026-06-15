/* BURN Token Coach — the in-popover Daily Verdict screen.
   Classic script: reuses the Burn design system (burnHeader, burnFooter,
   bstyle, BURN tokens) and renders verdict cards delivered over IPC
   (window.maxx.coachVerdicts). PRD section 5: every card is
   what happened → what it cost → what to do instead, evidence collapsed.

   Cards are designed to be screenshot-able — they are the marketing.

   Licensing (spec section 19): this screen is the ONLY gated surface.
   Locked (UNLICENSED/REVOKED) → 1 real verdict from the user's own data,
   the rest teased, plus locked weekly-report/forecast tiles. Unlocked
   (LICENSED/GRACE) → everything. The free tracker never sees any of this. */

// Spec section 19: lock state uses dimmed cards + #FF6B00 unlock buttons
// (brand orange, deliberately NOT the BURN lime).
const COACH_ORANGE = '#FF6B00'

function coachLicenseUnlocked(state) {
  const lic = state.license
  return !!(lic && lic.unlocked)
}

// Shown when the user has no real verdicts yet (spec: "show example card
// clearly labeled EXAMPLE"). Static, obviously-typical numbers.
const COACH_EXAMPLE_VERDICT = {
  id: 'example-card',
  rule: 'R1',
  severity: 'red',
  title: 'One chat ate a third of your day',
  what: 'A single 62-message thread re-sent its whole history with every new message.',
  cost: { text: '4.1M tokens · ≈ 31% of a daily limit' },
  fix: 'Start a fresh chat when you switch tasks.',
  evidence: { requestCount: 62, resentTokens: 4100000 },
}

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

function coachPreviewStrip() {
  return (
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: BURN.accentWashBg, borderBottom: `1px solid ${BURN.accentWashBorder}` })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9.5, fontWeight: 700, color: BURN.limeText, letterSpacing: 1.2 })}">PREVIEW DATA</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11, color: BURN.text2 })}">No usage logs found yet — these cards are samples.</span>` +
    `</div>`
  )
}

function coachUnlockBtn(label) {
  return (
    `<button type="button" data-burn-action="license-buy" style="${bstyle({
      padding: '9px 16px',
      background: COACH_ORANGE,
      color: '#000000',
      border: 'none',
      borderRadius: 2,
      fontFamily: BURN_FONT.mono,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      cursor: 'pointer',
    })}">${burnEsc(label || 'Support — $20 one-time')}</button>`
  )
}

// EXAMPLE ribbon wrapper — used when a locked user has no real verdicts yet.
function coachExampleCard(state) {
  const ribbon =
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9, fontWeight: 700, color: '#000', background: coachAmber(), padding: '2px 7px', letterSpacing: 1.2 })}">EXAMPLE</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11, color: BURN.text2 })}">What a verdict looks like — not your data.</span>` +
    `</div>`
  return ribbon + coachCard(state, COACH_EXAMPLE_VERDICT)
}

// Blurred skeleton rows standing in for the locked verdicts. Deliberately
// content-free — the tease is the COUNT, their own waste is the sales pitch.
function coachLockedStack(hiddenCount) {
  let rows = ''
  for (let i = 0; i < Math.min(hiddenCount, 3); i++) {
    rows +=
      `<div style="${bstyle({
        background: BURN.surface,
        border: `1px solid ${BURN.border}`,
        borderLeft: `3px solid ${BURN.text4}`,
        padding: '12px 14px',
        marginBottom: 6,
        filter: 'blur(3px)',
        opacity: 0.55,
        pointerEvents: 'none',
      })}">` +
      `<div style="${bstyle({ width: `${70 - i * 12}%`, height: 11, background: BURN.text4, marginBottom: 8 })}"></div>` +
      `<div style="${bstyle({ width: '92%', height: 8, background: BURN.text4, opacity: 0.7, marginBottom: 5 })}"></div>` +
      `<div style="${bstyle({ width: '55%', height: 8, background: BURN.text4, opacity: 0.7 })}"></div>` +
      `</div>`
  }
  const noun = hiddenCount === 1 ? 'more verdict' : 'more verdicts'
  return (
    `<div style="${bstyle({ position: 'relative', marginBottom: 10 })}">` +
    rows +
    `<div style="${bstyle({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '10px 0 4px' })}">` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 13, fontWeight: 700, color: BURN.text })}">${hiddenCount} ${noun} found today</div>` +
    coachUnlockBtn() +
    `</div>` +
    `</div>`
  )
}

// Locked tiles for the other two paid features (spec section 19.2): one-line
// description + unlock. Dimmed cards, no fake content.
function coachLockedTile(title, line) {
  return (
    `<div style="${bstyle({
      background: BURN.surface,
      border: `1px solid ${BURN.border}`,
      padding: '11px 14px',
      marginBottom: 6,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      opacity: 0.85,
    })}">` +
    `<div style="${bstyle({ flex: 1, minWidth: 0 })}">` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10, fontWeight: 700, color: BURN.text2, letterSpacing: 1 })}">${burnEsc(title)} <span style="${bstyle({ color: BURN.text3 })}">· LOCKED</span></div>` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11.5, color: BURN.text2, marginTop: 3, lineHeight: 1.45 })}">${burnEsc(line)}</div>` +
    `</div>` +
    `<button type="button" data-burn-action="license-buy" style="${bstyle({
      padding: '6px 10px',
      background: 'transparent',
      color: COACH_ORANGE,
      border: `1px solid ${COACH_ORANGE}`,
      borderRadius: 2,
      fontFamily: BURN_FONT.mono,
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 0.8,
      cursor: 'pointer',
      flexShrink: 0,
    })}">UNLOCK</button>` +
    `</div>`
  )
}

function coachRevokedNote() {
  return (
    `<div style="${bstyle({
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '9px 12px',
      marginBottom: 10,
      background: BURN.warnRowBg,
      border: `1px solid ${BURN.warn}`,
    })}">` +
    `<span style="${bstyle({ flex: 1, fontFamily: BURN_FONT.sans, fontSize: 12, color: BURN.text, lineHeight: 1.45 })}">License no longer valid.</span>` +
    `<button type="button" data-burn-action="license-settings" style="${bstyle({
      padding: '6px 10px',
      background: 'transparent',
      color: BURN.text,
      border: `1px solid ${BURN.borderHi}`,
      borderRadius: 2,
      fontFamily: BURN_FONT.mono,
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 0.8,
      cursor: 'pointer',
      flexShrink: 0,
    })}">RE-ENTER KEY</button>` +
    `</div>`
  )
}

// Locked Coach (spec section 19.1): 1 REAL verdict from their own data, the
// rest teased below the fold, then the weekly-report + forecast tiles.
// Never a modal, never touches the tracker.
function coachLockedBody(state, model) {
  const revoked = state.license && state.license.status === 'REVOKED' ? coachRevokedNote() : ''
  // Preview fixtures are sample data, not the user's — locked users get the
  // clearly-labeled EXAMPLE card instead (spec: "If no verdicts exist").
  const real = model && model.ok !== false && !model.preview && Array.isArray(model.verdicts) ? model.verdicts : []

  let cards
  if (real.length) {
    cards = coachCard(state, real[0])
    const hidden = real.length - 1
    if (hidden > 0) cards += coachLockedStack(hidden)
    else {
      cards +=
        `<div style="${bstyle({ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' })}">` +
        coachUnlockBtn() +
        `</div>`
    }
  } else {
    cards =
      coachExampleCard(state) +
      `<div style="${bstyle({ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' })}">` +
      coachUnlockBtn() +
      `</div>`
  }

  const tiles =
    `<div style="${bstyle({ marginTop: 14 })}">` +
    coachLockedTile('WEEKLY REPORT', 'Your week in tokens — top 3 verdicts, one trend, one win.') +
    coachLockedTile('LIMIT FORECAST', 'At this pace you hit the wall at 3pm. Know before it happens.') +
    `</div>` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9.5, color: BURN.text3, textAlign: 'center', letterSpacing: 0.6, padding: '12px 0 2px' })}">PAY ONCE. RUNS LOCAL. YOUR DATA NEVER LEAVES YOUR MACHINE.</div>`

  return revoked + cards + tiles
}

function burnRenderCoach(state) {
  const model = state.coachModel
  const unlocked = coachLicenseUnlocked(state)
  let body
  if (state.coachLoading) {
    body = `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 11.5, color: BURN.text3, textAlign: 'center', padding: '46px 0', letterSpacing: 1 })}">READING YOUR USAGE…</div>`
  } else if (!unlocked) {
    body = coachLockedBody(state, model)
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
    { l: 'COACH', v: unlocked ? 'PRO' : 'LOCKED', tone: unlocked ? 'lime' : 'text' },
  ]

  const strip = unlocked && model && model.preview ? coachPreviewStrip() : ''

  return (
    burnHeader({ backLabel: 'TOKEN COACH' }) +
    strip +
    `<div class="burn-body" style="${bstyle({ flex: 1, overflowY: 'auto', padding: '12px 16px' })}">${body}</div>` +
    burnFooter({ items: footer })
  )
}
