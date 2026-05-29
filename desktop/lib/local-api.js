// Local read-only HTTP API. Serves the existing usage snapshot over a
// loopback-only HTTP server so statuslines, scripts, and tmux can read live
// usage without IPC or the Electron renderer.
//
//   GET /v1/usage             -> full snapshot JSON
//   GET /v1/usage/:provider   -> single provider object (id is canonicalized)
//   GET /v1/health            -> { ok, hasSnapshot, generatedAt }
//
// Read-only by design: only GET is allowed, the server binds to 127.0.0.1, and
// any non-loopback peer is rejected. No mutation endpoints exist.

const http = require('http')
const { canonicalProviderId } = require('./provider-ids')

const DEFAULT_PORT = 7878

let server = null

function isLoopback(address) {
  if (!address) return false
  // Strip IPv4-mapped IPv6 prefix (::ffff:127.0.0.1).
  const addr = address.replace(/^::ffff:/, '')
  return addr === '127.0.0.1' || addr === '::1' || addr === 'localhost'
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(payload)
}

function findProvider(snapshot, rawId) {
  const id = canonicalProviderId(rawId)
  const providers = (snapshot && snapshot.providers) || []
  return providers.find((p) => canonicalProviderId(p.id) === id) || null
}

function handleRequest(req, res, { getSnapshot, requestRefresh, logger }) {
  // Loopback-only: refuse any peer that is not the local machine.
  if (!isLoopback(req.socket && req.socket.remoteAddress)) {
    sendJson(res, 403, { error: 'forbidden', message: 'loopback only' })
    return
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    sendJson(res, 405, { error: 'method_not_allowed', message: 'read-only API' })
    return
  }

  let pathname
  try {
    pathname = new URL(req.url, 'http://127.0.0.1').pathname.replace(/\/+$/, '') || '/'
  } catch {
    sendJson(res, 400, { error: 'bad_request' })
    return
  }

  const snapshot = (typeof getSnapshot === 'function' && getSnapshot()) || null

  if (pathname === '/v1/health') {
    sendJson(res, 200, {
      ok: true,
      hasSnapshot: !!snapshot,
      generatedAt: snapshot ? snapshot.generatedAt : null,
    })
    return
  }

  if (pathname === '/v1/usage') {
    if (!snapshot) {
      if (typeof requestRefresh === 'function') { try { requestRefresh() } catch {} }
      sendJson(res, 503, { error: 'no_snapshot', message: 'snapshot not ready, retry shortly' })
      return
    }
    sendJson(res, 200, snapshot)
    return
  }

  const m = pathname.match(/^\/v1\/usage\/([^/]+)$/)
  if (m) {
    if (!snapshot) {
      if (typeof requestRefresh === 'function') { try { requestRefresh() } catch {} }
      sendJson(res, 503, { error: 'no_snapshot', message: 'snapshot not ready, retry shortly' })
      return
    }
    const provider = findProvider(snapshot, decodeURIComponent(m[1]))
    if (!provider) {
      sendJson(res, 404, { error: 'unknown_provider', id: decodeURIComponent(m[1]) })
      return
    }
    sendJson(res, 200, { generatedAt: snapshot.generatedAt, provider })
    return
  }

  sendJson(res, 404, { error: 'not_found', message: 'try /v1/usage' })
}

// Start the loopback HTTP server. Returns the chosen port (or null on failure).
// opts: { getSnapshot, requestRefresh, port, logger }
function startLocalApi(opts = {}) {
  const logger = opts.logger || { info() {}, error() {} }
  if (server) return server.address() ? server.address().port : null

  const port = Number(opts.port) || DEFAULT_PORT

  server = http.createServer((req, res) => {
    try {
      handleRequest(req, res, opts)
    } catch (err) {
      logger.error('local-api', 'request-failed', { error: err && err.message })
      try { sendJson(res, 500, { error: 'internal' }) } catch {}
    }
  })

  server.on('error', (err) => {
    logger.error('local-api', 'server-error', { error: err && err.message, code: err && err.code })
    if (err && err.code === 'EADDRINUSE') {
      // Another instance (or app) owns the port. Give up quietly; the API is
      // a non-critical convenience surface.
      try { server.close() } catch {}
      server = null
    }
  })

  // Bind to loopback only — never 0.0.0.0.
  server.listen(port, '127.0.0.1', () => {
    logger.info('local-api', 'listening', { port, url: `http://127.0.0.1:${port}/v1/usage` })
  })

  return port
}

function stopLocalApi() {
  if (!server) return
  try { server.close() } catch {}
  server = null
}

module.exports = { startLocalApi, stopLocalApi, DEFAULT_PORT, isLoopback, findProvider }
