# PRIMITIVES — the shared components

Every UI atom is on this page. If a screen seems to need something that
isn't here, ask before building it — chances are an existing primitive
covers it.

The canonical implementation of each is in `reference/burn-system.jsx`.

---

## `BurnSegBar` — the only progress bar

```ts
type BurnSegBarProps = {
  pct: number;        // 0..100, clamped
  burning?: boolean;  // swaps lime → warn-red on lit cells
  cells?: number;     // default 28; use 20 for per-model sub-bars
  height?: number;    // default 5px; use 3px for per-model sub-bars
  gap?: number;       // default 2px
};
```

Render: a flex row of `cells` rectangles, each `flex: 1`, separated by `gap`.
Each rect is `height` tall. Lit (`i < round(pct * cells / 100)`): `lime` or
`warn`. Unlit: `text4` `#2E2E2E`. **No radius. No animation.**

### Sizes in use

| Context | cells | height | gap |
| --- | --- | --- | --- |
| Collapsed provider row | 28 | 5 | 2 |
| Expanded SESSION bar | 28 | 5 | 2 |
| Expanded WEEKLY bar | 28 | 5 | 2 |
| Model burn sub-bar | 20 | 3 | 2 |

---

## `BurnSparkline`

```ts
type BurnSparklineProps = {
  data: number[];           // 9 values typical
  color: string;            // BURN.lime or BURN.warn
  width?: number;           // 60 default; 56 in use
  height?: number;          // 14
  strokeWidth?: number;     // 1.2
};
```

SVG `<polyline>` normalized to `max(...data, 1)`. `stroke-linecap: square`,
`stroke-linejoin: miter`, no fill. Each provider has its own 9-tick history
(see `DATA.md`).

---

## `BurnHeader`

```ts
type BurnHeaderProps = {
  // Home mode
  title?: string;              // 'BURN' default
  onDiamond?: () => void;
  onSettings?: () => void;
  diamondActive?: boolean;     // true on Missions
  settingsActive?: boolean;    // true on Settings

  // Subpage mode (both required to enter subpage mode)
  onBack?: () => void;
  backLabel?: string;          // 'MISSIONS' / 'NEW MISSION' / 'DETECTED PROVIDERS'
};
```

48pt total height. Padding `11/14`. Bottom: `1px solid border`.

**Home mode left half:**
- 22×22 square tile, `surface` bg, `border` border, 3px radius.
- Inside, an 11×11 lime 8-point spark glyph (see `ICONS.md` → `spark`).
- Wordmark `Maxx` + `Token` (lime), sans 13 / 700 / -0.2.
- `BURN` pill: mono 9 / 0.8 / uppercase, padding `3/7`, `surface` bg,
  `border` border, 2px radius, `text3` color.

**Subpage mode left half:**
- `‹ BACK` button — `surface` bg, `border` border, 2px radius, padding `0/8`,
  gap 4, mono 12 / 600 / lime.
- ` · ` separator + back label in mono 10 / 0.8 / uppercase / `text3`.

**Right half (both modes):** spacer · diamond btn (`burnBtn`) · gear btn
(`burnBtn`).

### `burnBtn(active)`

```ts
function burnBtn(active: boolean) {
  return {
    width: 26, height: 26, borderRadius: 2,
    background: active ? 'rgba(182,255,60,0.10)' : '#0B0B0B',
    border: `1px solid ${active ? 'rgba(182,255,60,0.40)' : '#1A1A1A'}`,
    padding: 0,
    cursor: 'pointer',
    color: '#9A9A9A',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
}
```

Inside the diamond btn: an 11×11 lime filled diamond polygon. Inside the
gear btn: the `settings` icon at 13px, color `text2` (or `lime` when active).

---

## `BurnLiveStrip`

```ts
type BurnLiveStripProps = {
  streams?: number;     // for default label "LIVE · {streams} STREAMS"
  burning?: number;     // right-aligned warn count; hidden when 0
  label?: string;       // override left text entirely
};
```

Padding `8/14`. Background `surface`. Bottom `border` hairline.

Layout: glowing lime dot · label · `flex:1` · `{burning} BURNING` (warn).
- Dot: 6×6 round, `lime` bg, `box-shadow: 0 0 6px lime`.
- Label: mono 9.5 / 0.6 / uppercase / `text2`.
- Burning count: mono 9.5 / 0.6 / uppercase / `warn`.

Default labels:
- Home: `LIVE · 5 STREAMS`
- Missions: `UNUSED TOKENS · BURN THEM ON IDEAS`

---

## `BurnFooter`

