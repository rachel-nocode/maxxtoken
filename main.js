const { app, Tray, BrowserWindow, Menu, nativeImage, ipcMain, shell, dialog, screen } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const { snapshot } = require('./lib/aggregate')
const { loadConfig, saveConfig, FILE } = require('./lib/config')
const { generateIdeas, recordIdeaFeedback } = require('./lib/ideas')
const { openBuild } = require('./lib/launch')
const { installedTerminals } = require('./lib/terminals')

// Provider id -> the CLI binary that spends that subscription.
const CLI_FOR = {
  claude: 'claude',
  codex: 'codex',
  kimi: 'kimi',
  gemini: 'gemini',
  grok: 'grok',
}

let tray = null
let popover = null
let refreshTimer = null
let lastSnapshot = null
let snapshotInFlight = null

const POPOVER_WIDTH = 412
const POPOVER_HEIGHT = 680
const gotSingleInstanceLock = app.requestSingleInstanceLock()

function trayMoney(n) {
  return '$' + Math.round(n || 0).toLocaleString('en-US')
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
  const b = tray.getBounds()
  const center = { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }
  const display = screen.getDisplayNearestPoint(center)
  const area = display.workArea
  const margin = 8
  const minX = area.x + margin
  const maxX = Math.max(minX, area.x + area.width - POPOVER_WIDTH - margin)
  const minY = area.y + margin
  const maxY = Math.max(minY, area.y + area.height - POPOVER_HEIGHT - margin)
  const x = Math.min(maxX, Math.max(minX, Math.round(center.x - POPOVER_WIDTH / 2)))
  let y = Math.round(b.y + b.height + 4)
  if (y > maxY) y = Math.round(b.y - POPOVER_HEIGHT - 4)
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

async function showPopover() {
  if (!popover || !tray) return
  popover.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  popover.setAlwaysOnTop(true, 'pop-up-menu')
  positionPopover()
  popover.show()
  popover.moveTop()
  popover.focus()
  if (lastSnapshot) popover.webContents.send('snapshot', lastSnapshot)
  try {
    popover.webContents.send('snapshot', await readSnapshot())
  } catch {
    /* renderer falls back to its own fetch */
  }
}

async function readSnapshot({ staleOk = false, force = false } = {}) {
  if (force) snapshotInFlight = null

  if (staleOk && lastSnapshot) {
    if (!snapshotInFlight) {
      snapshotInFlight = snapshot()
        .then((snap) => {
          lastSnapshot = snap
          return snap
        })
        .finally(() => {
          snapshotInFlight = null
        })
    }
    return lastSnapshot
  }

  if (!snapshotInFlight) {
    snapshotInFlight = snapshot()
      .then((snap) => {
        lastSnapshot = snap
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
  try {
    const snap = await readSnapshot({ staleOk: true })
    title = ` ${trayMoney(snap.totals.remaining ?? snap.totals.burned)}`
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

ipcMain.handle('get-snapshot', () => readSnapshot())
ipcMain.handle('refresh-provider', async (_e, id) => {
  const config = loadConfig()
  if (!config.providers[id]) throw new Error('Unknown provider')
  const snap = await readSnapshot({ force: true })
  updateTray()
  if (popover && popover.isVisible()) popover.webContents.send('snapshot', snap)
  return snap
})
ipcMain.handle('get-config', () => loadConfig())
ipcMain.handle('get-terminals', () => installedTerminals())
ipcMain.handle('save-config', (_e, config) => {
  saveConfig(config)
  applyLoginItemSettings(config)
  updateTray()
  return readSnapshot()
})
ipcMain.on('close-popover', () => popover && popover.hide())
ipcMain.on('open-config-file', () => shell.showItemInFolder(FILE))
ipcMain.on('open-site', () => shell.openExternal('https://maxxtoken.app'))

// Idea Stream: route generation/build to the most-underused subscription.
function leastUsedProvider(snap) {
  const tracked = snap.providers.filter((p) => p.connected && p.capturedPct != null && CLI_FOR[p.id])
  if (!tracked.length) return { id: 'claude', name: 'Claude', cli: 'claude' }
  const p = tracked.sort((a, b) => a.capturedPct - b.capturedPct)[0]
  return { id: p.id, name: p.name, cli: CLI_FOR[p.id] }
}

ipcMain.handle('forge-ideas', async () => {
  const snap = await snapshot()
  const target = leastUsedProvider(snap)
  const ideas = await generateIdeas(target)
  return { target, ideas }
})

ipcMain.handle('forge-feedback', (_e, payload) => {
  recordIdeaFeedback(payload && payload.idea, payload && payload.feedback)
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
  const config = loadConfig()
  const result = await openBuild({
    dir: picked.filePaths[0],
    cli: idea.cli || 'claude',
    prompt: idea.firstPrompt || idea.pitch || '',
    terminal: config.terminal || 'Terminal',
  })
  return { ok: result.ok, terminal: result.terminal, dir: picked.filePaths[0], error: result.error }
})

let updateTimer = null
let updatePromptShown = false

function setupAutoUpdate() {
  if (!app.isPackaged) return // updates only run in a built, signed app

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', async (info) => {
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

  autoUpdater.on('error', () => {
    /* update failures are non-fatal; app keeps running on current version */
  })

  autoUpdater.checkForUpdates().catch(() => {})
  updateTimer = setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000)
}

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
    createPopover()
    createTray()
    refreshTimer = setInterval(updateTray, 5 * 60 * 1000)
    setupAutoUpdate()
  })
}

app.on('before-quit', () => {
  clearInterval(refreshTimer)
  clearInterval(updateTimer)
})
app.on('window-all-closed', (e) => e.preventDefault())
