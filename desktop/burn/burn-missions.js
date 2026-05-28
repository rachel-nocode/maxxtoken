/* BURN Missions — idea list + context strip. Classic script.
   Idea fixtures from DATA.md (real burn-ideas wiring is a follow-up); the
   context strip + footer are driven by live adapted providers. */

const BURN_MISSIONS = [
  {
    n: '#1',
    title: 'Changelog Séance',
    body: 'Point it at a repo and it narrates the project history as a dramatic story you can replay.',
    quote: 'AI-built repos move fast and lose their why; narrated history rebuilds context.',
    difficulty: 3,
    time: '~120m',
    stack: 'Node git parser + model call + Vite',
    rec: 'claude',
  },
  {
    n: '#2',
    title: 'Ambient Status Orb',
    body: 'A tiny always-on desktop orb that glows with the one number that matters today.',
    quote: 'Builders drown in dashboards; one ambient signal beats constant checking.',
    difficulty: 3,
    time: '~130m',
    stack: 'Electron transparent window + JSON socket',
    rec: 'cursor',
  },
  {
    n: '#3',
    title: 'Prompt Fossil Record',
    body: 'It quietly archives every prompt you send and surfaces the ones that actually worked.',
    quote: 'Prompts are real IP now and everyone throws them away.',
    difficulty: 3,
    time: '~120m',
    stack: 'Local SQLite + Raycast extension',
    rec: 'claude',
  },
  {
    n: '#4',
    title: 'Token Diet Coach',
    body: 'Rewrites your latest prompts to be 40% shorter while preserving intent.',
    quote: 'Cheapest token is the one you never sent.',
    difficulty: 2,
    time: '~80m',
    stack: 'Single model call + clipboard hook',
    rec: 'kimi',
  },
]

// Context-strip recommender (DATA.md §): drop burning providers, prefer the
// lowest used%, tiebreak on most budget remaining. Null hides the strip.
function burnRecommend(providers) {
  const eligible = (providers || []).filter((p) => p.status === 'ok')
  if (!eligible.length) return null
  eligible.sort((a, b) => a.used - b.used || (b._raw?.leftValue || 0) - (a._raw?.leftValue || 0))
  const p = eligible[0]
  return { name: p.name, used: p.used, left: Math.round(p._raw?.leftValue || 0) }
}

function burnIdeaCard(m) {
  const row1 =
    `<div style="${bstyle({ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 12, color: BURN.lime, fontWeight: 700, letterSpacing: 0.4 })}">${burnEsc(m.n)}</span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 14, fontWeight: 700, color: BURN.text, letterSpacing: -0.2 })}">${burnEsc(m.title)}</span>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 9, color: BURN.text2, letterSpacing: 0.5, textTransform: 'uppercase' })}">${burnEsc(m.time)}</span>` +
    `</div>`

  const body = `<div style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12, color: BURN.text2, lineHeight: 1.55, marginBottom: 9 })}">${burnEsc(m.body)}</div>`

  const quote =
    `<div style="${bstyle({
      fontFamily: BURN_FONT.mono,
      fontSize: 11,
      color: BURN.text2,
      fontStyle: 'italic',
      borderLeft: `2px solid ${BURN.lime}`,
      paddingLeft: 8,
      marginBottom: 10,
      lineHeight: 1.55,
    })}">${burnEsc(m.quote)}</div>`

  let dots = ''
  for (let i = 1; i <= 3; i++) {
    dots += `<span style="${bstyle({ width: 6, height: 6, background: i <= m.difficulty ? BURN.lime : BURN.text4 })}"></span>`
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
    })}">${burnEsc(m.stack)}</span>` +
    `<button type="button" data-burn-build="${burnEsc(m.n)}" style="${bstyle({
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
    row1 + body + quote + row4 +
    `</div>`
  )
}

function burnRenderMissions(state) {
  const rec = burnRecommend(state.providers)
  const strip = rec
    ? `<div style="${bstyle({
        padding: '10px 14px',
        borderBottom: `1px solid ${BURN.border}`,
        fontFamily: BURN_FONT.mono,
        fontSize: 11,
        color: BURN.lime,
        letterSpacing: 0.3,
        background: 'rgba(182,255,60,0.04)',
      })}">USE ${burnEsc(rec.name.toUpperCase())} · ${rec.used}% USED · $${rec.left} LEFT TO BURN</div>`
    : ''

  const cards = BURN_MISSIONS.map(burnIdeaCard).join('')

  const tail =
    `<div style="${bstyle({
      padding: '14px 14px 18px',
      textAlign: 'center',
      fontFamily: BURN_FONT.mono,
      fontSize: 10,
      color: BURN.text2,
      letterSpacing: 0.5,
    })}">MORE IDEAS REFRESH EVERY 12H · OR <span style="${bstyle({ color: BURN.lime, textDecoration: 'underline' })}">SUBMIT ONE</span></div>`

  return (
    burnHeader({ backLabel: 'MISSIONS', diamondActive: true }) +
    burnLiveStrip({ label: 'UNUSED TOKENS · BURN THEM ON IDEAS' }) +
    `<div class="burn-body" style="${bstyle({ flex: 1, overflowY: 'auto' })}">${strip}${cards}${tail}</div>` +
    burnFooter({ items: state.footer })
  )
}
