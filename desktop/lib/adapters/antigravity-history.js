const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const MAX_BLOB_BYTES = 1024 * 1024
const BATCH_SIZE = 64
const cache = new Map()

function number(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function decodeVarint(bytes, offset = 0) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes || [])
  if (offset < 0 || offset >= bytes.length) return null
  let value = 0n
  for (let index = 0; index < 10; index += 1) {
    const position = offset + index
    if (position >= bytes.length) return null
    const byte = bytes[position]
    const payload = BigInt(byte & 0x7f)
    if (index === 9 && payload > 1n) return null
    value |= payload << BigInt(index * 7)
    if ((byte & 0x80) === 0) return { value, nextOffset: position + 1 }
  }
  return null
}

function field(requested, bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes || [])
  let offset = 0
  while (offset < bytes.length) {
    const tag = decodeVarint(bytes, offset)
    if (!tag) return null
    const fieldNumber = Number(tag.value >> 3n)
    if (!fieldNumber) return null
    const wireType = Number(tag.value & 7n)
    if (wireType === 0) {
      const value = decodeVarint(bytes, tag.nextOffset)
      if (!value) return null
      if (fieldNumber === requested) return { type: 'varint', value: value.value }
      offset = value.nextOffset
    } else if (wireType === 2) {
      const length = decodeVarint(bytes, tag.nextOffset)
      if (!length || length.value > BigInt(bytes.length - length.nextOffset)) return null
      const count = Number(length.value)
      const end = length.nextOffset + count
      if (fieldNumber === requested) return { type: 'bytes', value: bytes.subarray(length.nextOffset, end) }
      offset = end
    } else if (wireType === 1 || wireType === 5) {
      const width = wireType === 1 ? 8 : 4
      if (bytes.length - tag.nextOffset < width) return null
      offset = tag.nextOffset + width
    } else {
      return null
    }
  }
  return null
}

function bytesField(requested, bytes) {
  const value = field(requested, bytes)
  return value?.type === 'bytes' ? value.value : null
}

