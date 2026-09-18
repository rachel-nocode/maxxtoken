const nodeFetch = require('node-fetch')
const { HttpProxyAgent } = require('http-proxy-agent')
const { HttpsProxyAgent } = require('https-proxy-agent')
const { SocksProxyAgent } = require('socks-proxy-agent')

const SUPPORTED_PROXY_PROTOCOLS = new Set(['http:', 'https:', 'socks5:'])
let proxyState = { enabled: false, url: null, username: null, password: null, bypassLoopback: true }
let proxyAgents = new Map()

function isLoopbackHostname(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host === '::1' || host.endsWith('.localhost')) return true
  const octets = host.split('.').map(Number)
  return octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) && octets[0] === 127
}

function shouldBypassProxy(value) {
  try {
    return isLoopbackHostname(new URL(value).hostname)
  } catch {
    return false
  }
}

function normalizedProxyUrl(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return null
  const parsed = new URL(text)
  if (!SUPPORTED_PROXY_PROTOCOLS.has(parsed.protocol)) throw new Error('Proxy URL must use http, https, or socks5.')
  if (!parsed.hostname) throw new Error('Proxy URL must include a host.')
  if (parsed.username || parsed.password) throw new Error('Store proxy credentials separately from the proxy URL.')
  parsed.hash = ''
  parsed.pathname = parsed.pathname === '/' ? '' : parsed.pathname
  return parsed.toString().replace(/\/$/, '')
}

function proxyUrlWithCredentials(state = proxyState) {
  if (!state.url) return ''
  const parsed = new URL(state.url)
  if (state.username) parsed.username = state.username
  if (state.password) parsed.password = state.password
  return parsed.toString()
}

function destroyProxyAgent() {
  for (const agent of proxyAgents.values()) {
    try { agent.destroy() } catch {}
  }
  proxyAgents = new Map()
}

function configureProxy(settings = {}, credentials = {}) {
  const enabled = settings.enabled === true
  const url = settings.url ? normalizedProxyUrl(settings.url) : null
  destroyProxyAgent()
  proxyState = {
    enabled: enabled && !!url,
    url,
    username: typeof credentials.username === 'string' && credentials.username ? credentials.username : null,
    password: typeof credentials.password === 'string' && credentials.password ? credentials.password : null,
    bypassLoopback: true,
  }
  return getProxyState()
}

function getProxyState() {
  return {
    enabled: proxyState.enabled,
    url: proxyState.url,
    bypassLoopback: proxyState.bypassLoopback,
    hasCredentials: !!(proxyState.username || proxyState.password),
  }
}

function agentForProxy(target) {
  const proxy = proxyUrlWithCredentials()
  const proxyProtocol = new URL(proxy).protocol
  const targetProtocol = typeof target === 'string' ? new URL(target).protocol : target.protocol
  const key = `${targetProtocol}|${proxy}`
  if (proxyAgents.has(key)) return proxyAgents.get(key)
  const agent = proxyProtocol === 'socks5:'
    ? new SocksProxyAgent(proxy)
    : targetProtocol === 'https:'
      ? new HttpsProxyAgent(proxy)
      : new HttpProxyAgent(proxy)
  proxyAgents.set(key, agent)
  return agent
}

function redactProxySecret(value) {
  let text = String(value || '')
  for (const secret of [proxyState.username, proxyState.password]) {
    if (!secret) continue
    text = text.split(secret).join('[redacted]').split(encodeURIComponent(secret)).join('[redacted]')
  }
  return text
}

function safeProxyError(err) {
  const safe = new Error(redactProxySecret(err && err.message ? err.message : err))
  safe.name = err && err.name ? err.name : 'Error'
  if (err && err.code) safe.code = err.code
  return safe
}

function requestUsesProxy(value) {
  return proxyState.enabled && !shouldBypassProxy(value)
}

function abortContext(callerSignal, timeoutMs) {
  const controller = new AbortController()
  let timer = null
  let cleaned = false
  const onCallerAbort = () => controller.abort(callerSignal.reason)
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    if (timer) clearTimeout(timer)
    if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort)
  }
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort(callerSignal.reason)
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true })
  }
  timer = setTimeout(() => {
    controller.abort()
    cleanup()
  }, timeoutMs)
  return { signal: controller.signal, cleanup }
}

