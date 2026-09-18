/* BURN Home — compact provider allowance cards. */

function burnRelativeAge(ts) {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return 'time unknown'
  const mins = Math.max(0, Math.floor((Date.now() - n) / 60000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function burnSafeError(error) {
  return String(error || 'The provider did not return usage data.')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]{12,}/gi, 'sk-[redacted]')
    .replace(/(token|key|cookie|secret)=([^\s&]+)/gi, '$1=[redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 160)
}

function burnRecoveryGuidance(error) {
  const text = burnSafeError(error)
  if (/401|403|unauthor|forbidden|expired|credential|cookie|token/i.test(text)) return `${text} Reconnect the account, then refresh.`
  if (/timeout|timed out|network|fetch|offline|socket|dns/i.test(text)) return `${text} Check the connection or provider status, then retry.`
  if (/rate.?limit|429/i.test(text)) return `${text} Wait for the provider limit to clear, then refresh.`
  return `${text} Refresh this provider or open its account page for details.`
}

function burnProviderHealth(p, generatedAt) {
  const raw = p._raw || {}
  const source = String(raw.sourceLabel || raw.valueLabel || '')
  const freshnessAt = Number(raw.lastUpdatedAt || generatedAt)
  const tooOld = Number.isFinite(freshnessAt) && Date.now() - freshnessAt > 5 * 60 * 1000
  const forecastPaused = (p.windows || []).some((window) => window?.forecast?.availability === 'stale')
  const stale = raw.activity === 'stale' || /cached|last good/i.test(source) || tooOld || forecastPaused
  const hasGoodData = (p.metrics || []).length > 0 || (p.windows || []).length > 0
  const refreshError = raw.refreshError || (raw.refreshState === 'error' ? raw.error : null)
  const failed = raw.connected === false || (!!(refreshError || raw.error) && !hasGoodData)
  const age = burnRelativeAge(raw.lastUpdatedAt || generatedAt)
  if (raw.refreshState === 'refreshing') return { kind: 'refreshing', label: 'Refreshing…', detail: hasGoodData ? `Showing the last result · ${age}` : 'Waiting for this provider' }
  if (failed) return { kind: 'error', label: 'Connection failed', detail: burnRecoveryGuidance(refreshError || raw.error) }
  if (refreshError) return { kind: 'stale', label: `Refresh failed · ${age}`, detail: burnRecoveryGuidance(refreshError) }
  if (raw.error && hasGoodData) return { kind: 'stale', label: `Last good · ${age}`, detail: burnRecoveryGuidance(raw.error) }
  if (stale) return { kind: 'stale', label: `Cached · ${age}`, detail: source || 'Showing the last successful reading' }
  return { kind: 'ok', label: `Updated ${age}`, detail: source || 'Provider usage' }
}

function burnPrimaryDisplayWindow(p) {
  const windows = Array.isArray(p.windows) ? p.windows : []
  return windows.find((w) => w.kind === '7d' || /weekly/i.test(w.label)) || windows[0] || null
}

function burnPrimaryDisplayMetric(p) {
  return (Array.isArray(p.primaryMetrics) && p.primaryMetrics[0]) || burnPrimaryDisplayWindow(p)
}

function burnWindowName(window) {
  if (window?.kind === '5h') return 'Session (5h)'
  if (window?.kind === '7d') return 'Weekly'
  return window?.label || 'Allowance'
}

function burnCurrentLabel(value, pct, mode) {
  const text = String(value || '').trim()
  if (!text || text === '—') return 'Usage unavailable'
  if (/^\d+(?:\.\d+)?%$/i.test(text)) return `${text} ${mode}`
  if (/^\d+(?:\.\d+)?%\s+(used|left)$/i.test(text)) return text.toLowerCase()
  return text
}

function burnTrendForWindow(p, window) {
  const rawWindows = Array.isArray(p?._raw?.windows) ? p._raw.windows : []
  const match = rawWindows.find((w) => window?.kind && w.kind === window.kind) || rawWindows.find((w) => {
    return String(w?.label || '').trim().toLowerCase() === String(window?.label || '').trim().toLowerCase()
  })
  const series = Array.isArray(match?.historySeries) ? match.historySeries : []
  if (series.length < 2) return null
  return series.slice(-12).map((point) => Number(point?.usedPct)).filter(Number.isFinite)
}

function burnForecastText(forecast) {
  if (!forecast) return { label: 'Forecast unavailable', detail: 'No eligible allowance window', tone: 'muted' }
  return { label: forecast.label || 'Forecast unavailable', detail: forecast.detail || '', tone: forecast.tone || 'muted' }
}

function burnQuotaBar({ pct, mode, forecast, risky, height = 7 }) {
  if (pct == null || !Number.isFinite(Number(pct))) {
    return `<div role="img" aria-label="Usage unavailable" style="${bstyle({ width: '100%', height, borderRadius: height, background: BURN.text4 })}"></div>`
  }
  if (typeof burnForecastBar === 'function') {
    return burnForecastBar({ pct, mode, forecast, burning: risky, height, showLegend: false, showEvenPace: false })
  }
  return burnSegBar({ pct, burning: risky, height })
}

function burnWindowRisk(window) {
  if (window?.forecast?.tone === 'warn' || window?.forecast?.availability === 'exhausted') return true
  return Number(window?.usedPct) >= 90
}

function burnWindowBar(window, mode) {
  const hasPct = window?.pct != null && Number.isFinite(Number(window.pct))
  const pct = hasPct ? Number(window.pct) : null
  const forecast = burnForecastText(window?.forecast)
  const risky = burnWindowRisk(window)
  const forecastColor = forecast.tone === 'warn' ? BURN.warnText : window?.forecast?.availability === 'ready' ? BURN.text : BURN.text2
  const reset = window?.resetAt ? burnClockText(window.resetAt, 'Resets') : 'Reset unavailable'
  const current = hasPct ? burnCurrentLabel(window.value, pct, mode) : 'Usage unavailable'
  const ariaDetail = forecast.detail ? ` ${forecast.detail}.` : ''

  return (
    `<div role="group" style="${bstyle({ padding: '1px 0 7px' })}" aria-label="${burnEsc(`${burnWindowName(window)} allowance. ${current}. ${forecast.label}.${ariaDetail} ${reset}.`)}">` +
    `<div style="${bstyle({ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 })}">` +
    `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 13, fontWeight: 700, color: BURN.text })}">${burnEsc(burnWindowName(window))}</span>` +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    `<span${forecast.detail ? ` title="${burnEsc(forecast.detail)}"` : ''} style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12, fontWeight: 650, color: forecastColor, textAlign: 'right' })}">${burnEsc(forecast.label)}</span>` +
    `</div>` +
    burnQuotaBar({ pct, mode, forecast: window?.forecast, risky }) +
    `<div style="${bstyle({ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 6, fontFamily: BURN_FONT.mono, fontSize: 9.5, color: BURN.text2, fontVariantNumeric: 'tabular-nums' })}">` +
    `<span role="button" tabindex="0" data-burn-display-toggle="usage" title="Show ${mode === 'used' ? 'remaining' : 'used'} usage">${burnEsc(current)}</span><span role="button" tabindex="0" data-burn-display-toggle="reset" data-burn-clock="${window?.resetAt || ''}" data-burn-clock-verb="Resets" title="Show ${burnState.openUsagePrefs?.resetDisplay === 'exact' ? 'countdown' : 'exact time'}">${burnEsc(reset)}</span>` +
    `</div>` +
    `</div>`
  )
}

function burnScalarMetric(metric) {
  const provenance = metric.provenance ? ` title="${burnEsc(`Source: ${metric.provenance}`)}"` : ''
  return (
    `<div role="group" style="${bstyle({ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0' })}"${provenance}>` +
    `<span style="${bstyle({ flex: 1, minWidth: 0, color: BURN.text2, fontFamily: BURN_FONT.sans, fontSize: 12 })}">${burnEsc(metric.label)}</span>` +
    `<span style="${bstyle({ color: BURN.text, fontFamily: BURN_FONT.mono, fontSize: 11, fontWeight: 650, textAlign: 'right' })}">${burnEsc(metric.value || 'Unavailable')}</span>` +
    `</div>`
  )
}

function burnMetric(metric, mode) {
  return metric?.type === 'window' ? burnWindowBar(metric, mode) : burnScalarMetric(metric || {})
}

function burnProviderFailure(health, provider) {
  const manualCredential = provider?._raw?.needsKey !== false
  return (
    `<div style="${bstyle({ paddingTop: 2 })}">` +
    `<div style="${bstyle({ padding: '10px 11px', borderRadius: 10, background: BURN.warnRowBg, color: BURN.warnText, fontFamily: BURN_FONT.sans, fontSize: 12, lineHeight: 1.45 })}">${burnEsc(health.detail)}</div>` +
    `<div style="${bstyle({ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 })}">` +
    `<button type="button" data-burn-provider-action="refresh:${burnEsc(provider.id)}" style="${burnGhostBtn()}">Refresh</button>` +
    (manualCredential ? `<button type="button" data-burn-nav="settings" style="${burnGhostBtn()}">Reconnect</button>` : '') +
    (provider?._raw?.links?.dashboard ? `<button type="button" data-burn-provider-action="account:${burnEsc(provider.id)}" style="${burnGhostBtn()}">Account</button>` : '') +
    (provider?._raw?.links?.status ? `<button type="button" data-burn-provider-action="status:${burnEsc(provider.id)}" style="${burnGhostBtn()}">Status</button>` : '') +
    `</div>` +
    `</div>`
  )
}

function burnProviderRow(p, expanded, state) {
  const mode = state.cfg?.usageMeterMode === 'left' ? 'left' : 'used'
  const primary = burnPrimaryDisplayMetric(p)
  const trend = burnTrendForWindow(p, primary)
  const health = burnProviderHealth(p, state.lastSnap?.generatedAt)
  const primaryWindow = primary?.type === 'window' || primary?.kind ? primary : null
  const forecast = burnForecastText(primaryWindow?.forecast)
  const risky = primaryWindow ? burnWindowRisk(primaryWindow) : p.status === 'warn'
  const rawPct = primaryWindow ? primaryWindow.pct : p._raw?.capturedPct != null ? p.meterPct : null
  const hasPct = rawPct != null && Number.isFinite(Number(rawPct))
  const pct = hasPct ? Number(rawPct) : null
  const currentValue = burnCurrentLabel(primary?.value || p.meterValue, pct, mode)
  const resetAt = primaryWindow?.resetAt || p._raw?.resetAt || null
  const reset = resetAt ? burnClockText(resetAt, 'Resets') : 'Reset unavailable'
  const forecastColor = forecast.tone === 'warn' ? BURN.warnText : primaryWindow?.forecast?.availability === 'ready' ? BURN.text : BURN.text2
  const statusColor = health.kind === 'error' ? BURN.warnText : health.kind === 'stale' ? BURN.text2 : BURN.limeText
  const canExpand = health.kind !== 'error'

  const header =
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 })}">` +
    burnProvGlyph(p._raw?.providerFamily || p.id, 17, health.kind === 'error' ? BURN.text2 : BURN.text) +
    `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontWeight: 750, fontSize: 15, color: BURN.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}">${burnEsc(p.name)}</span>` +
    (p._raw?.account?.label ? `<span title="Account-specific usage" style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 10.5, color: BURN.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}">${burnEsc(p._raw.account.label)}</span>` : '') +
    (p.plan ? `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11.5, color: BURN.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}">${burnEsc(p.plan)}</span>` : '') +
    `<span style="${bstyle({ flex: 1 })}"></span>` +
    (p._raw?.refreshState === 'refreshing' ? `<span class="burn-spin" role="status" aria-label="Refreshing ${burnEsc(p.name)}" style="${bstyle({ display: 'inline-flex' })}">${burnIcon('refresh', 12, BURN.text2)}</span>` : '') +
    `<span style="${bstyle({ fontFamily: BURN_FONT.mono, fontSize: 8.5, color: statusColor, letterSpacing: 0.35, whiteSpace: 'nowrap' })}">${burnEsc(health.label.toUpperCase())}</span>` +
    (canExpand ? `<span style="${bstyle({ display: 'inline-flex' })}">${burnIcon(expanded ? 'chevron-up' : 'chevron-down', 12, BURN.text2)}</span>` : '') +
    `</div>`

  const additionalPrimary = (p.primaryMetrics || []).slice(1).map((metric) => burnMetric(metric, mode)).join('')
  const summary = health.kind === 'error'
    ? header + burnProviderFailure(health, p)
    : primaryWindow ? header +
      `<div style="${bstyle({ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 9 })}">` +
      `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 14, fontWeight: 700, color: BURN.text })}">${burnEsc(primary ? burnWindowName(primary) : p.meterLabel || 'Allowance')}</span>` +
      `<span style="${bstyle({ flex: 1 })}"></span>` +
      `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 13, fontWeight: 650, color: forecastColor, textAlign: 'right' })}">${burnEsc(forecast.label)}</span>` +
      `</div>` +
      burnQuotaBar({ pct, mode, forecast: primaryWindow?.forecast, risky, height: 8 }) +
      `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9 })}">` +
      `<span role="button" tabindex="0" data-burn-display-toggle="usage" title="Show ${mode === 'used' ? 'remaining' : 'used'} usage" style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 13, fontWeight: 650, color: BURN.text, fontVariantNumeric: 'tabular-nums' })}">${burnEsc(currentValue)}</span>` +
      `<span style="${bstyle({ flex: 1 })}"></span>` +
      `<span role="button" tabindex="0" data-burn-display-toggle="reset" data-burn-clock="${resetAt || ''}" data-burn-clock-verb="Resets" title="Show ${state.openUsagePrefs?.resetDisplay === 'exact' ? 'countdown' : 'exact time'}" style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 12, color: BURN.text2, fontVariantNumeric: 'tabular-nums' })}">${burnEsc(reset)}</span>` +
      `</div>` +
      (trend
        ? `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${BURN.border}` })}">` +
          `<span style="${bstyle({ fontFamily: BURN_FONT.sans, fontSize: 11, color: BURN.text2 })}">Recent ${burnEsc(burnWindowName(primaryWindow).toLowerCase())}${/usage$/i.test(burnWindowName(primaryWindow)) ? '' : ' usage'}</span>` +
          `<span style="${bstyle({ flex: 1 })}"></span>` +
          burnSparkline({ data: trend, color: risky ? BURN.warn : BURN.lime, width: 92, height: 21, strokeWidth: 1.7 }) +
          `</div>`
        : '') + additionalPrimary
    : header + burnScalarMetric(primary || { label: 'Usage', value: 'Unavailable' })

  const control = canExpand
    ? `<div role="button" tabindex="0" data-burn-row="${burnEsc(p.id)}" aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="burn-detail-${burnEsc(p.id)}" style="${bstyle({ display: 'block', width: '100%', padding: '14px 15px 13px', border: 'none', background: 'transparent', color: BURN.text, textAlign: 'left', cursor: 'pointer' })}">${summary}</div>`
    : `<div style="${bstyle({ padding: '14px 15px 13px' })}">${summary}</div>`

  return (
    `<article class="burn-prov${expanded ? ' open' : ''}" data-burn-prov="${burnEsc(p.id)}" style="${bstyle({ margin: '0 10px 10px', border: `1px solid ${health.kind === 'error' ? BURN.warn : BURN.border}`, borderRadius: 17, background: BURN.surface2, boxShadow: BURN.shadow, overflow: 'hidden' })}">` +
    control +
    (canExpand ? `<div class="burn-detail" id="burn-detail-${burnEsc(p.id)}" aria-hidden="${expanded ? 'false' : 'true'}"${expanded ? '' : ' inert'}>${burnProviderExpanded(p, mode, health)}</div>` : '') +
    `</article>`
  )
}

