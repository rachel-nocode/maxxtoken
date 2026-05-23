// Lightweight file logger. Writes to <userData>/debug.log.
// Rotates at ~1 MB to a single .log.1 backup.
const fs = require('fs')
const path = require('path')

let logPath = null
let initialized = false
const MAX_BYTES = 1_000_000

function init(userDataDir) {
  if (initialized) return
  try {
    fs.mkdirSync(userDataDir, { recursive: true })
    logPath = path.join(userDataDir, 'debug.log')
    initialized = true
    line('info', 'logger', 'started', { pid: process.pid })
  } catch {
    /* logging must never throw */
  }
}

function rotate() {
  try {
    const stat = fs.statSync(logPath)
    if (stat.size < MAX_BYTES) return
    const backup = logPath + '.1'
    try { fs.unlinkSync(backup) } catch {}
    fs.renameSync(logPath, backup)
  } catch {
    /* ignore */
  }
}

// Patterns that strongly indicate a secret. Order matters — narrower first.
const SECRET_KEY_RE = /\b(authorization|x-api-key|x-auth-token|cookie|set-cookie|access[-_]?token|refresh[-_]?token|id[-_]?token|api[-_]?key|apikey|client[-_]?secret|client[-_]?id|secret|password|passwd|pwd|bearer|session[-_]?token|session[-_]?id|csrf|csrftoken|wpa|ory_session)\b/i

// Value-shape patterns: long opaque tokens, JWTs, OpenAI/Anthropic style.
const VALUE_PATTERNS = [
  /\bsk-[A-Za-z0-9_\-]{16,}\b/g,                  // OpenAI / Anthropic style
  /\bsk-ant-[A-Za-z0-9_\-]{16,}\b/g,
  /\bsk-or-[A-Za-z0-9_\-]{16,}\b/g,
  /\bcpk-[A-Za-z0-9_\-]{16,}\b/g,
  /\bwpa_[A-Za-z0-9_\-]{16,}\b/g,
  /\beyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]+/g,  // JWT
  /\bgh[opsu]_[A-Za-z0-9]{20,}\b/g,                // GitHub tokens
  /\bBearer\s+[A-Za-z0-9_\-.=]+/gi,
  /\b[A-Fa-f0-9]{40,}\b/g,                         // long hex (SHA, secrets)
  /[?&](?:access[_-]?token|token|apikey|api[_-]?key|key|secret|password|sig|signature)=[^&\s"']+/gi,
]

function scrubString(s) {
  if (typeof s !== 'string' || !s) return s
  let out = s
  for (const re of VALUE_PATTERNS) out = out.replace(re, '[REDACTED]')
  // Redact `Cookie: ...` and `Set-Cookie: ...` value portions entirely
  out = out.replace(/(\b(?:cookie|set-cookie)\s*[:=]\s*)([^\n]+)/gi, '$1[REDACTED]')
  return out
}

function scrubValue(value) {
  if (value == null) return value
  if (typeof value === 'string') return scrubString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(scrubValue)
  if (typeof value === 'object') return scrubObject(value)
  return value
}

function scrubObject(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEY_RE.test(k)) {
      out[k] = '[REDACTED]'
    } else {
      out[k] = scrubValue(v)
    }
  }
  return out
}

function line(level, scope, msg, data) {
  if (!initialized || !logPath) return
  try {
    rotate()
    const stamp = new Date().toISOString()
    const safeMsg = scrubString(String(msg))
    const safeData = data && typeof data === 'object' ? scrubObject(data) : null
    const payload = safeData && Object.keys(safeData).length ? ' ' + JSON.stringify(safeData) : ''
    fs.appendFileSync(logPath, `${stamp} [${level}] ${scope}: ${safeMsg}${payload}\n`)
  } catch {
    /* ignore */
  }
}

const info = (scope, msg, data) => line('info', scope, msg, data)
const warn = (scope, msg, data) => line('warn', scope, msg, data)
const error = (scope, msg, data) => line('error', scope, msg, data)

async function timed(scope, label, fn, slowMs = 1500) {
  const start = Date.now()
  try {
    const result = await fn()
    const ms = Date.now() - start
    if (ms >= slowMs) warn(scope, `${label} slow`, { ms })
    else info(scope, `${label} ok`, { ms })
    return result
  } catch (err) {
    const ms = Date.now() - start
    error(scope, `${label} failed`, { ms, error: err && err.message ? err.message : String(err) })
    throw err
  }
}

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label || 'op'} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function getLogPath() {
  return logPath
}

module.exports = { init, info, warn, error, timed, withTimeout, getLogPath }
