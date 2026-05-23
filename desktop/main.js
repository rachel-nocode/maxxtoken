const { app, Tray, BrowserWindow, Menu, nativeImage, ipcMain, shell, dialog, screen, clipboard, Notification } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const { fork } = require('child_process')
const { loadConfig, saveConfig, FILE } = require('./lib/config')
const { generateIdeas, recordIdeaFeedback } = require('./lib/ideas')
const { openBuild } = require('./lib/launch')
const { setKey, hasKey, allKeys } = require('./lib/secrets')
const { requestDeviceCode, pollForToken } = require('./lib/copilot-auth')
const maxxAlerts = require('./lib/maxx-alerts')
const quotaNotifications = require('./lib/quota-notifications')
const providerDetection = require('./lib/provider-detection')
const providerLinks = require('./lib/provider-links')
const { canonicalProviderId } = require('./lib/provider-ids')
const widgetSnapshot = require('./lib/widget-snapshot')
const { trayTitleFromSnapshot } = require('./lib/tray-title')
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
let lastSnapshot = null
let snapshotInFlight = null
const activeSnapshotWorkers = new Set()
const copilotLoginSessions = new Map()

const POPOVER_WIDTH = 420
const POPOVER_HEIGHT = 800
const REFRESH_INTERVAL_MS = 30 * 60 * 1000
const SNAPSHOT_WORKER_TIMEOUT_MS = 90 * 1000
const gotSingleInstanceLock = app.requestSingleInstanceLock()