function burnCostRow(label, row) {
  const tok = row?.tok
  const usd = row?.usd
  const hasTok = tok != null && Number.isFinite(Number(tok))
  const hasUsd = usd != null && Number.isFinite(Number(usd))
  const pricing = row?.pricing || {}
  const omitted = Array.isArray(pricing.unpricedModels) ? pricing.unpricedModels : []
  const provenance = hasUsd
    ? `${pricing.accuracy || 'measured'} · ${pricing.source || 'provider data'} · exact $${Number(usd).toFixed(6)}${omitted.length ? ` · omits ${omitted.join(', ')}` : ''}`
    : omitted.length ? `Unknown rate · omits ${omitted.join(', ')}` : 'No complete dollar value is available'
  const exact = `${hasTok ? `${Math.round(Number(tok) * 1e6).toLocaleString('en-US')} exact tokens · ` : ''}${provenance}`
  return (
    `<div title="${burnEsc(exact)}" style="${bstyle({ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, fontFamily: BURN_FONT.mono, fontSize: 10.5, fontVariantNumeric: 'tabular-nums', padding: '5px 0' })}">` +
    `<span style="${bstyle({ color: BURN.text2 })}">${burnEsc(label)}</span>` +
    `<span style="${bstyle({ color: hasTok ? BURN.text : BURN.text2 })}">${hasTok ? burnFormatTokensM(tok) + ' tokens' : 'Unavailable'}</span>` +
    `<span style="${bstyle({ color: hasUsd ? BURN.limeText : BURN.text2 })}">${hasUsd ? '$' + Number(usd).toFixed(2) + (omitted.length ? '*' : '') : 'Unpriced'}</span>` +
    `</div>`
  )
}

