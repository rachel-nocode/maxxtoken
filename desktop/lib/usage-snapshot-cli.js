const widgetSnapshot = require('./widget-snapshot')

function usage() {
  return [
    'Usage:',
    '  maxxtoken-usage [overview|providers|tokens|cost] [--json] [--file <snapshot.json>]',
    '',
    'Reads the last MaxxToken widget snapshot. Run a refresh in the app first if it looks stale.',
  ].join('\n')
}

function parseArgs(argv) {
  const args = [...argv]
  if (args[0] === 'usage') args.shift()
  const options = { command: 'overview', file: widgetSnapshot.FILE, json: false }
  const positional = []

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--json') {
      options.json = true
    } else if (arg === '--file') {
      if (!args[i + 1]) throw new Error('Pass a path after --file.')
      options.file = args[i + 1]
      i += 1
    } else {
      positional.push(arg)
    }
  }

  options.command = positional[0] || 'overview'
  return options
}

function money(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 'unknown'
  if (Math.abs(num) < 100) return `$${num.toFixed(2)}`
  return `$${Math.round(num).toLocaleString('en-US')}`
}

function tokens(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 'unknown tokens'
  const abs = Math.abs(num)
  if (abs >= 1_000_000_000) return `${trimNumber(num / 1_000_000_000)}B tokens`
  if (abs >= 1_000_000) return `${trimNumber(num / 1_000_000)}M tokens`
  if (abs >= 1_000) return `${trimNumber(num / 1_000)}K tokens`
  return `${Math.round(num).toLocaleString('en-US')} tokens`
}

function trimNumber(value) {
  return Number(value.toFixed(1)).toLocaleString('en-US')
}

function percent(value) {
  const num = Number(value)
  return Number.isFinite(num) ? `${Math.round(num)}%` : 'unknown'
}

function compactTime(value) {
  if (!value) return 'unknown reset'
  const time = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(time)) return 'unknown reset'
  const diff = time - Date.now()
  if (diff <= 0) return 'reset due'
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(hours / 24)
  if (days > 0) return `resets in ${days}d ${hours % 24}h`
  return `resets in ${hours}h ${Math.floor((diff % 3600000) / 60000)}m`
}

function cycleLabel(snapshot) {
  const label = snapshot?.cycle?.label || 'Current cycle'
  const daysLeft = Number(snapshot?.cycle?.daysLeft)
  return Number.isFinite(daysLeft) ? `${label} - ${Math.round(daysLeft)}d left` : label
}

function normalizeSnapshot(snapshot) {
  const providers = Array.isArray(snapshot?.providers) ? snapshot.providers : []
  return {
    generatedAt: snapshot?.generatedAt || null,
    cycle: snapshot?.cycle || null,
    totals: snapshot?.totals || {},
    rating: snapshot?.rating || null,
    maxxTarget: snapshot?.maxxTarget || null,
    providers,
    enabledProviderIds: Array.isArray(snapshot?.enabledProviderIds) ? snapshot.enabledProviderIds : providers.map((provider) => provider.id),
  }
}

function providersWithTokens(snapshot) {
  return normalizeSnapshot(snapshot).providers.filter((provider) => Number(provider?.tokenUsage?.total) > 0)
}

function overviewText(snapshot) {
  const snap = normalizeSnapshot(snapshot)
  const totals = snap.totals || {}
  const tokenTotals = totals.tokens || {}
  const lines = [
    `MaxxToken - ${cycleLabel(snap)}`,
    `${money(totals.spent)} spent - ${money(totals.left)} left - ${percent(totals.capturedPct)} used - ${totals.planCount || snap.providers.length || 0} providers`,
  ]

  if (Number(tokenTotals.total) > 0) {
    const cost = Number(tokenTotals.costUSD) > 0 ? ` - ${money(tokenTotals.costUSD)} est. cost` : ''
    lines.push(`Token burn: ${tokens(tokenTotals.total)}${cost} - ${tokenTotals.providerCount || providersWithTokens(snap).length} sources`)
  } else {
    lines.push('Token burn: No token source yet')
  }

  if (snap.maxxTarget?.name) {
    const reserve = Number.isFinite(Number(snap.maxxTarget.reservePct)) ? ` - ${percent(snap.maxxTarget.reservePct)} left` : ''
    lines.push(`Next maxx: ${snap.maxxTarget.name}${reserve}`)
  }

  return `${lines.join('\n')}\n`
}

