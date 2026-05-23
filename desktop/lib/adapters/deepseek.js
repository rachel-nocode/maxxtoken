// DeepSeek balance. The `/user/balance` endpoint returns balance broken into
// granted (free) and topped-up (paid) buckets. We expose the total balance as
// remaining money; configured monthly is the user's budget cap.
const { getKey } = require('../secrets')

const ENDPOINT = 'https://api.deepseek.com/user/balance'

async function read() {
  const key = getKey('deepseek')
  if (!key) return { connected: false }
  try {
    const res = await fetch(ENDPOINT, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (res.status === 401 || res.status === 403) {
      return { connected: false, error: 'API key rejected' }
    }
    if (!res.ok) return { connected: false, error: `HTTP ${res.status}` }
    const json = await res.json()
    const info = (json && json.balance_infos && json.balance_infos[0]) || {}
    const balance = Number(info.total_balance) || 0
    const topped = Number(info.topped_up_balance) || 0
    const granted = Number(info.granted_balance) || 0
    return {
      connected: true,
      balance,
      topped,
      granted,
      currency: info.currency || 'USD',
      isAvailable: !!json.is_available,
      lastActive: Date.now(),
    }
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = { read }
