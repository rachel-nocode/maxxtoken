const assert = require('node:assert/strict')
const test = require('node:test')

const httpHelper = require('../lib/http')
const { start } = require('../lib/cli-entry')
const secrets = require('../lib/secrets')

test('headless CLI waits for Electron, configures secure proxy auth and exits', async () => {
  const events = []
  const app = {
    whenReady: async () => { events.push('ready') },
    exit: (code) => events.push(`exit:${code}`),
  }
  await start(app, ['--json'], {
    loadConfig: () => ({ proxy: { enabled: true, url: 'http://proxy.invalid:8080' } }),
    getProxyCredentials: () => ({ username: 'fixture-user', password: 'fixture-password' }),
    run: async (argv) => { events.push(`run:${argv.join(',')}`); return 0 },
  })
  assert.deepEqual(events, ['ready', 'run:--json', 'exit:0'])
  assert.equal(httpHelper.getProxyState().hasCredentials, true)
  assert.doesNotMatch(JSON.stringify(httpHelper.getProxyState()), /fixture-(user|password)/)
  httpHelper.configureProxy({ enabled: false })
})

test('headless CLI version avoids app readiness and credential access', async () => {
  const output = []
  let credentialReads = 0
  await start(
    { getVersion: () => '9.8.7', whenReady: async () => { throw new Error('must not initialize') }, exit() {} },
    ['--version'],
    {
      io: { stdout: { write: (text) => output.push(text) }, stderr: { write() {} } },
      getProxyCredentials: () => { credentialReads += 1; return {} },
    },
  )
  assert.equal(output.join(''), '9.8.7\n')
  assert.equal(credentialReads, 0)
})

test('headless CLI redacts stored credentials from startup errors', async () => {
  const errors = []
  secrets.setProcessOverride({ fixture: 'fixture-sensitive-token' })
  try {
    await start(
      { whenReady: async () => {}, exit() {} },
      [],
      {
        io: { stdout: { write() {} }, stderr: { write: (text) => errors.push(text) } },
        loadConfig: () => { throw new Error('startup failed with fixture-sensitive-token') },
      },
    )
  } finally {
    secrets.setProcessOverride(null)
  }
  assert.match(errors.join(''), /startup failed with \[redacted\]/)
  assert.doesNotMatch(errors.join(''), /fixture-sensitive-token/)
})
