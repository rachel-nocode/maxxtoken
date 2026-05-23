const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const BASE = 'https://t3.chat'
const REFERER = 'https://t3.chat/settings/customization'
const INPUT = '{"0":{"json":{"sessionId":null},"meta":{"values":{"sessionId":["undefined"]}}}}'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'

const FORWARDED_HEADERS = {
  accept: 'Accept',
  'accept-language': 'Accept-Language',
  'cache-control': 'Cache-Control',
  pragma: 'Pragma',
  priority: 'Priority',
  referer: 'Referer',
  'sec-fetch-dest': 'Sec-Fetch-Dest',
  'sec-fetch-mode': 'Sec-Fetch-Mode',
  'sec-fetch-site': 'Sec-Fetch-Site',
  'trpc-accept': 'trpc-accept',
  'user-agent': 'User-Agent',
  'x-client-context': 'x-client-context',
  'x-deployment-id': 'X-Deployment-Id',
  'x-trpc-batch': 'x-trpc-batch',
  'x-trpc-source': 'x-trpc-source',
}

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text || null
}

function normalizeCookieHeader(raw) {
  let text = clean(raw)
  if (!text) return null
  text = text.replace(/^cookie:\s*/i, '').trim()
  const pairs = []
  for (const chunk of text.split(';')) {
    const index = chunk.indexOf('=')
    if (index <= 0) continue
    const name = chunk.slice(0, index).trim()
    const value = chunk.slice(index + 1).trim()
    if (name && value) pairs.push(`${name}=${value}`)
  }
  return pairs.length ? pairs.join('; ') : null
}

function capture(match, index) {
  return match[index] == null ? null : String(match[index])
}

function unescapeShellSegment(raw, ansi = false) {
  let output = ''
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '\\') {
      output += raw[i]
      continue
    }
    i += 1
    if (i >= raw.length) return output
    if (ansi && raw[i] === 'n') output += '\n'
    else if (ansi && raw[i] === 'r') output += '\r'
    else if (ansi && raw[i] === 't') output += '\t'
    else if (raw[i] !== '\n') output += raw[i]
  }
  return output
}

