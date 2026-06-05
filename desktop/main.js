const { app, Tray, BrowserWindow, Menu, nativeImage, ipcMain, shell, dialog, screen, clipboard, Notification } = require('electron')
const { autoUpdater } = require('electron-updater')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { fork } = require('child_process')
const { loadConfig, saveConfig, FILE } = require('./lib/config')
const { generateIdeas, generateBurnIdeas, recordIdeaFeedback } = require('./lib/ideas')
const { scanBacklogMissions, backlogPrompt } = require('./lib/backlog')
const { openBuild } = require('./lib/launch')
const { setKey, hasKey, allKeys } = require('./lib/secrets')
const browserKeysStore = require('./lib/browser-keys-store')
const { requestDeviceCode, pollForToken } = require('./lib/copilot-auth')
const maxxAlerts = require('./lib/maxx-alerts')
const quotaNotifications = require('./lib/quota-notifications')
const providerDetection = require('./lib/provider-detection')
const providerLinks = require('./lib/provider-links')
const { canonicalProviderId } = require('./lib/provider-ids')
const widgetSnapshot = require('./lib/widget-snapshot')
const { trayTitleFromSnapshot } = require('./lib/tray-title')
const { buildUsageExport } = require('./lib/usage-export')
const { estimateMissionPreflight } = require('./lib/preflight-estimate')
const { scanContextBloat } = require('./lib/context-bloat-fixer')
const { buildFlowCheckpoint, normalizeFlowCheckpoints, flowRecommendation } = require('./lib/flow-checkpoints')
const localApi = require('./lib/local-api')
const logger = require('./lib/logger')
logger.init(app.getPath('userData'))
process.on('uncaughtException', (err) => logger.error('main', 'uncaught exception', { error: err && err.stack ? err.stack : String(err) }))
process.on('unhandledRejection', (err) => logger.error('main', 'unhandled rejection', { error: err && err.stack ? err.stack : String(err) }))

// Provider id -> the CLI binary that spends that subscription.
const CLI_FOR = {
  claude: 'claude',
  codex: 'codex',
  cursor: 'cursor',
  copilot: 'copilot',
  windsurf: 'windsurf',
  kiro: 'kiro-cli',
  opencode: 'opencode',
  opencodego: 'opencodego',
  alibaba: 'alibaba-coding-plan',
  augment: 'auggie',
  warp: 'warp',
  elevenlabs: 'elevenlabs',
  kilo: 'kilo',
  kimi: 'kimi',
  moonshot: 'moonshot',
  kimik2: 'kimik2',
  doubao: 'doubao',
  gemini: 'gemini',
  grok: 'grok',
  amp: 'amp',
  codebuff: 'codebuff',
  commandcode: 'commandcode',
  crof: 'crof',
  venice: 'venice',
  stepfun: 'stepfun',
  llmproxy: 'llmproxy',
  ollama: 'ollama',
  abacus: 'abacusai',
  factory: 'factory',
  antigravity: 'antigravity',
  minimax: 'minimax',
  manus: 'manus',
  vertexai: 'vertexai',
  synthetic: 'synthetic',
  mimo: 'mimo',
  bedrock: 'bedrock',
  zai: 'zai',
  t3chat: 't3chat',
}

// Provider ids that authenticate via a user-pasted secret (API key, cookie header, etc.).
const KEY_PROVIDERS = new Set([
  'openai',
  'azureopenai',
  'cursor',
  'copilot',
  'windsurf',
  'opencode',
  'opencodego',
  'alibaba',
  'alibabatokenplan',
  'augment',
  'warp',
  'elevenlabs',
  'kilo',
  'openrouter',
  'grok',
  'groq',
  'perplexity',
  'mistral',
  'codebuff',
  'commandcode',
  'crof',
  'venice',
  'moonshot',
  'kimik2',
  'doubao',
  'deepseek',
  'deepgram',
  'stepfun',
  'llmproxy',
  'ollama',
  'abacus',
  'amp',
  'factory',
  'antigravity',
  'minimax',
  'manus',
  'vertexai',
  'synthetic',
  'mimo',
  'bedrock',
  'zai',
  't3chat',
])

let tray = null
let popover = null
let refreshTimer = null
let heavyRefreshTimer = null
let lastSnapshot = null
let snapshotInFlight = null
let snapshotInFlightCancel = null
const activeSnapshotWorkers = new Set()
const copilotLoginSessions = new Map()

const POPOVER_WIDTH = 420
const POPOVER_HEIGHT = 720
const POPOVER_COMPACT_HEIGHT = 610
// Light pull: rate-limit windows + balances. Cheap, runs often.
const REFRESH_INTERVAL_MS = 5 * 60 * 1000
// Heavy pull: also scans local token-history logs for cost data. Expensive, so
// it runs far less often (CodexBar uses the same 1-hour cadence for cost data).
const HEAVY_REFRESH_INTERVAL_MS = 60 * 60 * 1000
// On popover open we fire a live (light) pull, showing cache first. Throttle it
// so rapid toggling doesn't hammer provider APIs — cache is always shown.
const OPEN_REFRESH_THROTTLE_MS = 30 * 1000
const SNAPSHOT_WORKER_TIMEOUT_MS = 90 * 1000
const gotSingleInstanceLock = app.requestSingleInstanceLock()
const TRAY_BURN = {
  lime: '#B6FF3C',
  coral: '#FF6B5C',
  empty: '#2E2E2E',
  white: '#F5F5F5',
  black: '#000000',
}

function fullSnapshotFromWidgetCache(cache) {
  if (!cache || typeof cache !== 'object') return null
  const totals = cache.totals || {}
  const config = loadConfig()
  const cachedProviders = (cache.providers || []).map((provider) => ({
    ...provider,
    links: provider.links || providerLinks.linksForProvider(provider.id),
    monthly: provider.monthly ?? config.providers?.[provider.id]?.monthly ?? 0,
    windows: provider.windows?.length ? provider.windows : [provider.primaryWindow, provider.secondaryWindow].filter(Boolean),
    tokenUsage: provider.tokenUsage
      ? {
          ...provider.tokenUsage,
          modelBreakdowns: provider.tokenUsage.topModels || provider.tokenUsage.modelBreakdowns || [],
          dailyBreakdown: provider.tokenUsage.dailyUsage || provider.tokenUsage.dailyBreakdown || [],
        }
      : null,
  }))
  const cachedIds = new Set(cachedProviders.map((provider) => provider.id))
  const enabledIds = new Set([
    ...(cache.enabledProviderIds || []),
    ...Object.entries(config.providers || {}).filter(([, provider]) => provider.enabled).map(([id]) => id),
  ])
  for (const id of enabledIds) {
    if (cachedIds.has(id) || !config.providers?.[id]) continue
    const provider = config.providers[id]
    cachedProviders.push({
      id,
      name: provider.name,
      plan: provider.plan,
      monthly: provider.monthly,
      links: providerLinks.linksForProvider(id),
      connected: false,
      activity: 'none',
      capturedPct: null,
      remainingPct: null,
      spentValue: 0,
      leftValue: provider.monthly || 0,
      windows: [],
      tokenUsage: null,
      error: 'Waiting for scheduled refresh.',
    })
  }
  return {
    generatedAt: Date.parse(cache.generatedAt) || Date.now(),
    cycle: cache.cycle || { label: 'cached', daysLeft: 0, totalDays: 30 },
    totals: {
      ...totals,
      monthly: totals.totalValue ?? totals.monthly ?? 0,
      spent: totals.spent ?? totals.captured ?? 0,
      left: totals.left ?? totals.remaining ?? 0,
      capturedPct: totals.capturedPct ?? 0,
      planCount: totals.planCount ?? (cache.providers || []).length,
      resetQueue: cache.resetQueue || totals.resetQueue || [],
      history: cache.history || totals.history || null,
    },
    rating: cache.rating || { stars: 1, verdict: 'Cached snapshot. Refresh when ready.' },
    maxxTarget: cache.maxxTarget || null,
    providers: cachedProviders,
    enabledProviderIds: cache.enabledProviderIds || (cache.providers || []).map((provider) => provider.id),
    cached: true,
  }
}

