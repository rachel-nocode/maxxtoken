const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const FORMAT_VERSION = 1
const DEFAULT_TTL_MS = 35 * 24 * 60 * 60 * 1000

function cacheRoot() {
  if (process.env.MAXXTOKEN_EVENT_CACHE_ROOT) return process.env.MAXXTOKEN_EVENT_CACHE_ROOT
  const appData = process.platform === 'win32'
    ? process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    : path.join(os.homedir(), 'Library', 'Application Support')
  return path.join(appData, 'MaxxToken', 'log-scan-cache')
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)
}

function safeNamespace(value) {
  const namespace = String(value || '').trim()
  if (!/^[a-z0-9-]+$/i.test(namespace)) throw new Error('Invalid event-cache namespace.')
  return namespace
}

function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  fs.writeFileSync(temporary, text, { mode: 0o600 })
  fs.renameSync(temporary, file)
}

function sourceMetadata(file, contextKey = '') {
  const stat = fs.statSync(file)
  return {
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    dev: stat.dev,
    ino: stat.ino,
    contextKey: String(contextKey || ''),
  }
}

function metadataMatches(left, right) {
  return Boolean(left && right) &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    String(left.contextKey || '') === String(right.contextKey || '')
}

function serializableItems(items) {
  if (!Array.isArray(items)) throw new Error('Event-cache parser must return an array.')
  const encoded = JSON.stringify(items)
  if (encoded.includes('access_token') || encoded.includes('refresh_token') || encoded.includes('Authorization')) {
    throw new Error('Event-cache records cannot contain credentials.')
  }
  return encoded
}

class PersistentEventCache {
  constructor(options = {}) {
    this.namespace = safeNamespace(options.namespace)
    this.schemaVersion = Math.max(1, Math.floor(Number(options.schemaVersion) || 1))
    this.identity = String(options.identity || 'default')
    this.root = options.root || cacheRoot()
    this.ttlMs = Number.isFinite(Number(options.ttlMs)) ? Number(options.ttlMs) : DEFAULT_TTL_MS
    this.directory = path.join(this.root, `${this.namespace}-${fingerprint(this.identity)}`)
    this.recordsDirectory = path.join(this.directory, 'files')
    this.manifestFile = path.join(this.directory, 'manifest.json')
    this.manifest = this.loadManifest()
    this.dirty = false
    this.stats = { hits: 0, misses: 0, parsedBytes: 0 }
  }

  emptyManifest() {
    return {
      formatVersion: FORMAT_VERSION,
      schemaVersion: this.schemaVersion,
      identity: this.identity,
      lastUsedAt: Date.now(),
      files: {},
    }
  }

  loadManifest() {
    try {
      const manifest = JSON.parse(fs.readFileSync(this.manifestFile, 'utf8'))
      if (
        manifest.formatVersion !== FORMAT_VERSION ||
        manifest.schemaVersion !== this.schemaVersion ||
        manifest.identity !== this.identity ||
        !manifest.files || typeof manifest.files !== 'object'
      ) return this.emptyManifest()
      return manifest
    } catch {
      return this.emptyManifest()
    }
  }

  get(file, parser, options = {}) {
    const absolute = path.resolve(file)
    const metadata = sourceMetadata(absolute, options.contextKey)
    const entry = this.manifest.files[absolute]
    const expectedRecord = `${fingerprint(absolute)}.json`
    if (entry && entry.record === expectedRecord && metadataMatches(entry, metadata)) {
      try {
        const record = JSON.parse(fs.readFileSync(path.join(this.recordsDirectory, entry.record), 'utf8'))
        if (
          record.formatVersion === FORMAT_VERSION &&
          record.schemaVersion === this.schemaVersion &&
          record.path === absolute &&
          metadataMatches(record, metadata) &&
          Array.isArray(record.items)
        ) {
          this.stats.hits++
          return record.items
        }
      } catch {
        // Reparse corrupt or missing records.
      }
    }

    const text = fs.readFileSync(absolute, 'utf8')
    const items = parser(text, absolute)
    const itemJSON = serializableItems(items)
    const recordName = expectedRecord
    const record = `{"formatVersion":${FORMAT_VERSION},"schemaVersion":${this.schemaVersion},"path":${JSON.stringify(absolute)},"size":${metadata.size},"mtimeMs":${metadata.mtimeMs},"dev":${metadata.dev},"ino":${metadata.ino},"contextKey":${JSON.stringify(metadata.contextKey)},"items":${itemJSON}}`
    atomicWrite(path.join(this.recordsDirectory, recordName), record)
    this.manifest.files[absolute] = { ...metadata, record: recordName }
    this.dirty = true
    this.stats.misses++
    this.stats.parsedBytes += Buffer.byteLength(text)
    return items
  }

  finish(activeFiles) {
    const active = new Set((activeFiles || []).map((file) => path.resolve(file)))
    for (const [file, entry] of Object.entries(this.manifest.files)) {
      if (active.has(file)) continue
      delete this.manifest.files[file]
      this.dirty = true
      const expectedRecord = `${fingerprint(file)}.json`
      if (entry.record === expectedRecord) {
        try { fs.unlinkSync(path.join(this.recordsDirectory, expectedRecord)) } catch { /* absent */ }
      }
    }
    this.manifest.lastUsedAt = Date.now()
    if (this.dirty || active.size) atomicWrite(this.manifestFile, JSON.stringify(this.manifest))
    this.pruneStaleIdentities()
    return { ...this.stats }
  }

  pruneStaleIdentities(now = Date.now()) {
    let entries
    try { entries = fs.readdirSync(this.root, { withFileTypes: true }) } catch { return }
    const cutoff = now - this.ttlMs
    for (const entry of entries) {
      if (!entry.isDirectory() || !new RegExp(`^${this.namespace}-[0-9a-f]{24}$`).test(entry.name)) continue
      const directory = path.join(this.root, entry.name)
      if (directory === this.directory) continue
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
        if (
          manifest.formatVersion === FORMAT_VERSION &&
          Number.isInteger(manifest.schemaVersion) &&
          typeof manifest.identity === 'string' &&
          manifest.files && typeof manifest.files === 'object' &&
          Number(manifest.lastUsedAt) < cutoff
        ) fs.rmSync(directory, { recursive: true })
      } catch {
        // Unknown directories are left alone rather than recursively deleting an unvalidated target.
      }
    }
  }
}

function cacheIdentity(source, account, period) {
  const accountKey = account?.identityStamp || account?.identityKey || account?.id || account?.accountId || 'unscoped'
  const roots = [account?.authHome, ...(account?.logHomes || [])].filter(Boolean).map((item) => path.resolve(item)).sort()
  return JSON.stringify({ source, account: accountKey, period: String(period || 'all'), roots })
}

module.exports = {
  PersistentEventCache,
  cacheIdentity,
  _private: {
    FORMAT_VERSION,
    DEFAULT_TTL_MS,
    cacheRoot,
    fingerprint,
    metadataMatches,
    sourceMetadata,
  },
}
