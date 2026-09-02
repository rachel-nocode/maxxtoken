// `maxxtoken` — btop-style terminal view of the same usage the menubar app
// shows. Data comes from, in order of preference:
//   api   — the running MaxxToken app's loopback API (live, includes keyed
//           providers because the app holds the keychain secrets)
//   live  — aggregate.snapshot() in-process (plain Node; CLI-auth providers
//           such as Claude / Codex / Kimi / Gemini / Cursor work without keys)
//   cache — ~/.maxxtoken/widget-snapshot.json written by the app
// The render layer is pure (tui-render.js); this file owns I/O and the loop.

const { loadConfig } = require('./config')
const { fetchWithTimeout } = require('./http')
const widgetSnapshot = require('./widget-snapshot')
const { renderFrame } = require('./tui-render')

const SOURCES = new Set(['auto', 'api', 'live', 'cache'])
const API_TIMEOUT_MS = 1500
const DEFAULT_INTERVAL_S = { api: 10, live: 60, cache: 15 }

const ANSI = {
  altOn: '\x1b[?1049h',
  altOff: '\x1b[?1049l',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  home: '\x1b[H',
  clear: '\x1b[2J',
  eraseBelow: '\x1b[J',
}

function usage() {
  return [
    'Usage:',
    '  maxxtoken [options]',
    '',
    'Live terminal dashboard of your AI plan usage — the menubar app, in ASCII.',
    '',
    'Options:',
    '  --once             Print one frame and exit (default when stdout is not a TTY)',
    '  --json             Print the snapshot as JSON and exit',
    '  --source <name>    auto | api | live | cache   (default: auto)',
    '  --file <path>      Render a saved widget snapshot (implies --source cache)',
    '  --interval <sec>   Data refresh interval (default: api 10s, live 60s)',
    '  --port <n>         MaxxToken local API port (default: config localApiPort / 7878)',
    '  --left             Show % left instead of % used (default: app setting)',
    '  --ascii            Plain ASCII glyphs (no box drawing / block characters)',
    '  --unicode          Force box drawing / block glyphs (auto-detected from locale)',
    '  --no-color         Disable colors (also honours NO_COLOR)',
    '  --color            Force colors even when stdout is not a TTY',
    '  -h, --help         Show this help',
    '',
    'Keys:  q quit   r refresh   u toggle used/left   j/k ↑/↓ scroll   g/G top/bottom',
  ].join('\n')
}

function parseArgs(argv) {
  const options = {
    once: false,
    json: false,
    source: 'auto',
    file: null,
    interval: null,
    port: null,
    mode: null,
    ascii: null,
    color: null,
    help: false,
  }
  const args = [...argv]
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    const next = () => {
      if (args[i + 1] == null) throw new Error(`Pass a value after ${arg}.`)
      i += 1
      return args[i]
    }
    if (arg === '--once') options.once = true
    else if (arg === '--json') options.json = true
    else if (arg === '--source') {
      options.source = String(next()).toLowerCase()
      if (!SOURCES.has(options.source)) throw new Error(`Unknown source: ${options.source} (use auto, api, live or cache)`)
    } else if (arg === '--file') {
      options.file = next()
      options.source = 'cache'
    } else if (arg === '--interval') {
      options.interval = Number(next())
      if (!Number.isFinite(options.interval) || options.interval < 1) throw new Error('--interval must be a number of seconds >= 1.')
    } else if (arg === '--port') {
      options.port = Number(next())
      if (!Number.isInteger(options.port) || options.port <= 0) throw new Error('--port must be a positive integer.')
    } else if (arg === '--left') options.mode = 'left'
    else if (arg === '--used') options.mode = 'used'
    else if (arg === '--ascii') options.ascii = true
    else if (arg === '--unicode') options.ascii = false
    else if (arg === '--no-color') options.color = false
    else if (arg === '--color') options.color = true
    else if (arg === '-h' || arg === '--help' || arg === 'help') options.help = true
    else throw new Error(`Unknown option: ${arg}`)
  }
  return options
}

function detectAscii(env = process.env) {
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || ''
  if (locale && !/utf-?8/i.test(locale)) return true
  return env.TERM === 'linux' || env.TERM === 'dumb'
}

function detectColor(env = process.env, isTTY = true) {
  if (env.NO_COLOR) return false
  if (env.FORCE_COLOR && env.FORCE_COLOR !== '0') return true
  if (!isTTY) return false
  return env.TERM !== 'dumb'
}

