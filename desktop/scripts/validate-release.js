#!/usr/bin/env node

const { execFileSync, spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { assertBundleArchitectures, probeArchitectures } = require('./macos-architecture')
const {
  assertX64Pe,
  validateReleaseInventory,
} = require('../lib/release-validation')

const projectDir = path.resolve(__dirname, '..')
const packageJson = require('../package.json')
const buildOnly = process.argv.includes('--build-only')
const includeRosetta = process.argv.includes('--rosetta-smoke')
const positional = process.argv.slice(2).filter(arg => !arg.startsWith('--'))
const distDir = path.resolve(projectDir, positional[0] || 'dist')
const identity = 'Developer ID Application: Rachel Larralde (5U92RP4C5J)'
const teamId = '5U92RP4C5J'

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
}

function runCombined(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `${command} failed`).trim())
  return `${result.stdout || ''}${result.stderr || ''}`
}

function arches(file) {
  return new Set(run('/usr/bin/lipo', ['-archs', file]).trim().split(/\s+/))
}

function assertUniversal(file) {
  const found = arches(file)
  if (!found.has('arm64') || !found.has('x86_64') || found.size !== 2) {
    throw new Error(`${file} must contain exactly arm64 and x86_64 slices; found ${[...found].join(', ')}`)
  }
}

function assertMinimumVersion(file, expected) {
  const output = run('/usr/bin/vtool', ['-show-build', file])
  const versions = [...output.matchAll(/\bminos\s+([0-9.]+)/g)].map(match => match[1])
  if (versions.length !== 2 || versions.some(version => version !== expected)) {
    throw new Error(`${file} must target macOS ${expected} for both slices; found ${versions.join(', ') || 'none'}`)
  }
}

function assertSigned(app) {
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])
  const details = runCombined('/usr/bin/codesign', ['-dv', '--verbose=4', app])
  if (!details.includes(`Authority=${identity}`) || !details.includes(`TeamIdentifier=${teamId}`)) {
    throw new Error(`${app} is not signed with ${identity}`)
  }
}

function assertApp(app) {
  const product = packageJson.build.productName
  const main = path.join(app, 'Contents', 'MacOS', product)
  const framework = path.join(app, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Electron Framework')
  const helper = path.join(app, 'Contents', 'Resources', 'screen-capture-probe')
  for (const binary of [main, framework, helper]) assertUniversal(binary)
  assertBundleArchitectures(app)
  assertMinimumVersion(helper, packageJson.build.mac.minimumSystemVersion)

  const plist = path.join(app, 'Contents', 'Info.plist')
  const minimum = run('/usr/libexec/PlistBuddy', ['-c', 'Print :LSMinimumSystemVersion', plist]).trim()
  if (minimum !== packageJson.build.mac.minimumSystemVersion) {
    throw new Error(`${app} requires macOS ${minimum}; expected ${packageJson.build.mac.minimumSystemVersion}`)
  }
  const version = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist]).trim()
  if (version !== packageJson.version) {
    throw new Error(`${app} is version ${version}; expected ${packageJson.version}`)
  }

  assertSigned(app)

  for (const arch of probeArchitectures(process.arch, includeRosetta)) {
    const result = JSON.parse(run('/usr/bin/arch', [`-${arch}`, helper]))
    if (typeof result.supported !== 'boolean' || typeof result.captured !== 'boolean') {
      throw new Error(`Capture helper returned an invalid ${arch} result`)
    }
  }
}

function findApp(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
  const app = entries.find(entry => entry.isDirectory() && entry.name.endsWith('.app'))
  if (!app) throw new Error(`No app bundle found in ${directory}`)
  return path.join(directory, app.name)
}

function verifyZip(zip, tempRoot) {
  const output = path.join(tempRoot, 'zip')
  fs.mkdirSync(output)
  run('/usr/bin/ditto', ['-x', '-k', zip, output])
  assertApp(findApp(output))
}

function verifyDmg(dmg, tempRoot) {
  if (!buildOnly) assertSigned(dmg)
  const mount = path.join(tempRoot, 'dmg')
  fs.mkdirSync(mount)
  run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg])
  try {
    assertApp(findApp(mount))
    if (!buildOnly) run('/usr/bin/xcrun', ['stapler', 'validate', dmg])
  } finally {
    run('/usr/bin/hdiutil', ['detach', mount])
  }
}

function verifyWindowsPayload() {
  const executable = path.join(distDir, 'win-unpacked', `${packageJson.build.productName}.exe`)
  if (!fs.existsSync(executable)) throw new Error(`Missing unpacked Windows payload: ${executable}`)
  assertX64Pe(executable)
}

function main() {
  if (process.platform !== 'darwin') throw new Error('Release validation must run on macOS')
  if (process.arch === 'x64' && run('/usr/sbin/sysctl', ['-in', 'hw.optional.arm64']).trim() === '1') {
    throw new Error('Run release validation with native arm64 Node on Apple Silicon, not under Rosetta')
  }
  if (includeRosetta) console.warn('Rosetta smoke testing explicitly enabled; macOS may show an App Update Required warning.')
  const inventory = validateReleaseInventory(distDir, {
    productName: packageJson.build.productName,
    version: packageJson.version,
  })
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-release-'))
  try {
    verifyZip(path.join(distDir, inventory.zip), tempRoot)
    verifyDmg(path.join(distDir, inventory.dmg), tempRoot)
    verifyWindowsPayload()
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
  console.log(`Validated ${inventory.required.length} release assets${buildOnly ? ' (notarization skipped)' : ''}.`)
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
