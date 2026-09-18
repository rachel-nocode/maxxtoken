const fs = require('fs')
const os = require('os')
const path = require('path')

function geminiDir(options = {}) {
  if (options.geminiDir) return path.resolve(String(options.geminiDir))
  const env = options.env || process.env
  if (env.GEMINI_CLI_HOME) {
    const configured = path.resolve(String(env.GEMINI_CLI_HOME))
    const documented = path.join(configured, '.gemini')
    const candidates = [configured, documented]
    return candidates.find((candidate) => [
      'oauth_creds.json',
      'history',
      'tmp',
    ].some((entry) => exists(path.join(candidate, entry), options.fs || fs))) || configured
  }
  return path.join(options.home || os.homedir(), '.gemini')
}

function exists(file, fsImpl) {
  try {
    return fsImpl.existsSync(file)
  } catch {
    return false
  }
}

function sessionFiles(root, fsImpl) {
  const files = []
  let projects
  try {
    projects = fsImpl.readdirSync(path.join(root, 'tmp'), { withFileTypes: true })
  } catch {
    return files
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue
    const chats = path.join(root, 'tmp', project.name, 'chats')
    let entries
    try {
      entries = fsImpl.readdirSync(chats, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile() || !/^session-.+\.jsonl?$/i.test(entry.name)) continue
      files.push(path.join(chats, entry.name))
    }
  }
  return files
}

// Gemini CLI keeps no token ledger locally, so activity is inferred from
// top-level saved chat transcript mtimes within the billing cycle.
function read(cycle, options = {}) {
  const fsImpl = options.fs || fs
  const env = options.env || process.env
  const root = geminiDir(options)
  const transcripts = sessionFiles(root, fsImpl)
  const authenticated = exists(path.join(root, 'oauth_creds.json'), fsImpl) || Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY)
  if (!authenticated && !transcripts.length) return { connected: false }

  const activeDays = new Set()
  let lastActive = 0
  let sessions = 0

  for (const file of transcripts) {
    let modified
    try {
      modified = fsImpl.statSync(file).mtimeMs
    } catch {
      continue
    }
    if (!Number.isFinite(modified) || modified < cycle.startMs || modified >= cycle.endMs) continue
    activeDays.add(new Date(modified).toDateString())
    if (modified > lastActive) lastActive = modified
    sessions++
  }

  return {
    connected: true,
    connectionSource: authenticated ? 'auth' : 'local-history',
    sessions,
    activeDays: activeDays.size,
    lastActive: lastActive || null,
  }
}

module.exports = { read, _private: { geminiDir, sessionFiles } }
