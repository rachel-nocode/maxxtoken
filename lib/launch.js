const { execFile, execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { normalizeTerminal } = require('./terminals')

const DIR = path.join(os.homedir(), '.maxxtoken')
const WARP_CONFIG_DIR = path.join(os.homedir(), '.warp', 'launch_configurations')
const EXTRA_PATHS = [
  path.join(os.homedir(), '.local/bin'),
  path.join(os.homedir(), '.bun/bin'),
  path.join(os.homedir(), '.cargo/bin'),
  path.join(os.homedir(), '.grok/bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
]

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

function buildShellLines({ cliBin, cliPath, dir, promptFile }) {
  const pathPrefix = EXTRA_PATHS.map(shQuote).join(':')
  const launcher = cliPath ? shQuote(cliPath) : `"${cliBin}"`
  return [
    `export PATH=${pathPrefix}:$PATH`,
    `cd ${shQuote(dir)} || exit 1`,
    '[ -n "${TERM:-}" ] && clear',
    `echo "MaxxToken -> building in $(pwd) with ${cliBin}"`,
    ...(cliPath
      ? []
      : [
          `if ! command -v ${shQuote(cliBin)} >/dev/null 2>&1; then`,
          `  echo "MaxxToken could not find ${cliBin}."`,
          '  echo "Install it or add it to PATH, then try again."',
          '  exit 127',
          'fi',
        ]),
    `exec ${launcher} "$(cat ${shQuote(promptFile)})"`,
  ]
}

function writeCommandScript({ stamp, runLine }) {
  const script = path.join(DIR, `forge-build-${stamp}.command`)
  const body = ['#!/bin/bash', runLine, ''].join('\n')
  fs.writeFileSync(script, body, { mode: 0o755 })
  return script
}

function yamlQuote(value) {
  return JSON.stringify(String(value))
}

function openWarp({ stamp, dir, script }) {
  fs.mkdirSync(WARP_CONFIG_DIR, { recursive: true })
  const configPath = path.join(WARP_CONFIG_DIR, `maxxtoken-${stamp}.yaml`)
  const yaml = [
    '---',
    `name: ${yamlQuote('MaxxToken Build')}`,
    'windows:',
    '  - tabs:',
    '      - title: "MaxxToken"',
    '        layout:',
    `          cwd: ${yamlQuote(dir)}`,
    '        commands:',
    `          - exec: ${yamlQuote('/bin/bash ' + shQuote(script))}`,
    '',
  ].join('\n')
  fs.writeFileSync(configPath, yaml)

  const url = 'warp://launch/' + encodeURIComponent(configPath)
  return new Promise((resolve) => {
    execFile('open', [url], (err) =>
      resolve({ ok: !err, terminal: 'Warp', error: err ? String(err) : null }),
    )
  })
}

// Opens the user's terminal at the chosen folder and starts the routed CLI
// with the build idea as its first prompt. The prompt is passed via a file to
// avoid all shell-escaping issues.
function openBuild({ dir, cli, prompt, terminal }) {
  fs.mkdirSync(DIR, { recursive: true })
  const stamp = Date.now()
  const promptFile = path.join(DIR, `forge-prompt-${stamp}.txt`)
  fs.writeFileSync(promptFile, prompt || '')

  const cliBin = String(cli || 'claude').replace(/[^a-z0-9_-]/gi, '')
  const cliPath = resolveCli(cliBin)
  const runLine = buildShellLines({ cliBin, cliPath, dir, promptFile }).join('\n')
  const selectedTerminal = normalizeTerminal(terminal || 'Terminal')

  if (selectedTerminal === 'Ghostty') {
    return new Promise((resolve) => {
      execFile(
        'open',
        ['-na', 'Ghostty', '--args', `--working-directory=${dir}`, '-e', 'bash', '-lc', runLine],
        (err) => resolve({ ok: !err, terminal: 'Ghostty', error: err ? String(err) : null }),
      )
    })
  }

  const script = writeCommandScript({ stamp, runLine })

  if (selectedTerminal === 'Warp') {
    return openWarp({ stamp, dir, script })
  }

  const app = selectedTerminal === 'iTerm' ? 'iTerm' : 'Terminal'
  return new Promise((resolve) => {
    execFile('open', ['-a', app, script], (err) =>
      resolve({ ok: !err, terminal: app, error: err ? String(err) : null }),
    )
  })
}

module.exports = { openBuild }
