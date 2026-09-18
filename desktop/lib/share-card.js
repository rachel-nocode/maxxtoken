const BurnReport = require('../burn/burn-report')

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function number(value) {
  return value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
}

function metricName(metric) {
  if (metric === 'tokens') return 'Token usage'
  if (metric === 'costPerMTok') return 'Cost per MTok'
  return 'API-equivalent cost'
}

function metricLabel(metric) {
  if (metric === 'tokens') return 'TOKENS'
  if (metric === 'costPerMTok') return 'COST / MTOK'
  return 'RECORDED / API-EQUIVALENT COST'
}

function buildCard(snapshot, options = {}) {
  if (!snapshot || !Array.isArray(snapshot.providers)) throw new Error('Refresh usage before copying a card.')
  if (!['provider', 'aggregate'].includes(options.kind)) throw new Error('Choose a provider or total-spend card.')
  const provider = options.kind === 'provider' ? snapshot.providers.find((item) => item.id === options.providerId) : null
  if (options.kind === 'provider' && !provider) throw new Error('That provider is no longer available.')
  const report = BurnReport.build(provider ? { providers: [provider] } : snapshot, { period: options.period, now: options.now })
  const light = options.theme === 'light'
  const hideSpend = options.redact?.spend === true
  const hideAccount = options.redact?.accountLabels !== false
  const selectedMetric = hideSpend ? 'tokens' : options.metric
  const projection = report.projection(selectedMetric)
  const title = provider ? provider.name || provider.providerFamily || 'Usage' : metricName(projection.metric)
  const account = !hideAccount && provider?.account?.label ? `<p class="muted">${escape(provider.account.label)}</p>` : ''
  const money = (value) => value == null ? 'Unavailable' : `$${value.toLocaleString('en-US', { maximumFractionDigits: 6 })}`
  const count = (value) => value == null ? 'Unavailable' : Math.round(value).toLocaleString('en-US')
  const metricValue = (value, metric) => metric === 'tokens' ? count(value) : metric === 'costPerMTok' ? `${money(value)}/MTok` : money(value)
  const rows = []
  if (provider) {
    for (const window of (provider.windows || []).slice(0, 12)) {
      const used = number(window.usedPct)
      if (used == null) continue
      const reset = number(window.resetAt)
      rows.push(`<section><div class="row"><b>${escape(window.label || 'Usage')}</b><span>${escape(used)}% used</span></div><div class="track"><div style="width:${Math.min(100, Math.max(0, used))}%"></div></div><p class="muted">${reset ? `Resets ${escape(new Date(reset).toLocaleString())}` : 'Reset unavailable'}</p></section>`)
    }
  } else {
    for (const slice of projection.slices.slice(0, 12)) {
      const label = `${slice.name || slice.label || 'Provider'}${!hideAccount && slice.accountLabel ? ` · ${slice.accountLabel}` : ''}`
      const partial = projection.metric !== 'tokens' && slice.partialCost ? '<sup>*</sup>' : ''
      rows.push(`<section class="row"><b>${escape(label)}</b><span>${escape(metricValue(slice.displayAmount, projection.metric))}${partial}</span></section>`)
    }
  }
  const available = report.coverage.providerCount > 0
  const aggregatePartial = !provider && projection.metric !== 'tokens' && report.coverage.partial
  const totals = provider
    ? `<section><small>TOKENS</small><strong>${count(report.totals.tokens)}</strong></section>${hideSpend ? '' : `<section><small>RECORDED / API-EQUIVALENT COST</small><strong>${money(report.totals.usd)}</strong></section>`}`
    : `<section><small>${metricLabel(projection.metric)}</small><strong>${metricValue(projection.total, projection.metric)}${aggregatePartial ? '<sup>*</sup>' : ''}</strong></section>`
  const body = `<header><span class="brand">Maxx<span>Token</span></span><span class="muted">${escape(report.period === '30d' ? 'LAST 30 DAYS' : report.period.toUpperCase())}</span></header><h1>${escape(title)}</h1>${account}<p class="muted">${escape(report.startDate)} — ${escape(report.endDate)}</p><div class="totals">${totals}</div>${rows.join('')}<footer>${available ? (report.coverage.partial ? 'Partial cost coverage · * some usage is unpriced' : 'Usage from provider data and local history') : 'No observed history for this period'}${hideSpend ? ' · Spend hidden' : ' · Excludes subscription fees'}<br>maxxtoken.app</footer>`
  const height = Math.min(1800, 360 + rows.length * (provider ? 115 : 55) + (account ? 32 : 0))
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>*{box-sizing:border-box}html{scrollbar-width:none}body{margin:0;padding:32px;background:${light ? '#f6f7f2' : '#181a17'};color:${light ? '#161914' : '#f5f6f1'};font:15px -apple-system,BlinkMacSystemFont,sans-serif}header,.row{display:flex;justify-content:space-between;gap:20px;align-items:center}.brand{font-weight:800;font-size:22px}.brand span{color:${light ? '#4f7800' : '#b6ff3c'}}h1{font-size:32px;margin:30px 0 8px;overflow-wrap:anywhere}.muted,small,footer{color:${light ? '#555e50' : '#b4bdad'};font-size:12px}.totals{display:flex;gap:24px;padding:20px 0;border-bottom:1px solid #858a7d55}.totals section{flex:1;min-width:0}small{display:block}strong{display:block;font-size:27px;margin-top:8px;overflow-wrap:anywhere}section{padding:13px 0}b{overflow-wrap:anywhere}.track{height:8px;border-radius:8px;background:${light ? '#c6cdbd' : '#53594b'};margin-top:12px;overflow:hidden}.track div{height:100%;background:${light ? '#568000' : '#b6ff3c'}}footer{border-top:1px solid #858a7d55;padding-top:20px;margin-top:20px;line-height:1.6}</style></head><body>${body}</body></html>`
  return { html, width: 560, height, report, projection }
}

module.exports = { buildCard }
