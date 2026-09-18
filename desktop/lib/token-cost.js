const modelsDev = require('./models-dev-pricing')
const pricingSupplement = require('./pricing-supplement')

let pricingOptions = {
  unknownModelFallback: { enabled: false, models: {} },
  pricingSupplementUrl: null,
}

const CLAUDE_PRICES = new Map([
  ['claude-haiku-4-5', { input: 1e-6, output: 5e-6, cacheCreation: 1.25e-6, cacheRead: 1e-7 }],
  ['claude-haiku-4-5-20251001', { input: 1e-6, output: 5e-6, cacheCreation: 1.25e-6, cacheRead: 1e-7 }],
  ['claude-opus-4-5', { input: 5e-6, output: 2.5e-5, cacheCreation: 6.25e-6, cacheRead: 5e-7 }],
  ['claude-opus-4-5-20251101', { input: 5e-6, output: 2.5e-5, cacheCreation: 6.25e-6, cacheRead: 5e-7 }],
  ['claude-opus-4-6', { input: 5e-6, output: 2.5e-5, cacheCreation: 6.25e-6, cacheRead: 5e-7 }],
  ['claude-opus-4-6-20260205', { input: 5e-6, output: 2.5e-5, cacheCreation: 6.25e-6, cacheRead: 5e-7 }],
  ['claude-opus-4-7', { input: 5e-6, output: 2.5e-5, cacheCreation: 6.25e-6, cacheRead: 5e-7 }],
  ['claude-opus-4-8', { input: 5e-6, output: 2.5e-5, cacheCreation: 6.25e-6, cacheRead: 5e-7 }],
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

function normalizeAntigravityModel(raw) {
  let model = String(raw || '').trim()
  if (!model) return null
  model = model
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-(?:none|low|medium|high|xhigh|max|thinking)$/, '')
    .replace(/-tiered$/, '')
  if (/^gemini-pro-(?:default|agent)$/.test(model)) return 'gemini-3.1-pro'
  const claude = model.match(/^claude-(opus|sonnet|haiku)-(\d+)[.-](\d+)/)
  if (claude) return `claude-${claude[1]}-${claude[2]}-${claude[3]}`
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

function speedMultiplier(row, pricingModel, price = null) {
  if (price?.fastMultiplierApplied) return 1
  if (!(row?.isFast || row?.speed === 'fast' || row?.serviceTier === 'priority')) return 1
  return pricingSupplement.current().fastMultipliers?.[pricingModel] || 2
}

function costFromPrice(row, price, pricingSource, pricingModel) {
  const input = number(row.input)
  const cached = Math.min(number(row.cached ?? row.cacheRead), input)
  const uncached = Math.max(0, input - cached)
  const active = price.threshold && input > price.threshold ? overridePrice(price, price.above) : price
  const costUSD = (
    uncached * active.input +
    cached * (active.cacheRead ?? active.input) +
    number(row.output) * active.output
  ) * speedMultiplier(row, pricingModel, price)
  return { costUSD, pricingSource, pricingModel }
}

function claudeCostBreakdown(row) {
  const model = normalizeClaudeModel(row?.model)
  const canonical = model ? normalizeClaudeModel(pricingSupplement.resolveAlias(row?.model || model)) : null
  const supplementPrice = model ? pricingSupplement.lookup(row?.model || model) : null
  const dynamic = canonical ? modelsDev.lookup('anthropic', canonical) : null
  const staticPrice = canonical ? CLAUDE_PRICES.get(canonical) || CLAUDE_PRICES.get(model) : null
  const price = supplementPrice || dynamic || staticPrice
  if (!price) return null
  const input = number(row.uncachedInput ?? row.input)
  const cacheCreation = number(row.cacheCreation)
  const cacheRead = number(row.cacheRead ?? row.cached)
  const output = number(row.output)
  const pricingModel = supplementPrice?.modelId || dynamic?.modelId || model
  const promptTokens = input + cacheCreation + cacheRead
  const active = price.threshold && promptTokens > price.threshold ? overridePrice(price, price.above) : price
  const costUSD = (
    input * active.input +
    cacheCreation * (active.cacheCreation ?? active.input) +
    cacheRead * (active.cacheRead ?? active.input) +
    output * active.output
  ) * speedMultiplier(row, pricingModel, price)
  return {
    costUSD,
    pricingSource: supplementPrice ? supplementPrice.source : dynamic ? 'models.dev' : 'built-in',
    pricingModel,
  }
}

function antigravityCostBreakdown(row) {
  const rawModel = row?.model || row?.modelName
  if (!rawModel) return null
  const model = normalizeAntigravityModel(rawModel)
  if (/^claude-/.test(model)) return claudeCostBreakdown({ ...row, model })
  for (const providerId of ['google', 'google-vertex', 'vertex']) {
    for (const candidate of [model, `${model}-preview`]) {
      const price = modelsDev.lookup(providerId, candidate)
      if (price) return costFromPrice(row, price, 'models.dev', price.modelId || candidate)
    }
  }
  return null
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

function codexCostBreakdown(row, options = {}) {
  const model = normalizeCodexModel(row?.model)
  const canonical = model ? pricingSupplement.resolveAlias(row?.model || model) : null
  const supplementPrice = canonical ? pricingSupplement.lookup(row?.model || canonical) : null
  const dynamic = canonical ? modelsDev.lookup('openai', canonical) : null
  const staticPrice = canonical ? CODEX_PRICES.get(canonical) || CODEX_PRICES.get(model) : null
  let price = supplementPrice || dynamic || staticPrice
  let pricingModel = supplementPrice?.modelId || dynamic?.modelId || model
  let pricingSource = supplementPrice ? supplementPrice.source : dynamic ? 'models.dev' : 'built-in'
  let fallbackPricingModel = null
  if (!price && options.fallbackModel) {
    const allowed = pricingSupplement.fallbackModels('codex').includes(options.fallbackModel)
    if (allowed) {
      const fallback = resolveCodexPrice(options.fallbackModel)
      if (fallback) {
        price = fallback.price
        pricingModel = fallback.pricingModel
        pricingSource = fallback.pricingSource
        fallbackPricingModel = options.fallbackModel
      }
    }
  }
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
  ) * speedMultiplier(row, pricingModel, price)
  return {
    costUSD,
    pricingSource,
    pricingModel,
    ...(fallbackPricingModel ? { fallbackPricingModel } : {}),
  }
}

function resolveCodexPrice(model) {
  const normalized = normalizeCodexModel(model)
  if (!normalized) return null
  const supplementPrice = pricingSupplement.lookup(normalized)
  if (supplementPrice) return { price: supplementPrice, pricingSource: supplementPrice.source, pricingModel: supplementPrice.modelId }
  const dynamic = modelsDev.lookup('openai', normalized)
  if (dynamic) return { price: dynamic, pricingSource: 'models.dev', pricingModel: dynamic.modelId || normalized }
  const staticPrice = CODEX_PRICES.get(normalized)
  return staticPrice ? { price: staticPrice, pricingSource: 'built-in', pricingModel: normalized } : null
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

function estimateCodexTokenCost(tokenUsage, options = {}) {
  const displayRows = Array.isArray(tokenUsage?.modelBreakdowns) && tokenUsage.modelBreakdowns.length
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
  const rows = Array.isArray(tokenUsage?.accountingEvents) && tokenUsage.accountingEvents.length
    ? tokenUsage.accountingEvents
    : displayRows
  let costUSD = 0
  let pricedTokens = 0
  const costsByModel = new Map()
  const pricedModels = []
  const unpricedModels = []
  const fallbackPricedModels = []
  const pricingSources = new Set()
  let hasRecordedCost = false
  let hasEstimatedCost = false
  for (const row of rows) {
    const recordedCost = Number(row.recordedCostUSD)
    const hasRecorded = row.recordedCostUSD != null && Number.isFinite(recordedCost) && recordedCost > 0
    const pricing = hasRecorded ? null : codexCostBreakdown(row, options)
    const cost = hasRecorded ? recordedCost : pricing?.costUSD
    const model = row.model || row.modelName || 'unknown'
    if (cost == null) {
      unpricedModels.push(model)
      continue
    }
    costUSD += cost
    pricedTokens += number(row.total)
    pricedModels.push(model)
    const pricingSource = hasRecorded ? 'recorded cost' : pricing.pricingSource
    const pricingModel = hasRecorded ? null : pricing.pricingModel
    pricingSources.add(pricingSource)
    hasRecordedCost ||= hasRecorded
    hasEstimatedCost ||= !hasRecorded
    if (pricing?.fallbackPricingModel) {
      if (!unpricedModels.includes(model)) unpricedModels.push(model)
      if (!fallbackPricedModels.includes(model)) fallbackPricedModels.push(model)
    }
    const aggregate = costsByModel.get(model) || { costUSD: 0, sources: new Set(), pricingModels: new Set(), fallbackPricingModel: null, measured: false, estimated: false }
    aggregate.costUSD += cost
    aggregate.sources.add(pricingSource)
    if (pricingModel) aggregate.pricingModels.add(pricingModel)
    aggregate.fallbackPricingModel = pricing?.fallbackPricingModel || aggregate.fallbackPricingModel
    aggregate.measured ||= hasRecorded
    aggregate.estimated ||= !hasRecorded
    costsByModel.set(model, aggregate)
  }
  if (!pricedModels.length) return null
  const modelBreakdowns = displayRows.map((row) => {
    const model = row.model || row.modelName || 'unknown'
    const aggregate = costsByModel.get(model)
    if (!aggregate) return { ...row, costUSD: null, costAccuracy: null }
    return {
      ...row,
      costUSD: aggregate.costUSD,
      costAccuracy: aggregate.measured ? (aggregate.estimated ? 'mixed' : 'measured') : 'estimate',
      pricingSource: aggregate.sources.size === 1 ? [...aggregate.sources][0] : 'mixed',
      pricingModel: aggregate.pricingModels.size === 1 ? [...aggregate.pricingModels][0] : 'mixed',
      ...(aggregate.fallbackPricingModel ? { fallbackPricingModel: aggregate.fallbackPricingModel } : {}),
    }
  })
  return {
    costUSD,
    costAccuracy: hasRecordedCost ? (hasEstimatedCost ? 'mixed' : 'measured') : 'estimate',
    pricedTokens,
    modelBreakdowns,
    pricedModels: [...new Set(pricedModels)],
    unpricedModels: [...new Set(unpricedModels)],
    fallbackPricedModels,
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
  const displayRows = Array.isArray(tokenUsage?.modelBreakdowns) ? tokenUsage.modelBreakdowns : []
  const rows = Array.isArray(tokenUsage?.accountingEvents) && tokenUsage.accountingEvents.length
    ? tokenUsage.accountingEvents
    : displayRows
  let costUSD = 0
  let pricedTokens = 0
  const costsByModel = new Map()
  const pricedModels = []
  const unpricedModels = []
  const pricingSources = new Set()
  let hasRecordedCost = false
  let hasEstimatedCost = false
  for (const row of rows) {
    const recordedCost = row.recordedCostUSD != null && Number.isFinite(Number(row.recordedCostUSD))
      ? Math.max(0, Number(row.recordedCostUSD))
      : null
    const recordedTotal = recordedCost == null
      ? 0
      : Math.max(0, row.recordedTotal == null ? number(row.total) : number(row.recordedTotal))
    const recordedInput = recordedCost != null && row.recordedInput == null ? number(row.input) : number(row.recordedInput)
    const recordedUncachedInput = recordedCost != null && row.recordedUncachedInput == null
      ? number(row.uncachedInput ?? row.input)
      : number(row.recordedUncachedInput)
    const recordedCached = recordedCost != null && row.recordedCached == null ? number(row.cached) : number(row.recordedCached)
    const recordedCacheRead = recordedCost != null && row.recordedCacheRead == null
      ? number(row.cacheRead ?? row.cached)
      : number(row.recordedCacheRead)
    const recordedCacheCreation = recordedCost != null && row.recordedCacheCreation == null
      ? number(row.cacheCreation)
      : number(row.recordedCacheCreation)
    const recordedOutput = recordedCost != null && row.recordedOutput == null ? number(row.output) : number(row.recordedOutput)
    const estimateRow = recordedCost == null ? row : {
      ...row,
      input: Math.max(0, number(row.input) - recordedInput),
      uncachedInput: Math.max(0, number(row.uncachedInput ?? row.input) - recordedUncachedInput),
      cached: Math.max(0, number(row.cached) - recordedCached),
      cacheRead: Math.max(0, number(row.cacheRead ?? row.cached) - recordedCacheRead),
      cacheCreation: Math.max(0, number(row.cacheCreation) - recordedCacheCreation),
      output: Math.max(0, number(row.output) - recordedOutput),
      total: Math.max(0, number(row.total) - recordedTotal),
    }
    const needsEstimate = number(estimateRow.total) > 0
    const pricing = needsEstimate ? claudeCostBreakdown(estimateRow) : null
    const cost = recordedCost == null
      ? pricing?.costUSD
      : needsEstimate && !pricing
        ? null
        : recordedCost + (pricing?.costUSD || 0)
    const model = row.model || row.modelName || 'unknown'
    if (cost == null) {
      unpricedModels.push(model)
      continue
    }
    costUSD += cost
    pricedTokens += number(row.total)
    pricedModels.push(model)
    if (recordedCost != null) {
      hasRecordedCost = true
      pricingSources.add('pi recorded cost')
    }
    if (pricing) {
      hasEstimatedCost = true
      pricingSources.add(pricing.pricingSource)
    }
    const source = recordedCost != null && pricing ? `pi recorded cost + ${pricing.pricingSource}` : recordedCost != null ? 'pi recorded cost' : pricing.pricingSource
    const aggregate = costsByModel.get(model) || { costUSD: 0, sources: new Set(), pricingModels: new Set(), accuracies: new Set() }
    aggregate.costUSD += cost
    aggregate.sources.add(source)
    if (pricing?.pricingModel) aggregate.pricingModels.add(pricing.pricingModel)
    aggregate.accuracies.add(recordedCost != null ? (needsEstimate ? 'mixed' : 'measured') : 'estimate')
    costsByModel.set(model, aggregate)
  }
  if (!pricedModels.length) return null
  const modelBreakdowns = displayRows.map((row) => {
    const model = row.model || row.modelName || 'unknown'
    const aggregate = costsByModel.get(model)
    if (!aggregate) return { ...row, costUSD: null, costAccuracy: null }
    const accuracies = [...aggregate.accuracies]
    return {
      ...row,
      costUSD: aggregate.costUSD,
      costAccuracy: accuracies.length === 1 ? accuracies[0] : 'mixed',
      pricingSource: aggregate.sources.size === 1 ? [...aggregate.sources][0] : 'mixed',
      pricingModel: aggregate.pricingModels.size === 1 ? [...aggregate.pricingModels][0] : aggregate.pricingModels.size ? 'mixed' : null,
    }
  })
  return {
    costUSD,
    costAccuracy: hasRecordedCost ? (hasEstimatedCost ? 'mixed' : 'measured') : 'estimate',
    pricedTokens,
    modelBreakdowns,
    pricedModels: [...new Set(pricedModels)],
    unpricedModels: [...new Set(unpricedModels)],
    pricingSources: [...pricingSources],
    label: hasRecordedCost ? (hasEstimatedCost ? 'mixed recorded/estimated cost' : 'recorded cost') : 'estimated token cost',
  }
}

function estimateAntigravityTokenCost(tokenUsage) {
  const rows = Array.isArray(tokenUsage?.modelBreakdowns) ? tokenUsage.modelBreakdowns : []
  let costUSD = 0
  let pricedTokens = 0
  const modelBreakdowns = []
  const pricedModels = []
  const unpricedModels = []
  const pricingSources = new Set()
  for (const row of rows) {
    const pricing = antigravityCostBreakdown(row)
    const model = row.model || row.modelName || 'unknown'
    if (!pricing) {
      unpricedModels.push(model)
      modelBreakdowns.push({ ...row, costUSD: null, costAccuracy: null })
      continue
    }
    costUSD += pricing.costUSD
    pricedTokens += number(row.total)
    pricedModels.push(model)
    pricingSources.add(pricing.pricingSource)
    modelBreakdowns.push({
      ...row,
      costUSD: pricing.costUSD,
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

function estimateTokenCost(providerId, tokenUsage, options = {}) {
  if (providerId === 'claude' || providerId === 'vertexai') return estimateClaudeTokenCost(tokenUsage)
  if (providerId === 'antigravity') return estimateAntigravityTokenCost(tokenUsage)
  if (providerId === 'codex') return estimateCodexTokenCost(tokenUsage, options)
  if (providerId === 'grok') return estimateGrokTokenCost(tokenUsage)
  return null
}

async function refreshPricing(options = {}) {
  const supplementOptions = {
    timeoutMs: 3000,
    ...options,
    ...(pricingOptions.pricingSupplementUrl ? { url: pricingOptions.pricingSupplementUrl } : {}),
  }
  const [models, supplement] = await Promise.all([
    modelsDev.refreshIfNeeded({ timeoutMs: 3000, ...options }),
    pricingSupplement.refreshIfNeeded(supplementOptions),
  ])
  return { models, supplement }
}

function configuredFallback(providerId, options = {}) {
  const setting = options.unknownModelFallback || pricingOptions.unknownModelFallback
  if (!setting?.enabled) return null
  const model = typeof setting.models?.[providerId] === 'string' ? setting.models[providerId].trim() : ''
  return model || null
}

function configurePricing(options = {}) {
  pricingOptions = {
    ...pricingOptions,
    ...(options.unknownModelFallback ? { unknownModelFallback: options.unknownModelFallback } : {}),
    ...(Object.prototype.hasOwnProperty.call(options, 'pricingSupplementUrl') ? { pricingSupplementUrl: options.pricingSupplementUrl || null } : {}),
  }
  return { ...pricingOptions }
}

function pricingFallbackOptions(providerId) {
  return pricingSupplement.fallbackModels(providerId)
    .filter((model) => providerId !== 'codex' || Boolean(resolveCodexPrice(model)))
    .map((id) => ({ id, title: id }))
}

function stripDerivedPricing(tokenUsage) {
  const derivedKeys = new Set([
    'costUSD', 'costLabel', 'costAccuracy', 'pricingSources', 'pricingSource', 'pricedTokens',
    'pricedCostUSD', 'unpricedTokens', 'costCoverage', 'pricedModels', 'unpricedModels',
    'fallbackPricedModels', 'pricingModel', 'fallbackPricingModel',
  ])
  function strip(row) {
    if (!row || typeof row !== 'object') return row
    return Object.fromEntries(Object.entries(row).filter(([key]) => !derivedKeys.has(key)))
  }
  const base = strip(tokenUsage)
  if (Array.isArray(tokenUsage.modelBreakdowns)) base.modelBreakdowns = tokenUsage.modelBreakdowns.map(strip)
  if (Array.isArray(tokenUsage.dailyBreakdown)) {
    base.dailyBreakdown = tokenUsage.dailyBreakdown.map((day) => ({
      ...strip(day),
      ...(Array.isArray(day.modelBreakdowns) ? { modelBreakdowns: day.modelBreakdowns.map(strip) } : {}),
    }))
  }
  return base
}

function withTokenCost(providerId, tokenUsage, options = {}) {
  if (!tokenUsage) return tokenUsage
  if (
    tokenUsage.costUSD != null &&
    Number.isFinite(Number(tokenUsage.costUSD)) &&
    !Array.isArray(tokenUsage.accountingEvents)
  ) return tokenUsage
  const pricingInput = Array.isArray(tokenUsage.accountingEvents) ? stripDerivedPricing(tokenUsage) : tokenUsage
  const estimateOptions = { ...options, fallbackModel: configuredFallback(providerId, options) }
  const estimate = estimateTokenCost(providerId, pricingInput, estimateOptions)
  if (!estimate) return pricingInput
  const dailyBreakdown = Array.isArray(pricingInput.dailyBreakdown)
    ? pricingInput.dailyBreakdown.map((day) => {
        const dayEstimate = estimateTokenCost(providerId, {
          ...day,
          modelBreakdowns: day.modelBreakdowns || [],
          accountingEvents: Array.isArray(pricingInput.accountingEvents)
            ? pricingInput.accountingEvents.filter((event) => event.day === day.date)
            : undefined,
        }, estimateOptions)
        if (!dayEstimate) return day
        return {
          ...day,
          costUSD: dayEstimate.costUSD,
          pricedCostUSD: dayEstimate.costUSD,
          pricedTokens: dayEstimate.pricedTokens,
          unpricedTokens: Math.max(0, number(day.total) - dayEstimate.pricedTokens),
          costCoverage: dayEstimate.unpricedModels.length ? 'partial' : 'full',
          costAccuracy: dayEstimate.costAccuracy || 'estimate',
          pricingSources: dayEstimate.pricingSources,
          pricingSource: dayEstimate.pricingSources.length === 1 ? dayEstimate.pricingSources[0] : 'mixed',
          modelBreakdowns: dayEstimate.modelBreakdowns,
          pricedModels: dayEstimate.pricedModels,
          unpricedModels: dayEstimate.unpricedModels,
          ...(dayEstimate.fallbackPricedModels?.length ? { fallbackPricedModels: dayEstimate.fallbackPricedModels } : {}),
        }
      })
    : pricingInput.dailyBreakdown
  return {
    ...pricingInput,
    costUSD: estimate.costUSD,
    costLabel: estimate.label,
    costAccuracy: estimate.costAccuracy || 'estimate',
    pricingSources: estimate.pricingSources,
    pricingSource: estimate.pricingSources.length === 1 ? estimate.pricingSources[0] : 'mixed',
    pricedTokens: estimate.pricedTokens,
    pricedCostUSD: estimate.costUSD,
    unpricedTokens: Math.max(0, number(tokenUsage.total) - estimate.pricedTokens),
    costCoverage: estimate.unpricedModels.length ? 'partial' : 'full',
    modelBreakdowns: estimate.modelBreakdowns,
    dailyBreakdown,
    pricedModels: estimate.pricedModels,
    unpricedModels: estimate.unpricedModels,
    ...(estimate.fallbackPricedModels?.length ? { fallbackPricedModels: estimate.fallbackPricedModels } : {}),
  }
}

module.exports = {
  configurePricing,
  pricingFallbackOptions,
  refreshPricing,
  withTokenCost,
  _private: {
    CLAUDE_PRICES,
    CODEX_PRICES,
    GROK_PRICES,
    normalizeCodexModel,
    normalizeGrokModel,
    normalizeClaudeModel,
    normalizeAntigravityModel,
    codexCostBreakdown,
    codexCostUSD,
    grokCostBreakdown,
    claudeCostBreakdown,
    claudeCostUSD,
    antigravityCostBreakdown,
    estimateCodexTokenCost,
    estimateGrokTokenCost,
    estimateClaudeTokenCost,
    estimateAntigravityTokenCost,
    modelsDev,
    pricingSupplement,
    resolveCodexPrice,
    overridePrice,
    tiered,
  },
}
