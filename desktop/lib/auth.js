const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

// Reads the user's local AI-CLI OAuth tokens so MaxxToken can call the
// official usage endpoints. Tokens stay on this machine — they are only
// sent to the provider's own API and are never logged.

const CLAUDE_KEYCHAIN = 'Claude Code-credentials'
const CLAUDE_CRED_FILE = path.join(os.homedir(), '.claude', '.credentials.json')

function claudeCredentialFile(options = {}) {
  if (options.authHome) return path.join(options.authHome, '.credentials.json')
  const configured = String(options.env?.CLAUDE_CONFIG_DIR ?? process.env.CLAUDE_CONFIG_DIR ?? '').trim()
  if (configured && !configured.includes(',')) return path.join(path.resolve(configured), '.credentials.json')
  return CLAUDE_CRED_FILE
}

function claudeKeychainServices(options = {}) {
  if (!options.authHome) return [CLAUDE_KEYCHAIN]
  const suffix = crypto.createHash('sha256').update(path.resolve(options.authHome)).digest('hex').slice(0, 8)
  return [`${CLAUDE_KEYCHAIN}-${suffix}`, ...(options.isDefault ? [CLAUDE_KEYCHAIN] : [])]
}

function hexMaybeDecode(text) {
  const t = String(text).trim()
  if (/^[0-9a-fA-F]+$/.test(t) && t.length % 2 === 0 && t.length > 20) {
    try {
      return Buffer.from(t, 'hex').toString('utf8')
    } catch {
      /* fall through */
    }
  }
  return t
}

function oauthExpiresAt(candidate) {
  const at = Number(candidate?.data?.claudeAiOauth?.expiresAt)
  return Number.isFinite(at) ? at : 0
}

// Returns { claudeAiOauth: {...} } or null. Never throws.
// Newer Claude Code versions write only to the keychain, so a stale
// ~/.claude/.credentials.json can shadow a fresh login — when the file token
// is expired, also read the keychain and use whichever expires later.
function readClaudeCredentialCandidates(options = {}) {
  const candidates = []
  let fileCreds = null
  const credentialFile = claudeCredentialFile(options)
  try {
    if (fs.existsSync(credentialFile)) {
      const parsed = JSON.parse(fs.readFileSync(credentialFile, 'utf8'))
      if (parsed && parsed.claudeAiOauth) fileCreds = { data: parsed, source: 'file', file: credentialFile }
    }
  } catch {
    /* try keychain */
  }
  // macOS keychain (may prompt the user to Allow on first access)
  for (const service of claudeKeychainServices(options)) {
    try {
      const raw = execFileSync(
        'security',
        ['find-generic-password', '-w', '-s', service],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      )
      const parsed = JSON.parse(hexMaybeDecode(raw))
      if (parsed && parsed.claudeAiOauth) {
        candidates.push({ data: parsed, source: 'keychain', service })
      }
    } catch {
      /* not found */
    }
  }
  if (fileCreds) candidates.push(fileCreds)
  return candidates
}

function readClaudeCredentials(options = {}) {
  const candidates = readClaudeCredentialCandidates(options)
  const valid = candidates.find((candidate) => oauthExpiresAt(candidate) > Date.now())
  return valid || candidates[0] || null
}

function keychainAccount() {
  try {
    const out = execFileSync(
      'security',
      ['find-generic-password', '-s', CLAUDE_KEYCHAIN],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const m = out.match(/"acct"<blob>="([^"]*)"/)
    return m ? m[1] : os.userInfo().username
  } catch {
    return os.userInfo().username
  }
}

function persistClaudeCredentials(creds) {
  const text = JSON.stringify(creds.data)
  if (creds.source === 'file') {
    try {
      fs.writeFileSync(creds.file || CLAUDE_CRED_FILE, text)
    } catch {
      /* best effort */
    }
    return
  }
  try {
    execFileSync(
      'security',
      ['add-generic-password', '-U', '-a', keychainAccount(), '-s', creds.service || CLAUDE_KEYCHAIN, '-w', text],
      { stdio: 'ignore' },
    )
  } catch {
    /* best effort — in-memory token still valid for this run */
  }
}

module.exports = {
  readClaudeCredentials,
  readClaudeCredentialCandidates,
  persistClaudeCredentials,
  _private: { claudeCredentialFile, claudeKeychainServices },
}
