const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const DEFAULT_API_URL = 'https://api.deepgram.com/v1'

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function parseSavedConfig(raw) {
  const text = clean(raw)
  if (!text) return {}
  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text)
      return {
        apiKey: clean(json.apiKey || json.key || json.api_key),
        projectID: clean(json.projectID || json.projectId || json.project_id || json.workspaceID || json.workspaceId),
      }
    } catch {
      return {}
    }
  }
  const [apiKey, projectID] = text.split('|').map(clean)
  return { apiKey, projectID }
}

function resolveConfig() {
  const saved = parseSavedConfig(getKey('deepgram'))
  return {
    apiKey: clean(process.env.DEEPGRAM_API_KEY) || saved.apiKey || null,
    projectID: clean(process.env.DEEPGRAM_PROJECT_ID) || saved.projectID || null,
    apiURL: apiURL(),
  }
}

function apiURL() {
  const raw = clean(process.env.DEEPGRAM_API_URL) || DEFAULT_API_URL
  try {
    return new URL(raw)
  } catch {
    return new URL(DEFAULT_API_URL)
  }
}

function appendPath(url, component) {
  const next = new URL(url.toString())
  const base = next.pathname.endsWith('/') ? next.pathname.slice(0, -1) : next.pathname
  next.pathname = `${base}/${encodeURIComponent(component)}`
  return next
}

function projectsURL(base = apiURL()) {
  return appendPath(base, 'projects')
}

function usageURL(projectID, query = {}, base = apiURL()) {
  let url = appendPath(base, 'projects')
  url = appendPath(url, projectID)
  url = appendPath(url, 'usage')
  url = appendPath(url, 'breakdown')
  if (clean(query.start)) url.searchParams.set('start', clean(query.start))
  if (clean(query.end)) url.searchParams.set('end', clean(query.end))
  return url
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function parseUsage(json, project, now = Date.now()) {
  if (!json || typeof json !== 'object') throw new Error('Invalid Deepgram usage response')
  const results = Array.isArray(json.results) ? json.results : []
  const usage = results.reduce(
    (acc, row) => {
      acc.hours += num(row.hours)
      acc.totalHours += num(row.total_hours ?? row.totalHours)
      acc.agentHours += num(row.agent_hours ?? row.agentHours)
      acc.tokensIn += Math.trunc(num(row.tokens_in ?? row.tokensIn))
      acc.tokensOut += Math.trunc(num(row.tokens_out ?? row.tokensOut))
      acc.ttsCharacters += Math.trunc(num(row.tts_characters ?? row.ttsCharacters))
      acc.requests += Math.trunc(num(row.requests))
      return acc
    },
    { hours: 0, totalHours: 0, agentHours: 0, tokensIn: 0, tokensOut: 0, ttsCharacters: 0, requests: 0 },
  )
  return {
    connected: true,
    projectID: project.projectID,
    projectName: project.name || null,
    projectCount: 1,
    start: clean(json.start),
    end: clean(json.end),
    totalTokens: usage.tokensIn + usage.tokensOut,
    ...usage,
    lastActive: now,
  }
}

function aggregateSnapshots(snapshots, now = Date.now()) {
  if (!snapshots.length) throw new Error('No Deepgram projects found')
  if (snapshots.length === 1) return snapshots[0]
  return {
    connected: true,
    projectID: 'all',
    projectName: null,
    projectCount: snapshots.length,
    start: snapshots.map((s) => s.start).filter(Boolean).sort()[0] || null,
    end: snapshots.map((s) => s.end).filter(Boolean).sort().at(-1) || null,
    hours: snapshots.reduce((sum, s) => sum + num(s.hours), 0),
    totalHours: snapshots.reduce((sum, s) => sum + num(s.totalHours), 0),
    agentHours: snapshots.reduce((sum, s) => sum + num(s.agentHours), 0),
    tokensIn: snapshots.reduce((sum, s) => sum + Math.trunc(num(s.tokensIn)), 0),
    tokensOut: snapshots.reduce((sum, s) => sum + Math.trunc(num(s.tokensOut)), 0),
    ttsCharacters: snapshots.reduce((sum, s) => sum + Math.trunc(num(s.ttsCharacters)), 0),
    requests: snapshots.reduce((sum, s) => sum + Math.trunc(num(s.requests)), 0),
    totalTokens: snapshots.reduce((sum, s) => sum + Math.trunc(num(s.totalTokens)), 0),
    lastActive: now,
  }
}

function formatInteger(value) {
  return Math.round(num(value)).toLocaleString('en-US')
}

function formatDecimal(value) {
  const n = num(value)
  return n.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 1,
    maximumFractionDigits: 1,
  })
}

