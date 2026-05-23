const crypto = require('crypto')

const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const ACCESS_KEY_ID = 'AWS_ACCESS_KEY_ID'
const SECRET_ACCESS_KEY = 'AWS_SECRET_ACCESS_KEY'
const SESSION_TOKEN = 'AWS_SESSION_TOKEN'
const REGION_KEYS = ['AWS_REGION', 'AWS_DEFAULT_REGION']
const BUDGET_KEY = 'CODEXBAR_BEDROCK_BUDGET'
const API_URL_KEY = 'CODEXBAR_BEDROCK_API_URL'
const DEFAULT_REGION = 'us-east-1'
const CE_REGION = 'us-east-1'
const DEFAULT_API_URL = `https://ce.${CE_REGION}.amazonaws.com`

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function number(value) {
  if (value == null || value === '') return null
  if (typeof value === 'string') value = value.trim().replace(/[$,]/g, '')
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseKeyValueText(text) {
  const out = {}
  for (const line of String(text || '').split(/[\r\n]+/)) {
    const cleaned = line.trim().replace(/^export\s+/, '')
    if (!cleaned || cleaned.startsWith('#')) continue
    const index = cleaned.indexOf('=')
    if (index <= 0) continue
    const key = cleaned.slice(0, index).trim()
    const value = clean(cleaned.slice(index + 1))
    if (key && value) out[key] = value
  }
  return out
}

function parseSaved(raw) {
  const text = clean(raw)
  if (!text) return {}
  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text)
      return {
        accessKeyID: clean(json.accessKeyID || json.accessKeyId || json.awsAccessKeyID || json.aws_access_key_id || json[ACCESS_KEY_ID]),
        secretAccessKey: clean(json.secretAccessKey || json.awsSecretAccessKey || json.aws_secret_access_key || json[SECRET_ACCESS_KEY]),
        sessionToken: clean(json.sessionToken || json.awsSessionToken || json.aws_session_token || json[SESSION_TOKEN]),
        region: clean(json.region || json.awsRegion || json.aws_region || json[REGION_KEYS[0]] || json[REGION_KEYS[1]]),
        budget: number(json.budget || json.monthlyBudget || json.monthly_budget || json[BUDGET_KEY]),
        apiURL: clean(json.apiURL || json.apiUrl || json.endpoint || json[API_URL_KEY]),
      }
    } catch {
      /* fall through */
    }
  }
  const pairs = parseKeyValueText(text)
  return {
    accessKeyID: clean(pairs[ACCESS_KEY_ID]),
    secretAccessKey: clean(pairs[SECRET_ACCESS_KEY]),
    sessionToken: clean(pairs[SESSION_TOKEN]),
    region: clean(pairs[REGION_KEYS[0]] || pairs[REGION_KEYS[1]]),
    budget: number(pairs[BUDGET_KEY]),
    apiURL: clean(pairs[API_URL_KEY]),
  }
}

function envSettings(env = process.env) {
  return {
    accessKeyID: clean(env[ACCESS_KEY_ID]),
    secretAccessKey: clean(env[SECRET_ACCESS_KEY]),
    sessionToken: clean(env[SESSION_TOKEN]),
    region: clean(env[REGION_KEYS[0]] || env[REGION_KEYS[1]]),
    budget: number(env[BUDGET_KEY]),
    apiURL: clean(env[API_URL_KEY]),
  }
}

