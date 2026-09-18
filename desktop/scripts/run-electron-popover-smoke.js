const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const electronPath = require('electron')
const entry = path.join(__dirname, 'electron-popover-smoke-entry.cjs')
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-popover-smoke-'))
const env = { ...process.env, MAXXTOKEN_SMOKE_USER_DATA: userData }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronPath, [entry], {
  cwd: path.join(__dirname, '..'),
  env,
  stdio: 'inherit',
})

const timeout = setTimeout(() => child.kill('SIGTERM'), 20_000)

child.once('error', error => {
  clearTimeout(timeout)
  fs.rmSync(userData, { recursive: true, force: true })
  console.error(error.message)
  process.exitCode = 1
})

child.once('exit', (code, signal) => {
  clearTimeout(timeout)
  fs.rmSync(userData, { recursive: true, force: true })
  if (signal) console.error(`Electron smoke test stopped by ${signal}`)
  process.exitCode = code === 0 && !signal ? 0 : 1
})
