if (process.argv.includes('--cli')) {
  require('./lib/cli-entry').start(require('electron').app, process.argv.slice(process.argv.indexOf('--cli') + 1))
  return
}

const { app, Tray, BrowserWindow, Menu, nativeImage, ipcMain, shell, dialog, screen, clipboard, Notification, globalShortcut, nativeTheme, systemPreferences } = require('electron')
const { autoUpdater } = require('electron-updater')
const fs = require('fs')
const path = require('path')
const { fork } = require('child_process')
const { loadConfig, saveConfig, mergeProviderOptOuts, FILE } = require('./lib/config')
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
const { renderTrayBurnbarPng, trayBurnbarStateFromSnapshot, trayPinnedStateFromSnapshot } = require('./lib/tray-burn-icon')
const { buildUsageExport } = require('./lib/usage-export')
const { estimateMissionPreflight } = require('./lib/preflight-estimate')
const { recommendModelFit } = require('./lib/model-fit')
const { scanContextBloat } = require('./lib/context-bloat-fixer')
const localApi = require('./lib/local-api')
const logger = require('./lib/logger')
const openUsagePreferences = require('./lib/openusage-preferences')
const updatePreferences = require('./lib/update-preferences')
const { bindLegacyLayouts } = require('./lib/account-layout-migration')
const { buildCard } = require('./lib/share-card')
const paceNotifications = require('./lib/pace-notifications')
const capturePrivacy = require('./lib/capture-privacy')
const { createHistorySync } = require('./lib/cloud-history-sync')
const { configurePopoverWindow, popoverWindowOptions, presentPopoverWindow } = require('./lib/popover-window')
let privacyMonitor = null
let historySync = null
let historySyncTimer = null
let lastLocalSnapshot = null
let paceNotificationState = undefined
const shortcutController = openUsagePreferences.createShortcutController(globalShortcut, () => togglePopover())

function systemDisplayPreferences() {
  return {
    dark: nativeTheme.shouldUseDarkColors,
    highContrast: nativeTheme.shouldUseHighContrastColors,
    reducedTransparency: nativeTheme.prefersReducedTransparency,
    reducedMotion: systemPreferences.getAnimationSettings().prefersReducedMotion,
  }
}

function openUsagePreferencesState() {
  return { ...loadConfig().openUsagePrefs, shortcutStatus: shortcutController.status(), systemPreferences: systemDisplayPreferences(), capturePrivacyStatus: privacyMonitor?.getStatus(), sync: syncStatus() }
}

function syncStatus() {
  const state = historySync?.getStatus() || { enabled: false, supported: process.platform === 'darwin' }
  return { ...state, status: !state.supported ? 'unsupported' : !state.enabled ? 'off' : state.syncing ? 'syncing' : state.error ? 'error' : state.lastSuccessAt ? 'ok' : 'off', message: state.error || (state.supported ? '' : 'History sync is available on macOS.'), lastSyncedAt: state.lastSuccessAt || null }
}

function withPeerHistory(snapshot) {
  if (!snapshot || !historySync) return snapshot
  const providers = historySync.mergeHistory(snapshot.providers)
  if (providers === snapshot.providers) return snapshot
  const tokens = require('./lib/aggregate')._private.tokenTotalsFromProviders(providers)
  return { ...snapshot, providers, totals: { ...snapshot.totals, tokens } }
}

function ensureHistorySync() {
  if (historySync) return historySync
  const file = path.join(path.dirname(FILE), 'sync-device.json')
  let id
  try { id = JSON.parse(fs.readFileSync(file, 'utf8')).id } catch {}
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) {
    id = require('crypto').randomUUID()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ id }), { mode: 0o600 })
  }
  historySync = createHistorySync({
    deviceId: id,
    deviceName: `Mac ${id.slice(0, 6)}`,
    getProviders: () => lastLocalSnapshot?.providers || [],
    onChange: () => {
      if (lastLocalSnapshot) lastSnapshot = withPeerHistory(lastLocalSnapshot)
      sendSnapshotToPopover(lastSnapshot)
      if (popover && !popover.isDestroyed()) popover.webContents.send('history-sync-status', syncStatus())
    },
  })
  return historySync
}

async function applyOpenUsagePreferences(preferences) {
  privacyMonitor?.setEnabled(preferences.capturePrivacy)
  if ((preferences.sync.enabled && lastLocalSnapshot) || historySync) await ensureHistorySync().setEnabled(preferences.sync.enabled)
  updateTrayAppearance(lastSnapshot)
}

function sendSystemPreferences() {
  if (popover && !popover.isDestroyed()) popover.webContents.send('system-preferences', systemDisplayPreferences())
}
logger.init(app.getPath('userData'))
process.on('uncaughtException', (err) => logger.error('main', 'uncaught exception', { error: err && err.stack ? err.stack : String(err) }))
process.on('unhandledRejection', (err) => logger.error('main', 'unhandled rejection', { error: err && err.stack ? err.stack : String(err) }))

