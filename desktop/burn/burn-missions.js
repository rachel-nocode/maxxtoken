/* BURN Missions — real burn ideas + context strip. Classic script.
   Ideas come from window.maxx.burnIdeas() via burn-app (burnState.ideas);
   the context strip uses the burn target, falling back to the recommender. */

// Context-strip recommender fallback: drop burning providers, prefer the
// lowest used%, tiebreak on most budget remaining. Null hides the strip.
function burnRecommend(providers) {
  const eligible = (providers || []).filter((p) => p.status === 'ok')
  if (!eligible.length) return null
  eligible.sort((a, b) => a.used - b.used || (b._raw?.leftValue || 0) - (a._raw?.leftValue || 0))
  const p = eligible[0]
  return { name: p.name, used: p.used, left: Math.round(p._raw?.leftValue || 0) }
}

function burnIdeaDifficulty(idea) {
  return Math.min(3, Math.max(1, Number(idea?.complexity) || 2))
}

function burnIdeaCard(idea, i) {
  const title = idea.title || 'Untitled idea'
  const body = idea.pitch || idea.summary || ''
  const quote = idea.whyNow || idea.signal || idea.rankReason || ''
  const difficulty = burnIdeaDifficulty(idea)
  const time = `~${Number(idea.buildMinutes) || 90}m`
  const stack = idea.stack || ''

  const row1 =
    `<div style="${bstyle({ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 12, color: BURN.lime, fontWeight: 700, letterSpacing: 0.4 })}">#${i + 1}</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 14, fontWeight: 700, color: BURN.text, letterSpacing: -0.2 })}">${burnEsc(title)}</span>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9, color: BURN.text2, letterSpacing: 0.5, textTransform: 'uppercase' })}">${burnEsc(time)}</span>` +
    `</div>`

  const bodyHtml = `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12, color: BURN.text2, lineHeight: 1.55, marginBottom: 9 })}">${burnEsc(body)}</div>`

  const quoteHtml = quote
    ? `<div style="${bstyle({
        fontFamily: BURN_FONT.mono,
        fontSize: 11,
        color: BURN.text2,
        fontStyle: 'italic',
        borderLeft: `2px solid ${BURN.lime}`,
        paddingLeft: 8,
        marginBottom: 10,
        lineHeight: 1.55,
      })}">${burnEsc(quote)}</div>`
    : ''

  let dots = ''
  for (let d = 1; d <= 3; d++) {
    dots += `<span style="${bstyle({ width: 6, height: 6, background: d <= difficulty ? BURN.lime : BURN.text4 })}"></span>`
  }

  const row4 =
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8 })}">` +
    `<div style="${bstyle({ display: 'flex', gap: 3 })}">${dots}</div>` +
    `<span style="${bstyle({
      fontFamily: BURN_FONT.mono,
      fontSize: 9.5,
      color: BURN.text2,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      flex: 1,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    })}">${burnEsc(stack)}</span>` +
    `<button type="button" data-burn-build="${i}" style="${bstyle({
      padding: '7px 12px',
      background: BURN.lime,
      color: BURN.bg,
      border: 'none',
      borderRadius: 2,
      fontFamily: BURN_FONT.mono,
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      flex: '0 0 auto',
    })}">Build →</button>` +
    `</div>`

  return (
    `<div style="${bstyle({ padding: '14px 14px 14px', borderBottom: `1px solid ${BURN.border}` })}">` +
    row1 + bodyHtml + quoteHtml + row4 +
    `</div>`
  )
}

