// License manager — the single `licenseState` source of truth (spec
// principle 5). Everything paid gates off getState().unlocked; there are no
// scattered isPaid booleans anywhere else in the app.
//
// Composition over globals: provider, store, and clock are injected so tests
// drive the whole thing with fakes (fake Polar, temp dir, fake time).

const crypto = require('crypto')
const { STATUS, reduce, isUnlocked, GRACE_DAYS, DAY_MS } = require('./machine')
const { createPolarProvider } = require('./provider-polar')
const { withBetaCodes } = require('./beta')
const { createLicenseStore } = require('./store')
const licenseConfig = require('./config')

const REVALIDATE_DAYS = 7

function maskKey(key) {
  const s = String(key || '')
  if (s.length <= 8) return s ? '••••' : ''
  return `${s.slice(0, 4)}…${s.slice(-4)}`
}

function createLicenseManager({
  provider,
  store,
  dir,
  now = Date.now,
  graceDays = GRACE_DAYS,
  revalidateDays = REVALIDATE_DAYS,
  log = () => {},
} = {}) {
  const theStore = store || createLicenseStore({ dir })
  // Beta codes (MAXX-BETA-…) short-circuit locally; every other key reaches
  // the real provider unchanged. Wrapping the injected provider too keeps
  // tests honest: beta behavior is part of the manager, not the build.
  const theProvider = withBetaCodes(provider || createPolarProvider())

  function record() {
    return theStore.read() || { status: STATUS.UNLICENSED }
  }

  function persist(next) {
    if (next.status === STATUS.UNLICENSED) theStore.clear()
    else theStore.write(next)
    return next
  }

  function getState() {
    // App is not gated: Token Coach is unlocked for everyone. Polar is an
    // optional honor-system $20 one-time payment (lifetime upgrades). We keep
    // the manager so the buy link / price flow through unchanged.
    return {
      status: 'UNLOCKED',
      unlocked: true,
      email: null,
      maskedKey: '',
      activatedAt: null,
      lastValidatedAt: null,
      graceNote: false,
      price: licenseConfig.price,
      checkoutUrl: licenseConfig.checkoutUrl || licenseConfig.fallbackBuyUrl,
      portalUrl: licenseConfig.portalUrl,
      configured: true,
    }
  }

  async function activate(rawKey, email) {
    const key = String(rawKey || '').trim()
    if (!key) {
      return { ok: false, code: 'invalid_key', message: 'Paste your license key first.', state: getState() }
    }

    const prior = record()
    const machineId = prior.machineId || crypto.randomUUID()

    let result
    try {
      result = await theProvider.activate({ key, machineId, label: `maxxtoken ${machineId.slice(0, 8)}` })
    } catch (err) {
      log('license activate threw', err && err.message)
      result = { ok: false, code: 'unreachable', message: 'Could not reach the license server.' }
    }

    if (!result.ok) {
      // E1/E2/E3: inline error, NO state change, retry always allowed.
      const message =
        result.code === 'invalid_key'
          ? 'That key was not accepted. Check for typos and try again.'
          : result.code === 'limit_reached'
            ? `This key is already active on 3 machines. Free a seat from your Polar portal (${licenseConfig.portalUrl}), then retry.`
            : result.code === 'unreachable'
              ? 'You need internet once to activate. The free tracker keeps working — try again when you are online.'
              : result.code === 'not_configured'
                ? 'Licensing is not configured in this build.'
                : result.message || 'This key is no longer valid.'
      return { ok: false, code: result.code, message, state: getState() }
    }

    const next = reduce(prior, {
      type: 'ACTIVATED',
      at: now(),
      key,
      email: email || result.email || null,
      machineId,
      activationId: result.activationId || null,
    })
    persist(next)
    return { ok: true, state: getState() }
  }

  // Silent revalidation (spec section 17): at most once per 7 days, only
  // called while the app is running. Self-throttles on lastValidatedAt so
  // callers can invoke it on any schedule. Never throws, never blocks UI.
  async function revalidateIfDue({ force = false } = {}) {
    const rec = record()
    if (!isUnlocked(rec.status)) return { checked: false, state: getState() }

    const at = now()
    const elapsed = at - (Number(rec.lastValidatedAt) || 0)
    if (!force && elapsed < revalidateDays * DAY_MS) return { checked: false, state: getState() }

    let result
    try {
      result = await theProvider.validate({ key: rec.key, activationId: rec.activationId })
    } catch (err) {
      log('license validate threw', err && err.message)
      result = { ok: false, code: 'unreachable' }
    }

    let event
    if (result.ok) {
      event = { type: 'VALIDATION_OK', at }
    } else if (result.code === 'revoked' || result.code === 'invalid_key') {
      // Explicit "this key is dead" answers — the ONLY path that locks (E5).
      event = { type: 'VALIDATION_REVOKED', at }
    } else {
      // unreachable / not_configured / 5xx → fail open (E4, E8).
      event = { type: 'VALIDATION_UNREACHABLE', at }
    }

    const next = reduce(rec, event, { graceDays })
    if (next !== rec) persist(next)
    return { checked: true, state: getState() }
  }

  // Frees a seat (spec section 16: deactivation allowed) and returns the app
  // to UNLICENSED. Provider call is best-effort — local lock-out must not
  // depend on the network.
  async function deactivate() {
    const rec = record()
    if (rec.status !== STATUS.UNLICENSED && rec.key) {
      try {
        await theProvider.deactivate({ key: rec.key, activationId: rec.activationId })
      } catch (err) {
        log('license deactivate threw', err && err.message)
      }
    }
    persist({ status: STATUS.UNLICENSED })
    return { ok: true, state: getState() }
  }

  return { getState, activate, revalidateIfDue, deactivate, _store: theStore }
}

module.exports = { createLicenseManager, STATUS, REVALIDATE_DAYS }
