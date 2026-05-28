// BURN design system — full screens.
// Shared tokens, primitives, then home/missions/settings, then the interactive shell.

const BURN = {
  bg:        '#000000',
  surface:   '#0B0B0B',
  surface2:  '#131313',
  border:    '#1A1A1A',
  borderHi:  '#252525',
  text:      '#F5F5F5',
  text2:     '#9A9A9A',
  text3:     '#5A5A5A',
  text4:     '#2E2E2E',
  lime:      '#B6FF3C',
  limeDim:   '#88BE2E',
  warn:      '#FF6B5C',
  warnDim:   '#9A3E36',
  radius:    6,
};

// ============================================================
// PRIMITIVES
// ============================================================
function BurnSegBar({ pct, burning, cells = 28, height = 5, gap = 2 }) {
  const lit = Math.round((pct / 100) * cells);
  return (
    <div style={{ display: 'flex', gap, width: '100%' }}>
      {[...Array(cells)].map((_, i) => (
        <span key={i} style={{
          flex: 1, height,
          background: i < lit ? (burning ? BURN.warn : BURN.lime) : BURN.text4,
        }} />
      ))}
    </div>
  );
}

function BurnSparkline({ data, color, width = 60, height = 14, strokeWidth = 1.2 }) {
  const max = Math.max(...data, 1);
  const step = width / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => `${i * step},${height - (v / max) * height}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

function BurnHeader({ title = 'BURN', onDiamond, onSettings, diamondActive, settingsActive, onBack, backLabel }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 14px',
      borderBottom: `1px solid ${BURN.border}`,
    }}>
      {onBack ? (
        <>
          <button onClick={onBack} style={{
            ...burnBtn(false), borderRadius: 2,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '0 8px', width: 'auto', color: BURN.lime, fontSize: 12, fontWeight: 600,
          }}>
            <Icon name="chevron-right" size={11} color={BURN.lime} />
            <span style={{ transform: 'rotate(180deg) translateY(1px)', display: 'inline-block' }}></span>
            BACK
          </button>
          <span style={{ fontFamily: mono, fontSize: 10, color: BURN.text3, letterSpacing: 0.8, textTransform: 'uppercase' }}>
            · {backLabel}
          </span>
        </>
      ) : (
        <>
          <div style={{
            width: 22, height: 22, borderRadius: 3,
            background: BURN.surface, border: `1px solid ${BURN.border}`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="11" height="11" viewBox="0 0 14 14"><polygon points="7,1.4 8.2,5.4 12.2,7 8.2,8.6 7,12.6 5.8,8.6 1.8,7 5.8,5.4" fill={BURN.lime} /></svg>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2 }}>
            Maxx<span style={{ color: BURN.lime }}>Token</span>
          </span>
          <span style={{
            fontFamily: mono, fontSize: 9, color: BURN.text3,
            letterSpacing: 0.8, padding: '3px 7px',
            background: BURN.surface, border: `1px solid ${BURN.border}`,
            borderRadius: 2,
          }}>{title}</span>
        </>
      )}
      <span style={{ flex: 1 }} />
      <button onClick={onDiamond} style={burnBtn(diamondActive)}>
        <svg width="11" height="11" viewBox="0 0 14 14"><polygon points="7,1.5 12.5,7 7,12.5 1.5,7" fill={BURN.lime} /></svg>
      </button>
      <button onClick={onSettings} style={burnBtn(settingsActive)}>
        <Icon name="settings" size={13} color={settingsActive ? BURN.lime : BURN.text2} />
      </button>
    </div>
  );
}
function burnBtn(active) {
  return {
    width: 26, height: 26, borderRadius: 2,
    background: active ? 'rgba(182,255,60,0.10)' : BURN.surface,
    border: `1px solid ${active ? 'rgba(182,255,60,0.40)' : BURN.border}`,
    cursor: 'pointer', padding: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    color: BURN.text2,
  };
}

function BurnLiveStrip({ streams, burning, label }) {
  return (
    <div style={{
      padding: '8px 14px',
      display: 'flex', alignItems: 'center', gap: 8,
      fontFamily: mono, fontSize: 9.5, color: BURN.text2, letterSpacing: 0.6,
      borderBottom: `1px solid ${BURN.border}`,
      background: BURN.surface,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 6,
        background: BURN.lime,
        boxShadow: `0 0 6px ${BURN.lime}`,
      }} />
      <span>{label || `LIVE · ${streams} STREAMS`}</span>
      <span style={{ flex: 1 }} />
      {burning > 0 && <span style={{ color: BURN.warn }}>{burning} BURNING</span>}
    </div>
  );
}

function BurnFooter({ items }) {
  const defaults = [
    { l: 'SPENT', v: '$181', color: BURN.lime },
    { l: 'LEFT',  v: '$421', color: BURN.warn },
    { l: 'SYNC',  v: '15m',  color: BURN.text },
  ];
  const xs = items || defaults;
  return (
    <div style={{
      display: 'flex', gap: 6, padding: 8,
      borderTop: `1px solid ${BURN.border}`,
      background: BURN.surface,
    }}>
      {xs.map(it => (
        <div key={it.l} style={{
          flex: 1,
          background: BURN.bg,
          border: `1px solid ${BURN.border}`,
          borderRadius: 2,
          padding: '6px 8px',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <span style={{ fontFamily: mono, fontSize: 8.5, color: BURN.text3, letterSpacing: 0.6 }}>{it.l}</span>
          <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: it.color, fontVariantNumeric: 'tabular-nums' }}>{it.v}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// HOME — expandable provider rows
// ============================================================
const BURN_PROVIDERS = [
  {
    id: 'chatgpt', name: 'ChatGPT', plan: 'Pro 20×', used: 23, s5h: 4, w7d: 23,
    status: 'ok', reset: '01h 11m',
    spark: [12,15,18,20,21,22,23,23,23],
    tokens: { today: { tok: 87, usd: 83.40 }, yest: { tok: 234, usd: 239.35 }, last30: { tok: 5486, usd: 4889.28 } },
    inOut: { in: 2834, cached: 2644, out: 7.7, events: 22557 },
    models: [
      { name: 'gpt-5', burn: 78, tok: 4280, usd: 3812.10, color: BURN.lime },
      { name: 'gpt-5-mini', burn: 18, tok: 980, usd: 870.40, color: BURN.lime },
      { name: 'o4-mini', burn: 4, tok: 226, usd: 206.78, color: BURN.lime },
    ],
  },
  {
    id: 'claude', name: 'Claude', plan: 'Max 20×', used: 8, s5h: 0, w7d: 8,
    status: 'ok', reset: '02h 57m',
    spark: [2,4,5,6,7,7,8,8,8],
    tokens: { today: { tok: 12, usd: 18.40 }, yest: { tok: 34, usd: 41.20 }, last30: { tok: 1280, usd: 1542.00 } },
    inOut: { in: 920, cached: 740, out: 2.1, events: 4180 },
    models: [
      { name: 'sonnet-4.5', burn: 64, tok: 820, usd: 988.20, color: BURN.lime },
      { name: 'opus-4.1', burn: 30, tok: 380, usd: 460.10, color: BURN.lime },
      { name: 'haiku-4', burn: 6, tok: 80, usd: 94.10, color: BURN.lime },
    ],
  },
  {
    id: 'cursor', name: 'Cursor', plan: 'Pro+', used: 17, s5h: 17, w7d: 22,
    status: 'ok', reset: '11d 02h',
    spark: [6,9,11,13,14,15,16,17,17],
    tokens: { today: { tok: 42, usd: 0 }, yest: { tok: 88, usd: 0 }, last30: { tok: 2140, usd: 0 } },
    inOut: { in: 1402, cached: 1180, out: 3.4, events: 8902 },
    models: [
      { name: 'gpt-5', burn: 52, tok: 1112, usd: 0, color: BURN.lime },
      { name: 'sonnet-4.5', burn: 41, tok: 880, usd: 0, color: BURN.lime },
      { name: 'auto', burn: 7, tok: 148, usd: 0, color: BURN.lime },
    ],
  },
  {
    id: 'kimi', name: 'Kimi', plan: 'Basic', used: 1, s5h: 0, w7d: 1,
    status: 'idle', reset: '4d 11h',
    spark: [0,0,1,1,1,1,1,1,1],
    tokens: { today: { tok: 0, usd: 0 }, yest: { tok: 2, usd: 0 }, last30: { tok: 18, usd: 0 } },
    inOut: { in: 14, cached: 8, out: 0.4, events: 22 },
    models: [
      { name: 'k2', burn: 100, tok: 18, usd: 0, color: BURN.lime },
    ],
  },
  {
    id: 'grok', name: 'Grok', plan: 'Build', used: 31, s5h: 31, w7d: 31,
    status: 'warn', reset: '01h 09m',
    spark: [8,14,19,22,25,27,29,30,31],
    tokens: { today: { tok: 1.7, usd: 1.75 }, yest: { tok: 0, usd: 0 }, last30: { tok: 1.7, usd: 1.75 } },
    inOut: { in: 1.4, cached: 0.2, out: 0.1, events: 318 },
    models: [
      { name: 'grok-build', burn: 100, tok: 1.7, usd: 1.75, color: BURN.warn },
    ],
  },
];

function BurnHome({ expandedId, onToggle, onDiamond, onSettings }) {
  const burning = BURN_PROVIDERS.filter(p => p.status === 'warn').length;
  return (
    <div style={burnWindowStyle()}>
      <BurnHeader title="BURN" onDiamond={onDiamond} onSettings={onSettings} />
      <BurnLiveStrip streams={BURN_PROVIDERS.length} burning={burning} />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {BURN_PROVIDERS.map(p => (
          <BurnProviderRow key={p.id} p={p} expanded={expandedId === p.id} onToggle={() => onToggle(p.id)} />
        ))}
      </div>
      <BurnFooter />
    </div>
  );
}

function BurnProviderRow({ p, expanded, onToggle }) {
  const burning = p.status === 'warn';
  return (
    <div style={{
      borderBottom: `1px solid ${BURN.border}`,
      background: burning ? 'rgba(255,107,92,0.05)' : 'transparent',
    }}>
      {/* Collapsed header — always visible */}
      <div onClick={onToggle} style={{
        padding: '11px 14px',
        cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <ProvGlyph id={p.id} size={14} color={BURN.text} />
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: -0.1 }}>{p.name}</span>
          <span style={{ fontFamily: mono, fontSize: 9.5, color: BURN.text3, letterSpacing: 0.5, textTransform: 'uppercase' }}>{p.plan}</span>
          <span style={{ flex: 1 }} />
          <BurnSparkline data={p.spark} color={burning ? BURN.warn : BURN.lime} width={56} height={14} />
          <span style={{
            fontFamily: mono, fontSize: 15, fontWeight: 700,
            color: burning ? BURN.warn : BURN.text,
            fontVariantNumeric: 'tabular-nums', letterSpacing: -0.3,
            minWidth: 36, textAlign: 'right',
          }}>{p.used}%</span>
          <button onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{
            ...burnBtn(false), width: 22, height: 22,
          }}>
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={11} color={BURN.text2} />
          </button>
        </div>
        <BurnSegBar pct={p.used} burning={burning} />
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 6,
          fontFamily: mono, fontSize: 9, color: BURN.text3, letterSpacing: 0.4,
        }}>
          <span>5H {p.s5h}% · 7D {p.w7d}%</span>
          <span>RESET {p.reset.toUpperCase()}</span>
        </div>
      </div>

      {expanded && <BurnProviderExpanded p={p} />}
    </div>
  );
}

function BurnProviderExpanded({ p }) {
  const burning = p.status === 'warn';
  return (
    <div style={{
      padding: '4px 14px 14px',
      borderTop: `1px dashed ${BURN.border}`,
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      {/* Window bars — session + weekly */}
      <BurnWindowBar label="SESSION · 5H" pct={p.s5h} reset={p.reset} burning={burning} cells={28} />
      <BurnWindowBar label="WEEKLY · 7D" pct={p.w7d} reset={p.reset} burning={burning} cells={28} />

      {/* COST grid */}
      <BurnSectionHead label="COST" right={p.id === 'cursor' ? 'plan included' : 'estimated'} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <BurnCostRow label="Today"      tok={p.tokens.today.tok}  usd={p.tokens.today.usd}  />
        <BurnCostRow label="Yesterday"  tok={p.tokens.yest.tok}   usd={p.tokens.yest.usd}   />
        <BurnCostRow label="Last 30d"   tok={p.tokens.last30.tok} usd={p.tokens.last30.usd} />
      </div>

      {/* Tokens in / cached / out */}
      <BurnSectionHead label="TOKENS" right={`${p.inOut.events.toLocaleString()} EVENTS`} />
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        gap: 6,
      }}>
        <BurnStat label="IN"     value={`${p.inOut.in}M`} />
        <BurnStat label="CACHED" value={`${p.inOut.cached}M`} />
        <BurnStat label="OUT"    value={`${p.inOut.out}M`} />
      </div>

      {/* Per-model burn */}
      <BurnSectionHead label="MODEL BURN" right={`${p.models.length} ACTIVE`} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {p.models.map(m => (
          <BurnModelRow key={m.name} m={m} burning={burning} />
        ))}
      </div>
    </div>
  );
}

function BurnWindowBar({ label, pct, reset, burning, cells }) {
  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 6,
      }}>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: BURN.text2, letterSpacing: 0.7 }}>{label}</span>
        <span style={{
          fontFamily: mono, fontSize: 14, fontWeight: 700,
          color: burning ? BURN.warn : BURN.text,
          fontVariantNumeric: 'tabular-nums',
        }}>{pct}<span style={{ fontSize: 9, color: BURN.text3 }}>%</span></span>
      </div>
      <BurnSegBar pct={pct} burning={burning} cells={cells} />
      <div style={{
        marginTop: 5,
        fontFamily: mono, fontSize: 9, color: BURN.text3, letterSpacing: 0.5,
        textAlign: 'right',
      }}>RESETS IN {reset.toUpperCase()}</div>
    </div>
  );
}

function BurnSectionHead({ label, right }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      borderBottom: `1px solid ${BURN.border}`, paddingBottom: 4,
      fontFamily: mono, fontSize: 9.5, letterSpacing: 0.7,
    }}>
      <span style={{ color: BURN.lime, fontWeight: 600 }}>{label}</span>
      <span style={{ color: BURN.text3 }}>{right}</span>
    </div>
  );
}

function BurnCostRow({ label, tok, usd }) {
  const tokStr = typeof tok === 'number'
    ? (tok >= 1000 ? `${(tok/1000).toFixed(1)}B` : tok >= 1 ? `${tok}M` : `${(tok*1000).toFixed(0)}K`)
    : tok;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10,
      fontFamily: mono, fontSize: 11.5,
      fontVariantNumeric: 'tabular-nums',
      padding: '5px 0',
    }}>
      <span style={{ color: BURN.text2 }}>{label}</span>
      <span style={{ color: BURN.text }}>{tokStr} tokens</span>
      <span style={{ color: usd > 0 ? BURN.lime : BURN.text3 }}>
        {usd > 0 ? `$${usd.toFixed(2)}` : '—'}
      </span>
    </div>
  );
}

function BurnStat({ label, value }) {
  return (
    <div style={{
      background: BURN.bg,
      border: `1px solid ${BURN.border}`,
      borderRadius: 2,
      padding: '7px 9px',
    }}>
      <div style={{ fontFamily: mono, fontSize: 8.5, color: BURN.text3, letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: BURN.text, fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>
        {value}
      </div>
    </div>
  );
}

function BurnModelRow({ m, burning }) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4,
        fontFamily: mono, fontSize: 11, fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{ color: BURN.text, fontWeight: 600 }}>{m.name}</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: BURN.text2 }}>
          {typeof m.tok === 'number'
            ? (m.tok >= 1000 ? `${(m.tok/1000).toFixed(1)}B` : `${m.tok}M`)
            : m.tok} tok
        </span>
        <span style={{ color: m.usd > 0 ? BURN.lime : BURN.text3, minWidth: 56, textAlign: 'right' }}>
          {m.usd > 0 ? `$${m.usd.toFixed(2)}` : 'incl.'}
        </span>
        <span style={{ color: burning ? BURN.warn : BURN.text, minWidth: 32, textAlign: 'right', fontWeight: 600 }}>
          {m.burn}%
        </span>
      </div>
      <BurnSegBar pct={m.burn} burning={burning} cells={20} height={3} gap={2} />
    </div>
  );
}

// ============================================================
// MISSIONS — list + setup
// ============================================================
const BURN_MISSIONS = [
  {
    n: '#1', title: 'Changelog Séance',
    body: 'Point it at a repo and it narrates the project history as a dramatic story you can replay.',
    quote: 'AI-built repos move fast and lose their why; narrated history rebuilds context.',
    difficulty: 3, time: '~120m',
    stack: 'Node git parser + model call + Vite',
    rec: 'claude',
  },
  {
    n: '#2', title: 'Ambient Status Orb',
    body: 'A tiny always-on desktop orb that glows with the one number that matters today.',
    quote: 'Builders drown in dashboards; one ambient signal beats constant checking.',
    difficulty: 3, time: '~130m',
    stack: 'Electron transparent window + JSON socket',
    rec: 'cursor',
  },
  {
    n: '#3', title: 'Prompt Fossil Record',
    body: 'It quietly archives every prompt you send and surfaces the ones that actually worked.',
    quote: 'Prompts are real IP now and everyone throws them away.',
    difficulty: 3, time: '~120m',
    stack: 'Local SQLite + Raycast extension',
    rec: 'claude',
  },
  {
    n: '#4', title: 'Token Diet Coach',
    body: 'Rewrites your latest prompts to be 40% shorter while preserving intent.',
    quote: 'Cheapest token is the one you never sent.',
    difficulty: 2, time: '~80m',
    stack: 'Single model call + clipboard hook',
    rec: 'kimi',
  },
];

function BurnMissions({ onBack, onOpen }) {
  return (
    <div style={burnWindowStyle()}>
      <BurnHeader onBack={onBack} backLabel="MISSIONS" />
      <BurnLiveStrip label="UNUSED TOKENS · BURN THEM ON IDEAS" streams={0} burning={0} />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Mission context strip */}
        <div style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${BURN.border}`,
          fontFamily: mono, fontSize: 11, color: BURN.lime, letterSpacing: 0.3,
          background: 'rgba(182,255,60,0.04)',
        }}>
          USE CLAUDE · 8% USED · $184 LEFT TO BURN
        </div>

        {BURN_MISSIONS.map(m => (
          <BurnIdeaCard key={m.n} m={m} onOpen={() => onOpen(m.n)} />
        ))}

        {/* Add-your-own footer ad */}
        <div style={{
          padding: '14px 14px 18px', textAlign: 'center',
          fontFamily: mono, fontSize: 10, color: BURN.text3, letterSpacing: 0.5,
        }}>
          MORE IDEAS REFRESH EVERY 12H · OR <span style={{ color: BURN.lime, textDecoration: 'underline' }}>SUBMIT ONE</span>
        </div>
      </div>
      <BurnFooter />
    </div>
  );
}

