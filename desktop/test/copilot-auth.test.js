const assert = require('node:assert/strict')
const test = require('node:test')

const copilotAuth = require('../lib/copilot-auth')
const { readLocalCopilotToken, _private } = copilotAuth
const { tokenFromCopilotFiles, oauthTokenFromMap, copilotConfigDir } = _private

function fsWith(files) {
  return {
    readFileSync(file) {
      if (Object.prototype.hasOwnProperty.call(files, file)) return files[file]
      const err = new Error('ENOENT')
      err.code = 'ENOENT'
      throw err
    },
  }
}

test('oauthTokenFromMap prefers the github.com entry', () => {
  const map = {
    'ghe.example.com:Iv1.x': { oauth_token: 'enterprise' },
    'github.com:Iv1.y': { oauth_token: 'gho_real' },
  }
  assert.equal(oauthTokenFromMap(map, true), 'gho_real')
})

test('oauthTokenFromMap falls back to any oauth_token when no github.com key', () => {
  const map = { 'ghe.example.com:Iv1.x': { oauth_token: 'enterprise' } }
  assert.equal(oauthTokenFromMap(map, true), 'enterprise')
})

test('tokenFromCopilotFiles reads apps.json first', () => {
  const dir = '/cfg/github-copilot'
  const fs = fsWith({
    [`${dir}/apps.json`]: JSON.stringify({ 'github.com:Iv1.a': { user: 'me', oauth_token: 'gho_apps' } }),
  })
  assert.equal(tokenFromCopilotFiles(dir, fs), 'gho_apps')
})

test('tokenFromCopilotFiles falls back to hosts.json', () => {
  const dir = '/cfg/github-copilot'
  const fs = fsWith({
    [`${dir}/hosts.json`]: JSON.stringify({ 'github.com': { oauth_token: 'gho_hosts' } }),
  })
  assert.equal(tokenFromCopilotFiles(dir, fs), 'gho_hosts')
})

test('tokenFromCopilotFiles returns null when nothing on disk', () => {
  assert.equal(tokenFromCopilotFiles('/cfg/github-copilot', fsWith({})), null)
})

test('copilotConfigDir honors XDG_CONFIG_HOME', () => {
  assert.equal(copilotConfigDir('/home/me', { XDG_CONFIG_HOME: '/xdg' }), '/xdg/github-copilot')
  assert.equal(copilotConfigDir('/home/me', {}), '/home/me/.config/github-copilot')
})

test('readLocalCopilotToken returns the file token without spawning gh', () => {
  const home = '/home/me'
  const dir = `${home}/.config/github-copilot`
  const fs = fsWith({
    [`${dir}/apps.json`]: JSON.stringify({ 'github.com:Iv1.a': { oauth_token: 'gho_local' } }),
  })
  let spawned = false
  const token = readLocalCopilotToken({
    home,
    env: {},
    fs,
    execFileSync: () => { spawned = true; return '' },
  })
  assert.equal(token, 'gho_local')
  assert.equal(spawned, false)
})

test('readLocalCopilotToken skips gh when skipGhCli set', () => {
  const token = readLocalCopilotToken({
    home: '/home/me',
    env: {},
    fs: fsWith({}),
    skipGhCli: true,
  })
  assert.equal(token, null)
})
