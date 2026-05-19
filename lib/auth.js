const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

// Reads the user's local AI-CLI OAuth tokens so MaxxToken can call the
// official usage endpoints. Tokens stay on this machine — they are only
// sent to the provider's own API and are never logged.

const CLAUDE_KEYCHAIN = 'Claude Code-credentials'
const CLAUDE_CRED_FILE = path.join(os.homedir(), '.claude', '.credentials.json')

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

// Returns { claudeAiOauth: {...} } or null. Never throws.
function readClaudeCredentials() {
  // 1. plaintext file
  try {
    if (fs.existsSync(CLAUDE_CRED_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CLAUDE_CRED_FILE, 'utf8'))
      if (parsed && parsed.claudeAiOauth) return { data: parsed, source: 'file' }
    }
  } catch {
    /* try keychain */
  }
  // 2. macOS keychain (may prompt the user to Allow on first access)
  try {
    const raw = execFileSync(
      'security',
      ['find-generic-password', '-w', '-s', CLAUDE_KEYCHAIN],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const parsed = JSON.parse(hexMaybeDecode(raw))
    if (parsed && parsed.claudeAiOauth) return { data: parsed, source: 'keychain' }
  } catch {
    /* not found */
  }
  return null
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
      fs.writeFileSync(CLAUDE_CRED_FILE, text)
    } catch {
      /* best effort */
    }
    return
  }
  try {
    execFileSync(
      'security',
      ['add-generic-password', '-U', '-a', keychainAccount(), '-s', CLAUDE_KEYCHAIN, '-w', text],
      { stdio: 'ignore' },
    )
  } catch {
    /* best effort — in-memory token still valid for this run */
  }
}

module.exports = { readClaudeCredentials, persistClaudeCredentials }