function BurnIdeaCard({ m, onOpen }) {
  return (
    <div style={{
      padding: '14px 14px 14px',
      borderBottom: `1px solid ${BURN.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 12, color: BURN.lime, fontWeight: 700, letterSpacing: 0.4 }}>{m.n}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: BURN.text, letterSpacing: -0.2 }}>{m.title}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: mono, fontSize: 9, color: BURN.text3, letterSpacing: 0.5 }}>{m.time.toUpperCase()}</span>
      </div>
      <div style={{ fontSize: 12, color: BURN.text2, lineHeight: 1.55, marginBottom: 9 }}>{m.body}</div>
      <div style={{
        fontFamily: mono, fontSize: 11, color: BURN.text3, fontStyle: 'italic',
        borderLeft: `2px solid ${BURN.lime}`, paddingLeft: 8,
        marginBottom: 10, lineHeight: 1.55,
      }}>
        {m.quote}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* difficulty dots */}
        <div style={{ display: 'flex', gap: 3 }}>
          {[1,2,3].map(i => (
            <span key={i} style={{
              width: 6, height: 6,
              background: i <= m.difficulty ? BURN.lime : BURN.text4,
            }} />
          ))}
        </div>
        <span style={{
          fontFamily: mono, fontSize: 9.5, color: BURN.text3, letterSpacing: 0.4,
          textTransform: 'uppercase', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {m.stack}
        </span>
        <button onClick={onOpen} style={{
          padding: '7px 12px',
          background: BURN.lime, color: BURN.bg,
          border: 'none', borderRadius: 2,
          fontFamily: mono, fontSize: 10.5, fontWeight: 700,
          letterSpacing: 0.5, textTransform: 'uppercase',
          cursor: 'pointer',
        }}>
          Start build →
        </button>
      </div>
    </div>
  );
}

function BurnMissionSetup({ onBack }) {
  const [models, setModels] = React.useState({ kimi: true, claude: true, cursor: true, chatgpt: false, grok: false });
  const [folder, setFolder] = React.useState(null);
  const [goal, setGoal] = React.useState('');

  const modelList = [
    { id: 'kimi',    name: 'Kimi',    plan: 'Basic',   used: 1,  action: 'copy prompt' },
    { id: 'claude',  name: 'Claude',  plan: 'Max 20×', used: 8,  action: 'auto-start' },
    { id: 'cursor',  name: 'Cursor',  plan: 'Pro+',    used: 17, action: 'copy prompt' },
    { id: 'chatgpt', name: 'ChatGPT', plan: 'Pro 20×', used: 23, action: 'auto-start' },
    { id: 'grok',    name: 'Grok',    plan: 'Build',   used: 31, action: 'copy prompt', burning: true },
  ];

  return (
    <div style={burnWindowStyle()}>
      <BurnHeader onBack={onBack} backLabel="NEW MISSION" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* FOLDER */}
        <div>
          <BurnSectionHead label="FOLDER" right={folder ? '~/repos/' + folder : 'NONE'} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => setFolder('maxxtoken')} style={{
              padding: '8px 12px', background: BURN.surface,
              border: `1px solid ${folder ? BURN.lime : BURN.border}`, borderRadius: 2,
              color: folder ? BURN.lime : BURN.text,
              fontFamily: mono, fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
              cursor: 'pointer', textTransform: 'uppercase',
            }}>
              {folder ? `~/${folder}` : 'Pick folder'}
            </button>
            {folder && (
              <span style={{ fontFamily: mono, fontSize: 10, color: BURN.text3, alignSelf: 'center' }}>
                CHANGE
              </span>
            )}
          </div>
        </div>

        {/* MODELS */}
        <div>
          <BurnSectionHead label="MODELS" right={`${Object.values(models).filter(Boolean).length} SELECTED`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {modelList.map(m => (
              <BurnModelCheck
                key={m.id}
                m={m}
                checked={!!models[m.id]}
                onChange={() => setModels(s => ({ ...s, [m.id]: !s[m.id] }))}
              />
            ))}
          </div>
        </div>

        {/* GOAL */}
        <div>
          <BurnSectionHead label="GOAL" right={goal ? `${goal.length} CHAR` : 'OPTIONAL'} />
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Ship the smallest useful version of..."
            style={{
              width: '100%', height: 78,
              marginTop: 8, padding: 10,
              background: BURN.bg, border: `1px solid ${BURN.border}`, borderRadius: 2,
              color: BURN.text, fontFamily: mono, fontSize: 11.5,
              resize: 'vertical', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Footer actions */}
      <div style={{
        display: 'flex', gap: 6, padding: 10,
        borderTop: `1px solid ${BURN.border}`,
        background: BURN.surface,
      }}>
        <button onClick={onBack} style={burnTextBtn}>BACK</button>
        <button style={burnTextBtn}>COPY GOAL</button>
        <span style={{ flex: 1 }} />
        <button style={{
          padding: '9px 16px', background: BURN.lime, color: BURN.bg,
          border: 'none', borderRadius: 2,
          fontFamily: mono, fontSize: 11, fontWeight: 700,
          letterSpacing: 0.6, textTransform: 'uppercase', cursor: 'pointer',
        }}>
          Start mission →
        </button>
      </div>
    </div>
  );
}
const burnTextBtn = {
  padding: '8px 12px', background: 'transparent', color: BURN.text2,
  border: `1px solid ${BURN.border}`, borderRadius: 2,
  fontFamily: mono, fontSize: 10.5, fontWeight: 600,
  letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer',
};

function BurnModelCheck({ m, checked, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 10px',
      background: checked ? 'rgba(182,255,60,0.06)' : BURN.surface,
      border: `1px solid ${checked ? 'rgba(182,255,60,0.30)' : BURN.border}`,
      borderRadius: 2, cursor: 'pointer',
    }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ display: 'none' }} />
      <span style={{
        width: 14, height: 14, flex: '0 0 auto',
        background: checked ? BURN.lime : 'transparent',
        border: `1px solid ${checked ? BURN.lime : BURN.borderHi}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={BURN.bg} strokeWidth="2">
            <polyline points="1.5,5 4,7.5 8.5,2.5" />
          </svg>
        )}
      </span>
      <ProvGlyph id={m.id} size={13} color={BURN.text} />
      <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: BURN.text, letterSpacing: 0.3 }}>
        {m.name.toUpperCase()}
      </span>
      <span style={{ fontFamily: mono, fontSize: 9.5, color: BURN.text3, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        {m.plan} · {m.used}%
      </span>
      <span style={{ flex: 1 }} />
      <span style={{
        fontFamily: mono, fontSize: 9.5, letterSpacing: 0.5, textTransform: 'uppercase',
        color: m.action === 'auto-start' ? BURN.lime : BURN.text3,
      }}>{m.action}</span>
    </label>
  );
}

