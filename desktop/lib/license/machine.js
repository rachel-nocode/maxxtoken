// License state machine (licensing spec section 17). Pure and synchronous:
// reduce(record, event) returns a new record — no I/O, no clocks of its own
// (every event carries its own `at` timestamp so tests drive a fake clock).
//
//   UNLICENSED → (key activated) → LICENSED
//   LICENSED → (revalidation says revoked/refunded) → REVOKED
//   LICENSED → (revalidation unreachable > grace period) → GRACE
//   GRACE → (successful revalidation) → LICENSED
//   GRACE → (grace expired, still unreachable) → stays GRACE
//
// Hard constraint (spec principle 4): unreachable NEVER locks. Only an
// explicit revoked/refunded answer from the validation API moves to REVOKED.

const STATUS = {
  UNLICENSED: 'UNLICENSED',
  LICENSED: 'LICENSED',
  GRACE: 'GRACE',
  REVOKED: 'REVOKED',
}

const DAY_MS = 86_400_000
const GRACE_DAYS = 30

const EMPTY_RECORD = Object.freeze({ status: STATUS.UNLICENSED })

// Paid features unlock in LICENSED and GRACE — GRACE differs only by the
// small "couldn't verify license" note in Settings.
function isUnlocked(status) {
  return status === STATUS.LICENSED || status === STATUS.GRACE
}

// Events:
//   { type: 'ACTIVATED', at, key, email, machineId, activationId }
//   { type: 'VALIDATION_OK', at }
//   { type: 'VALIDATION_REVOKED', at }
//   { type: 'VALIDATION_UNREACHABLE', at }
//   { type: 'RECORD_DELETED' }
function reduce(record, event, { graceDays = GRACE_DAYS } = {}) {
  const rec = record && record.status ? record : EMPTY_RECORD
  if (!event || !event.type) return rec

  switch (event.type) {
    case 'ACTIVATED':
      return {
        key: event.key,
        email: event.email || null,
        activatedAt: event.at,
        lastValidatedAt: event.at,
        status: STATUS.LICENSED,
        machineId: event.machineId,
        activationId: event.activationId || null,
      }

    case 'RECORD_DELETED':
      return { ...EMPTY_RECORD }

    case 'VALIDATION_OK':
      if (rec.status === STATUS.UNLICENSED) return rec
      // GRACE → LICENSED, LICENSED stays, and a REVOKED key that validates
      // again (e.g. Polar re-enabled it) recovers too.
      return { ...rec, status: STATUS.LICENSED, lastValidatedAt: event.at }

    case 'VALIDATION_REVOKED':
      if (rec.status === STATUS.UNLICENSED) return rec
      // The only path that locks: an explicit revoked/refunded/disabled
      // answer from the API.
      return { ...rec, status: STATUS.REVOKED }

    case 'VALIDATION_UNREACHABLE': {
      if (rec.status !== STATUS.LICENSED) return rec // GRACE stays GRACE forever
      const last = Number(rec.lastValidatedAt) || 0
      const at = Number(event.at) || 0
      // E6 clock tampering: a clock that moved backwards can't push us into
      // GRACE — elapsed below is negative and the check simply doesn't fire.
      const elapsed = at - last
      if (elapsed > graceDays * DAY_MS) return { ...rec, status: STATUS.GRACE }
      return rec
    }

    default:
      return rec
  }
}

module.exports = { STATUS, reduce, isUnlocked, EMPTY_RECORD, GRACE_DAYS, DAY_MS }
