/* BURN design system — tokens + tiny render helpers.
   Classic script. Globals (BURN, BURN_FONT, bstyle, burnEsc) are shared
   by-name with the other burn/*.js scripts and renderer.js. */

// Two palettes, identical shape. `lime`/`warn` are FILL colors (bar cells,
// button bg, live dot, glyph fills). `limeText`/`warnText` are the TEXT
// variants — in dark they equal the fill, in light they deepen so they stay
// readable on paper. Overlay tokens hold the low-opacity accent washes (CSS
// can't derive these).
const BURN_DARK = {
  bg: '#000000',
  surface: '#0B0B0B',
  surface2: '#131313',
  border: '#1A1A1A',
  borderHi: '#252525',
  text: '#F5F5F5',
  text2: '#9A9A9A',
  text3: '#5A5A5A',
  text4: '#2E2E2E',
  lime: '#B6FF3C',
  warn: '#FF6B5C',
  limeText: '#B6FF3C',
  warnText: '#FF6B5C',
  accentBtnBg: 'rgba(182,255,60,0.10)',
  accentBtnBorder: 'rgba(182,255,60,0.40)',
  accentWashBg: 'rgba(182,255,60,0.05)',
  accentWashBorder: 'rgba(182,255,60,0.20)',
  warnRowBg: 'rgba(255,107,92,0.05)',
}

const BURN_LIGHT = {
  bg: '#FAFAF5',
  surface: '#F1EEE4',
  surface2: '#EAE6DA',
  border: '#CEC7B2',
  borderHi: '#A69D88',
  text: '#1A1815',
  text2: '#5A554B',
  text3: '#8E887C',
  text4: '#CFC8B4',
  // Single muted accent: fill and text share ONE exact green so every green
  // element matches. #557F0F clears ~4.5:1 on the paper bg (AA-readable) yet
  // reads calm, not the bright lime that washes out on light.
  lime: '#557F0F',
  warn: '#E84A30',
  limeText: '#557F0F',
  warnText: '#B5301B',
  accentBtnBg: 'rgba(85,127,15,0.12)',
  accentBtnBorder: 'rgba(85,127,15,0.45)',
  accentWashBg: 'rgba(85,127,15,0.07)',
  accentWashBorder: 'rgba(85,127,15,0.25)',
  warnRowBg: 'rgba(220,60,34,0.06)',
}

// Live palette read by-name across burn/*.js. Mutated in place by
// applyBurnTheme so existing references stay valid (no structural change).
const BURN = { ...BURN_DARK }

function applyBurnTheme(light) {
  Object.assign(BURN, light ? BURN_LIGHT : BURN_DARK)
}

// Single-quote the family names: these strings land inside double-quoted
// style="..." attributes, so double quotes here would terminate the attribute.
const BURN_FONT = {
  sans: "'Geist', system-ui, sans-serif",
  mono: "'Geist Mono', 'JetBrains Mono', ui-monospace, monospace",
}

// React keeps these numeric style values unitless; everything else gets px.
const BURN_UNITLESS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'order', 'opacity', 'zIndex',
  'fontWeight', 'lineHeight',
])

function burnKebab(prop) {
  return prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
}

// Convert a React-style object into an inline style string. Numbers become px
// unless the prop is in BURN_UNITLESS. Skips null/undefined/false values.
function bstyle(obj) {
  let out = ''
  for (const key in obj) {
    const v = obj[key]
    if (v == null || v === false) continue
    const val = typeof v === 'number' && !BURN_UNITLESS.has(key) ? `${v}px` : v
    out += `${burnKebab(key)}:${val};`
  }
  return out
}

function burnEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
