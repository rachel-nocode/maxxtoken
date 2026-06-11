const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const usageHistory = require('../lib/usage-history')

test('writeHistory lands atomically and synchronously (G3 torn-write fix)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-uh-'))
  const file = path.join(dir, 'usage-history.json')
  const providers = [
    {
      id: 'claude',
      name: 'Claude',
      connected: true,
      windows: [{ label: 'Session', kind: '5h', usedPct: 42, resetAt: Date.now() + 3_600_000, periodMs: 18_000_000 }],
    },
  ]
  usageHistory.recordSnapshot(providers, { file })
  // Synchronous: content must be on disk immediately, no event-loop turn.
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(onDisk.samples.length, 1)
  assert.equal(onDisk.samples[0].providerId, 'claude')
  // No tmp leftovers.
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.includes('.tmp')), [])
  // Overwrite keeps the file valid (rename replaces, never truncates).
  usageHistory.recordSnapshot(providers, { file })
  assert.ok(JSON.parse(fs.readFileSync(file, 'utf8')).samples.length >= 1)
})
