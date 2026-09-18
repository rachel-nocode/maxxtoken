const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function fail(message) {
  throw new Error(message)
}

function yamlScalar(value) {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseUpdateManifest(contents) {
  let topLevelPath = null
  let version = null
  let topLevelSha512 = null
  const files = []
  let currentFile = null

  for (const line of contents.split(/\r?\n/)) {
    const versionMatch = line.match(/^version:\s*(.+?)\s*$/)
    if (versionMatch) version = yamlScalar(versionMatch[1])

    const pathMatch = line.match(/^path:\s*(.+?)\s*$/)
    if (pathMatch) topLevelPath = yamlScalar(pathMatch[1])

    const urlMatch = line.match(/^\s+-\s+url:\s*(.+?)\s*$/)
    if (urlMatch) {
      currentFile = { url: yamlScalar(urlMatch[1]) }
      files.push(currentFile)
      continue
    }

    const fileShaMatch = line.match(/^\s{4,}sha512:\s*(.+?)\s*$/)
    if (fileShaMatch && currentFile) currentFile.sha512 = yamlScalar(fileShaMatch[1])
    const fileSizeMatch = line.match(/^\s{4,}size:\s*(\d+)\s*$/)
    if (fileSizeMatch && currentFile) currentFile.size = Number(fileSizeMatch[1])

    const shaMatch = line.match(/^sha512:\s*(.+?)\s*$/)
    if (shaMatch) topLevelSha512 = yamlScalar(shaMatch[1])
  }

  if (!version) fail('Update manifest is missing a version')
  if (!topLevelPath) fail('Update manifest is missing a top-level path')
  if (!topLevelSha512) fail('Update manifest is missing a top-level sha512')
  if (files.length === 0) fail('Update manifest has no files')
  return { version, topLevelPath, topLevelSha512, files }
}

function manifestArtifactName(value) {
  let decoded
  try {
    decoded = decodeURIComponent(value)
  } catch {
    fail(`Invalid manifest artifact path: ${value}`)
  }
  if (!decoded || decoded !== path.basename(decoded) || decoded.includes('\\') || /[?#]/.test(decoded)) {
    fail(`Manifest artifact must be a local filename: ${value}`)
  }
  return decoded
}

function sha512(file) {
  return crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64')
}

function validateManifest(directory, filename, expectedVersion) {
  const manifest = parseUpdateManifest(fs.readFileSync(path.join(directory, filename), 'utf8'))
  if (manifest.version !== expectedVersion) {
    fail(`${filename} version must be ${expectedVersion}; found ${manifest.version}`)
  }

  for (const entry of manifest.files) {
    const name = manifestArtifactName(entry.url)
    const file = path.join(directory, name)
    if (!fs.existsSync(file)) fail(`${filename} references missing artifact: ${name}`)
    if (!entry.sha512) fail(`${filename} is missing sha512 for ${name}`)
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) fail(`${filename} is missing a valid size for ${name}`)
    const stat = fs.statSync(file)
    if (stat.size !== entry.size) fail(`${filename} size is stale for ${name}`)
    if (sha512(file) !== entry.sha512) fail(`${filename} sha512 is stale for ${name}`)
  }

  const topName = manifestArtifactName(manifest.topLevelPath)
  const topEntry = manifest.files.find(entry => manifestArtifactName(entry.url) === topName)
  if (!topEntry) fail(`${filename} top-level path is absent from files: ${topName}`)
  if (manifest.topLevelSha512 !== topEntry.sha512) fail(`${filename} top-level sha512 does not match ${topName}`)
  return manifest
}

function refreshManifest(directory, filename) {
  const manifestPath = path.join(directory, filename)
  const contents = fs.readFileSync(manifestPath, 'utf8')
  const manifest = parseUpdateManifest(contents)
  const metadata = new Map()

  for (const entry of manifest.files) {
    const name = manifestArtifactName(entry.url)
    const file = path.join(directory, name)
    if (!fs.existsSync(file)) fail(`${filename} references missing artifact: ${name}`)
    metadata.set(name, { sha512: sha512(file), size: fs.statSync(file).size })
  }
  const topName = manifestArtifactName(manifest.topLevelPath)
  if (!metadata.has(topName)) fail(`${filename} top-level path is absent from files: ${topName}`)

  let currentName = null
  const lines = contents.split(/\r?\n/).map(line => {
    const urlMatch = line.match(/^(\s+-\s+url:\s*)(.+?)\s*$/)
    if (urlMatch) {
      currentName = manifestArtifactName(yamlScalar(urlMatch[2]))
      return line
    }
    const fileShaMatch = line.match(/^(\s{4,}sha512:\s*).+$/)
    if (fileShaMatch && currentName) return `${fileShaMatch[1]}${metadata.get(currentName).sha512}`
    const fileSizeMatch = line.match(/^(\s{4,}size:\s*)\d+\s*$/)
    if (fileSizeMatch && currentName) return `${fileSizeMatch[1]}${metadata.get(currentName).size}`
    const topShaMatch = line.match(/^(sha512:\s*).+$/)
    if (topShaMatch) return `${topShaMatch[1]}${metadata.get(topName).sha512}`
    return line
  })
  fs.writeFileSync(manifestPath, lines.join('\n'))
}

function oneMatch(files, predicate, label) {
  const matches = files.filter(predicate)
  if (matches.length !== 1) fail(`Expected exactly one ${label}; found ${matches.length}`)
  return matches[0]
}

function updateManifestNames(version) {
  const prerelease = version.includes('-') ? version.split('-', 2)[1].split('.', 1)[0] : null
  const channel = prerelease || 'latest'
  return { mac: `${channel}-mac.yml`, win: `${channel}.yml` }
}

function validateReleaseInventory(directory, { productName, version }) {
  const files = fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
  const prefix = `${productName}-${version}-`
  const dmg = oneMatch(files, name => name.startsWith(prefix) && name.endsWith('.dmg'), 'macOS DMG')
  const zip = oneMatch(files, name => name.startsWith(prefix) && name.endsWith('.zip'), 'macOS ZIP')
  const exe = oneMatch(files, name => name.startsWith(prefix) && name.endsWith('.exe'), 'Windows EXE')

  if (!dmg.includes('universal')) fail(`macOS DMG must identify the universal architecture: ${dmg}`)
  if (!zip.includes('universal')) fail(`macOS ZIP must identify the universal architecture: ${zip}`)

  const manifests = updateManifestNames(version)
  const required = [
    dmg,
    `${dmg}.blockmap`,
    zip,
    `${zip}.blockmap`,
    exe,
    `${exe}.blockmap`,
    manifests.mac,
    manifests.win,
  ]
  for (const name of required) {
    if (!files.includes(name)) fail(`Missing release artifact: ${name}`)
  }

  const macManifest = validateManifest(directory, manifests.mac, version)
  const winManifest = validateManifest(directory, manifests.win, version)
  const macPath = manifestArtifactName(macManifest.topLevelPath)
  const winPath = manifestArtifactName(winManifest.topLevelPath)
  const macFiles = macManifest.files.map(entry => manifestArtifactName(entry.url))
  const winFiles = winManifest.files.map(entry => manifestArtifactName(entry.url))

  if (macPath !== zip) fail(`${manifests.mac} path must be the ZIP (${zip}); found ${macPath}`)
  if (!macFiles.includes(zip)) fail(`${manifests.mac} files must include ${zip}`)
  if (winPath !== exe) fail(`${manifests.win} path must be the EXE (${exe}); found ${winPath}`)
  if (!winFiles.includes(exe)) fail(`${manifests.win} files must include ${exe}`)

  return { dmg, zip, exe, manifests, required }
}

function peMachine(buffer) {
  if (buffer.length < 64 || buffer.toString('ascii', 0, 2) !== 'MZ') fail('Windows binary is missing the MZ header')
  const peOffset = buffer.readUInt32LE(0x3c)
  if (peOffset + 6 > buffer.length || buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
    fail('Windows binary is missing the PE header')
  }
  return buffer.readUInt16LE(peOffset + 4)
}

function assertX64Pe(file) {
  const buffer = fs.readFileSync(file)
  const machine = peMachine(buffer)
  if (machine !== 0x8664) fail(`Windows payload must be PE32+ x86-64 (machine 0x8664); found 0x${machine.toString(16)}`)
  const peOffset = buffer.readUInt32LE(0x3c)
  if (peOffset + 26 > buffer.length || buffer.readUInt16LE(peOffset + 24) !== 0x20b) {
    fail('Windows payload must use the PE32+ optional header (magic 0x20b)')
  }
}

module.exports = {
  assertX64Pe,
  manifestArtifactName,
  parseUpdateManifest,
  peMachine,
  refreshManifest,
  sha512,
  updateManifestNames,
  validateManifest,
  validateReleaseInventory,
}
