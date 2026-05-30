const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { scanBacklogMissions, backlogPrompt } = require('../lib/backlog')

function tmpRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backlog-test-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return dir
}

test('empty folder yields no missions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backlog-empty-'))
  const r = scanBacklogMissions(dir)
  assert.strictEqual(r.missions.length, 0)
})

test('repo with source and no tests proposes a test suite mission first', () => {
  const dir = tmpRepo({
    'package.json': '{"name":"x"}',
    'src/a.js': 'export const a = 1\n',
    'src/b.js': 'export const b = 2\n',
    'src/c.js': 'export const c = 3\n',
    'README.md': '# x\n\nA real readme that is long enough to not be a stub. '.repeat(20),
  })
  const r = scanBacklogMissions(dir)
  assert.strictEqual(r.stack, 'Node')
  assert.strictEqual(r.missions[0].kind, 'tests')
})

test('TODO markers are counted into a mission', () => {
  const dir = tmpRepo({
    'a.js': '// TODO: fix this\n// FIXME later\nconst x = 1\n',
    'b.js': '// TODO another\n',
  })
  const r = scanBacklogMissions(dir)
  const todos = r.missions.find((m) => m.kind === 'todos')
  assert.ok(todos, 'has a todos mission')
  assert.match(todos.title, /3 TODO\/FIXME/)
})

test('backlogPrompt anchors to the dir and names the mission', () => {
  const p = backlogPrompt({ title: 'Add a test suite', why: 'no tests', stack: 'Node' }, '/tmp/proj', 'claude')
  assert.match(p, /Add a test suite/)
  assert.match(p, /\/tmp\/proj/)
  assert.ok(!p.includes('{{PROJECT_DIR}}'), 'placeholders are substituted')
})
