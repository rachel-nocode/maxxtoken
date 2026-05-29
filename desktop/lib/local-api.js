// Local read-only HTTP API. Serves the existing usage snapshot over a
// loopback-only HTTP server so statuslines, scripts, and tmux can read live
// usage without IPC or the Electron renderer.
//
//   GET /v1/usage             -> sanitized usage snapshot (no PII)
//   GET /v1/usage/:provider   -> single provider object (id is canonicalized)
//   GET /v1/health            -> { ok, hasSnapshot, generatedAt }
//
// Read-only and not browser-reachable by design: only GET is allowed, the
// server binds to 127.0.0.1, non-loopback peers are rejected, non-loopback Host
// headers (DNS rebinding) are rejected, and no Access-Control-Allow-Origin is
// sent. The payload is whitelisted to usage numbers — account emails and other
// PII in the raw snapshot are stripped before serving. No mutation endpoints.

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
  // No Access-Control-Allow-Origin: this endpoint must NOT be readable from a
  // web page. Consumers are local processes (curl, tmux, statusline scripts),
  // not browsers — they don't need CORS, and granting it would let any site the
  // user visits read their usage data cross-origin.
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

// Reject any request whose Host header isn't a loopback literal. The socket is
// already loopback-bound, but a malicious page can DNS-rebind its own hostname
// to 127.0.0.1; that request arrives on the loopback socket yet carries the
// attacker's Host. Browsers always send Host, so an empty Host means a non-
// browser client and is allowed.
function isAllowedHost(hostHeader, port) {
  const host = String(hostHeader || '').toLowerCase()
  if (!host) return true
  return host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`
}

// Whitelist of provider fields safe to expose. Deliberately omits PII/secret-
// adjacent fields (extra[], accountEmail, cookieName, links, etc.) — the API
// serves usage numbers, not account identity.
function publicProvider(p) {
  if (!p || typeof p !== 'object') return null
  return {
    id: p.id,
    name: p.name ?? null,
    plan: p.plan ?? null,
    connected: !!p.connected,
    activity: p.activity ?? null,
    urgent: !!p.urgent,
    lastUpdatedAt: p.lastUpdatedAt ?? null,
    capturedPct: p.capturedPct ?? null,
    remainingPct: p.remainingPct ?? null,
    totalValue: p.totalValue ?? null,
    spentValue: p.spentValue ?? null,
    leftValue: p.leftValue ?? null,
    usageLabel: p.usageLabel ?? null,
    valueUnit: p.valueUnit ?? null,
    resetAt: p.resetAt ?? null,
    resetKind: p.resetKind ?? null,
    windows: Array.isArray(p.windows)
      ? p.windows.map((w) => ({
          label: w.label ?? null,
          kind: w.kind ?? null,
          usedPct: w.usedPct ?? null,
          resetAt: w.resetAt ?? null,
          periodMs: w.periodMs ?? null,
          reservePct: w.reservePct ?? null,
        }))
      : [],
    tokenUsage: p.tokenUsage
      ? {
          input: p.tokenUsage.input ?? null,
          cached: p.tokenUsage.cached ?? null,
          output: p.tokenUsage.output ?? null,
          total: p.tokenUsage.total ?? null,
          costUSD: p.tokenUsage.costUSD ?? null,
          source: p.tokenUsage.source ?? null,
          historyDays: p.tokenUsage.historyDays ?? null,
          period: p.tokenUsage.period ?? null,
          modelBreakdowns: p.tokenUsage.modelBreakdowns || p.tokenUsage.topModels || [],
          dailyBreakdown: p.tokenUsage.dailyBreakdown || p.tokenUsage.dailyUsage || [],
        }
      : null,
    status: p.status
      ? {
          indicator: p.status.indicator ?? null,
          label: p.status.label ?? null,
          description: p.status.description ?? null,
          updatedAt: p.status.updatedAt ?? null,
          url: p.status.url ?? null,
        }
      : null,
    error: p.error || null,
  }
}

// Sanitized snapshot for the wire. totals/cycle/rating carry no PII; provider
// objects do (emails in extra[]), so each is run through publicProvider.
function publicSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  return {
    generatedAt: snapshot.generatedAt ?? null,
    cached: !!snapshot.cached,
    cycle: snapshot.cycle || null,
    totals: snapshot.totals || null,
    rating: snapshot.rating || null,
    providers: Array.isArray(snapshot.providers) ? snapshot.providers.map(publicProvider) : [],
  }
}

function findProvider(snapshot, rawId) {
  const id = canonicalProviderId(rawId)
  const providers = (snapshot && snapshot.providers) || []
  return providers.find((p) => canonicalProviderId(p.id) === id) || null
}

function handleRequest(req, res, { getSnapshot, requestRefresh, logger, port }) {
  // Loopback-only: refuse any peer that is not the local machine.
  if (!isLoopback(req.socket && req.socket.remoteAddress)) {
    sendJson(res, 403, { error: 'forbidden', message: 'loopback only' })
    return
  }

  // Anti-DNS-rebinding: the Host must be a loopback literal (or empty).
  if (!isAllowedHost(req.headers && req.headers.host, port)) {
    sendJson(res, 403, { error: 'forbidden', message: 'invalid host' })
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
    sendJson(res, 200, publicSnapshot(snapshot))
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
    sendJson(res, 200, { generatedAt: snapshot.generatedAt, provider: publicProvider(provider) })
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
      handleRequest(req, res, { ...opts, port })
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

module.exports = { startLocalApi, stopLocalApi, DEFAULT_PORT, isLoopback, isAllowedHost, findProvider, publicSnapshot, publicProvider }
