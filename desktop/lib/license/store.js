// Local license record (licensing spec section 18). Plaintext JSON in the
// app data dir per principle 3 — one honest gate, no over-engineering.
// Writes are synchronous + atomic (pid-suffixed tmp + rename), the same
// pattern that fixed the torn usage-history writes (DATA_GAPS G3).
//
// macOS:   ~/Library/Application Support/maxxtoken/license.json
// Windows: %APPDATA%/maxxtoken/license.json
// Linux:   ~/.config/maxxtoken/license.json

const fs = require('fs')
const path = require('path')

const FILE_NAME = 'license.json'

function createLicenseStore({ dir, file } = {}) {
  const target = file || path.join(dir, FILE_NAME)

  return {
    file: target,

    read() {
      try {
        const parsed = JSON.parse(fs.readFileSync(target, 'utf8'))
        if (!parsed || typeof parsed !== 'object' || typeof parsed.status !== 'string') return null
        return parsed
      } catch {
        // Missing or corrupted file = no license (spec E7: user deleted it →
        // UNLICENSED; re-pasting the key re-activates).
        return null
      }
    },

    write(record) {
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true })
        const tmp = `${target}.${process.pid}.tmp`
        fs.writeFileSync(tmp, JSON.stringify(record, null, 2))
        fs.renameSync(tmp, target)
        return true
      } catch {
        return false
      }
    },

    clear() {
      try {
        fs.unlinkSync(target)
      } catch {
        /* already gone */
      }
    },
  }
}

module.exports = { createLicenseStore, FILE_NAME }
