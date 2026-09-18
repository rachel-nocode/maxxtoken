const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const test = require('node:test')
const {
  assertX64Pe,
  parseUpdateManifest,
  refreshManifest,
  updateManifestNames,
  validateManifest,
  validateReleaseInventory,
} = require('../lib/release-validation')

function tempDir(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-release-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

function touch(directory, names) {
  for (const name of names) fs.writeFileSync(path.join(directory, name), '')
}

function hash(contents = '') {
  return crypto.createHash('sha512').update(contents).digest('base64')
}

function manifest(version, artifact, contents = '') {
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${artifact}`,
    `    sha512: ${hash(contents)}`,
    `    size: ${Buffer.byteLength(contents)}`,
    `path: ${artifact}`,
    `sha512: ${hash(contents)}`,
  ].join('\n')
}

test('parses top-level update path separately from files', () => {
  const manifest = parseUpdateManifest([
    'version: 0.2.13',
    'files:',
    '  - url: MaxxToken-0.2.13-universal.zip',
    '    sha512: abc',
    '    size: 123',
    'path: MaxxToken-0.2.13-universal.zip',
    'sha512: abc',
  ].join('\n'))
  assert.equal(manifest.version, '0.2.13')
  assert.equal(manifest.topLevelPath, 'MaxxToken-0.2.13-universal.zip')
  assert.deepEqual(manifest.files, [{ url: 'MaxxToken-0.2.13-universal.zip', sha512: 'abc', size: 123 }])
})

test('selects stable and prerelease channel manifests', () => {
  assert.deepEqual(updateManifestNames('0.2.13'), { mac: 'latest-mac.yml', win: 'latest.yml' })
  assert.deepEqual(updateManifestNames('0.2.13-beta.1'), { mac: 'beta-mac.yml', win: 'beta.yml' })
})

test('requires the complete updater-safe release inventory', t => {
  const directory = tempDir(t)
  const files = [
    'MaxxToken-0.2.13-universal.dmg',
    'MaxxToken-0.2.13-universal.dmg.blockmap',
    'MaxxToken-0.2.13-universal.zip',
    'MaxxToken-0.2.13-universal.zip.blockmap',
    'MaxxToken-0.2.13-setup.exe',
    'MaxxToken-0.2.13-setup.exe.blockmap',
  ]
  touch(directory, files)
  fs.writeFileSync(path.join(directory, 'latest-mac.yml'), manifest('0.2.13', 'MaxxToken-0.2.13-universal.zip'))
  fs.writeFileSync(path.join(directory, 'latest.yml'), manifest('0.2.13', 'MaxxToken-0.2.13-setup.exe'))

  const result = validateReleaseInventory(directory, { productName: 'MaxxToken', version: '0.2.13' })
  assert.equal(result.required.length, 8)
})

test('rejects a DMG updater path', t => {
  const directory = tempDir(t)
  touch(directory, [
    'MaxxToken-0.2.13-universal.dmg',
    'MaxxToken-0.2.13-universal.dmg.blockmap',
    'MaxxToken-0.2.13-universal.zip',
    'MaxxToken-0.2.13-universal.zip.blockmap',
    'MaxxToken-0.2.13-setup.exe',
    'MaxxToken-0.2.13-setup.exe.blockmap',
  ])
  fs.writeFileSync(path.join(directory, 'latest-mac.yml'), manifest('0.2.13', 'MaxxToken-0.2.13-universal.zip').replace(
    'path: MaxxToken-0.2.13-universal.zip',
    'path: MaxxToken-0.2.13-universal.dmg',
  ))
  fs.writeFileSync(path.join(directory, 'latest.yml'), manifest('0.2.13', 'MaxxToken-0.2.13-setup.exe'))
  assert.throws(
    () => validateReleaseInventory(directory, { productName: 'MaxxToken', version: '0.2.13' }),
    /top-level path is absent|path must be the ZIP/,
  )
})

test('accepts only a PE32+ x86-64 payload', t => {
  const directory = tempDir(t)
  const executable = path.join(directory, 'MaxxToken.exe')
  const pe = Buffer.alloc(256)
  pe.write('MZ')
  pe.writeUInt32LE(128, 0x3c)
  pe.write('PE\0\0', 128, 'ascii')
  pe.writeUInt16LE(0x8664, 132)
  pe.writeUInt16LE(0x20b, 152)
  fs.writeFileSync(executable, pe)
  assert.doesNotThrow(() => assertX64Pe(executable))

  pe.writeUInt16LE(0xaa64, 132)
  fs.writeFileSync(executable, pe)
  assert.throws(() => assertX64Pe(executable), /x86-64/)
})

test('rejects stale checksums and remote artifact references', t => {
  const directory = tempDir(t)
  fs.writeFileSync(path.join(directory, 'artifact.zip'), 'current')
  fs.writeFileSync(path.join(directory, 'latest-mac.yml'), manifest('0.2.13', 'artifact.zip', 'stale'))
  assert.throws(() => validateManifest(directory, 'latest-mac.yml', '0.2.13'), /size is stale|sha512 is stale/)

  fs.writeFileSync(
    path.join(directory, 'latest-mac.yml'),
    manifest('0.2.13', 'https://example.com/artifact.zip', 'current'),
  )
  assert.throws(() => validateManifest(directory, 'latest-mac.yml', '0.2.13'), /local filename/)
})

test('does not accept a longer version with the same prefix', t => {
  const directory = tempDir(t)
  touch(directory, [
    'MaxxToken-0.2.130-universal.dmg',
    'MaxxToken-0.2.130-universal.dmg.blockmap',
    'MaxxToken-0.2.130-universal.zip',
    'MaxxToken-0.2.130-universal.zip.blockmap',
    'MaxxToken-0.2.130-setup.exe',
    'MaxxToken-0.2.130-setup.exe.blockmap',
    'latest-mac.yml',
    'latest.yml',
  ])
  assert.throws(
    () => validateReleaseInventory(directory, { productName: 'MaxxToken', version: '0.2.13' }),
    /exactly one macOS DMG/,
  )
})

test('refreshes manifest hashes and sizes after stapling changes an artifact', t => {
  const directory = tempDir(t)
  fs.writeFileSync(path.join(directory, 'artifact.dmg'), 'before')
  fs.writeFileSync(path.join(directory, 'latest-mac.yml'), manifest('0.2.13', 'artifact.dmg', 'before'))
  fs.writeFileSync(path.join(directory, 'artifact.dmg'), 'after-staple')

  assert.throws(() => validateManifest(directory, 'latest-mac.yml', '0.2.13'), /size is stale|sha512 is stale/)
  refreshManifest(directory, 'latest-mac.yml')
  assert.doesNotThrow(() => validateManifest(directory, 'latest-mac.yml', '0.2.13'))
})
