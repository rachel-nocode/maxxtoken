# SPEC — MaxxToken "Burn" v2

> **Aesthetic:** Bloomberg-terminal-meets-X. Sharp corners, mono-heavy, dark
> canvas, one lime accent, warn-red only for actively-burning plans. No
> gradients. No shadows beyond the popover's own. No pill chrome.

This document covers four screens — **Home** (with expand-in-place provider
rows), **Missions**, **New Mission**, **Settings** — and the primitives every
screen reuses.

The live prototype: `MaxxToken redesign.html`, section "12 · Burn ·
full interactive system". Source: `reference/burn-system.jsx` +
`reference/burn-static.jsx` in this folder. **If anything below is ambiguous,
the JSX is canonical.**

---

## 1. Window

- **Size:** 400 × auto (height grows with content; max 720, then scroll inside).
- **Border:** `1px solid #252525`.
- **Radius:** `6px` (outer), `2px` (everything inside).
- **Background:** `#000` for the window body; `#0B0B0B` for the header/footer
  strips and any "raised" surface.
- **Internal rules:** `1px solid #1A1A1A`.
- **Shadow:** none added by us — let macOS draw the popover shadow.
- **Font stack:**
  - sans: `"Geist", system-ui, sans-serif`
  - mono: `"Geist Mono", "JetBrains Mono", monospace`

(Full tokens in `TOKENS.md`.)

---

## 2. Layout structure (every screen)

```
┌──────────────────────────────────────┐
│ HEADER  (48 px tall)                 │  always
├──────────────────────────────────────┤
│ LIVE STRIP                           │  Home + Missions
├──────────────────────────────────────┤
│ BODY (scrollable)                    │
│                                      │
├──────────────────────────────────────┤
│ FOOTER (3 stat tiles)                │  Home + Missions
└──────────────────────────────────────┘
```

The **header** has two modes:
- **Home mode:** logo · MaxxToken (sans 13/700, "Token" in lime) · `BURN`
  pill · spacer · diamond btn · gear btn.
- **Subpage mode:** lime `‹ BACK` button · subpage label (mono, dim) · spacer
  · diamond btn · gear btn.

The button you came in through gets the active treatment: 1px lime border
(`rgba(182,255,60,0.40)`) + faint lime fill (`rgba(182,255,60,0.10)`). This is
how the user knows where they are.

---

## 3. The primitives

Documented in detail in `PRIMITIVES.md`. Names and roles:

| Primitive | Use |
| --- | --- |
| `BurnSegBar` | THE progress bar. 28 cells × 5px on every screen. Per-model sub-bars use 20 cells × 3px. |
| `BurnSparkline` | 56×14 polyline showing last 9 sync ticks per provider. |
| `BurnHeader` | The 48pt header described above. |
| `BurnLiveStrip` | Glowing-lime-dot + mono caption + right-aligned warn count. |
| `BurnFooter` | 3-tile stats strip (`SPENT` · `LEFT` · `SYNC`). |
| `BurnSwitch` | 32×18 hard-rect toggle, lime when on. |
| `BurnSectionHead` | Lime label + dim right-meta + bottom hairline. |
| `BurnSettingDropdown` | Mono dropdown pill with chevron. |
| `BurnCollapsibleHead` | Settings group head (NOTIFICATIONS / APP / UPDATES). |
| `BurnToggleRow` / `BurnDropdownRow` | Settings list rows. |

---

## 4. Screen 1 · Home

ASCII reference:

