const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')

const { renderFrame, stripAnsi, _private: render } = require('../lib/tui-render')
const tui = require('../lib/tui-cli')
const widgetSnapshot = require('../lib/widget-snapshot')

const NOW = Date.parse('2026-09-01T12:00:00Z')
const HOUR = 3600000

function fixtureSnapshot() {
  return widgetSnapshot.buildWidgetSnapshot({
    generatedAt: NOW - 42000,
    cycle: { label: 'Sep cycle', daysLeft: 18, totalDays: 30 },
    totals: { totalValue: 460, spent: 187, left: 273, capturedPct: 41, planCount: 3, tokens: { total: 5_482_000_000, costUSD: 312.4, providerCount: 2 } },
    rating: { stars: 3, verdict: 'Solid. Push harder on Claude.' },
    providers: [
      {
        id: 'claude', name: 'Claude', plan: 'Max 20x', connected: true, activity: 'live',
        capturedPct: 63, remainingPct: 37, spentValue: 126, leftValue: 74, sourceLabel: 'Anthropic OAuth',
        windows: [
          { label: 'Session', kind: '5h', usedPct: 82, resetAt: NOW + 1.4 * HOUR, pace: { tone: 'hot', leftLabel: 'On pace to hit 100% before reset', willLastToReset: false } },
          { label: 'Weekly', kind: '7d', usedPct: 44, resetAt: NOW + 3 * 24 * HOUR + 5 * HOUR },
        ],
        tokenUsage: { total: 4_100_000_000, costUSD: 260.1, modelBreakdowns: [{ model: 'claude-opus-4-7', total: 3e9 }] },
      },
      {
        id: 'cursor', name: 'Cursor', plan: 'Pro+', connected: true, activity: 'stale', urgent: true,
        capturedPct: 94, remainingPct: 6, spentValue: 56, leftValue: 4,
        windows: [
          { label: 'Total Usage', kind: 'cycle', usedPct: 94, resetAt: NOW + 11 * 24 * HOUR, valueLabel: '$56 / $60' },
          { label: 'Cursor Models', kind: 'cycle', usedPct: 97, resetAt: NOW + 11 * 24 * HOUR },
          { label: 'Other Models', kind: 'cycle', usedPct: 31, resetAt: NOW + 11 * 24 * HOUR },
        ],
      },
      { id: 'kimi', name: 'Kimi', plan: 'Moderato', connected: true, capturedPct: 8, spentValue: 3, leftValue: 37, windows: [{ label: 'Weekly', kind: '7d', usedPct: 8, resetAt: NOW + 2 * 24 * HOUR }] },
      { id: 'openai', name: 'OpenAI API', connected: false, needsKey: true },
    ],
  })
}

test('tui renders every line at exactly the terminal width, unicode and ascii', () => {
  const snap = fixtureSnapshot()
  for (const cols of [40, 60, 80, 120]) {
    for (const ascii of [false, true]) {
      for (const color of [false, true]) {
        const { text } = renderFrame(snap, { cols, rows: 0 }, { ascii, color, now: NOW })
        for (const line of text.split('\n')) {
          assert.equal(stripAnsi(line).length, cols, `cols=${cols} ascii=${ascii} color=${color}: ${JSON.stringify(stripAnsi(line))}`)
        }
        if (!color) assert.ok(!text.includes('\x1b'), 'no ANSI escapes when color is off')
      }
    }
  }
})

