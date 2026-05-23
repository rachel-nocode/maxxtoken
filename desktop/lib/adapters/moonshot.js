const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const HOSTS = {
  international: 'https://api.moonshot.ai',
  china: 'https://api.moonshot.cn',
}

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function resolveKey() {
  return clean(process.env.MOONSHOT_API_KEY) || clean(process.env.MOONSHOT_KEY) || clean(getKey('moonshot'))
}

function region() {
  const raw = clean(process.env.MOONSHOT_REGION)?.toLowerCase()
  return raw === 'china' ? 'china' : 'international'
}

function balanceURL(selectedRegion = region()) {
  return `${HOSTS[selectedRegion] || HOSTS.international}/v1/users/me/balance`
}

function num(value) {
  if (value == null || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function parseBalance(json, now = Date.now()) {
  if (!json || typeof json !== 'object') throw new Error('Invalid Moonshot response')
  if (json.code !== 0 || json.status !== true) {
    throw new Error(`code ${json.code}, scode ${json.scode}`)
  }
  const data = json.data && typeof json.data === 'object' ? json.data : {}
  const availableBalance = num(data.available_balance ?? data.availableBalance)
  const voucherBalance = num(data.voucher_balance ?? data.voucherBalance)
  const cashBalance = num(data.cash_balance ?? data.cashBalance)
  return {
    connected: true,
    availableBalance,
    voucherBalance,
    cashBalance,
    deficit: cashBalance < 0 ? Math.abs(cashBalance) : 0,
    lastActive: now,
  }
}

async function read() {
  const key = resolveKey()
  if (!key) return { connected: false }
  try {
    const res = await fetchWithTimeout(
      balanceURL(),
      {
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
        },
      },
      15000,
    )
    const text = await res.text()
    if (res.status === 401 || res.status === 403) return { connected: false, error: 'Moonshot API key rejected' }
    if (!res.ok) return { connected: false, error: `Moonshot HTTP ${res.status}` }
    try {
      return parseBalance(JSON.parse(text))
    } catch (err) {
      return { connected: false, error: err && err.message ? err.message : 'Could not parse Moonshot balance response' }
    }
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    balanceURL,
    parseBalance,
    resolveKey,
  },
}
