const { test } = require('node:test')
const assert = require('node:assert')
const og = require('../lib/adapters/opencode-go')

const { parseRscUsageWindows, parseSubscription } = og._private

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
