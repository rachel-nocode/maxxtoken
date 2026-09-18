const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const windsurf = require('./adapters/windsurf')
const cursor = require('./adapters/cursor')
const copilotAuth = require('./copilot-auth')
const antigravity = require('./adapters/antigravity')
const { PROVIDER_CAPABILITIES, getProviderCapability } = require('./provider-capabilities')

function shQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'"
}

function exists(file, fsImpl = fs) {
  try {
    return fsImpl.existsSync(file)
  } catch {
    return false
  }
}

function executableExists(bin, execImpl = execFileSync) {
  try {
    execImpl('/bin/zsh', ['-lc', `command -v ${shQuote(bin)}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    })
    return true
  } catch {
    return false
  }
}

function firstExisting(paths, fsImpl = fs) {
  return paths.find((candidate) => exists(candidate, fsImpl)) || null
}

function mark(out, id, reason, evidence, evidenceType = 'credentials') {
  if (out[id]) return
  out[id] = { detected: true, reason, evidence, evidenceType }
}

function clean(value) {
  const text = String(value || '').trim()
  return text || null
}

function firstEnv(names, env) {
  for (const name of names) {
    if (clean(env[name])) return name
  }
  return null
}

function markEnv(out, id, names, env) {
  const name = firstEnv(names, env)
  if (name) mark(out, id, `${name} found`, name)
}

function markFile(out, id, reason, paths, fsImpl) {
  const file = firstExisting(paths, fsImpl)
  if (file) mark(out, id, reason, file)
}

const CLI_BINS = Object.fromEntries(Object.values(PROVIDER_CAPABILITIES)
  .filter((capability) => capability.discovery.cliBins.length)
  .map((capability) => [capability.id, capability.discovery.cliBins]))

const ENV_KEYS = Object.fromEntries(Object.values(PROVIDER_CAPABILITIES)
  .filter((capability) => capability.discovery.envKeys.length)
  .map((capability) => [capability.id, capability.discovery.envKeys]))

function detectLocalProviders(options = {}) {
  const home = options.home || os.homedir()
  const env = options.env || process.env
  const fsImpl = options.fs || fs
  const execImpl = options.execFileSync || execFileSync
  const out = {}

  const codexHome = env.CODEX_HOME || path.join(home, '.codex')
  const codexAuth = firstExisting([
    path.join(codexHome, 'auth.json'),
    path.join(home, '.config', 'codex', 'auth.json'),
  ], fsImpl)
  if (codexAuth) mark(out, 'codex', 'Codex auth found', codexAuth)
  else if (exists(path.join(codexHome, 'sessions'), fsImpl)) mark(out, 'codex', 'Codex sessions found', path.join(codexHome, 'sessions'))
  else if (executableExists('codex', execImpl)) mark(out, 'codex', 'Codex CLI found', 'codex', 'installed')

  const claudeHome = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude')
  const claudeEvidence = firstExisting([
    path.join(claudeHome, '.credentials.json'),
    path.join(claudeHome, 'projects'),
    path.join(home, '.config', 'claude', 'projects'),
  ], fsImpl)
  if (claudeEvidence) mark(out, 'claude', 'Claude local data found', claudeEvidence)
  else if (executableExists('claude', execImpl)) mark(out, 'claude', 'Claude CLI found', 'claude', 'installed')

  const configuredGeminiHome = clean(env.GEMINI_CLI_HOME)
  const geminiDirs = configuredGeminiHome
    ? [configuredGeminiHome, path.join(configuredGeminiHome, '.gemini')]
    : [path.join(home, '.gemini')]
  const geminiEvidence = firstExisting([
    ...geminiDirs.map((dir) => path.join(dir, 'oauth_creds.json')),
    ...geminiDirs.map((dir) => path.join(dir, 'history')),
    ...geminiDirs.map((dir) => path.join(dir, 'tmp')),
    path.join(home, '.config', 'gemini'),
  ], fsImpl)
  if (geminiEvidence) mark(out, 'gemini', 'Gemini local data found', geminiEvidence)
  else if (executableExists('gemini', execImpl)) mark(out, 'gemini', 'Gemini CLI found', 'gemini', 'installed')

  const antigravityEvidence = firstExisting([
    path.join(home, '.codexbar', 'antigravity', 'oauth_creds.json'),
    path.join(home, '.config', 'antigravity'),
  ], fsImpl)
  if (antigravityEvidence) mark(out, 'antigravity', 'Antigravity auth found', antigravityEvidence)
  else if (antigravity._private.loadKeychainCredentials({ platform: options.platform, execFileSync: execImpl })) {
    mark(out, 'antigravity', 'Antigravity login found', 'macOS Keychain')
  }

  const cursorBrowserSession = cursor._private.cookieRecordsFromFiles(cursor._private.browserCookieFiles(home))[0]
  if (cursorBrowserSession) mark(out, 'cursor', 'Cursor browser session found', cursorBrowserSession.sourceLabel)

  const cursorAppAuth = cursor._private.appAuthFromState({ home })
  if (cursorAppAuth) mark(out, 'cursor', 'Cursor app auth found', 'Cursor global storage')

  const cursorEvidence = firstExisting([
    path.join(home, '.cursor'),
    path.join(home, 'Library', 'Application Support', 'Cursor'),
  ], fsImpl)
  if (cursorEvidence) mark(out, 'cursor', 'Cursor local data found', cursorEvidence)

  const dataHome = env.XDG_DATA_HOME || path.join(home, '.local', 'share')
  const opencodeEvidence =
    firstExisting([path.join(home, '.config', 'opencode'), path.join(dataHome, 'opencode', 'opencode.db')], fsImpl) ||
    null
  if (opencodeEvidence) {
    mark(out, 'opencode', 'OpenCode config found', opencodeEvidence)
    mark(out, 'opencodego', 'OpenCode config found', opencodeEvidence)
  }

  const copilotEvidence = firstExisting([
    path.join(home, '.config', 'github-copilot'),
    path.join(home, 'Library', 'Application Support', 'GitHub Copilot'),
  ], fsImpl)
  if (copilotEvidence) mark(out, 'copilot', 'Copilot local data found', copilotEvidence)
  else if (copilotAuth.readLocalCopilotToken({ home, env, fs: fsImpl, execFileSync: execImpl })) {
    mark(out, 'copilot', 'GitHub CLI token found', 'gh auth')
  }

  const windsurfBrowserSession = windsurf._private.importBrowserSessions({ home, fs: fsImpl })[0]
  if (windsurfBrowserSession) mark(out, 'windsurf', 'Windsurf browser session found', windsurfBrowserSession.sourceLabel)

  markFile(out, 'devin', 'Devin CLI credentials found', [
    path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'devin', 'credentials.toml'),
  ], fsImpl)
  markFile(out, 'devin', 'Devin app login found', [
    path.join(home, 'Library', 'Application Support', 'Devin', 'User', 'globalStorage', 'state.vscdb'),
  ], fsImpl)

  markFile(out, 'kimi', 'Kimi credentials found', [
    path.join(home, '.kimi', 'credentials', 'kimi-code.json'),
  ], fsImpl)
  markFile(out, 'kilo', 'Kilo auth found', [
    path.join(home, '.local', 'share', 'kilo', 'auth.json'),
  ], fsImpl)
  markFile(out, 'codebuff', 'Codebuff credentials found', [
    path.join(home, '.config', 'manicode', 'credentials.json'),
  ], fsImpl)
  markFile(out, 'windsurf', 'Windsurf usage cache found', [
    path.join(home, 'Library', 'Application Support', 'Windsurf', 'User', 'globalStorage', 'state.vscdb'),
  ], fsImpl)
  markFile(out, 'jetbrains', 'JetBrains AI quota found', [
    path.join(home, 'Library', 'Application Support', 'JetBrains'),
    path.join(home, 'Library', 'Application Support', 'Google', 'AndroidStudio'),
  ], fsImpl)
  markFile(out, 'vertexai', 'Vertex AI credentials found', [
    clean(env.GOOGLE_APPLICATION_CREDENTIALS),
    path.join(home, '.config', 'gcloud', 'application_default_credentials.json'),
  ].filter(Boolean), fsImpl)
  markFile(out, 'bedrock', 'AWS credentials found', [
    path.join(home, '.aws', 'credentials'),
    path.join(home, '.aws', 'config'),
  ], fsImpl)

  for (const [id, names] of Object.entries(ENV_KEYS)) markEnv(out, id, names, env)

  for (const [id, bins] of Object.entries(CLI_BINS)) {
    if (out[id]) continue
    const bin = bins.find((candidate) => executableExists(candidate, execImpl))
    if (bin) mark(out, id, `${displayName(id)} CLI found`, bin, 'installed')
  }

  return out
}

function displayName(id) {
  return getProviderCapability(id)?.name || id.charAt(0).toUpperCase() + id.slice(1)
}

function applyDetectionsToConfig(config, detections) {
  const providers = { ...(config.providers || {}) }
  const optOuts = new Set(config.providerOptOuts || [])
  for (const [id, detection] of Object.entries(detections || {})) {
    const capability = getProviderCapability(id)
    if (!detection?.detected || !providers[id] || optOuts.has(id)) continue
    if (detection.evidenceType === 'installed' || capability?.status !== 'supported') continue
    providers[id] = { ...providers[id], enabled: true }
  }
  return { ...config, providers }
}

module.exports = { detectLocalProviders, applyDetectionsToConfig, _private: { executableExists, firstExisting, firstEnv } }