async function fetchApiSnapshot(port) {
  let res
  try {
    res = await fetchWithTimeout(`http://127.0.0.1:${port}/v1/usage`, { headers: { Accept: 'application/json' } }, API_TIMEOUT_MS)
  } catch (err) {
    const reason = err && err.name === 'AbortError' ? 'timed out' : 'not running'
    throw new Error(`MaxxToken app ${reason} on 127.0.0.1:${port}`)
  }
  if (res.status === 503) throw new Error('app is starting — no snapshot yet')
  if (!res.ok) throw new Error(`local API responded ${res.status}`)
  const body = await res.json()
  if (!body || !Array.isArray(body.providers)) throw new Error('local API returned an unexpected payload')
  return body
}

let aggregateModule = null
async function fetchLiveSnapshot(heavy, aggregate = null) {
  // Lazy: aggregate pulls in every adapter; skip the cost when the API answers.
  if (!aggregate && !aggregateModule) aggregateModule = require('./aggregate')
  return (aggregate || aggregateModule).snapshot({ heavy, persistHistory: false })
}

function readCache(file) {
  const snap = widgetSnapshot.readWidgetSnapshot(file || widgetSnapshot.FILE)
  if (!snap) throw new Error(`no cached snapshot at ${file || widgetSnapshot.FILE}`)
  return { ...snap, cached: true }
}

// Resolve one snapshot for the requested source. In auto mode: api → live,
// with cache as the last resort. Returns { snapshot, source }.
async function loadSnapshot(options, state) {
  const port = options.port || state.port
  const attempts = options.source === 'auto' ? ['api', 'live', 'cache'] : [options.source]
  const errors = []
  for (const source of attempts) {
    try {
      if (source === 'api') return { snapshot: await fetchApiSnapshot(port), source: 'app' }
      if (source === 'live') {
        const snapshot = await fetchLiveSnapshot(state.liveHeavy !== false)
        state.liveHeavy = false
        return { snapshot, source: 'live' }
      }
      return { snapshot: readCache(options.file), source: 'cache' }
    } catch (err) {
      errors.push(`${source}: ${err && err.message ? err.message : String(err)}`)
    }
  }
  throw new Error(errors.join(' | '))
}

function terminalSize(stream, env = process.env) {
  return {
    cols: Number(stream && stream.columns) || Number(env.COLUMNS) || 80,
    rows: Number(stream && stream.rows) || 0,
  }
}

function resolvePort(options, config = loadConfig()) {
  return options.port || config.localApiPort || 7878
}

async function runOnce(options, io, renderOptions) {
  const state = { port: resolvePort(options), liveHeavy: true }
  const { snapshot, source } = await loadSnapshot(options, state)
  if (options.json) {
    io.stdout.write(`${JSON.stringify({ source, ...snapshot }, null, 2)}\n`)
    return 0
  }
  const { text } = renderFrame(snapshot, { cols: terminalSize(io.stdout).cols, rows: 0 }, { ...renderOptions, source })
  io.stdout.write(`${text}\n`)
  return 0
}

