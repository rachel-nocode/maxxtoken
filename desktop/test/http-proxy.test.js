const assert = require('node:assert/strict')
const http = require('node:http')
const test = require('node:test')

const network = require('../lib/http')

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

function close(server) {
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
  return new Promise((resolve) => server.close(resolve))
}

test.afterEach(() => network.configureProxy({ enabled: false }))

test('proxy handles remote redirects and keeps credentials out of public state', async () => {
  const requests = []
  const proxy = http.createServer((req, res) => {
    requests.push({ url: req.url, auth: req.headers['proxy-authorization'] })
    if (req.url.endsWith('/start')) {
      res.writeHead(302, { Location: 'http://provider.invalid/final' })
      res.end()
      return
    }
    res.end('proxied')
  })
  const port = await listen(proxy)
  network.configureProxy(
    { enabled: true, url: `http://127.0.0.1:${port}`, bypassLoopback: true },
    { username: 'fixture-user', password: 'fixture-password' },
  )

  const response = await network.fetchWithTimeout('http://provider.invalid/start', {}, 1000)
  assert.equal(await response.text(), 'proxied')
  assert.equal(requests.length, 2)
  assert.ok(requests.every((request) => request.auth === `Basic ${Buffer.from('fixture-user:fixture-password').toString('base64')}`))
  assert.deepEqual(network.getProxyState(), {
    enabled: true,
    url: `http://127.0.0.1:${port}`,
    bypassLoopback: true,
    hasCredentials: true,
  })
  assert.doesNotMatch(JSON.stringify(network.getProxyState()), /fixture-(user|password)/)
  network.configureProxy({ enabled: false })
  await close(proxy)
})

test('loopback requests always bypass the proxy', async () => {
  let proxyRequests = 0
  const proxy = http.createServer((_req, res) => {
    proxyRequests += 1
    res.end('wrong')
  })
  const target = http.createServer((_req, res) => res.end('direct'))
  const proxyPort = await listen(proxy)
  const targetPort = await listen(target)
  network.configureProxy({ enabled: true, url: `socks5://127.0.0.1:${proxyPort}`, bypassLoopback: false })

  const response = await network.fetchWithTimeout(`http://127.0.0.1:${targetPort}/health`, {}, 1000)
  assert.equal(await response.text(), 'direct')
  assert.equal(proxyRequests, 0)
  assert.equal(network.getProxyState().bypassLoopback, true)
  await close(target)
  await close(proxy)
})

test('a proxied redirect to loopback switches to a direct connection', async (t) => {
  let proxyRequests = 0
  let targetRequests = 0
  const target = http.createServer((_req, res) => {
    targetRequests += 1
    res.end('loopback target')
  })
  const targetPort = await listen(target)
  const proxy = http.createServer((_req, res) => {
    proxyRequests += 1
    res.writeHead(302, { Location: `http://127.0.0.1:${targetPort}/final` })
    res.end()
  })
  const proxyPort = await listen(proxy)
  t.after(async () => {
    network.configureProxy({ enabled: false })
    await close(proxy)
    await close(target)
  })
  network.configureProxy({ enabled: true, url: `http://127.0.0.1:${proxyPort}` })

  const response = await network.fetchWithTimeout('http://provider.invalid/start', {}, 1000)
  assert.equal(await response.text(), 'loopback target')
  assert.equal(proxyRequests, 1)
  assert.equal(targetRequests, 1)
})

test('proxied requests abort on timeout and redact configured credentials', async () => {
  const sockets = new Set()
  const proxy = http.createServer(() => {})
  proxy.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  const port = await listen(proxy)
  network.configureProxy(
    { enabled: true, url: `http://127.0.0.1:${port}` },
    { username: 'fixture-user', password: 'fixture-password' },
  )

  await assert.rejects(
    network.fetchWithTimeout('http://provider.invalid/slow', {}, 30),
    (error) => !/fixture-(user|password)/.test(error.message),
  )
  network.configureProxy({ enabled: false })
  for (const socket of sockets) socket.destroy()
  await close(proxy)
})

test('proxy URLs reject inline auth and unsupported protocols', () => {
  assert.throws(() => network.normalizedProxyUrl('http://fixture-user:fixture-password@proxy.invalid'), /credentials separately/)
  assert.throws(() => network.normalizedProxyUrl('ftp://proxy.invalid'), /http, https, or socks5/)
})

test('timeout remains active while the response body is streaming', async (t) => {
  const sockets = new Set()
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.flushHeaders()
    setTimeout(() => res.end('too late'), 200)
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  const port = await listen(server)
  t.after(async () => {
    for (const socket of sockets) socket.destroy()
    await close(server)
  })
  const response = await network.fetchWithTimeout(`http://127.0.0.1:${port}/slow-body`, {}, 30)
  await assert.rejects(response.text(), (error) => error.name === 'AbortError')
})

test('caller abort signals cancel requests before the helper timeout', async () => {
  const sockets = new Set()
  const server = http.createServer(() => {})
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  const port = await listen(server)
  const caller = new AbortController()
  const pending = network.fetchWithTimeout(`http://127.0.0.1:${port}/wait`, { signal: caller.signal }, 5000)
  setTimeout(() => caller.abort(), 20)
  await assert.rejects(pending, (error) => error.name === 'AbortError')
  for (const socket of sockets) socket.destroy()
  await close(server)
})
