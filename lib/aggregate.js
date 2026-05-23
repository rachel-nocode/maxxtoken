const { loadConfig, billingCycle } = require('./config')
const codex = require('./adapters/codex')
const claude = require('./adapters/claude')
const kimi = require('./adapters/kimi')
const gemini = require('./adapters/gemini')
const grok = require('./adapters/grok')

const DAY = 86400000

function activityState(lastActive) {
  if (!lastActive) return 'none'
  return Date.now() - lastActive < 2 * DAY ? 'live' : 'stale'
}

// A window is "leaking" when it resets soon but is barely used —
// that unused capacity is about to be burned.
function windowUrgent(w) {
  if (!w.resetAt) return false
  const left = w.resetAt - Date.now()
  if (w.kind === '5h') return left < 90 * 60000 && w.usedPct < 50
  return left < 2 * DAY && w.usedPct < 60
}

function nudgeFor(id, capturedPct, urgent) {
  const banks = {
    claude: [
      'Have Claude scope one half-baked app idea into a build plan.',
      'Ask Claude to roast your landing page positioning.',
      'Turn a messy voice note into a launch post.',
    ],
    codex: [
      'Ask Codex to write 3 tests before reset.',
      'Have Codex close one annoying TODO and write the PR notes.',
      'Refactor the ugly helper you keep pretending is fine.',
    ],
    gemini: [
      'Use Gemini to research a competitor for 15 min.',
      'Have Gemini draft a thread from your last build.',
      'Ask Gemini to summarize a long doc you have been avoiding.',
    ],
    kimi: [
      'Point Kimi at a gnarly bug and let it grind.',
      'Have Kimi port a script to another language.',
      'Use Kimi to write docs for an undocumented module.',
    ],
    grok: [
      'Have Grok turn your half-baked idea into a full build plan.',
      'Ask Grok to review the last diff and suggest the next refactor.',
      'Let Grok drive a feature while you steer with high-level prompts.',
    ],
    cursor: ['Run Cursor through one refactor you keep postponing.'],
    chatgpt: ['Brainstorm 5 product experiments for this week.'],
  }
  const bank = banks[id] || ['Use it on something you ship today.']
  let pick = bank[0]
  if (capturedPct != null && capturedPct < 40) pick = bank[bank.length - 1]
  return urgent ? pick + ' A window resets soon.' : pick
}

function withMoney(base, conf, capturedPct) {
  const remainingPct = capturedPct == null ? 100 : Math.max(0, 100 - capturedPct)
  return {
    capturedPct,
    remainingPct,
    capturedValue: capturedPct == null ? 0 : conf.monthly * (capturedPct / 100),
    burnValue: conf.monthly * (remainingPct / 100),
  }
}

