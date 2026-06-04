const fs = require('fs')
const path = require('path')

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo', '.cache'])
const CONTEXT_FILES = new Set(['AGENTS.md', 'CLAUDE.md', 'README.md', 'package.json', 'tsconfig.json'])
const SOURCE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json', '.md', '.css', '.html', '.py', '.rs', '.go'])

function clean(value) {
  return String(value || '').trim()
}

function tokenEstimateFromChars(chars) {
  return Math.ceil(Math.max(0, Number(chars) || 0) / 4)
}

function fmtTokens(value) {
  const n = Math.max(0, Math.round(Number(value) || 0))
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 10e6 ? 0 : 1).replace(/\.0$/, '')}M`
  if (n >= 1e3) return `${Math.round(n / 100) / 10}K`.replace('.0K', 'K')
  return String(n)
}

function resetLabel(resetAt, now) {
  const diff = Number(resetAt) - Number(now || Date.now())
  if (!Number.isFinite(diff) || diff <= 0) return 'soon'
  const mins = Math.floor(diff / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

function scanDir(dir, opts = {}) {
  const maxFiles = opts.maxFiles || 240
  const maxBytes = opts.maxBytes || 2_000_000
  const out = { contextBytes: 0, sourceBytes: 0, fileCount: 0, contextFiles: [] }

  function walk(cur, depth) {
    if (out.fileCount >= maxFiles || out.contextBytes + out.sourceBytes >= maxBytes || depth > 4) return
    let entries = []
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (out.fileCount >= maxFiles || out.contextBytes + out.sourceBytes >= maxBytes) break
      if (entry.name.startsWith('.') && entry.name !== '.github') continue
      const full = path.join(cur, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      let stat = null
      try { stat = fs.statSync(full) } catch { continue }
      const ext = path.extname(entry.name)
      const bytes = Math.min(stat.size || 0, 160_000)
      if (CONTEXT_FILES.has(entry.name)) {
        out.contextBytes += bytes
        out.contextFiles.push(path.relative(dir, full))
      } else if (SOURCE_EXTS.has(ext)) {
        out.sourceBytes += Math.min(bytes, 24_000)
      } else {
        continue
      }
      out.fileCount += 1
    }
  }

  walk(dir, 0)
  return out
}

function selectedModels(models, modelIds) {
  const ids = new Set(Array.isArray(modelIds) ? modelIds.map(String) : [])
  const rows = Array.isArray(models) ? models : []
  return rows.filter((m) => ids.has(String(m.id)) || m.selected === true)
}

function providerForModel(snapshot, model) {
  const providers = Array.isArray(snapshot && snapshot.providers) ? snapshot.providers : []
  return providers.find((p) => p.id === model?.id) || providers.find((p) => p.connected !== false) || null
}

function sessionWindow(provider) {
  const windows = Array.isArray(provider && provider.windows) ? provider.windows : []
  return windows.find((w) => w.kind === '5h') || windows.find((w) => /session|5\s*[- ]?\s*hour/i.test(`${w.label || ''} ${w.kind || ''}`)) || null
}

function missingInputs(dir, goal, models) {
  const missing = []
  if (!dir) missing.push('folder')
  if (!goal) missing.push('goal')
  if (!models.length) missing.push('model')
  return missing
}

function estimateMissionPreflight(input = {}) {
  const dir = clean(input.dir || input.folder)
  const goal = clean(input.goal)
  const models = selectedModels(input.models, input.modelIds)
  const missing = missingInputs(dir, goal, models)
  if (missing.length) return { ok: false, missing }
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { ok: false, missing: ['folder'] }

  const scan = scanDir(dir)
  const goalTokens = tokenEstimateFromChars(goal.length)
  const contextTokens = tokenEstimateFromChars(scan.contextBytes)
  const sampledSourceTokens = tokenEstimateFromChars(scan.sourceBytes) * 0.18
  const setupTokens = 1800
  const lowTokens = Math.round(setupTokens + goalTokens + contextTokens + sampledSourceTokens)
  const highTokens = Math.round(lowTokens * 1.75 + 2400)

  const provider = providerForModel(input.snapshot, models[0])
  const window = sessionWindow(provider)
  const usedPct = Math.max(0, Math.min(100, Math.round(Number(window && window.usedPct) || 0)))
  const freePct = 100 - usedPct
  const assumedWindowTokens = 200_000
  const lowWindowPct = Math.max(1, Math.round((lowTokens / assumedWindowTokens) * 100))
  const highWindowPct = Math.max(lowWindowPct, Math.round((highTokens / assumedWindowTokens) * 100))
  const reserveAfterPct = Math.max(0, freePct - highWindowPct)
  const reasons = []

  if (window && reserveAfterPct < 40) {
    reasons.push({
      kind: 'short-window',
      text: `${freePct}% free now; this could leave about ${reserveAfterPct}% after launch.`,
    })
  }
  if (contextTokens >= 4000) {
    reasons.push({
      kind: 'context',
      text: `${fmtTokens(contextTokens)} tokens from setup/context files before source scanning.`,
    })
  }
  if (scan.fileCount >= 80) {
    reasons.push({
      kind: 'scope',
      text: `${scan.fileCount} project files sampled; narrow the goal if this is routine work.`,
    })
  }
  if (!reasons.length) reasons.push({ kind: 'ready', text: 'Estimate looks light for the selected window.' })

  return {
    ok: true,
    providerId: provider ? provider.id : models[0].id,
    providerName: provider ? (provider.name || provider.id) : (models[0].name || models[0].id),
    folderName: path.basename(dir),
    estimate: {
      lowTokens,
      highTokens,
      lowLabel: fmtTokens(lowTokens),
      highLabel: fmtTokens(highTokens),
      lowWindowPct,
      highWindowPct,
    },
    window: window
      ? {
          label: window.label || 'Session',
          kind: window.kind || '5h',
          usedPct,
          freePct,
          resetLabel: resetLabel(window.resetAt, input.now || Date.now()),
          reserveAfterPct,
        }
      : null,
    reasons,
    summary: window
      ? `${fmtTokens(lowTokens)}-${fmtTokens(highTokens)} tokens, about ${lowWindowPct}-${highWindowPct}% of this 5-hour window.`
      : `${fmtTokens(lowTokens)}-${fmtTokens(highTokens)} tokens estimated.`,
  }
}

module.exports = {
  estimateMissionPreflight,
  _private: { scanDir, tokenEstimateFromChars, fmtTokens },
}
