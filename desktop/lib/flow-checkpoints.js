const path = require('path')

const MAX_CHECKPOINTS = 20
const RESERVE_PCT = 40

function clean(value, max = 2000) {
  return String(value == null ? '' : value)
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

function titleFromGoal(goal) {
  const first = clean(goal, 180).split(/\n+/)[0] || 'Saved flow'
  return first.length > 80 ? `${first.slice(0, 77)}...` : first
}

function compactPath(dir) {
  const value = clean(dir, 500)
  return value || ''
}

function resetLabel(resetAt, now = Date.now()) {
  const ms = Number(resetAt) - now
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const mins = Math.floor(ms / 60000)
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  if (hours > 0) return `${hours}H ${rem}M`
  return `${rem}M`
}

function sessionWindow(provider) {
  const windows = Array.isArray(provider && provider.windows) ? provider.windows : []
  return (
    windows.find((w) => w.kind === '5h') ||
    windows.find((w) => /5\s*[- ]?\s*hour|session/i.test(`${w.kind || ''} ${w.label || ''}`)) ||
    null
  )
}

function providerName(provider) {
  return clean(provider && (provider.name || provider.id), 80)
}

function flowRecommendation(snapshot, opts = {}) {
  const now = opts.now || Date.now()
  const reservePct = Number.isFinite(Number(opts.reservePct)) ? Number(opts.reservePct) : RESERVE_PCT
  const providers = Array.isArray(snapshot && snapshot.providers) ? snapshot.providers : []
  const candidates = providers
    .filter((p) => p && p.connected !== false)
    .map((provider) => {
      const window = sessionWindow(provider)
      if (!window) return null
      const usedPct = Math.max(0, Math.min(100, Math.round(Number(window.usedPct) || 0)))
      const freePct = Math.max(0, 100 - usedPct)
      return {
        provider,
        window,
        usedPct,
        freePct,
        resetAt: window.resetAt || provider.resetAt || null,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.freePct - b.freePct)

  const tight = candidates.find((item) => item.freePct < reservePct)
  if (!tight) {
    return {
      recommended: false,
      reservePct,
      summary: `Flow Mode appears when a 5-hour window drops under ${reservePct}% free.`,
    }
  }

  const reset = resetLabel(tight.resetAt, now)
  const name = providerName(tight.provider)
  return {
    recommended: true,
    reservePct,
    providerId: tight.provider.id || '',
    providerName: name,
    usedPct: tight.usedPct,
    freePct: tight.freePct,
    resetAt: tight.resetAt,
    resetLabel: reset,
    summary: `${name} has ${tight.freePct}% free${reset ? ` until ${reset}` : ''}. Save a pickup point now.`,
  }
}

function buildResumePrompt(data) {
  const dir = compactPath(data.dir)
  const goal = clean(data.goal, 1200)
  const changed = clean(data.changed, 1200)
  const nextStep = clean(data.nextStep, 1000)
  const notes = clean(data.notes, 1000)
  const verify = dir ? `Run the project's normal verification in ${dir}.` : 'Run the project verification command before calling the work done.'

  return `FLOW MODE RESUME

Do not assume prior hidden chat context. Use this checkpoint as the source of truth.

PROJECT:
${dir || 'No folder selected'}

GOAL:
${goal || 'Continue the saved work.'}

WHAT CHANGED:
${changed || 'No change summary saved.'}

NEXT STEP:
${nextStep || 'Inspect the project and continue from the goal.'}

NOTES:
${notes || 'No blockers saved.'}

VERIFY:
${verify}`
}

function buildFlowCheckpoint(input = {}, opts = {}) {
  const now = Number(input.createdAt) || opts.now || Date.now()
  const data = {
    id: clean(input.id, 80) || `${now}-${Math.random().toString(16).slice(2, 8)}`,
    title: clean(input.title, 120) || titleFromGoal(input.goal),
    dir: compactPath(input.dir),
    folderName: clean(input.folderName, 120) || (input.dir ? path.basename(String(input.dir)) : ''),
    goal: clean(input.goal, 2000),
    changed: clean(input.changed, 2000),
    nextStep: clean(input.nextStep, 1600),
    notes: clean(input.notes, 1600),
    providerId: clean(input.providerId, 80),
    providerName: clean(input.providerName, 80),
    windowResetAt: Number(input.windowResetAt) || null,
    createdAt: now,
  }
  return {
    ...data,
    resumePrompt: clean(input.resumePrompt, 5000) || buildResumePrompt(data),
  }
}

function normalizeFlowCheckpoints(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item) => buildFlowCheckpoint(item))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_CHECKPOINTS)
}

module.exports = {
  MAX_CHECKPOINTS,
  RESERVE_PCT,
  buildFlowCheckpoint,
  buildResumePrompt,
  normalizeFlowCheckpoints,
  flowRecommendation,
  _private: { clean, resetLabel, sessionWindow },
}