// Freshness badge from the generation meta. live → "LIVE · {provider}" in lime;
// offline → "OFFLINE · IDEA BANK" in a muted/warn tone so it never reads as fresh.
function burnMissionsBadge(generation) {
  if (!generation) return ''
  const live = generation.mode === 'live'
  const label = live
    ? `LIVE · ${String(generation.providerName || generation.provider || 'AI').toUpperCase()}`
    : 'OFFLINE · IDEA BANK'
  const color = live ? BURN.lime : BURN.text2
  const dot = `<span style="${bstyle({ width: 6, height: 6, borderRadius: 6, background: color, flex: '0 0 auto' })}"></span>`
  return (
    `<div style="${bstyle({
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      padding: '7px 14px',
      borderBottom: `1px solid ${BURN.border}`,
      fontFamily: BURN_FONT.mono,
      fontSize: 9.5,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color,
    })}">${dot}${burnEsc(label)}</div>`
  )
}

function burnMissionsNote(text) {
  return `<div style="${bstyle({
    padding: '24px 14px',
    textAlign: 'center',
    fontFamily: BURN_FONT.mono,
    fontSize: 11,
    color: BURN.text2,
    letterSpacing: 0.4,
  })}">${burnEsc(text)}</div>`
}

// Segmented toggle: generate new app ideas vs burn down an existing repo.
function burnMissionModeToggle(mode) {
  const seg = (action, label, active) =>
    `<button type="button" data-burn-action="${action}" style="${bstyle({
      flex: 1,
      padding: '8px 0',
      background: active ? BURN.lime : 'transparent',
      color: active ? BURN.bg : BURN.text2,
      border: `1px solid ${active ? BURN.lime : BURN.border}`,
      fontFamily: BURN_FONT.mono,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      cursor: 'pointer',
    })}">${label}</button>`
  return (
    `<div style="${bstyle({ display: 'flex', gap: 6, padding: '10px 14px', borderBottom: `1px solid ${BURN.border}` })}">` +
    seg('mode-new', 'New build', mode !== 'backlog') +
    seg('mode-backlog', 'Backlog burn', mode === 'backlog') +
    `</div>`
  )
}

// New-build body: surplus strip + freshness badge + generated idea cards.
function burnNewBuildBody(state) {
  const t = state.ideaTarget
  const rec = t
    ? { name: t.name || 'your fullest model', used: t.usedPct, left: Math.round(Number(t.leftValue) || 0), reset: t.resetText }
    : burnRecommend(state.providers)
  const resetSuffix = rec && rec.reset ? ` · RESETS ${burnEsc(String(rec.reset).toUpperCase())}` : ''
  const strip = rec
    ? `<div style="${bstyle({
        padding: '10px 14px',
        borderBottom: `1px solid ${BURN.border}`,
        fontFamily: BURN_FONT.mono,
        fontSize: 11,
        color: BURN.lime,
        letterSpacing: 0.3,
        background: BURN.accentWashBg,
      })}">BURN ${burnEsc(String(rec.name).toUpperCase())}${rec.used == null ? '' : ` · ${rec.used}% USED`} · $${rec.left} LEFT${resetSuffix}</div>`
    : ''
  const badge = burnMissionsBadge(state.generation)
  let cards
  if (state.ideas && state.ideas.length) cards = state.ideas.map((idea, i) => burnIdeaCard(idea, i)).join('')
  else if (state.ideasLoading || !state.ideasLoaded) cards = burnMissionsNote('Finding burn ideas…')
  else cards = burnMissionsNote('No burn ideas found.')
  return strip + badge + cards
}

