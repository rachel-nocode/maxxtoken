const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const diagnostics = require('../lib/diagnostics')
const updatePreferences = require('../lib/update-preferences')

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function token() {
  return { cancelled: false, cancel() { this.cancelled = true } }
}

function updateResult(version, cancellationToken = token()) {
  return { isUpdateAvailable: true, updateInfo: { version }, cancellationToken }
}

test('update preferences default to stable automatic checks and require explicit beta opt-in', () => {
  assert.deepEqual(updatePreferences.normalize(), { channel: 'stable', automaticChecks: true })
  assert.deepEqual(updatePreferences.normalize({ channel: 'nightly', automaticChecks: 0 }), { channel: 'stable', automaticChecks: true })
  assert.deepEqual(updatePreferences.normalize({ channel: 'beta', automaticChecks: false }), { channel: 'beta', automaticChecks: false })
})

test('stable and beta channels use platform updater manifest conventions', () => {
  assert.deepEqual(updatePreferences.manifestNames({ channel: 'stable' }), { mac: 'latest-mac.yml', windows: 'latest.yml' })
  assert.deepEqual(updatePreferences.manifestNames({ channel: 'beta' }), { mac: 'beta-mac.yml', windows: 'beta.yml' })
})

test('configuring either channel disables electron-updater downgrade behavior', () => {
  const updater = {
    set channel(value) { this._channel = value; this.allowDowngrade = true },
    get channel() { return this._channel },
  }
  updatePreferences.configureUpdater(updater, { channel: 'beta' })
  assert.equal(updater.channel, 'beta')
  assert.equal(updater.allowPrerelease, true)
  assert.equal(updater.allowDowngrade, false)
  updatePreferences.configureUpdater(updater, { channel: 'stable' })
  assert.equal(updater.channel, 'latest')
  assert.equal(updater.allowPrerelease, false)
  assert.equal(updater.allowDowngrade, false)
  assert.equal(updater.autoDownload, false)
  assert.equal(updater.autoInstallOnAppQuit, false)
})

test('disabling automatic checks leaves manual checks functional', async () => {
  const calls = []
  const timers = new Map()
  let nextTimer = 1
  let preferences = { channel: 'beta', automaticChecks: false }
  const updater = {
    set channel(value) { this._channel = value; this.allowDowngrade = true },
    get channel() { return this._channel },
    async checkForUpdates() { calls.push(this._channel); return { isUpdateAvailable: false, updateInfo: { version: '1.0.0' } } },
    async downloadUpdate() { throw new Error('not expected') },
  }
  const policy = updatePreferences.createUpdatePolicy({
    updater,
    isPackaged: () => true,
    getPreferences: () => preferences,
    setIntervalFn(fn) { const id = nextTimer++; timers.set(id, fn); return id },
    clearIntervalFn(id) { timers.delete(id) },
  })

  policy.apply()
  assert.deepEqual(calls, [])
  assert.equal(policy.hasScheduledChecks(), false)
  await policy.checkAutomatic()
  assert.deepEqual(calls, [])
  await policy.checkManual()
  assert.deepEqual(calls, ['beta'])

  preferences = { channel: 'stable', automaticChecks: true }
  policy.apply()
  await policy.checkAutomatic()
  assert.deepEqual(calls, ['beta', 'latest'])
  assert.equal(policy.hasScheduledChecks(), true)
  assert.equal(updater.allowDowngrade, false)
  policy.stop()
  assert.equal(timers.size, 0)
})

test('stable rejects prerelease versions even if a stale feed returns one', () => {
  assert.equal(updatePreferences.isVersionAllowed('1.2.3-beta.4', { channel: 'stable' }), false)
  assert.equal(updatePreferences.isVersionAllowed('1.2.3', { channel: 'stable' }), true)
  assert.equal(updatePreferences.isVersionAllowed('1.2.3-beta.4', { channel: 'beta' }), true)
  assert.equal(updatePreferences.isVersionAllowed('not-a-version', { channel: 'beta' }), false)
})

