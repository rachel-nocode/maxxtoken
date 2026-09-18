#!/usr/bin/env node

const path = require('path')
const packageJson = require('../package.json')
const { refreshManifest, updateManifestNames } = require('../lib/release-validation')

const projectDir = path.resolve(__dirname, '..')
const positional = process.argv.slice(2).filter(arg => !arg.startsWith('--'))
const distDir = path.resolve(projectDir, positional[0] || 'dist')
const manifests = updateManifestNames(packageJson.version)

try {
  refreshManifest(distDir, manifests.mac)
  refreshManifest(distDir, manifests.win)
  console.log(`Refreshed ${manifests.mac} and ${manifests.win}.`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
