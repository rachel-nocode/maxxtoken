const os = require('os')
const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const ENDPOINT = 'https://app.warp.dev/graphql/v2?op=GetRequestLimitInfo'
const QUERY = `
query GetRequestLimitInfo($requestContext: RequestContext!) {
  user(requestContext: $requestContext) {
    __typename
    ... on UserOutput {
      user {
        requestLimitInfo {
          isUnlimited
          nextRefreshTime
          requestLimit
          requestsUsedSinceLastRefresh
        }
        bonusGrants {
          requestCreditsGranted
          requestCreditsRemaining
          expiration
        }
        workspaces {
          bonusGrantsInfo {
            grants {
              requestCreditsGranted
              requestCreditsRemaining
              expiration
            }
          }
        }
      }
    }
  }
}`

function intValue(value) {
  if (value == null || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function boolValue(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = String(value || '').trim().toLowerCase()
  if (['true', '1', 'yes'].includes(normalized)) return true
  if (['false', '0', 'no'].includes(normalized)) return false
  return false
}

function parseDate(value) {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function pct(used, total) {
  if (!total || total <= 0) return 0
  return Math.max(0, Math.min(100, (used / total) * 100))
}

function graphQLErrorMessage(value) {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object' && typeof value.message === 'string') return value.message.trim()
  return ''
}

function compactSummaryText(text, maxLength = 200) {
  const collapsed = String(text || '').split(/\r?\n/).join(' ').trim()
  return collapsed.length > maxLength ? collapsed.slice(0, maxLength) + '...' : collapsed
}

function apiErrorSummary(statusCode, body) {
  let json = null
  try {
    json = typeof body === 'string' ? JSON.parse(body) : body
  } catch {
    return compactSummaryText(body) || `Unexpected response body.`
  }
  if (Array.isArray(json?.errors) && json.errors.length) {
    const joined = json.errors.map(graphQLErrorMessage).filter(Boolean).slice(0, 3).join(' | ')
    if (joined) return compactSummaryText(joined)
  }
  if (typeof json?.error === 'string') return compactSummaryText(json.error)
  if (typeof json?.message === 'string') return compactSummaryText(json.message)
  return `HTTP ${statusCode}`
}

function parseBonusGrant(grant) {
  return {
    granted: intValue(grant?.requestCreditsGranted),
    remaining: intValue(grant?.requestCreditsRemaining),
    expiration: parseDate(grant?.expiration),
  }
}

function parseBonusCredits(user) {
  const grants = []
  if (Array.isArray(user?.bonusGrants)) {
    for (const grant of user.bonusGrants) grants.push(parseBonusGrant(grant))
  }
  if (Array.isArray(user?.workspaces)) {
    for (const workspace of user.workspaces) {
      const workspaceGrants = workspace?.bonusGrantsInfo?.grants
      if (!Array.isArray(workspaceGrants)) continue
      for (const grant of workspaceGrants) grants.push(parseBonusGrant(grant))
    }
  }

  const remaining = grants.reduce((sum, grant) => sum + grant.remaining, 0)
  const total = grants.reduce((sum, grant) => sum + grant.granted, 0)
  const expiring = grants.filter((grant) => grant.remaining > 0 && grant.expiration)
  expiring.sort((a, b) => a.expiration - b.expiration)
  const nextExpiration = expiring[0]?.expiration || null
  const nextExpirationRemaining = nextExpiration
    ? expiring
        .filter((grant) => Math.floor(grant.expiration / 1000) === Math.floor(nextExpiration / 1000))
        .reduce((sum, grant) => sum + grant.remaining, 0)
    : 0

  return { remaining, total, nextExpiration, nextExpirationRemaining }
}

function parseUsage(body, now = Date.now()) {
  const json = typeof body === 'string' ? JSON.parse(body) : body
  if (Array.isArray(json?.errors) && json.errors.length) {
    const summary = json.errors.map(graphQLErrorMessage).filter(Boolean).slice(0, 3).join(' | ') || 'GraphQL request failed.'
    throw new Error(summary)
  }

  const userObj = json?.data?.user
  const innerUser = userObj?.user
  const limitInfo = innerUser?.requestLimitInfo
  if (!limitInfo) {
    const typeName = String(userObj?.__typename || '').trim()
    if (typeName && typeName !== 'UserOutput') throw new Error(`Unexpected Warp user type '${typeName}'.`)
    throw new Error('Unable to extract Warp requestLimitInfo.')
  }

  const requestLimit = intValue(limitInfo.requestLimit)
  const requestsUsed = intValue(limitInfo.requestsUsedSinceLastRefresh)
  const isUnlimited = boolValue(limitInfo.isUnlimited)
  const bonus = parseBonusCredits(innerUser)

  return {
    connected: true,
    requestLimit,
    requestsUsed,
    usedPct: isUnlimited ? 0 : pct(requestsUsed, requestLimit),
    resetAt: isUnlimited ? null : parseDate(limitInfo.nextRefreshTime),
    isUnlimited,
    bonusCreditsRemaining: bonus.remaining,
    bonusCreditsTotal: bonus.total,
    bonusNextExpiration: bonus.nextExpiration,
    bonusNextExpirationRemaining: bonus.nextExpirationRemaining,
    lastActive: now,
  }
}

function osVersionString() {
  const release = os.release().split('.')
  return release.slice(0, 3).join('.')
}

async function read() {
  const key = getKey('warp') || process.env.WARP_API_KEY || process.env.WARP_TOKEN
  if (!key) return { connected: false, needsKey: true }

  try {
    const version = osVersionString()
    const res = await fetchWithTimeout(
      ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-warp-client-id': 'warp-app',
          'x-warp-os-category': 'macOS',
          'x-warp-os-name': 'macOS',
          'x-warp-os-version': version,
          Authorization: `Bearer ${String(key).trim()}`,
          'User-Agent': 'Warp/1.0',
        },
        body: JSON.stringify({
          query: QUERY,
          variables: {
            requestContext: {
              clientContext: {},
              osContext: { category: 'macOS', name: 'macOS', version },
            },
          },
          operationName: 'GetRequestLimitInfo',
        }),
      },
      15000,
    )
    const text = await res.text()
    if (!res.ok) return { connected: false, needsKey: true, error: apiErrorSummary(res.status, text) }
    return parseUsage(text)
  } catch (err) {
    return { connected: false, needsKey: true, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    parseUsage,
    parseBonusCredits,
    apiErrorSummary,
    boolValue,
  },
}
