const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const { fetchWithTimeout } = require('../http')

const DEFAULT_API_SERVER = 'https://server.codeium.com'
const SERVICE = 'exa.seat_management_pb.SeatManagementService'
const COMPAT_VERSION = '1.108.2'
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

function clean(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function number(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function clampPct(value) {
  const n = number(value)
  return n == null ? null : Math.max(0, Math.min(100, n))
}

function parseTomlString(text, key) {
  const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = String(text || '').match(new RegExp(`^\\s*${escaped}\\s*=\\s*(["'])(.*?)\\1\\s*(?:#.*)?$`, 'm'))
  return clean(match?.[2])
}

function cleanServerURL(value) {
  const text = clean(value)
  if (!text || !text.startsWith('https://')) return null
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:') return null
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function credentialsPath(home = os.homedir(), env = process.env) {
  const dataHome = env.XDG_DATA_HOME || path.join(home, '.local', 'share')
  return path.join(dataHome, 'devin', 'credentials.toml')
}

function appStatePath(home = os.homedir(), platform = process.platform, env = process.env) {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Devin', 'User', 'globalStorage', 'state.vscdb')
  if (platform === 'win32') return path.join(env.APPDATA || '', 'Devin', 'User', 'globalStorage', 'state.vscdb')
  return path.join(home, '.config', 'Devin', 'User', 'globalStorage', 'state.vscdb')
}

function loadCLICredentials(options = {}) {
  const fsImpl = options.fs || fs
  const file = options.credentialsPath || credentialsPath(options.home, options.env)
  try {
    const text = fsImpl.readFileSync(file, 'utf8')
    const apiKey = parseTomlString(text, 'windsurf_api_key')
    if (!apiKey) return null
    return {
      apiKey,
      apiServerURL: cleanServerURL(parseTomlString(text, 'api_server_url')) || DEFAULT_API_SERVER,
      source: 'Devin CLI',
    }
  } catch {
    return null
  }
}

function loadAppCredentials(options = {}) {
  const fsImpl = options.fs || fs
  const file = options.appStatePath || appStatePath(options.home, options.platform, options.env)
  try {
    if (!fsImpl.existsSync(file)) return null
    const execImpl = options.execFileSync || execFileSync
    const raw = execImpl(
      'sqlite3',
      ['-readonly', `file:${file}?mode=ro`, "SELECT value FROM ItemTable WHERE key = 'windsurfAuthStatus' LIMIT 1;"],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000, maxBuffer: 1024 * 1024 },
    )
    const json = JSON.parse(String(raw || '').trim())
    const apiKey = clean(json?.apiKey)
    return apiKey ? { apiKey, apiServerURL: DEFAULT_API_SERVER, source: 'Devin app' } : null
  } catch {
    return null
  }
}

function parseUserStatus(body, now = Date.now()) {
  const userStatus = body?.userStatus
  if (!userStatus || typeof userStatus !== 'object') throw new Error('Invalid Devin response')
  const planStatus = userStatus.planStatus && typeof userStatus.planStatus === 'object' ? userStatus.planStatus : {}
  const planInfo = planStatus.planInfo && typeof planStatus.planInfo === 'object' ? planStatus.planInfo : {}
  const hideDailyQuota = planInfo.hideDailyQuota === true
  const dailyRemaining = number(planStatus.dailyQuotaRemainingPercent)
  const weeklyFieldPresent = Object.prototype.hasOwnProperty.call(planStatus, 'weeklyQuotaRemainingPercent')
  const weeklyRemaining = number(planStatus.weeklyQuotaRemainingPercent)
  if (weeklyFieldPresent && weeklyRemaining == null) throw new Error('Invalid Devin weekly quota')

  const dailyResetSeconds = number(planStatus.dailyQuotaResetAtUnix)
  const weeklyResetSeconds = number(planStatus.weeklyQuotaResetAtUnix)
  const daily = !hideDailyQuota && dailyRemaining != null
    ? {
        usedPct: clampPct(100 - dailyRemaining),
        resetAt: dailyResetSeconds && dailyResetSeconds > 0 ? dailyResetSeconds * 1000 : null,
        periodMs: DAY_MS,
      }
    : null

  let effectiveWeeklyRemaining = weeklyRemaining
  if (effectiveWeeklyRemaining == null && weeklyResetSeconds && weeklyResetSeconds > 0) effectiveWeeklyRemaining = 0
  else if (effectiveWeeklyRemaining == null && hideDailyQuota && dailyRemaining != null) effectiveWeeklyRemaining = dailyRemaining
  const weekly = effectiveWeeklyRemaining == null
    ? null
    : {
        usedPct: clampPct(100 - effectiveWeeklyRemaining),
        resetAt: weeklyResetSeconds && weeklyResetSeconds > 0 ? weeklyResetSeconds * 1000 : null,
        periodMs: WEEK_MS,
      }

  const overageMicros = number(planStatus.overageBalanceMicros)
  const extraBalanceUSD = overageMicros == null ? null : Math.max(0, overageMicros) / 1_000_000
  if (!daily && !weekly && extraBalanceUSD == null) throw new Error('Devin quota data unavailable')
  return {
    connected: true,
    plan: clean(planInfo.planName) || 'Unknown',
    daily,
    weekly,
    extraBalanceUSD,
    lastActive: now,
  }
}

async function fetchUserStatus(auth, options = {}) {
  const request = options.fetchWithTimeout || fetchWithTimeout
  const endpoint = `${auth.apiServerURL || DEFAULT_API_SERVER}/${SERVICE}/GetUserStatus`
  const res = await request(
    endpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1' },
      body: JSON.stringify({
        metadata: {
          apiKey: auth.apiKey,
          ideName: 'devin',
          ideVersion: COMPAT_VERSION,
          extensionName: 'devin',
          extensionVersion: COMPAT_VERSION,
          locale: 'en',
        },
      }),
    },
    15000,
  )
  const text = await res.text()
  if (!res.ok) {
    const error = new Error(`Devin HTTP ${res.status}`)
    error.status = res.status
    throw error
  }
  if (!text.trim()) throw new Error('Empty Devin response')
  return parseUserStatus(JSON.parse(text), options.now || Date.now())
}

async function read(options = {}) {
  const sources = options.sources || [loadCLICredentials(options), loadAppCredentials(options)].filter(Boolean)
  if (!sources.length) return { connected: false, needsKey: false, error: 'Run devin auth login or sign in to Devin and try again' }
  let lastError = null
  for (const auth of sources) {
    try {
      const usage = await fetchUserStatus(auth, options)
      return { ...usage, source: auth.source }
    } catch (err) {
      lastError = err
      if (err?.status !== 401 && err?.status !== 403) break
    }
  }
  return {
    connected: false,
    needsKey: false,
    error: lastError?.status === 401 || lastError?.status === 403
      ? 'Devin login expired — run devin auth login or sign in again'
      : lastError?.message || 'Devin quota data unavailable',
  }
}

module.exports = {
  read,
  _private: {
    COMPAT_VERSION,
    DEFAULT_API_SERVER,
    SERVICE,
    appStatePath,
    cleanServerURL,
    credentialsPath,
    fetchUserStatus,
    loadAppCredentials,
    loadCLICredentials,
    parseTomlString,
    parseUserStatus,
  },
}