test('tui shows headline, totals, window bars and resets like the menubar app', () => {
  const { text } = renderFrame(fixtureSnapshot(), { cols: 100, rows: 0 }, { color: false, ascii: false, now: NOW, source: 'app' })
  assert.match(text, /Sep cycle · 18d left/)
  assert.match(text, /sync 42s ago\s+·\s+via app/)
  assert.match(text, /41% USED/)
  assert.match(text, /SPENT \$187\s+LEFT \$273\s+3 plans/)
  assert.match(text, /token burn 5\.5B · \$312 est\. cost · 2 sources/)
  assert.match(text, /● Claude Max 20x/)
  assert.match(text, /63% USED\s+\$126 spent · \$74\.00 left/)
  assert.match(text, /SESSION 5H\s+█+[▏▎▍▌▋▊▉]?░+\s+82%\s+resets 01h 24m/)
  assert.match(text, /WEEKLY 7D\s+█+[▏▎▍▌▋▊▉]?░+\s+44%\s+resets 3d 05h/)
  assert.match(text, /On pace to hit 100% before reset/)
  assert.match(text, /tokens 4\.1B · \$260 est · claude-opus-4-7/)
  // Cursor keeps all three numeric windows and its dollar value label.
  assert.match(text, /▲ Cursor Pro\+/)
  assert.match(text, /TOTAL USAGE\s+█+[▏▎▍▌▋▊▉]?░*\s+\$56 \/ \$60\s+resets 11d 00h/)
  assert.match(text, /CURSOR MODELS/)
  assert.match(text, /OTHER MODELS/)
  // Disconnected providers sink to the bottom and explain themselves.
  assert.match(text, /○ OpenAI API[─ ]+OFFLINE/)
  assert.match(text, /needs key — connect it in the MaxxToken app/)
  assert.ok(text.indexOf('Kimi') < text.indexOf('OpenAI API'))
  assert.match(text, /q quit\s+·\s+r refresh\s+·\s+u show left\s+·\s+j\/k scroll/)
})

