const fs = require('fs')
const os = require('os')
const path = require('path')
const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const API_URL = 'https://app.kilo.ai/api/trpc'
const PROCEDURES = ['user.getCreditBlocks', 'kiloPass.getState', 'user.getAutoTopUpPaymentMethod']

function num(value) {
  if (value == null || value === '') return null
  const n = Number(String(value).trim())
  return Number.isFinite(n) ? n : null
}

function bool(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = String(value || '').trim().toLowerCase()
  if (['true', '1', 'yes', 'enabled', 'on', 'active'].includes(normalized)) return true
  if (['false', '0', 'no', 'disabled', 'off', 'inactive', 'none'].includes(normalized)) return false
  return null
}

function parseDate(value) {
  if (value == null || value === '') return null
  const n = num(value)
  if (n != null) {
    const seconds = Math.abs(n) > 10_000_000_000 ? n / 1000 : n
    return seconds * 1000
  }
  const ms = Date.parse(String(value).trim())
  return Number.isFinite(ms) ? ms : null
}

function clean(raw) {
  let value = String(raw || '').trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim()
  }
  return value || null
}

function authFilePath() {
  return path.join(os.homedir(), '.local', 'share', 'kilo', 'auth.json')
}

function parseAuthToken(data) {
  try {
    return clean(JSON.parse(String(data || '{}'))?.kilo?.access)
  } catch {
    return null
  }
}

function resolveToken() {
  const direct = clean(getKey('kilo')) || clean(process.env.KILO_API_KEY)
  if (direct) return { token: direct, source: 'api' }
  const file = authFilePath()
  if (!fs.existsSync(file)) return null
  const token = parseAuthToken(fs.readFileSync(file, 'utf8'))
  return token ? { token, source: 'cli' } : null
}

function batchURL(base = API_URL) {
  const url = new URL(`${base.replace(/\/$/, '')}/${PROCEDURES.join(',')}`)
  const input = {}
  PROCEDURES.forEach((_, index) => {
    input[String(index)] = { json: null }
  })
  url.searchParams.set('batch', '1')
  url.searchParams.set('input', JSON.stringify(input))
  return url.toString()
}

function resultPayload(entry) {
  const result = entry?.result
  if (!result || typeof result !== 'object') return null
  if (result.data && typeof result.data === 'object') {
    if (Object.hasOwn(result.data, 'json')) return result.data.json === null ? null : result.data.json
    return result.data
  }
  if (Object.hasOwn(result, 'json')) return result.json === null ? null : result.json
  return null
}

function entriesByIndex(root) {
  if (Array.isArray(root)) {
    return new Map(root.slice(0, PROCEDURES.length).map((entry, index) => [index, entry]))
  }
  if (root && typeof root === 'object') {
    if (root.result || root.error) return new Map([[0, root]])
    const entries = new Map()
    for (const [key, value] of Object.entries(root)) {
      const index = Number(key)
      if (Number.isInteger(index) && index >= 0 && index < PROCEDURES.length && value && typeof value === 'object') {
        entries.set(index, value)
      }
    }
    if (entries.size) return entries
  }
  throw new Error('Unexpected Kilo tRPC batch shape.')
}

function contexts(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const out = []
  const queue = [[payload, 0]]
  while (queue.length) {
    const [current, depth] = queue.shift()
    out.push(current)
    if (depth >= 2) continue
    for (const value of Object.values(current)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) queue.push([value, depth + 1])
      else if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && !Array.isArray(item)) queue.push([item, depth + 1])
        }
      }
    }
  }
  return out
}

function first(keys, ctxs, convert = (v) => v) {
  for (const ctx of ctxs) {
    for (const key of keys) {
      const value = convert(ctx[key])
      if (value != null) return value
    }
  }
  return null
}

function firstArray(keys, ctxs) {
  for (const ctx of ctxs) {
    for (const key of keys) {
      if (Array.isArray(ctx[key])) return ctx[key]
    }
  }
  return null
}

function moneyAmount({ cents = [], microUSD = [], plain = [] }, ctxs) {
  const centsValue = first(cents, ctxs, num)
  if (centsValue != null) return centsValue / 100
  const microValue = first(microUSD, ctxs, num)
  if (microValue != null) return microValue / 1_000_000
  return first(plain, ctxs, num)
}