```
┌────────────────────────────────────────┐
│ ◆ MaxxToken  [BURN]      ◆ ⚙           │  header
├────────────────────────────────────────┤
│ ● LIVE · 5 STREAMS        1 BURNING    │  live strip
├────────────────────────────────────────┤
│ ⊕ ChatGPT  PRO 20× ╱╱╱  23%  ⌄         │  row, collapsed
│ ▰▰▰▰▰▰░░░░░░░░░░░░░░░░░░░░░░           │  segmented bar
│ 5H 4% · 7D 23%        RESET 01H 11M    │  caption
├────────────────────────────────────────┤
│ … one row per provider …               │
├────────────────────────────────────────┤
│ ⊘ Grok    BUILD   ╱╱   31%  ⌄          │  row, BURNING — tinted warn
│ ▰▰▰▰▰▰▰▰▰░░░░░░░░░░░░░░░░░░            │  warn cells
│ 5H 31% · 7D 31%       RESET 01H 09M    │
├────────────────────────────────────────┤
│ [SPENT $181] [LEFT $421] [SYNC 15m]    │  footer
└────────────────────────────────────────┘
```

### 4.1 Provider row · collapsed

Always visible. One row per detected provider. Whole row is clickable; the
chevron has its own click handler that stops propagation (same outcome —
toggle expanded — but tested independently).

**Top sub-row** (flex, gap 8, align center):
- 14px avatar (provider monogram — see `ICONS.md`)
- Name — sans 13 / 700 / `-0.1` letter-spacing
- Plan — mono 9.5 / 0.5 letter-spacing / uppercase / `text3 #5A5A5A`
- `flex:1` spacer
- Sparkline 56×14
- Used % — mono 15 / 700 / tabular-nums / right-aligned in a 36px min-width slot.
  Color: `text #F5F5F5` (`warn #FF6B5C` when burning).
- Chevron button — 22×22, `chevron-down` when collapsed, `chevron-up` when expanded.

**Then** the segmented bar (28 cells, full width).

**Then** a mono caption line, `text3` `#5A5A5A`:
- Left: `5H X% · 7D Y%`
- Right: `RESET XXh XXm` (uppercased)

### 4.2 Burning row treatment

When `provider.status === 'warn'`:
- Row background: `rgba(255,107,92,0.05)`
- Segmented-bar lit cells: `#FF6B5C` instead of `#B6FF3C`
- Sparkline stroke: `#FF6B5C`
- Used % number: `#FF6B5C`

Nothing else changes — no border, no glow.

### 4.3 Provider row · expanded (in place)

The collapsed row stays visible. Below it, separated by `1px dashed #1A1A1A`,
push open the detail panel:

```
SESSION · 5H                                     4 %
▰▰░░░░░░░░░░░░░░░░░░░░░░░░░░
                              RESETS IN 01H 11M

WEEKLY · 7D                                     23 %
▰▰▰▰▰▰▰░░░░░░░░░░░░░░░░░░░░░
                              RESETS IN 01H 11M

COST ───────────────────── estimated
Today          87M tokens          $83.40
Yesterday      234M tokens         $239.35
Last 30d       5.5B tokens         $4,889.28

TOKENS ───────────────── 22,557 events
[IN 2834M] [CACHED 2644M] [OUT 7.7M]

MODEL BURN ──────────────── 3 active
gpt-5            4280M tok  $3812.10   78%
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰░░░░
gpt-5-mini       980M tok    $870.40   18%
▰▰▰▰░░░░░░░░░░░░░░░░
o4-mini          226M tok    $206.78    4%
▰░░░░░░░░░░░░░░░░░░░
```

Padding: `4px 14px 14px` on the wrapper. Each child group separated by 14px
vertical gap.

Section heads (`BurnSectionHead`):
- Bottom border: `1px solid #1A1A1A`, 4px padding below.
- Left: lime label, mono 9.5 / 700 / `0.7` letter-spacing / uppercase.
- Right: dim mono, same size, no weight, uppercase. `text3 #5A5A5A`.

**Window bar block** (Session / Weekly):
- Label-row above: mono 9.5 / 0.7 letter-spacing left; mono 14 / 700 / `text`
  (or `warn` if burning) right, with the `%` glyph at 9 / `text3` next to it.
- Then `BurnSegBar` (28 cells).
- Then a right-aligned mono 9 / 0.5 caption: `RESETS IN XXh XXm` (uppercased).

