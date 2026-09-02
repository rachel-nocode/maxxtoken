// Terminal renderer for `maxxtoken`. Pure: (snapshot, viewport, options) → frame
// string. No I/O, no timers, so it is unit-testable and the CLI loop stays
// thin. Mirrors the menubar app's collapsed rows (name · plan · % · reset) and
// expanded per-window bars, drawn btop-style with box-drawing + block glyphs.

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'

// 256-color palette tuned to match the BURN UI (lime fill, warm/hot/max tones).
const PALETTE = {
  lime: 118,
  green: 78,
  yellow: 220,
  orange: 208,
  red: 196,
  text: 252,
  muted: 244,
  faint: 240,
  frame: 238,
  accent: 213,
  cyan: 81,
}

const GLYPHS = {
  unicode: {
    tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│',
    fill: '█', empty: '░', partial: ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'],
    spark: ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'],
    dot: '●', ring: '○', bolt: '⚡', warn: '▲', arrow: '›', bullet: '·',
  },
  ascii: {
    tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|',
    fill: '#', empty: '.', partial: ['', '', '', '', '', '', '', ''],
    spark: ['_', '.', ':', '-', '=', '+', '*', '#'],
    dot: '*', ring: 'o', bolt: '!', warn: '^', arrow: '>', bullet: '-',
  },
}

const LOGO = [
  '█▀▄▀█ ▄▀█ ▀▄▀ ▀▄▀ ▀█▀ █▀█ █▄▀ █▀▀ █▄░█',
  '█░▀░█ █▀█ █░█ █░█ ░█░ █▄█ █░█ ██▄ █░▀█',
]
const LOGO_ASCII = [
  ' __  __    _    __  ____  ___ _____ ___  _  __ _____ _   _ ',
  '|  \\/  |  / \\   \\ \\/ /\\ \\/ /|_   _/ _ \\| |/ /| ____| \\ | |',
  '|_|  |_|/_/ \\_\\ /_/\\_\\/_/\\_\\  |_| \\___/|_|\\_\\|_____|_| \\_|',
]

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-9;]*m/g, '')
}

// Display width. Box-drawing / block glyphs used here are all single-width.
function width(text) {
  return stripAnsi(text).length
}

function makeStyler(color) {
  if (!color) {
    const id = (text) => String(text)
    return { paint: id, bold: id, dim: id, reset: '' }
  }
  return {
    paint: (text, name) => `\x1b[38;5;${PALETTE[name] ?? PALETTE.text}m${text}${RESET}`,
    bold: (text) => `${BOLD}${text}${RESET}`,
    dim: (text) => `${DIM}${text}${RESET}`,
    reset: RESET,
  }
}