function resolveSettings(env = process.env) {
  const saved = parseSaved(getKey('bedrock'))
  const fromEnv = envSettings(env)
  const settings = {
    accessKeyID: fromEnv.accessKeyID || saved.accessKeyID,
    secretAccessKey: fromEnv.secretAccessKey || saved.secretAccessKey,
    sessionToken: fromEnv.sessionToken || saved.sessionToken,
    region: fromEnv.region || saved.region || DEFAULT_REGION,
    budget: fromEnv.budget > 0 ? fromEnv.budget : saved.budget > 0 ? saved.budget : null,
    apiURL: fromEnv.apiURL || saved.apiURL || DEFAULT_API_URL,
  }
  return settings.accessKeyID && settings.secretAccessKey ? settings : { ...settings, missingCredentials: true }
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function dateKey(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
}

function amzDate(date) {
  return `${dateKey(date)}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

function ceDate(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function currentMonthRange(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const tomorrow = new Date(today.getTime() + 86400000)
  return { start: ceDate(start), end: ceDate(tomorrow) }
}

function endOfCurrentMonth(now = new Date()) {
  return Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding)
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function uriEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
}

function canonicalPath(pathname) {
  return pathname
    .split('/')
    .map((part) => uriEncode(part))
    .join('/') || '/'
}

function signedHeaders(headers) {
  const entries = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), String(value).trim()])
    .sort(([a], [b]) => a.localeCompare(b))
  return {
    keys: entries.map(([key]) => key).join(';'),
    canonical: entries.map(([key, value]) => `${key}:${value}`).join('\n'),
  }
}

function signRequest({ url, body, headers, credentials, region = CE_REGION, service = 'ce', now = new Date() }) {
  const dateStamp = dateKey(now)
  const stamp = amzDate(now)
  const parsed = new URL(url)
  const bodyHash = sha256Hex(body)
  const allHeaders = {
    ...headers,
    Host: parsed.host,
    'X-Amz-Date': stamp,
    'x-amz-content-sha256': bodyHash,
  }
  if (credentials.sessionToken) allHeaders['X-Amz-Security-Token'] = credentials.sessionToken

  const signed = signedHeaders(allHeaders)
  const canonicalRequest = [
    'POST',
    canonicalPath(parsed.pathname || '/'),
    parsed.searchParams.toString(),
    signed.canonical + '\n',
    signed.keys,
    bodyHash,
  ].join('\n')
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    stamp,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const kDate = hmac(Buffer.from(`AWS4${credentials.secretAccessKey}`, 'utf8'), dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = hmac(kSigning, stringToSign, 'hex')
  allHeaders.Authorization =
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyID}/${credentialScope}, ` +
    `SignedHeaders=${signed.keys}, Signature=${signature}`
  return allHeaders
}

function makeCostExplorerBody({ startDate, endDate, granularity, nextPageToken }) {
  const body = {
    TimePeriod: { Start: startDate, End: endDate },
    Granularity: granularity,
    Metrics: ['UnblendedCost'],
    GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
  }
  if (nextPageToken) body.NextPageToken = nextPageToken
  return JSON.stringify(body)
}

async function callCostExplorerPage({ settings, startDate, endDate, granularity, nextPageToken }) {
  const body = makeCostExplorerBody({ startDate, endDate, granularity, nextPageToken })
  const baseHeaders = {
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Target': 'AWSInsightsIndexService.GetCostAndUsage',
  }
  const headers = signRequest({
    url: settings.apiURL,
    body,
    headers: baseHeaders,
    credentials: settings,
    region: CE_REGION,
    service: 'ce',
  })
  const res = await fetchWithTimeout(settings.apiURL, { method: 'POST', headers, body }, 15000)
  const text = await res.text()
  if (!res.ok) throw new Error(`AWS Cost Explorer HTTP ${res.status}: ${text.slice(0, 200)}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Could not parse AWS Cost Explorer response')
  }
}

async function callCostExplorerPages({ settings, startDate, endDate, granularity }) {
  const pages = []
  const seen = new Set()
  let nextPageToken = null
  do {
    const page = await callCostExplorerPage({ settings, startDate, endDate, granularity, nextPageToken })
    pages.push(page)
    nextPageToken = clean(page.NextPageToken)
    if (nextPageToken) {
      if (seen.has(nextPageToken)) throw new Error('AWS Cost Explorer returned repeated NextPageToken')
      seen.add(nextPageToken)
    }
  } while (nextPageToken)
  return pages
}

function groupedResults(page) {
  const results = Array.isArray(page?.ResultsByTime) ? page.ResultsByTime : null
  if (!results) throw new Error('Missing ResultsByTime in AWS Cost Explorer response')
  const out = []
  for (const result of results) {
    const date = clean(result?.TimePeriod?.Start) || ''
    for (const group of result.Groups || []) {
      const service = clean(Array.isArray(group.Keys) && group.Keys[0])
      if (!service || !service.toLowerCase().includes('bedrock')) continue
      const amount = number(group?.Metrics?.UnblendedCost?.Amount)
      if (amount == null) continue
      out.push({ service, cost: amount, date })
    }
  }
  return out
}

function parseTotalCost(pages) {
  return pages.flatMap(groupedResults).reduce((sum, item) => sum + item.cost, 0)
}

function parseDailyEntries(pages) {
  const byDate = new Map()
  for (const item of pages.flatMap(groupedResults)) {
    if (!(item.cost > 0)) continue
    const entry = byDate.get(item.date) || { date: item.date, costUSD: 0, modelsUsed: [], modelBreakdowns: [] }
    entry.costUSD += item.cost
    entry.modelsUsed.push(item.service)
    entry.modelBreakdowns.push({ modelName: item.service, costUSD: item.cost, totalTokens: null })
    byDate.set(item.date, entry)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

async function fetchMonthlyUsage(settings = resolveSettings(), now = new Date()) {
  if (settings.missingCredentials) throw new Error('AWS credentials not configured')
  const range = currentMonthRange(now)
  const pages = await callCostExplorerPages({
    settings,
    startDate: range.start,
    endDate: range.end,
    granularity: 'MONTHLY',
  })
  const monthlySpend = parseTotalCost(pages)
  return {
    connected: true,
    monthlySpend,
    monthlyBudget: settings.budget || null,
    budgetUsedPct: settings.budget > 0 ? Math.max(0, Math.min(100, (monthlySpend / settings.budget) * 100)) : null,
    region: settings.region,
    updatedAt: Date.now(),
    lastActive: Date.now(),
  }
}

async function fetchDailyReport(settings = resolveSettings(), since = new Date(Date.now() - 29 * 86400000), until = new Date()) {
  if (settings.missingCredentials) throw new Error('AWS credentials not configured')
  const startDate = ceDate(since)
  const endDate = ceDate(new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), until.getUTCDate()) + 86400000))
  const pages = await callCostExplorerPages({ settings, startDate, endDate, granularity: 'DAILY' })
  return parseDailyEntries(pages)
}

async function read() {
  let settings
  try {
    settings = resolveSettings()
    if (settings.missingCredentials) {
      return { connected: false, error: 'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY not configured' }
    }
    const usage = await fetchMonthlyUsage(settings)
    return usage
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    callCostExplorerPages,
    currentMonthRange,
    endOfCurrentMonth,
    envSettings,
    fetchDailyReport,
    fetchMonthlyUsage,
    groupedResults,
    makeCostExplorerBody,
    parseDailyEntries,
    parseSaved,
    parseTotalCost,
    resolveSettings,
    signRequest,
  },
}
