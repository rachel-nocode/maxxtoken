const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { readClaudeCredentials, persistClaudeCredentials } = require('./auth')
const { fetchWithTimeout } = require('./http')

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const REFRESH_URL = 'https://platform.claude.com/v1/oauth/token'
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const SCOPES =
  'user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload'
const MODEL = 'claude-sonnet-4-5'
const HISTORY_DIR = path.join(os.homedir(), '.maxxtoken')
const HISTORY_FILE = path.join(HISTORY_DIR, 'idea-history.jsonl')
const FRESH_COUNT = 6
const CANDIDATE_COUNT = 18

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'app',
  'are',
  'as',
  'at',
  'be',
  'build',
  'for',
  'from',
  'in',
  'into',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'tool',
  'turn',
  'with',
  'you',
  'your',
])

const BUILDER_CONTEXT = [
  'Builder context: tiny Mac/web apps that solve one painful workflow, creator-builder tools,',
  'automation templates, content repurposing, local-first utilities, and app-factory style workflows.',
  'Default web stack: Next.js or Astro, Convex, Clerk, Stripe. Prefer one-time payments unless recurring',
  'value is obvious. Every idea needs a kill metric. Do not pitch alternate AI IDEs.',
].join(' ')

// Fallback ideas so the stream always has something worth building even when
// generation is rate-limited. Moonshot energy, tiny first version.
const BANK = [
  {
    title: 'Agent Swarm Mission Control',
    pitch: 'A desktop war room where multiple AI agents work the same app idea from different angles.',
    moonshot: 'A command center for autonomous software teams.',
    firstTinyBuild: 'One folder, three agent prompts, live status cards, and a merge checklist.',
    viralHook: 'A screen recording of agents racing to ship the same feature.',
    killMetric: '3 builders use it twice in one week.',
    whyNow: 'Builders are already coordinating multiple coding agents by hand; the missing product is the control surface.',
    tags: ['agent-workflows', 'desktop', 'builder-tools'],
    complexity: 3,
    buildMinutes: 180,
    stack: 'Vite + Electron + local JSON',
  },
  {
    title: 'Taste Capture Camera',
    pitch: 'Drop screenshots of apps you love and it extracts a reusable design taste profile.',
    moonshot: 'A personal taste API every future app can query before it designs anything.',
    firstTinyBuild: 'Upload 5 screenshots, get colors, spacing, UI rules, and a reusable prompt.',
    viralHook: 'People share their "design DNA" card.',
    killMetric: '10 people generate a taste card and reuse the prompt.',
    whyNow: 'AI app generation makes taste the constraint; a reusable taste profile becomes leverage.',
    tags: ['design', 'vision', 'creator-tools'],
    complexity: 2,
    buildMinutes: 120,
    stack: 'Vite + image upload + model vision',
  },
  {
    title: 'Personal AI Black Box',
    pitch: 'A private recorder for decisions, prompts, links, and build moves while you work.',
    moonshot: 'A rewindable memory layer for every project you ever ship.',
    firstTinyBuild: 'Menubar capture button, timeline view, and "why did I do this?" search.',
    viralHook: 'Replay a chaotic build day as a clean product story.',
    killMetric: 'Capture 20 useful moments across 3 real work sessions.',
    whyNow: 'Agentic work creates lots of invisible decisions; capturing them makes projects easier to resume and explain.',
    tags: ['local-first', 'memory', 'mac-app'],
    complexity: 3,
    buildMinutes: 180,
    stack: 'Electron + SQLite + local search',
  },
  {
    title: 'Micro-SaaS Reactor',
    pitch: 'Turn one annoying workflow into an app spec, landing page angle, MVP scope, and kill metric.',
    moonshot: 'A factory line for finding the one tiny app that can become a real business.',
    firstTinyBuild: 'One pain-note input that outputs a build brief and experiment card.',
    viralHook: 'Share "from complaint to app" transformations.',
    killMetric: '5 ideas become scoped apps in under 10 minutes each.',
    whyNow: 'Everyone has AI coding access now; the scarce skill is choosing a tiny product worth building.',
    tags: ['micro-saas', 'product', 'experiments'],
    complexity: 2,
    buildMinutes: 100,
    stack: 'Next.js-style Vite MVP + local templates',
  },
  {
    title: 'Repo Oracle',
    pitch: 'Point it at a project and it predicts the next bug, next refactor, and next test to write.',
    moonshot: 'A future-proof maintenance brain for every small app in your portfolio.',
    firstTinyBuild: 'Paste a file tree and recent error; get ranked repair missions.',
    viralHook: 'Before/after posts where the oracle called the bug correctly.',
    killMetric: 'Correctly identifies one useful next fix in 3 repos.',
    whyNow: 'Small AI-built apps pile up maintenance debt fast; a next-fix oracle keeps portfolios alive.',
    tags: ['code-quality', 'portfolio', 'maintenance'],
    complexity: 3,
    buildMinutes: 160,
    stack: 'File parser + model call + mission cards',
  },
  {
    title: 'Content Fossilizer',
    pitch: 'Feed it a build session and it turns artifacts into posts, clips, docs, and launch notes.',
    moonshot: 'Every shipped feature automatically becomes a content engine.',
    firstTinyBuild: 'Drop a diff and notes; get one X post, one LinkedIn post, and one short script.',
    viralHook: 'Show the raw diff beside the finished content package.',
    killMetric: 'One package gets posted within 24 hours.',
    whyNow: 'Build-in-public works best when the content falls out of actual shipping artifacts.',
    tags: ['content', 'launch', 'creator-tools'],
    complexity: 2,
    buildMinutes: 120,
    stack: 'Vite + file drop + model call',
  },
  {
    title: 'Local Brain API',
    pitch: 'A tiny private context server that lets your apps ask what you care about, without cloud memory.',
    moonshot: 'One local memory layer powering every agentic tool you build.',
    firstTinyBuild: 'Local JSON profile, tiny API, and a test page that asks for preferences.',
    viralHook: 'Demo an app changing behavior because it knows your taste locally.',
    killMetric: 'Two separate prototypes reuse the same local context.',
    whyNow: 'Cloud memory is messy; local context gives agentic apps continuity without handing everything over.',
    tags: ['local-first', 'memory', 'agents'],
    complexity: 2,
    buildMinutes: 140,
    stack: 'Node local server + JSON + Vite client',
  },
  {
    title: 'App Autopsy Lab',
    pitch: 'A ruthless dashboard that decides whether a tiny app deserves more time, marketing, or death.',
    moonshot: 'A portfolio brain that compounds winners and kills distractions fast.',
    firstTinyBuild: 'Manual weekly metrics form with keep/kill/sell recommendations.',
    viralHook: 'Public "this app is dead" autopsy cards.',
    killMetric: 'Makes one decision easier using real metrics.',
    whyNow: 'Tiny app portfolios only compound if weak ideas get killed before they eat the calendar.',
    tags: ['analytics', 'portfolio', 'experiments'],
    complexity: 3,
    buildMinutes: 150,
    stack: 'Vite + local storage + charts',
  },
  {
    title: 'Workflow Creature Lab',
    pitch: 'Describe a repetitive task and it mutates into three automation organisms: tiny, useful, feral.',
    moonshot: 'A way to breed automation templates from real-life friction.',
    firstTinyBuild: 'Task input, three automation blueprints, and a copyable first prompt.',
    viralHook: 'People post the weirdest automation creature it invented.',
    killMetric: 'One blueprint saves 15 minutes in a real workflow.',
    whyNow: 'Personal automations are becoming products; weird framing makes templates easier to share.',
    tags: ['automation', 'templates', 'workflow'],
    complexity: 2,
    buildMinutes: 90,
    stack: 'Single-page app + model call',
  },
  {
    title: 'Future Self Simulator',
    pitch: 'Choose a build path and it simulates what your week, launch, and maintenance burden will look like.',
    moonshot: 'A decision simulator for indie builders before they waste months.',
    firstTinyBuild: 'Three-option tradeoff simulator with time, risk, and upside scores.',
    viralHook: 'Share "future me regrets this" cards.',
    killMetric: 'Changes one build decision before work starts.',
    whyNow: 'AI makes starting cheap and maintenance expensive; pre-mortems protect builder energy.',
    tags: ['decision-tools', 'planning', 'experiments'],
    complexity: 2,
    buildMinutes: 110,
    stack: 'Vite + scoring model + model call',
  },
]

