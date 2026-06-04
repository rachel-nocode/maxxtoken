const fs = require('fs')
const path = require('path')

const NOISY_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.vercel',
  '.expo',
  'screenshots',
  'screenshot',
  'debug',
  'logs',
  'tmp',
  'temp',
  '.git',
])

const NOISY_EXTS = new Set(['.log', '.mp4', '.mov', '.webm', '.zip', '.gz', '.tar', '.png', '.jpg', '.jpeg', '.gif', '.sqlite', '.db'])
const INSTRUCTION_FILES = new Set(['AGENTS.md', 'CLAUDE.md'])

function tokenEstimate(bytes) {
  return Math.ceil(Math.max(0, Number(bytes) || 0) / 4)
}

function fmtTokens(tokens) {
  const n = Math.max(0, Math.round(Number(tokens) || 0))
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${Math.round(n / 100) / 10}K`.replace('.0K', 'K')
  return String(n)
}

function finding(action, detail, itemPath, bytes, priority) {
  const estimatedTokens = tokenEstimate(bytes)
  return {
    action,
    detail,
    path: itemPath,
    bytes: Math.max(0, Math.round(Number(bytes) || 0)),
    estimatedTokens,
    tokenLabel: estimatedTokens > 0 ? `~${fmtTokens(estimatedTokens)} est.` : '',
    priority,
  }
}

function estimateFolderBytes(dir, opts = {}) {
  const maxFiles = opts.maxFiles || 800
  const maxDepth = opts.maxDepth || 4
  const maxBytes = opts.maxBytes || 2_000_000
  let bytes = 0
  let scanned = 0

  function walk(current, depth = 0) {
    if (scanned >= maxFiles || depth > maxDepth || bytes >= maxBytes) return
    let entries = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (scanned >= maxFiles || bytes >= maxBytes) break
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      scanned += 1
      try {
        bytes += Math.min(fs.statSync(full).size || 0, 250_000)
      } catch {
        /* ignore unreadable files */
      }
    }
  }

  walk(dir, 0)
  return Math.min(bytes, maxBytes)
}

function instructionFinding(file, rel, bytes) {
  let lines = 0
  try {
    lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).length
  } catch {
    lines = 0
  }
  if (lines < 180 && bytes < 16000) return null
  return finding(
    'Review instructions',
    `${rel} is ${lines || '?'} lines`,
    file,
    bytes,
    100,
  )
}

function scanContextBloat(dir, opts = {}) {
  const root = String(dir || '').trim()
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return { ok: false, error: 'Pick a real folder.' }
  }

  const maxFiles = opts.maxFiles || 2500
  const maxDepth = opts.maxDepth || 5
  const findings = []
  let scanned = 0

  function add(item) {
    if (item) findings.push(item)
  }

  function walk(current, depth = 0) {
    if (scanned >= maxFiles || depth > maxDepth) return
    let stat
    try {
      stat = fs.lstatSync(current)
    } catch {
      return
    }
    if (stat.isSymbolicLink()) return
    const name = path.basename(current)
    const rel = path.relative(root, current) || name
    if (stat.isDirectory()) {
      if (NOISY_DIRS.has(name)) {
        add(finding('Keep folder out', rel, current, estimateFolderBytes(current), name === '.git' ? 95 : 90))
        return
      }
      let entries = []
      try {
        entries = fs.readdirSync(current)
      } catch {
        return
      }
      for (const entry of entries) walk(path.join(current, entry), depth + 1)
      return
    }
    if (!stat.isFile()) return
    scanned += 1

    const bytes = Number(stat.size) || 0
    const ext = path.extname(name).toLowerCase()
    if (INSTRUCTION_FILES.has(name)) add(instructionFinding(current, rel, bytes))
    else if (NOISY_EXTS.has(ext)) add(finding('Keep file out', rel, current, bytes, 80))
    else if (bytes >= 750000) add(finding('Review large file', rel, current, bytes, 70))
  }

  walk(root)
  findings.sort((a, b) => b.priority - a.priority || b.estimatedTokens - a.estimatedTokens || a.detail.localeCompare(b.detail))
  const top = findings.slice(0, 12)
  const estimatedTokens = top.reduce((sum, item) => sum + (item.estimatedTokens || 0), 0)

  return {
    ok: true,
    folderName: path.basename(root) || root,
    dir: root,
    findings: top.map(({ priority, ...item }) => item),
    estimatedTokens,
    tokenLabel: fmtTokens(estimatedTokens),
    summary: top.length
      ? `${top.length} item${top.length === 1 ? '' : 's'} to review. MaxxToken will not delete anything.`
      : 'No obvious context bloat found.',
  }
}

module.exports = {
  scanContextBloat,
  _private: { tokenEstimate, fmtTokens, finding },
}
