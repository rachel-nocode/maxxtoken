const updatePreferences = require('./update-preferences')

const DEFAULTS = Object.freeze({
  appearance: 'system',
  density: 'comfortable',
  reduceAnimations: false,
  timeFormat: 'system',
  resetDisplay: 'countdown',
  combinedUsageExpanded: false,
  globalShortcut: null,
  paceAlerts: { nearExhaustion: false, runOut: false },
  capturePrivacy: false,
  sync: { enabled: false },
  updates: updatePreferences.DEFAULTS,
})

function normalize(value) {
  const raw = value && typeof value === 'object' ? value : {}
  return {
    appearance: ['system', 'dark', 'light'].includes(raw.appearance) ? raw.appearance : DEFAULTS.appearance,
    density: ['comfortable', 'compact'].includes(raw.density) ? raw.density : DEFAULTS.density,
    reduceAnimations: raw.reduceAnimations === true,
    timeFormat: ['system', '12h', '24h'].includes(raw.timeFormat) ? raw.timeFormat : DEFAULTS.timeFormat,
    resetDisplay: raw.resetDisplay === 'exact' ? 'exact' : 'countdown',
    combinedUsageExpanded: raw.combinedUsageExpanded === true,
    globalShortcut: typeof raw.globalShortcut === 'string' && raw.globalShortcut.trim().length <= 100 ? raw.globalShortcut.trim() || null : null,
    paceAlerts: { nearExhaustion: raw.paceAlerts?.nearExhaustion === true, runOut: raw.paceAlerts?.runOut === true },
    capturePrivacy: raw.capturePrivacy === true,
    sync: { enabled: raw.sync?.enabled === true },
    updates: updatePreferences.normalize(raw.updates),
  }
}

function merge(current, patch) {
  const base = normalize(current)
  const update = patch && typeof patch === 'object' ? patch : {}
  return normalize({
    ...base,
    ...update,
    paceAlerts: { ...base.paceAlerts, ...update.paceAlerts },
    sync: { ...base.sync, ...update.sync },
    updates: updatePreferences.merge(base.updates, update.updates),
  })
}

function createShortcutController(globalShortcut, onToggle) {
  let accelerator = null
  let error = null
  return {
    status: () => ({ accelerator, registered: !!accelerator && globalShortcut.isRegistered(accelerator), error }),
    set(value) {
      if (value != null && (typeof value !== 'string' || value.length > 100)) return { ok: false, accelerator, error: 'Choose a valid keyboard shortcut.' }
      const candidate = normalize({ globalShortcut: value }).globalShortcut
      if (candidate === accelerator && (!candidate || globalShortcut.isRegistered(candidate))) return { ok: true, accelerator }
      if (candidate) {
        try {
          if (!globalShortcut.register(candidate, onToggle)) throw new Error('That shortcut is already in use. Choose another.')
        } catch (err) {
          error = err.message || 'Could not register that shortcut.'
          return { ok: false, accelerator, error }
        }
      }
      if (accelerator && accelerator !== candidate) globalShortcut.unregister(accelerator)
      accelerator = candidate
      error = null
      return { ok: true, accelerator }
    },
    dispose() {
      if (accelerator) globalShortcut.unregister(accelerator)
      accelerator = null
    },
  }
}

module.exports = { DEFAULTS, normalize, merge, createShortcutController }
