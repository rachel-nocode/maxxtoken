const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { getKey } = require('../secrets')

const DEFAULT_DB = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Windsurf',
  'User',
  'globalStorage',
  'state.vscdb',
)
const PLAN_KEY = 'windsurf.settings.cachedPlanInfo'
const WEB_PLAN_STATUS_URL = 'https://windsurf.com/_backend/exa.seat_management_pb.SeatManagementService/GetPlanStatus'
const TARGET_STORAGE_KEYS = [
  'devin_session_token',
  'devin_auth1_token',
  'devin_account_id',
  'devin_primary_org_id',
]
const BROWSER_PROFILE_ROOTS = [
  ['Chrome', ['Google', 'Chrome']],
  ['Chrome Beta', ['Google', 'Chrome Beta']],
  ['Chrome Canary', ['Google', 'Chrome Canary']],
  ['Microsoft Edge', ['Microsoft Edge']],
  ['Microsoft Edge Beta', ['Microsoft Edge Beta']],
  ['Microsoft Edge Canary', ['Microsoft Edge Canary']],
  ['Brave', ['BraveSoftware', 'Brave-Browser']],
  ['Brave Beta', ['BraveSoftware', 'Brave-Browser-Beta']],
  ['Brave Nightly', ['BraveSoftware', 'Brave-Browser-Nightly']],
  ['Vivaldi', ['Vivaldi']],
  ['Arc', ['Arc', 'User Data']],
  ['Dia', ['Dia', 'User Data']],
  ['ChatGPT Atlas', ['ChatGPT Atlas']],
  ['Chromium', ['Chromium']],
]

function percentFromRemaining(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, 100 - n))
}

function percentFromUsage(used, total) {
  const u = Number(used)
  const t = Number(total)
  if (!Number.isFinite(u) || !Number.isFinite(t) || t <= 0) return null
  return Math.max(0, Math.min(100, (u / t) * 100))
}

function toMs(seconds) {
  const n = Number(seconds)
  return Number.isFinite(n) && n > 0 ? n * 1000 : null
}

