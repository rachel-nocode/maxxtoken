const assert = require('node:assert/strict')
const test = require('node:test')

const antigravity = require('../lib/adapters/antigravity')

const { _private } = antigravity

function keyringValue(value) {
  return `go-keyring-base64:${Buffer.from(JSON.stringify(value)).toString('base64')}`
}

function jsonResponse(value) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(value),
  }
}

test('Antigravity process discovery extracts the extension port and CSRF token', () => {
  const processes = _private.parseLanguageServerProcesses([
    '  123 /Applications/Antigravity.app/extensions/antigravity/bin/language_server_macos_arm --csrf_token app-csrf --extension_server_port=43123 --extension_server_csrf_token extension-csrf --app_data_dir antigravity',
    '  456 /Applications/Windsurf.app/bin/language_server_macos_arm --csrf_token wrong --extension_server_port 40000 --app_data_dir windsurf',
  ].join('\n'))

  assert.deepEqual(processes, [{ pid: 123, port: 43123, csrf: 'extension-csrf' }])
})

test('Antigravity OAuth client material is derived from the installed binary', () => {
  const clientID = `123456-${'a'.repeat(32)}.apps.googleusercontent.com`
  const clientSecret = `GOCSPX-${'b'.repeat(28)}`
  const clients = _private.extractBundledOAuthClients(Buffer.from(`binary\0${clientID}\0${clientSecret}\0`, 'latin1'))

  assert.deepEqual(clients, [{ clientID, clientSecret }])
})

test('Antigravity token refresh tries installed-app OAuth clients without persisting them', async () => {
  const calls = []
  const refreshed = await _private.refreshAccessToken({
    accessToken: 'fake-expired-token',
    refreshToken: 'fake-refresh-token',
    oauthClients: [
      { clientID: 'wrong-client', clientSecret: 'wrong-secret' },
      { clientID: 'right-client', clientSecret: 'right-secret' },
    ],
  }, {
    fetchWithTimeout: async (_url, init) => {
      calls.push(init.body)
      return calls.length === 1
        ? { ok: false, status: 400, text: async () => '{}' }
        : { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'fake-fresh-token', expires_in: 3600 }) }
    },
  })

  assert.equal(refreshed.accessToken, 'fake-fresh-token')
  assert.equal(calls.length, 2)
})

test('Antigravity Keychain parser unwraps the agy go-keyring token envelope', () => {
  const credentials = _private.parseKeychainCredentials(keyringValue({
    token: {
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      expiry: '2030-01-02T03:04:05Z',
    },
    auth_method: 'consumer',
  }))

  assert.equal(credentials.accessToken, 'fake-access-token')
  assert.equal(credentials.refreshToken, 'fake-refresh-token')
  assert.equal(credentials.expiryDate, Date.parse('2030-01-02T03:04:05Z'))
})

test('Antigravity Keychain lookup pins the gemini service and antigravity account', () => {
  let invocation = null
  const credentials = _private.loadKeychainCredentials({
    platform: 'darwin',
    execFileSync: (bin, args, options) => {
      invocation = { bin, args, options }
      return keyringValue({ token: { access_token: 'fake-access-token' } })
    },
  })

  assert.equal(credentials.accessToken, 'fake-access-token')
  assert.equal(invocation.bin, '/usr/bin/security')
  assert.deepEqual(invocation.args, ['find-generic-password', '-s', 'gemini', '-a', 'antigravity', '-w'])
  assert.deepEqual(invocation.options.stdio, ['ignore', 'pipe', 'ignore'])
})

test('Antigravity quota summary maps shared session and weekly pools', () => {
  const windows = _private.parseQuotaSummary({
    response: {
      groups: [{
        buckets: [
          { bucketId: 'gemini-5h', remainingFraction: 0.72, resetTime: '2030-01-01T05:00:00Z' },
          { bucketId: 'gemini-weekly', remainingFraction: 0.5, resetTime: '2030-01-07T00:00:00Z' },
          { bucketId: '3p-5h', remainingFraction: 0.9, resetTime: '2030-01-01T04:00:00Z' },
          { bucketId: '3p-weekly', remainingFraction: 0.8, resetTime: '2030-01-07T00:00:00Z' },
          { bucketId: 'future-pool', remainingFraction: 0.1 },
        ],
      }],
    },
  })

  assert.deepEqual(windows.map((window) => window.label), ['Session', 'Weekly', 'Claude', 'Claude Weekly'])
  assert.equal(windows[0].usedPct, 28)
  assert.equal(windows[0].periodMs, 5 * 60 * 60 * 1000)
  assert.equal(windows[1].periodMs, 7 * 24 * 60 * 60 * 1000)
})

test('Antigravity read uses the running language server before credential lookup', async () => {
  const calls = []
  const usage = await antigravity.read({
    candidates: [{ pid: 123, port: 43123, csrf: 'fake-csrf' }],
    execFileSync: () => {
      throw new Error('credential lookup should not run')
    },
    localRequest: async (url, init) => {
      calls.push({ url, init })
      if (url.endsWith('/RetrieveUserQuotaSummary')) {
        return jsonResponse({ groups: [{ buckets: [{ bucketId: 'gemini-5h', remainingFraction: 0.6 }] }] })
      }
      return jsonResponse({ userStatus: { userTier: { name: 'Google AI Pro' } } })
    },
  })

  assert.equal(usage.connected, true)
  assert.equal(usage.source, 'language-server')
  assert.equal(usage.windows[0].usedPct, 40)
  assert.equal(usage.accountPlan, 'Google AI Pro')
  assert.equal(calls[0].init.headers['x-codeium-csrf-token'], 'fake-csrf')
})

test('expired native Antigravity login directs the user back to Antigravity or agy', async () => {
  const usage = await antigravity.read({
    candidates: [],
    platform: 'darwin',
    env: {},
    savedKey: null,
    fs: { readFileSync() { throw new Error('no installed bundle in fixture') } },
    execFileSync: () => keyringValue({
      token: {
        access_token: 'fake-expired-token',
        refresh_token: 'fake-refresh-token',
        expiry: '2020-01-01T00:00:00Z',
      },
    }),
  })

  assert.equal(usage.connected, false)
  assert.match(usage.error, /open Antigravity or run agy/i)
})
