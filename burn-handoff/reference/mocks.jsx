// MaxxToken redesign mocks — all components.
// Window width target: 380px. Dark near-black, lime accent only.

const TOKEN = {
  bg:         '#0A0A0A',
  surface:    '#121212',
  surface2:   '#171717',
  border:     '#1F1F1F',
  borderHi:   '#2A2A2A',
  text:       '#EDEDED',
  text2:      '#8A8A8A',
  text3:      '#555555',
  lime:       '#B6FF3C',
  limeDim:    '#6B8A1D',
  limeFaint:  'rgba(182, 255, 60, 0.14)',
  limeGlow:   'rgba(182, 255, 60, 0.30)',
  trackBg:    '#1A1A1A',
};

const sans = '"Geist", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
const mono = '"Geist Mono", "JetBrains Mono", ui-monospace, monospace';

// ============================================================
// PROGRESS BAR — the canvas for everything
// ============================================================
// Encodes (without a 2nd accent color):
//  - actual %         → solid lime fill
//  - expected %       → hairline tick (always visible, position = where you should be)
//  - reserve (ahead)  → underscore-line in the gap between fill-end and tick
//  - deficit (behind) → diagonal-stripe pattern in the segment from tick to fill-end
//  - window label     → tiny mono cap at right of bar ("5h" / "7d" / "30d")
//  - time-to-reset    → mono caption above-right (handled by parent row)

function PaceBar({ actual, expected, label = '5h', height = 6, showLabel = true, dim = false }) {
  const a = Math.max(0, Math.min(100, actual));
  const e = Math.max(0, Math.min(100, expected));
  const ahead = a < e - 2;        // meaningful reserve threshold
  const behind = a > e + 2;       // meaningful deficit threshold
  const onPace = !ahead && !behind;

  // unique id to avoid collisions on the same page
  const sid = React.useId().replace(/:/g, '');
  const stripeId = `stripe-${sid}`;

  // Geometry in % of bar width
  const fillEnd = a;
  const tickX = e;
  const reserveStart = Math.min(a, e);
  const reserveEnd = Math.max(a, e);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <svg
        viewBox="0 0 100 12"
        preserveAspectRatio="none"
        style={{ flex: '1 1 auto', height: height + 6, display: 'block', overflow: 'visible' }}
      >
        <defs>
          {/* Diagonal stripes for deficit segment — same lime, different texture */}
          <pattern id={stripeId} patternUnits="userSpaceOnUse" width="2.4" height="6" patternTransform="rotate(45)">
            <rect width="1.1" height="6" fill={TOKEN.lime} />
            <rect x="1.1" width="1.3" height="6" fill="transparent" />
          </pattern>
        </defs>

        {/* Track */}
        <rect x="0" y={6 - height / 2} width="100" height={height} rx="0.6" fill={TOKEN.trackBg} />

        {/* Solid fill — up to actual (or up to expected if behind, since stripes take over after) */}
        <rect
          x="0"
          y={6 - height / 2}
          width={behind ? e : a}
          height={height}
          rx="0.6"
          fill={dim ? TOKEN.limeDim : TOKEN.lime}
        />

        {/* Deficit stripes — from expected to actual */}
        {behind && (
          <rect
            x={e}
            y={6 - height / 2}
            width={a - e}
            height={height}
            fill={`url(#${stripeId})`}
          />
        )}

        {/* Reserve underscore — thin line in the gap (fill-end → tick) */}
        {ahead && (
          <rect
            x={a}
            y={6 + height / 2 + 0.4}
            width={e - a}
            height={0.8}
            fill={TOKEN.lime}
            opacity="0.55"
          />
        )}

        {/* Expected-pace tick — full-height hairline poking above & below the bar */}
        <rect
          x={Math.max(0, Math.min(99.6, tickX - 0.2))}
          y={6 - height / 2 - 2}
          width="0.4"
          height={height + 4}
          fill={onPace ? TOKEN.lime : TOKEN.text2}
        />
      </svg>

      {showLabel && (
        <span style={{
          fontFamily: mono,
          fontSize: 9,
          letterSpacing: 0.4,
          color: TOKEN.text3,
          textTransform: 'uppercase',
          flex: '0 0 auto',
          minWidth: 20,
          textAlign: 'right',
        }}>{label}</span>
      )}
    </div>
  );
}

