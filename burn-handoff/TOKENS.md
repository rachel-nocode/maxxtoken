# TOKENS — palette, type, spacing

Drop these constants verbatim into your codebase. Names are stable across
files — every other doc references them by name.

## Color

```ts
export const BURN = {
  // canvas
  bg:        '#000000',  // window body
  surface:   '#0B0B0B',  // header/footer/raised
  surface2:  '#131313',  // hover/secondary raised

  // strokes
  border:    '#1A1A1A',  // internal rules and most borders
  borderHi:  '#252525',  // outer window border, occasional emphasis

  // text
  text:      '#F5F5F5',  // body / values
  text2:     '#9A9A9A',  // labels
  text3:     '#5A5A5A',  // captions, dim meta
  text4:     '#2E2E2E',  // unlit segments / disabled

  // accents
  lime:      '#B6FF3C',  // primary accent
  limeDim:   '#88BE2E',
  warn:      '#FF6B5C',  // burning-fast only
  warnDim:   '#9A3E36',
};
```

### Where each color goes

| Color | Where |
| --- | --- |
| `bg #000` | Window body, BurnStat tile bg, textarea bg, cookie input bg |
| `surface #0B0B0B` | Header strip, footer strip, live strip, settings card bg |
| `surface2 #131313` | (rare) — hover surface |
| `border #1A1A1A` | Almost every border + internal hairline rule |
| `borderHi #252525` | The outer window border |
| `text #F5F5F5` | Names, values, body |
| `text2 #9A9A9A` | Labels, secondary copy |
| `text3 #5A5A5A` | Captions, plan tier, dim meta, "RESET …" lines |
| `text4 #2E2E2E` | Unlit cells in BurnSegBar, unlit difficulty squares |
| `lime #B6FF3C` | Lit cells, used-% (default), section heads, primary buttons, the "Token" in the wordmark, the live dot |
| `warn #FF6B5C` | Burning-fast: lit cells, sparkline, used-%, LEFT footer tile |

### Accent overlays (opacity-blended lime/warn)

| Use | Value |
| --- | --- |
| Active header button bg | `rgba(182,255,60,0.10)` |
| Active header button border | `rgba(182,255,60,0.40)` |
| Mission context strip bg | `rgba(182,255,60,0.04)` |
| Burning row bg | `rgba(255,107,92,0.05)` |
| Settings hint banner bg | `rgba(182,255,60,0.05)` |
| Settings hint banner border | `rgba(182,255,60,0.20)` |
| Model-checkbox checked bg | `rgba(182,255,60,0.06)` |
| Model-checkbox checked border | `rgba(182,255,60,0.30)` |

## Radius

```ts
export const RADIUS = {
  window: 6,   // outer window
  inner:  2,   // every interior surface (cards, buttons, switches, inputs)
};
```

No element uses anything other than 6 or 2. Pill chrome is forbidden.

## Type

```ts
export const FONT = {
  sans: '"Geist", system-ui, sans-serif',
  mono: '"Geist Mono", "JetBrains Mono", monospace',
};
```

**Mono is for:** timestamps, percentages, token counts, dollar amounts,
captions, button labels, plan tiers, all uppercase eyebrows.

**Sans is for:** provider names, mission titles, body copy, settings labels.

### Type scale (used sizes only)

| Size / weight / letter-spacing | Use |
| --- | --- |
| sans 14 / 700 / -0.2 | Mission card title |
| sans 13 / 700 / -0.1 | Provider name (row + settings) |
| sans 13 / 700 | Wordmark (`MaxxToken`) |
| sans 12.5 / normal | Settings row label |
| sans 12 / normal / 1.55 line-height | Mission card body |
| mono 15 / 700 / -0.3 | Used-% on collapsed row |
| mono 14 / 700 | Expanded window-bar % |
| mono 13 / 700 | BurnStat value, footer tile value |
| mono 12 / 700 / 0.3 | MODEL NAME in mission-setup checkbox |
| mono 12 / 700 / 0.4 | Mission `#N` |
| mono 11.5 | Cost row, GOAL textarea |
| mono 11 / 0.3 | Mission context strip, model row line |
| mono 11 / 700 / 0.6 | Settings collapsible head, Save button |
| mono 10.5 / 700 / 0.5 | `Start build →` button |
| mono 10.5 / 600 / 0.5 | Ghost buttons (BACK, COPY GOAL) |
| mono 10.5 / 0.3 / 1.55 line-height | Settings hint banner |
| mono 10 / 0.5 | "MORE IDEAS REFRESH …" footer caption, BurnLiveStrip |
| mono 9.5 / 0.7 | Section head label/right |
| mono 9.5 / 0.5 | Plan tier on rows, mission stack chip |
| mono 9 / 0.5 | Caption line below bar, mission time est |
| mono 8.5 / 0.6 | Footer tile label, BurnStat label |

## Spacing

```ts
export const SPACE = {
  page:    14,  // window-level padding (left/right + most vertical gaps)
  group:   14,  // gap between sections inside the expanded row
  row:    8..11, // padding-block of list rows
  tile:    6,   // gap between footer tiles, between BurnStat tiles
};
```

## Borders / dividers

- Internal divider: `1px solid #1A1A1A`.
- Section head bottom: `1px solid #1A1A1A` + `padding-bottom: 4`.
- Expanded-row separator: `1px dashed #1A1A1A` (only place where dashed is used).
- Header bottom: `1px solid #1A1A1A`.
- Footer top: `1px solid #1A1A1A`.

## Tabular numerals

Every mono number that lives in a column or aligns vertically:
```css
font-variant-numeric: tabular-nums;
```

Applies to: used-%, costs, token counts, $-values, reset countdowns, model-burn %.
