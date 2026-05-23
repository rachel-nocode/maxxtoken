const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const ENDPOINT = 'https://api.venice.ai/api/v1/billing/balance'

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function resolveKey() {
  return clean(process.env.VENICE_API_KEY) || clean(process.env.VENICE_KEY) || clean(getKey('venice'))
}

function num(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function clampPct(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, n))
}

function parseBalance(json) {
  const balances = json?.balances && typeof json.balances === 'object' ? json.balances : {}
  const canConsume = json?.canConsume === true
  const currency = clean(json?.consumptionCurrency)?.toUpperCase() || null
  const diemBalance = num(balances.diem)
  const usdBalance = num(balances.usd)
  const diemEpochAllocation = num(json?.diemEpochAllocation)

  let label = 'No Venice API balance available'
  let usedPct = 100
  let total = 0
  let remaining = 0
  let unit = 'balance'

  if (!canConsume) {
    label = 'Balance unavailable for API calls'
  } else if (currency === 'USD' && usdBalance > 0) {
    label = `$${usdBalance.toFixed(2)} USD remaining`
    usedPct = 0
    total = usdBalance
    remaining = usdBalance
    unit = 'dollars'
  } else if (currency !== 'USD' && diemBalance != null && diemEpochAllocation > 0) {
    const used = Math.max(0, diemEpochAllocation - Math.max(0, diemBalance))
    usedPct = clampPct((used / diemEpochAllocation) * 100) ?? 0
    label = `DIEM ${diemBalance.toFixed(2)} / ${diemEpochAllocation.toFixed(2)} epoch allocation`
    total = diemEpochAllocation
    remaining = Math.max(0, diemBalance)
    unit = 'diem'
  } else if (currency === 'DIEM' && diemBalance > 0) {
    label = `DIEM ${diemBalance.toFixed(2)} remaining`
    usedPct = 0
    total = diemBalance
    remaining = diemBalance
    unit = 'diem'
  } else if (diemBalance > 0) {
    label = `DIEM ${diemBalance.toFixed(2)} remaining`
    usedPct = 0
    total = diemBalance
    remaining = diemBalance
    unit = 'diem'
  } else if (usdBalance > 0) {
    label = `$${usdBalance.toFixed(2)} USD remaining`
    usedPct = 0
    total = usdBalance
    remaining = usdBalance
    unit = 'dollars'
  }

  return {
    connected: true,
    canConsume,
    currency,
    diemBalance,
    usdBalance,
    diemEpochAllocation,
    label,
    usedPct,
    total,
    remaining,
    used: Math.max(0, total - remaining),
    unit,
    lastActive: Date.now(),
  }
}

async function read() {
  const key = resolveKey()
  if (!key) return { connected: false }
  try {
    const res = await fetchWithTimeout(
      ENDPOINT,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
        },
      },
      15000,
    )
    const text = await res.text()
    if (res.status === 401 || res.status === 403) return { connected: false, error: 'Venice API key rejected' }
    if (!res.ok) return { connected: false, error: `Venice HTTP ${res.status}` }
    try {
      return parseBalance(JSON.parse(text))
    } catch {
      return { connected: false, error: 'Could not parse Venice balance response' }
    }
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    parseBalance,
    resolveKey,
  },
}
