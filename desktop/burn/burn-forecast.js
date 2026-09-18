/* Forecast rail for BURN quota windows. Classic script. */

function burnForecastBar({
  pct,
  mode = 'used',
  forecast = null,
  burning = false,
  height = 8,
  showLegend = true,
  showEvenPace = false,
} = {}) {
  const current = Math.max(0, Math.min(100, Number(pct) || 0))
  const ready = forecast?.availability === 'ready' || forecast?.availability === 'exhausted'
  const projected = ready
    ? Number(mode === 'left' ? forecast.markerLeftPct : forecast.markerUsedPct)
    : NaN
  const even = ready && showEvenPace
    ? Number(mode === 'left' ? forecast.evenPaceLeftPct : forecast.evenPaceUsedPct)
    : NaN
  const projectedPct = Number.isFinite(projected) ? Math.max(0, Math.min(100, projected)) : null
  const evenPct = Number.isFinite(even) ? Math.max(0, Math.min(100, even)) : null
  const orientation = mode === 'left' ? 'left' : 'used'
  const currentLabel = `${Math.round(current)}% ${orientation}`
  const forecastLabel = ready ? forecast.label : forecast?.label || 'Forecast unavailable'
  const aria = `${currentLabel}. Projected endpoint: ${forecastLabel}.${evenPct == null ? '' : ` Even-pace reference: ${Math.round(evenPct)}% ${orientation}.`}`
  const fill = burning || forecast?.tone === 'warn' ? BURN.warn : BURN.lime
  const projectedMarker = projectedPct == null
    ? ''
    : `<span class="burn-forecast-marker" data-projected-pct="${projectedPct}" title="Projected endpoint · ${burnEsc(forecastLabel)}" style="${bstyle({
        position: 'absolute',
        left: `calc(${projectedPct}% - 1px)`,
        top: -4,
        width: 2,
        height: height + 8,
        borderRadius: 1,
        background: BURN.text,
        zIndex: 2,
      })}"></span>`
  const evenMarker = evenPct == null || Math.abs(evenPct - projectedPct) < 1
    ? ''
    : `<span title="Even-pace reference · ${Math.round(evenPct)}% ${orientation}" style="${bstyle({
        position: 'absolute',
        left: `calc(${evenPct}% - 1px)`,
        top: -3,
        width: 0,
        height: height + 6,
        borderLeft: `1px dashed ${BURN.text2}`,
        zIndex: 1,
      })}"></span>`
  const legend = showLegend
    ? `<div style="${bstyle({
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
        marginTop: 6,
        fontFamily: BURN_FONT.mono,
        fontSize: 9,
        color: BURN.text2,
        letterSpacing: 0.35,
        fontVariantNumeric: 'tabular-nums',
      })}">` +
      `<span>${burnEsc(ready ? `PROJECTED ENDPOINT · ${forecastLabel}` : forecastLabel)}</span>` +
      `${evenPct == null ? '' : `<span>EVEN PACE ${Math.round(evenPct)}%</span>`}` +
      `</div>`
    : ''

  return (
    `<div class="burn-forecast" role="img" aria-label="${burnEsc(aria)}">` +
    `<div class="burn-forecast-rail" style="${bstyle({ position: 'relative', width: '100%', height, background: BURN.text4, borderRadius: height / 2 })}">` +
    `<span class="burn-forecast-fill" style="${bstyle({ display: 'block', width: `${current}%`, height: '100%', background: fill, borderRadius: 'inherit' })}"></span>` +
    projectedMarker + evenMarker +
    `</div>${legend}</div>`
  )
}
