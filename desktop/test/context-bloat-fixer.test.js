const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const fixer = require('../lib/context-bloat-fixer')

test('context bloat fixer points to files and folders worth excluding', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-bloat-fixer-'))
  try {
    fs.mkdirSync(path.join(dir, 'dist'))
    fs.writeFileSync(path.join(dir, 'dist', 'bundle.js'), 'x'.repeat(2000))
    fs.writeFileSync(path.join(dir, 'debug.log'), 'log\n'.repeat(1000))
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'Keep this instruction.\n'.repeat(260))

    const result = fixer.scanContextBloat(dir)

    assert.equal(result.ok, true)
    assert.equal(result.folderName, path.basename(dir))
    assert.ok(result.findings.length >= 3)
    assert.deepEqual(
      result.findings.map((f) => f.action).slice(0, 3),
      ['Review instructions', 'Keep folder out', 'Keep file out'],
    )
    assert.match(result.summary, /items to review/i)
    assert.match(result.summary, /will not delete/i)
    assert.ok(result.estimatedTokens > 1000)
    assert.ok(result.findings[0].path)
    assert.ok(result.findings.find((f) => f.action === 'Keep folder out').estimatedTokens > 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('context bloat fixer collapses git internals into one clear suggestion', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-bloat-git-'))
  try {
    fs.mkdirSync(path.join(dir, '.git', 'logs'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.git', 'logs', 'HEAD'), 'commit\n'.repeat(500))

    const result = fixer.scanContextBloat(dir)
    assert.equal(result.ok, true)
    assert.equal(result.findings.length, 1)
    assert.equal(result.findings[0].action, 'Keep folder out')
    assert.equal(result.findings[0].detail, '.git')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('context bloat fixer handles empty folders', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-bloat-empty-'))
  try {
    const result = fixer.scanContextBloat(dir)
    assert.equal(result.ok, true)
    assert.deepEqual(result.findings, [])
    assert.match(result.summary, /No obvious context bloat/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
