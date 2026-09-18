const { loadConfig } = require('./config')
const secrets = require('./secrets')
const { configureProxy } = require('./http')

async function runCli(app, argv, options = {}) {
  const args = Array.isArray(argv) ? argv : []
  if (args.length === 1 && args[0] === '--version') {
    const stdout = options.io?.stdout || process.stdout
    stdout.write(`${app.getVersion()}\n`)
    return 0
  }
  if (args.length === 1 && ['--help', '-h', 'help'].includes(args[0])) {
    const run = options.run || require('./tui-cli').run
    return run(args, options.io)
  }
  await app.whenReady()
  const config = (options.loadConfig || loadConfig)()
  configureProxy(config.proxy || {}, (options.getProxyCredentials || secrets.getProxyCredentials)())
  const run = options.run || require('./tui-cli').run
  return run(args, options.io)
}

function start(app, argv, options = {}) {
  const exit = options.exit || ((code) => app.exit(code))
  const promise = runCli(app, argv, options)
    .then((code) => {
      exit(Number.isInteger(code) ? code : 1)
      return code
    })
    .catch((err) => {
      const stderr = options.io?.stderr || process.stderr
      stderr.write(`${secrets.redactSensitive(err && err.message ? err.message : String(err))}\n`)
      exit(1)
      return 1
    })
  return promise
}

module.exports = { start, runCli }