```ts
type BurnFooterProps = {
  items?: { l: string; v: string; color: string }[];  // default 3 tiles
};
```

Padding 8. Top `border` hairline. Background `surface`. Children:
3 equal-flex tiles, gap 6.

Each tile (`BurnStat`-shape):
- `bg #000` bg.
- `border` border.
- 2px radius.
- padding `6/8`.
- column flex, gap 2.
- Label: mono 8.5 / 0.6 / `text3`.
- Value: mono 12 / 700 / tabular-nums / colored per item.

Default items:
```ts
[
  { l: 'SPENT', v: '$181', color: BURN.lime },
  { l: 'LEFT',  v: '$421', color: BURN.warn },
  { l: 'SYNC',  v: '15m',  color: BURN.text },
]
```

---

## `BurnSectionHead`

```ts
type BurnSectionHeadProps = {
  label: string;   // 'COST' / 'TOKENS' / 'MODEL BURN' / 'FOLDER' / 'MODELS' / 'GOAL'
  right?: string;  // dim right-meta, uppercased
};
```

Flex baseline. `border` bottom border. `padding-bottom: 4`. Mono 9.5 / 0.7.
- Left: `lime`, 600 weight.
- Right: `text3`, normal weight.

---

## `BurnStat`

```ts
type BurnStatProps = { label: string; value: string };
```

`bg #000` bg. `border` border. 2px radius. Padding `7/9`.
- Label: mono 8.5 / 0.6 / `text3`.
- Value: mono 13 / 700 / tabular-nums / `text`, 3px margin-top.

---

## `BurnSwitch`

```ts
type BurnSwitchProps = { on: boolean; onChange: () => void };
```

A 32×18 hard rectangle, no radius. `lime` when `on`, `text4` when off.
Knob: absolute, top 2, left `on ? 16 : 2`, 14×14, color `bg` (when on) or
`text2` (when off). **Square corners** — match the rest of the system.
Transition: `left 120ms ease`. No spring, no overshoot.

---

## `BurnSettingDropdown`

```ts
type BurnSettingDropdownProps = { value: string };
```

Mono pill: padding `5/8`, `bg #000` bg, `border` border, 2px radius. Mono
9.5 / 0.5 / `text2`. Inside: value · `chevron-down` icon at 9px / `text3`.

---

## `BurnCollapsibleHead`

```ts
type BurnCollapsibleHeadProps = {
  label: string;      // 'NOTIFICATIONS' / 'APP' / 'UPDATES'
  right?: string;     // '4 ON' / 'DARK · VALUE LEFT' / 'v0.2.3-BETA.1'
  open: boolean;
  onToggle: () => void;
};
```

Full-width button. Padding `9/11`. `surface` bg. `border` border. 2px radius.
Mono 11 / 700 / 0.6.
- Left: `lime` label.
- Spacer.
- Right meta: `text3`, normal weight, uppercase.
- Trailing: `chevron-up` or `chevron-down` at 11px / `text3`.

---

## `BurnToggleRow`

```ts
type BurnToggleRowProps = {
  label: string;
  on: boolean;
  onChange: () => void;
};
```

Padding `9/11`. Bottom `border` hairline.
- Left: sans 12.5 / `text` label, `flex:1`.
- Right: `BurnSwitch`.

---

## `BurnDropdownRow`

```ts
type BurnDropdownRowProps = { label: string; value: string };
```

Padding `9/11`. Bottom `border` hairline.
- Left: sans 12.5 / `text` label, `flex:1`.
- Right: `BurnSettingDropdown` with `value` uppercased.

---

## Window shell

```ts
function burnWindowStyle() {
  return {
    width: 400,
    height: 720,          // or remove for natural height; clamp scroll inside
    background: '#000',
    border: '1px solid #252525',
    borderRadius: 6,
    fontFamily: '"Geist", system-ui, sans-serif',
    color: '#F5F5F5',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    // popover shadow comes from macOS, not us
  };
}
```

The window contains, top → bottom: `BurnHeader` · `BurnLiveStrip` (or nothing
on form screens) · scrolling body · `BurnFooter` (on list screens only).

---

## What's NOT a primitive (deliberately)

- No `<Card>` — surfaces are defined inline by `surface` bg + `border`.
- No `<Button>` — three flavors are inlined: primary (lime), ghost (border
  outline), text-only (no border, `text3`). They're rare enough that
  factoring is overkill.
- No "Tag" or "Pill" component — the few label-shaped things (BURN pill,
  WARN AUTO dropdown, time est, plan tier) are each one-offs.