async function buildProvider(id, conf, cycle) {
  const base = { id, name: conf.name, plan: conf.plan, monthly: conf.monthly }

  if (id === 'claude' || id === 'kimi') {
    const d = id === 'claude' ? await claude.read() : await kimi.read()
    if (!d.connected) return { ...base, connected: false, activity: 'none' }
    const weekly = d.windows.find((w) => w.label === 'Weekly')
    const session = d.windows.find((w) => w.label === 'Session')
    const capturedPct = weekly ? weekly.usedPct : session ? session.usedPct : null
    const urgent = d.windows.some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.plan || conf.plan,
      ...withMoney(base, conf, capturedPct),
      windows: d.windows,
      extra: d.extra || [],
      resetAt: weekly ? weekly.resetAt : session ? session.resetAt : cycle.endMs,
      resetKind: 'weekly',
      urgent,
      activity: d.error ? 'stale' : 'live',
      error: d.error || null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'codex') {
    const d = await codex.read()
    if (!d.connected) return { ...base, connected: false, activity: 'none' }
    const weekly = (d.windows || []).find((w) => w.label === 'Weekly')
    const session = (d.windows || []).find((w) => w.label === 'Session')
    const capturedPct = weekly ? weekly.usedPct : session ? session.usedPct : 0
    const urgent = (d.windows || []).some(windowUrgent)
    return {
      ...base,
      connected: true,
      plan: d.planType ? d.planType[0].toUpperCase() + d.planType.slice(1) : conf.plan,
      ...withMoney(base, conf, capturedPct),
      windows: d.windows || [],
      extra: d.extra || [],
      resetAt: weekly ? weekly.resetAt : session ? session.resetAt : cycle.endMs,
      resetKind: 'weekly',
      urgent,
      activity: activityState(d.lastActive),
      error: d.error || null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'gemini') {
    const d = gemini.read(cycle)
    if (!d.connected) return { ...base, connected: false, activity: 'none' }
    const capturedPct = Math.min(100, Math.round((d.activeDays / cycle.daysElapsed) * 100))
    const urgent = cycle.daysLeft <= 3 && capturedPct < 70
    return {
      ...base,
      connected: true,
      ...withMoney(base, conf, capturedPct),
      windows: [],
      extra: [
        { label: 'Sessions', value: String(d.sessions) },
        { label: 'Active days', value: `${d.activeDays} / ${cycle.daysElapsed}` },
      ],
      resetAt: cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: activityState(d.lastActive),
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  if (id === 'grok') {
    const d = grok.read(cycle)
    if (!d.connected) return { ...base, connected: false, activity: 'none' }
    const capturedPct = Math.min(100, Math.round((d.activeDays / cycle.daysElapsed) * 100))
    const urgent = cycle.daysLeft <= 3 && capturedPct < 70
    return {
      ...base,
      connected: true,
      ...withMoney(base, conf, capturedPct),
      windows: [],
      extra: [
        { label: 'Sessions', value: String(d.sessions) },
        { label: 'Active days', value: `${d.activeDays} / ${cycle.daysElapsed}` },
      ],
      resetAt: cycle.endMs,
      resetKind: 'cycle',
      urgent,
      activity: activityState(d.lastActive),
      error: null,
      nudge: nudgeFor(id, capturedPct, urgent),
    }
  }

  return { ...base, connected: false, activity: 'none', manual: true }
}

function maxxRating(avg) {
  if (avg >= 0.9) return { stars: 5, verdict: 'Elite maxxer. Big AI fears you.' }
  if (avg >= 0.72) return { stars: 4, verdict: 'Solid maxxing. Ship harder.' }
  if (avg >= 0.55) return { stars: 3, verdict: 'Decent. Resets are watching.' }
  if (avg >= 0.35) return { stars: 2, verdict: 'Leaking value. Pick a mission.' }
  return { stars: 1, verdict: 'Donating to Big AI. Fix it.' }
}

async function snapshot() {
  const config = loadConfig()
  const cycle = billingCycle(config.billingDay)

  const enabled = Object.entries(config.providers).filter(([, c]) => c.enabled)
  const providers = await Promise.all(enabled.map(([id, c]) => buildProvider(id, c, cycle)))

  const billable = providers.filter((p) => p.connected || p.manual)
  const tracked = billable.filter((p) => p.connected && p.capturedPct != null)
  const monthly = billable.reduce((s, p) => s + p.monthly, 0)
  const captured = tracked.reduce((s, p) => s + (p.capturedValue || 0), 0)
  const trackedMonthly = tracked.reduce((s, p) => s + p.monthly, 0)
  const burned = monthly - captured
  const remaining = burned
  const avg = trackedMonthly ? captured / trackedMonthly : 0

  return {
    generatedAt: Date.now(),
    cycle: { label: cycle.label, daysLeft: cycle.daysLeft, totalDays: cycle.totalDays },
    totals: {
      monthly,
      captured,
      burned,
      remaining,
      capturedPct: monthly ? Math.round((captured / monthly) * 100) : 0,
      remainingPct: monthly ? Math.max(0, 100 - Math.round((captured / monthly) * 100)) : 100,
      planCount: billable.length,
    },
    rating: maxxRating(avg),
    providers,
  }
}

module.exports = { snapshot }
