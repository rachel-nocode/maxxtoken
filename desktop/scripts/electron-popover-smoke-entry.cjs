const electron = require('electron')

if (!electron || typeof electron !== 'object' || !electron.app || !electron.BrowserWindow) {
  process.stderr.write('Electron smoke test must be launched through the repository smoke runner.\n')
  process.exit(1)
}

const assert = require('node:assert/strict')
const { app, BrowserWindow } = electron
const { popoverWindowOptions, presentPopoverWindow } = require('../lib/popover-window')

const userData = process.env.MAXXTOKEN_SMOKE_USER_DATA
if (!userData) {
  process.stderr.write('Electron smoke test requires an isolated user data path.\n')
  process.exit(1)
}

app.setPath('userData', userData)

async function run() {
  if (process.platform === 'darwin') app.dock.hide()
  const options = popoverWindowOptions(process.platform, '', { width: 280, height: 120 })
  delete options.webPreferences.preload
  const window = new BrowserWindow({ ...options, width: 280, height: 120 })
  await window.loadURL('data:text/html,<body style="background:%23222222"></body>')
  presentPopoverWindow(window)
  await new Promise(resolve => setTimeout(resolve, 250))
  assert.equal(window.isVisible(), true)
  assert.equal(window.isFocusable(), true)
  assert.equal(window.isFocused(), true)
  if (process.platform === 'darwin') assert.equal(window.isVisibleOnAllWorkspaces(), true)
  window.destroy()
  process.stdout.write('Electron popover smoke test passed.\n')
  app.quit()
}

app.whenReady().then(run).catch(error => {
  process.stderr.write(`${error.message}\n`)
  app.exit(1)
})