// ============================================================
// SETTINGS
// ============================================================
function BurnSettings({ onBack }) {
  const [providers, setProviders] = React.useState({
    chatgpt: true, claude: true, cursor: true, kimi: true, grok: true, openai: false,
  });
  const [notifsOpen, setNotifsOpen] = React.useState(true);
  const [appOpen, setAppOpen] = React.useState(false);
  const [notifs, setNotifs] = React.useState({
    ideas: true, alerts: true, restored: true, quota: true,
  });
  const [lightMode, setLightMode] = React.useState(false);
  const [openAtLogin, setOpenAtLogin] = React.useState(true);

  const provList = [
    { id: 'chatgpt', name: 'ChatGPT',   sub: 'Pro 20× · detected' },
    { id: 'claude',  name: 'Claude',    sub: 'Max 20× · detected' },
    { id: 'cursor',  name: 'Cursor',    sub: 'Pro+ · detected',    cookie: true },
    { id: 'kimi',    name: 'Kimi',      sub: 'Basic · detected' },
    { id: 'grok',    name: 'Grok',      sub: 'Build · detected',   cookie: true },
    { id: 'openai',  name: 'OpenAI API',sub: 'Admin API · add API key' },
  ];

  return (
    <div style={burnWindowStyle()}>
      <BurnHeader onBack={onBack} backLabel="DETECTED PROVIDERS" />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* hint banner */}
        <div style={{
          margin: 14, padding: '9px 11px',
          background: 'rgba(182,255,60,0.05)',
          border: `1px solid rgba(182,255,60,0.20)`,
          borderRadius: 2,
          fontFamily: mono, fontSize: 10.5, color: BURN.text2, letterSpacing: 0.3, lineHeight: 1.55,
        }}>
          PLAN VALUES STAY AUTOMATIC. USE THE CONFIG FILE ONLY FOR OVERRIDES.
        </div>

        {/* provider rows */}
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {provList.map(pv => (
            <BurnProvSettingRow
              key={pv.id}
              pv={pv}
              enabled={providers[pv.id]}
              onToggle={() => setProviders(s => ({ ...s, [pv.id]: !s[pv.id] }))}
            />
          ))}
        </div>

        {/* collapsible: notifications */}
        <div style={{ padding: '14px 14px 0' }}>
          <BurnCollapsibleHead
            label="NOTIFICATIONS"
            right={`${Object.values(notifs).filter(Boolean).length} ON`}
            open={notifsOpen}
            onToggle={() => setNotifsOpen(!notifsOpen)}
          />
          {notifsOpen && (
            <div style={{ padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <BurnToggleRow label="Idea missions"        on={notifs.ideas}    onChange={() => setNotifs(s => ({...s, ideas: !s.ideas}))} />
              <BurnToggleRow label="Maxx alerts"          on={notifs.alerts}   onChange={() => setNotifs(s => ({...s, alerts: !s.alerts}))} />
              <BurnToggleRow label="Session restored"     on={notifs.restored} onChange={() => setNotifs(s => ({...s, restored: !s.restored}))} />
              <BurnToggleRow label="Quota warnings"       on={notifs.quota}    onChange={() => setNotifs(s => ({...s, quota: !s.quota}))} />
              <BurnDropdownRow label="Session warning"    value="50% + 20% left" />
              <BurnDropdownRow label="Weekly warning"     value="50% + 20% left" />
              <BurnDropdownRow label="Alert window"       value="48h before reset" />
              <BurnDropdownRow label="Reserve floor"      value="25% unused" />
            </div>
          )}
        </div>

        {/* collapsible: app */}
        <div style={{ padding: '14px 14px 0' }}>
          <BurnCollapsibleHead
            label="APP"
            right="DARK · VALUE LEFT"
            open={appOpen}
            onToggle={() => setAppOpen(!appOpen)}
          />
          {appOpen && (
            <div style={{ padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <BurnDropdownRow label="Menu bar"     value="Value left" />
              <BurnDropdownRow label="Token history" value="30 days" />
              <BurnToggleRow label="Light mode"     on={lightMode}   onChange={() => setLightMode(!lightMode)} />
              <BurnToggleRow label="Open at login"  on={openAtLogin} onChange={() => setOpenAtLogin(!openAtLogin)} />
            </div>
          )}
        </div>

        {/* updates */}
        <div style={{ padding: '14px' }}>
          <BurnCollapsibleHead label="UPDATES" right="v0.2.3-beta.1" open={false} onToggle={() => {}} />
        </div>
      </div>

      {/* Settings footer */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: 10,
        borderTop: `1px solid ${BURN.border}`,
        background: BURN.surface,
      }}>
        <button style={{ ...burnTextBtn, border: 'none', background: 'transparent', color: BURN.text3 }}>REVEAL CONFIG</button>
        <button style={{ ...burnTextBtn, border: 'none', background: 'transparent', color: BURN.text3 }}>REVEAL LOG</button>
        <span style={{ flex: 1 }} />
        <button style={{
          padding: '8px 16px', background: BURN.lime, color: BURN.bg,
          border: 'none', borderRadius: 2,
          fontFamily: mono, fontSize: 11, fontWeight: 700,
          letterSpacing: 0.6, textTransform: 'uppercase', cursor: 'pointer',
        }}>
          Save
        </button>
      </div>
    </div>
  );
}

function BurnProvSettingRow({ pv, enabled, onToggle }) {
  const [expanded, setExpanded] = React.useState(false);
  const [warnMode, setWarnMode] = React.useState('auto');
  return (
    <div style={{
      border: `1px solid ${enabled ? BURN.border : BURN.border}`,
      borderRadius: 2,
      background: enabled ? BURN.surface : 'transparent',
      opacity: enabled ? 1 : 0.55,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
      }}>
        <Icon name="list" size={11} color={BURN.text3} />
        <ProvGlyph id={pv.id} size={15} color={enabled ? BURN.text : BURN.text2} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: BURN.text }}>{pv.name}</div>
          <div style={{ fontFamily: mono, fontSize: 9.5, color: BURN.text3, letterSpacing: 0.4, marginTop: 1 }}>
            {pv.sub.toUpperCase()}
          </div>
        </div>
        <BurnSettingDropdown value={warnMode === 'auto' ? 'WARN AUTO' : warnMode.toUpperCase()} />
        <BurnSwitch on={enabled} onChange={onToggle} />
      </div>
      {pv.cookie && enabled && (
        <div style={{
          padding: '0 12px 12px',
          display: 'flex', gap: 6,
        }}>
          <input
            type="text"
            placeholder={pv.id === 'cursor' ? 'Cookie: WorkosCursorSessionToken=...' : 'Cookie: sso=...; sso-rw=... or Bearer ...'}
            style={{
              flex: 1, padding: '7px 9px',
              background: BURN.bg, border: `1px solid ${BURN.border}`, borderRadius: 2,
              color: BURN.text2, fontFamily: mono, fontSize: 10.5, letterSpacing: 0.2,
              outline: 'none',
            }}
          />
          <button style={burnTextBtn}>SAVE</button>
        </div>
      )}
    </div>
  );
}