function responseWithCleanup(response, cleanup) {
  const bodyMethods = ['arrayBuffer', 'blob', 'buffer', 'formData', 'json', 'text', 'textConverted']
  for (const method of bodyMethods) {
    if (typeof response?.[method] !== 'function') continue
    const original = response[method].bind(response)
    response[method] = async (...args) => {
      try {
        return await original(...args)
      } catch (err) {
        throw safeProxyError(err)
      } finally {
        cleanup()
      }
    }
  }
  if (response?.body && typeof response.body.once === 'function') {
    response.body.once('end', cleanup)
    response.body.once('close', cleanup)
    response.body.once('error', cleanup)
  }
  if (!response?.body) cleanup()
  return response
}

function isRedirect(status) {
  return [301, 302, 303, 307, 308].includes(Number(status))
}

function discardBody(response) {
  try {
    if (response?.body && typeof response.body.resume === 'function') response.body.resume()
    else if (response?.body && typeof response.body.cancel === 'function') response.body.cancel().catch(() => {})
  } catch {}
}

function redirectedOptions(options, status, from, to) {
  const next = { ...options }
  const method = String(next.method || 'GET').toUpperCase()
  const becomesGet = status === 303 || ((status === 301 || status === 302) && method === 'POST')
  if (becomesGet) {
    next.method = 'GET'
    delete next.body
  } else if (next.body && typeof next.body.pipe === 'function') {
    throw new Error('Cannot follow a redirect with a streaming request body.')
  }
  const headers = new Headers(next.headers || {})
  if (becomesGet) {
    headers.delete('content-length')
    headers.delete('content-type')
  }
  if (from.origin !== to.origin) {
    headers.delete('authorization')
    headers.delete('cookie')
    headers.delete('proxy-authorization')
  }
  next.headers = headers
  return next
}

async function fetchOne(url, options, signal) {
  const useProxy = requestUsesProxy(url)
  const request = useProxy ? nodeFetch : fetch
  return request(url, {
    ...options,
    signal,
    redirect: 'manual',
    ...(useProxy ? { agent: agentForProxy(url) } : {}),
  })
}

async function fetchFollowingRedirects(url, options, signal) {
  let current = new URL(url)
  let requestOptions = { ...options }
  const redirectMode = requestOptions.redirect || 'follow'
  const maxRedirects = Number.isInteger(requestOptions.follow) ? requestOptions.follow : 20
  delete requestOptions.follow
  for (let count = 0; ; count += 1) {
    const response = await fetchOne(current, requestOptions, signal)
    if (!isRedirect(response.status) || !response.headers.get('location') || redirectMode === 'manual') return response
    if (redirectMode === 'error') {
      discardBody(response)
      throw new Error(`Redirect encountered at ${current.href}.`)
    }
    if (count >= maxRedirects) {
      discardBody(response)
      throw new Error(`Maximum redirect count reached at ${current.href}.`)
    }
    const next = new URL(response.headers.get('location'), current)
    requestOptions = redirectedOptions(requestOptions, response.status, current, next)
    discardBody(response)
    current = next
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const { signal: callerSignal, ...requestOptions } = options
  const abort = abortContext(callerSignal, timeoutMs)

  try {
    const response = await fetchFollowingRedirects(url, requestOptions, abort.signal)
    return responseWithCleanup(response, abort.cleanup)
  } catch (err) {
    abort.cleanup()
    throw safeProxyError(err)
  }
}

module.exports = {
  fetchWithTimeout,
  configureProxy,
  getProxyState,
  normalizedProxyUrl,
  shouldBypassProxy,
  redactProxySecret,
  _private: {
    isLoopbackHostname,
    proxyUrlWithCredentials,
    destroyProxyAgent,
    requestUsesProxy,
    abortContext,
    responseWithCleanup,
    redirectedOptions,
    fetchFollowingRedirects,
  },
}
