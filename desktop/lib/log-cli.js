const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

function defaultLogPath(platform = process.platform, env = process.env, home = os.homedir()) {
  if (env.MAXXTOKEN_LOG) return env.MAXXTOKEN_LOG
  if (platform === 'win32') {
    return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'maxxtoken-menubar', 'debug.log')
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'maxxtoken-menubar', 'debug.log')
  }
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'maxxtoken-menubar', 'debug.log')
}

const DEFAULT_LOG = defaultLogPath()

function usage() {
  return [
    'Usage: maxxtoken-logs [--follow] [--lines N] [--clear] [--path]',
    '',
    'Examples:',
    '  maxxtoken-logs --follow',
    '  maxxtoken-logs --lines 200',
    '  maxxtoken-logs --clear',
  ].join('\n')
}

function parseArgs(argv) {
  const options = { follow: false, lines: 120, clear: false, pathOnly: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--follow' || arg === '-f') options.follow = true
    else if (arg === '--clear') options.clear = true
    else if (arg === '--path') options.pathOnly = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--lines' || arg === '-n') {
      const next = Number(argv[++i])
      if (Number.isFinite(next) && next > 0) options.lines = Math.floor(next)
    } else if (/^--lines=\d+$/.test(arg)) {
      options.lines = Number(arg.split('=')[1])
    }
  }
  return options
}

function tail(file, lines, stdout) {
  try {
    const text = fs.readFileSync(file, 'utf8')
    const rows = text.split(/\r?\n/).filter(Boolean)
    stdout.write(rows.slice(-lines).join('\n') + (rows.length ? '\n' : ''))
  } catch {
    stdout.write(`No MaxxToken log yet at ${file}\n`)
  }
}

function follow(file, stdout, stderr) {
  let offset = 0
  try {
    offset = fs.statSync(file).size
  } catch {
    offset = 0
  }
  fs.watchFile(file, { interval: 1000 }, (current, previous) => {
    if (!current.size || current.size < offset || current.mtimeMs === previous.mtimeMs) {
      offset = current.size || 0
      return
    }
    try {
      const stream = fs.createReadStream(file, { start: offset, end: current.size - 1 })
      stream.on('data', (chunk) => stdout.write(chunk))
      stream.on('error', (err) => stderr.write(`Could not read log update: ${err.message}\n`))
      offset = current.size
    } catch (err) {
      stderr.write(`Could not follow log: ${err.message}\n`)
    }
  })
}

function run(argv = process.argv.slice(2), io = process) {
  const options = parseArgs(argv)
  const stdout = io.stdout || process.stdout
  const stderr = io.stderr || process.stderr
  const file = defaultLogPath()

  if (options.help) {
    stdout.write(usage() + '\n')
    return 0
  }
  if (options.pathOnly) {
    stdout.write(file + '\n')
    return 0
  }
  if (options.clear) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, '')
      stdout.write(`Cleared ${file}\n`)
      return 0
    } catch (err) {
      stderr.write(`Could not clear log: ${err.message}\n`)
      return 1
    }
  }
  if (!options.follow) {
    tail(file, options.lines, stdout)
    return 0
  }

  tail(file, options.lines, stdout)
  if (process.platform === 'win32') {
    follow(file, stdout, stderr)
    return 0
  }
  const child = spawn('/usr/bin/tail', ['-n', '0', '-F', file], { stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(stdout)
  child.stderr.pipe(stderr)
  child.on('exit', (code) => process.exit(code || 0))
  return 0
}

module.exports = { run, DEFAULT_LOG, defaultLogPath, _private: { parseArgs, tail, follow } }