function clampPct(value) {
  if (value == null || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.max(0, Math.min(100, num))
}

// Same thresholds as renderer.js usageTone(): <50 good, ≥50 warm, ≥75 hot, ≥90 max.
function toneForPct(usedPct) {
  if (usedPct == null) return 'muted'
  if (usedPct >= 90) return 'red'
  if (usedPct >= 75) return 'orange'
  if (usedPct >= 50) return 'yellow'
  return 'lime'
}

function toMs(value) {
  if (!value) return null
  const time = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function formatReset(resetAt, now) {
  const time = toMs(resetAt)
  if (time == null) return '—'
  const diff = time - now
  if (diff <= 0) return 'due'
  const totalMin = Math.floor(diff / 60000)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const mins = totalMin % 60
  if (days >= 1) return `${days}d ${String(hours).padStart(2, '0')}h`
  if (hours >= 1) return `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`
  const secs = Math.floor((diff % 60000) / 1000)
  return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
}

function formatSync(generatedAt, now) {
  const time = toMs(generatedAt)
  if (time == null) return '—'
  const secs = Math.max(0, Math.round((now - time) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function money(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  if (Math.abs(num) < 100) return `$${num.toFixed(2)}`
  return `$${Math.round(num).toLocaleString('en-US')}`
}

function tokens(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return '—'
  if (num >= 1e9) return `${trim(num / 1e9)}B`
  if (num >= 1e6) return `${trim(num / 1e6)}M`
  if (num >= 1e3) return `${trim(num / 1e3)}K`
  return String(Math.round(num))
}

function trim(value) {
  return Number(value.toFixed(1)).toLocaleString('en-US')
}

function pctText(pct) {
  return pct == null ? '—' : `${Math.round(pct)}%`
}

// Bar with 1/8-cell precision (btop style) when unicode is available.
function bar(pct, cells, glyphs, style, toneName) {
  const size = Math.max(1, cells)
  if (pct == null) return style.paint(glyphs.empty.repeat(size), 'faint')
  const exact = (clampPct(pct) / 100) * size
  let full = Math.floor(exact)
  let eighths = Math.round((exact - full) * 8)
  if (eighths === 8) {
    full += 1
    eighths = 0
  }
  let filled = glyphs.fill.repeat(Math.min(full, size))
  if (full < size && eighths > 0 && glyphs.partial[eighths]) filled += glyphs.partial[eighths]
  const rest = Math.max(0, size - filled.length)
  return style.paint(filled, toneName) + style.paint(glyphs.empty.repeat(rest), 'faint')
}

function sparkline(series, glyphs, style, cells) {
  if (cells <= 0) return ''
  const points = (Array.isArray(series) ? series : []).map((p) => clampPct(p?.usedPct ?? p)).filter((p) => p != null)
  if (points.length < 2) return ''
  return points
    .slice(-cells)
    .map((p) => style.paint(glyphs.spark[Math.min(7, Math.floor((p / 100) * 7.999))], toneForPct(p)))
    .join('')
}

function padRight(text, size) {
  const gap = size - width(text)
  return gap > 0 ? text + ' '.repeat(gap) : text
}

function padLeft(text, size) {
  const gap = size - width(text)
  return gap > 0 ? ' '.repeat(gap) + text : text
}

function truncate(text, size) {
  const plain = String(text)
  if (size <= 0) return ''
  if (plain.length <= size) return plain
  if (size <= 1) return plain.slice(0, size)
  return `${plain.slice(0, size - 1)}…`
}

// Clip visible content to `size` cells; ANSI sequences don't count.
function clip(text, size, style) {
  let out = ''
  let visible = 0
  let i = 0
  const str = String(text)
  while (i < str.length && visible < size) {
    if (str[i] === '\x1b') {
      const end = str.indexOf('m', i)
      if (end === -1) break
      out += str.slice(i, end + 1)
      i = end + 1
      continue
    }
    out += str[i]
    visible += 1
    i += 1
  }
  return { text: out + style.reset, visible }
}

// Clip and pad to exactly `size` cells.
function fitLine(text, size, style) {
  const clipped = clip(text, size, style)
  return clipped.text + ' '.repeat(Math.max(0, size - clipped.visible))
}

// Box with a btop-style inline title: ╭─ title ──── right ─╮
function box(lines, cols, glyphs, style, opts = {}) {
  const inner = Math.max(4, cols - 2)
  const title = opts.title ? ` ${opts.title} ` : ''
  let right = opts.right ? ` ${opts.right} ` : ''
  if (width(title) + width(right) + 2 > inner) right = ''
  const mid = Math.max(0, inner - 2 - width(title) - width(right))
  const top =
    style.paint(glyphs.tl + glyphs.h, 'frame') +
    title +
    style.paint(glyphs.h.repeat(mid), 'frame') +
    right +
    style.paint(glyphs.h + glyphs.tr, 'frame')
  const side = style.paint(glyphs.v, 'frame')
  const body = lines.map((line) => `${side}${fitLine(` ${line}`, inner, style)}${side}`)
  const bottom = style.paint(glyphs.bl + glyphs.h.repeat(inner) + glyphs.br, 'frame')
  return [fitLine(top, cols, style), ...body, bottom]
}

// Windows shown for a provider — same selection as burn-adapt: session + weekly
// (+ agent credit) when present, Cursor's numeric windows, else first window.
function displayWindows(provider) {
  const windows = Array.isArray(provider?.windows) ? provider.windows.filter(Boolean) : []
  if (provider?.id === 'cursor') {
    const numeric = windows.filter((w) => clampPct(w.usedPct) != null).slice(0, 3)
    if (numeric.length) return numeric
  }
  const session = windows.find((w) => w.kind === '5h' || String(w.label || '').toLowerCase() === 'session')
  const weekly = windows.find((w) => w !== session && w.kind !== 'cycle' && w.kind !== 'agent-sdk-credit')
  const credit = windows.find((w) => w.kind === 'agent-sdk-credit')
  const primary = [session, weekly, credit].filter(Boolean)
  if (primary.length) return primary
  return windows.slice(0, 1)
}

function windowLabel(window) {
  const kind = String(window?.kind || '').toLowerCase()
  const label = String(window?.label || window?.kind || 'Window').toUpperCase()
  if (kind === '5h') return 'SESSION 5H'
  if (kind === '7d') return label.includes('7D') ? label : `${label} 7D`
  return label
}

function meterPct(window, mode) {
  const used = clampPct(window?.usedPct)
  if (mode === 'left') {
    const explicit = clampPct(window?.remainingPct)
    if (explicit != null) return explicit
    return used == null ? null : 100 - used
  }
  return used
}

function soonestReset(provider, windows) {
  const times = [...windows.map((w) => w.resetAt), provider.resetAt].map(toMs).filter((t) => t != null)
  return times.length ? Math.min(...times) : null
}

function providerStatusGlyph(provider, glyphs, style) {
  if (provider.connected === false) return style.paint(glyphs.ring, provider.needsKey ? 'faint' : 'muted')
  if (provider.urgent) return style.paint(glyphs.warn, 'red')
  if (provider.activity === 'live') return style.paint(glyphs.dot, 'lime')
  if (provider.activity === 'stale') return style.paint(glyphs.dot, 'yellow')
  return style.paint(glyphs.dot, 'green')
}

const RESET_COL = 16
const VALUE_COL = 5

function providerPanel(provider, cols, ctx) {
  const { glyphs, style, now, mode } = ctx
  const inner = cols - 4
  const windows = displayWindows(provider)
  const lines = []

  if (provider.connected === false) {
    const reason = provider.error
      || (provider.needsKey ? 'needs key — connect it in the MaxxToken app' : 'not connected — sign in with its CLI or open the MaxxToken app')
    lines.push(style.paint(truncate(reason, inner), 'muted'))
    return box(lines, cols, glyphs, style, {
      title: `${providerStatusGlyph(provider, glyphs, style)} ${style.dim(provider.name || provider.id)}`,
      right: style.paint('OFFLINE', 'faint'),
    })
  }

  const used = clampPct(provider.capturedPct)
  const left = clampPct(provider.remainingPct) ?? (used == null ? null : 100 - used)
  const headlineText = mode === 'left' ? `${pctText(left)} LEFT` : `${pctText(used)} USED`
  const spentLeft = provider.spentValue != null && provider.leftValue != null
    ? `${money(provider.spentValue)} spent ${glyphs.bullet} ${money(provider.leftValue)} left`
    : ''
  const reset = soonestReset(provider, windows)
  const resetText = reset ? `${glyphs.bolt} ${formatReset(reset, now)}` : ''
  const spark = sparkline(windows[0]?.historySeries, glyphs, style, Math.min(12, inner - 44))

  const headline = style.bold(style.paint(headlineText, toneForPct(used)))
  const rightPart = [spark, resetText ? style.paint(resetText, reset - now < 3600000 ? 'orange' : 'muted') : '']
    .filter(Boolean)
    .join('  ')
  // Drop the spend detail, then the right side, rather than let them collide.
  let leftPart = spentLeft ? `${headline}  ${style.paint(spentLeft, 'muted')}` : headline
  if (width(leftPart) + width(rightPart) + 2 > inner) leftPart = headline
  const right = width(leftPart) + width(rightPart) + 2 > inner ? '' : rightPart
  lines.push(padRight(leftPart, Math.max(0, inner - width(right))) + right)

  const compact = inner < 64
  const resetCol = compact ? 8 : RESET_COL
  const labelWidth = Math.min(compact ? 10 : 14, Math.max(8, ...windows.map((w) => windowLabel(w).length)))
  const valueOf = (window) => (window.valueLabel ? String(window.valueLabel).toUpperCase() : pctText(meterPct(window, mode)))
  const valueWidth = Math.max(VALUE_COL, ...windows.map((w) => valueOf(w).length))
  const barCells = inner - labelWidth - 1 - valueWidth - 2 - resetCol
  for (const window of windows) {
    const pct = meterPct(window, mode)
    const tone = toneForPct(clampPct(window.usedPct))
    const resetLabel = window.resetAt ? `${compact ? '' : 'resets '}${formatReset(window.resetAt, now)}` : ''
    lines.push(
      `${style.paint(padRight(truncate(windowLabel(window), labelWidth), labelWidth), 'text')} ` +
      `${bar(pct, barCells, glyphs, style, tone)} ` +
      `${style.paint(padLeft(valueOf(window), valueWidth), tone)}  ` +
      style.paint(padRight(resetLabel, resetCol), 'muted'),
    )
    if (ctx.showPace && window.pace?.leftLabel) {
      const paceTone = window.pace.tone === 'hot' || window.pace.willLastToReset === false ? 'orange' : 'faint'
      lines.push(`${' '.repeat(labelWidth + 1)}${style.paint(truncate(String(window.pace.leftLabel), inner - labelWidth - 1), paceTone)}`)
    }
  }

  const usage = provider.tokenUsage
  if (usage && Number(usage.total) > 0) {
    const models = (usage.topModels || usage.modelBreakdowns || [])
      .slice(0, 2)
      .map((m) => m.model || m.modelName)
      .filter(Boolean)
    const cost = Number(usage.costUSD) > 0 ? ` ${glyphs.bullet} ${money(usage.costUSD)} est` : ''
    const modelText = models.length ? ` ${glyphs.bullet} ${models.join(', ')}` : ''
    lines.push(style.paint(truncate(`tokens ${tokens(usage.total)}${cost}${modelText}`, inner), 'faint'))
  }

  const plan = provider.plan ? ` ${style.paint(String(provider.plan), 'muted')}` : ''
  return box(lines, cols, glyphs, style, {
    title: `${providerStatusGlyph(provider, glyphs, style)} ${style.bold(provider.name || provider.id)}${plan}`,
    right: provider.sourceLabel ? style.paint(truncate(provider.sourceLabel, 24), 'faint') : '',
  })
}

function header(snapshot, cols, ctx) {
  const { glyphs, style, now, source } = ctx
  const logo = ctx.ascii ? LOGO_ASCII : LOGO
  const cycle = snapshot?.cycle || {}
  const daysLeft = Number(cycle.daysLeft)
  const cycleText = `${cycle.label || 'Current cycle'}${Number.isFinite(daysLeft) ? ` ${glyphs.bullet} ${Math.round(daysLeft)}d left` : ''}`
  const meta = [
    `sync ${formatSync(snapshot?.generatedAt, now)}`,
    source ? `via ${source}` : '',
    snapshot?.cached ? 'cached' : '',
  ]
    .filter(Boolean)
    .join(`  ${glyphs.bullet}  `)

  const lines = []
  if (cols >= logo[0].length + 2) {
    for (const row of logo) lines.push(` ${style.paint(row, 'lime')}`)
  } else {
    lines.push(` ${style.bold(style.paint('MAXXTOKEN', 'lime'))}`)
  }
  const leftText = ` ${style.paint(cycleText, 'text')}`
  if (width(leftText) + width(meta) + 2 <= cols) {
    lines.push(padRight(leftText, Math.max(0, cols - 1 - width(meta))) + style.paint(meta, 'faint'))
  } else {
    lines.push(leftText, ` ${style.paint(meta, 'faint')}`)
  }
  return lines
}

function totalsPanel(snapshot, cols, ctx) {
  const { glyphs, style, mode } = ctx
  const totals = snapshot?.totals || {}
  const inner = cols - 4
  const used = clampPct(totals.capturedPct)
  const shown = mode === 'left' ? (used == null ? null : 100 - used) : used
  const value = `${pctText(shown)} ${mode === 'left' ? 'LEFT' : 'USED'}`
  const count = totals.planCount ?? (snapshot?.providers || []).filter((p) => p.connected).length
  const stats =
    `${style.paint('SPENT', 'faint')} ${style.paint(money(totals.spent), 'lime')}   ` +
    `${style.paint('LEFT', 'faint')} ${style.paint(money(totals.left), 'orange')}   ` +
    style.paint(`${count} plan${count === 1 ? '' : 's'}`, 'muted')
  const lines = [
    `${bar(shown, Math.max(8, inner - width(value) - 2), glyphs, style, toneForPct(used))}  ${style.bold(style.paint(value, toneForPct(used)))}`,
    stats,
  ]
  const tokenTotals = totals.tokens || {}
  if (Number(tokenTotals.total) > 0) {
    const cost = Number(tokenTotals.costUSD) > 0 ? ` ${glyphs.bullet} ${money(tokenTotals.costUSD)} est. cost` : ''
    lines.push(style.paint(`token burn ${tokens(tokenTotals.total)}${cost} ${glyphs.bullet} ${tokenTotals.providerCount || 0} sources`, 'faint'))
  }
  const verdict = snapshot?.rating?.verdict
  return box(lines, cols, glyphs, style, {
    title: style.bold('TOTAL'),
    right: verdict ? style.paint(truncate(verdict, 40), 'accent') : '',
  })
}

function footer(cols, ctx) {
  const { style, glyphs } = ctx
  const keys = [
    ['q', 'quit'],
    ['r', 'refresh'],
    ['u', ctx.mode === 'left' ? 'show used' : 'show left'],
    ['j/k', 'scroll'],
  ]
  const text = ` ${keys
    .map(([k, v]) => `${style.bold(style.paint(k, 'cyan'))} ${style.paint(v, 'faint')}`)
    .join(`  ${style.paint(glyphs.bullet, 'frame')}  `)}`
  const status = ctx.statusLine
    ? style.paint(truncate(ctx.statusLine, Math.max(0, cols - width(text) - 2)), ctx.statusTone || 'muted') + ' '
    : ''
  return padRight(text, Math.max(0, cols - width(status))) + status
}

function emptyPanel(message, cols, ctx) {
  return box([ctx.style.paint(message, 'muted')], cols, ctx.glyphs, ctx.style, { title: ctx.style.bold('PROVIDERS') })
}

// Render a full frame. viewport: { cols, rows } (rows 0 = unbounded).
// options: { color, ascii, mode ('used'|'left'), now, source, scroll,
//            statusLine, statusTone, showPace }.
function renderFrame(snapshot, viewport = {}, options = {}) {
  const cols = Math.max(40, Number(viewport.cols) || 80)
  const rows = Number(viewport.rows) || 0
  const ascii = options.ascii === true
  const glyphs = ascii ? GLYPHS.ascii : GLYPHS.unicode
  const style = makeStyler(options.color !== false)
  const ctx = {
    glyphs,
    style,
    ascii,
    now: options.now || Date.now(),
    mode: options.mode === 'left' ? 'left' : 'used',
    source: options.source || '',
    statusLine: options.statusLine || '',
    statusTone: options.statusTone,
    showPace: options.showPace !== false,
  }

  const head = header(snapshot, cols, ctx)
  const totals = totalsPanel(snapshot, cols, ctx)
  const providers = Array.isArray(snapshot?.providers) ? snapshot.providers : []
  // Keep the app's configured order; disconnected providers sink to the bottom.
  const ordered = [...providers].sort((a, b) => Number(b.connected !== false) - Number(a.connected !== false))
  const panels = ordered.length
    ? ordered.flatMap((p) => providerPanel(p, cols, ctx))
    : emptyPanel('No providers yet. Enable some in the MaxxToken app or with `maxxtoken-config providers`.', cols, ctx)

  const foot = footer(cols, ctx)
  let body = panels
  let scroll = 0
  if (rows > 0) {
    const room = Math.max(1, rows - head.length - totals.length - 1)
    const maxScroll = Math.max(0, panels.length - room)
    scroll = Math.max(0, Math.min(Number(options.scroll) || 0, maxScroll))
    body = panels.slice(scroll, scroll + room)
    if (maxScroll > 0) {
      const marker = style.paint(` ${glyphs.arrow} ${scroll + body.length}/${panels.length} `, 'faint')
      body[body.length - 1] = fitLine(body[body.length - 1], cols - width(marker), style) + marker
    }
    while (body.length < room) body.push('')
  }

  return {
    text: [...head, ...totals, ...body, foot].map((line) => fitLine(line, cols, style)).join('\n'),
    scroll,
    contentLines: panels.length,
  }
}

module.exports = {
  renderFrame,
  stripAnsi,
  _private: {
    bar,
    sparkline,
    toneForPct,
    formatReset,
    formatSync,
    money,
    tokens,
    displayWindows,
    windowLabel,
    meterPct,
    box,
    fitLine,
    clip,
    makeStyler,
    GLYPHS,
  },
}
