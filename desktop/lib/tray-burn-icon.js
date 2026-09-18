const zlib = require('zlib')
const BurnMetrics = require('../burn/burn-metrics')

const TRAY_BURN_COLORS = {
  warning: '#FF6B5C',
  trackEdge: '#000000',
  track: '#8A8A8A',
  fill: '#F5F5F5',
}

function numberOrNaN(value) {
  if (value == null || value === '') return Number.NaN
  return Number(value)
}

function primaryWindow(provider) {
  const windows = Array.isArray(provider?.windows) ? provider.windows : []
  return windows.find((window) => window?.kind === '5h') || null
}

function metricForProvider(provider, config) {
  const primary = primaryWindow(provider) || provider
  const used = numberOrNaN(primary?.usedPct ?? provider?.capturedPct)
  const left = numberOrNaN(primary === provider ? provider?.remainingPct : primary?.remainingPct)
  if (config?.usageMeterMode === 'left') {
    if (Number.isFinite(left)) return { pct: Math.max(0, Math.min(100, left)), available: true }
    if (Number.isFinite(used)) return { pct: Math.max(0, Math.min(100, 100 - used)), available: true }
    return { pct: 0, available: false }
  }
  if (Number.isFinite(used)) return { pct: Math.max(0, Math.min(100, used)), available: true }
  if (Number.isFinite(left)) return { pct: Math.max(0, Math.min(100, 100 - left)), available: true }
  return { pct: 0, available: false }
}

function providerWarning(provider, config) {
  const primary = primaryWindow(provider) || provider
  const remaining = numberOrNaN(primary === provider ? provider?.remainingPct : primary?.remainingPct)
  const used = numberOrNaN(primary?.usedPct ?? provider?.capturedPct)
  const reserve = numberOrNaN(config?.maxxAlertReservePct)
  const threshold = Number.isFinite(reserve) ? reserve : 25
  if (Number.isFinite(remaining) && remaining <= threshold) return true
  return Number.isFinite(used) && used >= 100 - threshold
}

function activeProviders(snap, config) {
  const providers = Array.isArray(snap?.providers) ? snap.providers : []
  const byId = new Map(providers.filter((provider) => provider?.id).map((provider) => [provider.id, provider]))
  const snapshotEnabledIds = Array.isArray(snap?.enabledProviderIds) ? snap.enabledProviderIds : []
  const configuredIds = [
    ...(Array.isArray(config?.providerOrder) ? config.providerOrder : []),
    ...Object.keys(config?.providers || {}),
  ]
  const enabledIds = []
  const seen = new Set()
  for (const id of [...snapshotEnabledIds, ...configuredIds]) {
    if (seen.has(id)) continue
    seen.add(id)
    if (snapshotEnabledIds.includes(id) || config?.providers?.[id]?.enabled) enabledIds.push(id)
  }
  if (enabledIds.length) {
    return enabledIds.map((id) => byId.get(id) || {
      id,
      name: config?.providers?.[id]?.name || id,
      capturedPct: null,
      remainingPct: null,
      connected: false,
    })
  }
  const active = providers.filter((provider) => {
    if (!provider?.id) return false
    return provider.connected !== false || provider.capturedPct != null || provider.remainingPct != null
  })
  return active.length ? active : providers.slice(0, 1)
}

function trayBurnbarStateFromSnapshot(snap, config = {}) {
  const mode = config.usageMeterMode === 'left' ? 'left' : 'used'
  const providers = activeProviders(snap, config).slice(0, 3)
  const bars = providers.map((provider) => {
    const metric = metricForProvider(provider, config)
    return {
      name: provider.name || provider.id || 'Usage',
      pct: metric.pct,
      available: metric.available,
      connected: provider.connected !== false,
      warning: metric.available && providerWarning(provider, config),
    }
  })
  const details = bars.map((bar) => {
    if (!bar.connected && !bar.available) return `${bar.name} disconnected`
    if (!bar.available) return `${bar.name} usage unavailable`
    const value = `${bar.name} ${Math.round(bar.pct)}% ${mode}`
    return bar.connected ? value : `${value} (disconnected)`
  }).join(' · ')
  return {
    bars,
    tooltip: details ? `MaxxToken - BURN bars - ${details}` : 'MaxxToken - BURN bars',
  }
}

