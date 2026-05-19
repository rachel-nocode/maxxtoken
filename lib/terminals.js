const fs = require('fs')
const path = require('path')

const HOME = process.env.HOME || ''

const KNOWN_TERMINALS = [
  {
    id: 'Terminal',
    name: 'Terminal',
    paths: ['/System/Applications/Utilities/Terminal.app', '/Applications/Utilities/Terminal.app'],
  },
  {
    id: 'Ghostty',
    name: 'Ghostty',
    paths: ['/Applications/Ghostty.app', path.join(HOME, 'Applications/Ghostty.app')],
  },
  {
    id: 'Warp',
    name: 'Warp',
    paths: ['/Applications/Warp.app', path.join(HOME, 'Applications/Warp.app')],
  },
  {
    id: 'iTerm',
    name: 'iTerm',
    paths: [
      '/Applications/iTerm.app',
      '/Applications/iTerm2.app',
      path.join(HOME, 'Applications/iTerm.app'),
      path.join(HOME, 'Applications/iTerm2.app'),
    ],
  },
]

function firstExisting(paths) {
  return paths.find((candidate) => fs.existsSync(candidate)) || null
}

function installedTerminals() {
  return KNOWN_TERMINALS.map((terminal) => ({
    id: terminal.id,
    name: terminal.name,
    path: firstExisting(terminal.paths),
  })).filter((terminal) => terminal.path)
}

function normalizeTerminal(id) {
  const installed = installedTerminals()
  if (installed.some((terminal) => terminal.id === id)) return id
  return defaultTerminal()
}

function defaultTerminal() {
  const installed = installedTerminals()
  if (installed.some((terminal) => terminal.id === 'Terminal')) return 'Terminal'
  return installed[0] ? installed[0].id : 'Terminal'
}

module.exports = { installedTerminals, normalizeTerminal, defaultTerminal }