function cachedSnapshot() {
  return fullSnapshotFromWidgetCache(widgetSnapshot.readWidgetSnapshot())
}

function setTraySnapshot(snap) {
  lastSnapshot = snap
  try {
    widgetSnapshot.saveWidgetSnapshot(snap)
  } catch {
    /* widget/automation snapshot is best-effort */
  }
  updateTrayAppearance(snap, loadConfig())
  maybePostMaxxAlert(snap)
  maybePostQuotaNotifications(snap)
}

let workerRequestId = 0

// Persisted browser "Safe Storage" keys, injected into each worker so it never
// re-prompts the macOS Keychain. Loaded once, kept in memory, updated whenever a
// worker reports a freshly-derived key (or a decline).
let browserKeysCache = null
function getBrowserKeys() {
  if (!browserKeysCache) browserKeysCache = browserKeysStore.loadAll()
  return browserKeysCache
}
function persistBrowserKeys(discovered) {
  if (!discovered || !Object.keys(discovered).length) return
  const merged = browserKeysStore.merge(getBrowserKeys(), discovered)
  browserKeysCache = merged
  browserKeysStore.saveAll(merged)
}

function snapshotViaWorker(heavy = true) {
  const requestId = ++workerRequestId
  const start = Date.now()
  logger.info('snapshot-worker', 'starting', { requestId, heavy })

  let cancel = null
  const promise = new Promise((resolve, reject) => {
    let timer = null
    const child = fork(path.join(__dirname, 'lib', 'snapshot-worker.js'), [], {
      env: {
        ...process.env,
        MAXXTOKEN_USER_DATA: app.getPath('userData'),
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    activeSnapshotWorkers.add(child)
    let settled = false
    child.stdout.on('data', (chunk) => logger.info('snapshot-worker', 'stdout', { text: String(chunk).trim().slice(0, 1000) }))
    child.stderr.on('data', (chunk) => logger.error('snapshot-worker', 'stderr', { text: String(chunk).trim().slice(0, 1000) }))
    const finish = (err, snap) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      try { child.kill() } catch {}
      activeSnapshotWorkers.delete(child)
      const ms = Date.now() - start
      if (err) {
        const log = err.cancelled ? logger.info : logger.error
        log('snapshot-worker', err.cancelled ? 'cancelled' : 'failed', { requestId, ms, error: err.message || String(err) })
        reject(err)
      } else {
        logger.info('snapshot-worker', 'done', { requestId, ms })
        resolve(snap)
      }
    }
    cancel = (reason = 'snapshot worker superseded') => {
      const err = new Error(reason)
      err.cancelled = true
      finish(err)
    }
    timer = setTimeout(() => {
      finish(new Error(`snapshot worker timed out after ${SNAPSHOT_WORKER_TIMEOUT_MS}ms`))
    }, SNAPSHOT_WORKER_TIMEOUT_MS)
    child.on('message', (message) => {
      if (!message || message.type !== 'snapshot-result' || message.requestId !== requestId) return
      persistBrowserKeys(message.browserKeys)
      if (message.ok) finish(null, message.snap)
      else finish(new Error(message.error || 'snapshot worker failed'))
    })
    child.on('error', (err) => finish(err))
    child.on('exit', (code, signal) => {
      activeSnapshotWorkers.delete(child)
      if (!settled) finish(new Error(`snapshot worker exited early (${signal || code})`))
    })
    child.send({ type: 'snapshot', requestId, heavy, secrets: allKeys(), browserKeys: getBrowserKeys() })
  })
  promise.cancel = (reason) => {
    if (cancel) cancel(reason)
  }
  return promise
}

function maybePostMaxxAlert(snap) {
  if (!app.isReady() || !Notification.isSupported()) return
  const config = loadConfig()
  if (!config.onboardingComplete || config.maxxAlertsEnabled === false) return
  const candidate = maxxAlerts.alertCandidateFromSnapshot(snap, Date.now(), {
    hoursBeforeReset: config.maxxAlertHours,
    minReservePct: config.maxxAlertReservePct,
    providers: config.providers,
  })
  if (!candidate || !maxxAlerts.recordAlert(candidate)) return
  const note = new Notification({
    title: candidate.title,
    body: candidate.body,
    silent: true,
  })
  note.on('click', () => showPopover())
  note.show()
}

function maybePostQuotaNotifications(snap) {
  if (!app.isReady() || !Notification.isSupported()) return
  const config = loadConfig()
  if (!config.onboardingComplete) return
  const events = quotaNotifications.evaluateSnapshot(snap, config)
  for (const event of events) {
    const note = new Notification({
      title: event.title,
      body: event.body,
      silent: true,
    })
    note.on('click', () => showPopover())
    note.show()
  }
}

function trayIcon() {
  const iconPath =
    process.platform === 'darwin'
      ? path.join(__dirname, 'assets', 'tray', 'iconTemplate.png')
      : path.join(__dirname, 'assets', 'icon.png')
  const image = nativeImage.createFromPath(iconPath)
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

function trayPctForProvider(provider, config) {
  const used = Number(provider?.capturedPct)
  const left = Number(provider?.remainingPct)
  if (config?.usageMeterMode === 'left') {
    if (Number.isFinite(left)) return Math.max(0, Math.min(100, left))
    if (Number.isFinite(used)) return Math.max(0, Math.min(100, 100 - used))
    return 100
  }
  if (Number.isFinite(used)) return Math.max(0, Math.min(100, used))
  if (Number.isFinite(left)) return Math.max(0, Math.min(100, 100 - left))
  return 0
}

function trayProviderWarning(provider, config) {
  const remaining = Number(provider?.remainingPct)
  const used = Number(provider?.capturedPct)
  const reserve = Number(config?.maxxAlertReservePct) || 25
  if (Number.isFinite(remaining) && remaining <= reserve) return true
  return Number.isFinite(used) && used >= 100 - reserve
}

function trayActiveProviders(snap, config) {
  const providers = Array.isArray(snap?.providers) ? snap.providers : []
  const byId = new Map(providers.filter((provider) => provider?.id).map((provider) => [provider.id, provider]))
  const snapshotEnabledIds = Array.isArray(snap?.enabledProviderIds) ? snap.enabledProviderIds : []
  const configuredIds = [
    ...(Array.isArray(config?.providerOrder) ? config.providerOrder : []),
    ...Object.keys(config?.providers || {}),
  ]
  const enabledIds = []
  const seen = new Set()
  for (const id of [...snapshotEnabledIds, ...configuredIds]) {
    if (seen.has(id)) continue
    seen.add(id)
    if (snapshotEnabledIds.includes(id) || config?.providers?.[id]?.enabled) enabledIds.push(id)
  }
  if (enabledIds.length) {
    return enabledIds.map((id) => byId.get(id) || {
      id,
      name: config?.providers?.[id]?.name || id,
      capturedPct: 0,
      remainingPct: 100,
      connected: false,
    })
  }
  const active = providers.filter((provider) => {
    if (!provider?.id) return false
    return provider.connected !== false || provider.capturedPct != null || provider.remainingPct != null
  })
  return active.length ? active : providers.slice(0, 1)
}

function pngCrcTable() {
  const table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}

const PNG_CRC = pngCrcTable()

function pngCrc(type, data) {
  let c = 0xffffffff
  const bytes = Buffer.concat([Buffer.from(type), data])
  for (const byte of bytes) c = PNG_CRC[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(pngCrc(type, data), 8 + data.length)
  return out
}

function rgba(hex) {
  const s = hex.replace('#', '')
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), 255]
}

function createPng(width, height, draw) {
  const pixels = Buffer.alloc(width * height * 4)
  const set = (x, y, color) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = (y * width + x) * 4
    pixels[i] = color[0]
    pixels[i + 1] = color[1]
    pixels[i + 2] = color[2]
    pixels[i + 3] = color[3]
  }
  draw(set)

  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function drawRect(set, scale, x, y, w, h, color) {
  const xx = Math.round(x * scale)
  const yy = Math.round(y * scale)
  const ww = Math.round(w * scale)
  const hh = Math.round(h * scale)
  for (let py = yy; py < yy + hh; py++) {
    for (let px = xx; px < xx + ww; px++) set(px, py, color)
  }
}

function drawTrayCells(set, scale, { x, y, cells, filled, cellW, cellH, gap, color }) {
  const empty = rgba(TRAY_BURN.empty)
  for (let i = 0; i < cells; i++) {
    drawRect(set, scale, x + i * (cellW + gap), y, cellW, cellH, i < filled ? color : empty)
  }
}

function trayBurnbarImage(snap, config) {
  const providers = trayActiveProviders(snap, config).slice(0, 3)
  const multi = providers.length > 1
  // Receipt glyph removed — icon is now just the segmented burn bar(s).
  // Thinner cells, capped at 4 so a maximum of 4 fit; filled segments white.
  const cells = 4
  const cellW = 4
  const cellH = 4
  const gap = 2
  const barW = cells * cellW + (cells - 1) * gap
  const height = 22
  const width = barW
  const scale = 2
  const white = rgba(TRAY_BURN.white)

  const png = createPng(width * scale, height * scale, (set) => {
    if (multi) {
      const rowH = cellH + 2
      const startY = Math.round((height - providers.length * rowH) / 2)
      providers.forEach((item, index) => {
        const pct = trayPctForProvider(item, config)
        const filled = Math.max(0, Math.min(cells, Math.round((pct / 100) * cells)))
        const color = trayProviderWarning(item, config) ? rgba(TRAY_BURN.coral) : white
        drawTrayCells(set, scale, { x: 0, y: startY + index * rowH, cells, filled, cellW, cellH, gap, color })
      })
    } else {
      const provider = providers[0] || {}
      const pct = trayPctForProvider(provider, config)
      const filled = Math.max(0, Math.min(cells, Math.round((pct / 100) * cells)))
      const color = trayProviderWarning(provider, config) ? rgba(TRAY_BURN.coral) : white
      const y = Math.round((height - cellH) / 2)
      drawTrayCells(set, scale, { x: 0, y, cells, filled, cellW, cellH, gap, color })
    }
  })
  const image = nativeImage.createFromBuffer(png, { scaleFactor: scale })
  image.setTemplateImage(false)
  return image
}

function setTrayStatus(title) {
  if (!tray) return
  const status = String(title || '').trim()
  tray.setToolTip(status ? `MaxxToken - ${status}` : 'MaxxToken - use what you pay for')
  tray.setImage(trayIcon())
  if (process.platform === 'darwin') tray.setTitle(title || ' Maxx')
}

function updateTrayAppearance(snap, config = loadConfig()) {
  if (!tray) return
  if (process.platform === 'darwin' && config.trayMetric === 'burnbar') {
    tray.setImage(trayBurnbarImage(snap, config))
    tray.setTitle('')
    tray.setToolTip('MaxxToken - BURN bars')
    return
  }
  setTrayStatus(trayTitleFromSnapshot(snap, config.trayMetric))
}

function createPopover() {
  popover = new BrowserWindow({
    width: POPOVER_WIDTH,
    height: POPOVER_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    hasShadow: true,
    fullscreenable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  popover.setAlwaysOnTop(true, 'pop-up-menu')
  popover.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  popover.loadFile(path.join(__dirname, 'index.html'))
  popover.on('blur', () => {
    if (popover && popover.isVisible()) popover.hide()
  })
}

function positionPopover() {
  // Anchor to the cursor — that is where the tray was clicked, so it always
  // resolves to the display the user is actually on. `tray.getBounds()` pins
  // to a single display's menu bar across multi-monitor setups.
  const cursor = screen.getCursorScreenPoint()
  const trayBounds = tray.getBounds()
  const anchor =
    trayBounds.width && trayBounds.height
      ? { x: trayBounds.x + trayBounds.width / 2, y: trayBounds.y + trayBounds.height }
      : cursor
  // Use the tray's vertical position when it lands on the same display as the
  // cursor; otherwise the tray bounds are stale, so trust the cursor.
  const cursorDisplay = screen.getDisplayNearestPoint(cursor)
  const trayDisplay = screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y })
  const display = cursorDisplay
  const sameDisplay = trayDisplay.id === cursorDisplay.id
  const area = display.workArea
  const margin = 8
  const popoverBounds = popover.getBounds()
  const popoverHeight = popoverBounds.height || POPOVER_HEIGHT
  const minX = area.x + margin
  const maxX = Math.max(minX, area.x + area.width - POPOVER_WIDTH - margin)
  const minY = area.y + margin
  const maxY = Math.max(minY, area.y + area.height - popoverHeight - margin)
  const centerX = sameDisplay ? anchor.x : cursor.x
  const x = Math.min(maxX, Math.max(minX, Math.round(centerX - POPOVER_WIDTH / 2)))
  let y = sameDisplay ? Math.round(anchor.y + 4) : Math.round(cursor.y + 4)
  if (y > maxY) {
    const topAnchor = sameDisplay && trayBounds.height ? trayBounds.y : cursor.y
    y = Math.round(topAnchor - popoverHeight - 4)
  }
  y = Math.min(maxY, Math.max(minY, y))
  popover.setPosition(x, y, false)
}

function setPopoverMode(mode) {
  if (!popover || popover.isDestroyed()) return { ok: false }
  const height = mode === 'compact' ? POPOVER_COMPACT_HEIGHT : POPOVER_HEIGHT
  const bounds = popover.getBounds()
  if (bounds.height !== height || bounds.width !== POPOVER_WIDTH) {
    popover.setSize(POPOVER_WIDTH, height, false)
    if (tray) positionPopover()
  }
  return { ok: true, height }
}

async function togglePopover() {
  if (!popover) return
  if (popover.isVisible()) {
    popover.hide()
    return
  }
  await showPopover()
}

async function preparePopoverForOpen() {
  if (!popover || popover.isDestroyed()) return
  if (popover.webContents.isLoadingMainFrame()) return
  const script = 'Promise.resolve(typeof window.__maxxPreparePopoverOpen === "function" ? window.__maxxPreparePopoverOpen() : true)'
  try {
    await popover.webContents.executeJavaScript(script, true)
  } catch (err) {
    logger.warn('popover', 'pre-open prepare failed', { error: err && err.message ? err.message : String(err) })
  }
}

async function showPopover() {
  if (!popover || !tray) return
  const config = loadConfig()
  popover.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  popover.setAlwaysOnTop(true, 'pop-up-menu')
  await preparePopoverForOpen()
  positionPopover()
  popover.show()
  popover.moveTop()
  popover.focus()
  // Keep the event as a fallback for a newly loaded renderer; the normal path
  // already prepared hidden state before the first visible paint.
  popover.webContents.send('popover-shown')
  logger.info('popover', 'opened', { hasCachedSnap: !!lastSnapshot })
  if (config.onboardingComplete && lastSnapshot) popover.webContents.send('snapshot', lastSnapshot)
  if (!config.onboardingComplete) return
  // Show cache instantly (above), then always fire a live pull so the user sees
  // current usage on open — not just whatever the last scheduled refresh cached.
  refreshOnOpen()
}

async function readSnapshot({ staleOk = false, force = false, heavy = true, restart = false } = {}) {
  if (staleOk && lastSnapshot) {
    return lastSnapshot
  }

  if (snapshotInFlight) {
    if (force && restart && typeof snapshotInFlightCancel === 'function') {
      const old = snapshotInFlight
      const cancel = snapshotInFlightCancel
      snapshotInFlight = null
      snapshotInFlightCancel = null
      old.catch(() => {})
      cancel('snapshot worker restarted after settings change')
    } else {
      if (force) logger.info('snapshot-worker', 'force refresh joined in-flight snapshot')
      return snapshotInFlight
    }
  }

  if (!snapshotInFlight) {
    const worker = snapshotViaWorker(heavy)
    snapshotInFlightCancel = worker.cancel
    let wrapped = null
    wrapped = worker
      .then((snap) => {
        setTraySnapshot(snap)
        return snap
      })
      .finally(() => {
        if (snapshotInFlight === wrapped) {
          snapshotInFlight = null
          snapshotInFlightCancel = null
        }
      })
    snapshotInFlight = wrapped
  }
  return snapshotInFlight
}

function sendSnapshotToPopover(snap) {
  if (snap && popover && !popover.isDestroyed() && popover.isVisible()) {
    popover.webContents.send('snapshot', snap)
  }
}

async function syncSnapshot({ force = true, heavy = true, restart = false } = {}) {
  const snap = await readSnapshot({ force, heavy, restart })
  updateTray().catch(() => {})
  sendSnapshotToPopover(snap)
  return snap
}

let lastOpenRefreshAt = 0

// CodexBar-style refresh-on-open: the popover already rendered the cached
// snapshot, so kick a non-blocking live pull and push the fresh result when it
// lands. Throttled to avoid hammering provider APIs on rapid open/close.
function refreshOnOpen() {
  const now = Date.now()
  if (now - lastOpenRefreshAt < OPEN_REFRESH_THROTTLE_MS) return
  // Skip if the current snapshot is already fresh (e.g. a scheduled refresh just ran).
  if (lastSnapshot && lastSnapshot.generatedAt && now - lastSnapshot.generatedAt < OPEN_REFRESH_THROTTLE_MS) return
  lastOpenRefreshAt = now
  readSnapshot({ force: true, heavy: false })
    .then((snap) => {
      sendSnapshotToPopover(snap)
      updateTray().catch(() => {})
    })
    .catch((err) => logger.error('popover', 'open refresh failed', { error: err && err.message }))
}

function applyLoginItemSettings(config = loadConfig()) {
  const openAtLogin = config.openAtLogin !== false
  if (!app.isPackaged) return
  try {
    const settings = process.platform === 'darwin' ? { openAtLogin, openAsHidden: true } : { openAtLogin }
    app.setLoginItemSettings(settings)
  } catch {
    /* login item support is best-effort */
  }
}

async function updateTray() {
  let title = ' Maxx'
  const config = loadConfig()
  if (!config.onboardingComplete) {
    setTrayStatus(' Setup')
    return
  }
  try {
    const snap = await readSnapshot({ staleOk: true })
    updateTrayAppearance(snap, config)
    return
  } catch {
    /* keep default */
  }
  setTrayStatus(title)
}

function createTray() {
  tray = new Tray(trayIcon())
  setTrayStatus(' Maxx')
  updateTray()
  tray.on('click', togglePopover)
  tray.on('right-click', () => {
    tray.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open MaxxToken', click: togglePopover },
        { label: 'Sync now', click: () => syncSnapshot({ force: true }).catch(() => {}) },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
      ]),
    )
  })
}