function nowIso() {
  return new Date().toISOString()
}

function writeHistory(event) {
  try {
    fs.mkdirSync(HISTORY_DIR, { recursive: true })
    fs.appendFileSync(HISTORY_FILE, JSON.stringify({ at: nowIso(), ...event }) + '\n')
  } catch {
    /* history is nice-to-have */
  }
}

function readHistory(limit = 240) {
  try {
    const lines = fs.readFileSync(HISTORY_FILE, 'utf8').trim().split('\n').filter(Boolean)
    return lines
      .slice(-limit)
      .map((line) => JSON.parse(line))
      .filter(Boolean)
  } catch {
    return []
  }
}

function tokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOPWORDS.has(word))
}

function ideaText(idea) {
  return [
    idea.title,
    idea.pitch,
    idea.moonshot,
    idea.firstTinyBuild,
    idea.viralHook,
    idea.killMetric,
    idea.whyNow,
    ...(idea.tags || []),
  ]
    .filter(Boolean)
    .join(' ')
}

function signatureFor(idea) {
  return crypto.createHash('sha1').update(ideaText(idea).toLowerCase()).digest('hex').slice(0, 14)
}

function similarity(a, b) {
  const aa = new Set(tokens(a))
  const bb = new Set(tokens(b))
  if (!aa.size || !bb.size) return 0
  let overlap = 0
  for (const token of aa) {
    if (bb.has(token)) overlap++
  }
  return overlap / (aa.size + bb.size - overlap)
}

