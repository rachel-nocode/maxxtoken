const assert = require('node:assert/strict')
const test = require('node:test')
const prefs = require('../lib/openusage-preferences')
const { bindLegacyLayouts } = require('../lib/account-layout-migration')

test('P1 preferences keep sharing and notifications opt-in and normalize nested patches', () => {
  const defaults = prefs.normalize()
  assert.equal(defaults.capturePrivacy, false)
  assert.equal(defaults.sync.enabled, false)
  assert.equal(defaults.paceAlerts.runOut, false)
  assert.deepEqual(defaults.updates, { channel: 'stable', automaticChecks: true })
  const first = prefs.merge(defaults, { paceAlerts: { nearExhaustion: true }, density: 'compact' })
  const second = prefs.merge(first, { paceAlerts: { runOut: true }, sync: { enabled: true } })
  assert.deepEqual(second.paceAlerts, { nearExhaustion: true, runOut: true })
  assert.equal(second.density, 'compact')
  assert.equal(prefs.normalize({ sync: { enabled: 'true' }, appearance: 'invalid' }).sync.enabled, false)
  assert.equal(prefs.normalize({ appearance: 'invalid' }).appearance, 'system')
  const updates = prefs.merge(defaults, { updates: { channel: 'beta', automaticChecks: false } })
  assert.deepEqual(updates.updates, { channel: 'beta', automaticChecks: false })
})

test('global shortcut conflicts preserve the previous registration and clearing removes it', () => {
  const registered = new Set()
  const ctrl = prefs.createShortcutController({
    register(key) { if (key === 'Command+Q') return false; registered.add(key); return true },
    unregister(key) { registered.delete(key) },
    isRegistered(key) { return registered.has(key) },
  }, () => {})
  assert.equal(ctrl.set('Command+Shift+M').ok, true)
  assert.equal(ctrl.set('Command+Q').ok, false)
  assert.equal(ctrl.status().accelerator, 'Command+Shift+M')
  assert.equal(ctrl.status().registered, true)
  assert.equal(ctrl.set({}).ok, false)
  assert.equal(ctrl.set(null).ok, true)
  assert.equal(registered.size, 0)
})

test('account layouts bind once and never migrate to the next signed-in account', () => {
  const id = 'claude@123456789abc'
  const config = { metricLayouts: { claude: { order: ['claude:window:5h-session'], hidden: ['claude:window:weekly'] } }, trayPins: [{ providerId: 'claude', metricId: 'claude:window:5h-session' }], expandedProviderIds: ['claude'] }
  const first = bindLegacyLayouts(config, [{ id, providerFamily: 'claude', connected: true, account: { isDefault: true } }])
  assert.equal(first.changed, true)
  assert.equal(first.config.trayPins[0].providerId, id)
  assert.equal(first.config.trayPins[0].metricId, 'claude-123456789abc:window:5h-session')
  const next = bindLegacyLayouts(first.config, [{ id: 'claude@aaaaaaaaaaaa', providerFamily: 'claude', connected: true, account: { isDefault: true } }])
  assert.equal(next.changed, false)
  assert.equal(next.config.metricLayouts['claude@aaaaaaaaaaaa'], undefined)
  assert.deepEqual(config.expandedProviderIds, ['claude'])
})