// ============================================================
// BADGES — three types, one style, one size
// ============================================================
function Badge({ kind = 'status', tone = 'ok', children }) {
  // kind: 'status' | 'source' | 'tier'
  // status tones: ok | warn | idle
  // source: always neutral, lower-emphasis
  // tier: hairline outline
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    height: 18,
    padding: '0 7px',
    borderRadius: 4,
    fontFamily: mono,
    fontSize: 9.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    lineHeight: 1,
    fontWeight: 500,
    border: '1px solid transparent',
    whiteSpace: 'nowrap',
  };
  let style = base;
  if (kind === 'status') {
    const dot = tone === 'ok' ? TOKEN.lime : tone === 'warn' ? TOKEN.text : TOKEN.text3;
    style = {
      ...base,
      background: tone === 'ok' ? TOKEN.limeFaint : TOKEN.surface2,
      color: tone === 'ok' ? TOKEN.lime : TOKEN.text2,
      border: `1px solid ${tone === 'ok' ? 'rgba(182,255,60,0.25)' : TOKEN.border}`,
    };
    return (
      <span style={style}>
        <span style={{ width: 5, height: 5, borderRadius: 5, background: dot }} />
        {children}
      </span>
    );
  }
  if (kind === 'source') {
    style = { ...base, background: TOKEN.surface2, color: TOKEN.text2, border: `1px solid ${TOKEN.border}` };
    return <span style={style}>{children}</span>;
  }
  // tier — no fill, hairline outline, slightly brighter text
  style = { ...base, background: 'transparent', color: TOKEN.text, border: `1px solid ${TOKEN.borderHi}` };
  return <span style={style}>{children}</span>;
}

// ============================================================
// ICONS — unified: 1.5px stroke, 14px box, square caps, no fills
// ============================================================
function Icon({ name, size = 14, color = TOKEN.text2 }) {
  const sw = 1.4;
  const p = {
    fill: 'none',
    stroke: color,
    strokeWidth: sw,
    strokeLinecap: 'square',
    strokeLinejoin: 'miter',
  };
  switch (name) {
    case 'chevron-down':
      return <svg width={size} height={size} viewBox="0 0 14 14"><polyline points="3.5,5.5 7,9 10.5,5.5" {...p} /></svg>;
    case 'chevron-up':
      return <svg width={size} height={size} viewBox="0 0 14 14"><polyline points="3.5,8.5 7,5 10.5,8.5" {...p} /></svg>;
    case 'chevron-right':
      return <svg width={size} height={size} viewBox="0 0 14 14"><polyline points="5.5,3.5 9,7 5.5,10.5" {...p} /></svg>;
    case 'refresh':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14">
          <path d="M11.5 6.5 A4.5 4.5 0 1 0 11 9.5" {...p} />
          <polyline points="11.5,3.5 11.5,6.5 8.5,6.5" {...p} />
        </svg>
      );
    case 'settings':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="2" {...p} />
          <line x1="7" y1="0.5" x2="7" y2="2.5" {...p} />
          <line x1="7" y1="11.5" x2="7" y2="13.5" {...p} />
          <line x1="0.5" y1="7" x2="2.5" y2="7" {...p} />
          <line x1="11.5" y1="7" x2="13.5" y2="7" {...p} />
          <line x1="2.4" y1="2.4" x2="3.8" y2="3.8" {...p} />
          <line x1="10.2" y1="10.2" x2="11.6" y2="11.6" {...p} />
          <line x1="11.6" y1="2.4" x2="10.2" y2="3.8" {...p} />
          <line x1="3.8" y1="10.2" x2="2.4" y2="11.6" {...p} />
        </svg>
      );
    case 'plug': // logo placeholder
      return (
        <svg width={size} height={size} viewBox="0 0 14 14">
          <rect x="3" y="2" width="8" height="9" rx="0" {...p} />
          <line x1="5" y1="11" x2="5" y2="13" {...p} />
          <line x1="9" y1="11" x2="9" y2="13" {...p} />
        </svg>
      );
    case 'pulse':
      return <svg width={size} height={size} viewBox="0 0 14 14"><polyline points="0.5,7 3,7 4.5,3 7,11 8.5,7 13.5,7" {...p} /></svg>;
    case 'list':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14">
          <line x1="2" y1="3.5" x2="12" y2="3.5" {...p} />
          <line x1="2" y1="7" x2="12" y2="7" {...p} />
          <line x1="2" y1="10.5" x2="12" y2="10.5" {...p} />
        </svg>
      );
    case 'expand':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14">
          <polyline points="2,5.5 2,2 5.5,2" {...p} />
          <polyline points="8.5,2 12,2 12,5.5" {...p} />
          <polyline points="12,8.5 12,12 8.5,12" {...p} />
          <polyline points="5.5,12 2,12 2,8.5" {...p} />
        </svg>
      );
    case 'plus':
      return <svg width={size} height={size} viewBox="0 0 14 14"><line x1="7" y1="2.5" x2="7" y2="11.5" {...p} /><line x1="2.5" y1="7" x2="11.5" y2="7" {...p} /></svg>;
    case 'arrow-up-right':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14">
          <line x1="3" y1="11" x2="11" y2="3" {...p} />
          <polyline points="5,3 11,3 11,9" {...p} />
        </svg>
      );
    case 'diamond':
      return <svg width={size} height={size} viewBox="0 0 14 14"><polygon points="7,1.5 12.5,7 7,12.5 1.5,7" {...p} /></svg>;
    default:
      return <svg width={size} height={size} viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" {...p} /></svg>;
  }
}