function fullSnapshotFromWidgetCache(cache) {
  if (!cache || typeof cache !== 'object') return null
  const totals = cache.totals || {}
  const config = loadConfig()
  const cachedProviders = (cache.providers || []).map((provider) => ({
    ...provider,
    monthly: provider.monthly ?? config.providers?.[provider.id]?.monthly ?? 0,
    windows: [provider.primaryWindow, provider.secondaryWindow].filter(Boolean),
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
  if (tray) tray.setTitle(trayTitleFromSnapshot(snap, loadConfig().trayMetric))
  maybePostMaxxAlert(snap)
  maybePostQuotaNotifications(snap)
}

let workerRequestId = 0

function snapshotViaWorker() {
  const requestId = ++workerRequestId
  const start = Date.now()
  logger.info('snapshot-worker', 'starting', { requestId })

  return new Promise((resolve, reject) => {
    let timer = null
    const child = fork(path.join(__dirname, 'lib', 'snapshot-worker.js'), [], {
      env: {
        ...process.env,
        MAXXTOKEN_USER_DATA: app.getPath('userData'),
        MAXXTOKEN_SECRETS_JSON: JSON.stringify(allKeys()),
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
        logger.error('snapshot-worker', 'failed', { requestId, ms, error: err.message || String(err) })
        reject(err)
      } else {
        logger.info('snapshot-worker', 'done', { requestId, ms })
        resolve(snap)
      }
    }
    timer = setTimeout(() => {
      finish(new Error(`snapshot worker timed out after ${SNAPSHOT_WORKER_TIMEOUT_MS}ms`))
    }, SNAPSHOT_WORKER_TIMEOUT_MS)
    child.on('message', (message) => {
      if (!message || message.type !== 'snapshot-result' || message.requestId !== requestId) return
      if (message.ok) finish(null, message.snap)
      else finish(new Error(message.error || 'snapshot worker failed'))
    })
    child.on('error', (err) => finish(err))
    child.on('exit', (code, signal) => {
      activeSnapshotWorkers.delete(child)
      if (!settled) finish(new Error(`snapshot worker exited early (${signal || code})`))
    })
    child.send({ type: 'snapshot', requestId })
  })
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
  const image = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray', 'iconTemplate.png'))
  image.setTemplateImage(true)
  return image
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
  const minX = area.x + margin
  const maxX = Math.max(minX, area.x + area.width - POPOVER_WIDTH - margin)
  const minY = area.y + margin
  const maxY = Math.max(minY, area.y + area.height - POPOVER_HEIGHT - margin)
  const centerX = sameDisplay ? anchor.x : cursor.x
  const x = Math.min(maxX, Math.max(minX, Math.round(centerX - POPOVER_WIDTH / 2)))
  let y = sameDisplay ? Math.round(anchor.y + 4) : area.y + margin
  if (y > maxY) y = area.y + margin
  y = Math.min(maxY, Math.max(minY, y))
  popover.setPosition(x, y, false)
}

async function togglePopover() {
  if (!popover) return
  if (popover.isVisible()) {
    popover.hide()
    return
  }
  await showPopover()
}

function showPopover() {
  if (!popover || !tray) return
  const config = loadConfig()
  popover.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  popover.setAlwaysOnTop(true, 'pop-up-menu')
  positionPopover()
  popover.show()
  popover.moveTop()
  popover.focus()
  logger.info('popover', 'opened', { hasCachedSnap: !!lastSnapshot })
  if (config.onboardingComplete && lastSnapshot) popover.webContents.send('snapshot', lastSnapshot)
  if (!config.onboardingComplete) return
  if (!lastSnapshot) {
    readSnapshot({ staleOk: true })
      .then((snap) => {
        if (snap && popover && !popover.isDestroyed() && popover.isVisible()) {
          popover.webContents.send('snapshot', snap)
        }
      })
      .catch((err) => logger.error('popover', 'snapshot fetch failed', { error: err && err.message }))
  }
}

async function readSnapshot({ staleOk = false, force = false } = {}) {
  if (staleOk && lastSnapshot) {
    return lastSnapshot
  }

  if (snapshotInFlight) {
    if (force) logger.info('snapshot-worker', 'force refresh joined in-flight snapshot')
    return snapshotInFlight
  }

  if (!snapshotInFlight) {
    snapshotInFlight = snapshotViaWorker()
      .then((snap) => {
        setTraySnapshot(snap)
        return snap
      })
      .finally(() => {
        snapshotInFlight = null
      })
  }
  return snapshotInFlight
}

function applyLoginItemSettings(config = loadConfig()) {
  const openAtLogin = config.openAtLogin !== false
  if (!app.isPackaged) return
  try {
    app.setLoginItemSettings({
      openAtLogin,
      openAsHidden: true,
    })
  } catch {
    /* login item support is best-effort */
  }
}

async function updateTray() {
  let title = ' Maxx'
  const config = loadConfig()
  if (!config.onboardingComplete) {
    if (tray) tray.setTitle(' Setup')
    return
  }
  try {
    const snap = await readSnapshot({ staleOk: true })
    title = trayTitleFromSnapshot(snap, config.trayMetric)
  } catch {
    /* keep default */
  }
  if (tray) tray.setTitle(title)
}

function createTray() {
  tray = new Tray(trayIcon())
  tray.setToolTip('MaxxToken - use what you pay for')
  tray.setTitle(' Maxx')
  updateTray()
  tray.on('click', togglePopover)
  tray.on('right-click', () => {
    tray.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open MaxxToken', click: togglePopover },
        { label: 'Refresh now', click: async () => { const snap = await readSnapshot({ force: true }); updateTray(); if (popover && popover.isVisible()) popover.webContents.send('snapshot', snap) } },
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
ipcMain.handle('refresh-provider', async (_e, id) => {
  id = canonicalProviderId(id)
  const config = loadConfig()
  if (!config.providers[id]) throw new Error('Unknown provider')
  const snap = await readSnapshot({ force: true })
  updateTray()
  if (popover && popover.isVisible()) popover.webContents.send('snapshot', snap)
  return snap
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
  const snap = await readSnapshot({ force: true })
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
    const snap = await readSnapshot({ force: true })
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
ipcMain.handle('save-config', (_e, config) => {
  saveConfig(config)
  applyLoginItemSettings(config)
  updateTray()
  return readSnapshot({ force: true })
})
ipcMain.on('close-popover', () => popover && popover.hide())
ipcMain.on('open-config-file', () => shell.showItemInFolder(FILE))
ipcMain.on('open-debug-log', () => {
  const p = logger.getLogPath()
  if (p) shell.showItemInFolder(p)
})
ipcMain.on('open-site', () => shell.openExternal('https://maxxtoken.app'))
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
  clipboard.writeText(String((idea && (idea.firstPrompt || idea.pitch)) || ''))
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
  const result = await openBuild({
    dir: picked.filePaths[0],
    cli: idea.cli || 'claude',
    prompt: idea.firstPrompt || idea.pitch || '',
  })
  return { ok: result.ok, terminal: result.terminal, dir: picked.filePaths[0], error: result.error }
})

let updateTimer = null
let updatePromptShown = false
let updateState = { status: 'idle', version: app.getVersion() }

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
    emitUpdate({ status: 'downloading', version: info && info.version, percent: 0 }),
  )
  autoUpdater.on('update-not-available', (info) =>
    emitUpdate({ status: 'up-to-date', version: (info && info.version) || app.getVersion() }),
  )
  autoUpdater.on('download-progress', (p) =>
    emitUpdate({ status: 'downloading', percent: Math.round(p.percent || 0) }),
  )
  autoUpdater.on('error', (err) =>
    emitUpdate({ status: 'error', error: err && err.message ? err.message : String(err) }),
  )

  autoUpdater.on('update-downloaded', async (info) => {
    emitUpdate({ status: 'ready', version: info && info.version })
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
    refreshTimer = setInterval(() => readSnapshot({ force: true }).then(updateTray).catch(() => {}), REFRESH_INTERVAL_MS)
    setupAutoUpdate()
  })
}

app.on('before-quit', () => {
  clearInterval(refreshTimer)
  clearInterval(updateTimer)
  for (const child of activeSnapshotWorkers) {
    try { child.kill() } catch {}
  }
  activeSnapshotWorkers.clear()
})
app.on('window-all-closed', (e) => e.preventDefault())
