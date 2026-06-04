// Persistent, encrypted cache of derived browser "Safe Storage" cookie keys.
//
// macOS prompts ("<X> Safe Storage" Keychain dialog) whenever a process that
// isn't the owning browser reads a Chromium cookie-encryption password via the
// `security` CLI. Our snapshot worker is a short-lived fork that re-derives the
// key on every refresh, so the prompt reappears forever (and Chromium Safe
// Storage items carry ACL partition lists, so even "Always Allow" often doesn't
// stick for the CLI).
//
// To break the loop the main process persists each successfully-derived key (and
// remembers declines for a while) here, sealed with Electron safeStorage, then
// injects them into the worker so it never has to touch the Keychain again.
const fs = require('fs')
const path = require('path')

let electron = null
try {
  electron = require('electron')
} catch {
  electron = {}
}
const app = electron && typeof electron === 'object' ? electron.app : null
const safeStorage = electron && typeof electron === 'object' ? electron.safeStorage : null

function filePath() {
  if (!app || typeof app.getPath !== 'function') return null
  return path.join(app.getPath('userData'), 'browser-keys.bin')
}

// Map shape: { [keychainService]: { key?: base64Aes128Key, declinedUntil?: ms } }
function loadAll() {
  try {
    const file = filePath()
    if (!file || !fs.existsSync(file)) return {}
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) return {}
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) || {}
  } catch {
    return {}
  }
}

function saveAll(all) {
  try {
    const file = filePath()
    if (!file || !safeStorage || !safeStorage.isEncryptionAvailable()) return false
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(all || {})), { mode: 0o600 })
    return true
  } catch {
    return false
  }
}

// Merge newly-discovered entries (from the worker) over the persisted map.
// A real key always wins over / clears a stale decline for the same service.
function merge(into, updates) {
  const out = { ...(into || {}) }
  for (const [service, entry] of Object.entries(updates || {})) {
    if (!service || !entry) continue
    if (entry.key) out[service] = { key: entry.key }
    else if (entry.declinedUntil && !(out[service] && out[service].key)) {
      out[service] = { declinedUntil: entry.declinedUntil }
    }
  }
  return out
}

module.exports = { loadAll, saveAll, merge }
