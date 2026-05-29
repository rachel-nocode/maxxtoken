/* optimize-cli — headless validation of the Optimize detectors against the last
   widget snapshot. No UI, no electron. Run:  node lib/optimize-cli.js [--json] */

const widgetSnapshot = require('./widget-snapshot')
const { buildOptimizeModel, dailyRatioSeries } = require('./optimize-detect')

function run(argv = [], io = {}) {
  const stdout = io.stdout || process.stdout
  const stderr = io.stderr || process.stderr
  const json = argv.includes('--json')
  const fileArg = argv.indexOf('--file')
  const file = fileArg >= 0 ? argv[fileArg + 1] : widgetSnapshot.FILE

  try {
    const snapshot = widgetSnapshot.readWidgetSnapshot(file)
    if (!snapshot) throw new Error(`Snapshot missing/unreadable: ${file}`)
    const model = buildOptimizeModel(snapshot)

    if (json) {
      stdout.write(JSON.stringify(model, null, 2) + '\n')
      return 0
    }

    stdout.write(
      `OPTIMIZE — ${model.counts.total} signal(s), ${model.counts.alerts} alert(s), ` +
        `$${Math.round(model.recoverable)}/mo recoverable, $${Math.round(model.headroom)}/mo headroom\n\n`,
    )
    if (!model.signals.length) {
      stdout.write('ALL OPTIMIZED — nothing wasteful in the last snapshot.\n')
      return 0
    }
    for (const s of model.signals) {
      const soft = s.softSaving ? ' (soft)' : ''
      const counted = s.countedInTotal ? '' : '  [secondary — not in total]'
      stdout.write(
        `[${s.severity.toUpperCase()}] ${s.title} · ${s.providerName} ${s.plan}\n` +
          `  ${s.metric} ${s.metricUnit}  →  $${Math.round(s.saving)} ${s.savingNote}${soft}${counted}\n` +
          `  ${s.signal}\n  ↳ ${s.fix}\n`,
      )
      for (const row of s.detail.rows) {
        stdout.write(`     ${row.l.padEnd(22)} ${row.v}\n`)
      }
      if (s.detail.bars) {
        for (const b of s.detail.bars) stdout.write(`       · ${b.name}: ${b.pct}%\n`)
      }
      stdout.write('\n')
    }

    if (model.drillable.length) {
      stdout.write('AGENTIC DRILL-DOWN (opt-in, last days):\n')
      for (const p of model.drillable) {
        stdout.write(`  ${p.name}:\n`)
        const snap = widgetSnapshot.readWidgetSnapshot(file)
        const prov = snap.providers.find((x) => x.id === p.id)
        for (const d of dailyRatioSeries(prov, { days: 5 })) {
          stdout.write(
            `     ${d.dayKey}  ratio ${d.ratio < 0.1 ? d.ratio.toFixed(3) : d.ratio.toFixed(2)}` +
              `  cache ${d.cacheHitPct}%  in ${Math.round(d.totalIn / 1e6)}M out ${Math.round(d.output / 1e6)}M\n`,
          )
        }
      }
      stdout.write('\n')
    }
    return 0
  } catch (err) {
    stderr.write(`${err.message || String(err)}\n`)
    return 1
  }
}

if (require.main === module) process.exitCode = run(process.argv.slice(2))
module.exports = { run }
