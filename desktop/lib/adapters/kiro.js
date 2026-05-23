const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const EXTRA_PATHS = [
  path.join(os.homedir(), '.local/bin'),
  path.join(os.homedir(), '.bun/bin'),
  path.join(os.homedir(), '.cargo/bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
]

function num(value) {
  const n = Number(String(value || '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function pct(value) {
  const n = num(value)
  if (n == null) return null
  return Math.max(0, Math.min(100, n))
}

function stripANSI(text) {
  return String(text || '').replace(/\x1B\[[0-9;?]*[A-Za-z]|\x1B\].*?\x07/g, '')
}

function clean(value) {
  return stripANSI(value).replace(/\s+/g, ' ').trim()
}

function firstCapture(text, regex) {
  const match = String(text || '').match(regex)
  return match ? clean(match[1] || match[0]) : null
}

function resolveKiro() {
  for (const name of ['kiro-cli', 'kiro']) {
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

function runKiro(bin, args, timeout = 10000) {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      {
        timeout,
        env: { ...process.env, TERM: 'xterm-256color' },
      },
      (err, stdout, stderr) => {
        const out = String(stdout || '')
        const errOut = String(stderr || '')
        if (err) {
          return resolve({
            ok: false,
            output: out || errOut,
            error: err.killed ? 'Kiro CLI timed out' : err.message || String(err),
          })
        }
        resolve({ ok: true, output: out || errOut })
      },
    )
  })
}

function parseWhoAmI(output) {
  const stripped = stripANSI(output)
  const lowered = stripped.toLowerCase()
  if (lowered.includes('not logged in') || lowered.includes('login required')) {
    throw new Error("Not logged in to Kiro. Run 'kiro-cli login' first.")
  }

  let email = null
  let authMethod = null
  for (const raw of stripped.split(/\r?\n/)) {
    const line = clean(raw)
    if (!line) continue
    if (/logged in with/i.test(line)) authMethod = clean(line.replace(/^logged in with\s+/i, ''))
    else if (/^email:/i.test(line)) email = clean(line.replace(/^email:\s*/i, ''))
    else if (!email && !line.includes(' ') && line.includes('@')) email = line
  }
  return { email, authMethod }
}

function displayPlanName(plan) {
  const cleaned = clean(plan)
  if (!/kiro/i.test(cleaned)) return cleaned || 'Kiro'
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((word) => (word.toLowerCase() === 'kiro' ? 'Kiro' : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(' ')
}

function parsePlanName(text) {
  const stripped = stripANSI(text)
  const estimated = firstCapture(stripped, /Estimated Usage\s*\|[^\n|]*\|\s*([A-Z][A-Z0-9 ]+)/i)
  if (estimated) return displayPlanName(estimated)

  const explicit = firstCapture(stripped, /Plan:\s*([^\n]+)/i)
  if (explicit) return displayPlanName(explicit)

  const legacy = firstCapture(stripped, /\|\s*(KIRO\s+\w+)/i)
  return displayPlanName(legacy || 'Kiro')
}

function parseResetDate(value, now = Date.now()) {
  if (!value) return null
  const raw = clean(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const ms = Date.parse(raw + 'T00:00:00')
    return Number.isFinite(ms) ? ms : null
  }

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (!match) return null
  const base = new Date(now)
  let candidate = new Date(base.getFullYear(), Number(match[1]) - 1, Number(match[2]))
  if (candidate.getTime() <= now) candidate = new Date(base.getFullYear() + 1, Number(match[1]) - 1, Number(match[2]))
  return candidate.getTime()
}

function parseBonusCredits(text) {
  const stripped = stripANSI(text)
  const match = stripped.match(/Bonus credits:\s*([\d,.]+)\s*\/\s*([\d,.]+)/i)
  const used = match ? num(match[1]) : null
  const total = match ? num(match[2]) : null
  const expiryDays = firstCapture(stripped, /expires in\s+(\d+)\s+days?/i)
  if (used == null && total == null && expiryDays == null) return null
  return { used, total, remaining: total == null || used == null ? null : Math.max(0, total - used), expiryDays: expiryDays == null ? null : Number(expiryDays) }
}

function parseContextUsage(output) {
  const stripped = stripANSI(output)
  const total = firstCapture(stripped, /Context window:\s*([\d.]+)%\s+used/i)
  if (total == null) return null
  return {
    totalPercentUsed: pct(total),
    contextFilesPercent: pct(firstCapture(stripped, /Context files\s+([\d.]+)%/i)),
    toolsPercent: pct(firstCapture(stripped, /Tools\s+([\d.]+)%/i)),
    kiroResponsesPercent: pct(firstCapture(stripped, /Kiro responses\s+([\d.]+)%/i)),
    promptsPercent: pct(firstCapture(stripped, /Your prompts\s+([\d.]+)%/i)),
  }
}

function parseUsageOutput(output, account = {}, now = Date.now()) {
  const stripped = stripANSI(output)
  const trimmed = stripped.trim()
  if (!trimmed) throw new Error('Empty output from kiro-cli')

  const lowered = stripped.toLowerCase()
  if (
    lowered.includes('not logged in') ||
    lowered.includes('login required') ||
    lowered.includes('failed to initialize auth portal') ||
    lowered.includes('kiro-cli login') ||
    lowered.includes('oauth error')
  ) {
    throw new Error("Not logged in to Kiro. Run 'kiro-cli login' first.")
  }
  if (lowered.includes('could not retrieve usage information')) throw new Error('Kiro CLI could not retrieve usage information.')

  const credits = stripped.match(/\(([\d,.]+)\s+of\s+([\d,.]+)\s+covered/i)
  let creditsUsed = credits ? num(credits[1]) : null
  let creditsTotal = credits ? num(credits[2]) : null
  let creditsPercent = pct(firstCapture(stripped, /█+\s*([\d.]+)%/))

  if (creditsPercent == null && creditsUsed != null && creditsTotal > 0) creditsPercent = (creditsUsed / creditsTotal) * 100
  if (creditsUsed == null && creditsTotal != null && creditsPercent != null) creditsUsed = creditsTotal * (creditsPercent / 100)
  if (creditsTotal == null && creditsPercent != null) creditsTotal = 0

  const managedPlan = lowered.includes('managed by admin') || lowered.includes('managed by organization')
  if (creditsPercent == null && creditsUsed == null && !managedPlan) {
    throw new Error('No recognizable Kiro usage patterns found.')
  }

  const resetRaw = firstCapture(stripped, /resets on\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2})/i)
  const overageCreditsUsed = firstCapture(stripped, /Credits used:\s*([\d.]+)/i)

  return {
    connected: true,
    plan: parsePlanName(stripped),
    creditsUsed: creditsUsed || 0,
    creditsTotal: creditsTotal || 0,
    creditsRemaining: Math.max(0, (creditsTotal || 0) - (creditsUsed || 0)),
    creditsPercent: pct(creditsPercent || 0) || 0,
    bonusCredits: parseBonusCredits(stripped),
    overagesStatus: firstCapture(stripped, /Overages:\s*([^\n]+)/i),
    overageCreditsUsed: overageCreditsUsed == null ? null : num(overageCreditsUsed),
    estimatedOverageCostUSD: num(firstCapture(stripped, /Est\.\s*cost:\s*\$?([\d.]+)\s*USD/i)),
    manageURL: firstCapture(stripped, /(https:\/\/app\.kiro\.dev\/account\/usage)/i),
    contextUsage: account.contextUsage || null,
    email: account.email || null,
    authMethod: account.authMethod || null,
    resetAt: parseResetDate(resetRaw, now),
    lastActive: now,
  }
}

async function read() {
  const bin = resolveKiro()
  if (!bin) return { connected: false, error: 'kiro-cli not found. Install Kiro or add it to PATH.' }

  const who = await runKiro(bin, ['whoami'], 5000)
  if (!who.ok) return { connected: false, error: who.output || who.error }

  let account
  try {
    account = parseWhoAmI(who.output)
  } catch (err) {
    return { connected: false, error: err.message || String(err) }
  }

  const usage = await runKiro(bin, ['chat', '--no-interactive', '/usage'], 20000)
  if (!usage.ok && !usage.output) return { connected: false, error: usage.error }

  const context = await runKiro(bin, ['chat', '--no-interactive', '/context'], 8000)
  const contextUsage = context.output ? parseContextUsage(context.output) : null

  try {
    return parseUsageOutput(usage.output, { ...account, contextUsage })
  } catch (err) {
    return { connected: false, error: err.message || String(err) }
  }
}

module.exports = {
  read,
  _private: {
    stripANSI,
    parseWhoAmI,
    parseUsageOutput,
    parseContextUsage,
    parseResetDate,
    resolveKiro,
  },
}
