const assert = require('node:assert/strict')
const test = require('node:test')
const http = require('node:http')

const { startLocalApi, stopLocalApi, isLoopback, findProvider } = require('../lib/local-api')

const SNAPSHOT = {
  generatedAt: 1700000000000,
  totals: { spent: 42 },
  providers: [
    { id: 'claude', name: 'Claude', spentValue: 10 },
    { id: 'codex', name: 'ChatGPT', spentValue: 5 },
  ],
}

const PORT = 7912

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode, body }))
    }).on('error', reject)
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

test('findProvider resolves canonical aliases', () => {
  assert.equal(findProvider(SNAPSHOT, 'claude').name, 'Claude')
  // t3 -> t3chat alias; not in snapshot -> null
  assert.equal(findProvider(SNAPSHOT, 'nope'), null)
})

test('HTTP API serves snapshot read-only over loopback', async () => {
  let refreshed = 0
  startLocalApi({
    port: PORT,
    getSnapshot: () => SNAPSHOT,
    requestRefresh: () => { refreshed++ },
    logger: { info() {}, error() {} },
  })

  // give the server a tick to bind
  await new Promise((r) => setTimeout(r, 100))

  const usage = await get('/v1/usage')
  assert.equal(usage.status, 200)
  assert.equal(JSON.parse(usage.body).totals.spent, 42)

  const one = await get('/v1/usage/claude')
  assert.equal(one.status, 200)
  assert.equal(JSON.parse(one.body).provider.name, 'Claude')

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