function providerLine(provider) {
  const window = provider.primaryWindow || provider.secondaryWindow || {}
  const pieces = [
    provider.name || provider.id,
    provider.plan || 'plan unknown',
    `${percent(provider.capturedPct)} used`,
    `${money(provider.spentValue)} spent`,
    `${money(provider.leftValue)} left`,
  ]
  if (window.label) pieces.push(`${window.label} ${compactTime(window.resetAt)}`)
  if (provider.tokenUsage?.total) pieces.push(tokens(provider.tokenUsage.total))
  return pieces.join('  ')
}

function providersText(snapshot) {
  const snap = normalizeSnapshot(snapshot)
  if (!snap.providers.length) return 'No connected providers in the last snapshot.\n'
  return `${snap.providers.map(providerLine).join('\n')}\n`
}

function tokenProviderText(provider) {
  const usage = provider.tokenUsage
  const lines = []
  const cost = Number(usage.costUSD) > 0 ? ` - ${money(usage.costUSD)}` : ''
  const pricing = usage.pricingSource ? ` - ${usage.pricingSource} pricing` : ''
  const source = usage.source || provider.sourceLabel || 'token source'
  lines.push(`${provider.name || provider.id}: ${tokens(usage.total)}${cost}${pricing} - ${source}`)

  for (const model of usage.topModels || []) {
    const modelCost = Number(model.costUSD) > 0 ? ` - ${money(model.costUSD)}` : ''
    const modelPricing = model.pricingSource ? ` - ${model.pricingSource}` : ''
    lines.push(`  top: ${model.model} ${tokens(model.total)}${modelCost}${modelPricing}`)
  }

  for (const day of provider.dailyUsage || usage.dailyUsage || []) {
    const dayCost = Number(day.costUSD) > 0 ? ` - ${money(day.costUSD)}` : ''
    lines.push(`  day: ${day.dayKey || 'unknown day'} ${tokens(day.totalTokens)}${dayCost}`)
  }

  return lines.join('\n')
}

function tokensText(snapshot) {
  const snap = normalizeSnapshot(snapshot)
  const tokenTotals = snap.totals.tokens || {}
  const providers = providersWithTokens(snap)

  if (!providers.length) return 'Token burn: No token source yet\n'

  const cost = Number(tokenTotals.costUSD) > 0 ? ` - ${money(tokenTotals.costUSD)} est. cost` : ''
  return [
    `Token burn - ${tokens(tokenTotals.total)}${cost}`,
    providers.map(tokenProviderText).join('\n'),
  ].join('\n') + '\n'
}

function payloadForCommand(command, snapshot) {
  const snap = normalizeSnapshot(snapshot)
  if (command === 'providers') return { generatedAt: snap.generatedAt, providers: snap.providers }
  if (command === 'tokens' || command === 'cost') {
    return {
      generatedAt: snap.generatedAt,
      totals: snap.totals.tokens || null,
      providers: providersWithTokens(snap),
    }
  }
  return snap
}

function textForCommand(command, snapshot) {
  if (command === 'overview') return overviewText(snapshot)
  if (command === 'providers') return providersText(snapshot)
  if (command === 'tokens' || command === 'cost') return tokensText(snapshot)
  if (command === 'help' || command === '--help' || command === '-h') return `${usage()}\n`
  throw new Error(`Unknown command: ${command}`)
}

function run(argv = [], io = {}) {
  const stdout = io.stdout || process.stdout
  const stderr = io.stderr || process.stderr

  try {
    const options = parseArgs(argv)
    if (options.command === 'help' || options.command === '--help' || options.command === '-h') {
      stdout.write(`${usage()}\n`)
      return 0
    }

    const snapshot = widgetSnapshot.readWidgetSnapshot(options.file)
    if (!snapshot) throw new Error(`MaxxToken snapshot is missing or unreadable: ${options.file}`)

    if (options.json) {
      stdout.write(`${JSON.stringify(payloadForCommand(options.command, snapshot), null, 2)}\n`)
    } else {
      stdout.write(textForCommand(options.command, snapshot))
    }
    return 0
  } catch (err) {
    stderr.write(`${err.message || String(err)}\n\n${usage()}\n`)
    return 1
  }
}

function main(argv = process.argv.slice(2)) {
  process.exitCode = run(argv)
}

module.exports = {
  run,
  main,
  usage,
  parseArgs,
  overviewText,
  providersText,
  tokensText,
  _private: {
    money,
    tokens,
    percent,
    cycleLabel,
    payloadForCommand,
    providersWithTokens,
  },
}
