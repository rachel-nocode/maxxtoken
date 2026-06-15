// LicenseProvider — Polar implementation (licensing spec section 16).
// The interface every provider must satisfy (Lemon Squeezy would be a
// drop-in sibling):
//
//   activate({ key, machineId, label })  → { ok:true, activationId, email? }
//   validate({ key, activationId })      → { ok:true }
//   deactivate({ key, activationId })    → { ok:true }
//
// Every failure is normalized to { ok:false, code, message } with code one of:
//   'invalid_key'    — key doesn't exist / malformed (explicit answer)
//   'limit_reached'  — activation limit hit (explicit answer)
//   'revoked'        — key revoked/disabled/refunded (explicit answer)
//   'unreachable'    — timeout, network error, 5xx (NOT an answer; spec
//                      principle 4 says fail open on these)
//   'not_configured' — organizationId not filled in yet (dev/build issue)
//
// Polar's customer-portal license endpoints are unauthenticated by design
// (meant to be called from the user's machine). No usage data is ever sent:
// the request body is exactly { key, organization_id, label?/activation_id? }.

const licenseConfig = require('./config')
const { fetchWithTimeout } = require('../http')

const API_BASE = 'https://api.polar.sh/v1/customer-portal/license-keys'
const TIMEOUT_MS = 12_000

function createPolarProvider({
  organizationId = licenseConfig.organizationId,
  fetchImpl = fetchWithTimeout,
  timeoutMs = TIMEOUT_MS,
} = {}) {
  async function post(endpoint, body) {
    if (!organizationId) {
      return { res: null, json: null, error: 'not_configured' }
    }
    try {
      const res = await fetchImpl(
        `${API_BASE}/${endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organization_id: organizationId, ...body }),
        },
        timeoutMs,
      )
      let json = null
      try {
        json = await res.json()
      } catch {
        /* 204s and error pages have no JSON body */
      }
      return { res, json, error: null }
    } catch {
      // AbortError (timeout), DNS failure, refused connection — all "we got
      // no answer", never "the key is bad".
      return { res: null, json: null, error: 'unreachable' }
    }
  }

  function failureFor({ res, json, error }) {
    if (error === 'not_configured') {
      return { ok: false, code: 'not_configured', message: 'Licensing is not configured in this build.' }
    }
    if (error || !res || res.status >= 500) {
      return { ok: false, code: 'unreachable', message: 'Could not reach the license server.' }
    }
    const detail = json && typeof json.detail === 'string' ? json.detail : ''
    const lower = detail.toLowerCase()
    if (res.status === 404) {
      return { ok: false, code: 'invalid_key', message: 'License key not found.' }
    }
    if (res.status === 403 || lower.includes('activation limit') || lower.includes('limit reached')) {
      return { ok: false, code: 'limit_reached', message: detail || 'Activation limit reached.' }
    }
    if (lower.includes('revoked') || lower.includes('disabled') || lower.includes('expired')) {
      return { ok: false, code: 'revoked', message: detail || 'License key is no longer valid.' }
    }
    // Remaining 4xx (422 validation errors etc.) mean the key/payload was
    // explicitly rejected.
    return { ok: false, code: 'invalid_key', message: detail || 'License key was rejected.' }
  }

  // Polar marks revoked/disabled keys on the license_key object's `status`
  // ('granted' | 'revoked' | 'disabled') — a 2xx response can still mean
  // "this key is dead".
  function statusOf(json) {
    if (!json) return null
    const lk = json.license_key || json
    return typeof lk.status === 'string' ? lk.status.toLowerCase() : null
  }

  return {
    name: 'polar',

    async activate({ key, machineId, label }) {
      const out = await post('activate', { key, label: label || `maxxtoken ${machineId || ''}`.trim() })
      if (out.error || !out.res || !out.res.ok) return failureFor(out)
      const status = statusOf(out.json)
      if (status && status !== 'granted') {
        return { ok: false, code: 'revoked', message: 'License key is no longer valid.' }
      }
      const lk = (out.json && out.json.license_key) || {}
      return {
        ok: true,
        activationId: (out.json && out.json.id) || null,
        email: lk.user_email || (lk.user && lk.user.email) || (lk.customer && lk.customer.email) || null,
      }
    },

    async validate({ key, activationId }) {
      const body = activationId ? { key, activation_id: activationId } : { key }
      const out = await post('validate', body)
      if (out.error || !out.res || !out.res.ok) return failureFor(out)
      const status = statusOf(out.json)
      if (status && status !== 'granted') {
        return { ok: false, code: 'revoked', message: 'License key is no longer valid.' }
      }
      return { ok: true }
    },

    async deactivate({ key, activationId }) {
      const out = await post('deactivate', { key, activation_id: activationId })
      if (out.error || !out.res || !out.res.ok) return failureFor(out)
      return { ok: true }
    },
  }
}

module.exports = { createPolarProvider, API_BASE }