function runInteractive(options, io, renderOptions) {
  const stdout = io.stdout
  const stdin = io.stdin
  const state = {
    port: resolvePort(options),
    liveHeavy: true,
    snapshot: null,
    source: '',
    scroll: 0,
    mode: renderOptions.mode,
    status: 'syncing…',
    statusTone: 'muted',
    refreshing: false,
    nextRefreshAt: 0,
    contentLines: 0,
  }
  let tick = null
  let done = false
  let resolveExit = null
  const exit = new Promise((resolve) => { resolveExit = resolve })

  function intervalMs() {
    if (options.interval) return options.interval * 1000
    const key = state.source === 'app' ? 'api' : state.source === 'live' ? 'live' : 'cache'
    return DEFAULT_INTERVAL_S[key] * 1000
  }

  function draw() {
    if (done) return
    const size = terminalSize(stdout)
    const secs = state.nextRefreshAt ? Math.max(0, Math.round((state.nextRefreshAt - Date.now()) / 1000)) : null
    const statusLine = state.refreshing
      ? state.status
      : `${state.status}${secs != null ? ` · next in ${secs}s` : ''}`
    const frame = renderFrame(state.snapshot || { providers: [] }, size, {
      ...renderOptions,
      mode: state.mode,
      source: state.source,
      scroll: state.scroll,
      statusLine,
      statusTone: state.statusTone,
    })
    state.scroll = frame.scroll
    state.contentLines = frame.contentLines
    stdout.write(`${ANSI.home}${frame.text}${ANSI.eraseBelow}`)
  }

  async function refresh() {
    if (state.refreshing || done) return
    state.refreshing = true
    state.status = state.snapshot ? 'refreshing…' : 'syncing…'
    state.statusTone = 'muted'
    draw()
    try {
      const { snapshot, source } = await loadSnapshot(options, state)
      state.snapshot = snapshot
      state.source = source
      state.status = source === 'cache' ? 'showing cached snapshot — open the app for live data' : 'up to date'
      state.statusTone = source === 'cache' ? 'yellow' : 'muted'
    } catch (err) {
      state.status = `refresh failed: ${err && err.message ? err.message : String(err)}`
      state.statusTone = 'red'
    } finally {
      state.refreshing = false
      state.nextRefreshAt = Date.now() + intervalMs()
      draw()
    }
  }

  function onKey(chunk) {
    const key = String(chunk)
    if (key === 'q' || key === 'Q' || key === '\x03' || key === '\x1b') return finish()
    if (key === 'r' || key === 'R') return refresh()
    if (key === 'u' || key === 'U') {
      state.mode = state.mode === 'left' ? 'used' : 'left'
      return draw()
    }
    if (key === 'j' || key === '\x1b[B') state.scroll += 1
    else if (key === 'k' || key === '\x1b[A') state.scroll -= 1
    else if (key === '\x1b[6~' || key === ' ') state.scroll += 10
    else if (key === '\x1b[5~') state.scroll -= 10
    else if (key === 'g') state.scroll = 0
    else if (key === 'G') state.scroll = state.contentLines
    else return
    state.scroll = Math.max(0, state.scroll)
    draw()
  }

  function finish() {
    if (done) return
    done = true
    clearInterval(tick)
    if (stdin && stdin.isTTY) {
      try { stdin.setRawMode(false) } catch { /* not a tty */ }
    }
    if (stdin) {
      stdin.off('data', onKey)
      try { stdin.pause() } catch { /* ignore */ }
    }
    stdout.off('resize', draw)
    stdout.write(`${ANSI.showCursor}${ANSI.altOff}`)
    resolveExit(0)
  }

  stdout.write(`${ANSI.altOn}${ANSI.hideCursor}${ANSI.clear}${ANSI.home}`)
  if (stdin) {
    if (stdin.isTTY) stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    stdin.on('data', onKey)
  }
  stdout.on('resize', draw)
  process.once('SIGINT', finish)
  process.once('SIGTERM', finish)

  // Paint whatever the cache has immediately, then go get real data.
  try {
    state.snapshot = readCache(options.file)
    state.source = 'cache'
  } catch { /* nothing cached yet */ }
  draw()
  refresh()
  tick = setInterval(() => {
    if (!state.refreshing && state.nextRefreshAt && Date.now() >= state.nextRefreshAt) refresh()
    else draw()
  }, 1000)

  return exit
}

async function run(argv = [], io = {}) {
  const stdout = io.stdout || process.stdout
  const stderr = io.stderr || process.stderr
  const stdin = io.stdin === undefined ? process.stdin : io.stdin
  const env = io.env || process.env

  let options
  try {
    options = parseArgs(argv)
  } catch (err) {
    stderr.write(`${err.message || String(err)}\n\n${usage()}\n`)
    return 1
  }
  if (options.help) {
    stdout.write(`${usage()}\n`)
    return 0
  }

  const isTTY = stdout.isTTY === true
  const renderOptions = {
    color: options.color != null ? options.color : detectColor(env, isTTY),
    ascii: options.ascii != null ? options.ascii : detectAscii(env),
    mode: options.mode || (loadConfig().usageMeterMode === 'left' ? 'left' : 'used'),
  }

  try {
    if (options.json || options.once || !isTTY) return await runOnce(options, { stdout, stderr }, renderOptions)
    return await runInteractive(options, { stdout, stderr, stdin }, renderOptions)
  } catch (err) {
    stderr.write(`${err.message || String(err)}\n`)
    return 1
  }
}

function main(argv = process.argv.slice(2)) {
  // Explicit exit: live snapshots can leave adapter timers/sockets open and
  // would otherwise keep the shell waiting.
  run(argv).then((code) => process.exit(code))
}

module.exports = {
  run,
  main,
  usage,
  parseArgs,
  detectAscii,
  detectColor,
  _private: { loadSnapshot, fetchApiSnapshot, fetchLiveSnapshot, readCache, terminalSize, resolvePort, ANSI },
}