// ============================================================
// PLAN ROW (compact, 2-line) — the headline deliverable
// ============================================================
function PlanRow({
  name,
  tier,             // "MAX·20X" etc.
  pct,              // actual usage %
  expected,         // expected-pace %
  window = '5h',
  reset = '02h 03m',
  status = 'ok',
  source,           // "LOCAL CLAUDE LOGS" etc., optional
  // visual variant — affects accent on the % only
}) {
  return (
    <div style={{
      padding: '12px 14px 13px',
      borderTop: `1px solid ${TOKEN.border}`,
      fontFamily: sans,
      color: TOKEN.text,
    }}>
      {/* Line 1: identity left, primary number + reset right */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 9 }}>
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: -0.1 }}>{name}</span>
          <span style={{
            fontFamily: mono, fontSize: 9.5, letterSpacing: 0.5,
            color: TOKEN.text3, textTransform: 'uppercase',
          }}>{tier}</span>
        </div>
        <span style={{
          fontFamily: mono, fontSize: 14, fontWeight: 500,
          color: TOKEN.text, fontVariantNumeric: 'tabular-nums',
        }}>{pct}%</span>
        <span style={{
          fontFamily: mono, fontSize: 11, color: TOKEN.text3,
          fontVariantNumeric: 'tabular-nums', minWidth: 56, textAlign: 'right',
        }}>{reset}</span>
      </div>

      {/* Line 2: bar with embedded tick, reserve/deficit, and window label */}
      <PaceBar actual={pct} expected={expected} label={window} />
    </div>
  );
}