function headerFields(raw) {
  const text = String(raw || '')
  const pattern = /(?:^|\s)(?:-H|--header)(?:\s+|=|(?=['"$]))(?:\$'((?:\\.|[^'])*)'|'([^']*)'|"((?:\\.|[^"])*)"|(\S+))/gs
  const fields = []
  for (const match of text.matchAll(pattern)) {
    const ansi = capture(match, 1)
    const single = capture(match, 2)
    const double = capture(match, 3)
    const bare = capture(match, 4)
    if (ansi != null) fields.push(unescapeShellSegment(ansi, true))
    else if (single != null) fields.push(single)
    else if (double != null) fields.push(unescapeShellSegment(double))
    else if (bare != null) fields.push(unescapeShellSegment(bare))
  }
  return fields
}

function cookieHeaderFromFields(fields) {
  for (const field of fields) {
    const index = field.indexOf(':')
    if (index <= 0) continue
    if (field.slice(0, index).trim().toLowerCase() !== 'cookie') continue
    const normalized = normalizeCookieHeader(field.slice(index + 1))
    if (normalized) return normalized
  }
  return null
}

function forwardedHeadersFromFields(fields) {
  const headers = {}
  for (const field of fields) {
    const index = field.indexOf(':')
    if (index <= 0) continue
    const name = field.slice(0, index).trim()
    const value = field.slice(index + 1).trim()
    const canonical = FORWARDED_HEADERS[name.toLowerCase()]
    if (canonical && value) headers[canonical] = value
  }
  return headers
}

function requestContext(raw) {
  const text = clean(raw)
  if (!text) return null
  const fields = headerFields(text)
  const cookieHeader = cookieHeaderFromFields(fields) || normalizeCookieHeader(text)
  if (!cookieHeader) return null
  return { cookieHeader, headers: forwardedHeadersFromFields(fields) }
}

function customerDataURL() {
  const params = new URLSearchParams({ batch: '1', input: INPUT })
  return `${BASE}/api/trpc/getCustomerData?${params.toString()}`
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function pct(value) {
  const n = num(value)
  if (n == null) return null
  return Math.max(0, Math.min(100, n))
}

function timestamp(value) {
  const n = num(value)
  if (!n || n <= 0) return null
  return n > 10_000_000_000 ? Math.round(n) : Math.round(n * 1000)
}

function titleizePlan(raw) {
  const text = clean(raw)
  if (!text) return null
  return text
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function findCustomerData(value) {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findCustomerData(entry)
      if (found) return found
    }
    return null
  }
  if (
    value.usageFourHourPercentage != null ||
    value.usageMonthPercentage != null ||
    (value.subscription != null && value.usageBand != null)
  ) {
    return value
  }
  for (const entry of Object.values(value)) {
    const found = findCustomerData(entry)
    if (found) return found
  }
  return null
}

function parseJSONLines(text, now = Date.now()) {
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    let parsed
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    const customerData = findCustomerData(parsed)
    if (customerData) return snapshotFromCustomerData(customerData, now)
  }
  throw new Error('Missing customer data object.')
}

function snapshotFromCustomerData(customerData, now = Date.now()) {
  const subscription = customerData.subscription && typeof customerData.subscription === 'object' ? customerData.subscription : null
  const baseReset = timestamp(customerData.usageFourHourNextResetAt) || timestamp(customerData.usageWindowNextResetAt)
  const overageReset = timestamp(subscription?.currentPeriodEnd)
  const plan = titleizePlan(subscription?.productName || customerData.subTier) || 'T3 Chat'
  const basePct = pct(customerData.usageFourHourPercentage)
  const overagePct = pct(customerData.usageMonthPercentage ?? customerData.usagePeriodPercentage)
  const usageBand = clean(customerData.usageBand)

  const windows = []
  if (basePct != null) {
    windows.push({
      label: usageBand ? `Base - ${usageBand}` : 'Base',
      kind: '4h',
      usedPct: Math.round(basePct),
      resetAt: baseReset,
      periodMs: 4 * 3600e3,
    })
  }
  if (overagePct != null) {
    windows.push({
      label: 'Overage',
      kind: 'cycle',
      usedPct: Math.round(overagePct),
      resetAt: overageReset,
      periodMs: null,
    })
  }

  return {
    connected: true,
    plan,
    windows,
    usageBand,
    lifetimeBalance: num(customerData.lifetimeBalance) || 0,
    subscriptionStatus: clean(subscription?.status),
    resetAt: baseReset || overageReset,
    lastActive: now,
  }
}

async function fetchCustomerData(context) {
  const headers = {
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Cookie: context.cookieHeader,
    Origin: BASE,
    Pragma: 'no-cache',
    Priority: 'u=4',
    Referer: REFERER,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': USER_AGENT,
    'trpc-accept': 'application/jsonl',
    'x-trpc-batch': 'true',
    'x-trpc-source': 'web-client',
    ...context.headers,
  }
  headers.Cookie = context.cookieHeader
  headers.Origin = BASE

  const res = await fetchWithTimeout(customerDataURL(), { headers }, 15000)
  const text = await res.text()
  if (res.status === 401 || res.status === 403) throw new Error('T3 Chat session cookie is invalid or expired.')
  if (res.status === 429 && res.headers.get('x-vercel-mitigated') === 'challenge') {
    throw new Error('T3 Chat returned a Vercel challenge. Paste the full browser cURL request.')
  }
  if (!res.ok) throw new Error(`T3 Chat HTTP ${res.status}`)
  return parseJSONLines(text)
}

function resolveContext() {
  const saved = getKey('t3chat')
  const env = process.env.T3CHAT_COOKIE || process.env.T3_CHAT_COOKIE || process.env.T3CHAT_CURL || process.env.T3_CHAT_CURL
  return requestContext(saved) || requestContext(env)
}

async function read() {
  const context = resolveContext()
  if (!context) return { connected: false, needsKey: true }
  try {
    return await fetchCustomerData(context)
  } catch (err) {
    return { connected: false, needsKey: true, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    customerDataURL,
    fetchCustomerData,
    findCustomerData,
    headerFields,
    normalizeCookieHeader,
    parseJSONLines,
    requestContext,
    snapshotFromCustomerData,
  },
}
