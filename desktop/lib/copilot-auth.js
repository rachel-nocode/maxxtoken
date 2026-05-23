const crypto = require('crypto')
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

module.exports = {
  requestDeviceCode,
  pollForToken,
  _private: {
    normalizeHost,
    formBody,
    requestURL,
  },
}