const { PROVIDER_CAPABILITIES } = require('./lib/provider-capabilities')
const CLI_FOR = Object.fromEntries(Object.values(PROVIDER_CAPABILITIES).filter((entry) => entry.discovery.cliBins.length).map((entry) => [entry.id, entry.discovery.cliBins[0]]))
const KEY_PROVIDERS = new Set(Object.values(PROVIDER_CAPABILITIES).filter((entry) => ['key', 'cookie'].includes(entry.auth)).map((entry) => entry.id))
function providerCli(provider) {
  return CLI_FOR[provider?.providerFamily || String(provider?.id || '').split('@')[0]]
}

let tray = null
let popover = null
// Timestamp of the last popover hide. A tray click while the popover is open
// fires `blur` (which hides it) just before the tray `click` handler runs, so
// the click would otherwise re-show it. We suppress the re-open if the hide
// happened within this guard window.
let popoverHiddenAt = 0
const TRAY_REOPEN_GUARD_MS = 250
let refreshTimer = null
let heavyRefreshTimer = null
let nextRefreshAt = null
let lastSnapshot = null
let snapshotInFlight = null
let snapshotInFlightCancel = null
const activeSnapshotWorkers = new Set()
const copilotLoginSessions = new Map()

const POPOVER_WIDTH = 420
const POPOVER_HEIGHT = 720
const POPOVER_COMPACT_HEIGHT = 610
// Light pull: rate-limit windows + balances. Match OpenUsage's provider poll
// cadence so active usage stays within 30 seconds of the provider response.
const REFRESH_INTERVAL_MS = 30 * 1000
// Heavy pull: also scans local token-history logs for cost data. Expensive, so
// it runs far less often (CodexBar uses the same 1-hour cadence for cost data).
const HEAVY_REFRESH_INTERVAL_MS = 60 * 60 * 1000
// On popover open we fire a live (light) pull, showing cache first. Throttle it
// so rapid toggling doesn't hammer provider APIs — cache is always shown.
const OPEN_REFRESH_THROTTLE_MS = 30 * 1000
const SNAPSHOT_WORKER_TIMEOUT_MS = 90 * 1000
const gotSingleInstanceLock = app.requestSingleInstanceLock()
function fullSnapshotFromWidgetCache(cache) {
  if (!cache || typeof cache !== 'object') return null
  const totals = cache.totals || {}
  const config = loadConfig()
  const cachedProviders = (cache.providers || []).map((provider) => ({
    ...provider,
    links: provider.links || providerLinks.linksForProvider(provider.id),
    monthly: provider.monthly ?? config.providers?.[provider.providerFamily || provider.id.split('@')[0]]?.monthly ?? 0,
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
  const accounts = require('./lib/provider-accounts')
  try {
    const discovered = [...accounts.discoverClaudeAccounts(), ...accounts.discoverCodexAccounts()]
    return require('./lib/provider-refresh').restoreCachedRefresh(fullSnapshotFromWidgetCache(accounts.guardCachedSnapshotAccounts(widgetSnapshot.readWidgetSnapshot(), discovered)), nextRefreshAt)
  } catch {
    return null
  }
}

function setTraySnapshot(snap) {
  snap = { ...snap, refresh: { ...snap.refresh, inProgress: false, pendingProviderIds: [], nextRefreshAt } }
  lastLocalSnapshot = snap
  if (!historySync && loadConfig().openUsagePrefs.sync.enabled) applyOpenUsagePreferences(loadConfig().openUsagePrefs).catch((error) => logger.warn('history-sync', 'initialization failed', { error: error.message }))
  lastSnapshot = withPeerHistory(snap)
  const migration = bindLegacyLayouts(loadConfig(), snap?.providers)
  if (migration.changed) saveConfig(migration.config)
  persistDetectedProviderPlans(snap)
  try {
    widgetSnapshot.saveWidgetSnapshot(snap)
  } catch {
    /* widget/automation snapshot is best-effort */
  }
  updateTrayAppearance(snap, loadConfig())
  maybePostMaxxAlert(snap)
  maybePostQuotaNotifications(snap)
  maybePostPaceNotifications(snap)
}

function maybePostPaceNotifications(snap) {
  const config = loadConfig()
  const result = paceNotifications.evaluateSnapshotWithState(snap, config.openUsagePrefs, paceNotificationState)
  paceNotificationState = result.state
  if (!app.isReady() || !Notification.isSupported() || !config.onboardingComplete) return
  for (const event of result.events) {
    const note = new Notification({ title: event.title, body: event.body, silent: true })
    note.on('click', () => showPopover())
    note.show()
  }
}

function persistDetectedProviderPlans(snap) {
  const providers = Array.isArray(snap?.providers) ? snap.providers : []
  const detected = providers.filter((provider) => (
    provider?.id &&
    provider.connected &&
    typeof provider.plan === 'string' &&
    provider.plan.trim()
  ))
  if (!detected.length) return

  const config = loadConfig()
  let changed = false
  for (const provider of detected) {
    const id = canonicalProviderId(provider.providerFamily || provider.id)
    if (provider.account && !provider.account.isDefault) continue
    const current = config.providers?.[id]
    const plan = provider.plan.trim()
    if (!current || current.plan === plan) continue
    config.providers[id] = { ...current, plan }
    changed = true
  }
  if (!changed) return

  try {
    saveConfig(config)
  } catch (err) {
    logger.warn('config', 'detected plan persist failed', { error: err && err.message ? err.message : String(err) })
  }
}

let workerRequestId = 0

// Persisted browser/Claude "Safe Storage" keys, injected into each worker so it
// never re-prompts the macOS Keychain. Loaded once, kept in memory, updated
// whenever a worker reports a freshly-derived key (or a decline).
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

function publishSnapshotProgress(snap) {
  if (!snap) return
  lastLocalSnapshot = { ...snap, refresh: { ...snap.refresh, nextRefreshAt } }
  lastSnapshot = withPeerHistory(lastLocalSnapshot)
  updateTrayAppearance(lastSnapshot)
  sendSnapshotToPopover(lastSnapshot)
}

function snapshotViaWorker(heavy = true, options = {}) {
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
      if (settled || !message || message.requestId !== requestId) return
      if (message.type === 'keychain-key-update') {
        persistBrowserKeys(message.keys)
        return
      }
      if (message.type === 'snapshot-progress') {
        publishSnapshotProgress(message.snap)
        return
      }
      if (message.type !== 'snapshot-result') return
      persistBrowserKeys(message.browserKeys)
      if (message.ok) finish(null, message.snap)
      else finish(new Error(message.error || 'snapshot worker failed'))
    })
    child.on('error', (err) => finish(err))
    child.on('exit', (code, signal) => {
      activeSnapshotWorkers.delete(child)
      if (!settled) finish(new Error(`snapshot worker exited early (${signal || code})`))
    })
    const skipSavedKeys = process.env.MAXXTOKEN_SKIP_SAVED_KEYS === '1'
    const workerSecrets = skipSavedKeys ? {} : allKeys()
    const workerBrowserKeys = skipSavedKeys ? {} : getBrowserKeys()
    child.send({ type: 'snapshot', requestId, heavy, forceRefresh: options.forceRefresh === true, providerIds: options.providerIds, previousSnapshot: lastLocalSnapshot || lastSnapshot, secrets: workerSecrets, browserKeys: workerBrowserKeys })
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

function trayBurnbarImage(snap, config) {
  const scale = 2
  const { bars } = trayBurnbarStateFromSnapshot(snap, config)
  const png = renderTrayBurnbarPng(bars, { scale })
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
  if (privacyMonitor?.getStatus().concealUsage) {
    tray.setImage(trayIcon())
    if (process.platform === 'darwin') tray.setTitle('')
    tray.setToolTip('MaxxToken — usage hidden during screen capture')
    return
  }
  if (config.trayMetric === 'pins') {
    const state = trayPinnedStateFromSnapshot(snap, config)
    tray.setImage(trayIcon())
    if (process.platform === 'darwin') tray.setTitle(state.title)
    tray.setToolTip(state.tooltip)
    if (process.platform === 'darwin' && state.bars.length) {
      const png = renderTrayBurnbarPng(state.bars, { scale: 2 })
      const image = nativeImage.createFromBuffer(png, { scaleFactor: 2 })
      image.setTemplateImage(false)
      tray.setImage(image)
    }
    return
  }
  if (process.platform === 'darwin' && config.trayMetric === 'burnbar') {
    const { tooltip } = trayBurnbarStateFromSnapshot(snap, config)
    tray.setImage(trayBurnbarImage(snap, config))
    tray.setTitle('')
    tray.setToolTip(tooltip)
    return
  }
  setTrayStatus(trayTitleFromSnapshot(snap, config.trayMetric))
}

function createPopover() {
  popover = new BrowserWindow(popoverWindowOptions(process.platform, path.join(__dirname, 'preload.js'), {
    width: POPOVER_WIDTH,
    height: POPOVER_HEIGHT,
  }))
  configurePopoverWindow(popover)
  popover.loadFile(path.join(__dirname, 'index.html'))
  popover.on('blur', () => {
    if (popover && popover.isVisible()) {
      popoverHiddenAt = Date.now()
      popover.hide()
    }
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
  // The popover loses focus and hides the instant the tray is clicked, so an
  // open popover is already hidden by the time this handler runs. Treat a click
  // that lands right after that auto-hide as "close", not "re-open".
  if (Date.now() - popoverHiddenAt < TRAY_REOPEN_GUARD_MS) return
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
  await preparePopoverForOpen()
  positionPopover()
  presentPopoverWindow(popover)
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

async function readSnapshot({ staleOk = false, force = false, heavy = true, restart = false, providerIds, forceRefresh = false } = {}) {
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
    const worker = snapshotViaWorker(heavy, { providerIds, forceRefresh })
    snapshotInFlightCancel = worker.cancel
    let wrapped = null
    wrapped = worker
      .then((snap) => {
        setTraySnapshot(snap)
        return lastSnapshot
      })
      .catch((error) => {
        if (snapshotInFlight === wrapped && !error.cancelled) {
          publishSnapshotProgress(require('./lib/provider-refresh').failPending(lastLocalSnapshot, 'Refresh interrupted. Try again.'))
        }
        throw error
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

async function syncSnapshot({ force = true, heavy = true, restart = false, providerIds, forceRefresh = false } = {}) {
  const snap = await readSnapshot({ force, heavy, restart, providerIds, forceRefresh })
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
ipcMain.handle('sync-now', () => syncSnapshot({ force: true, forceRefresh: true, restart: true }))
ipcMain.handle('refresh-provider', async (_e, id) => {
  id = canonicalProviderId(id)
  const config = loadConfig()
  const instance = lastSnapshot?.providers?.find((provider) => provider.id === id)
  if (!config.providers[id] && !config.providers[instance?.providerFamily]) throw new Error('Unknown provider')
  if (snapshotInFlight) await snapshotInFlight.catch(() => {})
  return syncSnapshot({ force: true, forceRefresh: true, providerIds: [id] })
})
ipcMain.handle('get-config', () => loadConfig())
function diagnosticsState() {
  return require('./lib/diagnostics').describe(loadConfig(), { logPath: logger.getLogPath() })
}
function configureRuntime(config) {
  logger.setLevel(config.logLevel)
  require('./lib/http').configureProxy(config.proxy, require('./lib/secrets').getProxyCredentials())
  require('./lib/token-cost').configurePricing({ unknownModelFallback: config.unknownModelFallback, pricingSupplementUrl: config.pricingSupplementUrl })
}
function cliState() {
  const status = require('./lib/cli-installer').getCliStatus({ version: app.getVersion(), executablePath: process.execPath })
  return { ...status, version: status.installedVersion, compatible: status.healthy }
}
ipcMain.handle('get-diagnostics', () => diagnosticsState())
ipcMain.handle('set-log-level', (_e, level) => {
  const saved = saveConfig(require('./lib/diagnostics').setLogLevel(loadConfig(), level))
  logger.setLevel(saved.logLevel)
  return diagnosticsState()
})
ipcMain.handle('copy-log-path', () => {
  const logPath = logger.getLogPath()
  if (!logPath) return { ok: false, error: 'Log path is unavailable.' }
  clipboard.writeText(logPath)
  return { ok: true }
})
ipcMain.handle('reset-settings', async () => {
  const result = await dialog.showMessageBox(popover, { type: 'question', message: 'Reset MaxxToken settings?', detail: 'This resets appearance, provider selection, alerts, and layouts. Saved credentials and usage history are kept.', buttons: ['Cancel', 'Reset settings'], defaultId: 0, cancelId: 0 })
  if (result.response !== 1) return { ok: false, cancelled: true }
  const config = saveConfig(require('./lib/diagnostics').resetSettings(loadConfig()))
  configureRuntime(config)
  shortcutController.set(config.openUsagePrefs.globalShortcut)
  await applyOpenUsagePreferences(config.openUsagePrefs)
  reapplyUpdatePreferences(config.openUsagePrefs.updates)
  applyLoginItemSettings(config)
  syncSnapshot({ force: true, restart: true }).catch(() => {})
  return { ok: true, config }
})
ipcMain.handle('get-cli-status', () => cliState())
ipcMain.handle('install-cli', () => {
  if (!app.isPackaged) return { ok: false, error: 'Install the packaged MaxxToken app before installing its CLI.' }
  try {
    require('./lib/cli-installer').installCli({ executablePath: process.execPath, version: app.getVersion() })
    return { ok: true, ...cliState() }
  } catch (error) { return { ok: false, error: error.message } }
})
ipcMain.handle('uninstall-cli', () => {
  try {
    require('./lib/cli-installer').uninstallCli()
    return { ok: true, ...cliState() }
  } catch (error) { return { ok: false, error: error.message } }
})
ipcMain.handle('get-pricing-fallback-options', () => {
  const pricing = require('./lib/token-cost')
  return { claude: pricing.pricingFallbackOptions('claude'), codex: pricing.pricingFallbackOptions('codex') }
})
ipcMain.handle('get-proxy-settings', () => require('./lib/http').getProxyState())
ipcMain.handle('set-proxy-settings', (_e, payload) => {
  const http = require('./lib/http')
  const proxy = { enabled: payload?.enabled === true, url: http.normalizedProxyUrl(payload?.url) || '', bypassLoopback: true }
  if (proxy.enabled && !proxy.url) throw new Error('Enter a proxy address before enabling it.')
  const secretStore = require('./lib/secrets')
  if (payload?.credentials != null) secretStore.setProxyCredentials(payload.credentials)
  const config = saveConfig({ ...loadConfig(), proxy })
  configureRuntime(config)
  return http.getProxyState()
})
ipcMain.handle('get-openusage-prefs', () => openUsagePreferencesState())
ipcMain.handle('get-system-preferences', () => systemDisplayPreferences())
ipcMain.handle('set-openusage-prefs', async (_e, patch) => {
  const config = loadConfig()
  const next = openUsagePreferences.merge(config.openUsagePrefs, patch)
  if (next.globalShortcut !== config.openUsagePrefs.globalShortcut) {
    const result = shortcutController.set(next.globalShortcut)
    if (!result.ok) return { ...openUsagePreferencesState(), error: result.error }
  }
  config.openUsagePrefs = next
  saveConfig(config)
  if (patch?.updates) {
    reapplyUpdatePreferences(next.updates)
  }
  await applyOpenUsagePreferences(next)
  sendSystemPreferences()
  return openUsagePreferencesState()
})
ipcMain.handle('get-sync-status', () => syncStatus())
const activeCreditClaims = new Set()
function resolveCodexAccount(instanceId) {
  if (typeof instanceId !== 'string' || !/^codex@[0-9a-f]{12}$/.test(instanceId)) throw new Error('Choose a specific Codex account.')
  const account = require('./lib/provider-accounts').discoverCodexAccounts().find((item) => item.id === instanceId)
  if (!account) throw new Error('That Codex login is no longer available. Refresh and try again.')
  return account
}
ipcMain.handle('codex:prepare-reset-credit', async (_e, payload) => {
  try {
    const account = resolveCodexAccount(payload?.providerInstanceId)
    return await require('./lib/adapters/codex').prepareResetCredit(account, payload?.creditId)
  } catch (error) {
    return { ok: false, error: error.message || 'Could not check that credit.' }
  }
})
ipcMain.handle('codex:redeem-reset-credit', async (_e, payload) => {
  const key = payload?.redeemRequestId
  if (typeof key !== 'string' || !/^[0-9a-f-]{36}$/.test(key)) return { ok: false, error: 'Check the credit before using it.' }
  if (activeCreditClaims.has(key)) return { ok: false, error: 'This credit is already being processed.' }
  activeCreditClaims.add(key)
  try {
    const account = resolveCodexAccount(payload.providerInstanceId)
    const confirmation = await dialog.showMessageBox(popover, {
      type: 'warning', title: 'Use one Codex reset credit?',
      message: 'Use one reset credit for this Codex account?',
      detail: `${account.label || 'Selected account'}\nThis consumes the selected credit and resets eligible usage limits. This cannot be undone.`,
      buttons: ['Cancel', 'Use one credit'], defaultId: 0, cancelId: 0, noLink: true,
    })
    if (confirmation.response !== 1) return { ok: false, code: 'cancelled', cancelled: true }
    const currentAccount = resolveCodexAccount(payload.providerInstanceId)
    const result = await require('./lib/adapters/codex').redeemResetCredit(currentAccount, { ...payload, confirmed: true }, { skipTokenHistory: true })
    if (!result.ok) return result
    try {
      const refreshStartedAt = Date.now()
      const snapshot = await syncSnapshot({ force: true, heavy: false, restart: true })
      const refreshed = snapshot?.providers?.find((provider) => provider.id === currentAccount.id)
      if (!refreshed?.connected || refreshed.error || refreshed.account?.identityStamp !== currentAccount.identityStamp || !Number.isFinite(Number(refreshed.lastUpdatedAt)) || Number(refreshed.lastUpdatedAt) < refreshStartedAt) {
        throw new Error('Waiting for refreshed account usage.')
      }
      return { ok: true, code: result.code, alreadyRedeemed: result.alreadyRedeemed, snapshot }
    } catch {
      return { ok: false, code: 'refresh_pending', redeemed: true, error: 'Credit applied; usage refresh is pending. Retry to check the same credit.' }
    }
  } catch (error) {
    return { ok: false, error: error.message || 'Could not apply that credit. Retry to check the same request.' }
  } finally {
    activeCreditClaims.delete(key)
  }
})
ipcMain.handle('get-capture-privacy-status', () => privacyMonitor?.getStatus())
ipcMain.handle('set-history-sync', async (_e, value) => {
  const config = loadConfig()
  config.openUsagePrefs = openUsagePreferences.merge(config.openUsagePrefs, { sync: { enabled: value?.enabled === true } })
  saveConfig(config)
  await applyOpenUsagePreferences(config.openUsagePrefs)
  return syncStatus()
})
ipcMain.handle('register-global-shortcut', (_e, accelerator) => {
  const result = shortcutController.set(accelerator)
  if (result.ok) {
    const config = loadConfig()
    config.openUsagePrefs = openUsagePreferences.merge(config.openUsagePrefs, { globalShortcut: result.accelerator })
    saveConfig(config)
  }
  return result
})
let copyingCard = false
ipcMain.handle('copy-burn-card-png', async (_e, payload) => {
  if (copyingCard) return { ok: false, error: 'A card is already being copied.' }
  copyingCard = true
  let cardWindow
  try {
    const appearance = loadConfig().openUsagePrefs.appearance
    const theme = appearance === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : appearance
    const card = buildCard(lastSnapshot, { ...payload, theme })
    cardWindow = new BrowserWindow({ width: card.width, height: card.height, show: false, useContentSize: true, frame: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } })
    await cardWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(card.html)}`)
    await cardWindow.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))')
    const contentHeight = await cardWindow.webContents.executeJavaScript('Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)) + 1')
    cardWindow.setContentSize(card.width, Math.min(6000, Math.max(card.height, contentHeight)))
    await cardWindow.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    const image = await cardWindow.webContents.capturePage(undefined, { stayHidden: true })
    if (image.isEmpty()) throw new Error('The card could not be rendered. Try again.')
    clipboard.writeImage(image)
    return { ok: true, width: image.getSize().width, height: image.getSize().height }
  } catch (error) {
    return { ok: false, error: error.message || 'Could not copy the image.' }
  } finally {
    if (cardWindow && !cardWindow.isDestroyed()) cardWindow.destroy()
    copyingCard = false
  }
})
function detectedProviders(config = loadConfig()) {
  const detections = providerDetection.detectLocalProviders()
  for (const id of Object.keys(config.providers || {})) {
    if (hasKey(id)) detections[id] = { detected: true, reason: 'Saved credentials found', evidence: 'secrets', evidenceType: 'credentials' }
  }
  return detections
}
ipcMain.handle('detect-providers', () => detectedProviders())
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
  const current = loadConfig()
  config.openUsagePrefs = current.openUsagePrefs
  config.logLevel = current.logLevel
  config.proxy = current.proxy
  config.providerOptOuts = mergeProviderOptOuts(current, config)
  const saved = saveConfig(config)
  configureRuntime(saved)
  applyLoginItemSettings(saved)
  const reprice = JSON.stringify(saved.unknownModelFallback) !== JSON.stringify(current.unknownModelFallback) || saved.pricingSupplementUrl !== current.pricingSupplementUrl
  return syncSnapshot({ force: true, heavy: reprice, restart: true })
})
ipcMain.handle('save-burn-preferences', (_e, preferences) => {
  const config = loadConfig()
  config.metricLayouts = preferences?.metricLayouts
  config.trayPins = preferences?.trayPins
  config.expandedProviderIds = preferences?.expandedProviderIds
  if (preferences?.trayMetric === 'pins' || preferences?.trayMetric === 'burnbar') config.trayMetric = preferences.trayMetric
  const saved = saveConfig(config)
  updateTrayAppearance(lastSnapshot, saved)
  return saved
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
  const provider = lastSnapshot?.providers?.find((entry) => entry.id === payload?.id)
  const url = providerLinks.linkForProvider(provider?.providerFamily || payload?.id, payload?.kind)
  if (!url) throw new Error('Unknown provider link')
  shell.openExternal(url)
  return { ok: true }
})

// Idea Stream: route generation/build to the most-underused subscription.
function leastUsedProvider(snap) {
  const target = snap.maxxTarget
  if (target?.id && providerCli(target)) return { id: target.id, name: target.name, cli: providerCli(target) }
  const tracked = snap.providers.filter((p) => p.connected && p.capturedPct != null && providerCli(p))
  if (!tracked.length) return { id: 'claude', name: 'Claude', cli: 'claude' }
  const p = tracked.sort((a, b) => a.capturedPct - b.capturedPct)[0]
  return { id: p.id, name: p.name, cli: providerCli(p) }
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
  const tracked = providers.filter((p) => p.connected && providerCli(p))
  if (!tracked.length) return { id: 'claude', name: 'Claude', plan: 'Max', cli: 'claude', leftValue: null, usedPct: null }
  const p = tracked
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      plan: provider.plan || '',
      cli: providerCli(provider),
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
    .filter((p) => p.connected && providerCli(p))
    .map((p) => ({
      id: p.id,
      name: p.name,
      plan: p.plan || '',
      cli: providerCli(p),
      usedPct: p.capturedPct == null ? null : Math.round(p.capturedPct),
      supportsPrompt: PROMPT_CAPABLE_CLIS.has(providerCli(p)),
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

// Token Coach (beta) — Daily Verdict cards from real local logs via the
// session collector. Preview fixtures only when no usage data exists yet
// (fresh machine), clearly labeled in the UI.
ipcMain.handle('coach-verdicts', async () => {
  const { runDailyVerdict } = require('./lib/token-coach')
  try {
    const { collectCoachInput } = require('./lib/token-coach/collect')
    const input = collectCoachInput({ historyDays: 7 })
    if (input.sessions.length) {
      return { ok: true, preview: false, generatedAt: Date.now(), meta: input.meta, verdicts: runDailyVerdict(input) }
    }
    const { previewInput } = require('./lib/token-coach/fixtures')
    return { ok: true, preview: true, generatedAt: Date.now(), verdicts: runDailyVerdict(previewInput) }
  } catch (err) {
    logger.error('coach', 'coach-verdicts failed', { error: err && err.message })
    return { ok: false, preview: false, generatedAt: Date.now(), verdicts: [], error: 'Could not build verdicts.' }
  }
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

ipcMain.handle('model-fit-recommend', async (_e, payload) => {
  const snap = await readSnapshot({ staleOk: true })
  const selectedIds = new Set(Array.isArray(payload?.models) ? payload.models.map((m) => String(m)) : [])
  return recommendModelFit({
    dir: payload?.dir || payload?.folder,
    goal: payload?.goal,
    models: selectedIds.size ? projectMissionModels(snap, selectedIds) : [],
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

// Token Coach licensing — single licenseState source of truth (licensing
// spec section 15.5). Lazy singleton: the manager reads/writes license.json
// in userData and talks to Polar; everything paid gates off its getState().
let _licenseManager = null
function licenseManager() {
  if (!_licenseManager) {
    const { createLicenseManager } = require('./lib/license')
    _licenseManager = createLicenseManager({
      dir: app.getPath('userData'),
      log: (msg, detail) => logger.warn('license', msg, { detail }),
    })
  }
  return _licenseManager
}

ipcMain.handle('license-state', () => licenseManager().getState())
ipcMain.handle('license-activate', (_e, payload) =>
  licenseManager().activate(payload && payload.key, payload && payload.email),
)
ipcMain.handle('license-deactivate', () => licenseManager().deactivate())

// Silent revalidation (spec section 17): the manager self-throttles to once
// per 7 days, so a daily timer just gives it chances while the app is
// running. Unreachable checks never lock — fail open, log quietly.
let licenseRevalidateTimer = null
function setupLicenseRevalidation() {
  const kick = () => licenseManager().revalidateIfDue().catch(() => {})
  setTimeout(kick, 30_000) // let launch I/O settle first
  licenseRevalidateTimer = setInterval(kick, 24 * 60 * 60 * 1000)
}

let updatePromptShown = false
// `version` is ALWAYS the running app's version and must never be overwritten by
// update-feed events (those describe the latest *available* release, surfaced
// separately as `availableVersion`). Conflating them made "Current version" show
// the newest published release instead of what's installed.
const initialUpdatePreferences = updatePreferences.normalize(loadConfig().openUsagePrefs?.updates)
let updateState = { status: 'idle', version: app.getVersion(), availableVersion: null, ...initialUpdatePreferences }

function emitUpdate(patch) {
  updateState = { ...updateState, ...patch }
  if (popover && !popover.isDestroyed()) popover.webContents.send('update-status', updateState)
}

const updatePolicy = updatePreferences.createUpdatePolicy({
  updater: autoUpdater,
  isPackaged: () => app.isPackaged,
  getPreferences: () => loadConfig().openUsagePrefs?.updates,
  onChecking: () => emitUpdate({ status: 'checking', error: null }),
  onAvailable: (info) => emitUpdate({ status: 'downloading', availableVersion: info?.version || null, percent: 0, error: null }),
  onNotAvailable: (info) => emitUpdate({ status: 'up-to-date', availableVersion: info?.version || null, percent: 0, error: null }),
  onError: (error) => emitUpdate({ status: 'error', error: error?.message || String(error) }),
})

function currentUpdatePreferences() {
  const preferences = updatePreferences.normalize(loadConfig().openUsagePrefs?.updates)
  return { ...preferences, manifests: updatePreferences.manifestNames(preferences) }
}

function reapplyUpdatePreferences(preferences) {
  const current = updatePreferences.normalize(preferences)
  emitUpdate({ ...current, status: 'idle', availableVersion: null, percent: 0, error: null })
  updatePolicy.apply()
  return current
}

function setupAutoUpdate() {
  if (!app.isPackaged) return // updates only run in a built, signed app

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('download-progress', (p) =>
    updatePolicy.hasCurrentCandidate() && emitUpdate({ status: 'downloading', percent: Math.round(p.percent || 0) }),
  )
  autoUpdater.on('error', () => {})

  autoUpdater.on('update-downloaded', async (info) => {
    if (!updatePolicy.markDownloaded(info?.version)) return
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
      detail: 'Restart MaxxToken to apply it, or choose Restart & install in Settings later.',
    })
    if (response === 0 && updatePolicy.canInstall(info?.version)) autoUpdater.quitAndInstall()
    else updatePromptShown = false
  })

  reapplyUpdatePreferences(loadConfig().openUsagePrefs?.updates)
}

ipcMain.handle('get-update-status', () => updateState)
ipcMain.handle('get-update-preferences', () => currentUpdatePreferences())
ipcMain.handle('set-update-preferences', (_e, patch) => {
  const config = loadConfig()
  const preferences = updatePreferences.merge(config.openUsagePrefs?.updates, patch)
  config.openUsagePrefs = openUsagePreferences.merge(config.openUsagePrefs, { updates: preferences })
  saveConfig(config)
  reapplyUpdatePreferences(preferences)
  return currentUpdatePreferences()
})
ipcMain.handle('check-updates', async () => {
  if (!app.isPackaged) {
    emitUpdate({ status: 'dev', version: app.getVersion() })
    return updateState
  }
  try {
    await updatePolicy.checkManual()
  } catch (err) {
    emitUpdate({ status: 'error', error: err && err.message ? err.message : String(err) })
  }
  return updateState
})
ipcMain.handle('install-update', () => {
  if (updateState.status === 'ready' && updatePolicy.canInstall(updateState.availableVersion)) autoUpdater.quitAndInstall()
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
    let initialConfig = loadConfig()
    if (initialConfig.onboardingComplete) {
      const detectedConfig = providerDetection.applyDetectionsToConfig(initialConfig, detectedProviders(initialConfig))
      if (Object.keys(detectedConfig.providers).some((id) => detectedConfig.providers[id].enabled !== initialConfig.providers[id]?.enabled)) initialConfig = saveConfig(detectedConfig)
    }
    configureRuntime(initialConfig)
    applyLoginItemSettings()
    nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS
    lastSnapshot = cachedSnapshot()
    lastLocalSnapshot = lastSnapshot
    if (lastSnapshot) logger.info('snapshot-cache', 'loaded', { generatedAt: lastSnapshot.generatedAt })
    createPopover()
    createTray()
    privacyMonitor = capturePrivacy.createCapturePrivacyMonitor({
      resourcesPath: process.resourcesPath,
      onChange: (state) => {
        updateTrayAppearance(lastSnapshot)
        if (popover && !popover.isDestroyed()) popover.webContents.send('capture-privacy-status', state)
      },
    })
    applyOpenUsagePreferences(loadConfig().openUsagePrefs).catch((error) => logger.warn('preferences', 'initialization failed', { error: error.message }))
    historySyncTimer = setInterval(() => {
      if (historySync?.getStatus().enabled && lastLocalSnapshot) historySync.syncNow().catch((error) => logger.warn('history-sync', 'refresh failed', { error: error.message }))
    }, 60000)
    shortcutController.set(loadConfig().openUsagePrefs.globalShortcut)
    nativeTheme.on('updated', sendSystemPreferences)
    // Prime token/cost data once on launch, then split cadence: light every
    // 30s (windows + balances), heavy hourly (also scans token-history logs).
    syncSnapshot({ force: true, heavy: true }).catch(() => {})
    refreshTimer = setInterval(() => {
      nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS
      syncSnapshot({ force: true, heavy: false }).catch(() => {})
    }, REFRESH_INTERVAL_MS)
    heavyRefreshTimer = setInterval(() => syncSnapshot({ force: true, heavy: true }).catch(() => {}), HEAVY_REFRESH_INTERVAL_MS)
    localApi.startLocalApi({
      port: loadConfig().localApiPort,
      getSnapshot: () => lastSnapshot,
      requestRefresh: () => { syncSnapshot({ force: true }).catch(() => {}) },
      logger,
    })
    setupAutoUpdate()
    setupLicenseRevalidation()
  })
}

app.on('before-quit', () => {
  clearInterval(historySyncTimer)
  privacyMonitor?.stop()
  shortcutController.dispose()
  nativeTheme.removeListener('updated', sendSystemPreferences)
  clearInterval(refreshTimer)
  clearInterval(heavyRefreshTimer)
  updatePolicy.stop()
  clearInterval(licenseRevalidateTimer)
  localApi.stopLocalApi()
  for (const child of activeSnapshotWorkers) {
    try { child.kill() } catch {}
  }
  activeSnapshotWorkers.clear()
})
app.on('window-all-closed', (e) => e.preventDefault())
