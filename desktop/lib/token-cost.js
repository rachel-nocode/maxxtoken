const modelsDev = require('./models-dev-pricing')

const CLAUDE_PRICES = new Map([
  ['claude-haiku-4-5', { input: 1e-6, output: 5e-6, cacheCreation: 1.25e-6, cacheRead: 1e-7 }],
  ['claude-haiku-4-5-20251001', { input: 1e-6, output: 5e-6, cacheCreation: 1.25e-6, cacheRead: 1e-7 }],
  ['claude-opus-4-5', { input: 5e-6, output: 2.5e-5, cacheCreation: 6.25e-6, cacheRead: 5e-7 }],
  ['claude-opus-4-5-20251101', { input: 5e-6, output: 2.5e-5, cacheCreation: 6.25e-6, cacheRead: 5e-7 }],
  ['claude-opus-4-6', { input: 5e-6, output: 2.5e-5, cacheCreation: 6.25e-6, cacheRead: 5e-7 }],
  ['claude-opus-4-6-20260205', { input: 5e-6, output: 2.5e-5, cacheCreation: 6.25e-6, cacheRead: 5e-7 }],
  ['claude-opus-4-7', { input: 5e-6, output: 2.5e-5, cacheCreation: 6.25e-6, cacheRead: 5e-7 }],
  ['claude-sonnet-4-5', {
    input: 3e-6,
    output: 1.5e-5,
    cacheCreation: 3.75e-6,
    cacheRead: 3e-7,
    threshold: 200000,
    above: { input: 6e-6, output: 2.25e-5, cacheCreation: 7.5e-6, cacheRead: 6e-7 },
  }],
  ['claude-sonnet-4-6', {
    input: 3e-6,
    output: 1.5e-5,
    cacheCreation: 3.75e-6,
    cacheRead: 3e-7,
    threshold: 200000,
    above: { input: 6e-6, output: 2.25e-5, cacheCreation: 7.5e-6, cacheRead: 6e-7 },
  }],
  ['claude-sonnet-4-5-20250929', {
    input: 3e-6,
    output: 1.5e-5,
    cacheCreation: 3.75e-6,
    cacheRead: 3e-7,
    threshold: 200000,
    above: { input: 6e-6, output: 2.25e-5, cacheCreation: 7.5e-6, cacheRead: 6e-7 },
  }],
  ['claude-sonnet-4-20250514', {
    input: 3e-6,
    output: 1.5e-5,
    cacheCreation: 3.75e-6,
    cacheRead: 3e-7,
    threshold: 200000,
    above: { input: 6e-6, output: 2.25e-5, cacheCreation: 7.5e-6, cacheRead: 6e-7 },
  }],
  ['claude-opus-4-20250514', { input: 1.5e-5, output: 7.5e-5, cacheCreation: 1.875e-5, cacheRead: 1.5e-6 }],
  ['claude-opus-4-1', { input: 1.5e-5, output: 7.5e-5, cacheCreation: 1.875e-5, cacheRead: 1.5e-6 }],
])

const CODEX_PRICES = new Map([
  ['gpt-5', { input: 1.25e-6, output: 1e-5, cacheRead: 1.25e-7 }],
  ['gpt-5-codex', { input: 1.25e-6, output: 1e-5, cacheRead: 1.25e-7 }],
  ['gpt-5-mini', { input: 2.5e-7, output: 2e-6, cacheRead: 2.5e-8 }],
  ['gpt-5-nano', { input: 5e-8, output: 4e-7, cacheRead: 5e-9 }],
  ['gpt-5-pro', { input: 1.5e-5, output: 1.2e-4 }],
  ['gpt-5.1', { input: 1.25e-6, output: 1e-5, cacheRead: 1.25e-7 }],
  ['gpt-5.1-codex', { input: 1.25e-6, output: 1e-5, cacheRead: 1.25e-7 }],
  ['gpt-5.1-codex-max', { input: 1.25e-6, output: 1e-5, cacheRead: 1.25e-7 }],
  ['gpt-5.1-codex-mini', { input: 2.5e-7, output: 2e-6, cacheRead: 2.5e-8 }],
  ['gpt-5.2', { input: 1.75e-6, output: 1.4e-5, cacheRead: 1.75e-7 }],
  ['gpt-5.2-codex', { input: 1.75e-6, output: 1.4e-5, cacheRead: 1.75e-7 }],
  ['gpt-5.2-pro', { input: 2.1e-5, output: 1.68e-4 }],
  ['gpt-5.3-codex', { input: 1.75e-6, output: 1.4e-5, cacheRead: 1.75e-7 }],
  ['gpt-5.3-codex-spark', { input: 0, output: 0, cacheRead: 0, label: 'Research Preview' }],
  ['gpt-5.4', {
    input: 2.5e-6,
    output: 1.5e-5,
    cacheRead: 2.5e-7,
    threshold: 272000,
    above: { input: 5e-6, output: 2.25e-5, cacheRead: 5e-7 },
  }],
  ['gpt-5.4-mini', { input: 7.5e-7, output: 4.5e-6, cacheRead: 7.5e-8 }],
  ['gpt-5.4-nano', { input: 2e-7, output: 1.25e-6, cacheRead: 2e-8 }],
  ['gpt-5.4-pro', { input: 3e-5, output: 1.8e-4 }],
  ['gpt-5.5', {
    input: 5e-6,
    output: 3e-5,
    cacheRead: 5e-7,
    threshold: 272000,
    above: { input: 1e-5, output: 4.5e-5, cacheRead: 1e-6 },
  }],
  ['gpt-5.5-pro', { input: 3e-5, output: 1.8e-4 }],
])