**Cost row** (`BurnCostRow`):
- Grid `1fr auto auto`, gap 10, padding 5/0.
- Mono 11.5, tabular-nums.
- Column 1: label, `text2 #9A9A9A`.
- Column 2: `{tokens} tokens`, `text`.
- Column 3: `${amount.toFixed(2)}` — lime if > 0, else `—` in `text3`.

**Token cards** (`BurnStat` — IN / CACHED / OUT):
- Grid `1fr 1fr 1fr`, gap 6.
- Each card: `#000` bg, `#1A1A1A` border, `2px` radius, padding `7/9`.
- Label mono 8.5 / 0.6 / `text3`.
- Value mono 13 / 700 / tabular-nums / `text`, 3px top margin.

**Model row** (`BurnModelRow`):
- Top: mono 11 baseline row — model name (`text`, 600), `flex:1` spacer,
  `{tokens} tok` (`text2`), `${usd}` (lime if > 0 else `incl.` in `text3`,
  min-width 56, right-aligned), burn % (warn if burning else `text`, 600,
  min-width 32, right-aligned). 4px margin-bottom.
- Bottom: `BurnSegBar` with `cells=20 height=3 gap=2`.

### 4.4 Expand behavior

- Only **one** row expands at a time (the prototype enforces this; current
  request from product is to keep that behavior).
- Animate height 120ms ease.
- Chevron icon swaps `chevron-down` → `chevron-up`; do not animate rotation
  separately — the swap is enough.

---

## 5. Screen 2 · Missions

Opened by the diamond in the header.

```
┌────────────────────────────────────────┐
│ ‹ BACK · MISSIONS         ◆ ⚙          │  ◆ now active-bordered
├────────────────────────────────────────┤
│ ● UNUSED TOKENS · BURN THEM ON IDEAS   │
├────────────────────────────────────────┤
│ USE CLAUDE · 8% USED · $184 LEFT       │  context strip, lime tint
├────────────────────────────────────────┤
│ #1  Changelog Séance           ~120M   │
│ Point it at a repo and it narrates...  │
│ │ AI-built repos move fast and lose... │
│ ■ ■ ■   Node git parser + …  [Start →] │
├────────────────────────────────────────┤
│ #2  Ambient Status Orb         ~130M   │
│ …                                      │
└────────────────────────────────────────┘
```

### 5.1 Context strip

`padding: 10/14`, bottom hairline. Background `rgba(182,255,60,0.04)`. Mono
11 / 0.3 letter-spacing, color `lime`. Content: `USE {Provider} · X% USED ·
$Y LEFT TO BURN` — picks the provider with the most cap remaining (weighted
by burn-rate; see `DATA.md`).

### 5.2 Idea card (`BurnIdeaCard`)

Padding: `14/14/14`. Bottom hairline.

- **Row 1** (baseline, gap 8, margin-bottom 8): `#N` (mono 12 / 700 / 0.4
  / lime) · title (sans 14 / 700 / -0.2) · spacer · time est (mono 9 / 0.5
  / `text3` / uppercase).
- **Row 2** (margin-bottom 9): body — sans 12 / 1.55 line-height / `text2`.
- **Row 3** (margin-bottom 10): italic mono 11 / 1.55 / `text3` · `border-left:
  2px solid lime` · `padding-left: 8`.
- **Row 4** (flex, align center, gap 8):
  - Difficulty dots — three 6×6 squares (no radius), lit count = `m.difficulty`
    (1..3). Lit = lime, unlit = `#2E2E2E`.
  - Stack chip — mono 9.5 / 0.4 / `text3` / uppercase, `flex:1`, ellipsized.
  - `Start build →` button — `lime` bg, `bg` (`#000`) text, no border, `2px`
    radius, padding `7/12`, mono 10.5 / 700 / 0.5 / uppercase.

### 5.3 Footer caption

After last card, centered:
```
MORE IDEAS REFRESH EVERY 12H · OR SUBMIT ONE
```
`text3` `#5A5A5A` mono 10 / 0.5; "SUBMIT ONE" in lime, underlined.

