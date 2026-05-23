// Encrypted store for user-provided API keys.
//
// Backed by Electron `safeStorage`, which uses the macOS Keychain under the
// hood. Keys are sealed to the current user account on this Mac. If decryption
// is ever unavailable we treat the store as empty rather than throwing.
const fs = require('fs')
const path = require('path')
const { aliasesForProvider, canonicalProviderId } = require('./provider-ids')

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
  return path.join(app.getPath('userData'), 'secrets.bin')
}

function loadAll() {
  const override = process.env.MAXXTOKEN_SECRETS_JSON
  if (override) {
    try {
      return JSON.parse(override) || {}
    } catch {
      return {}
    }
  }
  try {
    const file = filePath()
    if (!file) return {}
    if (!fs.existsSync(file)) return {}
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) return {}
    const buf = fs.readFileSync(file)
    const json = safeStorage.decryptString(buf)
    return JSON.parse(json) || {}
  } catch {
    return {}
  }
}

function saveAll(all) {
  const file = filePath()
  if (!file) throw new Error('Electron app unavailable — cannot persist API keys')
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage unavailable — cannot persist API keys')
  }
  const enc = safeStorage.encryptString(JSON.stringify(all))
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, enc, { mode: 0o600 })
}

function getKey(id) {
  const all = loadAll()
  const canonical = canonicalProviderId(id)
  if (all[canonical]) return all[canonical]
  for (const alias of aliasesForProvider(canonical)) {
    if (all[alias]) return all[alias]
  }
  return null
}

function setKey(id, value) {
  const all = loadAll()
  const canonical = canonicalProviderId(id)
  if (value && String(value).trim()) all[canonical] = String(value).trim()
  else delete all[canonical]
  saveAll(all)
}

function hasKey(id) {
  return Boolean(getKey(id))
}

function allKeys() {
  return loadAll()
}

module.exports = { getKey, setKey, hasKey, allKeys }
