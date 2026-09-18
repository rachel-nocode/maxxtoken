// Encrypted store for user-provided API keys.
//
// Backed by Electron `safeStorage`, which seals keys to the current OS user
// through the platform credential store. If decryption is unavailable we treat
// the store as empty rather than throwing.
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
let processOverride = null
const PROXY_CREDENTIALS_KEY = '__networkProxyCredentials'

function filePath() {
  if (!app || typeof app.getPath !== 'function') return null
  return path.join(app.getPath('userData'), 'secrets.bin')
}

function loadAll() {
  if (processOverride) return processOverride
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

function getProxyCredentials() {
  const value = loadAll()[PROXY_CREDENTIALS_KEY]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { username: null, password: null }
  return {
    username: typeof value.username === 'string' && value.username ? value.username : null,
    password: typeof value.password === 'string' && value.password ? value.password : null,
  }
}

function setProxyCredentials(value) {
  const all = loadAll()
  const username = typeof value?.username === 'string' ? value.username : ''
  const password = typeof value?.password === 'string' ? value.password : ''
  if (username || password) all[PROXY_CREDENTIALS_KEY] = { username, password }
  else delete all[PROXY_CREDENTIALS_KEY]
  saveAll(all)
}

function redactSensitive(value, source = loadAll()) {
  let text = String(value || '')
  const strings = []
  const visit = (item) => {
    if (typeof item === 'string' && item.length >= 4) strings.push(item)
    else if (item && typeof item === 'object') Object.values(item).forEach(visit)
  }
  visit(source)
  for (const secret of [...new Set(strings)].sort((a, b) => b.length - a.length)) {
    text = text.split(secret).join('[redacted]').split(encodeURIComponent(secret)).join('[redacted]')
  }
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{8,}/gi, 'Bearer [redacted]')
    .replace(/\b(sk-(?:ant-)?|gh[pousr]_)[A-Za-z0-9_-]{12,}/gi, '$1[redacted]')
}

function setProcessOverride(keys) {
  processOverride = keys && typeof keys === 'object' ? { ...keys } : null
}

module.exports = {
  getKey,
  setKey,
  hasKey,
  allKeys,
  getProxyCredentials,
  setProxyCredentials,
  redactSensitive,
  setProcessOverride,
  PROXY_CREDENTIALS_KEY,
}