function burnModelRow(m) {
  const hasUsd = m.usd != null && Number.isFinite(Number(m.usd))
  const detail = `${Math.round(Number(m.tok) * 1e6).toLocaleString('en-US')} exact tokens · ${hasUsd ? `${burnCostKind(m.costAccuracy)} · ${m.pricingSource || 'provider data'}${m.pricingModel ? ` · ${m.pricingModel}` : ''} · exact $${Number(m.usd).toFixed(6)}` : 'Unknown model rate'}`
  return (
    `<div style="${bstyle({ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 9, alignItems: 'baseline', fontFamily: BURN_FONT.mono, fontSize: 10.5, fontVariantNumeric: 'tabular-nums' })}">` +
    `<span style="${bstyle({ color: BURN.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}">${burnEsc(m.name)}</span>` +
    `<span style="${bstyle({ color: BURN.text2 })}">${burnFormatTokensM(m.tok)} tok</span>` +
    `<span title="${burnEsc(detail)}" style="${bstyle({ color: hasUsd ? BURN.limeText : BURN.text2, minWidth: 55, textAlign: 'right' })}">${hasUsd ? '$' + Number(m.usd).toFixed(2) : 'unpriced'}</span>` +
    `</div>`
  )
}

function burnResetCredits(provider) {
  const reset = provider?._raw?.resetCredits
  if (!reset) return ''
  const count = reset.availableCount == null || reset.availableCount === '' ? null : Number(reset.availableCount)
  const credits = Array.isArray(reset.credits) ? reset.credits : []
  const timeline = reset.expiryAvailable === false
    ? `<div style="${bstyle({ color: BURN.text2, fontSize: 10.5 })}">Expiry timeline unavailable${reset.error ? ` · ${burnEsc(burnSafeError(reset.error))}` : ''}</div>`
    : credits.length
      ? credits.map((credit, index) => {
          const expires = credit.expiresAt ? burnClockText(credit.expiresAt, 'Expires') : 'Expiry unavailable'
          const urgent = !!credit.urgency && !['normal', 'none'].includes(String(credit.urgency).toLowerCase())
          const pending = burnState.creditClaim?.providerId === provider.id && burnState.creditClaim?.creditId === credit.id ? burnState.creditClaim : null
          const action = pending?.status === 'confirm'
            ? `<span style="${bstyle({ display: 'inline-flex', gap: 5 })}"><button type="button" data-burn-credit="confirm" style="${burnPrimaryBtn()}">Confirm use</button><button type="button" data-burn-credit="cancel" style="${burnGhostBtn()}">Cancel</button></span>`
            : pending?.status === 'retry'
              ? `<span style="${bstyle({ display: 'inline-flex', gap: 5 })}"><button type="button" data-burn-credit="confirm" style="${burnPrimaryBtn()}">Retry refresh</button><button type="button" data-burn-credit="cancel" style="${burnGhostBtn()}">Dismiss</button></span>`
            : pending?.status === 'checking' || pending?.status === 'redeeming'
              ? `<button type="button" disabled style="${burnGhostBtn()}">${pending.status === 'checking' ? 'Checking…' : 'Using…'}</button>`
              : `<button type="button" data-burn-credit="prepare|${burnEsc(provider.id)}|${burnEsc(credit.id)}"${credit.status && credit.status !== 'available' ? ' disabled' : ''} style="${burnGhostBtn()}">Use credit</button>`
          return `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${BURN.border}` })}"><span style="${bstyle({ color: urgent ? BURN.warnText : BURN.text, fontFamily: BURN_FONT.mono, fontSize: 10.5 })}">#${index + 1}${urgent ? ` · ${burnEsc(String(credit.urgency).toUpperCase())}` : ''}</span><span data-burn-clock="${credit.expiresAt || ''}" data-burn-clock-verb="Expires" style="${bstyle({ flex: 1, color: BURN.text2, fontSize: 10.5 })}">${burnEsc(expires)}</span>${action}</div>`
        }).join('')
      : `<div style="${bstyle({ color: BURN.text2, fontSize: 10.5 })}">No expiration dates reported.</div>`
  const claim = burnState.creditClaim?.providerId === provider.id && ['error', 'retry', 'done'].includes(burnState.creditClaim.status)
    ? `<div role="status" style="${bstyle({ color: burnState.creditClaim.status === 'error' ? BURN.warnText : BURN.limeText, fontSize: 10.5, paddingTop: 5 })}">${burnEsc(burnState.creditClaim.error || burnState.creditClaim.message)}</div>`
    : ''
  return burnSectionHead('RATE LIMIT RESETS', Number.isFinite(count) ? `${count} AVAILABLE` : 'COUNT UNAVAILABLE') + timeline + claim
}

