// Static (non-interactive) wrapper for the Burn app — for use as artboard previews.
// Same JSX tree as BurnApp but seeded into a specific screen.

function BurnAppStatic({ initial = 'home', expandedId = 'chatgpt' }) {
  if (initial === 'missions') {
    return <BurnMissions onBack={() => {}} onOpen={() => {}} />;
  }
  if (initial === 'mission-setup') {
    return <BurnMissionSetup onBack={() => {}} />;
  }
  if (initial === 'settings') {
    return <BurnSettings onBack={() => {}} />;
  }
  return (
    <BurnHome
      expandedId={expandedId}
      onToggle={() => {}}
      onDiamond={() => {}}
      onSettings={() => {}}
    />
  );
}

// ============================================================
// SPEC PANEL — annotated callouts for the Burn system
// ============================================================
function BurnSpecPanel() {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#040404',
      padding: 24, boxSizing: 'border-box',
      fontFamily: sans, color: BURN.text,
      overflow: 'auto',
    }}>
      <div style={{
        fontFamily: mono, fontSize: 11, color: BURN.lime, letterSpacing: 0.7,
        textTransform: 'uppercase', marginBottom: 4,
      }}>BURN · v2 design system</div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, marginBottom: 16 }}>
        Tactical. Mono. Loud when it matters.
      </div>

      <SpecBlock
        n="01"
        title="Sharp corners, no gradients"
        body="6px outer radius on the window, 2px on everything inside. No shadows. No gradients. The only color shift is warn-red taking over from lime when a plan is burning fast — and even then it's an HSL switch, not a blend."
      />
      <SpecBlock
        n="02"
        title="One progress component: the 28-cell VU bar"
        body="Every bar on every screen is the same thing: 28 evenly-spaced rectangles, 2px gaps, 5px tall. Lit cells = used. Color = lime by default, warn-red when the row is burning. Per-model bars drop to 20 cells × 3px; they're sub-bars."
      />
      <SpecBlock
        n="03"
        title="Sparkline trails"
        body="Every collapsed provider row carries a 56×14px polyline of the last 9 sync ticks. 1.2px stroke, square caps. Same color rule as the bar. The shape of the line is the story — flat = idle, steep = burning."
      />
      <SpecBlock
        n="04"
        title="Live strip"
        body="One pixel-glow lime dot + a mono caption under every header: 'LIVE · 5 STREAMS' or 'UNUSED TOKENS · BURN THEM ON IDEAS'. Right side is a count of anything bad. The strip is the system's pulse."
      />
      <SpecBlock
        n="05"
        title="Expand-in-place rows"
        body="No separate provider detail page. Tapping the chevron reveals SESSION + WEEKLY bars, a COST grid (today / yesterday / 30d, tokens and $), TOKENS in/cached/out, and a MODEL BURN section with one mini-bar per model. Same row gets pushed open; nothing modal."
      />
      <SpecBlock
        n="06"
        title="Missions are flat-numbered cards"
        body="No carousels, no swiping. A scrolling list of '#N · Title' cards with a one-line description, an italic mono quote on a lime border-left, difficulty as three squares, time estimate, stack chip, and one lime 'Start build →' button per card. Recommended model is pre-selected."
      />
      <SpecBlock
        n="07"
        title="Settings is config-as-list"
        body="Provider rows with drag handle + WARN AUTO dropdown + lime switch. Cookie-required providers expand inline with a paste field + SAVE. Below: three collapsible groups (NOTIFICATIONS / APP / UPDATES). Save button is lime — it's the only saturated button on the screen."
      />
      <SpecBlock
        n="08"
        title="Mono everywhere it earns it"
        body="Numbers, timestamps, captions, button labels: Geist Mono, uppercase, 0.5 letter-spacing. Body copy and titles: Geist Sans. Never mono for prose."
      />

      <div style={{
        marginTop: 22, padding: '12px 14px',
        background: 'rgba(182,255,60,0.05)',
        border: `1px solid rgba(182,255,60,0.20)`,
        borderRadius: 2,
      }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: BURN.lime, letterSpacing: 0.5, marginBottom: 5 }}>
          NEXT TO YOU →
        </div>
        <div style={{ fontSize: 12.5, color: BURN.text2, lineHeight: 1.55 }}>
          The interactive prototype sits in the artboard to the right. Click any
          provider chevron to expand it in place, the diamond to open Missions,
          the gear to open Settings. Back chevrons return to home.
        </div>
      </div>
    </div>
  );
}

function SpecBlock({ n, title, body }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '32px 1fr',
      gap: 12, marginBottom: 16,
      paddingBottom: 14, borderBottom: `1px solid ${BURN.border}`,
    }}>
      <span style={{
        fontFamily: mono, fontSize: 11, color: BURN.lime, fontWeight: 700,
        letterSpacing: 0.4,
      }}>{n}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: BURN.text, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: BURN.text2, lineHeight: 1.55 }}>{body}</div>
      </div>
    </div>
  );
}

Object.assign(window, { BurnAppStatic, BurnSpecPanel, SpecBlock });