// ============================================================
// LO-FI WIREFRAME ROW — pure structure, no chrome
// ============================================================
function LofiRow({ caption, pct, expected, reset, win, note }) {
  // greyscale, dashed boxes, annotations
  const sansMuted = { fontFamily: sans, color: '#666', fontSize: 11, letterSpacing: 0.2 };
  return (
    <div style={{ padding: '14px 16px', borderTop: '1px dashed #d6d2c8' }}>
      <div style={{ fontSize: 10, fontFamily: mono, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
        {caption}
      </div>
      {/* Line 1 shell */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, height: 12, border: '1px dashed #b8b3a6', borderRadius: 2 }} />
        <div style={{ width: 42, height: 14, border: '1px dashed #b8b3a6', borderRadius: 2 }} />
        <div style={{ width: 60, height: 12, border: '1px dashed #b8b3a6', borderRadius: 2 }} />
      </div>
      {/* The bar — drawn as a single ascii-like svg in monochrome */}
      <LofiPaceBar pct={pct} expected={expected} label={win} />
      {/* annotation */}
      <div style={{ ...sansMuted, marginTop: 10, fontFamily: mono, fontSize: 10, color: '#6c6657', letterSpacing: 0.3 }}>
        {note}
      </div>
    </div>
  );
}

function LofiPaceBar({ pct, expected, label }) {
  const a = pct;
  const e = expected;
  const ahead = a < e - 2;
  const behind = a > e + 2;
  const sid = React.useId().replace(/:/g, '');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg viewBox="0 0 100 14" preserveAspectRatio="none" style={{ flex: 1, height: 18, overflow: 'visible' }}>
        <defs>
          <pattern id={`lf-${sid}`} patternUnits="userSpaceOnUse" width="2.4" height="8" patternTransform="rotate(45)">
            <rect width="1.2" height="8" fill="#2a2a2a" />
          </pattern>
        </defs>
        <rect x="0" y="4" width="100" height="6" fill="#e3dfd2" stroke="#b8b3a6" strokeWidth="0.4" />
        <rect x="0" y="4" width={behind ? e : a} height="6" fill="#2a2a2a" />
        {behind && <rect x={e} y="4" width={a - e} height="6" fill={`url(#lf-${sid})`} />}
        {ahead && <rect x={a} y="11" width={e - a} height="0.8" fill="#2a2a2a" />}
        <rect x={e - 0.25} y="2" width="0.5" height="10" fill="#2a2a2a" />
      </svg>
      <span style={{ fontFamily: mono, fontSize: 9, color: '#6c6657', letterSpacing: 0.4 }}>{label}</span>
    </div>
  );
}