function burnProviderExpanded(p, mode, health) {
  const x = burnAdaptExpanded(p._raw || {}, { now: Date.now() })
  const secondaryMetrics = Array.isArray(p.expandedMetrics) && p.expandedMetrics.length
    ? p.expandedMetrics
    : (Array.isArray(p.windows) ? p.windows.slice(1) : [])
  const windows = secondaryMetrics.length
    ? `<div style="${bstyle({ display: 'flex', flexDirection: 'column', gap: 7 })}">${secondaryMetrics.map((metric) => burnMetric(metric, mode)).join('')}</div>`
    : ''
  const costHeading = x.pricing.accuracy === 'measured'
    ? 'MEASURED SPEND'
    : x.pricing.accuracy === 'hypothetical'
      ? 'HYPOTHETICAL API-EQUIVALENT VALUE'
      : 'ESTIMATED API-EQUIVALENT SPEND'
  const cost = x.hasTokenSource && x.hasDailyUsage
    ? burnSectionHead(costHeading, x.costMeta) +
      `<div>${burnCostRow('Today', x.tokens.today)}${burnCostRow('Yesterday', x.tokens.yest)}${burnCostRow('Last 30d', x.tokens.last30)}</div>` +
      (x.pricing.unpricedModels.length ? `<div style="${bstyle({ color: BURN.warnText, fontFamily: BURN_FONT.sans, fontSize: 10.5 })}">Partial total — omits ${burnEsc(x.pricing.unpricedModels.join(', '))}</div>` : '')
    : ''
  const tokens = x.hasTokenSource
    ? burnSectionHead('MEASURED TOKENS', `${x.inOut.events.toLocaleString()} EVENTS`) +
      `<div style="${bstyle({ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 })}">${burnStat('IN', burnFormatTokensM(x.inOut.in))}${burnStat('CACHED', burnFormatTokensM(x.inOut.cached))}${burnStat('OUT', burnFormatTokensM(x.inOut.out))}</div>`
    : ''
  const models = x.models.length
    ? burnSectionHead('MODEL USAGE', `${x.models.length} ACTIVE`) + `<div style="${bstyle({ display: 'flex', flexDirection: 'column', gap: 8 })}">${x.models.map(burnModelRow).join('')}</div>`
    : ''
  const freshness = `<div style="${bstyle({ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: BURN_FONT.sans, fontSize: 10.5, color: BURN.text2 })}"><span>${burnEsc(health.detail)}</span><span style="${bstyle({ whiteSpace: 'nowrap' })}">${burnEsc(health.label)}</span></div>` +
    `<div style="${bstyle({ display: 'flex', flexWrap: 'wrap', gap: 6 })}"><button type="button" data-burn-provider-action="refresh:${burnEsc(p.id)}" style="${burnGhostBtn()}">Refresh</button>${p._raw?.links?.dashboard ? `<button type="button" data-burn-provider-action="account:${burnEsc(p.id)}" style="${burnGhostBtn()}">Account</button>` : ''}${p._raw?.links?.status ? `<button type="button" data-burn-provider-action="status:${burnEsc(p.id)}" style="${burnGhostBtn()}">Status</button>` : ''}<button type="button" data-burn-share="provider|${burnEsc(p.id)}" style="${burnGhostBtn()}">Copy PNG</button></div>`

  return `<div style="${bstyle({ padding: '10px 15px 13px', borderTop: `1px solid ${BURN.border}`, display: 'flex', flexDirection: 'column', gap: 12 })}">${windows}${cost}${tokens}${models}${burnResetCredits(p)}${freshness}</div>`
}

