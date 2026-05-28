// Four "if X designed it" variations of the home list screen.
// Same 5 providers, same data, same width (~380px). Different visual languages.

const PROVIDERS = [
  { id: 'chatgpt', name: 'ChatGPT', plan: 'Pro 20×',  used: 23, s5h: 4,  w7d: 23, status: 'ok',   reset: '01h 11m', spark: [12,15,18,20,21,22,23,23,23] },
  { id: 'claude',  name: 'Claude',  plan: 'Max 20×',  used: 8,  s5h: 0,  w7d: 8,  status: 'ok',   reset: '02h 57m', spark: [2,4,5,6,7,7,8,8,8] },
  { id: 'cursor',  name: 'Cursor',  plan: 'Pro+',     used: 17, s5h: 17, w7d: 22, status: 'ok',   reset: '11d 02h', spark: [6,9,11,13,14,15,16,17,17] },
  { id: 'kimi',    name: 'Kimi',    plan: 'Basic',    used: 1,  s5h: 0,  w7d: 1,  status: 'idle', reset: '4d 11h',  spark: [0,0,1,1,1,1,1,1,1] },
  { id: 'grok',    name: 'Grok',    plan: 'Build',    used: 31, s5h: 31, w7d: 31, status: 'warn', reset: '01h 09m', spark: [8,14,19,22,25,27,29,30,31] },
];

const V_BG   = '#070707';
const V_SURF = '#0F0F0F';
const V_BR   = '#1B1B1B';
const V_BR2  = '#2A2A2A';
const V_T1   = '#F2F2F2';
const V_T2   = '#8A8A8A';
const V_T3   = '#555555';
const V_LIME = '#B6FF3C';
const V_WARN = '#FF6B5C';

// ============================================================
// SHARED — small monogram tiles for each provider
// ============================================================
function ProvGlyph({ id, size = 16, color = 'currentColor' }) {
  const s = size, c = color;
  if (id === 'chatgpt') return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="1.5">
      <circle cx="10" cy="10" r="6.4" /><path d="M10 3.6V10l5 2.5" />
    </svg>
  );
  if (id === 'claude') return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill={c}>
      {[...Array(8)].map((_, i) => {
        const a = (i * Math.PI) / 4;
        return <line key={i} x1={10+Math.cos(a)*3} y1={10+Math.sin(a)*3} x2={10+Math.cos(a)*8} y2={10+Math.sin(a)*8} stroke={c} strokeWidth="1.6" strokeLinecap="round" />;
      })}
      <circle cx="10" cy="10" r="1.4" />
    </svg>
  );
  if (id === 'cursor') return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="1.4">
      <path d="M10 2.5L17 6v7l-7 3.5L3 13V6z" /><path d="M3 6l7 3.5L17 6" /><path d="M10 9.5v7" />
    </svg>
  );
  if (id === 'kimi') return (
    <span style={{ fontFamily: mono, fontSize: s * 0.78, fontWeight: 700, color: c, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: s, height: s }}>K</span>
  );
  if (id === 'grok') return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="1.5">
      <circle cx="10" cy="10" r="7" /><line x1="5" y1="5" x2="15" y2="15" />
    </svg>
  );
  return null;
}

function StatusDot({ status, size = 6 }) {
  const c = status === 'warn' ? V_WARN : status === 'idle' ? V_T3 : V_LIME;
  return <span style={{ width: size, height: size, borderRadius: size, background: c, display: 'inline-block', flex: '0 0 auto' }} />;
}