// ============================================================
// HI-FI: full Claude card with rebalanced header
// ============================================================
function ClaudeCard() {
  return (
    <div style={{
      width: 380,
      background: TOKEN.bg,
      border: `1px solid ${TOKEN.border}`,
      borderRadius: 14,
      fontFamily: sans,
      color: TOKEN.text,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 14px 10px' }}>
        {/* Row 1: avatar · name · tier · status badge · expand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ClaudeMark />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 auto', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>Claude</span>
              <Badge kind="tier">MAX · 20×</Badge>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge kind="status" tone="ok">OPERATIONAL</Badge>
              <span style={{ fontFamily: mono, fontSize: 10, color: TOKEN.text3, letterSpacing: 0.3 }}>
                $200/MO
              </span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 26, lineHeight: 1, letterSpacing: -0.5, color: TOKEN.lime }}>
              17<span style={{ color: TOKEN.text2, fontWeight: 400, fontSize: 14 }}>%</span>
            </div>
            <div style={{ fontFamily: mono, fontSize: 9, color: TOKEN.text3, letterSpacing: 0.6, marginTop: 4, textTransform: 'uppercase' }}>
              of monthly cap
            </div>
          </div>
          <button style={iconBtn}><Icon name="chevron-up" /></button>
        </div>
      </div>

      {/* Three pace bars — Session / Weekly / Sonnet (per-model) */}
      <div style={{ borderTop: `1px solid ${TOKEN.border}` }}>
        <PaceLine label="Session" tier="5-hour window" pct={4} expected={26} reset="02h 03m" win="5H" />
        <PaceLine label="Weekly" tier="7-day window" pct={17} expected={43} reset="1d 10h 13m" win="7D" />
        <PaceLine label="Sonnet" tier="Per-model · 7d" pct={1} expected={43} reset="1d 10h 13m" win="7D" />
      </div>

      {/* Footer — the 3-chip strip */}
      <div style={{
        display: 'flex', gap: 6, padding: '11px 14px 12px',
        borderTop: `1px solid ${TOKEN.border}`,
        background: TOKEN.surface,
      }}>
        <Chip label="Spent" value="$34.00" />
        <Chip label="Left" value="$166" />
        <Chip label="Source" value="local" mono kind="dim" />
      </div>
    </div>
  );
}

function PaceLine({ label, tier, pct, expected, reset, win }) {
  return (
    <div style={{ padding: '12px 14px 13px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: TOKEN.text }}>{label}</span>
        <span style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: 0.5, color: TOKEN.text3, textTransform: 'uppercase' }}>{tier}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: mono, fontSize: 12, color: TOKEN.text, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
        <span style={{ fontFamily: mono, fontSize: 11, color: TOKEN.text3, fontVariantNumeric: 'tabular-nums', minWidth: 72, textAlign: 'right' }}>{reset}</span>
      </div>
      <PaceBar actual={pct} expected={expected} label={win} />
    </div>
  );
}

function Chip({ label, value, kind = 'normal', mono: isMono }) {
  return (
    <div style={{
      flex: 1,
      background: TOKEN.bg,
      border: `1px solid ${TOKEN.border}`,
      borderRadius: 6,
      padding: '7px 9px',
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      minWidth: 0,
    }}>
      <span style={{
        fontFamily: mono, fontSize: 9, color: TOKEN.text3,
        letterSpacing: 0.6, textTransform: 'uppercase',
      }}>{label}</span>
      <span style={{
        fontFamily: isMono || kind === 'dim' ? mono : sans,
        fontSize: kind === 'dim' ? 11 : 13,
        fontWeight: kind === 'dim' ? 400 : 500,
        color: kind === 'dim' ? TOKEN.text2 : TOKEN.text,
        letterSpacing: kind === 'dim' ? 0.2 : -0.1,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{value}</span>
    </div>
  );
}

const iconBtn = {
  width: 26, height: 26, borderRadius: 6,
  background: TOKEN.surface, border: `1px solid ${TOKEN.border}`,
  color: TOKEN.text2, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: 0,
};

// ============================================================
// EXPANDED ROW LO-FI
// ============================================================
function ExpandedLofi() {
  const Block = ({ w = '100%', h = 12, dashed = true, style }) => (
    <div style={{
      width: w, height: h,
      border: `1px ${dashed ? 'dashed' : 'solid'} #b8b3a6`,
      borderRadius: 2,
      ...style,
    }} />
  );
  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 10, fontFamily: mono, color: '#6c6657', textTransform: 'uppercase', letterSpacing: 0.6 }}>
        ROW · EXPANDED — extra detail without a separate page
      </div>

      {/* The collapsed row, still visible as anchor */}
      <LofiPaceBar pct={17} expected={43} label="7d" />
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, ...labelStyle }}>weekly · 7-day window</div>
        <div style={{ fontFamily: mono, fontSize: 11, color: '#2a2a2a', fontWeight: 600 }}>17%</div>
        <div style={{ fontFamily: mono, fontSize: 11, color: '#6c6657' }}>1d 10h 13m</div>
      </div>

      <div style={{ borderTop: '1px dashed #d6d2c8', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Metric row */}
        <div style={{ display: 'flex', gap: 8 }}>
          <ExpandedStat label="Samples" value="24" />
          <ExpandedStat label="Burn rate" value="0.39%/h" />
          <ExpandedStat label="Projection" value="38% by reset" />
        </div>

        {/* Pace explanation, as keyed data not prose */}
        <div style={{ background: '#eae6dc', border: '1px solid #d6d2c8', borderRadius: 4, padding: '10px 11px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 10, color: '#2a2a2a' }}>
            <span>EXPECTED@NOW</span><span>43%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 10, color: '#2a2a2a', marginTop: 4 }}>
            <span>ACTUAL</span><span>17%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 10, color: '#2a2a2a', marginTop: 4 }}>
            <span>RESERVE</span><span>26 pts ahead</span>
          </div>
        </div>

        {/* sparkline placeholder */}
        <div>
          <div style={{ fontFamily: mono, fontSize: 9, color: '#6c6657', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>
            Cumulative · last 7d
          </div>
          <Block h={36} />
        </div>
      </div>
    </div>
  );
}
const labelStyle = { fontFamily: mono, fontSize: 10, color: '#6c6657', letterSpacing: 0.4, textTransform: 'uppercase' };

