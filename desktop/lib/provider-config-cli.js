const { loadConfig, saveConfig, FILE } = require('./config')
const { canonicalProviderId, aliasesForProvider } = require('./provider-ids')

function usage() {
  return [
    'Usage:',
    '  maxxtoken-config providers [--json]',
    '  maxxtoken-config enable <provider...>',
    '  maxxtoken-config disable <provider...>',
    '',
    'Aliases like azure-openai, t3-chat, kimi-k2, and groqcloud are accepted.',
  ].join('\n')
}

function providerRows(config) {
  return Object.entries(config.providers || {}).map(([id, provider]) => ({
    id,
    enabled: provider.enabled === true,
    name: provider.name || id,
    plan: provider.plan || '',
    monthly: Number(provider.monthly) || 0,
    aliases: aliasesForProvider(id),
  }))
}

function formatProviders(config) {
  const rows = providerRows(config)
  const idWidth = Math.max(2, ...rows.map((row) => row.id.length))
  const nameWidth = Math.max(4, ...rows.map((row) => row.name.length))
  return rows
    .map((row) => {
      const enabled = row.enabled ? 'on ' : 'off'
      const aliases = row.aliases.length ? ` aliases: ${row.aliases.join(', ')}` : ''
      const monthly = row.monthly ? `$${row.monthly}/mo` : 'no cap'
      return `${enabled}  ${row.id.padEnd(idWidth)}  ${row.name.padEnd(nameWidth)}  ${row.plan} · ${monthly}${aliases}`
    })
    .join('\n')
}

function resolveProvider(rawId, config) {
  const id = canonicalProviderId(rawId)
  if (config.providers?.[id]) return id
  throw new Error(`Unknown provider: ${rawId}`)
}

function setProvidersEnabled(rawIds, enabled, file = FILE) {
  if (!rawIds.length) throw new Error(`Pass at least one provider to ${enabled ? 'enable' : 'disable'}.`)
  const config = loadConfig(file)
  const ids = rawIds.map((rawId) => resolveProvider(rawId, config))
  for (const id of ids) {
    config.providers[id] = { ...config.providers[id], enabled }
  }
  const saved = saveConfig(config, file)
  return ids.map((id) => ({ id, enabled: saved.providers[id].enabled === true }))
}

function normalizeArgs(argv) {
  const args = [...argv]
  if (args[0] === 'config') args.shift()
  return args
}

function run(argv = [], io = {}, file = FILE) {
  const stdout = io.stdout || process.stdout
  const stderr = io.stderr || process.stderr
  const args = normalizeArgs(argv)
  const command = args[0] || 'providers'

  try {
    if (command === 'providers' || command === 'list') {
      const config = loadConfig(file)
      if (args.includes('--json')) {
        stdout.write(`${JSON.stringify(providerRows(config), null, 2)}\n`)
      } else {
        stdout.write(`${formatProviders(config)}\n`)
      }
      return 0
    }

    if (command === 'enable' || command === 'disable') {
      const enabled = command === 'enable'
      const changed = setProvidersEnabled(args.slice(1), enabled, file)
      stdout.write(`${changed.map((row) => `${row.id}=${row.enabled ? 'on' : 'off'}`).join(' ')}\n`)
      return 0
    }

    if (command === 'help' || command === '--help' || command === '-h') {
      stdout.write(`${usage()}\n`)
      return 0
    }

    throw new Error(`Unknown command: ${command}`)
  } catch (err) {
    stderr.write(`${err.message || String(err)}\n\n${usage()}\n`)
    return 1
  }
}

function main(argv = process.argv.slice(2)) {
  process.exitCode = run(argv)
}

module.exports = {
  run,
  main,
  formatProviders,
  providerRows,
  resolveProvider,
  setProvidersEnabled,
}
