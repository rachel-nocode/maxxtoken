const { execFile, execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const DIR = path.join(os.homedir(), '.maxxtoken')

// CLIs that accept an initial prompt as a positional argument.
const PROMPT_CAPABLE = new Set(['claude', 'codex', 'gemini'])

function extraPaths(platform = process.platform, home = os.homedir(), env = process.env) {
  const paths = [
    path.join(home, '.local/bin'),
    path.join(home, '.bun/bin'),
    path.join(home, '.cargo/bin'),
    path.join(home, '.grok/bin'),
  ]
  if (platform === 'win32') {
    const appData = env.APPDATA || path.join(home, 'AppData', 'Roaming')
    const localAppData = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
    return [
      ...paths,
      path.join(appData, 'npm'),
      path.join(localAppData, 'Programs'),
    ]
  }
  return [...paths, '/opt/homebrew/bin', '/usr/local/bin']
}

function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function cmdQuote(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function executableNames(cliBin, platform = process.platform, env = process.env) {
  if (platform !== 'win32' || path.extname(cliBin)) return [cliBin]
  const extensions = (env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((ext) => ext.trim())
    .filter(Boolean)
  return [cliBin, ...extensions.map((ext) => `${cliBin}${ext.toLowerCase()}`)]
}

function canRun(file, platform = process.platform, fsImpl = fs) {
  try {
    fsImpl.accessSync(file, platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function resolveCli(cliBin, options = {}) {
  const platform = options.platform || process.platform
  const env = options.env || process.env
  const home = options.home || os.homedir()
  const fsImpl = options.fs || fs
  const execFileSyncImpl = options.execFileSync || execFileSync
  const delimiter = platform === 'win32' ? ';' : path.delimiter
  const dirs = [...extraPaths(platform, home, env), ...(env.PATH || '').split(delimiter)].filter(Boolean)
  for (const dir of dirs) {
    for (const name of executableNames(cliBin, platform, env)) {
      const candidate = path.join(dir, name)
      if (canRun(candidate, platform, fsImpl)) return candidate
    }
  }
  try {
    const found = platform === 'win32'
      ? execFileSyncImpl('where', [cliBin], {
          encoding: 'utf8',
          timeout: 2500,
          stdio: ['ignore', 'pipe', 'ignore'],
          env,
        }).split(/\r?\n/)[0].trim()
      : execFileSyncImpl('/bin/zsh', ['-lc', `command -v ${shQuote(cliBin)}`], {
          encoding: 'utf8',
          timeout: 2500,
          stdio: ['ignore', 'pipe', 'ignore'],
          env,
        }).trim()
    if (found) {
      fsImpl.accessSync(found, platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK)
      return found
    }
  } catch {
    /* shell lookup could not resolve it */
  }
  return null
}

// Each CLI takes an initial prompt differently. claude/codex/gemini accept it
// positionally; kimi's interactive agent is `kimi term`; grok's bare command is
// the interactive TUI. For CLIs without a prompt arg we never reach launch —
// the renderer copies the prompt instead — but we keep the bare launcher for
// safety in case something slips through.
function cliRunExpr(cliBin, launcher, promptFile) {
  if (cliBin === 'kimi') return `${launcher} term`
  if (cliBin === 'grok') return launcher
  if (PROMPT_CAPABLE.has(cliBin)) return `${launcher} "$(cat ${shQuote(promptFile)})"`
  return launcher
}

function psRunExpr(cliBin, launcher, promptFile) {
  if (cliBin === 'kimi') return `& ${launcher} term`
  if (cliBin === 'grok') return `& ${launcher}`
  if (PROMPT_CAPABLE.has(cliBin)) return `& ${launcher} (Get-Content -Raw -LiteralPath ${psQuote(promptFile)})`
  return `& ${launcher}`
}

function buildScript({ cliBin, cliPath, dir, promptFile, platform = process.platform, env = process.env, home = os.homedir() }) {
  if (platform === 'win32') return buildWindowsScript({ cliBin, cliPath, dir, promptFile, env, home })
  return buildMacScript({ cliBin, cliPath, dir, promptFile, env, home })
}

function buildMacScript({ cliBin, cliPath, dir, promptFile, env = process.env, home = os.homedir() }) {
  const pathPrefix = extraPaths('darwin', home, env).map(shQuote).join(':')
  const launcher = cliPath ? shQuote(cliPath) : shQuote(cliBin)
  const lines = [
    '#!/bin/bash',
    `export PATH=${pathPrefix}:$PATH`,
    `cd ${shQuote(dir)} || exit 1`,
    '[ -n "${TERM:-}" ] && clear',
    `echo "MaxxToken -> ${cliBin} in $(pwd)"`,
    'echo',
  ]
  if (!cliPath) {
    lines.push(
      `if ! command -v ${shQuote(cliBin)} >/dev/null 2>&1; then`,
      `  echo "MaxxToken could not find ${cliBin}. Install it or add it to PATH."`,
      '  echo',
      '  echo "[ Press Return to close. ]"',
      '  read _ || true',
      '  exit 127',
      'fi',
    )
  }
  // Run the CLI, then hold the window open so a crash or fast exit stays visible.
  lines.push(
    cliRunExpr(cliBin, launcher, promptFile),
    'status=$?',
    'echo',
    'echo "[ MaxxToken — session ended (exit $status). Press Return to close. ]"',
    'read _ || true',
  )
  return lines.join('\n')
}

function buildWindowsScript({ cliBin, cliPath, dir, promptFile, env = process.env, home = os.homedir() }) {
  const pathPrefix = extraPaths('win32', home, env).map(psQuote).join(' + [IO.Path]::PathSeparator + ')
  const launcher = cliPath ? psQuote(cliPath) : psQuote(cliBin)
  const lines = [
    '$ErrorActionPreference = "Continue"',
    `$env:PATH = ${pathPrefix} + [IO.Path]::PathSeparator + $env:PATH`,
    `Set-Location -LiteralPath ${psQuote(dir)}`,
    'Clear-Host',
    `Write-Host "MaxxToken -> ${cliBin} in $(Get-Location)"`,
    'Write-Host ""',
  ]
  if (!cliPath) {
    lines.push(
      `if (-not (Get-Command ${psQuote(cliBin)} -ErrorAction SilentlyContinue)) {`,
      `  Write-Host "MaxxToken could not find ${cliBin}. Install it or add it to PATH."`,
      '  Write-Host ""',
      '  Read-Host "[ Press Enter to close. ]"',
      '  exit 127',
      '}',
    )
  }
  lines.push(
    psRunExpr(cliBin, launcher, promptFile),
    '$status = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }',
    'Write-Host ""',
    'Read-Host "[ MaxxToken - session ended (exit $status). Press Enter to close. ]"',
    'exit $status',
  )
  return lines.join('\r\n')
}

function writeScript(stamp, body, platform = process.platform) {
  fs.mkdirSync(DIR, { recursive: true })
  const extension = platform === 'win32' ? 'ps1' : 'command'
  const script = path.join(DIR, `forge-build-${stamp}.${extension}`)
  fs.writeFileSync(script, body, { mode: 0o755 })
  return script
}

function launchScript(script, platform = process.platform, execFileImpl = execFile, env = process.env) {
  if (platform === 'win32') {
    const shell = env.ComSpec || env.COMSPEC || 'cmd.exe'
    const command = `start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${cmdQuote(script)}`
    return new Promise((resolve) => {
      execFileImpl(shell, ['/d', '/s', '/c', command], { windowsHide: false }, (err) =>
        resolve({ ok: !err, terminal: 'PowerShell', error: err ? String(err) : null }),
      )
    })
  }
  if (platform === 'darwin') {
    return new Promise((resolve) => {
      execFileImpl('open', ['-a', 'Terminal', script], (err) =>
        resolve({ ok: !err, terminal: 'Terminal', error: err ? String(err) : null }),
      )
    })
  }
  return Promise.resolve({ ok: false, terminal: null, error: `Unsupported platform: ${platform}` })
}

function openBuild({ dir, cli, prompt }) {
  fs.mkdirSync(DIR, { recursive: true })
  const stamp = Date.now()
  const promptFile = path.join(DIR, `forge-prompt-${stamp}.txt`)
  fs.writeFileSync(promptFile, prompt || '')

  const cliBin = String(cli || 'claude').replace(/[^a-z0-9_-]/gi, '')
  const cliPath = resolveCli(cliBin)
  const script = writeScript(stamp, buildScript({ cliBin, cliPath, dir, promptFile }))

  return launchScript(script)
}

module.exports = {
  openBuild,
  _private: {
    buildMacScript,
    buildWindowsScript,
    buildScript,
    cliRunExpr,
    psRunExpr,
    executableNames,
    extraPaths,
    resolveCli,
    launchScript,
  },
}
