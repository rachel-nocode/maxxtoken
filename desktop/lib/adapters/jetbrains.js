const fs = require('fs')
const os = require('os')
const path = require('path')

const QUOTA_FILE = 'AIAssistantQuotaManager2.xml'
const IDE_PATTERNS = [
  ['IntelliJIdea', 'IntelliJ IDEA'],
  ['PyCharm', 'PyCharm'],
  ['WebStorm', 'WebStorm'],
  ['GoLand', 'GoLand'],
  ['CLion', 'CLion'],
  ['DataGrip', 'DataGrip'],
  ['RubyMine', 'RubyMine'],
  ['Rider', 'Rider'],
  ['PhpStorm', 'PhpStorm'],
  ['AppCode', 'AppCode'],
  ['Fleet', 'Fleet'],
  ['AndroidStudio', 'Android Studio'],
  ['RustRover', 'RustRover'],
  ['Aqua', 'Aqua'],
  ['DataSpell', 'DataSpell'],
]

function num(value) {
  if (value == null || value === '') return null
  const n = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function pct(used, maximum) {
  const u = num(used)
  const max = num(maximum)
  if (u == null || max == null || max <= 0) return 0
  return Math.max(0, Math.min(100, (u / max) * 100))
}

function parseDate(value) {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function decodeEntities(value) {
  return String(value || '')
    .replaceAll('&#10;', '\n')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&apos;', "'")
}

function optionValue(xml, name) {
  const component = String(xml || '').match(/<component[^>]*name=["']AIAssistantQuotaManager2["'][^>]*>[\s\S]*?<\/component>/)
  if (!component) return null
  const block = component[0]
  const options = block.match(/<option\b[^>]*>/g) || []
  for (const option of options) {
    const nameMatch = option.match(/\bname=(["'])(.*?)\1/)
    if (!nameMatch || nameMatch[2] !== name) continue
    const valueMatch = option.match(/\bvalue=(["'])(.*?)\1/)
    return valueMatch ? decodeEntities(valueMatch[2]) : null
  }
  return null
}

function parseQuotaInfo(raw) {
  const json = JSON.parse(raw)
  const tariffQuota = json.tariffQuota && typeof json.tariffQuota === 'object' ? json.tariffQuota : {}
  const used = num(json.current) || 0
  const maximum = num(json.maximum) || 0
  const available = num(tariffQuota.available)
  return {
    type: json.type || '',
    used,
    maximum,
    available: available == null ? Math.max(0, maximum - used) : available,
    until: parseDate(json.until),
    usedPct: pct(used, maximum),
  }
}

function parseRefillInfo(raw) {
  if (!raw) return null
  const json = JSON.parse(raw)
  const tariff = json.tariff && typeof json.tariff === 'object' ? json.tariff : {}
  return {
    type: json.type || '',
    next: parseDate(json.next),
    amount: num(json.amount) ?? num(tariff.amount),
    duration: json.duration || tariff.duration || '',
  }
}

function parseQuotaXML(xml, detectedIDE = null, now = Date.now()) {
  const quotaRaw = optionValue(xml, 'quotaInfo')
  if (!quotaRaw) throw new Error('No JetBrains AI quota information found.')
  const quota = parseQuotaInfo(quotaRaw)
  const refill = parseRefillInfo(optionValue(xml, 'nextRefill'))
  return {
    connected: true,
    source: 'local',
    plan: quota.type || 'JetBrains AI',
    used: quota.used,
    maximum: quota.maximum,
    available: quota.available,
    usedPct: quota.usedPct,
    resetAt: refill?.next || quota.until || null,
    refillAmount: refill?.amount ?? null,
    refillDuration: refill?.duration || '',
    ide: detectedIDE,
    lastActive: now,
  }
}

function configRoots() {
  const home = os.homedir()
  return [
    path.join(home, 'Library', 'Application Support', 'JetBrains'),
    path.join(home, 'Library', 'Application Support', 'Google'),
  ]
}

function parseIDEDir(dirname, basePath) {
  const lower = dirname.toLowerCase()
  for (const [prefix, name] of IDE_PATTERNS) {
    if (!lower.startsWith(prefix.toLowerCase())) continue
    const version = dirname.slice(prefix.length) || 'Unknown'
    const base = path.join(basePath, dirname)
    return {
      name,
      version,
      displayName: `${name} ${version}`,
      basePath: base,
      quotaFilePath: path.join(base, 'options', QUOTA_FILE),
    }
  }
  return null
}

function detectIDEs(includeMissingQuota = false) {
  const found = []
  for (const root of configRoots()) {
    let entries = []
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const ide = parseIDEDir(entry.name, root)
      if (!ide) continue
      if (includeMissingQuota || fs.existsSync(ide.quotaFilePath)) found.push(ide)
    }
  }
  return found.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

function latestIDE() {
  const ides = detectIDEs(false)
  let latest = null
  let latestMtime = 0
  for (const ide of ides) {
    try {
      const mtime = fs.statSync(ide.quotaFilePath).mtimeMs
      if (mtime > latestMtime) {
        latest = ide
        latestMtime = mtime
      }
    } catch {
      /* ignore */
    }
  }
  return latest || ides[0] || null
}

function read() {
  const ide = latestIDE()
  if (!ide) return { connected: false, error: 'No JetBrains IDE with AI Assistant quota found.' }
  try {
    const xml = fs.readFileSync(ide.quotaFilePath, 'utf8')
    return parseQuotaXML(xml, ide.displayName)
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    decodeEntities,
    optionValue,
    parseQuotaXML,
    parseQuotaInfo,
    parseRefillInfo,
    detectIDEs,
    parseIDEDir,
  },
}