// Backlog card: a concrete repo mission (kind, why, target files, build).
function burnBacklogCard(mission, i) {
  const difficulty = Math.min(3, Math.max(1, Number(mission.complexity) || 2))
  const time = `~${Number(mission.buildMinutes) || 60}m`
  let dots = ''
  for (let d = 1; d <= 3; d++) dots += `<span style="${bstyle({ width: 6, height: 6, background: d <= difficulty ? BURN.lime : BURN.text4 })}"></span>`
  const targets = Array.isArray(mission.targets) && mission.targets.length
    ? `<div style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 10, color: BURN.text2, marginBottom: 9, lineHeight: 1.5 })}">${mission.targets.map((t) => '› ' + burnEsc(t)).join('<br>')}</div>`
    : ''
  return (
    `<div style="${bstyle({ padding: '14px', borderBottom: `1px solid ${BURN.border}` })}">` +
    `<div style="${bstyle({ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9, color: BURN.lime, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' })}">${burnEsc(mission.kind)}</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 14, fontWeight: 700, color: BURN.text, letterSpacing: -0.2 })}">${burnEsc(mission.title)}</span>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9, color: BURN.text2, letterSpacing: 0.5, textTransform: 'uppercase' })}">${burnEsc(time)}</span>` +
    `</div>` +
    `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12, color: BURN.text2, lineHeight: 1.55, marginBottom: 9 })}">${burnEsc(mission.why)}</div>` +
    targets +
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8 })}">` +
    `<div style="${bstyle({ display: 'flex', gap: 3 })}">${dots}</div>` +
    `<span style="${bstyle({ flex: 1, fontFamily: BURN_FONT.mono, fontSize: 9.5, color: BURN.text2, letterSpacing: 0.4, textTransform: 'uppercase' })}">${burnEsc(mission.stack || '')}</span>` +
    `<button type="button" data-burn-backlog="${i}" style="${bstyle({ padding: '7px 12px', background: BURN.lime, color: BURN.bg, border: 'none', borderRadius: 2, fontFamily: BURN_FONT.mono, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer', flex: '0 0 auto' })}">Build →</button>` +
    `</div>` +
    `</div>`
  )
}

// Backlog body: pick-a-repo prompt, or the scanned repo header + mission cards.
function burnBacklogBody(state) {
  if (state.backlogLoading) return burnMissionsNote('Scanning project…')
  const bl = state.backlog
  if (!bl) {
    return (
      burnMissionsNote('Point MaxxToken at a repo and it finds real fix / test / refactor / docs missions — burn idle quota on maintenance you already owe.') +
      `<div style="${bstyle({ display: 'flex', justifyContent: 'center', padding: '0 14px 20px' })}">` +
      `<button type="button" data-burn-action="pick-backlog" style="${bstyle({ padding: '9px 16px', background: BURN.lime, color: BURN.bg, border: 'none', borderRadius: 2, fontFamily: BURN_FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer' })}">Pick project →</button>` +
      `</div>`
    )
  }
  const counts = `${bl.stack || 'repo'}${bl.sourceCount != null ? ` · ${bl.sourceCount} src` : ''}${bl.testCount != null ? ` · ${bl.testCount} tests` : ''}`
  const header =
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${BURN.border}`, background: BURN.accentWashBg })}">` +
    `<span style="${bstyle({ flex: 1, fontFamily: BURN_FONT.mono, fontSize: 11, color: BURN.lime, letterSpacing: 0.3 })}">${burnEsc(String(bl.folderName || 'project').toUpperCase())} · ${burnEsc(counts)}</span>` +
    `<button type="button" data-burn-action="pick-backlog" style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9.5, color: BURN.text2, background: 'none', border: 'none', textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer' })}">Change</button>` +
    `</div>`
  const cards = bl.missions.length
    ? bl.missions.map((m, i) => burnBacklogCard(m, i)).join('')
    : burnMissionsNote('No backlog missions found — this repo is in good shape.')
  return header + cards
}

function burnRenderMissions(state) {
  const body = state.missionMode === 'backlog' ? burnBacklogBody(state) : burnNewBuildBody(state)
  return (
    burnHeader({ backLabel: 'MISSIONS', diamondActive: true }) +
    burnLiveStrip({ label: 'UNUSED TOKENS · BURN THEM ON IDEAS' }) +
    `<div class="burn-body" style="${bstyle({ flex: 1, overflowY: 'auto' })}">${burnMissionModeToggle(state.missionMode)}${body}</div>` +
    burnFooter({ items: state.footer, syncing: state.syncing })
  )
}
