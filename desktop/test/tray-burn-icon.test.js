const test = require('node:test')
const assert = require('node:assert/strict')
const zlib = require('node:zlib')
const { renderTrayBurnbarPng, trayBurnbarStateFromSnapshot } = require('../lib/tray-burn-icon')

function decodePng(png) {
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  const chunks = []
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length))
    offset += 12 + length
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks))
  const pixel = (x, y) => {
    const offset = y * (width * 4 + 1) + 1 + x * 4
    return [...raw.subarray(offset, offset + 4)]
  }
  return { width, height, pixel }
}

test('tray burn bars keep a one-device-pixel edge and a readable empty track', () => {
  const image = decodePng(renderTrayBurnbarPng([{ pct: 50 }]))

  assert.deepEqual([image.width, image.height], [44, 44])
  assert.deepEqual(image.pixel(0, 18), [0, 0, 0, 255])
  assert.deepEqual(image.pixel(1, 19), [245, 245, 245, 255])
  assert.deepEqual(image.pixel(30, 19), [138, 138, 138, 255])
  assert.deepEqual(image.pixel(0, 19), [0, 0, 0, 255])
})

test('tray burn bar state labels rows and does not warn for missing values', () => {
  const snap = {
    enabledProviderIds: ['codex', 'claude'],
    providers: [
      { id: 'codex', name: 'Codex', windows: [{ kind: '5h', usedPct: 46, remainingPct: 54 }] },
      { id: 'claude', name: 'Claude', capturedPct: null, remainingPct: null },
    ],
  }
  const state = trayBurnbarStateFromSnapshot(snap, {
    usageMeterMode: 'used',
    maxxAlertReservePct: 25,
  })

  assert.deepEqual(state.bars, [
    { name: 'Codex', pct: 46, available: true, connected: true, warning: false },
    { name: 'Claude', pct: 0, available: false, connected: true, warning: false },
  ])
  assert.equal(state.tooltip, 'MaxxToken - BURN bars - Codex 46% used · Claude usage unavailable')
})

test('tray burn bar state preserves used and left values while keeping measured zero distinct', () => {
  const snap = {
    enabledProviderIds: ['missing', 'zero', 'codex'],
    providers: [
      { id: 'codex', name: 'Codex', windows: [{ kind: '5h', usedPct: 46, remainingPct: 54 }] },
      { id: 'zero', name: 'Zero', windows: [{ kind: '5h', usedPct: 0, remainingPct: 100 }] },
      { id: 'missing', name: 'Missing', capturedPct: null, remainingPct: null },
    ],
  }

  const used = trayBurnbarStateFromSnapshot(snap, { usageMeterMode: 'used' })
  assert.deepEqual(used.bars.map(({ name, pct, available }) => ({ name, pct, available })), [
    { name: 'Missing', pct: 0, available: false },
    { name: 'Zero', pct: 0, available: true },
    { name: 'Codex', pct: 46, available: true },
  ])
  assert.equal(used.tooltip, 'MaxxToken - BURN bars - Missing usage unavailable · Zero 0% used · Codex 46% used')

  const left = trayBurnbarStateFromSnapshot(snap, { usageMeterMode: 'left' })
  assert.deepEqual(left.bars.map(({ name, pct, available }) => ({ name, pct, available })), [
    { name: 'Missing', pct: 0, available: false },
    { name: 'Zero', pct: 100, available: true },
    { name: 'Codex', pct: 54, available: true },
  ])
  assert.equal(left.tooltip, 'MaxxToken - BURN bars - Missing usage unavailable · Zero 100% left · Codex 54% left')
})

test('tray burn bar state identifies disconnected configured providers', () => {
  const state = trayBurnbarStateFromSnapshot({ providers: [] }, {
    usageMeterMode: 'left',
    providerOrder: ['claude'],
    providers: { claude: { enabled: true, name: 'Claude' } },
  })

  assert.deepEqual(state.bars, [
    { name: 'Claude', pct: 0, available: false, connected: false, warning: false },
  ])
  assert.equal(state.tooltip, 'MaxxToken - BURN bars - Claude disconnected')
})

test('tray burn bars preserve warning color and cap output at three rows', () => {
  const image = decodePng(renderTrayBurnbarPng([
    { pct: 25 },
    { pct: 50 },
    { pct: 75, warning: true },
    { pct: 100 },
  ]))

  assert.deepEqual(image.pixel(1, 29), [255, 107, 92, 255])
  assert.deepEqual(image.pixel(1, 41), [0, 0, 0, 0])
})