function historyIdeaText(event) {
  return ideaText(event.idea || event)
}

function tooSimilar(idea, history, picked) {
  const sig = signatureFor(idea)
  const text = ideaText(idea)
  const recentShown = history.filter((event) => event.event === 'shown').slice(-120)
  return [...picked, ...recentShown].some((event) => {
    const other = event.idea || event
    return event.signature === sig || signatureFor(other) === sig || similarity(text, historyIdeaText(event)) > 0.48
  })
}

function feedbackSummary(history) {
  const events = history.filter((event) => event.event === 'feedback').slice(-60)
  const liked = events
    .filter((event) => event.feedback === 'more' || event.feedback === 'start')
    .slice(-8)
    .map((event) => event.idea?.title || event.title)
    .filter(Boolean)
  const blocked = events
    .filter((event) => event.feedback === 'block')
    .slice(-8)
    .map((event) => event.idea?.title || event.title)
    .filter(Boolean)
  return { liked, blocked }
}

function promptHistory(history) {
  const shown = history
    .filter((event) => event.event === 'shown')
    .slice(-35)
    .map((event) => {
      const idea = event.idea || event
      return [idea.title, idea.pitch].filter(Boolean).join(': ')
    })
    .filter(Boolean)
  const { liked, blocked } = feedbackSummary(history)
  return [
    shown.length ? 'Recent ideas to avoid repeating:\n' + shown.map((item) => '- ' + item).join('\n') : '',
    liked.length ? 'Signals to make sharper/newer versions of:\n' + liked.map((item) => '- ' + item).join('\n') : '',
    blocked.length ? 'Vibes to avoid:\n' + blocked.map((item) => '- ' + item).join('\n') : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return []
  return tags
    .slice(0, 4)
    .map((tag) =>
      String(tag || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, ''),
    )
    .filter(Boolean)
}

function shapeIdea(idea, i, cli, source) {
  const shaped = {
    id: `${source.toLowerCase()}-${i}-${Date.now()}`,
    title: String(idea.title || 'Untitled').slice(0, 90),
    pitch: String(idea.pitch || '').slice(0, 220),
    moonshot: String(idea.moonshot || '').slice(0, 240),
    firstTinyBuild: String(idea.firstTinyBuild || '').slice(0, 240),
    viralHook: String(idea.viralHook || '').slice(0, 220),
    killMetric: String(idea.killMetric || '').slice(0, 180),
    whyNow: String(idea.whyNow || '').slice(0, 220),
    tags: normalizeTags(idea.tags),
    complexity: Math.min(3, Math.max(1, Number(idea.complexity) || 2)),
    buildMinutes: Math.min(360, Math.max(30, Number(idea.buildMinutes) || 90)),
    stack: String(idea.stack || '').slice(0, 90),
    cli,
    source,
  }
  shaped.signature = signatureFor(shaped)
  shaped.firstPrompt = buildFirstPrompt(shaped, cli)
  return shaped
}

function rememberShown(ideas, targetCli) {
  for (const idea of ideas) {
    writeHistory({
      event: 'shown',
      targetCli,
      signature: idea.signature || signatureFor(idea),
      idea: {
        title: idea.title,
        pitch: idea.pitch,
        moonshot: idea.moonshot,
        firstTinyBuild: idea.firstTinyBuild,
        viralHook: idea.viralHook,
        killMetric: idea.killMetric,
        whyNow: idea.whyNow,
        tags: idea.tags || [],
      },
      source: idea.source,
    })
  }
}

function selectFreshIdeas(rawIdeas, cli, source, history) {
  const picked = []
  rawIdeas.forEach((idea, i) => {
    const shaped = shapeIdea(idea, i, cli, source)
    if (picked.length < FRESH_COUNT && !tooSimilar(shaped, history, picked)) picked.push(shaped)
  })
  if (picked.length < FRESH_COUNT) {
    BANK.forEach((idea, i) => {
      const shaped = shapeIdea(idea, i, cli, 'bank')
      if (picked.length < FRESH_COUNT && !tooSimilar(shaped, history, picked)) picked.push(shaped)
    })
  }
  if (picked.length < FRESH_COUNT) {
    const shuffledBank = [...BANK].sort(() => Math.random() - 0.5)
    shuffledBank.forEach((idea, i) => {
      if (picked.length < FRESH_COUNT) picked.push(shapeIdea(idea, i, cli, 'bank'))
    })
  }
  rememberShown(picked, cli)
  return picked
}

function fallbackIdeas(targetCli) {
  return selectFreshIdeas(
    [...BANK].sort(() => Math.random() - 0.5),
    targetCli,
    'bank',
    readHistory(),
  )
}

function buildFirstPrompt(idea, cli) {
  return [
    `Build a small, polished first version of this moonshot app: "${idea.title}".`,
    ``,
    `Concept: ${idea.pitch}`,
    idea.moonshot ? `Moonshot north star: ${idea.moonshot}` : '',
    idea.firstTinyBuild ? `Tiny first build: ${idea.firstTinyBuild}` : '',
    idea.viralHook ? `Share hook: ${idea.viralHook}` : '',
    idea.killMetric ? `Kill metric: ${idea.killMetric}` : '',
    idea.whyNow ? `Why now: ${idea.whyNow}` : '',
    idea.tags && idea.tags.length ? `Tags: ${idea.tags.join(', ')}` : '',
    `Suggested stack: ${idea.stack}`,
    ``,
    `Start by scaffolding the project in this folder, then implement the smallest`,
    `local MVP that proves the core mechanic. Keep the scope tight, but make the`,
    `first interaction feel like the beginning of something much bigger. Include`,
    `the kill metric in the README or first screen so the experiment can be judged fast.`,
    ``,
    `Use ${cli} for the build.`,
  ]
    .filter(Boolean)
    .join('\n')
}

async function refresh(creds) {
  const oauth = creds.data.claudeAiOauth
  if (!oauth.refreshToken) return null
  const resp = await fetchWithTimeout(REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: oauth.refreshToken,
      client_id: CLIENT_ID,
      scope: SCOPES,
    }),
  }, 15000)
  if (!resp.ok) return null
  const body = await resp.json()
  if (!body.access_token) return null
  oauth.accessToken = body.access_token
  if (body.refresh_token) oauth.refreshToken = body.refresh_token
  if (typeof body.expires_in === 'number') oauth.expiresAt = Date.now() + body.expires_in * 1000
  persistClaudeCredentials(creds)
  return oauth.accessToken
}