---

## 6. Screen 3 · New Mission (Mission Setup)

Opened by `Start build →` on any idea card.

Three sections, each with a `BurnSectionHead`:

### 6.1 `FOLDER`
- Right meta: path if picked, else `NONE`.
- Body: a single `Pick folder` button — `surface` bg, `border` border, `2px`
  radius, mono 11 / 600 / 0.4 / uppercase, padding `8/12`. After pick, label
  shows `~/folder` and the border + text turn lime; a `CHANGE` link sits
  alongside in mono 10 / `text3`.

### 6.2 `MODELS`
- Right meta: `N SELECTED`.
- One `BurnModelCheck` row per provider:
  - Container: padding `9/10`, `2px` radius. When checked: bg
    `rgba(182,255,60,0.06)`, border `rgba(182,255,60,0.30)`. Otherwise bg
    `surface`, border `border`.
  - Inside: 14×14 square (lime when checked, with black check glyph; outline
    `borderHi` when unchecked) · provider avatar (13px) · NAME (mono 12 /
    700 / 0.3 / uppercase) · `plan · X%` (mono 9.5 / 0.4 / `text3` /
    uppercase) · spacer · action label (mono 9.5 / 0.5 / uppercase) —
    `AUTO-START` in lime if the provider has a cookie/API key, else
    `COPY PROMPT` in `text3`.

### 6.3 `GOAL`
- Right meta: `N CHAR` if any input, else `OPTIONAL`.
- Textarea: 100% × 78px, padding 10, bg `#000`, border `border`, `2px`
  radius, mono 11.5, resize vertical. Placeholder
  `Ship the smallest useful version of...`.

### 6.4 Footer (sticky)
- `BACK` · `COPY GOAL` · spacer · `Start mission →`.
- Ghost buttons: transparent bg, `border` border, `2px` radius, mono 10.5 /
  600 / 0.5 / uppercase, padding `8/12`, color `text2`.
- Primary (`Start mission →`): lime bg, black text, no border, `2px` radius,
  mono 11 / 700 / 0.6 / uppercase, padding `9/16`.

---

## 7. Screen 4 · Settings

Opened by the gear in any header.

```
┌────────────────────────────────────────┐
│ ‹ BACK · DETECTED PROVIDERS    ◆ ⚙     │  ⚙ now active-bordered
├────────────────────────────────────────┤
│ ╭────────────────────────────────────╮ │
│ │ PLAN VALUES STAY AUTOMATIC. USE    │ │   hint banner, lime tint
│ │ THE CONFIG FILE ONLY FOR OVERRIDES │ │
│ ╰────────────────────────────────────╯ │
│                                        │
│ ⋮⋮ ⊕ ChatGPT  PRO 20× · DETECTED       │
│            [WARN AUTO ⌄]  [● ON]       │
├────────────────────────────────────────┤
│ ⋮⋮ ◇ Cursor   PRO+ · DETECTED          │
│            [WARN AUTO ⌄]  [● ON]       │
│ Cookie: WorkosCursorSessionToken=...   │   inline cookie row
│                                [SAVE]  │
├────────────────────────────────────────┤
│ NOTIFICATIONS              4 ON   ⌄    │   collapsible group
│   Idea missions                  [●]   │
│   …                                    │
├────────────────────────────────────────┤
│ APP            DARK · VALUE LEFT  ⌄    │
├────────────────────────────────────────┤
│ UPDATES            v0.2.3-BETA.1  ⌄    │
├────────────────────────────────────────┤
│ REVEAL CONFIG  REVEAL LOG     [Save]   │
└────────────────────────────────────────┘
```

### 7.1 Hint banner
Margin 14, padding `9/11`, `2px` radius. Background
`rgba(182,255,60,0.05)`, border `rgba(182,255,60,0.20)`. Mono 10.5 / 0.3 /
1.55 line-height / `text2`. Content:
```
PLAN VALUES STAY AUTOMATIC. USE THE CONFIG FILE ONLY FOR OVERRIDES.
```