function burnHomeOrder(state) {
  const order = []
  const seen = new Set()
  for (const id of state.settingsOrder || []) if (!seen.has(id)) { seen.add(id); order.push(id) }
  for (const id of state.config?.providerOrder || []) if (!seen.has(id)) { seen.add(id); order.push(id) }
  const rank = new Map(order.map((id, i) => [id, i]))
  return (state.providers || [])
    .filter((p) => burnProviderVisibleById(state, p.id))
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (rank.get(a.p.id) ?? Infinity) - (rank.get(b.p.id) ?? Infinity) || a.i - b.i)
    .map((x) => x.p)
}

function burnHomeEmpty() {
  return (
    `<div style="${bstyle({ margin: '4px 10px 14px', padding: '28px 22px', border: `1px solid ${BURN.border}`, borderRadius: 17, background: BURN.surface2, textAlign: 'center' })}">` +
    `<div style="${bstyle({ fontSize: 15, fontWeight: 750, color: BURN.text })}">No providers to show</div>` +
    `<div style="${bstyle({ marginTop: 6, fontSize: 12.5, lineHeight: 1.45, color: BURN.text2 })}">Enable a provider, then refresh to load its allowance.</div>` +
    `<button type="button" data-burn-nav="settings" style="${bstyle({ marginTop: 14, padding: '8px 12px', borderRadius: 9, border: `1px solid ${BURN.accentBtnBorder}`, background: BURN.accentBtnBg, color: BURN.limeText, fontWeight: 700, cursor: 'pointer' })}">Open Settings</button>` +
    `</div>`
  )
}