function extractJson(text) {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

// targetProvider = { name, cli } — the most-underused subscription, so the
// build gets routed to whatever you are burning money on.
async function generateIdeas(targetProvider) {
  const cli = (targetProvider && targetProvider.cli) || 'claude'
  const history = readHistory()
  const creds = readClaudeCredentials()
  if (!creds) return fallbackIdeas(cli)
  const seed = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  const recentContext = promptHistory(history)

  const prompt = [
    'You are the moonshot idea engine for MaxxToken, an app that nudges builders',
    'to spend the AI subscriptions they already pay for by building something real.',
    `Randomness seed: ${seed}`,
    '',
    BUILDER_CONTEXT,
    '',
    recentContext,
    '',
    `Propose ${CANDIDATE_COUNT} intense, weird, useful app ideas worth building right now.`,
    'Taste: future-proof software, agentic workflows, tiny tools that can compound,',
    'AI-native interfaces, private/local-first where useful, creator-builder tools,',
    'small single-problem apps that could grow into a serious portfolio product.',
    '',
    'Each idea must have a borderline-crazy moonshot north star AND a tiny first',
    'build that can ship in a few hours. No generic CRUD, no wrappers, no toy-only',
    'roast apps, no startup buzzword soup. Make each idea feel like a strange',
    'artifact from 2030 that can start as one sharp MVP today.',
    '',
    'Return ONLY a JSON array, no prose. Each item:',
    '{"title": str, "pitch": str (1 sentence), "moonshot": str (1 sentence),',
    '"firstTinyBuild": str (1 sentence), "viralHook": str (1 sentence),',
    '"killMetric": str (1 sentence), "whyNow": str (1 sentence),',
    '"tags": [1-4 short lowercase strings], "complexity": 1|2|3,',
    '"buildMinutes": int, "stack": str (short)}',
  ].join('\n')

  try {
    let token = creds.data.claudeAiOauth.accessToken
    const exp = creds.data.claudeAiOauth.expiresAt
    if (exp && exp - Date.now() < 5 * 60 * 1000) {
      const t = await refresh(creds)
      if (t) token = t
    }

    const call = (tok) =>
      fetchWithTimeout(MESSAGES_URL, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + tok,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'oauth-2025-04-20',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 5000,
          temperature: 1,
          messages: [{ role: 'user', content: prompt }],
        }),
      }, 25000)

    let resp = await call(token)
    if (resp.status === 401) {
      const t = await refresh(creds)
      if (t) resp = await call(t)
    }
    if (!resp.ok) return fallbackIdeas(cli)

    const data = await resp.json()
    const text = (data.content || []).map((b) => b.text || '').join('')
    const parsed = extractJson(text)
    if (!parsed || !parsed.length) return fallbackIdeas(cli)

    return selectFreshIdeas(parsed, cli, 'Claude', history)
  } catch {
    return fallbackIdeas(cli)
  }
}

function recordIdeaFeedback(idea, feedback) {
  if (!idea || !feedback) return
  writeHistory({
    event: 'feedback',
    feedback,
    targetCli: idea.cli,
    signature: idea.signature || signatureFor(idea),
    idea: {
      title: idea.title,
      pitch: idea.pitch,
      moonshot: idea.moonshot,
      firstTinyBuild: idea.firstTinyBuild,
      viralHook: idea.viralHook,
      killMetric: idea.killMetric,
      whyNow: idea.whyNow,
      tags: idea.tags || [],
    },
    source: idea.source,
  })
}

module.exports = { generateIdeas, recordIdeaFeedback }