function displayLines(usage) {
  const lines = [`Requests: ${formatInteger(usage.requests)}`]
  const usageParts = []
  if (usage.hours > 0) usageParts.push(`${formatDecimal(usage.hours)} audio hours`)
  if (usage.totalHours > 0) usageParts.push(`${formatDecimal(usage.totalHours)} billable hours`)
  if (usageParts.length) lines.push(usageParts.join(' · '))
  const modelParts = []
  if (usage.agentHours > 0) modelParts.push(`${formatDecimal(usage.agentHours)} agent hours`)
  if (usage.totalTokens > 0) modelParts.push(`${formatInteger(usage.totalTokens)} tokens`)
  if (usage.ttsCharacters > 0) modelParts.push(`${formatInteger(usage.ttsCharacters)} TTS chars`)
  if (modelParts.length) lines.push(modelParts.join(' · '))
  if (usage.start && usage.end) lines.push(`Period: ${usage.start} to ${usage.end}`)
  return lines
}

function compactText(text, maxLength = 240) {
  const collapsed = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  const redacted = collapsed
    .replace(/(token\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
    .replace(/dg_[A-Za-z0-9._-]+/gi, '[REDACTED]')
  return redacted.length > maxLength ? redacted.slice(0, maxLength) + '...' : redacted
}

async function requestJSON(url, apiKey) {
  const res = await fetchWithTimeout(
    url.toString(),
    {
      headers: {
        Authorization: `Token ${apiKey}`,
        Accept: 'application/json',
      },
    },
    15000,
  )
  const text = await res.text()
  if (res.status === 401) {
    const error = new Error('Deepgram API key is invalid or expired')
    error.status = res.status
    throw error
  }
  if (res.status === 403) {
    const error = new Error(`Deepgram rejected access: ${compactText(text)}`)
    error.status = res.status
    throw error
  }
  if (!res.ok) {
    const error = new Error(`Deepgram HTTP ${res.status}: ${compactText(text)}`)
    error.status = res.status
    throw error
  }
  return text ? JSON.parse(text) : {}
}

async function listProjects(apiKey, base) {
  const json = await requestJSON(projectsURL(base), apiKey)
  return Array.isArray(json.projects)
    ? json.projects.map((project) => ({
        projectID: clean(project.project_id || project.projectID),
        name: clean(project.name),
      })).filter((project) => project.projectID)
    : []
}

async function read() {
  const config = resolveConfig()
  if (!config.apiKey) return { connected: false, error: 'Deepgram API key not configured' }
  try {
    const projects = config.projectID
      ? [{ projectID: config.projectID, name: null }]
      : await listProjects(config.apiKey, config.apiURL)
    if (!projects.length) return { connected: false, error: 'No Deepgram projects found for this API key' }
    const snapshots = []
    for (const project of projects) {
      const json = await requestJSON(usageURL(project.projectID, {}, config.apiURL), config.apiKey)
      snapshots.push(parseUsage(json, project))
    }
    return aggregateSnapshots(snapshots)
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    aggregateSnapshots,
    displayLines,
    parseSavedConfig,
    parseUsage,
    projectsURL,
    resolveConfig,
    usageURL,
  },
}
