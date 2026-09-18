const test = require('node:test')
const assert = require('node:assert/strict')

const { createCapturePrivacyMonitor } = require('../lib/capture-privacy')

test('capture privacy is opt-in and follows detected capture transitions', async () => {
  let captured = false
  const changes = []
  const monitor = createCapturePrivacyMonitor({
    platform: 'darwin',
    pollMs: 60000,
    probe: async () => ({ supported: true, supportLevel: 'full', captured, message: 'available' }),
    onChange: (status) => changes.push(status),
  })

  assert.equal(monitor.getStatus().enabled, false)
  monitor.setEnabled(true)
  await monitor.check()
  assert.equal(monitor.getStatus().concealUsage, false)
  captured = true
  await monitor.check()
  assert.equal(monitor.getStatus().concealUsage, true)
  captured = false
  await monitor.check()
  assert.equal(monitor.getStatus().concealUsage, false)
  monitor.setEnabled(false)
  assert.equal(monitor.getStatus().concealUsage, false)
  assert.ok(changes.length >= 2)
})

test('an in-flight capture result cannot reconceal after opt-out', async () => {
  let resolveProbe
  const monitor = createCapturePrivacyMonitor({
    platform: 'darwin',
    pollMs: 60000,
    probe: () => new Promise((resolve) => { resolveProbe = resolve }),
  })
  monitor.setEnabled(true)
  monitor.setEnabled(false)
  resolveProbe({ supported: true, supportLevel: 'full', captured: true, message: 'available' })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(monitor.getStatus().concealUsage, false)
})

test('unsupported platforms report support honestly and never run the probe', async () => {
  let calls = 0
  const monitor = createCapturePrivacyMonitor({ platform: 'win32', probe: async () => { calls += 1 } })
  monitor.setEnabled(true)
  await monitor.check()
  const status = monitor.getStatus()
  assert.equal(status.supportLevel, 'unsupported')
  assert.equal(status.supported, false)
  assert.equal(status.concealUsage, false)
  assert.equal(calls, 0)
})

test('limited detection is explicit while still masking detected remote sessions', async () => {
  const monitor = createCapturePrivacyMonitor({
    platform: 'darwin',
    pollMs: 60000,
    probe: async () => ({
      supported: false,
      supportLevel: 'limited',
      captured: false,
      message: 'Only Screen Sharing sessions can be detected.',
    }),
  })
  monitor.setEnabled(true)
  await monitor.check()
  const status = monitor.getStatus()
  assert.equal(status.supportLevel, 'limited')
  assert.equal(status.supported, false)
  assert.equal(status.concealUsage, true)
  assert.match(status.message, /usage remains hidden/)
})

test('probe failures stay concealed and a later successful check can recover', async () => {
  let failing = true
  const monitor = createCapturePrivacyMonitor({
    platform: 'darwin',
    pollMs: 60000,
    probe: async () => {
      if (failing) throw new Error('probe failed')
      return { supported: true, supportLevel: 'full', captured: false, message: 'available' }
    },
  })
  monitor.setEnabled(true)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(monitor.getStatus().supportLevel, 'unsupported')
  assert.equal(monitor.getStatus().concealUsage, true)

  failing = false
  await monitor.check()
  assert.equal(monitor.getStatus().supportLevel, 'full')
  assert.equal(monitor.getStatus().concealUsage, false)
})
