const fs = require('fs')
const os = require('os')
const path = require('path')

const MARKER = 'MaxxToken managed CLI'

function defaultCliPath(options = {}) {
  const platform = options.platform || process.platform
  const home = options.home || os.homedir()
  if (platform === 'win32') {
    const root = options.localAppData || process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
    return path.join(root, 'MaxxToken', 'bin', 'maxxtoken.cmd')
  }
  return path.join(home, '.local', 'bin', 'maxxtoken')
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`
}

function wrapperText(options) {
  const executable = path.resolve(options.executablePath)
  const version = String(options.version || '0.0.0')
  const executableMarker = Buffer.from(executable, 'utf8').toString('base64')
  if (options.platform === 'win32') {
    return `@rem ${MARKER} v${version}\r\n@rem MaxxToken executable ${executableMarker}\r\n@"${executable.replace(/"/g, '""')}" --cli %*\r\n`
  }
  return `#!/bin/sh\n# ${MARKER} v${version}\n# MaxxToken executable ${executableMarker}\nexec ${shellQuote(executable)} --cli "$@"\n`
}

function parseManagedVersion(text) {
  const match = String(text || '').match(/MaxxToken managed CLI v([^\s]+)/)
  return match ? match[1] : null
}

function parseExecutablePath(text) {
  const match = String(text || '').match(/MaxxToken executable ([A-Za-z0-9+/=]+)/)
  if (!match) return null
  try { return Buffer.from(match[1], 'base64').toString('utf8') || null } catch { return null }
}

function getCliStatus(options = {}) {
  const target = options.target || defaultCliPath(options)
  let text = null
  try { text = fs.readFileSync(target, 'utf8') } catch {}
  const installedVersion = parseManagedVersion(text)
  const installedExecutablePath = parseExecutablePath(text)
  const expectedVersion = options.version == null ? null : String(options.version)
  const expectedExecutablePath = options.executablePath ? path.resolve(options.executablePath) : null
  const executableExists = !!installedExecutablePath && fs.existsSync(installedExecutablePath)
  const executableMatched = !!installedExecutablePath && (!expectedExecutablePath || installedExecutablePath === expectedExecutablePath)
  const versionMatched = !!installedVersion && (!expectedVersion || installedVersion === expectedVersion)
  return {
    path: target,
    installed: !!installedVersion,
    managed: !!installedVersion,
    installedVersion,
    expectedVersion,
    versionMatched,
    installedExecutablePath,
    expectedExecutablePath,
    executableExists,
    executableMatched,
    healthy: !!installedVersion && versionMatched && executableExists && executableMatched,
    pathConfigured: pathEntries(options.env || process.env, options.platform || process.platform).includes(path.dirname(target)),
  }
}

function pathEntries(env, platform) {
  const separator = platform === 'win32' ? ';' : ':'
  return String(env.PATH || '').split(separator).filter(Boolean).map((entry) => path.resolve(entry))
}

function installCli(options = {}) {
  if (!options.executablePath) throw new Error('CLI installation requires the packaged MaxxToken executable path.')
  if (!options.version) throw new Error('CLI installation requires the MaxxToken version.')
  const platform = options.platform || process.platform
  const target = options.target || defaultCliPath({ ...options, platform })
  if (fs.existsSync(target)) {
    const current = fs.readFileSync(target, 'utf8')
    if (!parseManagedVersion(current) && options.force !== true) {
      throw new Error(`Refusing to replace an unmanaged file at ${target}.`)
    }
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`
  try {
    fs.writeFileSync(temporary, wrapperText({ ...options, platform }), { mode: platform === 'win32' ? 0o600 : 0o755 })
    fs.renameSync(temporary, target)
    if (platform !== 'win32') fs.chmodSync(target, 0o755)
  } finally {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) } catch {}
  }
  return getCliStatus({ ...options, platform, target })
}

function uninstallCli(options = {}) {
  const target = options.target || defaultCliPath(options)
  if (!fs.existsSync(target)) return { path: target, removed: false }
  const text = fs.readFileSync(target, 'utf8')
  if (!parseManagedVersion(text)) throw new Error(`Refusing to remove an unmanaged file at ${target}.`)
  fs.unlinkSync(target)
  return { path: target, removed: true }
}

module.exports = {
  defaultCliPath,
  getCliStatus,
  installCli,
  uninstallCli,
  getCLIStatus: getCliStatus,
  installCLI: installCli,
  uninstallCLI: uninstallCli,
  _private: { wrapperText, parseManagedVersion, parseExecutablePath, shellQuote, pathEntries },
}
