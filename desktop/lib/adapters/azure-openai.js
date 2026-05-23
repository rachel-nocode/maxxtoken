const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const DEFAULT_API_VERSION = '2024-10-21'

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function endpointURL(raw) {
  const text = clean(raw)
  if (!text) return null
  const withScheme = text.includes('://') ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    return url.hostname ? url : null
  } catch {
    return null
  }
}

function parseSavedConfig(raw) {
  const text = clean(raw)
  if (!text) return {}
  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text)
      return {
        apiKey: clean(json.apiKey || json.key || json.api_key),
        endpoint: clean(json.endpoint),
        deploymentName: clean(json.deploymentName || json.deployment || json.deployment_name),
        apiVersion: clean(json.apiVersion || json.api_version),
      }
    } catch {
      return {}
    }
  }
  const parts = text.split('|').map(clean)
  return {
    apiKey: parts[0],
    endpoint: parts[1],
    deploymentName: parts[2],
    apiVersion: parts[3],
  }
}

function resolveConfig() {
  const saved = parseSavedConfig(getKey('azureopenai'))
  return {
    apiKey: clean(process.env.AZURE_OPENAI_API_KEY) || saved.apiKey || null,
    endpoint: endpointURL(clean(process.env.AZURE_OPENAI_ENDPOINT) || saved.endpoint),
    deploymentName: clean(process.env.AZURE_OPENAI_DEPLOYMENT_NAME) || saved.deploymentName || null,
    apiVersion: clean(process.env.AZURE_OPENAI_API_VERSION) || saved.apiVersion || DEFAULT_API_VERSION,
  }
}

function sharedPrefixCount(existing, expected) {
  const max = Math.min(existing.length, expected.length)
  for (let count = max; count >= 0; count--) {
    if (count === 0) return 0
    const existingTail = existing.slice(existing.length - count).map((s) => s.toLowerCase())
    const expectedHead = expected.slice(0, count).map((s) => s.toLowerCase())
    if (existingTail.every((part, index) => part === expectedHead[index])) return count
  }
  return 0
}

function apiRoot(endpoint, expectedComponents) {
  const url = new URL(endpoint.toString())
  const existing = url.pathname.split('/').filter(Boolean)
  const shared = sharedPrefixCount(existing, expectedComponents)
  for (const component of expectedComponents.slice(shared)) url.pathname = appendPath(url.pathname, component)
  return url
}

function appendPath(pathname, component) {
  const base = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return `${base}/${encodeURIComponent(component)}`
}

function usesV1API(apiVersion) {
  return clean(apiVersion)?.toLowerCase() === 'v1'
}

function chatCompletionsURL(endpoint, deploymentName, apiVersion = DEFAULT_API_VERSION) {
  if (usesV1API(apiVersion)) {
    const url = apiRoot(endpoint, ['openai', 'v1'])
    url.pathname = appendPath(url.pathname, 'chat')
    url.pathname = appendPath(url.pathname, 'completions')
    url.search = ''
    return url
  }

  const url = apiRoot(endpoint, ['openai'])
  url.pathname = appendPath(url.pathname, 'deployments')
  url.pathname = appendPath(url.pathname, deploymentName)
  url.pathname = appendPath(url.pathname, 'chat')
  url.pathname = appendPath(url.pathname, 'completions')
  url.searchParams.set('api-version', clean(apiVersion) || DEFAULT_API_VERSION)
  return url
}

function validationBody(deploymentName, apiVersion) {
  const payload = {
    messages: [{ role: 'user', content: 'ping' }],
  }
  if (usesV1API(apiVersion)) {
    payload.model = deploymentName
    payload.max_completion_tokens = 1
  } else {
    payload.max_tokens = 1
  }
  return payload
}

function compactText(text, maxLength = 240) {
  const collapsed = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  return collapsed.length > maxLength ? collapsed.slice(0, maxLength) + '...' : collapsed
}

function detailText(deploymentName, model) {
  const cleanedModel = clean(model)
  return cleanedModel ? `Deployment: ${deploymentName} · Model: ${cleanedModel}` : `Deployment: ${deploymentName}`
}

function parseResponse(json, config, now = Date.now()) {
  return {
    connected: true,
    endpointHost: config.endpoint.hostname,
    deploymentName: config.deploymentName,
    model: clean(json?.model),
    apiVersion: config.apiVersion || DEFAULT_API_VERSION,
    detail: detailText(config.deploymentName, json?.model),
    lastActive: now,
  }
}

async function read() {
  const config = resolveConfig()
  if (!config.apiKey) return { connected: false, error: 'Azure OpenAI API key not configured' }
  if (!config.endpoint) return { connected: false, error: 'Azure OpenAI endpoint not configured' }
  if (!config.deploymentName) return { connected: false, error: 'Azure OpenAI deployment not configured' }

  try {
    const url = chatCompletionsURL(config.endpoint, config.deploymentName, config.apiVersion)
    const res = await fetchWithTimeout(
      url.toString(),
      {
        method: 'POST',
        headers: {
          'api-key': config.apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validationBody(config.deploymentName, config.apiVersion)),
      },
      20000,
    )
    const text = await res.text()
    if (res.status === 401 || res.status === 403) return { connected: false, error: 'Azure OpenAI API key rejected' }
    if (!res.ok) return { connected: false, error: `Azure OpenAI HTTP ${res.status}: ${compactText(text)}` }
    try {
      return parseResponse(JSON.parse(text), config)
    } catch {
      return { connected: false, error: 'Could not parse Azure OpenAI validation response' }
    }
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    chatCompletionsURL,
    clean,
    endpointURL,
    parseResponse,
    parseSavedConfig,
    resolveConfig,
    validationBody,
  },
}