function burnReportNumber(value, metric) {
  if (value == null || !Number.isFinite(Number(value))) return 'Unavailable'
  if (metric === 'tokens') return `${Math.round(Number(value)).toLocaleString()} tokens`
  if (metric === 'costPerMTok') return `$${Number(value).toFixed(2)}/MTok`
  return `$${Number(value).toFixed(2)}`
}

function burnReportShareControls(state) {
  if (!state.shareTarget) return ''
  return `<div role="dialog" aria-label="PNG sharing options" style="${bstyle({ margin: '0 10px 10px', padding: '10px 12px', border: `1px solid ${BURN.borderHi}`, borderRadius: 11, background: BURN.surface2 })}">` +
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 8 })}"><strong style="${bstyle({ color: BURN.text, fontSize: 12 })}">Copy ${state.shareTarget.kind === 'provider' ? 'provider' : 'spend'} card</strong><span style="${bstyle({ flex: 1 })}"></span><button type="button" data-burn-share="close" aria-label="Close sharing options" style="${burnGhostBtn()}">×</button></div>` +
    `<div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 8 })}"><label style="${bstyle({ display: 'inline-flex', alignItems: 'center', gap: 5, color: BURN.text2, fontSize: 10.5 })}"><input type="checkbox" data-burn-share-redact="accountLabels"${state.shareRedact.accountLabels ? ' checked' : ''}> Hide accounts</label><label style="${bstyle({ display: 'inline-flex', alignItems: 'center', gap: 5, color: BURN.text2, fontSize: 10.5 })}"><input type="checkbox" data-burn-share-redact="spend"${state.shareRedact.spend ? ' checked' : ''}> Hide spend</label><span style="${bstyle({ flex: 1 })}"></span><button type="button" data-burn-share="copy" style="${burnPrimaryBtn()}">Copy PNG</button></div>` +
    (state.shareNotice ? `<div role="status" style="${bstyle({ marginTop: 7, color: /copied/i.test(state.shareNotice) ? BURN.limeText : BURN.warnText, fontSize: 10.5 })}">${burnEsc(state.shareNotice)}</div>` : '') + `</div>`
}