function ExpandedStat({ label, value }) {
  return (
    <div style={{ flex: 1, border: '1px solid #d6d2c8', borderRadius: 4, padding: '7px 9px', background: '#eae6dc' }}>
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 0.6, color: '#6c6657', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 12, color: '#2a2a2a', fontWeight: 500, marginTop: 3 }}>{value}</div>
    </div>
  );
}

// ============================================================
// Plan marks — original, not Claude's actual logo
// ============================================================
function ClaudeMark() {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: 7,
      background: TOKEN.surface,
      border: `1px solid ${TOKEN.border}`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flex: '0 0 auto',
    }}>
      <svg width="16" height="16" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="3" fill={TOKEN.lime} />
        <circle cx="8" cy="8" r="6.4" fill="none" stroke={TOKEN.lime} strokeWidth="0.8" opacity="0.45" />
      </svg>
    </div>
  );
}
function GenericMark({ glyph = '◇' }) {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: 7,
      background: TOKEN.surface,
      border: `1px solid ${TOKEN.border}`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flex: '0 0 auto',
      color: TOKEN.text2,
      fontFamily: mono,
      fontSize: 13,
    }}>{glyph}</div>
  );
}

// ============================================================
// Window shell — used for the full assembly artboard
// ============================================================
function WindowShell({ children }) {
  return (
    <div style={{
      width: 380,
      background: TOKEN.bg,
      borderRadius: 14,
      border: `1px solid ${TOKEN.border}`,
      fontFamily: sans,
      color: TOKEN.text,
      overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 12px 11px',
        borderBottom: `1px solid ${TOKEN.border}`,
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: 'linear-gradient(135deg, #1a1a1a, #0c0c0c)',
          border: `1px solid ${TOKEN.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="11" height="11" viewBox="0 0 11 11"><polygon points="5.5,1 6.5,4.5 10,5.5 6.5,6.5 5.5,10 4.5,6.5 1,5.5 4.5,4.5" fill={TOKEN.lime} /></svg>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.2 }}>
          Maxx<span style={{ color: TOKEN.lime }}>Token</span>
        </span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontFamily: mono, fontSize: 10, color: TOKEN.text3,
          letterSpacing: 0.4, textTransform: 'uppercase',
          padding: '4px 8px', background: TOKEN.surface,
          border: `1px solid ${TOKEN.border}`, borderRadius: 4,
        }}>MAY · 10D LEFT</span>
        <button style={iconBtn}><Icon name="settings" /></button>
      </div>

      {/* Top-of-window summary chips */}
      <div style={{
        display: 'flex', gap: 6, padding: '12px 12px 14px',
      }}>
        <SummaryChip label="Spent" value="$143" tone="lime" />
        <SummaryChip label="Left to maxx" value="$371" />
        <SummaryChip label="Cycle left" value="9d 23h" mono />
      </div>

      {children}

      {/* Footer 3-chip */}
      <div style={{
        display: 'flex', gap: 6, padding: '11px 12px 12px',
        borderTop: `1px solid ${TOKEN.border}`,
        background: TOKEN.surface,
      }}>
        <Chip label="Plans" value="4 detected" />
        <Chip label="Est." value="1 plan" kind="dim" />
        <Chip label="Next reset" value="02h 03m" mono />
      </div>
    </div>
  );
}

function SummaryChip({ label, value, tone, mono: isMono }) {
  return (
    <div style={{
      flex: 1,
      background: TOKEN.surface,
      border: `1px solid ${TOKEN.border}`,
      borderRadius: 8,
      padding: '9px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <span style={{
        fontFamily: mono, fontSize: 9, color: TOKEN.text3,
        letterSpacing: 0.6, textTransform: 'uppercase',
      }}>{label}</span>
      <span style={{
        fontFamily: isMono ? mono : sans,
        fontSize: 18, fontWeight: 500, letterSpacing: -0.4,
        color: tone === 'lime' ? TOKEN.lime : TOKEN.text,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
    </div>
  );
}

Object.assign(window, {
  TOKEN, sans, mono,
  PaceBar, Badge, Icon, PlanRow, LofiRow, LofiPaceBar,
  ClaudeCard, PaceLine, Chip, ExpandedLofi,
  ClaudeMark, GenericMark, WindowShell, SummaryChip,
  iconBtn,
});
