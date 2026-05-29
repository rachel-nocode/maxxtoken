/* BURN icons — SVG path data from ICONS.md. Classic script.
   burnIcon(name, size, color) → stroked chrome icons (14×14 viewBox).
   burnProvGlyph(id, size, color) → provider monograms (20×20 viewBox). */

const BURN_ICON_PATHS = {
  'chevron-down': '<polyline points="3.5,5.5 7,9 10.5,5.5" />',
  'chevron-up': '<polyline points="3.5,8.5 7,5 10.5,8.5" />',
  'chevron-right': '<polyline points="5.5,3.5 9,7 5.5,10.5" />',
  refresh: '<path d="M11.5 6.5 A4.5 4.5 0 1 0 11 9.5" /><polyline points="11.5,3.5 11.5,6.5 8.5,6.5" />',
  // Proper toothed gear (Feather "settings", 24×24 viewBox — see BURN_ICON_META).
  settings:
    '<circle cx="12" cy="12" r="3" />' +
    '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />',
  pulse: '<polyline points="0.5,7 3,7 4.5,3 7,11 8.5,7 13.5,7" />',
  list:
    '<line x1="2" y1="3.5" x2="12" y2="3.5" />' +
    '<line x1="2" y1="7" x2="12" y2="7" />' +
    '<line x1="2" y1="10.5" x2="12" y2="10.5" />',
  expand:
    '<polyline points="2,5.5 2,2 5.5,2" />' +
    '<polyline points="8.5,2 12,2 12,5.5" />' +
    '<polyline points="12,8.5 12,12 8.5,12" />' +
    '<polyline points="5.5,12 2,12 2,8.5" />',
  plus: '<line x1="7" y1="2.5" x2="7" y2="11.5" /><line x1="2.5" y1="7" x2="11.5" y2="7" />',
  'arrow-up-right': '<line x1="3" y1="11" x2="11" y2="3" /><polyline points="5,3 11,3 11,9" />',
  diamond: '<polygon points="7,1.5 12.5,7 7,12.5 1.5,7" />',
}

// Per-icon overrides (viewBox / stroke). Default: 14×14, 1.4 square/miter.
const BURN_ICON_META = {
  settings: { viewBox: '0 0 24 24', strokeWidth: 2, linecap: 'round', linejoin: 'round' },
}

function burnIcon(name, size = 14, color = 'currentColor') {
  const body = BURN_ICON_PATHS[name]
  if (!body) return ''
  const meta = BURN_ICON_META[name] || {}
  const viewBox = meta.viewBox || '0 0 14 14'
  const sw = meta.strokeWidth || 1.4
  const cap = meta.linecap || 'square'
  const join = meta.linejoin || 'miter'
  return (
    `<svg width="${size}" height="${size}" viewBox="${viewBox}" ` +
    `fill="none" stroke="${color}" stroke-width="${sw}" ` +
    `stroke-linecap="${cap}" stroke-linejoin="${join}" aria-hidden="true">${body}</svg>`
  )
}

// Brand app-icon mark for the home header. Mirrors the menu-bar treatment:
// the white receipt glyph in dark mode, the full-color app icon in light mode.
function burnBrandMark(size = 20) {
  const light = !!(typeof burnState !== 'undefined' && burnState.app && burnState.app.lightMode)
  const src = light ? 'assets/icon.png' : 'assets/tray/receipt-menubar-white.png'
  return (
    `<img src="${src}" alt="MaxxToken" style="${bstyle({
      width: size,
      height: size,
      objectFit: 'contain',
      display: 'block',
      flex: '0 0 auto',
    })}" />`
  )
}

function burnDiamondGlyph(size = 11) {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 14 14" aria-hidden="true">` +
    `<polygon points="7,1.5 12.5,7 7,12.5 1.5,7" fill="${BURN.lime}" /></svg>`
  )
}

// Checkbox tick (10×10 viewBox), used inside the model-select checkbox.
function burnCheckTick(color = BURN.bg) {
  return (
    `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="${color}" ` +
    `stroke-width="2" aria-hidden="true"><polyline points="1.5,5 4,7.5 8.5,2.5" /></svg>`
  )
}

// Real brand logos live in assets/providers/*.svg. We render them as a CSS
// mask filled with a single color → monochrome, regardless of source colors.
// Curated map (incl. aliases the snapshot may use); falls back to the legacy
// PROVIDER_ICON map, then to a mono letter.
const BURN_PROV_ICON = {
  // codex.svg is the OpenAI flower on transparent bg → masks to a clean
  // silhouette. openai.svg is a filled badge (would mask to a solid square).
  chatgpt: 'codex.svg',
  openai: 'codex.svg',
  codex: 'codex.svg',
  gpt: 'codex.svg',
  claude: 'claude.svg',
  anthropic: 'claude.svg',
  cursor: 'cursor.svg',
  grok: 'grok.svg',
  xai: 'grok.svg',
  kimi: 'kimi.svg',
  kimik2: 'kimi.svg',
  moonshot: 'kimi.svg',
  gemini: 'gemini.svg',
  google: 'gemini.svg',
  copilot: 'copilot.svg',
  deepseek: 'deepseek.svg',
  mistral: 'mistral.svg',
  perplexity: 'perplexity.svg',
  windsurf: 'windsurf.svg',
  groq: 'groq.svg',
}

function burnProvIconFile(id) {
  if (BURN_PROV_ICON[id]) return BURN_PROV_ICON[id]
  if (typeof PROVIDER_ICON !== 'undefined' && PROVIDER_ICON[id]) return PROVIDER_ICON[id]
  return null
}

function burnProvGlyph(id, size = 14, color = BURN.text) {
  const file = burnProvIconFile(id)
  if (file) {
    const url = `assets/providers/${file}`
    return `<span aria-hidden="true" style="${bstyle({
      width: size,
      height: size,
      flex: '0 0 auto',
      display: 'inline-block',
      background: color,
      WebkitMask: `url(${url}) center / contain no-repeat`,
      mask: `url(${url}) center / contain no-repeat`,
    })}"></span>`
  }
  // No asset → mono letter fallback.
  return (
    `<span style="${bstyle({
      width: size,
      height: size,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: '0 0 auto',
    })}"><span style="${bstyle({ fontFamily: BURN_FONT.mono, fontWeight: 700, fontSize: size * 0.7, color, lineHeight: 1 })}">${burnEsc((id || '?')[0].toUpperCase())}</span></span>`
  )
}