function burnReportCard(state) {
  if (typeof BurnReport === 'undefined' || !state.lastSnap) return ''
  const report = BurnReport.build(state.lastSnap, { period: state.reportPeriod, now: Date.now() })
  const hasAnyHistory = (state.lastSnap.providers || []).some((provider) => {
    const usage = provider?.tokenUsage
    return (Array.isArray(usage?.dailyBreakdown) && usage.dailyBreakdown.length) || (Array.isArray(usage?.dailyUsage) && usage.dailyUsage.length)
  })
  if (!hasAnyHistory) return ''
  const projection = report.projection(state.reportMetric)
  const expanded = state.openUsagePrefs?.combinedUsageExpanded === true
  const metricOptions = [['cost', 'Cost'], ['tokens', 'Tokens'], ['costPerMTok', 'Cost/MTok']]
  const periodOptions = [['today', 'Today'], ['yesterday', 'Yesterday'], ['30d', '30 days']]
  const metricButton = ([value, label]) => `<button type="button" data-burn-report-metric="${value}" aria-pressed="${state.reportMetric === value}" style="${bstyle({ padding: '5px 7px', borderRadius: 7, border: `1px solid ${state.reportMetric === value ? BURN.accentBtnBorder : BURN.border}`, background: state.reportMetric === value ? BURN.accentBtnBg : 'transparent', color: state.reportMetric === value ? BURN.limeText : BURN.text2, fontFamily: BURN_FONT.mono, fontSize: 9, cursor: 'pointer' })}">${label}</button>`
  const periodButton = ([value, label]) => `<button type="button" data-burn-report-period="${value}" aria-pressed="${state.reportPeriod === value}" style="${bstyle({ padding: '5px 7px', borderRadius: 7, border: 'none', background: state.reportPeriod === value ? BURN.text4 : 'transparent', color: state.reportPeriod === value ? BURN.text : BURN.text2, fontFamily: BURN_FONT.sans, fontSize: 10, cursor: 'pointer' })}">${label}</button>`
  const chartMetric = state.reportMetric === 'tokens' ? 'tokens' : state.reportMetric === 'costPerMTok' ? 'costPerMTok' : 'usd'
  const values = report.days.map((day) => day[chartMetric] || 0)
  const max = Math.max(...values, 1)
  const bars = report.days.map((day) => {
    const value = day[chartMetric]
    const height = day.observed ? Math.max(2, Math.round(((value || 0) / max) * 34)) : 2
    const title = `${day.date}: ${day.observed ? burnReportNumber(value, chartMetric === 'tokens' ? 'tokens' : chartMetric === 'costPerMTok' ? 'costPerMTok' : 'cost') : 'No observation'}`
    return `<span title="${burnEsc(title)}" aria-label="${burnEsc(title)}" style="${bstyle({ flex: 1, minWidth: state.reportPeriod === '30d' ? 2 : 18, height, background: day.observed ? BURN.lime : BURN.text4, opacity: day.observed ? 0.75 : 0.35 })}"></span>`
  }).join('')
  const dayDetails = report.days.map((day) => `<div style="${bstyle({ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, padding: '3px 0', color: day.observed ? BURN.text2 : BURN.text3, fontSize: 9.5 })}"><span>${burnEsc(day.date)}</span><span>${day.observed && day.tokens != null ? `${Math.round(day.tokens).toLocaleString()} tokens` : 'No observation'}</span><span>${day.observed && day.usd != null ? `$${day.usd.toFixed(6)}${day.costPerMTok != null ? ` · $${day.costPerMTok.toFixed(2)}/MTok` : ''}` : 'Cost unavailable'}</span></div>`).join('')
  const slices = projection.slices.map((slice) => {
    const detail = `${slice.tokens == null ? 'Token count unavailable' : `${Math.round(slice.tokens).toLocaleString()} exact tokens`} · ${slice.usd == null ? 'Cost unavailable' : `$${slice.usd.toFixed(6)} exact API-equivalent cost`} · ${slice.source || 'source unavailable'}`
    return `<div tabindex="0" aria-label="${burnEsc(`${slice.name}. ${detail}`)}" title="${burnEsc(detail)}" style="${bstyle({ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, padding: '4px 0', fontSize: 10.5 })}"><span style="${bstyle({ color: BURN.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}">${burnEsc(slice.name)}${slice.accountLabel ? ` · ${burnEsc(slice.accountLabel)}` : ''}</span><span style="${bstyle({ color: BURN.text, fontFamily: BURN_FONT.mono })}">${burnEsc(burnReportNumber(slice.displayAmount, state.reportMetric))}${slice.partialCost && state.reportMetric !== 'tokens' ? '*' : ''}</span></div>`
  }).join('')
  const models = report.models.length
    ? report.models.map((model) => {
        const detail = `${model.tokens == null ? 'Tokens unavailable' : `${Math.round(model.tokens).toLocaleString()} exact tokens`} · ${model.usd == null ? 'Cost unavailable' : `$${model.usd.toFixed(6)} exact API-equivalent cost`} · ${model.source || 'source unavailable'}`
        return `<div tabindex="0" aria-label="${burnEsc(`${model.label}. ${detail}`)}" title="${burnEsc(detail)}" style="${bstyle({ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 8, padding: '4px 0', fontSize: 10 })}"><span style="${bstyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: BURN.text })}">${burnEsc(model.label)}</span><span style="${bstyle({ color: BURN.text2, fontFamily: BURN_FONT.mono })}">${model.tokens == null ? '—' : burnFormatTokensM(model.tokens / 1e6)}</span><span style="${bstyle({ color: model.usd == null ? BURN.text2 : BURN.limeText, fontFamily: BURN_FONT.mono })}">${model.usd == null ? 'unpriced' : `$${model.usd.toFixed(2)}`}</span></div>`
      }).join('')
    : `<div style="${bstyle({ color: BURN.text2, fontSize: 10.5, paddingTop: 5 })}">No period-specific model detail was reported.</div>`
  const summary = `${periodOptions.find(([value]) => value === state.reportPeriod)?.[1] || '30 days'} · ${burnReportNumber(projection.total, state.reportMetric)}`
  const toggle = `<button type="button" data-burn-report-toggle aria-expanded="${expanded}" aria-controls="burn-report-details" style="${bstyle({ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: expanded ? '0 0 10px' : '10px 12px', border: 'none', background: 'transparent', color: BURN.text, cursor: 'pointer', textAlign: 'left' })}"><strong style="${bstyle({ fontSize: 12.5 })}">Combined usage</strong><span style="${bstyle({ flex: 1 })}"></span><span style="${bstyle({ color: BURN.text2, fontFamily: BURN_FONT.mono, fontSize: 9.5, fontWeight: 500, fontVariantNumeric: 'tabular-nums' })}">${burnEsc(summary)}</span>${burnIcon(expanded ? 'chevron-up' : 'chevron-down', 11, BURN.text2)}</button>`
  if (!expanded) {
    return `<section id="burn-report-card" aria-label="Combined usage report" style="${bstyle({ margin: '0 10px 10px', border: `1px solid ${BURN.border}`, borderRadius: 12, background: BURN.surface2 })}">${toggle}</section>`
  }
  return `<section id="burn-report-card" aria-label="Combined usage report" style="${bstyle({ margin: '0 10px 10px', padding: '12px 14px', border: `1px solid ${BURN.borderHi}`, borderRadius: 14, background: BURN.surface2 })}">` +
    toggle +
    `<div id="burn-report-details"><div style="${bstyle({ display: 'flex', alignItems: 'center', gap: 6 })}"><span style="${bstyle({ flex: 1 })}"></span>${metricOptions.map(metricButton).join('')}</div>` +
    `<div style="${bstyle({ display: 'flex', alignItems: 'baseline', gap: 8, paddingTop: 9 })}"><span style="${bstyle({ color: BURN.limeText, fontFamily: BURN_FONT.mono, fontSize: 22, fontWeight: 700 })}">${burnEsc(burnReportNumber(projection.total, state.reportMetric))}</span><span style="${bstyle({ color: BURN.text2, fontSize: 9.5 })}">${report.coverage.pairedProviders} provider${report.coverage.pairedProviders === 1 ? '' : 's'} with matched priced rows${report.coverage.partial ? ' · partial rates omitted' : ''}</span></div>` +
    `<div style="${bstyle({ display: 'flex', gap: 2, alignItems: 'end', height: 38, paddingTop: 4 })}" role="img" aria-label="Calendar usage trend">${bars}</div>` +
    `<details style="${bstyle({ paddingTop: 4 })}"><summary style="${bstyle({ color: BURN.text3, fontFamily: BURN_FONT.mono, fontSize: 9, cursor: 'pointer' })}">Exact daily counts</summary><div style="${bstyle({ maxHeight: 150, overflowY: 'auto', paddingTop: 4 })}">${dayDetails}</div></details>` +
    `<div style="${bstyle({ display: 'flex', gap: 2, alignItems: 'center', paddingTop: 7 })}">${periodOptions.map(periodButton).join('')}<span style="${bstyle({ flex: 1 })}"></span><button type="button" data-burn-report-models aria-expanded="${state.reportModelsOpen}" style="${burnGhostBtn()}">Models ${state.reportModelsOpen ? '▴' : '▾'}</button><button type="button" data-burn-share="aggregate" style="${burnGhostBtn()}">Copy PNG</button></div>` +
    `<div style="${bstyle({ paddingTop: 7, borderTop: `1px solid ${BURN.border}`, marginTop: 7 })}">${slices || `<span style="${bstyle({ color: BURN.text2, fontSize: 10.5 })}">No ${state.reportMetric} coverage for this period.</span>`}</div>` +
    (state.reportModelsOpen ? `<div style="${bstyle({ paddingTop: 7, borderTop: `1px solid ${BURN.border}`, marginTop: 7 })}">${models}</div>` : '') +
    `<div style="${bstyle({ color: BURN.text3, fontSize: 9, paddingTop: 7 })}">API-equivalent spend only · subscription totals excluded${report.coverage.partial ? ' · *partial pricing' : ''}</div></div></section>`
}

