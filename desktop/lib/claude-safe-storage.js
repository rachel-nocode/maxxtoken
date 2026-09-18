const crypto = require('crypto')
const { execFileSync: defaultExecFileSync } = require('child_process')

const SERVICE = 'Claude Safe Storage'
const ACCOUNT = 'Claude Key'
const DECLINE_TTL_MS = 24 * 60 * 60 * 1000
const RETRY_COOLDOWN_MS = 10 * 60 * 1000
const KEYCHAIN_TIMEOUT_MS = 15000

let managed = false
let persisted = {}
let cached
let discovered = {}
let onDiscovered = null

function setKeyStore(store) {
  managed = true
  persisted = store && typeof store === 'object' ? store : {}
  cached = undefined
  discovered = {}
}

function setDiscoveryListener(listener) {
  onDiscovered = typeof listener === 'function' ? listener : null
}

function report(entry) {
  discovered[SERVICE] = entry
  if (onDiscovered) {
    try { onDiscovered(SERVICE, entry) } catch { /* persistence is best-effort */ }
  }
}

function takeDiscoveredKeys() {
  return { ...discovered }
}

function persistedKey(entry) {
  if (!entry || typeof entry.key !== 'string') return null
  try {
    const key = Buffer.from(entry.key, 'base64')
    return key.length === 16 ? key : null
  } catch {
    return null
  }
}

function derivedKey(options = {}) {
  if (cached !== undefined) return cached

  const entry = persisted[SERVICE]
  if (entry && entry.key) {
    cached = persistedKey(entry)
    return cached
  }
  const now = Number(options.now) || Date.now()
  if (entry && Number(entry.declinedUntil) > now) {
    cached = null
    return null
  }

  // Standalone Node/CLI processes cannot seal a derived key with Electron
  // safeStorage. Only a worker managed by the Electron parent may prompt.
  if (!managed && options.allowUnmanagedKeychain !== true) {
    cached = null
    return null
  }

  const execFileSync = options.execFileSync || defaultExecFileSync
  // Persist a short backoff before opening the modal. If this worker is killed
  // while the dialog is open, its replacement still will not open another one.
  report({ declinedUntil: now + RETRY_COOLDOWN_MS })
  try {
    const password = execFileSync(
      'security',
      ['find-generic-password', '-w', '-s', SERVICE, '-a', ACCOUNT],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: Number(options.timeoutMs) || KEYCHAIN_TIMEOUT_MS,
      },
    ).trim()
    if (!password) {
      cached = null
      report({ declinedUntil: now + DECLINE_TTL_MS })
      return null
    }
    cached = crypto.pbkdf2Sync(Buffer.from(password), Buffer.from('saltysalt'), 1003, 16, 'sha1')
    report({ key: cached.toString('base64') })
    return cached
  } catch (error) {
    cached = null
    const timedOut = error && (error.code === 'ETIMEDOUT' || error.killed)
    report({ declinedUntil: now + (timedOut ? RETRY_COOLDOWN_MS : DECLINE_TTL_MS) })
    return null
  }
}

module.exports = {
  SERVICE,
  setKeyStore,
  setDiscoveryListener,
  takeDiscoveredKeys,
  derivedKey,
  _private: { persistedKey, DECLINE_TTL_MS, RETRY_COOLDOWN_MS },
}
