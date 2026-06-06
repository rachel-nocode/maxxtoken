const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const windsurf = require('./adapters/windsurf')
const cursor = require('./adapters/cursor')
const copilotAuth = require('./copilot-auth')

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

function mark(out, id, reason, evidence) {
  if (out[id]) return
  out[id] = { detected: true, reason, evidence }
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

const CLI_BINS = {
  codex: ['codex'],
  claude: ['claude'],
  cursor: ['cursor'],
  copilot: ['copilot'],
  windsurf: ['windsurf'],
  kiro: ['kiro-cli', 'kiro'],
  opencode: ['opencode'],
  opencodego: ['opencodego'],
  alibaba: ['alibaba-coding-plan'],
  alibabatokenplan: ['alibaba-token-plan', 'alibaba-token', 'bailian-token-plan'],
  augment: ['auggie'],
  warp: ['warp'],
  elevenlabs: ['elevenlabs'],
  kilo: ['kilo'],
  kimi: ['kimi'],
  moonshot: ['moonshot'],
  doubao: ['doubao'],
  gemini: ['gemini'],
  grok: ['grok'],
  amp: ['amp'],
  codebuff: ['codebuff'],
  commandcode: ['commandcode'],
  crof: ['crof'],
  venice: ['venice'],
  stepfun: ['stepfun'],
  llmproxy: ['llmproxy'],
  ollama: ['ollama'],
  abacus: ['abacusai'],
  factory: ['factory'],
  antigravity: ['antigravity'],
  minimax: ['minimax'],
  manus: ['manus'],
  vertexai: ['vertexai', 'gcloud'],
  synthetic: ['synthetic'],
  mimo: ['mimo'],
  bedrock: ['aws'],
  zai: ['zai'],
  t3chat: ['t3chat'],
}

const ENV_KEYS = {
  openai: ['OPENAI_ADMIN_KEY', 'OPENAI_API_KEY'],
  azureopenai: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
  alibaba: ['ALIBABA_CODING_PLAN_API_KEY', 'ALIBABA_QWEN_API_KEY', 'DASHSCOPE_API_KEY', 'ALIBABA_CODING_PLAN_COOKIE'],
  alibabatokenplan: ['ALIBABA_TOKEN_PLAN_COOKIE', 'ALIBABA_TOKEN_PLAN_HOST', 'ALIBABA_TOKEN_PLAN_QUOTA_URL'],
  warp: ['WARP_API_KEY', 'WARP_TOKEN'],
  elevenlabs: ['ELEVENLABS_API_KEY', 'XI_API_KEY'],
  kimi: ['KIMI_API_KEY', 'KIMI_KEY'],
  kimik2: ['KIMI_K2_API_KEY', 'KIMI_API_KEY', 'KIMI_KEY'],
  doubao: ['DOUBAO_API_KEY', 'ARK_API_KEY'],
  grok: ['GROK_COOKIE', 'GROK_SESSION_COOKIE', 'GROK_ACCESS_TOKEN', 'GROK_BEARER_TOKEN', 'GROK_TOKEN'],
  groq: ['GROQ_API_KEY'],
  amp: ['AMP_COOKIE', 'AMP_SESSION_COOKIE'],
  openrouter: ['OPENROUTER_API_KEY'],
  perplexity: ['PERPLEXITY_API_KEY', 'PPLX_API_KEY'],
  mistral: ['MISTRAL_COOKIE', 'MISTRAL_SESSION_COOKIE'],
  deepseek: ['DEEPSEEK_API_KEY'],
  deepgram: ['DEEPGRAM_API_KEY'],
  codebuff: ['CODEBUFF_API_KEY'],
  commandcode: ['COMMAND_CODE_COOKIE', 'COMMANDCODE_COOKIE'],
  crof: ['CROF_API_KEY'],
  venice: ['VENICE_API_KEY', 'VENICE_KEY'],
  stepfun: ['STEPFUN_API_KEY', 'STEPFUN_TOKEN'],
  llmproxy: ['LLM_PROXY_API_KEY', 'LLM_PROXY_BASE_URL'],
  ollama: ['OLLAMA_API_KEY', 'OLLAMA_KEY', 'OLLAMA_COOKIE', 'OLLAMA_SESSION_COOKIE'],
  abacus: ['ABACUS_COOKIE', 'ABACUS_SESSION_COOKIE'],
  minimax: ['MINIMAX_CODING_API_KEY', 'MINIMAX_API_KEY', 'MINIMAX_COOKIE', 'MINIMAX_AUTHORIZATION_TOKEN'],
  manus: ['MANUS_SESSION_TOKEN', 'MANUS_SESSION_ID', 'MANUS_COOKIE'],
  vertexai: ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT'],
  synthetic: ['SYNTHETIC_API_KEY', 'SYNTHETIC_COOKIE'],
  mimo: ['MIMO_COOKIE', 'MIMO_COOKIE_HEADER'],
  bedrock: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_PROFILE'],
  zai: ['Z_AI_API_KEY', 'ZAI_API_KEY'],
  t3chat: ['T3CHAT_COOKIE', 'T3_CHAT_COOKIE', 'T3CHAT_CURL', 'T3_CHAT_CURL'],
  windsurf: ['WINDSURF_SESSION', 'WINDSURF_DEVIN_SESSION'],
}

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
  else if (executableExists('codex', execImpl)) mark(out, 'codex', 'Codex CLI found', 'codex')

  const claudeHome = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude')
  const claudeEvidence = firstExisting([
    path.join(claudeHome, '.credentials.json'),
    path.join(claudeHome, 'projects'),
    path.join(home, '.config', 'claude', 'projects'),
  ], fsImpl)
  if (claudeEvidence) mark(out, 'claude', 'Claude local data found', claudeEvidence)
  else if (executableExists('claude', execImpl)) mark(out, 'claude', 'Claude CLI found', 'claude')

  const geminiEvidence = firstExisting([
    path.join(home, '.gemini', 'oauth_creds.json'),
    path.join(home, '.gemini', 'history'),
    path.join(home, '.config', 'gemini'),
  ], fsImpl)
  if (geminiEvidence) mark(out, 'gemini', 'Gemini local data found', geminiEvidence)
  else if (executableExists('gemini', execImpl)) mark(out, 'gemini', 'Gemini CLI found', 'gemini')

  const antigravityEvidence = firstExisting([
    path.join(home, '.codexbar', 'antigravity', 'oauth_creds.json'),
    path.join(home, '.config', 'antigravity'),
  ], fsImpl)
  if (antigravityEvidence) mark(out, 'antigravity', 'Antigravity auth found', antigravityEvidence)

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
    if (bin) mark(out, id, `${displayName(id)} CLI found`, bin)
  }

  return out
}

function displayName(id) {
  return {
    azureopenai: 'Azure OpenAI',
    kimik2: 'Kimi K2',
    opencodego: 'OpenCode Go',
    t3chat: 'T3 Chat',
    vertexai: 'Vertex AI',
    llmproxy: 'LLM Proxy',
  }[id] || id.charAt(0).toUpperCase() + id.slice(1)
}

function applyDetectionsToConfig(config, detections) {
  const providers = { ...(config.providers || {}) }
  for (const [id, detection] of Object.entries(detections || {})) {
    if (!detection?.detected || !providers[id]) continue
    providers[id] = { ...providers[id], enabled: true }
  }
  return { ...config, providers }
}

module.exports = { detectLocalProviders, applyDetectionsToConfig, _private: { executableExists, firstExisting, firstEnv } }