function creditFields(payload) {
  const ctxs = contexts(payload)
  const blocks = firstArray(['creditBlocks'], ctxs)
  if (blocks) {
    let total = 0
    let remaining = 0
    let sawTotal = false
    let sawRemaining = false
    for (const block of blocks) {
      const amount = num(block?.amount_mUsd)
      const balance = num(block?.balance_mUsd)
      if (amount != null) {
        total += amount / 1_000_000
        sawTotal = true
      }
      if (balance != null) {
        remaining += balance / 1_000_000
        sawRemaining = true
      }
    }
    if (sawTotal || sawRemaining) {
      const used = sawTotal && sawRemaining ? Math.max(0, total - remaining) : null
      return { used, total: sawTotal ? total : null, remaining: sawRemaining ? remaining : null }
    }
  }

  let used = first(['used', 'usedCredits', 'consumed', 'spent', 'creditsUsed'], ctxs, num)
  let total = first(['total', 'totalCredits', 'creditsTotal', 'limit'], ctxs, num)
  let remaining = first(['remaining', 'remainingCredits', 'creditsRemaining'], ctxs, num)
  const totalBalance = first(['totalBalance_mUsd'], ctxs, num)
  if (used == null && total == null && remaining == null && totalBalance != null) {
    const balance = Math.max(0, totalBalance / 1_000_000)
    return { used: 0, total: balance, remaining: balance }
  }
  if (total == null && used != null && remaining != null) total = used + remaining
  if (used == null && total != null && remaining != null) used = Math.max(0, total - remaining)
  if (remaining == null && total != null && used != null) remaining = Math.max(0, total - used)
  return { used, total, remaining }
}

function subscriptionData(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  if (payload.subscription && typeof payload.subscription === 'object') return payload.subscription
  if (payload.currentPeriodUsageUsd != null || payload.currentPeriodBaseCreditsUsd != null || payload.currentPeriodBonusCreditsUsd != null || payload.tier != null) {
    return payload
  }
  return null
}

function passFields(payload) {
  const subscription = subscriptionData(payload)
  if (subscription) {
    const used = num(subscription.currentPeriodUsageUsd)
    const base = num(subscription.currentPeriodBaseCreditsUsd)
    const bonus = num(subscription.currentPeriodBonusCreditsUsd) || 0
    const total = base == null ? null : base + bonus
    return {
      used,
      total,
      remaining: total != null && used != null ? Math.max(0, total - used) : null,
      bonus: bonus > 0 ? bonus : null,
      resetAt:
        parseDate(subscription.nextBillingAt) ||
        parseDate(subscription.nextRenewalAt) ||
        parseDate(subscription.renewsAt) ||
        parseDate(subscription.renewAt),
    }
  }

  const ctxs = contexts(payload)
  let total = moneyAmount(
    {
      cents: ['amountCents', 'totalCents', 'planAmountCents', 'monthlyAmountCents', 'limitCents', 'includedCents', 'valueCents'],
      microUSD: ['amount_mUsd', 'total_mUsd', 'planAmount_mUsd', 'limit_mUsd', 'included_mUsd', 'value_mUsd'],
      plain: ['amount', 'total', 'limit', 'included', 'value', 'creditsTotal', 'totalCredits', 'planAmount'],
    },
    ctxs,
  )
  let used = moneyAmount(
    {
      cents: ['usedCents', 'spentCents', 'consumedCents', 'usedAmountCents', 'consumedAmountCents'],
      microUSD: ['used_mUsd', 'spent_mUsd', 'consumed_mUsd', 'usedAmount_mUsd'],
      plain: ['used', 'spent', 'consumed', 'usage', 'creditsUsed', 'usedAmount', 'consumedAmount'],
    },
    ctxs,
  )
  let remaining = moneyAmount(
    {
      cents: ['remainingCents', 'remainingAmountCents', 'availableCents', 'leftCents', 'balanceCents'],
      microUSD: ['remaining_mUsd', 'available_mUsd', 'left_mUsd', 'balance_mUsd'],
      plain: ['remaining', 'available', 'left', 'balance', 'creditsRemaining', 'remainingAmount', 'availableAmount'],
    },
    ctxs,
  )
  const bonus = moneyAmount(
    {
      cents: ['bonusCents', 'bonusAmountCents', 'includedBonusCents', 'bonusRemainingCents'],
      microUSD: ['bonus_mUsd', 'bonusAmount_mUsd'],
      plain: ['bonus', 'bonusAmount', 'bonusCredits', 'includedBonus'],
    },
    ctxs,
  )
  if (total == null && used != null && remaining != null) total = used + remaining
  if (used == null && total != null && remaining != null) used = Math.max(0, total - remaining)
  if (remaining == null && total != null && used != null) remaining = Math.max(0, total - used)
  return {
    used,
    total,
    remaining,
    bonus,
    resetAt: first(
      ['resetAt', 'resetsAt', 'nextResetAt', 'renewAt', 'renewsAt', 'nextRenewalAt', 'currentPeriodEnd', 'periodEndsAt', 'expiresAt', 'expiryAt'],
      ctxs,
      parseDate,
    ),
  }
}

