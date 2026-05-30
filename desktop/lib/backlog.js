// Backlog burn: turn an existing repo into concrete fix/test/refactor/docs
// missions so unused AI quota gets spent on real maintenance, not just new
// apps. Fully deterministic — walks the tree and classifies — so it works even
// when live idea generation is rate-limited. Callers may enrich with an LLM,
// but the missions here stand on their own.

const fs = require('fs')
const path = require('path')

const SOURCE_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.rb',
  '.java', '.kt', '.swift', '.c', '.cc', '.cpp', '.h', '.hpp', '.cs', '.php',
  '.vue', '.svelte', '.lua',
])
const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', 'coverage', '.next', '.nuxt', '.turbo',
  '.cache', '.git', '.vercel', '.expo', 'vendor', 'target', 'out', '.venv',
  'venv', '__pycache__', '.idea', '.vscode',
])
const TEST_RE = /(\.test\.|\.spec\.|(^|\/)(test|tests|__tests__|spec)\/)/i
const TODO_RE = /\b(TODO|FIXME|HACK|XXX)\b/g

// Walk a repo, returning lightweight file records. Bounded so a huge tree can't
// hang the scan.
function walkRepo(dir, { maxFiles = 4000, maxDepth = 7 } = {}) {
  const files = []
  let scanned = 0
  function walk(cur, depth) {
    if (scanned >= maxFiles || depth > maxDepth) return
    let st
    try {
      st = fs.lstatSync(cur)
    } catch {
      return
    }
    if (st.isSymbolicLink()) return
    const name = path.basename(cur)
    if (st.isDirectory()) {
      if (IGNORE_DIRS.has(name)) return
      let entries = []
      try {
        entries = fs.readdirSync(cur)
      } catch {
        return
      }
      for (const entry of entries) walk(path.join(cur, entry), depth + 1)
      return
    }
    if (!st.isFile()) return
    scanned++
    files.push({
      rel: path.relative(dir, cur) || name,
      abs: cur,
      name,
      ext: path.extname(name).toLowerCase(),
      bytes: Number(st.size) || 0,
    })
  }
  walk(dir, 0)
  return files
}

function detectStack(files) {
  const has = (n) => files.some((f) => f.rel === n || f.name === n)
  if (has('package.json')) return files.some((f) => f.name === 'tsconfig.json') ? 'Node + TypeScript' : 'Node'
  if (files.some((f) => f.name === 'Cargo.toml')) return 'Rust'
  if (files.some((f) => f.name === 'go.mod')) return 'Go'
  if (has('requirements.txt') || has('pyproject.toml') || files.some((f) => f.ext === '.py')) return 'Python'
  if (files.some((f) => f.ext === '.swift')) return 'Swift'
  return 'mixed'
}

// Count lines + TODO markers and flag large files. Reads only reasonably-sized
// source files to keep the scan cheap.
function inspectSources(sourceFiles) {
  let todoCount = 0
  const todoFiles = []
  const largeFiles = []
  for (const f of sourceFiles) {
    if (f.bytes > 400000) {
      largeFiles.push({ rel: f.rel, lines: null })
      continue
    }
    let text = ''
    try {
      text = fs.readFileSync(f.abs, 'utf8')
    } catch {
      continue
    }
    const lines = text.length ? text.split('\n').length : 0
    const matches = text.match(TODO_RE)
    if (matches && matches.length) {
      todoCount += matches.length
      todoFiles.push({ rel: f.rel, count: matches.length })
    }
    if (lines >= 400) largeFiles.push({ rel: f.rel, lines })
  }
  todoFiles.sort((a, b) => b.count - a.count)
  largeFiles.sort((a, b) => (b.lines || 1e9) - (a.lines || 1e9))
  return { todoCount, todoFiles, largeFiles }
}

const KIND_DEFAULTS = {
  tests: { buildMinutes: 120, complexity: 3 },
  coverage: { buildMinutes: 90, complexity: 2 },
  todos: { buildMinutes: 60, complexity: 2 },
  docs: { buildMinutes: 45, complexity: 1 },
  refactor: { buildMinutes: 90, complexity: 3 },
  ci: { buildMinutes: 45, complexity: 2 },
  types: { buildMinutes: 120, complexity: 3 },
  deps: { buildMinutes: 60, complexity: 2 },
}