// ============================================================
// VARIATION 1 · "LEDGER" — if Claude designed it
// Bloomberg terminal lineage. Mono everywhere. Single-line rows.
// Density = max. Color = neutral. The bar is INLINE with the row.
// ============================================================
function V1Ledger() {
  return (
    <div style={{
      width: 380, background: V_BG, border: `1px solid ${V_BR}`,
      borderRadius: 12, overflow: 'hidden', fontFamily: sans, color: V_T1,
    }}>
      <VHeader subtitle="LEDGER" />
      {/* Column header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '14px 1fr 90px 56px 44px',
        gap: 10, padding: '8px 14px', borderTop: `1px solid ${V_BR}`,
        background: V_SURF,
        fontFamily: mono, fontSize: 9, color: V_T3, letterSpacing: 0.7, textTransform: 'uppercase',
      }}>
        <span /><span>provider</span><span>burn · 5h / 7d</span><span style={{ textAlign: 'right' }}>used</span><span style={{ textAlign: 'right' }}>reset</span>
      </div>
      {/* Rows */}
      {PROVIDERS.map(p => (
        <div key={p.id} style={{
          display: 'grid', gridTemplateColumns: '14px 1fr 90px 56px 44px',
          gap: 10, padding: '9px 14px', alignItems: 'center',
          borderTop: `1px solid ${V_BR}`,
          fontFamily: mono, fontSize: 11.5,
        }}>
          <span style={{ color: p.status === 'warn' ? V_WARN : p.status === 'idle' ? V_T3 : V_LIME, lineHeight: 1 }}>◆</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <ProvGlyph id={p.id} size={13} color={V_T1} />
            <span style={{ color: V_T1 }}>{p.name}</span>
            <span style={{ color: V_T3, fontSize: 10 }}>{p.plan.toLowerCase()}</span>
          </span>
          {/* mini dual bar — 5h on top, 7d below, stacked into 90px */}
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <LedgerMini pct={p.s5h} />
            <LedgerMini pct={p.w7d} />
          </span>
          <span style={{ textAlign: 'right', color: V_T1, fontVariantNumeric: 'tabular-nums' }}>{p.used}%</span>
          <span style={{ textAlign: 'right', color: V_T3, fontVariantNumeric: 'tabular-nums', fontSize: 10 }}>{p.reset}</span>
        </div>
      ))}
      <VFooter />
    </div>
  );
}
function LedgerMini({ pct }) {
  return (
    <span style={{ width: '100%', height: 3, background: '#1a1a1a', position: 'relative', overflow: 'hidden' }}>
      <span style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${Math.max(2, pct)}%`,
        background: V_LIME,
      }} />
    </span>
  );
}

// ============================================================
// VARIATION 2 · "BURN" — if Grok designed it
// Tweet/X aesthetic. Sharp, irreverent, slightly tactical.
// Sparkline trails behind each provider. Burn-rate flag is loud.
// ============================================================
function V2Burn() {
  return (
    <div style={{
      width: 380, background: '#000', border: `1px solid ${V_BR2}`,
      borderRadius: 6, overflow: 'hidden', fontFamily: sans, color: V_T1,
    }}>
      <VHeader subtitle="BURN" sharp />
      {/* live indicator strip */}
      <div style={{
        padding: '7px 14px', borderTop: `1px solid ${V_BR}`,
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: mono, fontSize: 9.5, color: V_T2, letterSpacing: 0.6,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: 6, background: V_LIME, boxShadow: `0 0 6px ${V_LIME}` }} />
        <span>LIVE · {PROVIDERS.length} STREAMS</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: V_WARN }}>1 BURNING</span>
      </div>
      {PROVIDERS.map(p => {
        const burning = p.status === 'warn';
        return (
          <div key={p.id} style={{
            padding: '11px 14px', borderTop: `1px solid ${V_BR}`,
            position: 'relative',
            background: burning ? 'rgba(255,107,92,0.04)' : 'transparent',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <ProvGlyph id={p.id} size={14} color={V_T1} />
              <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: -0.1 }}>{p.name}</span>
              <span style={{ fontFamily: mono, fontSize: 9.5, color: V_T3, letterSpacing: 0.5, textTransform: 'uppercase' }}>{p.plan}</span>
              <span style={{ flex: 1 }} />
              {/* sparkline */}
              <Sparkline data={p.spark} color={burning ? V_WARN : V_LIME} width={60} height={14} />
              <span style={{
                fontFamily: mono, fontSize: 15, fontWeight: 600,
                color: burning ? V_WARN : V_T1,
                fontVariantNumeric: 'tabular-nums', letterSpacing: -0.3,
                minWidth: 36, textAlign: 'right',
              }}>{p.used}%</span>
            </div>
            {/* segmented bar — 24 segments, lit ones = used */}
            <SegmentedBar pct={p.used} burning={burning} />
            <div style={{
              display: 'flex', justifyContent: 'space-between', marginTop: 6,
              fontFamily: mono, fontSize: 9, color: V_T3, letterSpacing: 0.4,
            }}>
              <span>5H {p.s5h}% · 7D {p.w7d}%</span>
              <span>RESET {p.reset.toUpperCase()}</span>
            </div>
          </div>
        );
      })}
      <VFooter sharp />
    </div>
  );
}
function Sparkline({ data, color, width = 60, height = 14 }) {
  const max = Math.max(...data, 1);
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${height - (v / max) * height}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}
function SegmentedBar({ pct, burning }) {
  const N = 28;
  const lit = Math.round((pct / 100) * N);
  return (
    <div style={{ display: 'flex', gap: 2, width: '100%' }}>
      {[...Array(N)].map((_, i) => (
        <span key={i} style={{
          flex: 1, height: 5,
          background: i < lit ? (burning ? V_WARN : V_LIME) : '#1a1a1a',
        }} />
      ))}
    </div>
  );
}

// ============================================================
// VARIATION 3 · "BLOOM" — if Gemini designed it
// Softer, more rounded, ring-gauge per provider on the left.
// Material-ish dark surface. Friendlier letter-spacing.
// ============================================================
function V3Bloom() {
  return (
    <div style={{
      width: 380, background: V_BG, border: `1px solid ${V_BR}`,
      borderRadius: 18, overflow: 'hidden', fontFamily: sans, color: V_T1,
    }}>
      <VHeader subtitle="BLOOM" rounded />
      {PROVIDERS.map(p => (
        <div key={p.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px', borderTop: `1px solid ${V_BR}`,
        }}>
          {/* ring gauge */}
          <RingGauge pct={p.used} status={p.status} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <ProvGlyph id={p.id} size={13} color={V_T1} />
              <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.1 }}>{p.name}</span>
              <span style={{ fontFamily: mono, fontSize: 9, color: V_T3, letterSpacing: 0.6, textTransform: 'uppercase' }}>{p.plan}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <BloomBar pct={p.s5h} label="5h" />
              <BloomBar pct={p.w7d} label="7d" />
            </div>
          </div>
          <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: V_T3, letterSpacing: 0.4 }}>RESETS</div>
            <div style={{ fontFamily: mono, fontSize: 10.5, color: V_T2, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{p.reset}</div>
          </div>
        </div>
      ))}
      <VFooter rounded />
    </div>
  );
}
function RingGauge({ pct, status }) {
  const r = 16, c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const color = status === 'warn' ? V_WARN : V_LIME;
  return (
    <div style={{ position: 'relative', width: 40, height: 40, flex: '0 0 auto' }}>
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#1a1a1a" strokeWidth="3" />
        <circle
          cx="20" cy="20" r={r}
          fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${dash} ${c}`}
          strokeDashoffset={c / 4}
          transform="rotate(-90 20 20)"
          strokeLinecap="butt"
        />
      </svg>
      <span style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: mono, fontSize: 11, fontWeight: 600, color: V_T1,
        fontVariantNumeric: 'tabular-nums',
      }}>{pct}</span>
    </div>
  );
}
function BloomBar({ pct, label }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: mono, fontSize: 9, color: V_T3, letterSpacing: 0.4, textTransform: 'uppercase', minWidth: 16 }}>{label}</span>
      <span style={{ flex: 1, height: 4, background: '#1a1a1a', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', inset: 0, width: `${Math.max(2, pct)}%`, background: V_LIME, borderRadius: 4 }} />
      </span>
    </div>
  );
}

