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

function burnRenderMissions(state) {
  // Context strip: prefer the real burn target, else the recommender.
  const t = state.ideaTarget
  const rec = t
    ? { name: t.name || 'your fullest model', used: t.usedPct, left: Math.round(Number(t.leftValue) || 0) }
    : burnRecommend(state.providers)
  const strip = rec
    ? `<div style="${bstyle({
        padding: '10px 14px',
        borderBottom: `1px solid ${BURN.border}`,
        fontFamily: BURN_FONT.mono,
        fontSize: 11,
        color: BURN.lime,
        letterSpacing: 0.3,
        background: BURN.accentWashBg,
      })}">USE ${burnEsc(String(rec.name).toUpperCase())}${rec.used == null ? '' : ` · ${rec.used}% USED`} · $${rec.left} LEFT TO BURN</div>`
    : ''

  let cards
  if (state.ideas && state.ideas.length) {
    cards = state.ideas.map((idea, i) => burnIdeaCard(idea, i)).join('')
  } else if (state.ideasLoading || !state.ideasLoaded) {
    cards = burnMissionsNote('Finding burn ideas…')
  } else {
    cards = burnMissionsNote('No burn ideas found.')
  }

  return (
    burnHeader({ backLabel: 'MISSIONS', diamondActive: true }) +
    burnLiveStrip({ label: 'UNUSED TOKENS · BURN THEM ON IDEAS' }) +
    `<div class="burn-body" style="${bstyle({ flex: 1, overflowY: 'auto' })}">${strip}${cards}</div>` +
    burnFooter({ items: state.footer, syncing: state.syncing })
  )
}
