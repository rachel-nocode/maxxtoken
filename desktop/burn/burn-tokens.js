/* BURN design system — tokens + tiny render helpers.
   Classic script. Globals (BURN, BURN_FONT, bstyle, burnEsc) are shared
   by-name with the other burn/*.js scripts and renderer.js. */

const BURN = {
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
  limeDim: '#88BE2E',
  warn: '#FF6B5C',
  warnDim: '#9A3E36',
  radius: 6,
}

const BURN_FONT = {
  sans: '"Geist", system-ui, sans-serif',
  mono: '"Geist Mono", "JetBrains Mono", ui-monospace, monospace',
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