// ============================================================
// VARIATION 4 · "SLATE" — if OpenAI designed it
// ChatGPT-settings aesthetic. Sans serif. Extreme calm.
// Single composite bar split into 5h / 7d sections. One row per provider.
// ============================================================
function V4Slate() {
  return (
    <div style={{
      width: 380, background: V_BG, border: `1px solid ${V_BR}`,
      borderRadius: 10, overflow: 'hidden', fontFamily: sans, color: V_T1,
    }}>
      <VHeader subtitle="SLATE" minimal />
      {PROVIDERS.map(p => (
        <div key={p.id} style={{
          padding: '14px 16px', borderTop: `1px solid ${V_BR}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <ProvGlyph id={p.id} size={14} color={V_T2} />
            <span style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: -0.15 }}>{p.name}</span>
            <StatusDot status={p.status} />
            <span style={{ fontSize: 11, color: V_T3 }}>{p.plan}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 13, color: V_T1, fontFamily: mono, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{p.used}%</span>
          </div>
          {/* composite bar: 5h tick + 7d fill, drawn together */}
          <SlateBar s5h={p.s5h} w7d={p.w7d} status={p.status} />
          <div style={{
            display: 'flex', justifyContent: 'space-between', marginTop: 7,
            fontSize: 11, color: V_T3,
          }}>
            <span>{p.s5h}% session · {p.w7d}% weekly</span>
            <span style={{ fontFamily: mono, fontVariantNumeric: 'tabular-nums' }}>{p.reset}</span>
          </div>
        </div>
      ))}
      <VFooter minimal />
    </div>
  );
}
function SlateBar({ s5h, w7d, status }) {
  // weekly is the long fill, session is a tick on it
  const color = status === 'warn' ? V_WARN : V_LIME;
  return (
    <svg width="100%" height="6" viewBox="0 0 100 6" preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      <rect x="0" y="2" width="100" height="2" fill="#1a1a1a" rx="1" />
      <rect x="0" y="2" width={w7d} height="2" fill={color} rx="1" />
      {/* session tick */}
      <rect x={Math.max(0, Math.min(99.5, s5h - 0.25))} y="0" width="0.6" height="6" fill={V_T1} />
    </svg>
  );
}

// ============================================================
// SHARED — header + footer for all 4 variations
// ============================================================
function VHeader({ subtitle, rounded, minimal, sharp }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 14px',
    }}>
      <div style={{
        width: 22, height: 22,
        borderRadius: rounded ? 8 : sharp ? 3 : 5,
        background: V_SURF, border: `1px solid ${V_BR}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="11" height="11" viewBox="0 0 14 14"><polygon points="7,1.4 8.2,5.4 12.2,7 8.2,8.6 7,12.6 5.8,8.6 1.8,7 5.8,5.4" fill={V_LIME} /></svg>
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.2 }}>
        Maxx<span style={{ color: V_LIME }}>Token</span>
      </span>
      <span style={{
        fontFamily: mono, fontSize: 9, color: V_T3,
        letterSpacing: 0.8, padding: '3px 7px',
        background: V_SURF, border: `1px solid ${V_BR}`,
        borderRadius: rounded ? 999 : sharp ? 2 : 4,
      }}>{subtitle}</span>
      <span style={{ flex: 1 }} />
      {!minimal && (
        <button style={{
          width: 26, height: 26,
          borderRadius: rounded ? 999 : sharp ? 2 : 6,
          background: 'rgba(182,255,60,0.08)', border: `1px solid rgba(182,255,60,0.30)`,
          cursor: 'pointer', padding: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="12" height="12" viewBox="0 0 14 14"><polygon points="7,1.5 12.5,7 7,12.5 1.5,7" fill={V_LIME} /></svg>
        </button>
      )}
      <button style={{
        width: 26, height: 26,
        borderRadius: rounded ? 999 : sharp ? 2 : 6,
        background: V_SURF, border: `1px solid ${V_BR}`,
        cursor: 'pointer', padding: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="settings" size={13} color={V_T2} />
      </button>
    </div>
  );
}
function VFooter({ rounded, minimal, sharp }) {
  const items = [
    { l: 'SPENT', v: '$181', color: V_LIME },
    { l: 'LEFT',  v: '$421', color: V_WARN },
    { l: 'SYNC',  v: '15m',  color: V_T1 },
  ];
  return (
    <div style={{
      display: 'flex', gap: 6, padding: 8,
      borderTop: `1px solid ${V_BR}`,
      background: '#0a0a0a',
    }}>
      {items.map(it => (
        <div key={it.l} style={{
          flex: 1,
          background: V_BG,
          border: `1px solid ${V_BR}`,
          borderRadius: rounded ? 10 : sharp ? 2 : 6,
          padding: '6px 8px',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <span style={{ fontFamily: mono, fontSize: 8.5, color: V_T3, letterSpacing: 0.6 }}>{it.l}</span>
          <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 600, color: it.color, fontVariantNumeric: 'tabular-nums' }}>{it.v}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// LABEL CARDS — one per variation describing the philosophy
// ============================================================
function VariantNotes({ title, persona, body, tags }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#050505',
      padding: 26, boxSizing: 'border-box',
      fontFamily: sans, color: V_T1,
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div>
        <div style={{ fontFamily: mono, fontSize: 10, color: V_LIME, letterSpacing: 0.8, textTransform: 'uppercase' }}>
          IF {persona} DESIGNED IT
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, marginTop: 8 }}>
          {title}
        </div>
      </div>
      <div style={{ fontSize: 13, color: V_T2, lineHeight: 1.55 }}>{body}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
        {tags.map(t => (
          <span key={t} style={{
            fontFamily: mono, fontSize: 9.5, letterSpacing: 0.5, color: V_T2,
            padding: '4px 8px', background: V_SURF, border: `1px solid ${V_BR}`,
            borderRadius: 4, textTransform: 'uppercase',
          }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, {
  V1Ledger, V2Burn, V3Bloom, V4Slate, VariantNotes,
});
