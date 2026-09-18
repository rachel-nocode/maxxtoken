/* BURN design system — tokens + tiny render helpers.
   Classic script. Globals (BURN, BURN_FONT, bstyle, burnEsc) are shared
   by-name with the other burn/*.js scripts and renderer.js. */

// Two palettes, identical shape. `lime`/`warn` are FILL colors (bar cells,
// button bg, live dot, glyph fills). `limeText`/`warnText` are the TEXT
// variants — in dark they equal the fill, in light they deepen so they stay
// readable on paper. Overlay tokens hold the low-opacity accent washes (CSS
// can't derive these).
const BURN_DARK = {
  bg: '#121212',
  surface: '#181818',
  surface2: '#222222',
  border: '#2B2B2B',
  borderHi: '#373737',
  text: '#F3F3F1',
  text2: '#A6A6A1',
  text3: '#72726E',
  text4: '#3A3A38',
  lime: '#B6FF3C',
  warn: '#FF6B5C',
  limeText: '#B6FF3C',
  warnText: '#FF6B5C',
  accentBtnBg: 'rgba(182,255,60,0.10)',
  accentBtnBorder: 'rgba(182,255,60,0.40)',
  accentWashBg: 'rgba(182,255,60,0.05)',
  accentWashBorder: 'rgba(182,255,60,0.20)',
  warnRowBg: 'rgba(255,107,92,0.08)',
  shadow: '0 12px 30px rgba(0,0,0,0.22)',
}

const BURN_LIGHT = {
  bg: '#F5F4F0',
  surface: '#FCFBF8',
  surface2: '#ECEAE4',
  border: '#D8D4CA',
  borderHi: '#C2BCAF',
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
  shadow: '0 10px 28px rgba(38,34,25,0.08)',
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
