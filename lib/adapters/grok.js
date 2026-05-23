const fs = require('fs')
const os = require('os')
const path = require('path')

const GROK = path.join(os.homedir(), '.grok')

// Grok Build CLI stores auth in auth.json and per-project sessions under
// ~/.grok/sessions/<encoded-cwd>/<session-uuid>/summary.json (with last_active_at).
// We infer "usage" the same way Gemini does: active days within the billing cycle.
function read(cycle) {
  let exists = false
  try {
    exists = fs.existsSync(path.join(GROK, 'auth.json'))
  } catch {
    return { connected: false }
  }
  if (!exists) return { connected: false }

  const activeDays = new Set()
  let lastActive = 0
  let sessions = 0

  // Walk project session directories
  const sessionsDir = path.join(GROK, 'sessions')
  let projects
  try {
    projects = fs.readdirSync(sessionsDir, { withFileTypes: true })
  } catch {
    // No sessions yet is fine — still connected via auth.json
  }

  if (projects) {
    for (const p of projects) {
      if (!p.isDirectory()) continue
      const projDir = path.join(sessionsDir, p.name)
      let sessEntries
      try {
        sessEntries = fs.readdirSync(projDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const s of sessEntries) {
        if (!s.isDirectory()) continue
        const sessDir = path.join(projDir, s.name)
        const summaryPath = path.join(sessDir, 'summary.json')
        try {
          const stat = fs.statSync(summaryPath)
          const m = stat.mtimeMs
          if (m >= cycle.startMs) {
            activeDays.add(new Date(m).toDateString())
            if (m > lastActive) lastActive = m
            sessions++
          }
        } catch {
          // summary may not exist for very new sessions; fall back to dir mtime
          try {
            const dirStat = fs.statSync(sessDir)
            const m = dirStat.mtimeMs
            if (m >= cycle.startMs) {
              activeDays.add(new Date(m).toDateString())
              if (m > lastActive) lastActive = m
              sessions++
            }
          } catch {}
        }
      }
    }
  }

  // Also count activity from the unified log (catches CLI invocations even without full sessions)
  const logPath = path.join(GROK, 'logs', 'unified.jsonl')
  try {
    const stat = fs.statSync(logPath)
    const m = stat.mtimeMs
    if (m >= cycle.startMs) {
      activeDays.add(new Date(m).toDateString())
      if (m > lastActive) lastActive = m
    }
  } catch {}

  return {
    connected: true,
    sessions,
    activeDays: activeDays.size,
    lastActive: lastActive || null,
  }
}

module.exports = { read }