function BurnSettingDropdown({ value }) {
  return (
    <button style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 8px', background: BURN.bg,
      border: `1px solid ${BURN.border}`, borderRadius: 2,
      color: BURN.text2, fontFamily: mono, fontSize: 9.5, letterSpacing: 0.5,
      cursor: 'pointer', whiteSpace: 'nowrap',
    }}>
      {value}
      <Icon name="chevron-down" size={9} color={BURN.text3} />
    </button>
  );
}

function BurnCollapsibleHead({ label, right, open, onToggle }) {
  return (
    <button onClick={onToggle} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
      padding: '9px 11px',
      background: BURN.surface, border: `1px solid ${BURN.border}`, borderRadius: 2,
      cursor: 'pointer', color: BURN.text,
      fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
    }}>
      <span style={{ color: BURN.lime }}>{label}</span>
      <span style={{ flex: 1 }} />
      <span style={{ color: BURN.text3, fontWeight: 400, textTransform: 'uppercase' }}>{right}</span>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={11} color={BURN.text3} />
    </button>
  );
}

function BurnToggleRow({ label, on, onChange }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 11px',
      borderBottom: `1px solid ${BURN.border}`,
    }}>
      <span style={{ fontSize: 12.5, color: BURN.text, flex: 1 }}>{label}</span>
      <BurnSwitch on={on} onChange={onChange} />
    </div>
  );
}