function burnRenderHome(state) {
  const providers = burnHomeOrder(state)
  const risks = providers.reduce((count, p) => count + (p.windows || []).filter(burnWindowRisk).length, 0)
  const stale = providers.filter((p) => burnProviderHealth(p, state.lastSnap?.generatedAt).kind === 'stale').length
  const rows = providers.length ? providers.map((p) => burnProviderRow(p, state.expandedIds?.[p.id] === true, state)).join('') : burnHomeEmpty()
  return (
    burnHeader({ title: 'BURN', hasSignals: typeof optHasSignals === 'function' && optHasSignals(state) }) +
    burnLiveStrip({ streams: providers.length, burning: risks, stale, syncing: state.syncing }) +
    (state.syncError ? `<div role="status" style="${bstyle({ margin: '0 10px 10px', padding: '8px 10px', borderRadius: 9, background: BURN.warnRowBg, color: BURN.warnText, fontSize: 11.5 })}">${burnEsc(state.syncError)}</div>` : '') +
    `<main class="burn-body" style="${bstyle({ flex: 1, overflowY: 'auto', paddingBottom: 2 })}">${burnReportCard(state)}${burnReportShareControls(state)}${rows}</main>` +
    burnFooter({ items: state.footer, syncing: state.syncing })
  )
}
