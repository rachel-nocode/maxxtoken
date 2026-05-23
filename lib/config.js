const fs = require('fs')
const os = require('os')
const path = require('path')
const { defaultTerminal, normalizeTerminal } = require('./terminals')

const DIR = path.join(os.homedir(), '.maxxtoken')
const FILE = path.join(DIR, 'config.json')

// Default subscriptions. Costs are what people typically overspend on.
const DEFAULT_CONFIG = {
  billingDay: 1,
  openAtLogin: true,
  terminal: null,
  providers: {
    claude: { name: 'Claude', plan: 'Max', monthly: 200, enabled: true },
    // Codex CLI runs on the OpenAI / ChatGPT Pro subscription.
    codex: { name: 'ChatGPT', plan: 'Pro', monthly: 200, enabled: true },
    kimi: { name: 'Kimi', plan: 'Basic', monthly: 15, enabled: true },
    grok: { name: 'Grok', plan: 'Build', monthly: 99, enabled: true },
    gemini: { name: 'Gemini', plan: 'Pro', monthly: 20, enabled: true },
    cursor: { name: 'Cursor', plan: 'Pro', monthly: 20, enabled: false },
  },
}

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    // Merge so new default providers appear for existing users.
    const providers = { ...DEFAULT_CONFIG.providers }
    for (const [id, p] of Object.entries(raw.providers || {})) {
      providers[id] = { ...providers[id], ...p }
    }
    return {
      billingDay: raw.billingDay || 1,
      openAtLogin: raw.openAtLogin ?? DEFAULT_CONFIG.openAtLogin,
      terminal: normalizeTerminal(raw.terminal),
      providers,
    }
  } catch {
    return { ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)), terminal: defaultTerminal() }
  }
}

function saveConfig(config) {
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(config, null, 2))
  return config
}

// Billing cycle anchored to billingDay of the month.
function billingCycle(billingDay = 1) {
  const now = new Date()
  let start = new Date(now.getFullYear(), now.getMonth(), billingDay)
  if (start > now) start = new Date(now.getFullYear(), now.getMonth() - 1, billingDay)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, billingDay)
  const dayMs = 86400000
  return {
    start,
    end,
    startMs: start.getTime(),
    endMs: end.getTime(),
    daysElapsed: Math.max(1, Math.floor((now - start) / dayMs)),
    daysLeft: Math.max(0, Math.ceil((end - now) / dayMs)),
    totalDays: Math.round((end - start) / dayMs),
    label: start.toLocaleString('en-US', { month: 'short' }) + ' cycle',
  }
}

module.exports = { loadConfig, saveConfig, billingCycle, FILE }