function readPlanJSON(dbPath = DEFAULT_DB) {
  if (!fs.existsSync(dbPath)) return null
  try {
    const out = execFileSync(
      'sqlite3',
      [dbPath, `SELECT value FROM ItemTable WHERE key = '${PLAN_KEY}' LIMIT 1;`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 },
    )
    const text = out.trim()
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function clean(value) {
  const text = String(value || '').trim()
  return text || null
}

function parseCachedPlanInfo(plan, now = Date.now()) {
  if (!plan || typeof plan !== 'object') return null
  const quota = plan.quotaUsage || {}
  const usage = plan.usage || {}

  const dailyPct =
    percentFromRemaining(quota.dailyRemainingPercent) ??
    percentFromUsage(
      usage.usedMessages ?? (usage.messages != null && usage.remainingMessages != null ? usage.messages - usage.remainingMessages : null),
      usage.messages,
    )
  const weeklyPct =
    percentFromRemaining(quota.weeklyRemainingPercent) ??
    percentFromUsage(
      usage.usedFlowActions ??
        (usage.flowActions != null && usage.remainingFlowActions != null ? usage.flowActions - usage.remainingFlowActions : null),
      usage.flowActions,
    )

  if (dailyPct == null && weeklyPct == null) return null

  return {
    connected: true,
    plan: plan.planName || 'Windsurf',
    daily: dailyPct == null ? null : { usedPct: dailyPct, resetAt: toMs(quota.dailyResetAtUnix) },
    weekly: weeklyPct == null ? null : { usedPct: weeklyPct, resetAt: toMs(quota.weeklyResetAtUnix) },
    messages:
      usage.messages != null
        ? {
            used: Number(usage.usedMessages ?? Math.max(0, Number(usage.messages) - Number(usage.remainingMessages || 0))) || 0,
            total: Number(usage.messages) || 0,
            remaining: Number(usage.remainingMessages) || 0,
          }
        : null,
    flowActions:
      usage.flowActions != null
        ? {
            used: Number(usage.usedFlowActions ?? Math.max(0, Number(usage.flowActions) - Number(usage.remainingFlowActions || 0))) || 0,
            total: Number(usage.flowActions) || 0,
            remaining: Number(usage.remainingFlowActions) || 0,
          }
        : null,
    expiresAt: plan.endTimestamp ? Number(plan.endTimestamp) : null,
    lastActive: now,
    source: 'local Windsurf cache',
  }
}

function decodeStorageValue(value) {
  const text = clean(value)
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed === 'string') return clean(parsed)
  } catch {
    /* plain value */
  }
  return clean(text.replace(/^['"]|['"]$/g, ''))
}

function sessionAuthFromValues(values) {
  const stringValue = (...keys) => {
    for (const key of keys) {
      const value = clean(values?.[key])
      if (value) return value
    }
    return null
  }
  const sessionToken = stringValue('devin_session_token', 'devinSessionToken', 'sessionToken')
  const auth1Token = stringValue('devin_auth1_token', 'devinAuth1Token', 'auth1Token')
  const accountID = stringValue('devin_account_id', 'devinAccountId', 'accountID', 'accountId')
  const primaryOrgID = stringValue('devin_primary_org_id', 'devinPrimaryOrgId', 'primaryOrgID', 'primaryOrgId')
  if (!sessionToken || !auth1Token || !accountID || !primaryOrgID) return null
  return { sessionToken, auth1Token, accountID, primaryOrgID }
}

function parseJSONSessionInput(raw) {
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return sessionAuthFromValues(parsed)
  } catch {
    return null
  }
}

function parseKeyValueSessionInput(raw) {
  const values = {}
  for (const segment of String(raw || '').replace(/[{}]/g, '').split(/[\n,;]/)) {
    const trimmed = segment.trim()
    if (!trimmed) continue
    const delimiter = trimmed.includes('=') ? '=' : trimmed.includes(':') ? ':' : null
    if (!delimiter) continue
    const index = trimmed.indexOf(delimiter)
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key && value) values[key] = value
  }
  return Object.keys(values).length ? sessionAuthFromValues(values) : null
}

function parseManualSessionInput(raw) {
  const text = clean(raw)
  if (!text) return null
  return parseJSONSessionInput(text) || parseKeyValueSessionInput(text)
}

function browserProfileRoots(home = os.homedir()) {
  const support = path.join(home, 'Library', 'Application Support')
  return BROWSER_PROFILE_ROOTS.map(([labelPrefix, parts]) => ({
    labelPrefix,
    root: path.join(support, ...parts),
  }))
}

function isBrowserProfileDir(name) {
  return name === 'Default' || name.startsWith('Profile ') || name.startsWith('user-')
}

function chromeLocalStorageCandidates({ home = os.homedir(), fs: fsImpl = fs } = {}) {
  if (typeof fsImpl.readdirSync !== 'function') return []
  const candidates = []
  for (const root of browserProfileRoots(home)) {
    let entries
    try {
      entries = fsImpl.readdirSync(root.root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !isBrowserProfileDir(entry.name)) continue
      const levelDB = path.join(root.root, entry.name, 'Local Storage', 'leveldb')
      try {
        if (!fsImpl.existsSync(levelDB)) continue
      } catch {
        continue
      }
      candidates.push({ label: `${root.labelPrefix} ${entry.name}`, path: levelDB })
    }
  }
  return candidates
}

function likelyStorageValue(value) {
  const text = decodeStorageValue(value)
  if (!text) return null
  if (TARGET_STORAGE_KEYS.includes(text)) return null
  if (/^https?:\/\//i.test(text)) return null
  if (/devin_[a-z_]+/i.test(text)) return null
  if (/[:=]$/.test(text)) return null
  if (text.length < 3 || text.length > 2048) return null
  return text
}

function extractValueNearKey(text, key) {
  const values = []
  let index = text.indexOf(key)
  while (index !== -1) {
    const tail = text.slice(index + key.length, index + key.length + 4096)
    const quoted = tail.match(/["']((?:\\.|[^"'\\]){1,2048})["']/)
    const direct = tail.match(/[:=\u0000-\u001f\s]+([A-Za-z0-9_$./:+-][A-Za-z0-9_$./:+\-=]{2,2048})/)
    for (const candidate of [quoted?.[1], direct?.[1]]) {
      const value = likelyStorageValue(candidate)
      if (value) values.push(value)
    }
    index = text.indexOf(key, index + key.length)
  }
  return values[0] || null
}

function readStorageTextFile(file, fsImpl) {
  try {
    const stat = typeof fsImpl.statSync === 'function' ? fsImpl.statSync(file) : null
    if (stat && stat.size > 25 * 1024 * 1024) return ''
    return fsImpl.readFileSync(file).toString('utf8')
  } catch {
    try {
      return fsImpl.readFileSync(file).toString('latin1')
    } catch {
      return ''
    }
  }
}

function storageFiles(levelDBDir, fsImpl = fs) {
  let entries
  try {
    entries = fsImpl.readdirSync(levelDBDir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isFile() && /\.(log|ldb|sst)$/i.test(entry.name))
    .map((entry) => path.join(levelDBDir, entry.name))
    .sort()
    .slice(-80)
}

function readLocalStorageFromLevelDB(levelDBDir, fsImpl = fs) {
  const storage = {}
  for (const file of storageFiles(levelDBDir, fsImpl)) {
    const text = readStorageTextFile(file, fsImpl)
    if (!text) continue
    for (const key of TARGET_STORAGE_KEYS) {
      if (storage[key]) continue
      const value = extractValueNearKey(text, key)
      if (value) storage[key] = value
    }
    if (TARGET_STORAGE_KEYS.every((key) => storage[key])) break
  }
  return storage
}

function importBrowserSessions(options = {}) {
  const sessions = []
  const seen = new Set()
  for (const candidate of chromeLocalStorageCandidates(options)) {
    const storage = readLocalStorageFromLevelDB(candidate.path, options.fs || fs)
    const session = sessionAuthFromValues(storage)
    if (!session || seen.has(session.sessionToken)) continue
    seen.add(session.sessionToken)
    sessions.push({ session, sourceLabel: candidate.label })
  }
  return sessions
}

function resolveSessionAuth(options = {}) {
  const savedKey = Object.prototype.hasOwnProperty.call(options, 'savedKey') ? options.savedKey : getKey('windsurf')
  return (
    parseManualSessionInput(process.env.WINDSURF_SESSION || process.env.WINDSURF_DEVIN_SESSION) ||
    parseManualSessionInput(savedKey) ||
    importBrowserSessions(options)[0]?.session ||
    null
  )
}

function appendVarint(bytes, value) {
  let remaining = BigInt(value)
  while (remaining >= 0x80n) {
    bytes.push(Number((remaining & 0x7fn) | 0x80n))
    remaining >>= 7n
  }
  bytes.push(Number(remaining))
}

function fieldKey(bytes, number, wireType) {
  appendVarint(bytes, (number << 3) | wireType)
}

function stringField(bytes, number, value) {
  const encoded = Buffer.from(String(value), 'utf8')
  fieldKey(bytes, number, 2)
  appendVarint(bytes, encoded.length)
  bytes.push(...encoded)
}

function varintField(bytes, number, value) {
  if (value == null) return
  fieldKey(bytes, number, 0)
  appendVarint(bytes, value)
}

function messageField(bytes, number, value) {
  fieldKey(bytes, number, 2)
  appendVarint(bytes, value.length)
  bytes.push(...value)
}

function encodePlanStatusRequest(sessionToken, includeTopUpStatus = true) {
  const bytes = []
  stringField(bytes, 1, sessionToken)
  varintField(bytes, 2, includeTopUpStatus ? 1 : 0)
  return Buffer.from(bytes)
}

function protoReader(buffer) {
  const bytes = Buffer.from(buffer || [])
  let index = 0
  function readVarint() {
    let result = 0n
    let shift = 0n
    while (index < bytes.length) {
      const byte = bytes[index++]
      result |= BigInt(byte & 0x7f) << shift
      if ((byte & 0x80) === 0) return Number(result)
      shift += 7n
      if (shift >= 64n) throw new Error('truncated protobuf payload')
    }
    throw new Error('truncated protobuf payload')
  }
  function readBytes() {
    const length = readVarint()
    if (index + length > bytes.length) throw new Error('truncated protobuf payload')
    const chunk = bytes.subarray(index, index + length)
    index += length
    return chunk
  }
  function skip(wireType) {
    if (wireType === 0) readVarint()
    else if (wireType === 1) index += 8
    else if (wireType === 2) readBytes()
    else if (wireType === 5) index += 4
    else throw new Error(`unsupported protobuf wire type ${wireType}`)
    if (index > bytes.length) throw new Error('truncated protobuf payload')
  }
  return {
    nextField() {
      if (index >= bytes.length) return null
      const key = readVarint()
      return { number: key >> 3, wireType: key & 7 }
    },
    readVarint,
    readBytes,
    readString() {
      return readBytes().toString('utf8')
    },
    skip,
  }
}

function decodeTimestamp(buffer) {
  const reader = protoReader(buffer)
  let seconds = 0
  while (true) {
    const field = reader.nextField()
    if (!field) break
    if (field.number === 1 && field.wireType === 0) seconds = reader.readVarint()
    else reader.skip(field.wireType)
  }
  return seconds ? seconds * 1000 : null
}

function decodePlanInfo(buffer) {
  const reader = protoReader(buffer)
  const out = {}
  while (true) {
    const field = reader.nextField()
    if (!field) break
    if (field.number === 1 && field.wireType === 0) out.teamsTier = reader.readVarint()
    else if (field.number === 2 && field.wireType === 2) out.planName = reader.readString()
    else reader.skip(field.wireType)
  }
  return out
}

function decodePlanStatus(buffer) {
  const reader = protoReader(buffer)
  const status = {}
  while (true) {
    const field = reader.nextField()
    if (!field) break
    if (field.number === 1 && field.wireType === 2) status.planInfo = decodePlanInfo(reader.readBytes())
    else if (field.number === 2 && field.wireType === 2) status.planStart = decodeTimestamp(reader.readBytes())
    else if (field.number === 3 && field.wireType === 2) status.planEnd = decodeTimestamp(reader.readBytes())
    else if (field.number === 14 && field.wireType === 0) status.dailyQuotaRemainingPercent = reader.readVarint()
    else if (field.number === 15 && field.wireType === 0) status.weeklyQuotaRemainingPercent = reader.readVarint()
    else if (field.number === 17 && field.wireType === 0) status.dailyQuotaResetAtUnix = reader.readVarint()
    else if (field.number === 18 && field.wireType === 0) status.weeklyQuotaResetAtUnix = reader.readVarint()
    else reader.skip(field.wireType)
  }
  return status
}

function decodePlanStatusResponse(buffer) {
  const reader = protoReader(buffer)
  let planStatus = null
  while (true) {
    const field = reader.nextField()
    if (!field) break
    if (field.number === 1 && field.wireType === 2) planStatus = decodePlanStatus(reader.readBytes())
    else reader.skip(field.wireType)
  }
  return { planStatus }
}

function encodeTimestamp(ms) {
  const bytes = []
  varintField(bytes, 1, Math.round(Number(ms) / 1000))
  return bytes
}

function encodePlanStatusResponseForTesting(status = {}) {
  const info = []
  if (status.teamsTier != null) varintField(info, 1, status.teamsTier)
  if (status.planName) stringField(info, 2, status.planName)
  const plan = []
  if (info.length) messageField(plan, 1, info)
  if (status.planStart) messageField(plan, 2, encodeTimestamp(status.planStart))
  if (status.planEnd) messageField(plan, 3, encodeTimestamp(status.planEnd))
  varintField(plan, 14, status.dailyQuotaRemainingPercent)
  varintField(plan, 15, status.weeklyQuotaRemainingPercent)
  varintField(plan, 17, status.dailyQuotaResetAtUnix)
  varintField(plan, 18, status.weeklyQuotaResetAtUnix)
  const root = []
  messageField(root, 1, plan)
  return Buffer.from(root)
}

function parseWebPlanStatus(payload, now = Date.now()) {
  const status = payload?.planStatus
  if (!status) return null
  const dailyPct = status.dailyQuotaRemainingPercent == null ? null : Math.max(0, Math.min(100, 100 - Number(status.dailyQuotaRemainingPercent)))
  const weeklyPct = status.weeklyQuotaRemainingPercent == null ? null : Math.max(0, Math.min(100, 100 - Number(status.weeklyQuotaRemainingPercent)))
  if (dailyPct == null && weeklyPct == null) return null
  return {
    connected: true,
    source: 'Windsurf web session',
    plan: status.planInfo?.planName || 'Windsurf',
    daily: dailyPct == null ? null : { usedPct: dailyPct, resetAt: toMs(status.dailyQuotaResetAtUnix) },
    weekly: weeklyPct == null ? null : { usedPct: weeklyPct, resetAt: toMs(status.weeklyQuotaResetAtUnix) },
    expiresAt: status.planEnd || null,
    lastActive: now,
  }
}

async function fetchWebPlanStatus(auth, fetchImpl = fetch) {
  const res = await fetchImpl(WEB_PLAN_STATUS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/proto',
      'Connect-Protocol-Version': '1',
      Origin: 'https://windsurf.com',
      Referer: 'https://windsurf.com/profile',
      'x-auth-token': auth.sessionToken,
      'x-devin-session-token': auth.sessionToken,
      'x-devin-auth1-token': auth.auth1Token,
      'x-devin-account-id': auth.accountID,
      'x-devin-primary-org-id': auth.primaryOrgID,
    },
    body: encodePlanStatusRequest(auth.sessionToken, true),
  })
  const body = Buffer.from(await res.arrayBuffer())
  if (!res.ok) throw new Error(`Windsurf web session rejected: HTTP ${res.status}`)
  return decodePlanStatusResponse(body)
}

async function read(options = {}) {
  const raw = readPlanJSON(options.dbPath || DEFAULT_DB)
  const parsed = parseCachedPlanInfo(raw)
  if (parsed) return parsed

  const auth = resolveSessionAuth(options)
  if (auth) {
    try {
      const payload = await fetchWebPlanStatus(auth, options.fetch || fetch)
      const web = parseWebPlanStatus(payload)
      if (web) return web
      return { connected: false, error: 'No usage data in Windsurf web response' }
    } catch (err) {
      return { connected: false, error: err && err.message ? err.message : String(err) }
    }
  }

  return {
    connected: false,
    error: raw
      ? 'No usage data in local cache'
      : 'Launch Windsurf once or paste a Windsurf Devin session bundle from windsurf.com.',
  }
}

module.exports = {
  read,
  _private: {
    parseCachedPlanInfo,
    readPlanJSON,
    decodeStorageValue,
    parseManualSessionInput,
    browserProfileRoots,
    chromeLocalStorageCandidates,
    readLocalStorageFromLevelDB,
    importBrowserSessions,
    encodePlanStatusRequest,
    decodePlanStatusResponse,
    encodePlanStatusResponseForTesting,
    parseWebPlanStatus,
    fetchWebPlanStatus,
    percentFromRemaining,
    percentFromUsage,
  },
}