test('a beta download completing after a stable switch is cancelled and ignored', async () => {
  let preferences = { channel: 'beta', automaticChecks: true }
  const betaDownload = deferred()
  const betaToken = token()
  const calls = []
  let betaDownloading = false
  const updater = {
    set channel(value) { this._channel = value; this.allowDowngrade = true },
    get channel() { return this._channel },
    async checkForUpdates() {
      calls.push(this._channel)
      if (this._channel === 'beta') return updateResult('2.0.0-beta.1', betaToken)
      assert.equal(betaDownloading, false)
      return { isUpdateAvailable: false, updateInfo: { version: '1.9.0' } }
    },
    async downloadUpdate() {
      betaDownloading = true
      await betaDownload.promise
      betaDownloading = false
      return []
    },
  }
  const policy = updatePreferences.createUpdatePolicy({ updater, isPackaged: () => true, getPreferences: () => preferences })
  policy.apply()
  const betaCheck = policy.checkManual()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(policy.hasCurrentCandidate(), true)

  preferences = { channel: 'stable', automaticChecks: true }
  policy.apply()
  assert.equal(betaToken.cancelled, true)
  assert.equal(policy.markDownloaded('2.0.0-beta.1'), false)
  betaDownload.resolve()
  await betaCheck
  await policy.checkAutomatic()
  assert.deepEqual(calls, ['beta', 'latest'])
  policy.stop()
})

test('switching to stable invalidates a staged beta and never arms install-on-quit', async () => {
  let preferences = { channel: 'beta', automaticChecks: false }
  const download = deferred()
  const betaToken = token()
  const updater = {
    autoInstallOnAppQuit: true,
    set channel(value) { this._channel = value; this.allowDowngrade = true },
    get channel() { return this._channel },
    async checkForUpdates() { return updateResult('2.0.0-beta.2', betaToken) },
    async downloadUpdate() { await download.promise; return [] },
  }
  const policy = updatePreferences.createUpdatePolicy({ updater, isPackaged: () => true, getPreferences: () => preferences })
  policy.apply()
  const checking = policy.checkManual()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(policy.markDownloaded('2.0.0-beta.2'), true)
  assert.equal(policy.canInstall('2.0.0-beta.2'), true)
  assert.equal(updater.autoInstallOnAppQuit, false)

  preferences = { channel: 'stable', automaticChecks: false }
  policy.apply()
  assert.equal(policy.canInstall('2.0.0-beta.2'), false)
  assert.equal(updater.autoInstallOnAppQuit, false)
  download.resolve()
  await checking
  policy.stop()
})

test('settings reset reapplies stable defaults and invalidates beta work', async () => {
  let config = { openUsagePrefs: { updates: { channel: 'beta', automaticChecks: false } } }
  const download = deferred()
  const betaToken = token()
  const channels = []
  const updater = {
    set channel(value) { this._channel = value; this.allowDowngrade = true },
    get channel() { return this._channel },
    async checkForUpdates() {
      channels.push(this._channel)
      if (this._channel === 'beta') return updateResult('3.0.0-beta.1', betaToken)
      return { isUpdateAvailable: false, updateInfo: { version: '2.9.0' } }
    },
    async downloadUpdate() { await download.promise; return [] },
  }
  const policy = updatePreferences.createUpdatePolicy({ updater, isPackaged: () => true, getPreferences: () => config.openUsagePrefs.updates })
  policy.apply()
  const betaCheck = policy.checkManual()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(policy.markDownloaded('3.0.0-beta.1'), true)

  config = diagnostics.resetSettings(config)
  assert.deepEqual(config.openUsagePrefs.updates, { channel: 'stable', automaticChecks: true })
  policy.apply()
  assert.equal(betaToken.cancelled, true)
  assert.equal(policy.canInstall('3.0.0-beta.1'), false)
  download.resolve()
  await betaCheck
  await policy.checkAutomatic()
  assert.deepEqual(channels, ['beta', 'latest'])
  policy.stop()

  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
  const resetHandler = main.slice(main.indexOf("ipcMain.handle('reset-settings'"), main.indexOf("ipcMain.handle('get-cli-status'"))
  assert.match(resetHandler, /reapplyUpdatePreferences\(config\.openUsagePrefs\.updates\)/)
})