function BurnDropdownRow({ label, value }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 11px',
      borderBottom: `1px solid ${BURN.border}`,
    }}>
      <span style={{ fontSize: 12.5, color: BURN.text, flex: 1 }}>{label}</span>
      <BurnSettingDropdown value={value.toUpperCase()} />
    </div>
  );
}

function BurnSwitch({ on, onChange }) {
  return (
    <button onClick={onChange} style={{
      width: 32, height: 18, padding: 0,
      background: on ? BURN.lime : BURN.text4,
      border: 'none', borderRadius: 2,
      cursor: 'pointer', position: 'relative',
      flex: '0 0 auto',
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14,
        background: on ? BURN.bg : BURN.text2,
        transition: 'left 120ms ease',
      }} />
    </button>
  );
}

// ============================================================
// WINDOW SHELL
// ============================================================
function burnWindowStyle() {
  return {
    width: 400,
    height: 720,
    background: BURN.bg,
    border: `1px solid ${BURN.borderHi}`,
    borderRadius: BURN.radius,
    fontFamily: sans, color: BURN.text,
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
  };
}

// ============================================================
// THE INTERACTIVE APP — routes between screens
// ============================================================
function BurnApp({ initial = 'home' }) {
  const [screen, setScreen] = React.useState(initial);
  const [expandedId, setExpandedId] = React.useState('chatgpt');

  if (screen === 'missions') {
    return <BurnMissions
      onBack={() => setScreen('home')}
      onOpen={() => setScreen('mission-setup')}
    />;
  }
  if (screen === 'mission-setup') {
    return <BurnMissionSetup onBack={() => setScreen('missions')} />;
  }
  if (screen === 'settings') {
    return <BurnSettings onBack={() => setScreen('home')} />;
  }
  return (
    <BurnHome
      expandedId={expandedId}
      onToggle={(id) => setExpandedId(prev => prev === id ? null : id)}
      onDiamond={() => setScreen('missions')}
      onSettings={() => setScreen('settings')}
    />
  );
}

Object.assign(window, {
  BURN, BURN_PROVIDERS, BURN_MISSIONS,
  BurnSegBar, BurnSparkline, BurnHeader, BurnLiveStrip, BurnFooter,
  BurnHome, BurnProviderRow, BurnProviderExpanded,
  BurnWindowBar, BurnSectionHead, BurnCostRow, BurnStat, BurnModelRow,
  BurnMissions, BurnIdeaCard, BurnMissionSetup, BurnModelCheck,
  BurnSettings, BurnProvSettingRow, BurnSwitch, BurnSettingDropdown,
  BurnCollapsibleHead, BurnToggleRow, BurnDropdownRow,
  BurnApp,
});