### 7.2 Provider row (`BurnProvSettingRow`)
- Container: `2px` radius, `border` border, bg `surface` when enabled,
  transparent and 55% opacity when disabled.
- Inside, padding `10/12`, flex gap 10:
  - drag handle (`list` icon, dim) ·
  - provider avatar (15px) ·
  - flex column: name (sans 13 / 700) + sub `plan · DETECTED` (mono 9.5 / 0.4
    / `text3` / uppercase) ·
  - `BurnSettingDropdown` value `WARN AUTO` ·
  - `BurnSwitch`.
- When the provider needs a cookie/API key (Cursor, Grok, OpenAI API) **and**
  is enabled, render an inline cookie row beneath the main row:
  - padding `0 12 12`, flex gap 6.
  - text input — `#000` bg, `border` border, `2px` radius, mono 10.5 / 0.2,
    padding `7/9`.
  - `SAVE` ghost button.

### 7.3 Collapsible group head (`BurnCollapsibleHead`)
Mono 11 / 700 / 0.6 button. Lime label · flex spacer · dim uppercase
right-meta · chevron-down/up.

When open, rows inside (`BurnToggleRow` / `BurnDropdownRow`):
- padding `9/11`, bottom hairline.
- left: sans 12.5 / `text` label.
- right: `BurnSwitch` (toggle row) or `BurnSettingDropdown` (dropdown row).

### 7.4 Settings footer
`REVEAL CONFIG` and `REVEAL LOG` as ghost text buttons (no border, `text3`).
Spacer. `Save` button = lime primary (same as `Start mission →`).

---

## 8. The progress bar (`BurnSegBar`) in detail

Used in 6 places: collapsed row (28×5), expanded SESSION (28×5), expanded
WEEKLY (28×5), each per-model row (20×3). Never used at any other dimensions.

```ts
type BurnSegBarProps = {
  pct: number;        // 0..100
  burning?: boolean;  // swaps lime → warn-red
  cells?: number;     // default 28; 20 for sub-bars
  height?: number;    // default 5px; 3px for sub-bars
  gap?: number;       // default 2px
};
```

- Render: `cells` evenly-spaced `<rect>`s with `flex: 1` and the given gap.
- Lit count: `Math.round(pct * cells / 100)`.
- Lit color: `lime` (`#B6FF3C`) — or `warn` (`#FF6B5C`) when `burning`.
- Unlit color: `#2E2E2E` (`text4`).
- No radius on cells. No animation.

This is the single bar everywhere — **no other progress component exists**.

---

## 9. Animation rules

| What | Easing | Duration |
| --- | --- | --- |
| Row expand / collapse | ease | 120ms |
| Switch knob slide | ease | 120ms |
| Live-strip dot glow | static — no animation | — |
| Everything else | (nothing) | — |

No count-up numbers. No progress shimmer. No pulsing. The system feels still
and authoritative; the **only** motion is direct response to a click.

---

## 10. Acceptance checklist

Repeat in your PR description.

- [ ] All four screens implemented: Home, Missions, New Mission, Settings.
- [ ] One `BurnSegBar` component used everywhere a bar appears.
- [ ] Burning state changes color in exactly three places: bar cells,
      sparkline, used-% number.
- [ ] Header is identical across screens; only the diamond / gear get the
      active border on the page they opened.
- [ ] Footer (`SPENT · LEFT · SYNC`) shows on Home + Missions only.
- [ ] Mono used for timestamps, %, $, token counts, captions, button labels;
      sans for titles and body copy.
- [ ] Settings: drag-reorder, switch state persists, cookie save works.
- [ ] Missions list scrolls; cards are flat (no nested cards).
- [ ] Diamond → Missions, Gear → Settings, BACK → Home, on every screen.
- [ ] Row expand: only one open at a time, 120ms ease.
