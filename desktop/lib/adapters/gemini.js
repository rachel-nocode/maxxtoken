const fs = require('fs')
const os = require('os')
const path = require('path')

const GEM = path.join(os.homedir(), '.gemini')

// Gemini CLI keeps no token ledger locally, so activity is inferred from
// per-project history/tmp directory mtimes within the billing cycle.
function read(cycle) {
  let exists = false
  try {
    exists = fs.existsSync(path.join(GEM, 'oauth_creds.json'))
  } catch {
    return { connected: false }
  }
  if (!exists) return { connected: false }

  const activeDays = new Set()
  let lastActive = 0
  let sessions = 0

  for (const sub of ['history', 'tmp']) {
    const base = path.join(GEM, sub)
    let entries
    try {
      entries = fs.readdirSync(base, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const full = path.join(base, e.name)
      const walk = (dir) => {
        let kids
        try {
          kids = fs.readdirSync(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const k of kids) {
          const kp = path.join(dir, k.name)
          if (k.isDirectory()) walk(kp)
          else {
            const m = fs.statSync(kp).mtimeMs
            if (m >= cycle.startMs) {
              activeDays.add(new Date(m).toDateString())
              if (m > lastActive) lastActive = m
              sessions++
            }
          }
        }
      }
      walk(full)
    }
  }

  return {
    connected: true,
    sessions,
    activeDays: activeDays.size,
    lastActive: lastActive || null,
  }
}

module.exports = { read }
