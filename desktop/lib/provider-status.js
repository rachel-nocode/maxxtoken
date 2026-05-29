const { fetchWithTimeout } = require('./http')

const CACHE_MS = 5 * 60 * 1000
let cache = { signature: null, checkedAt: 0, statuses: {} }

const STATUSPAGE_URLS = {
  codex: 'https://status.openai.com',
  openai: 'https://status.openai.com',
  claude: 'https://status.claude.com',
  cursor: 'https://status.cursor.com',
  copilot: 'https://www.githubstatus.com',
  factory: 'https://status.factory.ai',
  windsurf: 'https://status.windsurf.com',
}

const WORKSPACE_PRODUCTS = {
  gemini: 'npdyhgECDJ6tB66MxXyo',
  antigravity: 'npdyhgECDJ6tB66MxXyo',
}

function labelForIndicator(indicator) {
  return {
    none: 'Operational',
    minor: 'Partial outage',
    major: 'Major outage',
    critical: 'Critical issue',
    maintenance: 'Maintenance',
    unknown: 'Status unknown',
  }[indicator] || 'Status unknown'
}

function rank(indicator) {
  return { none: 0, maintenance: 1, unknown: 1, minor: 2, major: 3, critical: 4 }[indicator] ?? 1
}

function normalizeStatusPageIndicator(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'none') return 'none'
  if (raw === 'minor') return 'minor'
  if (raw === 'major') return 'major'
  if (raw === 'critical') return 'critical'
  if (raw === 'maintenance') return 'maintenance'
  return 'unknown'
}

function parseStatusPageStatus(json, now = Date.now()) {
  const indicator = normalizeStatusPageIndicator(json?.status?.indicator)
  const description = clean(json?.status?.description)
  const updatedAt = Date.parse(json?.page?.updated_at || json?.page?.updatedAt || '')
  return {
    indicator,
    label: labelForIndicator(indicator),
    description,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
    checkedAt: now,
    source: 'statuspage',
  }
}

async function fetchStatusPage(baseURL, fetcher = fetchWithTimeout, now = Date.now()) {
  const url = `${String(baseURL).replace(/\/+$/, '')}/api/v2/status.json`
  const res = await fetcher(url, { headers: { Accept: 'application/json' } }, 5000)
  if (!res.ok) throw new Error(`Status HTTP ${res.status}`)
  return parseStatusPageStatus(await res.json(), now)
}

function workspaceIndicator(status, severity) {
  switch (String(status || '').toUpperCase()) {
    case 'AVAILABLE':
      return 'none'
    case 'SERVICE_INFORMATION':
      return 'minor'
    case 'SERVICE_DISRUPTION':
      return 'major'
    case 'SERVICE_OUTAGE':
      return 'critical'
    case 'SERVICE_MAINTENANCE':
    case 'SCHEDULED_MAINTENANCE':
      return 'maintenance'
  }

  switch (String(severity || '').toLowerCase()) {
    case 'low':
      return 'minor'
    case 'medium':
      return 'major'
    case 'high':
      return 'critical'
    default:
      return 'minor'
  }
}

function workspaceSummary(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (const raw of normalized.split('\n')) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const lower = trimmed.toLowerCase()
    if (lower.startsWith('**summary') || lower.startsWith('**description') || lower === 'summary') continue
    const cleaned = trimmed
      .replace(/\*\*/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^- /, '')
      .trim()
    if (cleaned) return cleaned
  }
  return null
}

function productMatches(incident, productID) {
  const current = Array.isArray(incident.currentlyAffectedProducts) ? incident.currentlyAffectedProducts : null
  const affected = Array.isArray(incident.affectedProducts) ? incident.affectedProducts : []
  const list = current || affected
  return list.some((product) => product?.id === productID)
}

function parseGoogleWorkspaceStatus(incidents, productID, now = Date.now()) {
  const active = (Array.isArray(incidents) ? incidents : []).filter((incident) => !incident.end && productMatches(incident, productID))
  if (!active.length) {
    return {
      indicator: 'none',
      label: labelForIndicator('none'),
      description: null,
      updatedAt: null,
      checkedAt: now,
      source: 'google-workspace',
    }
  }

  let best = null
  for (const incident of active) {
    const update = incident.mostRecentUpdate || (Array.isArray(incident.updates) ? incident.updates.at(-1) : null)
    const indicator = workspaceIndicator(update?.status || incident.statusImpact, incident.severity)
    const candidate = {
      indicator,
      label: labelForIndicator(indicator),
      description: workspaceSummary(update?.text || incident.externalDesc),
      updatedAt: parseDate(update?.when || incident.modified || incident.begin),
      checkedAt: now,
      source: 'google-workspace',
    }
    if (!best || rank(candidate.indicator) > rank(best.indicator)) best = candidate
  }
  return best
}

async function fetchWorkspaceStatus(productID, fetcher = fetchWithTimeout, now = Date.now()) {
  const res = await fetcher('https://www.google.com/appsstatus/dashboard/incidents.json', { headers: { Accept: 'application/json' } }, 5000)
  if (!res.ok) throw new Error(`Workspace status HTTP ${res.status}`)
  return parseGoogleWorkspaceStatus(await res.json(), productID, now)
}

async function statusForProvider(id, fetcher = fetchWithTimeout, now = Date.now()) {
  try {
    let status = null
    if (STATUSPAGE_URLS[id]) status = await fetchStatusPage(STATUSPAGE_URLS[id], fetcher, now)
    else if (WORKSPACE_PRODUCTS[id]) status = await fetchWorkspaceStatus(WORKSPACE_PRODUCTS[id], fetcher, now)
    else return null
    return { ...status, url: STATUSPAGE_URLS[id] || statusUrlForWorkspace(id) || null }
  } catch (err) {
    return {
      indicator: 'unknown',
      label: labelForIndicator('unknown'),
      description: clean(err.message),
      updatedAt: null,
      checkedAt: now,
      source: 'error',
      url: STATUSPAGE_URLS[id] || statusUrlForWorkspace(id) || null,
    }
  }
}

async function statusesForProviders(providerIds, fetcher = fetchWithTimeout, now = Date.now()) {
  const ids = [...new Set(providerIds || [])].filter((id) => STATUSPAGE_URLS[id] || WORKSPACE_PRODUCTS[id]).sort()
  const signature = ids.join('\u001f')
  if (cache.signature === signature && now - cache.checkedAt < CACHE_MS) return cache.statuses

  const entries = await Promise.all(ids.map(async (id) => [id, await statusForProvider(id, fetcher, now)]))
  const statuses = Object.fromEntries(entries.filter(([, status]) => status))
  cache = { signature, checkedAt: now, statuses }
  return statuses
}

function statusUrlForWorkspace(id) {
  if (!WORKSPACE_PRODUCTS[id]) return null
  return `https://www.google.com/appsstatus/dashboard/products/${WORKSPACE_PRODUCTS[id]}/history`
}

function parseDate(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : null
}

function clean(value) {
  const text = String(value || '').trim()
  return text || null
}

function resetCacheForTesting() {
  cache = { signature: null, checkedAt: 0, statuses: {} }
}

module.exports = {
  statusesForProviders,
  statusForProvider,
  parseStatusPageStatus,
  parseGoogleWorkspaceStatus,
  _private: { resetCacheForTesting, workspaceSummary, workspaceIndicator },
}
