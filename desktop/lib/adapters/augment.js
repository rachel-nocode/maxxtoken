const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const BASE = 'https://app.augmentcode.com'
const EXTRA_PATHS = [
  path.join(os.homedir(), '.local/bin'),
  path.join(os.homedir(), '.bun/bin'),
  path.join(os.homedir(), '.cargo/bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
]

function num(value) {
  if (value == null || value === '') return null
  const n = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function pct(used, total) {
  const u = num(used)
  const t = num(total)
  if (u == null || t == null || t <= 0) return null
  return Math.max(0, Math.min(100, (u / t) * 100))
}

function parseDate(value) {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function cookieHeader(raw) {
  return String(raw || '')
    .replace(/^Cookie:\s*/i, '')
    .trim()
}

function resolveAuggie() {
  for (const name of ['auggie', 'augment']) {
    for (const dir of EXTRA_PATHS) {
      const candidate = path.join(dir, name)
      try {
        fs.accessSync(candidate, fs.constants.X_OK)
        return candidate
      } catch {
        /* keep looking */
      }
    }
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
      if (!dir) continue
      const candidate = path.join(dir, name)
      try {
        fs.accessSync(candidate, fs.constants.X_OK)
        return candidate
      } catch {
        /* keep looking */
      }
    }
  }
  return null
}

function runAuggie(bin) {
  return new Promise((resolve) => {
    execFile(bin, ['account', 'status'], { timeout: 15000 }, (err, stdout, stderr) => {
      const out = String(stdout || '')
      const errOut = String(stderr || '')
      if (err) return resolve({ ok: false, output: out || errOut, error: err.message || String(err) })
      resolve({ ok: true, output: out || errOut })
    })
  })
}

function parseAuggieStatus(output, now = Date.now()) {
  const text = String(output || '')
  if (/Authentication failed|auggie login|not authenticated/i.test(text)) {
    throw new Error("Not authenticated. Run 'auggie login' to authenticate.")
  }

  const planMatch = text.match(/(.+?\bPlan\b)\s+([\d,]+)\s+credits\s*\/\s*month/i)
  const remainingMatch = text.match(/([\d,]+)\s+remaining/i)
  const usedMatch = text.match(/([\d,]+)\s*\/\s*([\d,]+)\s+credits used/i)
  const cycleMatch = text.match(/ends\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)

  if (!remainingMatch || !usedMatch) throw new Error('Could not parse Augment CLI credits.')

  const used = num(usedMatch[1])
  const total = num(usedMatch[2])
  const remaining = num(remainingMatch[1])
  const cycleEnd = cycleMatch ? parseDate(cycleMatch[1]) : null
  return {
    connected: true,
    source: 'cli',
    plan: planMatch ? `${planMatch[1].trim()} ${Number(num(planMatch[2]) || 0).toLocaleString('en-US')} credits/month` : 'Augment',
    creditsRemaining: remaining,
    creditsUsed: used,
    creditsLimit: total,
    usedPct: pct(used, total),
    resetAt: cycleEnd,
    lastActive: now,
  }
}

function parseCreditsResponse(credits, subscription = {}, now = Date.now()) {
  if (!credits || typeof credits !== 'object') throw new Error('Missing Augment credits response.')

  const remaining = num(credits.usageUnitsRemaining)
  const used = num(credits.usageUnitsConsumedThisBillingCycle)
  let limit = num(credits.usageUnitsAvailable)
  if ((limit == null || limit <= 0) && remaining != null && used != null) limit = remaining + used

  if (remaining == null && used == null && limit == null) throw new Error('Missing Augment credit fields.')

  return {
    connected: true,
    source: 'web',
    plan: subscription?.planName || 'Augment',
    creditsRemaining: remaining,
    creditsUsed: used,
    creditsLimit: limit,
    usedPct: used != null && limit ? pct(used, limit) : remaining != null && limit ? pct(limit - remaining, limit) : 0,
    resetAt: parseDate(subscription?.billingPeriodEnd),
    email: subscription?.email || '',
    organization: subscription?.organization || '',
    balanceStatus: credits.usageBalanceStatus || '',
    lastActive: now,
  }
}

async function fetchJSON(url, cookie) {
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: 'application/json',
        Cookie: cookie,
      },
    },
    15000,
  )
  if (res.status === 401) throw new Error('Augment session expired.')
  if (res.status === 403) throw new Error('Not logged in to Augment.')
  if (!res.ok) throw new Error(`Augment HTTP ${res.status}`)
  return res.json()
}

async function readWeb() {
  const cookie = cookieHeader(getKey('augment'))
  if (!cookie) return { connected: false, needsKey: true }

  const credits = await fetchJSON(`${BASE}/api/credits`, cookie)
  let subscription = {}
  try {
    subscription = await fetchJSON(`${BASE}/api/subscription`, cookie)
  } catch {
    /* optional */
  }
  return parseCreditsResponse(credits, subscription)
}

async function read() {
  const bin = resolveAuggie()
  if (bin) {
    const cli = await runAuggie(bin)
    if (cli.ok && cli.output.trim()) {
      try {
        return parseAuggieStatus(cli.output)
      } catch (err) {
        return { connected: false, error: err.message || String(err) }
      }
    }
  }

  try {
    return await readWeb()
  } catch (err) {
    return { connected: false, needsKey: true, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    cookieHeader,
    parseAuggieStatus,
    parseCreditsResponse,
    resolveAuggie,
  },
}
