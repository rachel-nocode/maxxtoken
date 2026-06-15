// Beta unlock codes — free lifetime unlocks for beta testers, no Polar
// involvement. A beta code is a normal license key from the manager's point
// of view: `withBetaCodes` wraps any LicenseProvider and intercepts keys
// carrying the MAXX-BETA- prefix, verifying them locally against a SHA-256
// allowlist. Everything else passes through to the wrapped provider
// untouched, so paid Polar keys behave exactly as before.
//
// Only hashes ship in the binary — the plaintext codes live outside the
// repo's build output (token-coach-beta-codes.html, handed out by Rachel).
// Verification is fully local, so beta machines activate and revalidate
// offline; revoking the whole batch just means removing hashes in the next
// release.

const crypto = require('crypto')

const BETA_PREFIX = 'MAXX-BETA-'

// sha256(normalized code), one per handed-out beta code. Batch of 2026-06-12.
const BETA_KEY_HASHES = new Set([
  '35f8df4361318805673164823f3f66ef91586a29180e02bd89f5ecf31af62cf0',
  'd2626fc0570a109725efc8881a8807a7afbceb9111630183fa998c80e0eeb67d',
  '49865459be3b93e267be97a8609a24c18a70f1e6469e617474154507aecedc93',
  '71edc1ef495dcbb405cefdad70829bd7d0d21ecb1518ae69ec8575b14affac55',
  '261d8cbe80f79f26550779f34bd5ddafcb4d58bbbd26619ec382fff17abbde3b',
  'c50f79dd4603aa0610d6dbc192a669d90ddfc2f8830559ac6db37e76015ae9c9',
  '4bbc20409ad64b2ca1fac0bdec87ef9ac212b96bf74c713e9bc2e55b9e113791',
  '0da68bb3a06ae81e65dba3523fcd0ceaaeccade6a7f4090c6d3ebb2aaa604fa6',
  '171e3d32c4e77c0700292d93307d41b919892e2eec9baaf3d4f0f56d135b7041',
  'b2247dceb3c601d496c93d855936299761de43db48a959fd6dfeda88852a85b6',
  '90d2954f8686b6892f31eb53cc4724096ae9e0fca227d9b579a4e9e89a8b7f14',
  '66d11949dd729db8e5eed2694ec3c7ceceb318260ef007f7d1ed30b2a7350d9c',
  '66ac28b34521be80091bee5d2dd9b2d9bab2be8a69036aba19b49011217396ee',
  '6ed48b68c099c2ee156389f4d7aae636ed0c5b905689e4a26013f2a5bd7b9ff7',
  'cbff2f3ce9dcf34209bc32f76c8f6675553dda86a0a3b5d7f034c6ec5e1b7715',
  'de7db08f4f4d3d7b95b087e4dea01a7ba782e711bca2f45cf2c400ccb40b3195',
  'bf7e7938fb06665e16e0f35878f46eaaf2a5500d89d033a3c1c4b6ea7e030cdd',
  'ad5f33d406ac0e6057d9221ed597588a52976c8d3e7e176be15510df06e7754b',
  '3dec82413bb8e00d35bb313b6b17a66139bc64e8ab4fbbc97d5898b641ac4fba',
  '5b9f8b2b5cd66db1d06da2cdbefa7062d1c881c2ba8bb53b5fa3307794151806',
])

// Case/whitespace-insensitive: testers paste from email, chat, screenshots.
function normalize(key) {
  return String(key || '').trim().toUpperCase()
}

function isBetaKey(key) {
  return normalize(key).startsWith(BETA_PREFIX)
}

function verifyBetaKey(key) {
  const hash = crypto.createHash('sha256').update(normalize(key)).digest('hex')
  return BETA_KEY_HASHES.has(hash)
}

const rejected = () => ({
  ok: false,
  code: 'invalid_key',
  message: 'That beta code was not recognized. Check for typos and try again.',
})

function withBetaCodes(provider) {
  return {
    name: `${provider.name || 'provider'}+beta`,

    async activate(args) {
      if (!isBetaKey(args && args.key)) return provider.activate(args)
      return verifyBetaKey(args.key) ? { ok: true, activationId: 'beta', email: null } : rejected()
    },

    // Local check means beta machines revalidate fine offline — a beta key
    // can never hit 'unreachable' or drift into GRACE.
    async validate(args) {
      if (!isBetaKey(args && args.key)) return provider.validate(args)
      return verifyBetaKey(args.key) ? { ok: true } : rejected()
    },

    async deactivate(args) {
      if (!isBetaKey(args && args.key)) return provider.deactivate(args)
      return { ok: true } // nothing to free server-side
    },
  }
}

module.exports = { withBetaCodes, isBetaKey, verifyBetaKey, BETA_PREFIX }
