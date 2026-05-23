const fs = require('fs')
const os = require('os')
const path = require('path')

const FIVE_MINUTES = 5 * 60 * 1000
let cache = { signature: null, scannedAt: 0, footprints: {} }

function unique(paths) {
  const seen = new Set()
  const result = []
  for (const candidate of paths) {
    if (!candidate) continue
    const normalized = path.resolve(String(candidate).replace(/^~(?=$|\/)/, os.homedir()))
    if (seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function candidatePaths(providerId, env = process.env) {
  const home = os.homedir()
  const codexHome = env.CODEX_HOME || path.join(home, '.codex')
  const claudeHome = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude')
  const catalog = {
    codex: [codexHome],
    claude: [
      claudeHome,
      path.join(home, '.config', 'claude'),
      path.join(home, 'Library', 'Application Support', 'CodexBar', 'ClaudeProbe'),
    ],
    gemini: [path.join(home, '.gemini'), path.join(home, '.config', 'gemini')],
    opencode: [path.join(home, '.config', 'opencode')],
    opencodego: [path.join(home, '.config', 'opencode')],
    copilot: [path.join(home, '.config', 'github-copilot')],
  }
  return unique(catalog[providerId] || [])
}

function componentName(componentPath) {
  return path.basename(componentPath)
}

function recommendationFor(providerId, component) {
  const name = componentName(component.path)
  const make = (title, consequence, priority) => ({
    path: component.path,
    bytes: component.bytes,
    title,
    consequence,
    priority,
  })

  if (providerId === 'claude') {
    if (name === 'projects') return make('Manual cleanup: past sessions', 'Clearing removes past resume, continue, and rewind history.', 10)
    if (name === 'file-history') return make('Manual cleanup: file checkpoints', 'Clearing removes checkpoint restore data for previous edits.', 20)
    if (name === 'plans') return make('Manual cleanup: saved plans', 'Clearing removes old plan-mode files.', 30)
    if (name === 'debug') return make('Manual cleanup: debug logs', 'Clearing removes past debug logs.', 40)
    if (name === 'paste-cache' || name === 'image-cache') return make('Manual cleanup: attachment cache', 'Clearing removes cached large pastes or attached images.', 50)
    if (name === 'session-env') return make('Manual cleanup: session metadata', 'Clearing removes per-session environment metadata.', 60)
    if (name === 'shell-snapshots') return make('Manual cleanup: shell snapshots', 'Clearing removes leftover runtime shell snapshot files.', 70)
    if (name === 'todos') return make('Manual cleanup: legacy todos', 'Clearing removes legacy per-session task lists.', 80)
  }

  if (providerId === 'codex') {
    if (name === 'sessions') return make('Manual cleanup: sessions', 'Clearing removes past Codex session history.', 10)
    if (name === 'archived_sessions') return make('Manual cleanup: archived sessions', 'Clearing removes archived Codex session history.', 20)
    if (['cache', 'caches', 'Cache', 'Caches'].includes(name)) return make('Manual cleanup: cache', 'Clearing removes provider-owned cached data.', 30)
    if (['log', 'logs', 'debug'].includes(name) || (name.startsWith('logs_') && name.endsWith('.sqlite'))) return make('Manual cleanup: logs', 'Clearing removes local diagnostic logs.', 40)
    if (name === 'file-history') return make('Manual cleanup: file history', 'Clearing removes local edit checkpoint history.', 50)
    if (['paste-cache', 'image-cache', 'session-env', 'shell-snapshots', 'shell_snapshots', 'tmp', 'temp', '.tmp'].includes(name)) {
      return make('Manual cleanup: temporary data', 'Clearing removes local temporary provider data.', 60)
    }
  }

  return null
}

function topLevelComponent(root, itemPath) {
  const rel = path.relative(root, itemPath)
  if (!rel || rel.startsWith('..')) return null
  return path.join(root, rel.split(path.sep)[0])
}

function scanPath(rootPath) {
  const components = new Map()
  const unreadablePaths = []
  let totalBytes = 0

  function addFile(filePath, stat) {
    const bytes = Number(stat.size) || 0
    totalBytes += bytes
    const component = topLevelComponent(rootPath, filePath) || filePath
    components.set(component, (components.get(component) || 0) + bytes)
  }

  function walk(current) {
    let stat
    try {
      stat = fs.lstatSync(current)
    } catch {
      unreadablePaths.push(current)
      return
    }
    if (stat.isSymbolicLink()) return
    if (stat.isFile()) {
      addFile(current, stat)
      return
    }
    if (!stat.isDirectory()) return

    let entries
    try {
      entries = fs.readdirSync(current)
    } catch {
      unreadablePaths.push(current)
      return
    }
    for (const entry of entries) walk(path.join(current, entry))
  }

  walk(rootPath)
  return { totalBytes, unreadablePaths, components }
}

function scanProvider(providerId, paths, now = Date.now()) {
  const existingPaths = []
  const missingPaths = []
  const unreadablePaths = []
  const componentBytes = new Map()
  let totalBytes = 0

  for (const candidate of paths) {
    if (!fs.existsSync(candidate)) {
      missingPaths.push(candidate)
      continue
    }
    existingPaths.push(candidate)
    const result = scanPath(candidate)
    totalBytes += result.totalBytes
    unreadablePaths.push(...result.unreadablePaths)
    for (const [component, bytes] of result.components) {
      componentBytes.set(component, (componentBytes.get(component) || 0) + bytes)
    }
  }

  const components = [...componentBytes.entries()]
    .map(([componentPath, bytes]) => ({
      path: componentPath,
      name: path.basename(componentPath),
      bytes,
    }))
    .sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path))

  const recommendations = components
    .map((component) => recommendationFor(providerId, component))
    .filter(Boolean)
    .sort((a, b) => a.priority - b.priority || b.bytes - a.bytes || a.path.localeCompare(b.path))

  return {
    providerId,
    totalBytes,
    hasLocalData: totalBytes > 0,
    paths: existingPaths,
    missingPaths,
    unreadablePaths,
    components,
    recommendations,
    updatedAt: now,
  }
}

function withProvider(footprint, providerId) {
  return {
    ...footprint,
    providerId,
    recommendations: (footprint.components || [])
      .map((component) => recommendationFor(providerId, component))
      .filter(Boolean)
      .sort((a, b) => a.priority - b.priority || b.bytes - a.bytes || a.path.localeCompare(b.path)),
  }
}

function scanProviders(providerIds, env = process.env, now = Date.now()) {
  const byProvider = {}
  for (const id of providerIds) {
    const paths = candidatePaths(id, env)
    if (paths.length) byProvider[id] = paths
  }
  const signature = Object.entries(byProvider)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, paths]) => `${id}=${paths.join('\u001f')}`)
    .join('\u001e')

  if (cache.signature === signature && now - cache.scannedAt < FIVE_MINUTES) return cache.footprints

  const footprints = {}
  const pathCache = new Map()
  for (const [id, paths] of Object.entries(byProvider)) {
    const pathKey = paths.join('\u001f')
    if (pathCache.has(pathKey)) {
      footprints[id] = withProvider(pathCache.get(pathKey), id)
      continue
    }
    const footprint = scanProvider(id, paths, now)
    pathCache.set(pathKey, footprint)
    footprints[id] = footprint
  }
  cache = { signature, scannedAt: now, footprints }
  return footprints
}

function resetCacheForTesting() {
  cache = { signature: null, scannedAt: 0, footprints: {} }
}

module.exports = {
  candidatePaths,
  scanProvider,
  scanProviders,
  _private: { resetCacheForTesting, recommendationFor },
}