function integerField(requested, bytes) {
  const value = field(requested, bytes)
  if (value?.type !== 'varint' || value.value > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return Number(value.value)
}

function timestampSeconds(message) {
  const seconds = integerField(1, message)
  return seconds && seconds > 0 ? seconds : null
}

function timestampFromStepMetadata(metadata) {
  const timestamp = bytesField(1, metadata)
  return timestamp ? timestampSeconds(timestamp) : null
}

function stringField(requested, bytes) {
  const value = bytesField(requested, bytes)
  if (!value) return null
  const text = value.toString('utf8').trim()
  return text || null
}

function generationEvent(blob, stepMetadata = null) {
  const wrapped = bytesField(1, blob)
  if (!wrapped) return null
  const modelID = stringField(19, wrapped)
  const label = stringField(21, wrapped)
  const usage = bytesField(4, wrapped)
  if (!usage) return null
  const systemPromptTokens = integerField(1, usage) || 0
  const rawInputTokens = integerField(2, usage) || 0
  const outputTokens = integerField(3, usage) || 0
  const cacheReadTokens = integerField(5, usage) || 0
  const inputTokens = systemPromptTokens + rawInputTokens
  if (!Number.isSafeInteger(inputTokens)) return null
  const generated = rawInputTokens !== 0 || outputTokens !== 0 || cacheReadTokens !== 0
  if (!modelID && !label && !generated) return null
  if (!generated && inputTokens === 0) return null
  const timing = bytesField(9, wrapped)
  const embeddedTimestamp = timing ? bytesField(4, timing) : null
  const timestamp = (embeddedTimestamp ? timestampSeconds(embeddedTimestamp) : null) ||
    (stepMetadata ? timestampFromStepMetadata(stepMetadata) : null)
  if (!timestamp) return null
  return { modelID, label, inputTokens, outputTokens, cacheReadTokens, timestampSeconds: timestamp }
}

function modelName(event) {
  let id = String(event?.modelID || '').trim() || null
  const label = String(event?.label || '').trim() || null
  if (id?.endsWith('-tiered')) id = id.slice(0, -'-tiered'.length)
  if (id?.endsWith('-default')) return label || id
  return id || label || 'Unknown Antigravity Model'
}

function conversationDirectories(home = os.homedir(), fsImpl = fs) {
  const root = path.join(home, '.gemini')
  let entries
  try {
    entries = fsImpl.readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.name.startsWith('antigravity') && (entry.isDirectory() || entry.isSymbolicLink()))
    .map((entry) => path.join(root, entry.name, 'conversations'))
    .sort()
}

function databaseFiles(options = {}) {
  const fsImpl = options.fs || fs
  const directories = options.directories || conversationDirectories(options.home, fsImpl)
  const seen = new Set()
  const files = []
  for (const directory of directories) {
    let names
    try {
      names = fsImpl.readdirSync(directory)
    } catch {
      continue
    }
    for (const name of names.filter((value) => value.endsWith('.db')).sort()) {
      const file = path.join(directory, name)
      let resolved = file
      try { resolved = fsImpl.realpathSync(file) } catch { /* use unresolved path */ }
      if (seen.has(resolved)) continue
      seen.add(resolved)
      files.push(file)
    }
  }
  return files
}

function querySQLite(file, sql, options = {}) {
  const execImpl = options.execFileSync || execFileSync
  return execImpl(
    'sqlite3',
    ['-readonly', '-json', `file:${file}?mode=ro`, sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, maxBuffer: 20 * 1024 * 1024 },
  )
}

function hasStepMetadata(file, options = {}) {
  try {
    const output = querySQLite(file, "SELECT 1 AS present FROM pragma_table_info('steps') WHERE name = 'metadata' LIMIT 1;", options)
    return JSON.parse(output || '[]').length > 0
  } catch {
    return false
  }
}

function rowQuery(afterIndex, includeSteps) {
  const step = includeSteps
    ? `, (SELECT CASE WHEN length(metadata) <= ${MAX_BLOB_BYTES} THEN hex(metadata) ELSE NULL END FROM steps WHERE idx = g.idx) AS stepHex`
    : ''
  return `SELECT g.idx AS idx, CASE WHEN length(g.data) <= ${MAX_BLOB_BYTES} THEN hex(g.data) ELSE NULL END AS hex${step} FROM gen_metadata g WHERE g.idx > ${Math.trunc(afterIndex)} AND g.data IS NOT NULL ORDER BY g.idx LIMIT ${BATCH_SIZE};`
}

function databaseFingerprint(file, fsImpl = fs) {
  const db = fsImpl.statSync(file)
  let wal = null
  try { wal = fsImpl.statSync(`${file}-wal`) } catch { /* no WAL */ }
  return `${db.ino || 0}:${db.size}:${db.mtimeMs}:${wal?.size || 0}:${wal?.mtimeMs || 0}`
}

function readDatabase(file, options = {}) {
  const fsImpl = options.fs || fs
  const fingerprint = databaseFingerprint(file, fsImpl)
  if (cache.get(file)?.fingerprint === fingerprint) return cache.get(file).events
  const includeSteps = hasStepMetadata(file, options)
  const events = []
  let afterIndex = -1
  while (true) {
    const output = querySQLite(file, rowQuery(afterIndex, includeSteps), options)
    const rows = JSON.parse(output || '[]')
    if (!Array.isArray(rows) || !rows.length) break
    for (const row of rows) {
      const index = number(row.idx)
      if (index == null || index <= afterIndex) throw new Error('Antigravity generation indices are not increasing')
      afterIndex = index
      if (!row.hex) continue
      const blob = Buffer.from(row.hex, 'hex')
      const step = row.stepHex ? Buffer.from(row.stepHex, 'hex') : null
      const event = generationEvent(blob, step)
      if (event) events.push(event)
    }
    if (rows.length < BATCH_SIZE) break
  }
  cache.set(file, { fingerprint, events })
  return events
}

function dayKey(timestampMs) {
  const date = new Date(timestampMs)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function aggregateEvents(events, options = {}) {
  const now = options.now || Date.now()
  const historyDays = Math.max(1, Math.min(365, Math.round(number(options.tokenHistoryDays) || 30)))
  const since = now - historyDays * 24 * 60 * 60 * 1000
  const totals = { input: 0, cached: 0, output: 0, total: 0, requests: 0 }
  const byDay = new Map()
  const byModel = new Map()
  for (const event of events || []) {
    const timestampMs = number(event.timestampSeconds) * 1000
    if (!Number.isFinite(timestampMs) || timestampMs < since || timestampMs > now + 5 * 60 * 1000) continue
    const input = Math.max(0, number(event.inputTokens) || 0)
    const cached = Math.max(0, number(event.cacheReadTokens) || 0)
    const output = Math.max(0, number(event.outputTokens) || 0)
    const total = input + cached + output
    if (!total) continue
    const model = modelName(event)
    const date = dayKey(timestampMs)
    const day = byDay.get(date) || { date, input: 0, cached: 0, output: 0, total: 0, requests: 0, models: new Map() }
    const dayModel = day.models.get(model) || { model, input: 0, cached: 0, output: 0, total: 0, requests: 0 }
    const globalModel = byModel.get(model) || { model, input: 0, cached: 0, output: 0, total: 0, requests: 0 }
    for (const target of [totals, day, dayModel, globalModel]) {
      target.input += input
      target.cached += cached
      target.output += output
      target.total += total
      target.requests += 1
    }
    day.models.set(model, dayModel)
    byDay.set(date, day)
    byModel.set(model, globalModel)
  }
  if (!totals.total) return null
  const toModels = (map) => [...map.values()].sort((a, b) => b.total - a.total || a.model.localeCompare(b.model))
  return {
    ...totals,
    historyDays,
    dailyBreakdown: [...byDay.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(({ models, ...day }) => ({ ...day, modelBreakdowns: toModels(models) })),
    modelBreakdowns: toModels(byModel),
    source: 'Antigravity local conversations',
    measured: true,
  }
}

function scan(options = {}) {
  if (options.skipTokenHistory) return null
  const events = []
  for (const file of options.files || databaseFiles(options)) {
    try {
      events.push(...readDatabase(file, options))
    } catch {
      /* one unreadable store must not discard other local history */
    }
  }
  return aggregateEvents(events, options)
}

function resetCacheForTesting() {
  cache.clear()
}

module.exports = {
  scan,
  _private: {
    BATCH_SIZE,
    MAX_BLOB_BYTES,
    aggregateEvents,
    bytesField,
    conversationDirectories,
    databaseFiles,
    decodeVarint,
    generationEvent,
    integerField,
    modelName,
    resetCacheForTesting,
    rowQuery,
    timestampFromStepMetadata,
  },
}
