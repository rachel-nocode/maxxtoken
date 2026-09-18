const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { assertBundleArchitectures, probeArchitectures } = require('../scripts/macos-architecture')

test('release validation never invokes Rosetta unless explicitly requested', () => {
  assert.deepEqual(probeArchitectures('arm64'), ['arm64'])
  assert.deepEqual(probeArchitectures('arm64', true), ['arm64', 'x86_64'])
  assert.deepEqual(probeArchitectures('x64'), ['x86_64'])
})

test('architecture gate catches an Intel-only component inside a native bundle', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-arch-'))
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }))
  fs.mkdirSync(path.join(folder, 'Resources', 'nested'), { recursive: true })
  const main = path.join(folder, 'main')
  const addon = path.join(folder, 'Resources', 'nested', 'addon.node')
  fs.writeFileSync(main, Buffer.from('cafebabe', 'hex'))
  fs.writeFileSync(addon, Buffer.from('cffaedfe', 'hex'))
  fs.writeFileSync(path.join(folder, 'readme.txt'), 'Not a binary')
  fs.symlinkSync(folder, path.join(folder, 'loop'))
  const exec = (_command, args) => args[1] === addon ? 'x86_64' : 'x86_64 arm64'
  assert.throws(() => assertBundleArchitectures(folder, ['arm64'], exec), /addon.node.*requires arm64/)
  assert.equal(assertBundleArchitectures(folder, ['arm64', 'x86_64'], () => 'x86_64 arm64').length, 2)
})

test('architecture gate rejects a bundle with no native binaries', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-arch-'))
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }))
  assert.throws(() => assertBundleArchitectures(folder), /No Mach-O/)
})
