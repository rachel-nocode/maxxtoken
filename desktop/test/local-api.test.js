const assert = require('node:assert/strict')
const test = require('node:test')
const http = require('node:http')

const { startLocalApi, stopLocalApi, isLoopback, isAllowedHost, findProvider, publicSnapshot, publicProvider } = require('../lib/local-api')

const SNAPSHOT = {
  generatedAt: 1700000000000,
  totals: { spent: 42 },
  providers: [
    // Include PII-bearing fields that MUST NOT leak over the wire.
    { id: 'claude', name: 'Claude', spentValue: 10, accountEmail: 'secret@example.com', extra: [{ label: 'Account', value: 'secret@example.com' }], links: { dashboard: 'x' } },
    { id: 'codex', name: 'ChatGPT', spentValue: 5 },
  ],
}

const PORT = 7912

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path, method: 'GET', headers }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }))
    })
    req.on('error', reject)
    req.end()
  })
}

function request(method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path, method }, (res) => {
      res.on('data', () => {})
      res.on('end', () => resolve({ status: res.statusCode, allow: res.headers.allow }))
    })
    req.on('error', reject)
    req.end()
  })
}

test('isLoopback accepts loopback addrs, rejects remote', () => {
  assert.equal(isLoopback('127.0.0.1'), true)
  assert.equal(isLoopback('::1'), true)
  assert.equal(isLoopback('::ffff:127.0.0.1'), true)
  assert.equal(isLoopback('192.168.1.5'), false)
  assert.equal(isLoopback(undefined), false)
})

test('isAllowedHost only accepts loopback literals (or empty)', () => {
  assert.equal(isAllowedHost('127.0.0.1:7878', 7878), true)
  assert.equal(isAllowedHost('localhost:7878', 7878), true)
  assert.equal(isAllowedHost('[::1]:7878', 7878), true)
  assert.equal(isAllowedHost('', 7878), true) // non-browser client, no Host
  assert.equal(isAllowedHost('evil.attacker.com', 7878), false) // DNS rebinding
  assert.equal(isAllowedHost('127.0.0.1:9999', 7878), false) // wrong port
})

test('publicProvider strips PII and keeps usage numbers', () => {
  const pub = publicProvider(SNAPSHOT.providers[0])
  assert.equal(pub.id, 'claude')
  assert.equal(pub.spentValue, 10)
  assert.equal('accountEmail' in pub, false)
  assert.equal('extra' in pub, false)
  assert.equal('links' in pub, false)
})

test('publicSnapshot sanitizes every provider', () => {
  const pub = publicSnapshot(SNAPSHOT)
  assert.equal(pub.totals.spent, 42)
  assert.ok(pub.providers.every((p) => !('extra' in p) && !('accountEmail' in p)))
})

test('findProvider resolves canonical aliases', () => {
  assert.equal(findProvider(SNAPSHOT, 'claude').name, 'Claude')
  assert.equal(findProvider(SNAPSHOT, 'nope'), null)
})

test('HTTP API serves sanitized snapshot read-only over loopback', async () => {
  startLocalApi({
    port: PORT,
    getSnapshot: () => SNAPSHOT,
    requestRefresh: () => {},
    logger: { info() {}, error() {} },
  })
  await new Promise((r) => setTimeout(r, 100))

  const usage = await get('/v1/usage')
  assert.equal(usage.status, 200)
  assert.equal(JSON.parse(usage.body).totals.spent, 42)

  // Security: no CORS header, and no PII in the body.
  assert.equal(usage.headers['access-control-allow-origin'], undefined)
  assert.doesNotMatch(usage.body, /secret@example\.com/)

  const one = await get('/v1/usage/claude')
  assert.equal(one.status, 200)
  const provider = JSON.parse(one.body).provider
  assert.equal(provider.name, 'Claude')
  assert.equal(provider.accountEmail, undefined)

  const missing = await get('/v1/usage/ollama')
  assert.equal(missing.status, 404)

  const health = await get('/v1/health')
  assert.equal(health.status, 200)
  assert.equal(JSON.parse(health.body).ok, true)

  const notFound = await get('/v1/bogus')
  assert.equal(notFound.status, 404)

  const post = await request('POST', '/v1/usage')
  assert.equal(post.status, 405)
  assert.ok(post.allow.includes('GET'))

  stopLocalApi()
})

test('HTTP API rejects a rebound Host header', async () => {
  startLocalApi({
    port: PORT,
    getSnapshot: () => SNAPSHOT,
    requestRefresh: () => {},
    logger: { info() {}, error() {} },
  })
  await new Promise((r) => setTimeout(r, 100))

  const rebind = await get('/v1/usage', { Host: 'evil.attacker.com' })
  assert.equal(rebind.status, 403)
  assert.doesNotMatch(rebind.body, /secret@example\.com/)

  stopLocalApi()
})

test('HTTP API returns 503 + triggers refresh when snapshot missing', async () => {
  let refreshed = 0
  startLocalApi({
    port: PORT,
    getSnapshot: () => null,
    requestRefresh: () => { refreshed++ },
    logger: { info() {}, error() {} },
  })
  await new Promise((r) => setTimeout(r, 100))

  const usage = await get('/v1/usage')
  assert.equal(usage.status, 503)
  assert.equal(refreshed, 1)

  stopLocalApi()
})