test('tui left mode inverts meters but keeps tone based on usage', () => {
  const { text } = renderFrame(fixtureSnapshot(), { cols: 100, rows: 0 }, { color: true, ascii: false, now: NOW, mode: 'left' })
  const plain = stripAnsi(text)
  assert.match(plain, /59% LEFT/)
  assert.match(plain, /37% LEFT/)
  assert.match(plain, /SESSION 5H\s+█+.?░+\s+18%/)
  // Kimi has no remainingPct → derived from usedPct, never 0.
  assert.match(plain, /92% LEFT/)
  assert.match(plain, /u show used/)
  // 82% used session stays "hot" orange even though its left-meter is small.
  const sessionLine = text.split('\n').find((line) => stripAnsi(line).includes('SESSION 5H'))
  assert.match(sessionLine, /\x1b\[38;5;208m/)
})

test('tui clamps scrolling to the viewport and marks position', () => {
  const snap = fixtureSnapshot()
  const full = renderFrame(snap, { cols: 80, rows: 0 }, { color: false, now: NOW })
  const framed = renderFrame(snap, { cols: 80, rows: 20 }, { color: false, now: NOW, scroll: 999 })
  assert.equal(framed.text.split('\n').length, 20)
  assert.ok(framed.scroll > 0 && framed.scroll < full.text.split('\n').length)
  assert.match(framed.text, /› \d+\/\d+/)
  // Header, totals, and footer always survive scrolling.
  assert.match(framed.text, /Sep cycle/)
  assert.match(framed.text, /TOTAL/)
  assert.match(framed.text, /q quit/)
  const top = renderFrame(snap, { cols: 80, rows: 20 }, { color: false, now: NOW, scroll: 0 })
  assert.equal(top.scroll, 0)
  assert.match(top.text, /Claude/)
})

test('tui ascii mode uses only plain characters and the ASCII logo', () => {
  const { text } = renderFrame(fixtureSnapshot(), { cols: 80, rows: 0 }, { color: false, ascii: true, now: NOW })
  assert.match(text, /\|_\|  \|_\|/) // ascii-art logo
  assert.match(text, /\+-.*TOTAL.*-\+/)
  assert.match(text, /SESSION 5H #+\.+\s+82%/)
  assert.ok(!/[█░╭╮╰╯│─●○▲⚡]/.test(text.replace(/—|…|·/g, '')))
})

test('tui renders an empty state when no providers are enabled', () => {
  const { text } = renderFrame({ providers: [], totals: {}, cycle: null }, { cols: 80, rows: 0 }, { color: false, now: NOW })
  assert.match(text, /Current cycle/)
  assert.match(text, /— USED/)
  assert.match(text, /SPENT —\s+LEFT —\s+0 plans/)
  assert.match(text, /No providers yet/)
})

test('tui primitives: bars, reset countdowns, number formatting', () => {
  const style = render.makeStyler(false)
  const g = render.GLYPHS.unicode
  assert.equal(render.bar(50, 10, g, style, 'lime'), '█████░░░░░')
  assert.equal(render.bar(0, 4, g, style, 'lime'), '░░░░')
  assert.equal(render.bar(100, 4, g, style, 'lime'), '████')
  assert.equal(render.bar(null, 4, g, style, 'lime'), '░░░░')
  assert.equal(render.bar(12.5, 4, g, style, 'lime'), '▌░░░') // half a cell
  assert.equal(render.bar(50, 4, render.GLYPHS.ascii, style, 'lime'), '##..')

  assert.equal(render.formatReset(NOW + 90 * 60000, NOW), '01h 30m')
  assert.equal(render.formatReset(NOW + 26 * HOUR, NOW), '1d 02h')
  assert.equal(render.formatReset(NOW + 45 * 1000, NOW), '00m 45s')
  assert.equal(render.formatReset(NOW - 1, NOW), 'due')
  assert.equal(render.formatReset(null, NOW), '—')
  assert.equal(render.formatReset(new Date(NOW + 2 * HOUR).toISOString(), NOW), '02h 00m')

  assert.equal(render.formatSync(NOW - 5000, NOW), '5s ago')
  assert.equal(render.formatSync(NOW - 5 * 60000, NOW), '5m ago')
  assert.equal(render.formatSync(new Date(NOW - 3 * HOUR).toISOString(), NOW), '3h ago')

  assert.equal(render.money(12.345), '$12.35')
  assert.equal(render.money(1234), '$1,234')
  assert.equal(render.tokens(5_482_000_000), '5.5B')
  assert.equal(render.tokens(87_000_000), '87M')
  assert.equal(render.tokens(400), '400')
  assert.equal(render.tokens(null), '—')

  assert.equal(render.toneForPct(10), 'lime')
  assert.equal(render.toneForPct(50), 'yellow')
  assert.equal(render.toneForPct(75), 'orange')
  assert.equal(render.toneForPct(90), 'red')
  assert.equal(render.toneForPct(null), 'muted')

  assert.equal(render.sparkline([{ usedPct: 0 }, { usedPct: 50 }, { usedPct: 100 }], g, style, 9), '▁▄█')
  assert.equal(render.sparkline([{ usedPct: 5 }], g, style, 9), '')
})

test('tui picks the same windows as the menubar app', () => {
  const session = { label: 'Session', kind: '5h', usedPct: 10 }
  const weekly = { label: 'Weekly', kind: '7d', usedPct: 20 }
  const cycle = { label: 'Cycle', kind: 'cycle', usedPct: 30 }
  const credit = { label: 'Agent SDK', kind: 'agent-sdk-credit', usedPct: 40 }
  assert.deepEqual(render.displayWindows({ id: 'claude', windows: [cycle, weekly, session, credit] }), [session, weekly, credit])
  assert.deepEqual(render.displayWindows({ id: 'openai', windows: [cycle] }), [cycle])
  assert.deepEqual(render.displayWindows({ id: 'cursor', windows: [cycle, { label: 'x', usedPct: null }, weekly] }), [cycle, weekly])
  assert.deepEqual(render.displayWindows({ id: 'codex', windows: [{ label: 'Session', kind: 'session', usedPct: 1 }, { label: 'Weekly', kind: 'weekly', usedPct: 2 }] }).map((w) => w.label), ['Session', 'Weekly'])
  assert.equal(render.windowLabel(session), 'SESSION 5H')
  assert.equal(render.windowLabel(weekly), 'WEEKLY 7D')
  assert.equal(render.windowLabel({ label: 'Total Usage', kind: 'cycle' }), 'TOTAL USAGE')
  assert.equal(render.meterPct({ usedPct: 30 }, 'used'), 30)
  assert.equal(render.meterPct({ usedPct: 30 }, 'left'), 70)
  assert.equal(render.meterPct({ usedPct: 30, remainingPct: 65 }, 'left'), 65)
  assert.equal(render.meterPct({ usedPct: null }, 'left'), null)
})

test('tui cli parses options and rejects bad ones', () => {
  assert.deepEqual(tui.parseArgs([]).source, 'auto')
  const opts = tui.parseArgs(['--once', '--source', 'API', '--port', '7999', '--interval', '5', '--left', '--ascii', '--no-color'])
  assert.equal(opts.once, true)
  assert.equal(opts.source, 'api')
  assert.equal(opts.port, 7999)
  assert.equal(opts.interval, 5)
  assert.equal(opts.mode, 'left')
  assert.equal(opts.ascii, true)
  assert.equal(opts.color, false)
  const withFile = tui.parseArgs(['--file', '/tmp/x.json'])
  assert.equal(withFile.file, '/tmp/x.json')
  assert.equal(withFile.source, 'cache')
  assert.throws(() => tui.parseArgs(['--source', 'nope']), /Unknown source/)
  assert.throws(() => tui.parseArgs(['--interval', '0']), /--interval/)
  assert.throws(() => tui.parseArgs(['--port']), /Pass a value/)
  assert.throws(() => tui.parseArgs(['--wat']), /Unknown option/)
  assert.equal(tui.detectColor({ NO_COLOR: '1' }, true), false)
  assert.equal(tui.detectColor({}, false), false)
  assert.equal(tui.detectColor({ FORCE_COLOR: '1' }, false), true)
  assert.equal(tui.detectColor({ TERM: 'xterm-256color' }, true), true)
  assert.equal(tui.detectAscii({ LANG: 'en_US.UTF-8' }), false)
  assert.equal(tui.detectAscii({ LANG: 'C' }), true)
  assert.equal(tui.detectAscii({ TERM: 'linux' }), true)
})

test('tui cli --once renders a saved snapshot file and --json echoes it', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-tui-'))
  const file = path.join(tmp, 'widget-snapshot.json')
  fs.writeFileSync(file, JSON.stringify(fixtureSnapshot()))
  const io = () => {
    const out = []
    const err = []
    return { out, err, io: { stdout: { write: (t) => out.push(t), isTTY: false, columns: 90 }, stderr: { write: (t) => err.push(t) }, stdin: null, env: {} } }
  }

  const once = io()
  assert.equal(await tui.run(['--file', file, '--once', '--unicode'], once.io), 0)
  const text = once.out.join('')
  assert.ok(!text.includes('\x1b'), 'non-TTY output has no colors by default')
  assert.match(text, /via cache\s+·\s+cached/)
  assert.match(text, /Claude Max 20x/)
  assert.equal(stripAnsi(text.split('\n')[0]).length, 90)

  const json = io()
  assert.equal(await tui.run(['--file', file, '--json'], json.io), 0)
  const payload = JSON.parse(json.out.join(''))
  assert.equal(payload.source, 'cache')
  assert.equal(payload.cached, true)
  assert.equal(payload.providers.length, 4)

  const help = io()
  assert.equal(await tui.run(['--help'], help.io), 0)
  assert.match(help.out.join(''), /Usage:\s+maxxtoken \[options\]/)

  const missing = io()
  assert.equal(await tui.run(['--file', path.join(tmp, 'nope.json'), '--once'], missing.io), 1)
  assert.match(missing.err.join(''), /no cached snapshot/)

  const bad = io()
  assert.equal(await tui.run(['--bogus'], bad.io), 1)
  assert.match(bad.err.join(''), /Unknown option: --bogus/)
})

test('tui cli reads live data from the running app over the loopback API', async () => {
  const snap = { ...fixtureSnapshot(), generatedAt: NOW }
  const server = http.createServer((req, res) => {
    if (req.url === '/v1/usage') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(snap))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  try {
    const out = []
    const io = { stdout: { write: (t) => out.push(t), isTTY: false, columns: 80 }, stderr: { write() {} }, stdin: null, env: {} }
    assert.equal(await tui.run(['--source', 'api', '--port', String(port), '--once'], io), 0)
    assert.match(out.join(''), /via app/)
    assert.match(out.join(''), /Claude/)
  } finally {
    server.close()
  }

  const errs = []
  const io = { stdout: { write() {}, isTTY: false }, stderr: { write: (t) => errs.push(t) }, stdin: null, env: {} }
  assert.equal(await tui.run(['--source', 'api', '--port', String(port), '--once'], io), 1)
  assert.match(errs.join(''), /MaxxToken app not running on 127\.0\.0\.1:\d+/)
})
