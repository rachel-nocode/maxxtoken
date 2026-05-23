const { execFile, execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const DIR = path.join(os.homedir(), '.maxxtoken')
const EXTRA_PATHS = [
  path.join(os.homedir(), '.local/bin'),
  path.join(os.homedir(), '.bun/bin'),
  path.join(os.homedir(), '.cargo/bin'),
  path.join(os.homedir(), '.grok/bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
]

// CLIs that accept an initial prompt as a positional argument.
const PROMPT_CAPABLE = new Set(['claude', 'codex', 'gemini'])

function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function resolveCli(cliBin) {
  const dirs = [...EXTRA_PATHS, ...(process.env.PATH || '').split(path.delimiter)].filter(Boolean)
  for (const dir of dirs) {
    const candidate = path.join(dir, cliBin)
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return candidate
    } catch {
      /* keep looking */
    }
  }
  try {
    const found = execFileSync('/bin/zsh', ['-lc', `command -v ${shQuote(cliBin)}`], {
      encoding: 'utf8',
      timeout: 2500,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (found) {
      fs.accessSync(found, fs.constants.X_OK)
      return found
    }
  } catch {
    /* login shell could not resolve it */
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

function buildScript({ cliBin, cliPath, dir, promptFile }) {
  const pathPrefix = EXTRA_PATHS.map(shQuote).join(':')
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

function writeScript(stamp, body) {
  fs.mkdirSync(DIR, { recursive: true })
  const script = path.join(DIR, `forge-build-${stamp}.command`)
  fs.writeFileSync(script, body, { mode: 0o755 })
  return script
}

// Opens Terminal.app at the chosen folder and starts the routed CLI.
// Terminal is the only supported launcher — it ships with every Mac and
// `open -a Terminal <script.command>` is the most reliable handoff.
function openBuild({ dir, cli, prompt }) {
  fs.mkdirSync(DIR, { recursive: true })
  const stamp = Date.now()
  const promptFile = path.join(DIR, `forge-prompt-${stamp}.txt`)
  fs.writeFileSync(promptFile, prompt || '')

  const cliBin = String(cli || 'claude').replace(/[^a-z0-9_-]/gi, '')
  const cliPath = resolveCli(cliBin)
  const script = writeScript(stamp, buildScript({ cliBin, cliPath, dir, promptFile }))

  return new Promise((resolve) => {
    execFile('open', ['-a', 'Terminal', script], (err) =>
      resolve({ ok: !err, terminal: 'Terminal', error: err ? String(err) : null }),
    )
  })
}

module.exports = { openBuild }
