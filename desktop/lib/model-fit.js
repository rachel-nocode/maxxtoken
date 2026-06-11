const { estimateMissionPreflight } = require('./preflight-estimate')

const DAY_MS = 86400000
const RESERVE_PCT = 40
const SPEND_RESET_MS = 48 * 60 * 60 * 1000
const SAVE_PROJECTED_PCT = 115

function clean(value) {
  return String(value || '').trim()
}

function pct(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
}

function fmtReset(resetAt, now) {
  const diff = Number(resetAt) - Number(now || Date.now())
  if (!Number.isFinite(diff) || diff <= 0) return 'soon'
  const mins = Math.floor(diff / 60000)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}h`
  return `${hours}h ${String(mins % 60).padStart(2, '0')}m`
}

function selectedModels(models) {
  return (Array.isArray(models) ? models : []).filter((model) => model && (model.selected === true || model.id))
}

function missingInputs(dir, goal, models) {
  const missing = []
  if (!dir) missing.push('folder')
  if (!goal) missing.push('goal')
  if (!models.length) missing.push('model')
  return missing
}

function providers(snapshot) {
  return Array.isArray(snapshot && snapshot.providers) ? snapshot.providers : []
}

function providerFor(snapshot, model) {
  return providers(snapshot).find((provider) => provider.id === model.id) || null
}

function windows(provider) {
  return Array.isArray(provider && provider.windows) ? provider.windows : []
}

function sessionWindow(provider) {
  return (
    windows(provider).find((w) => w.kind === '5h') ||
    windows(provider).find((w) => /session|5\s*[- ]?\s*hour/i.test(`${w.label || ''} ${w.kind || ''}`)) ||
    null
  )
}

function weeklyWindow(provider) {
  return (
    windows(provider).find((w) => w.kind === '7d') ||
    windows(provider).find((w) => /week/i.test(`${w.label || ''} ${w.kind || ''}`)) ||
    null
  )
}

function soonestResetAt(provider, now) {
  const resets = windows(provider)
    .map((w) => Number(w.resetAt))
    .filter((value) => Number.isFinite(value) && value > now)
  const own = Number(provider && provider.resetAt)
  if (Number.isFinite(own) && own > now) resets.push(own)
  return resets.length ? Math.min(...resets) : null
}

function projectedAtReset(provider) {
  let projected = null
  for (const window of windows(provider)) {
    const value = Number(window && window.pace && window.pace.projectedAtResetPercent)
    if (Number.isFinite(value)) projected = Math.max(projected || 0, value)
  }
  return projected
}

function expectedUsed(provider, now) {
  const wk = weeklyWindow(provider)
  if (wk && Number.isFinite(Number(wk.pace && wk.pace.expectedUsedPercent))) {
    return pct(wk.pace.expectedUsedPercent)
  }
  const resetAt = Number(wk && wk.resetAt)
  if (!Number.isFinite(resetAt) || resetAt <= now) return null
  const elapsed = Math.max(0, 7 * DAY_MS - (resetAt - now))
  return pct((elapsed / (7 * DAY_MS)) * 100)
}

function usageCost(provider) {
  const usage = provider && provider.tokenUsage
  const cost = Number(usage && usage.costUSD)
  if (Number.isFinite(cost) && cost > 0) return cost
  const input = Number(usage && usage.input) || 0
  const cached = Number(usage && usage.cached) || 0
  const output = Number(usage && usage.output) || 0
  const estimated = input * 0.00000125 + cached * 0.000000125 + output * 0.00001
  return estimated > 0 ? estimated : null
}

function balanceState(provider, estimate, now) {
  const session = sessionWindow(provider)
  const weekly = weeklyWindow(provider)
  const resetAt = soonestResetAt(provider, now)
  const projected = projectedAtReset(provider)
  const highWindowPct = Number(estimate && estimate.estimate && estimate.estimate.highWindowPct) || 0
  const sessionFree = 100 - pct(session && session.usedPct)
  const reserveAfter = session ? sessionFree - highWindowPct : null
  if ((projected != null && projected >= SAVE_PROJECTED_PCT) || (session && reserveAfter < RESERVE_PCT)) {
    return {
      state: 'save',
      reason: session && reserveAfter < RESERVE_PCT
        ? `This task could leave about ${Math.max(0, Math.round(reserveAfter))}% session reserve.`
        : `Current pace projects ${Math.round(projected)}% by reset.`,
      resetAt,
      resetLabel: resetAt ? fmtReset(resetAt, now) : 'unknown',
    }
  }

  const weeklyUsed = pct(weekly && weekly.usedPct)
  const expected = expectedUsed(provider, now)
  if (
    weekly &&
    weekly.resetAt &&
    weekly.resetAt - now > 0 &&
    weekly.resetAt - now <= SPEND_RESET_MS &&
    (expected == null ? weeklyUsed <= 40 : weeklyUsed + 15 < expected)
  ) {
    return {
      state: 'spend',
      reason: `Behind pace with ${fmtReset(weekly.resetAt, now)} until weekly reset.`,
      resetAt: weekly.resetAt,
      resetLabel: fmtReset(weekly.resetAt, now),
    }
  }

  return {
    state: 'balanced',
    reason: 'Enough quota for routine work.',
    resetAt,
    resetLabel: resetAt ? fmtReset(resetAt, now) : 'unknown',
  }
}

function scoreProvider(model, provider, estimate, balance) {
  let score = 50
  const reasons = []
  const cautions = []
  const session = sessionWindow(provider)
  const weekly = weeklyWindow(provider)
  const highWindowPct = Number(estimate && estimate.estimate && estimate.estimate.highWindowPct) || 0

  if (provider && provider.connected !== false) {
    score += 15
    reasons.push('Connected and available.')
  } else {
    score -= 30
    cautions.push('Not connected yet.')
  }

  if (session) {
    const free = 100 - pct(session.usedPct)
    const reserveAfter = free - highWindowPct
    if (reserveAfter >= RESERVE_PCT) {
      score += 20
      reasons.push(`Leaves about ${Math.round(reserveAfter)}% session reserve.`)
    } else {
      score -= 35
      cautions.push(`Low reserve after this task: about ${Math.max(0, Math.round(reserveAfter))}%.`)
    }
  }

  if (balance.state === 'spend') {
    score += 18
    reasons.push('Good use of quota before reset.')
  } else if (balance.state === 'save') {
    score -= 25
    cautions.push(balance.reason)
  }

  if (weekly && pct(weekly.usedPct) < 55) score += 8

  const cost = usageCost(provider)
  if (cost != null && cost <= 3) {
    score += 5
    reasons.push('Recent cost pattern is light.')
  } else if (cost != null && cost >= 10) {
    score -= 5
    cautions.push('Recent cost pattern is heavier.')
  }

  if (model.supportsPrompt) score += 3

  return {
    providerId: model.id,
    providerName: (provider && provider.name) || model.name || model.id,
    rank: 0,
    label: 'Candidate',
    score: Math.max(0, Math.round(score)),
    tone: balance.state === 'save' ? 'warn' : balance.state === 'spend' ? 'lime' : 'neutral',
    reasons: reasons.slice(0, 3),
    cautions: cautions.slice(0, 3),
    action: balance.state === 'save' ? 'Save for higher-priority work' : 'Use for this job',
  }
}

function recommendModelFit(input = {}) {
  const dir = clean(input.dir || input.folder)
  const goal = clean(input.goal)
  const models = selectedModels(input.models)
  const missing = missingInputs(dir, goal, models)
  if (missing.length) return { ok: false, missing }

  const now = Number(input.now) || Date.now()
  const snapshot = input.snapshot || {}
  const rows = []
  const balances = []
  let firstEstimate = null

  for (const model of models) {
    const provider = providerFor(snapshot, model) || { id: model.id, name: model.name, connected: false, windows: [] }
    const estimate = estimateMissionPreflight({
      dir,
      goal,
      modelIds: [model.id],
      models: [{ ...model, selected: true }],
      snapshot,
      now,
    })
    if (!estimate.ok) return estimate
    if (!firstEstimate) firstEstimate = estimate
    const balance = balanceState(provider, estimate, now)
    balances.push({
      providerId: model.id,
      providerName: provider.name || model.name || model.id,
      ...balance,
    })
    rows.push(scoreProvider(model, provider, estimate, balance))
  }

  rows.sort((a, b) => b.score - a.score || a.providerName.localeCompare(b.providerName))
  rows.forEach((row, index) => {
    row.rank = index + 1
    row.label = index === 0 ? 'Best pick' : index === 1 ? 'Backup pick' : row.tone === 'warn' ? 'Avoid for now' : 'Candidate'
  })

  return {
    ok: true,
    estimate: firstEstimate,
    recommendations: rows,
    balance: balances,
  }
}

module.exports = {
  recommendModelFit,
  _private: {
    balanceState,
    scoreProvider,
    sessionWindow,
    weeklyWindow,
    fmtReset,
  },
}