const GROK_PRICES = new Map([
  ['grok-build', { input: 1e-6, output: 2e-6, cacheRead: 2e-7, pricingModel: 'grok-build-0.1' }],
  ['grok-build-0.1', { input: 1e-6, output: 2e-6, cacheRead: 2e-7, pricingModel: 'grok-build-0.1' }],
])

function number(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function normalizeCodexModel(raw) {
  let model = String(raw || '').trim()
  if (!model) return null
  model = model.replace(/^openai\//i, '')
  if (CODEX_PRICES.has(model)) return model
  const withoutDate = model.replace(/-\d{4}-\d{2}-\d{2}$/, '')
  if (CODEX_PRICES.has(withoutDate)) return withoutDate
  return model
}

function normalizeGrokModel(raw) {
  let model = String(raw || '').trim()
  if (!model) return null
  model = model.replace(/^xai\//i, '')
  if (GROK_PRICES.has(model)) return model
  const withoutDate = model.replace(/-\d{4}-\d{2}-\d{2}$/, '')
  if (GROK_PRICES.has(withoutDate)) return withoutDate
  return model
}

function normalizeClaudeModel(raw) {
  let model = String(raw || '').trim()
  if (!model) return null
  model = model.replace(/^anthropic\./i, '')
  const claudeIndex = model.lastIndexOf('claude-')
  if (claudeIndex > 0) model = model.slice(claudeIndex)
  model = model.replace(/@/, '-')
  model = model.replace(/-v\d+:\d+$/i, '')
  if (CLAUDE_PRICES.has(model)) return model
  const withoutDate = model.replace(/-\d{8}$/, '')
  if (CLAUDE_PRICES.has(withoutDate)) return withoutDate
  return model
}

function tiered(tokens, baseRate, aboveRate, threshold) {
  const count = number(tokens)
  if (!aboveRate || !threshold || count <= threshold) return count * baseRate
  return threshold * baseRate + (count - threshold) * aboveRate
}

function claudeCostUSD(row) {
  return claudeCostBreakdown(row)?.costUSD ?? null
}

function claudeCostBreakdown(row) {
  const model = normalizeClaudeModel(row?.model)
  const dynamic = model ? modelsDev.lookup('anthropic', row?.model || model) : null
  const staticPrice = model ? CLAUDE_PRICES.get(model) : null
  const price = dynamic || staticPrice
  if (!price) return null
  const input = number(row.uncachedInput ?? row.input)
  const cacheCreation = number(row.cacheCreation)
  const cacheRead = number(row.cacheRead ?? row.cached)
  const output = number(row.output)
  const costUSD = (
    tiered(input, price.input, price.above?.input, price.threshold) +
    tiered(cacheCreation, price.cacheCreation ?? price.input, price.above?.cacheCreation, price.threshold) +
    tiered(cacheRead, price.cacheRead ?? price.input, price.above?.cacheRead, price.threshold) +
    tiered(output, price.output, price.above?.output, price.threshold)
  )
  return {
    costUSD,
    pricingSource: dynamic ? 'models.dev' : 'built-in',
    pricingModel: dynamic?.modelId || model,
  }
}

function overridePrice(base, overrides) {
  if (!overrides) return base
  return Object.fromEntries(
    Object.entries({ ...base, ...overrides })
      .filter(([, value]) => value != null),
  )
}

function codexCostUSD(row) {
  return codexCostBreakdown(row)?.costUSD ?? null
}

function codexCostBreakdown(row) {
  const model = normalizeCodexModel(row?.model)
  const dynamic = model ? modelsDev.lookup('openai', row?.model || model) : null
  const staticPrice = model ? CODEX_PRICES.get(model) : null
  const price = dynamic || staticPrice
  if (!price) return null
  const input = number(row.input)
  const cached = Math.min(number(row.cached), input)
  const uncached = Math.max(0, input - cached)
  const usesLongContext = price.threshold && input > price.threshold
  const active = usesLongContext ? overridePrice(price, price.above) : price
  const cacheRate = active.cacheRead ?? active.input
  const costUSD = (
    uncached * active.input +
    cached * cacheRate +
    number(row.output) * active.output
  )
  return {
    costUSD,
    pricingSource: dynamic ? 'models.dev' : 'built-in',
    pricingModel: dynamic?.modelId || model,
  }
}

function grokCostBreakdown(row) {
  const model = normalizeGrokModel(row?.model)
  const price = model ? GROK_PRICES.get(model) : null
  if (!price) return null
  const total = number(row.total)
  const input = number(row.input) || Math.max(0, total - number(row.cached) - number(row.output))
  const cached = Math.min(number(row.cached), input)
  const uncached = Math.max(0, input - cached)
  const output = number(row.output)
  const costUSD = (
    uncached * price.input +
    cached * (price.cacheRead ?? price.input) +
    output * price.output
  )
  return {
    costUSD,
    pricingSource: 'xAI pricing',
    pricingModel: price.pricingModel || model,
  }
}

function estimateCodexTokenCost(tokenUsage) {
  const rows = Array.isArray(tokenUsage?.modelBreakdowns) && tokenUsage.modelBreakdowns.length
    ? tokenUsage.modelBreakdowns
    : tokenUsage?.model
      ? [{
          model: tokenUsage.model,
          input: tokenUsage.input,
          cached: tokenUsage.cached,
          output: tokenUsage.output,
          total: tokenUsage.total,
        }]
      : []
  let costUSD = 0
  let pricedTokens = 0
  const modelBreakdowns = []
  const pricedModels = []
  const unpricedModels = []
  const pricingSources = new Set()
  for (const row of rows) {
    const pricing = codexCostBreakdown(row)
    const cost = pricing?.costUSD
    const model = row.model || row.modelName || 'unknown'
    if (cost == null) {
      unpricedModels.push(model)
      modelBreakdowns.push({ ...row, costUSD: null, costAccuracy: null })
      continue
    }
    costUSD += cost
    pricedTokens += number(row.total)
    pricedModels.push(model)
    pricingSources.add(pricing.pricingSource)
    modelBreakdowns.push({
      ...row,
      costUSD: cost,
      costAccuracy: 'estimate',
      pricingSource: pricing.pricingSource,
      pricingModel: pricing.pricingModel,
    })
  }
  if (!pricedModels.length) return null
  return {
    costUSD,
    pricedTokens,
    modelBreakdowns,
    pricedModels,
    unpricedModels,
    pricingSources: [...pricingSources],
    label: 'estimated token cost',
  }
}

function estimateGrokTokenCost(tokenUsage) {
  const rows = Array.isArray(tokenUsage?.modelBreakdowns) && tokenUsage.modelBreakdowns.length
    ? tokenUsage.modelBreakdowns
    : tokenUsage?.model
      ? [{
          model: tokenUsage.model,
          input: tokenUsage.input,
          cached: tokenUsage.cached,
          output: tokenUsage.output,
          total: tokenUsage.total,
        }]
      : []
  let costUSD = 0
  let pricedTokens = 0
  const modelBreakdowns = []
  const pricedModels = []
  const unpricedModels = []
  const pricingSources = new Set()
  for (const row of rows) {
    const pricing = grokCostBreakdown(row)
    const cost = pricing?.costUSD
    const model = row.model || row.modelName || 'unknown'
    if (cost == null) {
      unpricedModels.push(model)
      modelBreakdowns.push({ ...row, costUSD: null, costAccuracy: null })
      continue
    }
    costUSD += cost
    pricedTokens += number(row.total)
    pricedModels.push(model)
    pricingSources.add(pricing.pricingSource)
    modelBreakdowns.push({
      ...row,
      costUSD: cost,
      costAccuracy: 'hypothetical',
      pricingSource: pricing.pricingSource,
      pricingModel: pricing.pricingModel,
    })
  }
  if (!pricedModels.length) return null
  return {
    costUSD,
    costAccuracy: 'hypothetical',
    pricedTokens,
    modelBreakdowns,
    pricedModels,
    unpricedModels,
    pricingSources: [...pricingSources],
    label: 'hypothetical API-equivalent cost',
  }
}

function estimateClaudeTokenCost(tokenUsage) {
  const rows = Array.isArray(tokenUsage?.modelBreakdowns) ? tokenUsage.modelBreakdowns : []
  let costUSD = 0
  let pricedTokens = 0
  const modelBreakdowns = []
  const pricedModels = []
  const unpricedModels = []
  const pricingSources = new Set()
  for (const row of rows) {
    const pricing = claudeCostBreakdown(row)
    const cost = pricing?.costUSD
    const model = row.model || row.modelName || 'unknown'
    if (cost == null) {
      unpricedModels.push(model)
      modelBreakdowns.push({ ...row, costUSD: null, costAccuracy: null })
      continue
    }
    costUSD += cost
    pricedTokens += number(row.total)
    pricedModels.push(model)
    pricingSources.add(pricing.pricingSource)
    modelBreakdowns.push({
      ...row,
      costUSD: cost,
      costAccuracy: 'estimate',
      pricingSource: pricing.pricingSource,
      pricingModel: pricing.pricingModel,
    })
  }
  if (!pricedModels.length) return null
  return {
    costUSD,
    pricedTokens,
    modelBreakdowns,
    pricedModels,
    unpricedModels,
    pricingSources: [...pricingSources],
    label: 'estimated token cost',
  }
}

function estimateTokenCost(providerId, tokenUsage) {
  if (providerId === 'claude' || providerId === 'vertexai') return estimateClaudeTokenCost(tokenUsage)
  if (providerId === 'codex') return estimateCodexTokenCost(tokenUsage)
  if (providerId === 'grok') return estimateGrokTokenCost(tokenUsage)
  return null
}

async function refreshPricing(options = {}) {
  return modelsDev.refreshIfNeeded({ timeoutMs: 3000, ...options })
}

function withTokenCost(providerId, tokenUsage) {
  if (!tokenUsage || Number.isFinite(Number(tokenUsage.costUSD))) return tokenUsage
  const estimate = estimateTokenCost(providerId, tokenUsage)
  if (!estimate) return tokenUsage
  const dailyBreakdown = Array.isArray(tokenUsage.dailyBreakdown)
    ? tokenUsage.dailyBreakdown.map((day) => {
        const dayEstimate = estimateTokenCost(providerId, {
          ...day,
          modelBreakdowns: day.modelBreakdowns || [],
        })
        if (!dayEstimate) return day
        return {
          ...day,
          costUSD: dayEstimate.costUSD,
          costAccuracy: dayEstimate.costAccuracy || 'estimate',
          pricingSources: dayEstimate.pricingSources,
          pricingSource: dayEstimate.pricingSources.length === 1 ? dayEstimate.pricingSources[0] : 'mixed',
          modelBreakdowns: dayEstimate.modelBreakdowns,
        }
      })
    : tokenUsage.dailyBreakdown
  return {
    ...tokenUsage,
    costUSD: estimate.costUSD,
    costLabel: estimate.label,
    costAccuracy: estimate.costAccuracy || 'estimate',
    pricingSources: estimate.pricingSources,
    pricingSource: estimate.pricingSources.length === 1 ? estimate.pricingSources[0] : 'mixed',
    pricedTokens: estimate.pricedTokens,
    modelBreakdowns: estimate.modelBreakdowns,
    dailyBreakdown,
    pricedModels: estimate.pricedModels,
    unpricedModels: estimate.unpricedModels,
  }
}

module.exports = {
  refreshPricing,
  withTokenCost,
  _private: {
    CLAUDE_PRICES,
    CODEX_PRICES,
    GROK_PRICES,
    normalizeCodexModel,
    normalizeGrokModel,
    normalizeClaudeModel,
    codexCostBreakdown,
    codexCostUSD,
    grokCostBreakdown,
    claudeCostBreakdown,
    claudeCostUSD,
    estimateCodexTokenCost,
    estimateGrokTokenCost,
    estimateClaudeTokenCost,
    modelsDev,
    overridePrice,
    tiered,
  },
}
