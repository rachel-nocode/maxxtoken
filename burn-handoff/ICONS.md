# ICONS — SVG path data

Every icon is monochrome, single-color, 1.4px stroke, square caps, miter
joins, no fills (unless noted). The reference component in
`reference/mocks.jsx` is `Icon({ name, size, color })`.

Drop these into an `<Icon>` switch that takes `name` and applies a shared
stroke from a single `{ fill: 'none', stroke: color, strokeWidth: 1.4,
strokeLinecap: 'square', strokeLinejoin: 'miter' }` props object.

All icons are drawn on a 14×14 viewBox unless noted.

## Chrome icons

### `chevron-down`
```html
<svg viewBox="0 0 14 14"><polyline points="3.5,5.5 7,9 10.5,5.5" /></svg>
```

### `chevron-up`
```html
<svg viewBox="0 0 14 14"><polyline points="3.5,8.5 7,5 10.5,8.5" /></svg>
```

### `chevron-right`
```html
<svg viewBox="0 0 14 14"><polyline points="5.5,3.5 9,7 5.5,10.5" /></svg>
```

### `refresh`
```html
<svg viewBox="0 0 14 14">
  <path d="M11.5 6.5 A4.5 4.5 0 1 0 11 9.5" />
  <polyline points="11.5,3.5 11.5,6.5 8.5,6.5" />
</svg>
```

### `settings` (cog)
```html
<svg viewBox="0 0 14 14">
  <circle cx="7" cy="7" r="2" />
  <line x1="7"    y1="0.5"  x2="7"    y2="2.5" />
  <line x1="7"    y1="11.5" x2="7"    y2="13.5" />
  <line x1="0.5"  y1="7"    x2="2.5"  y2="7"   />
  <line x1="11.5" y1="7"    x2="13.5" y2="7"   />
  <line x1="2.4"  y1="2.4"  x2="3.8"  y2="3.8" />
  <line x1="10.2" y1="10.2" x2="11.6" y2="11.6" />
  <line x1="11.6" y1="2.4"  x2="10.2" y2="3.8" />
  <line x1="3.8"  y1="10.2" x2="2.4"  y2="11.6" />
</svg>
```

### `pulse` (ECG spike)
```html
<svg viewBox="0 0 14 14"><polyline points="0.5,7 3,7 4.5,3 7,11 8.5,7 13.5,7" /></svg>
```

### `list` (three horizontal lines — used as drag handle too)
```html
<svg viewBox="0 0 14 14">
  <line x1="2" y1="3.5"  x2="12" y2="3.5"  />
  <line x1="2" y1="7"    x2="12" y2="7"    />
  <line x1="2" y1="10.5" x2="12" y2="10.5" />
</svg>
```

### `expand` (four corner brackets)
```html
<svg viewBox="0 0 14 14">
  <polyline points="2,5.5 2,2 5.5,2" />
  <polyline points="8.5,2 12,2 12,5.5" />
  <polyline points="12,8.5 12,12 8.5,12" />
  <polyline points="5.5,12 2,12 2,8.5" />
</svg>
```

### `plus`
```html
<svg viewBox="0 0 14 14">
  <line x1="7"   y1="2.5" x2="7"    y2="11.5" />
  <line x1="2.5" y1="7"   x2="11.5" y2="7"    />
</svg>
```

### `arrow-up-right`
```html
<svg viewBox="0 0 14 14">
  <line x1="3" y1="11" x2="11" y2="3" />
  <polyline points="5,3 11,3 11,9" />
</svg>
```

### `diamond` (outline — when used as an icon, not the lime button glyph)
```html
<svg viewBox="0 0 14 14"><polygon points="7,1.5 12.5,7 7,12.5 1.5,7" /></svg>
```

## Brand glyphs

### Wordmark spark (11×11, fill: lime)
The little tile next to "MaxxToken" in the header.
```html
<svg viewBox="0 0 14 14">
  <polygon points="7,1.4 8.2,5.4 12.2,7 8.2,8.6 7,12.6 5.8,8.6 1.8,7 5.8,5.4" fill="#B6FF3C" />
</svg>
```
Wrapper: 22×22 square tile, `surface` bg, `border` border, 3px radius.

### Diamond button glyph (11×11, fill: lime)
```html
<svg viewBox="0 0 14 14">
  <polygon points="7,1.5 12.5,7 7,12.5 1.5,7" fill="#B6FF3C" />
</svg>
```

## Provider monograms (`ProvGlyph` — 20×20 viewBox)

### `chatgpt`
```html
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
  <circle cx="10" cy="10" r="6.4" />
  <path d="M10 3.6V10l5 2.5" />
</svg>
```

### `claude` (8 rays around a center dot, filled)
```html
<svg viewBox="0 0 20 20" fill="currentColor">
  <!-- 8 lines around center -->
  <line x1="13" y1="10" x2="18" y2="10"   stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  <line x1="12.12" y1="12.12" x2="15.66" y2="15.66" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  <line x1="10" y1="13" x2="10" y2="18"   stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  <line x1="7.88" y1="12.12" x2="4.34" y2="15.66" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  <line x1="7" y1="10" x2="2" y2="10"     stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  <line x1="7.88" y1="7.88" x2="4.34" y2="4.34"  stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  <line x1="10" y1="7" x2="10" y2="2"     stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  <line x1="12.12" y1="7.88" x2="15.66" y2="4.34" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  <circle cx="10" cy="10" r="1.4" />
</svg>
```
(Or generate programmatically — see `reference/variations.jsx` for the loop.)

### `cursor` (cube-ish)
```html
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4">
  <path d="M10 2.5L17 6v7l-7 3.5L3 13V6z" />
  <path d="M3 6l7 3.5L17 6" />
  <path d="M10 9.5v7" />
</svg>
```

### `kimi` (mono "K" glyph)
```html
<span style="font-family: Geist Mono; font-weight: 700; font-size: 0.78em">K</span>
```
Center inside a `size × size` box; color = `currentColor`.

### `grok` (slashed circle)
```html
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
  <circle cx="10" cy="10" r="7" />
  <line x1="5" y1="5" x2="15" y2="15" />
</svg>
```

### Settings-only icons not on the row

For `openai` (no monogram in the prototype) — render a placeholder mono
glyph, e.g. `OAI` in mono 9 / 700.

## Difficulty squares

Three 6×6 hard rectangles, no radius, gap 3, lit = `BURN.lime`, unlit =
`BURN.text4` (`#2E2E2E`). Drawn as plain `<span>`s, not an icon.

## Live dot

Not an icon — a CSS-only span:
```css
.burn-live-dot {
  width: 6px; height: 6px; border-radius: 6px;
  background: #B6FF3C;
  box-shadow: 0 0 6px #B6FF3C;
}
```

## Checkbox tick

Inside the 14×14 model-select checkbox when checked:
```html
<svg viewBox="0 0 10 10" fill="none" stroke="#000" stroke-width="2">
  <polyline points="1.5,5 4,7.5 8.5,2.5" />
</svg>
```