function planName(payload) {
  const subscription = subscriptionData(payload)
  if (subscription) {
    const tier = clean(subscription.tier)
    if (tier === 'tier_19') return 'Starter'
    if (tier === 'tier_49') return 'Pro'
    if (tier === 'tier_199') return 'Expert'
    return tier || 'Kilo Pass'
  }
  return first(['planName', 'tier', 'tierName', 'passName', 'subscriptionName', 'name'], contexts(payload), (v) => clean(v))
}

function autoTopUpState(creditPayload, autoTopUpPayload) {
  const creditCtxs = contexts(creditPayload)
  const autoCtxs = contexts(autoTopUpPayload)
  const enabled = first(['enabled', 'isEnabled', 'active', 'status'], autoCtxs, bool) ?? first(['autoTopUpEnabled'], creditCtxs, bool)
  const method = first(['paymentMethod', 'paymentMethodType', 'method', 'cardBrand'], autoCtxs, (v) => clean(v))
  const amount = moneyAmount({ cents: ['amountCents'], plain: ['amount', 'topUpAmount', 'amountUsd'] }, autoCtxs)
  return { enabled, method: method || (amount ? `$${amount}` : null) }
}

function parseSnapshot(body, now = Date.now()) {
  const root = typeof body === 'string' ? JSON.parse(body) : body
  const entries = entriesByIndex(root)
  const payloads = {}
  PROCEDURES.forEach((procedure, index) => {
    const payload = resultPayload(entries.get(index))
    if (payload != null) payloads[procedure] = payload
  })

  const credits = creditFields(payloads[PROCEDURES[0]])
  const pass = passFields(payloads[PROCEDURES[1]])
  const auto = autoTopUpState(payloads[PROCEDURES[0]], payloads[PROCEDURES[2]])
  return {
    connected: true,
    source: 'api',
    creditsUsed: credits.used,
    creditsTotal: credits.total,
    creditsRemaining: credits.remaining,
    passUsed: pass.used,
    passTotal: pass.total,
    passRemaining: pass.remaining,
    passBonus: pass.bonus,
    passResetsAt: pass.resetAt,
    plan: planName(payloads[PROCEDURES[1]]) || 'Kilo',
    autoTopUpEnabled: auto.enabled,
    autoTopUpMethod: auto.method,
    lastActive: now,
  }
}

async function read() {
  const resolved = resolveToken()
  if (!resolved) return { connected: false, needsKey: true, error: `Kilo API key missing. Save one or run 'kilo login'.` }
  try {
    const res = await fetchWithTimeout(
      batchURL(process.env.KILO_API_URL || API_URL),
      {
        headers: {
          Authorization: `Bearer ${resolved.token}`,
          Accept: 'application/json',
        },
      },
      15000,
    )
    const text = await res.text()
    if (res.status === 401 || res.status === 403) return { connected: false, needsKey: true, error: 'Kilo authentication failed.' }
    if (!res.ok) return { connected: false, needsKey: true, error: `Kilo HTTP ${res.status}` }
    return { ...parseSnapshot(text), source: resolved.source }
  } catch (err) {
    return { connected: false, needsKey: true, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    parseSnapshot,
    parseAuthToken,
    batchURL,
    creditFields,
    passFields,
  },
}
