const { test } = require('node:test')
const assert = require('node:assert')
const og = require('../lib/adapters/opencode-go')

const { parseRscUsageWindows, parseSubscription } = og._private
const { readLocalUsageFromDb, localDbCandidates } = og._private

test('opencode go reads local opencode.db usage windows by providerID and timestamps', () => {
  const now = Date.parse('2026-05-21T12:00:00.000Z')
  // Rows as sqlite3 -json returns them for the adapter's aliased query
  // (SELECT "created_at" AS ts, "cost" AS cost ...): keys are ts/cost.
  const outputRows = [
    { ts: '2026-05-21T11:00:00.000Z', cost: '3' },
    { ts: '2026-05-20T13:00:00.000Z', cost: 2 },
    { ts: '2026-05-20T10:00:00.000Z', cost: 5 },
  ]
  const read = (_cmd, args) => {
    const query = String(Array.isArray(args) ? args[3] : args)
    if (query.includes('sqlite_master')) return JSON.stringify([{ name: 'messages' }])
    if (query.includes('PRAGMA table_info')) return JSON.stringify([{ name: 'providerID' }, { name: 'role' }, { name: 'cost' }, { name: 'created_at' }])
    return JSON.stringify(outputRows)
  }
  const usage = readLocalUsageFromDb({
    localDbPath: '/tmp/opencode.db',
    now,
    execFileSync: read,
  })

  assert.equal(usage.connected, true)
  assert.equal(Math.round(usage.rolling.usedPct), 25)
  assert.equal(Math.round(usage.weekly.usedPct), 33)
  assert.equal(Math.round(usage.monthly.usedPct), 17)
  assert.equal(usage.usageSource, 'local db')
})

test('local db usage path candidates include opencode.db locations', () => {
  const candidates = localDbCandidates('/tmp/home', { XDG_DATA_HOME: '/tmp/xdg' })
  assert.equal(candidates.includes('/tmp/xdg/opencode/opencode.db'), true)
  assert.equal(candidates.includes('/tmp/home/.local/share/opencode/opencode.db'), true)
})

// A page carries BOTH the pre-hydration placeholder (usagePercent:0) and the
// real React Server Component assignment (`xUsage:$R[n]={...}`). The parser must
// read the assignment, not the placeholder.
const PAGE =
  '<div>rolling<!--$-->usagePercent:0,resetInSec:9</div>' +
  'rollingUsage:$R[34]={status:"ok",resetInSec:1200,usagePercent:99}' +
  'weeklyUsage:$R[35]={status:"ok",resetInSec:300000,usagePercent:100}' +
  'monthlyUsage:$R[36]={status:"ok",resetInSec:2000000,usagePercent:42}'

test('parseRscUsageWindows reads the $R assignment, not the placeholder', () => {
  const w = parseRscUsageWindows(PAGE)
  assert.strictEqual(w.rolling.usedPct, 99)
  assert.strictEqual(w.weekly.usedPct, 100)
  assert.strictEqual(w.monthly.usedPct, 42)
  assert.strictEqual(w.rolling.resetInSec, 1200)
})

test('parseRscUsageWindows keeps a real 0 (no usage) and tolerates missing windows', () => {
  const zero = parseRscUsageWindows(
    'rollingUsage:$R[1]={status:"ok",resetInSec:5,usagePercent:0}' +
    'weeklyUsage:$R[2]={status:"ok",resetInSec:7,usagePercent:0}',
  )
  assert.strictEqual(zero.rolling.usedPct, 0)
  assert.strictEqual(zero.weekly.usedPct, 0)
  assert.strictEqual(zero.monthly, null)
  assert.strictEqual(parseRscUsageWindows('no usage here'), null)
})

test('parseSubscription surfaces the $R values as usedPct windows', () => {
  const sub = parseSubscription(PAGE, 1_000_000)
  assert.strictEqual(sub.connected, true)
  assert.strictEqual(sub.rolling.usedPct, 99)
  assert.strictEqual(sub.weekly.usedPct, 100)
  assert.strictEqual(sub.monthly.usedPct, 42)
  assert.strictEqual(sub.rolling.resetAt, 1_000_000 + 1200 * 1000)
})
