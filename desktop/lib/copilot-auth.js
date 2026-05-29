const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { fetchWithTimeout } = require('./http')

const CLIENT_ID = 'Iv1.b507a08c87ecfe98'
const SCOPE = 'read:user'
const DEFAULT_HOST = 'github.com'

function normalizeHost(raw) {
  let host = String(raw || '').trim()
  if (!host) return DEFAULT_HOST
  const value = host.includes('://') ? host : `https://${host}`
  try {
    const url = new URL(value)
    host = url.host
  } catch {
    host = host.replace(/^https?:\/\//, '').split('/')[0]
  }
  host = host.replace(/^\.+|\.+$/g, '').toLowerCase()
  return host || DEFAULT_HOST
}

function formBody(params) {
  return new URLSearchParams(params).toString()
}

function requestURL(host, path) {
  return `https://${normalizeHost(host)}${path}`
}

async function postForm(url, body, timeoutMs = 15000) {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    },
    timeoutMs,
  )
  if (!res.ok) throw new Error(`GitHub login failed (${res.status})`)
  return res.json()
}

async function requestDeviceCode(host) {
  const body = formBody({
    client_id: CLIENT_ID,
    scope: SCOPE,
  })
  const json = await postForm(requestURL(host, '/login/device/code'), body)
  if (!json.device_code || !json.user_code || !json.verification_uri) {
    throw new Error('GitHub did not return a device code')
  }
  return {
    id: crypto.randomUUID(),
    host: normalizeHost(host),
    deviceCode: json.device_code,
    userCode: json.user_code,
    verificationUri: json.verification_uri,
    verificationUriComplete: json.verification_uri_complete || null,
    expiresIn: Number(json.expires_in) || 900,
    interval: Number(json.interval) || 5,
    createdAt: Date.now(),
  }
}

async function pollForToken(session) {
  const expiresAt = session.createdAt + session.expiresIn * 1000
  let interval = Math.max(1, Number(session.interval) || 5)
  const body = formBody({
    client_id: CLIENT_ID,
    device_code: session.deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  })

  while (Date.now() < expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, interval * 1000))
    const json = await postForm(requestURL(session.host, '/login/oauth/access_token'), body)
    if (json.access_token) return json.access_token
    if (json.error === 'authorization_pending') continue
    if (json.error === 'slow_down') {
      interval += 5
      continue
    }
    if (json.error === 'expired_token') throw new Error('GitHub login code expired')
    throw new Error(json.error_description || json.error || 'GitHub login failed')
  }

  throw new Error('GitHub login timed out')
}

// --- Zero-paste token discovery -------------------------------------------
// The GitHub Copilot editor plugins (and `gh`) already store an OAuth token on
// disk. Reading it lets MaxxToken track Copilot usage with no paste/login.
// Tokens stay local — only sent to GitHub's own API by the copilot adapter.

function copilotConfigDir(home = os.homedir(), env = process.env) {
  const base = env.XDG_CONFIG_HOME ? env.XDG_CONFIG_HOME : path.join(home, '.config')
  return path.join(base, 'github-copilot')
}

function oauthTokenFromMap(obj, preferGithub) {
  if (!obj || typeof obj !== 'object') return null
  if (preferGithub) {
    for (const [key, val] of Object.entries(obj)) {
      if (val && typeof val === 'object' && val.oauth_token && /(^|:)github\.com(:|$)/i.test(key)) {
        return String(val.oauth_token).trim()
      }
    }
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object' && val.oauth_token) return String(val.oauth_token).trim()
  }
  return null
}

function readJsonFile(file, fsImpl) {
  try {
    return JSON.parse(fsImpl.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

// apps.json keys look like "github.com:Iv1.xxxx"; hosts.json keys are bare hosts.
function tokenFromCopilotFiles(dir, fsImpl = fs) {
  const apps = readJsonFile(path.join(dir, 'apps.json'), fsImpl)
  const fromApps = oauthTokenFromMap(apps, true)
  if (fromApps) return fromApps
  const hosts = readJsonFile(path.join(dir, 'hosts.json'), fsImpl)
  if (hosts) {
    const direct = hosts[DEFAULT_HOST] || hosts['api.github.com']
    if (direct && direct.oauth_token) return String(direct.oauth_token).trim()
    const any = oauthTokenFromMap(hosts, true)
    if (any) return any
  }
  return null
}

// Falls back to the GitHub CLI. Run through a login shell so the user's PATH
// (and gh's keychain/config resolution) is honored inside the Electron process.
function tokenFromGhCli(execImpl = execFileSync) {
  try {
    const out = execImpl('/bin/zsh', ['-lc', 'gh auth token --hostname github.com'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 4000,
    })
    const token = String(out || '').trim()
    return /^g[hipou]_[A-Za-z0-9_]+$/.test(token) || token.length > 20 ? token || null : null
  } catch {
    return null
  }
}

function readLocalCopilotToken(options = {}) {
  const home = options.home || os.homedir()
  const env = options.env || process.env
  const fsImpl = options.fs || fs
  const dir = options.configDir || copilotConfigDir(home, env)
  const fromFiles = tokenFromCopilotFiles(dir, fsImpl)
  if (fromFiles) return fromFiles
  if (options.skipGhCli) return null
  return tokenFromGhCli(options.execFileSync || execFileSync)
}

module.exports = {
  requestDeviceCode,
  pollForToken,
  readLocalCopilotToken,
  _private: {
    normalizeHost,
    formBody,
    requestURL,
    copilotConfigDir,
    tokenFromCopilotFiles,
    tokenFromGhCli,
    oauthTokenFromMap,
  },
}