function trayPinnedStateFromSnapshot(snap, config = {}) {
  const providers = new Map((Array.isArray(snap?.providers) ? snap.providers : []).map((provider) => [provider.id, provider]))
  const layouts = config.metricLayouts || {}
  const providerOrder = new Map((config.providerOrder || []).map((id, index) => [id, index]))
  const pins = BurnMetrics.normalizePins(config.trayPins, layouts).sort((a, b) => {
    const providerRank = (providerOrder.get(a.providerId) ?? 999) - (providerOrder.get(b.providerId) ?? 999)
    if (providerRank) return providerRank
    const order = layouts[a.providerId]?.order || []
    return order.indexOf(a.metricId) - order.indexOf(b.metricId)
  })
  const mode = config.usageMeterMode === 'left' ? 'left' : 'used'
  const bars = []
  const texts = []
  const details = []
  for (const pin of pins) {
    const provider = providers.get(pin.providerId)
    if (!provider || provider.connected === false) continue
    const metric = BurnMetrics.metricForPin(provider, pin.metricId)
    if (!metric) continue
    const text = BurnMetrics.metricText(metric, mode)
    if (!text) continue
    details.push(`${provider.name || provider.id}: ${text}`)
    if (pin.style === 'bar' && metric.type === 'window') {
      const pct = BurnMetrics.metricPercent(metric, mode)
      if (pct == null) continue
      bars.push({
        name: `${provider.name || provider.id} ${metric.label}`,
        pct,
        available: true,
        connected: true,
        warning: mode === 'left'
          ? pct <= (Number(config.maxxAlertReservePct) || 25)
          : pct >= 100 - (Number(config.maxxAlertReservePct) || 25),
      })
    } else if (texts.length < 3) {
      texts.push(`${provider.name || provider.id} ${metric.type === 'window' ? Math.round(BurnMetrics.metricPercent(metric, mode)) + '%' : metric.value}`)
    }
  }
  let title = texts.join(' · ')
  if (title.length > 42) title = `${title.slice(0, 39)}…`
  return {
    bars: bars.slice(0, 3),
    title: title ? ` ${title}` : '',
    tooltip: details.length ? `MaxxToken - ${details.join(' · ')}` : 'MaxxToken - pinned metrics unavailable',
  }
}

function pngCrcTable() {
  const table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}

const PNG_CRC = pngCrcTable()

function pngCrc(type, data) {
  let c = 0xffffffff
  const bytes = Buffer.concat([Buffer.from(type), data])
  for (const byte of bytes) c = PNG_CRC[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(pngCrc(type, data), 8 + data.length)
  return out
}

function rgba(hex) {
  const s = hex.replace('#', '')
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), 255]
}

function createPng(width, height, draw) {
  const pixels = Buffer.alloc(width * height * 4)
  const set = (x, y, color) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = (y * width + x) * 4
    pixels[i] = color[0]
    pixels[i + 1] = color[1]
    pixels[i + 2] = color[2]
    pixels[i + 3] = color[3]
  }
  draw(set)

  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function drawRect(set, scale, x, y, width, height, color) {
  const xx = Math.round(x * scale)
  const yy = Math.round(y * scale)
  const ww = Math.round(width * scale)
  const hh = Math.round(height * scale)
  for (let py = yy; py < yy + hh; py++) {
    for (let px = xx; px < xx + ww; px++) set(px, py, color)
  }
}

function drawTrayBar(set, scale, { x, y, width, height, pct, warning }) {
  const edge = rgba(TRAY_BURN_COLORS.trackEdge)
  const track = rgba(TRAY_BURN_COLORS.track)
  const fill = rgba(warning ? TRAY_BURN_COLORS.warning : TRAY_BURN_COLORS.fill)
  const inset = 0.5
  const innerWidth = Math.max(0, width - inset * 2)
  const innerHeight = Math.max(0, height - inset * 2)

  drawRect(set, scale, x, y, width, height, edge)
  drawRect(set, scale, x + inset, y + inset, innerWidth, innerHeight, track)

  const numericPct = numberOrNaN(pct)
  const clampedPct = Number.isFinite(numericPct) ? Math.max(0, Math.min(100, numericPct)) : 0
  const fillWidth = (clampedPct / 100) * innerWidth
  if (fillWidth > 0) drawRect(set, scale, x + inset, y + inset, fillWidth, innerHeight, fill)
}

function renderTrayBurnbarPng(bars, { width = 22, height = 22, barHeight = 4, scale = 2 } = {}) {
  const items = Array.isArray(bars) && bars.length ? bars.slice(0, 3) : [{ pct: 0, warning: false }]
  return createPng(width * scale, height * scale, (set) => {
    if (items.length > 1) {
      const rowHeight = barHeight + 2
      const startY = Math.round((height - items.length * rowHeight) / 2)
      items.forEach((item, index) => {
        drawTrayBar(set, scale, {
          x: 0,
          y: startY + index * rowHeight,
          width,
          height: barHeight,
          pct: item.pct,
          warning: item.warning,
        })
      })
      return
    }

    drawTrayBar(set, scale, {
      x: 0,
      y: Math.round((height - barHeight) / 2),
      width,
      height: barHeight,
      pct: items[0].pct,
      warning: items[0].warning,
    })
  })
}

module.exports = { renderTrayBurnbarPng, trayBurnbarStateFromSnapshot, trayPinnedStateFromSnapshot, TRAY_BURN_COLORS }