ipcMain.handle('get-snapshot', () => {
  // Return cached snapshot immediately if available; trigger background refresh.
  // Renderer receives fresh data later via the 'snapshot' push channel.
  if (lastSnapshot) {
    readSnapshot({ staleOk: true }).then((snap) => {
      if (popover && !popover.isDestroyed() && popover.isVisible()) {
        popover.webContents.send('snapshot', snap)
      }
    }).catch(() => {})
    return lastSnapshot
  }
  return readSnapshot()
})
ipcMain.handle('export-usage', async () => {
  const snap = lastSnapshot || (await readSnapshot({ staleOk: true }))
  if (!snap) throw new Error('No usage data to export yet — sync first.')
  const payload = buildUsageExport(snap, { appVersion: app.getVersion() })
  const stamp = new Date().toISOString().slice(0, 10)
  const picked = await dialog.showSaveDialog(popover, {
    title: 'Export usage + cost history',
    defaultPath: `maxxtoken-usage-${stamp}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (picked.canceled || !picked.filePath) return { ok: false, canceled: true }
  fs.writeFileSync(picked.filePath, JSON.stringify(payload, null, 2), 'utf8')
  logger.info('export-usage', 'wrote', { filePath: picked.filePath, providers: payload.providers.length })
  return { ok: true, filePath: picked.filePath, providers: payload.providers.length }
})
ipcMain.handle('sync-now', () => syncSnapshot({ force: true, restart: true }))
ipcMain.handle('refresh-provider', async (_e, id) => {
  id = canonicalProviderId(id)
  const config = loadConfig()
  if (!config.providers[id]) throw new Error('Unknown provider')
  return syncSnapshot({ force: true, restart: true })
})
ipcMain.handle('get-config', () => loadConfig())
ipcMain.handle('detect-providers', () => {
  const config = loadConfig()
  const detections = providerDetection.detectLocalProviders()
  for (const id of Object.keys(config.providers || {})) {
    if (hasKey(id)) detections[id] = { detected: true, reason: 'Saved credentials found', evidence: 'secrets' }
  }
  return detections
})
ipcMain.handle('get-api-key-state', () => {
  // Renderer shouldn't see the raw key — just whether each provider is wired.
  const state = {}
  for (const id of KEY_PROVIDERS) state[id] = hasKey(id)
  return state
})
ipcMain.handle('set-api-key', async (_e, payload) => {
  const id = canonicalProviderId(payload && payload.id)
  if (!KEY_PROVIDERS.has(id)) throw new Error('Unknown provider')
  setKey(id, payload.key || '')
  const snap = await syncSnapshot({ force: true, heavy: false, restart: true })
  updateTray()
  if (popover && popover.isVisible()) popover.webContents.send('snapshot', snap)
  return { ok: true, hasKey: hasKey(id) }
})
ipcMain.handle('start-copilot-login', async () => {
  const session = await requestDeviceCode()
  copilotLoginSessions.set(session.id, session)
  clipboard.writeText(session.userCode)
  shell.openExternal(session.verificationUriComplete || session.verificationUri)
  return {
    id: session.id,
    userCode: session.userCode,
    verificationUri: session.verificationUri,
    verificationUriComplete: session.verificationUriComplete,
    expiresIn: session.expiresIn,
  }
})
ipcMain.handle('complete-copilot-login', async (_e, id) => {
  const session = copilotLoginSessions.get(id)
  if (!session) throw new Error('Copilot login session expired')
  try {
    const token = await pollForToken(session)
    setKey('copilot', token)
    const snap = await syncSnapshot({ force: true, heavy: false, restart: true })
    updateTray()
    if (popover && popover.isVisible()) popover.webContents.send('snapshot', snap)
    return { ok: true, hasKey: hasKey('copilot'), snap }
  } finally {
    copilotLoginSessions.delete(id)
  }
})
ipcMain.handle('set-missions', (_e, enabled) => {
  const cfg = loadConfig()
  cfg.missions = enabled === true
  saveConfig(cfg)
  return cfg
})
ipcMain.handle('save-config', async (_e, config) => {
  const saved = saveConfig(config)
  applyLoginItemSettings(saved)
  return syncSnapshot({ force: true, heavy: false, restart: true })
})
ipcMain.on('close-popover', () => popover && popover.hide())
ipcMain.handle('set-popover-mode', (_e, mode) => setPopoverMode(mode))

ipcMain.handle('set-popover-height', (_e, height) => {
  if (!popover || popover.isDestroyed()) return { ok: false }
  const target = Math.max(220, Math.min(POPOVER_HEIGHT, Math.round(Number(height) || POPOVER_HEIGHT)))
  const bounds = popover.getBounds()
  if (bounds.height !== target || bounds.width !== POPOVER_WIDTH) {
    popover.setSize(POPOVER_WIDTH, target, false)
    if (tray) positionPopover()
  }
  return { ok: true, height: target }
})
ipcMain.on('open-config-file', () => shell.showItemInFolder(FILE))
ipcMain.on('open-debug-log', () => {
  const p = logger.getLogPath()
  if (p) shell.showItemInFolder(p)
})
ipcMain.on('open-site', () => shell.openExternal('https://maxxtoken.app'))
ipcMain.handle('open-external', (_e, url) => {
  // Only allow well-formed http(s) URLs — never shell-open arbitrary schemes.
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('Invalid external URL')
  shell.openExternal(url)
  return { ok: true }
})
ipcMain.handle('reveal-path', async (_e, targetPath) => {
  const filePath = String(targetPath || '')
  if (!filePath || !path.isAbsolute(filePath)) return { ok: false, error: 'Invalid path.' }
  if (!fs.existsSync(filePath)) return { ok: false, error: 'Path not found.' }
  try {
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      const err = await shell.openPath(filePath)
      return err ? { ok: false, error: err } : { ok: true }
    }
    shell.showItemInFolder(filePath)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : 'Could not open path.' }
  }
})
ipcMain.handle('open-provider-link', (_e, payload) => {
  const url = providerLinks.linkForProvider(payload && payload.id, payload && payload.kind)
  if (!url) throw new Error('Unknown provider link')
  shell.openExternal(url)
  return { ok: true }
})

// Idea Stream: route generation/build to the most-underused subscription.
function leastUsedProvider(snap) {
  const target = snap.maxxTarget
  if (target?.id && CLI_FOR[target.id]) return { id: target.id, name: target.name, cli: CLI_FOR[target.id] }
  const tracked = snap.providers.filter((p) => p.connected && p.capturedPct != null && CLI_FOR[p.id])
  if (!tracked.length) return { id: 'claude', name: 'Claude', cli: 'claude' }
  const p = tracked.sort((a, b) => a.capturedPct - b.capturedPct)[0]
  return { id: p.id, name: p.name, cli: CLI_FOR[p.id] }
}

// Soonest future reset across a provider's windows (+ its own resetAt), in ms,
// or null. Local to main so we don't depend on aggregate internals.
function providerResetAt(provider, now = Date.now()) {
  const resets = (provider?.windows || [])
    .map((w) => Number(w.resetAt))
    .filter((n) => Number.isFinite(n) && n > now)
  const own = Number(provider?.resetAt)
  if (Number.isFinite(own) && own > now) resets.push(own)
  return resets.length ? Math.min(...resets) : null
}

function mostLeftProvider(snap) {
  const providers = Array.isArray(snap?.providers) ? snap.providers : []
  const tracked = providers.filter((p) => p.connected && CLI_FOR[p.id])
  if (!tracked.length) return { id: 'claude', name: 'Claude', plan: 'Max', cli: 'claude', leftValue: null, usedPct: null }
  const p = tracked
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      plan: provider.plan || '',
      cli: CLI_FOR[provider.id],
      leftValue: Number(provider.leftValue ?? provider.burnValue ?? provider.remainingValue),
      usedPct: provider.capturedPct == null ? null : Math.round(provider.capturedPct),
      resetAt: providerResetAt(provider),
    }))
    .sort((a, b) => {
      const av = Number.isFinite(a.leftValue) ? a.leftValue : -1
      const bv = Number.isFinite(b.leftValue) ? b.leftValue : -1
      if (bv !== av) return bv - av
      const au = Number.isFinite(a.usedPct) ? a.usedPct : 101
      const bu = Number.isFinite(b.usedPct) ? b.usedPct : 101
      return au - bu || a.name.localeCompare(b.name)
    })[0]
  return p || { id: 'claude', name: 'Claude', plan: 'Max', cli: 'claude', leftValue: null, usedPct: null }
}

const PROMPT_CAPABLE_CLIS = new Set(['claude', 'codex', 'gemini'])

function projectMissionModels(snap, selectedIds = null) {
  const selected = selectedIds instanceof Set ? selectedIds : null
  const providers = Array.isArray(snap?.providers) ? snap.providers : []
  const rows = providers
    .filter((p) => p.connected && CLI_FOR[p.id])
    .map((p) => ({
      id: p.id,
      name: p.name,
      plan: p.plan || '',
      cli: CLI_FOR[p.id],
      usedPct: p.capturedPct == null ? null : Math.round(p.capturedPct),
      supportsPrompt: PROMPT_CAPABLE_CLIS.has(CLI_FOR[p.id]),
    }))
    .sort((a, b) => {
      const ap = Number.isFinite(a.usedPct) ? a.usedPct : 101
      const bp = Number.isFinite(b.usedPct) ? b.usedPct : 101
      return ap - bp || a.name.localeCompare(b.name)
    })

  const models = rows.length
    ? rows
    : [
        { id: 'claude', name: 'Claude', plan: 'Max', cli: 'claude', usedPct: null, supportsPrompt: true },
        { id: 'codex', name: 'ChatGPT', plan: 'Pro', cli: 'codex', usedPct: null, supportsPrompt: true },
      ]

  return models.map((m, i) => ({
    ...m,
    selected: selected ? selected.has(m.id) : i < Math.min(3, models.length),
  }))
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function detectVerifyCommand(dir) {
  const pkgPath = path.join(dir, 'package.json')
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    const scripts = pkg && pkg.scripts ? pkg.scripts : {}
    const cmds = []
    if (scripts.test && scripts.test !== 'echo "Error: no test specified" && exit 1') cmds.push('npm test')
    if (scripts.build) cmds.push('npm run build')
    if (!cmds.length && scripts.lint) cmds.push('npm run lint')
    if (cmds.length) return cmds.join(' && ')
  } catch {
    /* not a node project */
  }
  return '# TODO: add the project verification command'
}

function missionGoalTitle(prompt) {
  const oneLine = String(prompt || '').trim().split(/\n+/)[0] || 'complete the selected project mission'
  return oneLine.length > 120 ? `${oneLine.slice(0, 117)}...` : oneLine
}

function buildGoalBlock({ dir, goal, models }) {
  const verify = detectVerifyCommand(dir)
  const folder = path.basename(dir)
  const modelOrder = models.map((m, i) => `${i + 1}. ${m.name} (${m.cli}${m.plan ? `, ${m.plan}` : ''})`).join('; ')
  return `GOAL: ${missionGoalTitle(goal)} in ${folder}

DONE WHEN:
- The requested project change from the raw mission prompt is implemented inside ${dir}
- goal.html exists in ${dir} and contains the final mission goal block
- VERIFY exits 0, or the blocker is documented in goal-forge-report.html

SCOPE:
- edit: ${dir}/**
- do not touch: ${dir}/.git/**, ${dir}/node_modules/**, ${dir}/dist/**, ${dir}/build/**, files outside ${dir}

CONSTRAINTS:
- Use the existing project style and tooling before adding new dependencies
- Keep changes focused on the raw mission prompt
- Prefer small, verifiable steps over broad rewrites

VERIFY: ${verify}

ON FAILURE: after 4 iterations without progress, dump the blocker, last failing command, changed files, and next recommended action to ${dir}/goal-forge-report.html, then stop.

CONTEXT:
- Suggested model order: ${modelOrder || 'current model'}
- Raw mission prompt: ${String(goal || '').trim()}

NON-GOALS:
- Do not rewrite unrelated features
- Do not change secrets, credentials, generated build output, or dependency lockfiles unless required by the mission`
}

function goalHtml({ goalBlock, models }) {
  const modelRows = models
    .map((m, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.cli)}</td><td>${escapeHtml(m.plan || '')}</td></tr>`)
    .join('')
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MaxxToken Project Mission</title>
  <style>
    body { margin: 0; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Inter", sans-serif; background: #0b0d08; color: #f3f5ee; }
    main { max-width: 860px; margin: 0 auto; padding: 34px 22px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    p { color: #a5aa9b; }
    pre { white-space: pre-wrap; background: #14170f; border: 1px solid #2a2f22; border-radius: 12px; padding: 18px; overflow-x: auto; }
    .callout { background: #17200f; border-left: 4px solid #b9ff55; border-radius: 10px; padding: 14px 16px; margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { text-align: left; border-bottom: 1px solid #252a20; padding: 8px; }
    th { color: #b9ff55; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
  </style>
</head>
<body>
  <main>
    <h1>Project Mission</h1>
    <p>Copy this block into a goal-capable agent, or use the MaxxToken launched terminal session.</p>
    <pre>${escapeHtml(goalBlock)}</pre>
    <div class="callout">
      <strong>Why this works:</strong> it gives the model a done-state, scope fence, verification command, model order, and a failure stop condition before the long run starts.
    </div>
    <table>
      <thead><tr><th>Order</th><th>Model</th><th>CLI</th><th>Plan</th></tr></thead>
      <tbody>${modelRows}</tbody>
    </table>
  </main>
</body>
</html>`
}

function materializeIdeaPrompt(idea, dir = '') {
  const projectDir = dir || '<chosen project folder>'
  const verify = dir ? detectVerifyCommand(dir) : '<your verification command>'
  return String((idea && (idea.firstPrompt || idea.pitch)) || '')
    .replaceAll('{{PROJECT_DIR}}', projectDir)
    .replaceAll('{{VERIFY}}', verify)
}

function ideaGoalHtml(idea, prompt) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MaxxToken Burn Challenge</title>
  <style>
    body { margin: 0; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Inter", sans-serif; background: #0b0d08; color: #f3f5ee; }
    main { max-width: 860px; margin: 0 auto; padding: 34px 22px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    p { color: #a5aa9b; }
    pre { white-space: pre-wrap; background: #14170f; border: 1px solid #2a2f22; border-radius: 12px; padding: 18px; overflow-x: auto; }
    .callout { background: #17200f; border-left: 4px solid #b9ff55; border-radius: 10px; padding: 14px 16px; margin: 20px 0; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(idea?.title || 'Burn Challenge')}</h1>
    <p>${escapeHtml(idea?.pitch || '')}</p>
    <pre>${escapeHtml(prompt)}</pre>
    <div class="callout"><strong>Why this works:</strong> this is a Goal Forge prompt with done-state, scope fence, verification command, and failure protocol.</div>
  </main>
</body>
</html>`
}

function buildProjectMission(payload, snap) {
  const dir = String(payload?.dir || payload?.folder || '').trim()
  const goal = String(payload?.goal || '').trim()
  if (!dir) throw new Error('Pick a folder first.')
  if (!goal) throw new Error('Write the goal first.')
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('Folder does not exist.')

  const selectedIds = new Set(Array.isArray(payload?.models) ? payload.models.map((m) => String(m)) : [])
  const models = projectMissionModels(snap, selectedIds).filter((m) => m.selected)
  if (!models.length) throw new Error('Pick at least one model.')

  const goalBlock = buildGoalBlock({ dir, goal, models })
  const prompt = `Use this as a loop-ready MaxxToken Project Mission. If your environment supports a goal command, run the GOAL block as the goal. If it does not, work through the block directly and stop when DONE WHEN is true.

${goalBlock}`
  const goalPath = path.join(dir, 'goal.html')
  fs.writeFileSync(goalPath, goalHtml({ goalBlock, models }))
  return { dir, goalPath, goalBlock, prompt, models, title: missionGoalTitle(goal) }
}

function recordProjectMission(mission, result, first) {
  const cfg = loadConfig()
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title: mission.title || 'Project Mission',
    dir: mission.dir,
    cli: first.cli || '',
    models: mission.models.map((m) => m.name),
    status: result.ok ? 'sent' : 'failed',
    createdAt: Date.now(),
    goalPath: mission.goalPath,
    promptLaunched: PROMPT_CAPABLE_CLIS.has(first.cli),
  }
  cfg.missionHistory = [entry, ...(Array.isArray(cfg.missionHistory) ? cfg.missionHistory : [])].slice(0, 20)
  saveConfig(cfg)
  return entry
}

ipcMain.handle('forge-ideas', async () => {
  const snap = await readSnapshot({ staleOk: true })
  const target = leastUsedProvider(snap)
  const ideas = await generateIdeas(target)
  return { target, ideas }
})

ipcMain.handle('forge-feedback', (_e, payload) => {
  recordIdeaFeedback(payload && payload.idea, payload && payload.feedback)
  return { ok: true }
})

ipcMain.handle('forge-copy', (_e, idea) => {
  clipboard.writeText(materializeIdeaPrompt(idea))
  recordIdeaFeedback(idea, 'start')
  return { ok: true }
})

ipcMain.handle('forge-start', async (_e, idea) => {
  const picked = await dialog.showOpenDialog(popover, {
    title: 'Where do you want to build ' + (idea.title || 'this') + '?',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Build here',
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true }
  recordIdeaFeedback(idea, 'start')
  const prompt = materializeIdeaPrompt(idea, picked.filePaths[0])
  fs.writeFileSync(path.join(picked.filePaths[0], 'goal.html'), ideaGoalHtml(idea, prompt))
  const result = await openBuild({
    dir: picked.filePaths[0],
    cli: idea.cli || 'claude',
    prompt,
  })
  return { ok: result.ok, terminal: result.terminal, dir: picked.filePaths[0], error: result.error }
})

// Format ms-until-reset as a compact countdown ("1H 23M", "23D 21H", "12M").
function formatResetCountdown(resetAt) {
  const ms = Number(resetAt) - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return null
  const mins = Math.floor(ms / 60000)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (days > 0) return `${days}D ${hours}H`
  if (hours > 0) return `${hours}H ${m}M`
  return `${m}M`
}

ipcMain.handle('burn-ideas', async () => {
  const snap = await readSnapshot({ staleOk: true })
  const target = mostLeftProvider(snap)
  target.resetText = formatResetCountdown(target.resetAt)
  const { signals, ideas, generation } = await generateBurnIdeas(target, {
    log: (meta) =>
      logger.info('burn-ideas', 'generated', {
        mode: meta.mode,
        provider: meta.provider,
        error: meta.error || undefined,
      }),
  })
  return {
    target: {
      ...target,
      supportsPrompt: PROMPT_CAPABLE_CLIS.has(target.cli),
    },
    signals: signals.slice(0, 6),
    ideas,
    generation,
  }
})

ipcMain.handle('burn-copy', (_e, idea) => {
  const prompt = materializeIdeaPrompt(idea)
  clipboard.writeText(prompt)
  recordIdeaFeedback(idea, 'start')
  return { ok: true }
})

ipcMain.handle('burn-start', async (_e, idea) => {
  if (!idea) return { ok: false, error: 'No idea selected.' }
  const picked = await dialog.showOpenDialog(popover, {
    title: 'Where do you want to build ' + (idea.title || 'this burn challenge') + '?',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Build here',
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true }
  const dir = picked.filePaths[0]
  const prompt = materializeIdeaPrompt(idea, dir)
  const goalPath = path.join(dir, 'goal.html')
  fs.writeFileSync(goalPath, ideaGoalHtml(idea, prompt))
  clipboard.writeText(prompt)
  recordIdeaFeedback(idea, 'start')
  const supportsPrompt = PROMPT_CAPABLE_CLIS.has(idea.cli)
  const result = await openBuild({
    dir,
    cli: idea.cli || 'claude',
    prompt: supportsPrompt ? prompt : '',
  })
  return {
    ok: result.ok,
    terminal: result.terminal,
    dir,
    goalPath,
    copied: true,
    promptLaunched: supportsPrompt,
    cli: idea.cli,
    error: result.error,
  }
})

ipcMain.handle('copy-text', (_e, text) => {
  clipboard.writeText(String(text || ''))
  return { ok: true }
})

// Backlog burn: pick a repo, scan it deterministically, return concrete missions.
ipcMain.handle('backlog-missions', async () => {
  const picked = await dialog.showOpenDialog(popover, {
    title: 'Pick a project to burn down its backlog',
    properties: ['openDirectory'],
    buttonLabel: 'Scan project',
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true }
  const dir = picked.filePaths[0]
  try {
    const scan = scanBacklogMissions(dir)
    logger.info('backlog-missions', 'scanned', { dir, missions: scan.missions.length, stack: scan.stack })
    return { ok: true, dir, folderName: path.basename(dir) || dir, ...scan }
  } catch (err) {
    logger.error('backlog-missions', 'scan failed', { error: String(err && err.message || err) })
    return { ok: false, error: 'Could not scan that folder.' }
  }
})

// Launch a build for one backlog mission, anchored to its repo.
ipcMain.handle('backlog-start', async (_e, payload) => {
  const dir = payload && payload.dir
  const mission = payload && payload.mission
  if (!dir || !mission) return { ok: false, error: 'No mission selected.' }
  const snap = await readSnapshot({ staleOk: true })
  const target = mostLeftProvider(snap)
  const cli = PROMPT_CAPABLE_CLIS.has(target.cli) ? target.cli : 'claude'
  const prompt = backlogPrompt(mission, dir, cli)
  clipboard.writeText(prompt)
  const result = await openBuild({ dir, cli, prompt })
  return { ok: result.ok, terminal: result.terminal, dir, copied: true, cli, error: result.error }
})

ipcMain.handle('scan-context-bloat', async (_e, providerId) => {
  const picked = await dialog.showOpenDialog(popover, {
    title: 'Scan a project folder for context bloat',
    properties: ['openDirectory'],
    buttonLabel: 'Scan folder',
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true, providerId }
  const dir = picked.filePaths[0]
  return {
    ...scanContextBloat(dir),
    providerId,
  }
})

ipcMain.handle('mission-context', async () => {
  const snap = await readSnapshot({ staleOk: true })
  const cfg = loadConfig()
  return { models: projectMissionModels(snap), history: Array.isArray(cfg.missionHistory) ? cfg.missionHistory : [] }
})

ipcMain.handle('flow-context', async () => {
  const snap = await readSnapshot({ staleOk: true })
  const cfg = loadConfig()
  return {
    checkpoints: normalizeFlowCheckpoints(cfg.flowCheckpoints),
    missionHistory: Array.isArray(cfg.missionHistory) ? cfg.missionHistory : [],
    recommendation: flowRecommendation(snap),
  }
})

ipcMain.handle('flow-save-checkpoint', async (_e, payload) => {
  const cfg = loadConfig()
  const checkpoint = buildFlowCheckpoint(payload || {})
  cfg.flowCheckpoints = normalizeFlowCheckpoints([checkpoint, ...(cfg.flowCheckpoints || [])])
  saveConfig(cfg)
  clipboard.writeText(checkpoint.resumePrompt)
  return { ok: true, checkpoint, checkpoints: cfg.flowCheckpoints, copied: true }
})

ipcMain.handle('flow-copy-resume', (_e, payload) => {
  const cfg = loadConfig()
  const id = String(payload && payload.id || '')
  const checkpoints = normalizeFlowCheckpoints(cfg.flowCheckpoints)
  const checkpoint = checkpoints.find((item) => item.id === id) || checkpoints[0]
  if (!checkpoint) return { ok: false, error: 'No checkpoint saved yet.' }
  clipboard.writeText(checkpoint.resumePrompt)
  return { ok: true, checkpoint, copied: true }
})

ipcMain.handle('mission-pick-folder', async () => {
  const picked = await dialog.showOpenDialog(popover, {
    title: 'Pick project folder',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Use folder',
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true }
  return { ok: true, dir: picked.filePaths[0] }
})

ipcMain.handle('mission-copy-goal', async (_e, payload) => {
  const snap = await readSnapshot({ staleOk: true })
  const mission = buildProjectMission(payload, snap)
  clipboard.writeText(mission.prompt)
  return { ok: true, dir: mission.dir, goalPath: mission.goalPath }
})

ipcMain.handle('mission-preflight', async (_e, payload) => {
  const snap = await readSnapshot({ staleOk: true })
  const selectedIds = new Set(Array.isArray(payload?.models) ? payload.models.map((m) => String(m)) : [])
  return estimateMissionPreflight({
    dir: payload?.dir || payload?.folder,
    goal: payload?.goal,
    modelIds: payload?.models,
    models: projectMissionModels(snap, selectedIds),
    snapshot: snap,
  })
})

ipcMain.handle('mission-start-project', async (_e, payload) => {
  const snap = await readSnapshot({ staleOk: true })
  const mission = buildProjectMission(payload, snap)
  const first = mission.models[0]
  clipboard.writeText(mission.prompt)
  const result = await openBuild({
    dir: mission.dir,
    cli: first.cli || 'claude',
    prompt: PROMPT_CAPABLE_CLIS.has(first.cli) ? mission.prompt : '',
  })
  const entry = recordProjectMission(mission, result, first)
  return {
    ok: result.ok,
    terminal: result.terminal,
    dir: mission.dir,
    goalPath: mission.goalPath,
    copied: true,
    promptLaunched: PROMPT_CAPABLE_CLIS.has(first.cli),
    cli: first.cli,
    mission: entry,
    error: result.error,
  }
})

let updateTimer = null
let updatePromptShown = false
// `version` is ALWAYS the running app's version and must never be overwritten by
// update-feed events (those describe the latest *available* release, surfaced
// separately as `availableVersion`). Conflating them made "Current version" show
// the newest published release instead of what's installed.
let updateState = { status: 'idle', version: app.getVersion(), availableVersion: null }

function emitUpdate(patch) {
  updateState = { ...updateState, ...patch }
  if (popover && !popover.isDestroyed()) popover.webContents.send('update-status', updateState)
}

function setupAutoUpdate() {
  if (!app.isPackaged) return // updates only run in a built, signed app

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => emitUpdate({ status: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    emitUpdate({ status: 'downloading', availableVersion: info && info.version, percent: 0 }),
  )
  autoUpdater.on('update-not-available', (info) =>
    emitUpdate({ status: 'up-to-date', availableVersion: (info && info.version) || null }),
  )
  autoUpdater.on('download-progress', (p) =>
    emitUpdate({ status: 'downloading', percent: Math.round(p.percent || 0) }),
  )
  autoUpdater.on('error', (err) =>
    emitUpdate({ status: 'error', error: err && err.message ? err.message : String(err) }),
  )

  autoUpdater.on('update-downloaded', async (info) => {
    emitUpdate({ status: 'ready', availableVersion: info && info.version })
    if (updatePromptShown) return
    updatePromptShown = true
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'MaxxToken update ready',
      message: `Version ${info.version} is ready to install.`,
      detail: 'Restart MaxxToken to apply it. Otherwise it installs next time you quit.',
    })
    if (response === 0) autoUpdater.quitAndInstall()
    else updatePromptShown = false
  })

  autoUpdater.checkForUpdates().catch(() => {})
  updateTimer = setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000)
}

ipcMain.handle('get-update-status', () => updateState)
ipcMain.handle('check-updates', async () => {
  if (!app.isPackaged) {
    emitUpdate({ status: 'dev', version: app.getVersion() })
    return updateState
  }
  emitUpdate({ status: 'checking' })
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    emitUpdate({ status: 'error', error: err && err.message ? err.message : String(err) })
  }
  return updateState
})
ipcMain.handle('install-update', () => {
  if (updateState.status === 'ready') autoUpdater.quitAndInstall()
  return updateState
})

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (popover && popover.isVisible()) {
      popover.moveTop()
      popover.focus()
    } else {
      showPopover()
    }
  })

  app.whenReady().then(() => {
    if (app.dock) app.dock.hide()
    applyLoginItemSettings()
    lastSnapshot = cachedSnapshot()
    if (lastSnapshot) logger.info('snapshot-cache', 'loaded', { generatedAt: lastSnapshot.generatedAt })
    createPopover()
    createTray()
    // Prime token/cost data once on launch, then split cadence: light every
    // 5 min (windows + balances), heavy hourly (also scans token-history logs).
    syncSnapshot({ force: true, heavy: true }).catch(() => {})
    refreshTimer = setInterval(() => syncSnapshot({ force: true, heavy: false }).catch(() => {}), REFRESH_INTERVAL_MS)
    heavyRefreshTimer = setInterval(() => syncSnapshot({ force: true, heavy: true }).catch(() => {}), HEAVY_REFRESH_INTERVAL_MS)
    localApi.startLocalApi({
      port: loadConfig().localApiPort,
      getSnapshot: () => lastSnapshot,
      requestRefresh: () => { syncSnapshot({ force: true }).catch(() => {}) },
      logger,
    })
    setupAutoUpdate()
  })
}

app.on('before-quit', () => {
  clearInterval(refreshTimer)
  clearInterval(heavyRefreshTimer)
  clearInterval(updateTimer)
  localApi.stopLocalApi()
  for (const child of activeSnapshotWorkers) {
    try { child.kill() } catch {}
  }
  activeSnapshotWorkers.clear()
})
app.on('window-all-closed', (e) => e.preventDefault())