// Produce ranked backlog missions for a repo. Each mission is concrete: a title,
// the why, target files, and sizing. `weight` orders them by impact.
function scanBacklogMissions(dir, options = {}) {
  const files = walkRepo(dir, options)
  if (!files.length) return { stack: 'unknown', fileCount: 0, missions: [] }

  const stack = detectStack(files)
  const sourceFiles = files.filter((f) => SOURCE_EXTS.has(f.ext))
  const testFiles = sourceFiles.filter((f) => TEST_RE.test(f.rel))
  const nonTestSource = sourceFiles.filter((f) => !TEST_RE.test(f.rel))
  const { todoCount, todoFiles, largeFiles } = inspectSources(nonTestSource.slice(0, 1500))

  const readme = files.find((f) => /^readme(\.|$)/i.test(f.name))
  const hasCI = files.some((f) => f.rel.replace(/\\/g, '/').startsWith('.github/workflows'))
  const hasPackage = files.some((f) => f.name === 'package.json')
  const hasTsconfig = files.some((f) => f.name === 'tsconfig.json')
  const jsCount = nonTestSource.filter((f) => f.ext === '.js' || f.ext === '.jsx').length

  const missions = []
  const push = (kind, title, why, extra = {}) =>
    missions.push({
      kind,
      title,
      why,
      stack,
      buildMinutes: KIND_DEFAULTS[kind].buildMinutes,
      complexity: KIND_DEFAULTS[kind].complexity,
      ...extra,
    })

  if (nonTestSource.length >= 3 && testFiles.length === 0) {
    push('tests', 'Add a test suite', `${nonTestSource.length} source files and no tests — start with the core modules.`, { weight: 100, targets: nonTestSource.slice(0, 3).map((f) => f.rel) })
  } else if (testFiles.length > 0 && testFiles.length < Math.ceil(nonTestSource.length / 5)) {
    push('coverage', 'Expand test coverage', `Only ${testFiles.length} test files for ${nonTestSource.length} source files — cover the untested paths.`, { weight: 55 })
  }

  if (todoCount > 0) {
    push('todos', `Clear ${todoCount} TODO/FIXME marker${todoCount === 1 ? '' : 's'}`, `Open work flagged in the code — knock them out.`, { weight: 70, targets: todoFiles.slice(0, 3).map((f) => `${f.rel} (${f.count})`) })
  }

  if (!readme) push('docs', 'Write a project README', 'No README — document what this is, setup, and usage.', { weight: 60 })
  else if (readme.bytes < 400) push('docs', 'Flesh out the README', 'README is a stub — expand setup, usage, and architecture.', { weight: 40 })

  if (largeFiles.length) {
    const top = largeFiles[0]
    push('refactor', `Refactor ${path.basename(top.rel)}`, `${top.lines ? top.lines + '-line' : 'Oversized'} file — split into focused modules.`, { weight: 50, targets: largeFiles.slice(0, 2).map((f) => (f.lines ? `${f.rel} (${f.lines} lines)` : f.rel)) })
  }

  if (hasPackage && !hasCI) push('ci', 'Add a CI workflow', 'No .github/workflows — add lint+test on push.', { weight: 35 })
  if (hasTsconfig && jsCount > 0) push('types', `Finish the TypeScript migration`, `${jsCount} plain .js files remain alongside a tsconfig — convert them.`, { weight: 45 })
  if (hasPackage) push('deps', 'Audit & update dependencies', 'Run an upgrade pass and fix anything the new versions break.', { weight: 30 })

  missions.sort((a, b) => b.weight - a.weight)
  return { stack, fileCount: files.length, sourceCount: nonTestSource.length, testCount: testFiles.length, missions: missions.slice(0, 6) }
}

// A scoped build prompt for one backlog mission, anchored to the repo.
function backlogPrompt(mission, dir, cli = 'claude') {
  const targets = Array.isArray(mission.targets) && mission.targets.length ? mission.targets : null
  return [
    `GOAL: ${mission.title} in the existing project at {{PROJECT_DIR}}`,
    '',
    `WHY: ${mission.why}`,
    targets ? `START WITH:\n${targets.map((t) => '- ' + t).join('\n')}` : '',
    '',
    'DONE WHEN:',
    `- ${mission.title} is complete and the change is coherent with the existing code`,
    '- Existing tests still pass; new behavior is covered',
    '- VERIFY exits 0',
    '',
    'SCOPE:',
    '- edit: {{PROJECT_DIR}}/**',
    '- do not touch: {{PROJECT_DIR}}/.git/**, {{PROJECT_DIR}}/node_modules/**, build/dist output, files outside {{PROJECT_DIR}}',
    '',
    'CONSTRAINTS:',
    '- Match the existing conventions, style, and structure of this repo',
    '- Smallest change that fully achieves the goal — no broad rewrites, no new deps unless required',
    `- Stack: ${mission.stack}`,
    '',
    'VERIFY: {{VERIFY}}',
    '',
    `ON FAILURE: after 4 iterations without progress, write the blocker, last failing command, changed files, and next step to {{PROJECT_DIR}}/backlog-burn-report.html, then stop.`,
    '',
    `Use ${cli} for the build.`,
  ]
    .filter(Boolean)
    .join('\n')
    .replace(/\{\{PROJECT_DIR\}\}/g, dir)
}

module.exports = { scanBacklogMissions, backlogPrompt, walkRepo, _private: { detectStack, inspectSources } }
