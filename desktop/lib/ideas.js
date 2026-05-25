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
const CANDIDATE_COUNT = 26
const BURN_COUNT = 3

// Rotating angle prompts — a few are sampled per batch so each generation
// explores different territory instead of the model converging on its favorites.
const LENSES = [
  'local-first desktop utilities',
  'creator and audience tools',
  'agentic background workers',
  'data-into-art generators',
  'memory and personal-archive tools',
  'developer-portfolio infrastructure',
  'real-time multiplayer micro-apps',
  'voice-first or audio interfaces',
  'health, focus, and habit instruments',
  'money, pricing, and indie-business tools',
  'research and knowledge-synthesis apps',
  'physical-world / hardware-adjacent bridges',
  'games that are secretly productivity tools',
  'content repurposing engines',
  'taste, curation, and recommendation systems',
  'automation that breeds more automation',
]

function pickLenses(count = 3) {
  return [...LENSES].sort(() => Math.random() - 0.5).slice(0, count)
}

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
  {
    title: 'Changelog Séance',
    pitch: 'Point it at a repo and it narrates the project history as a dramatic story you can replay.',
    moonshot: 'Every codebase carries a readable memoir of every decision that shaped it.',
    firstTinyBuild: 'Parse git log, group by era, render a scrollable narrated timeline.',
    viralHook: 'People post their repo "origin story" reel.',
    killMetric: 'One team uses it to onboard a new contributor.',
    whyNow: 'AI-built repos move fast and lose their why; narrated history rebuilds context.',
    tags: ['git', 'storytelling', 'onboarding'],
    complexity: 2,
    buildMinutes: 120,
    stack: 'Node git parser + model call + Vite',
  },
  {
    title: 'Ambient Status Orb',
    pitch: 'A tiny always-on desktop orb that glows with the one number that matters today.',
    moonshot: 'A calm hardware-free dashboard that replaces ten browser tabs.',
    firstTinyBuild: 'Transparent always-on-top window, one metric source, color states.',
    viralHook: 'Desk-setup photos with the orb glowing.',
    killMetric: 'Someone keeps it running a full week.',
    whyNow: 'Builders drown in dashboards; one ambient signal beats constant checking.',
    tags: ['ambient', 'desktop', 'local-first'],
    complexity: 2,
    buildMinutes: 130,
    stack: 'Electron transparent window + JSON source',
  },
  {
    title: 'Prompt Fossil Record',
    pitch: 'It quietly archives every prompt you send and surfaces the ones that actually worked.',
    moonshot: 'A personal search engine for your own best thinking.',
    firstTinyBuild: 'Local capture, tag by outcome, fuzzy search across past prompts.',
    viralHook: 'Share your "top 5 prompts of all time" card.',
    killMetric: 'You reuse a recovered prompt twice in a week.',
    whyNow: 'Prompts are real IP now and everyone throws them away.',
    tags: ['memory', 'prompts', 'search'],
    complexity: 2,
    buildMinutes: 120,
    stack: 'Local SQLite + Vite client',
  },
  {
    title: 'Shipping Streak Engine',
    pitch: 'A menu bar tracker that only counts a day if something real left your machine.',
    moonshot: 'A discipline layer that turns shipping into an unbreakable habit.',
    firstTinyBuild: 'Detect commits/deploys/posts, render a streak with honest rules.',
    viralHook: 'Streak screenshots on launch day.',
    killMetric: 'A 7-day streak survives one full week.',
    whyNow: 'AI removed the excuse not to ship; the missing piece is honest momentum.',
    tags: ['habit', 'menu-bar', 'shipping'],
    complexity: 2,
    buildMinutes: 110,
    stack: 'Electron + git/webhook polling',
  },
  {
    title: 'Voice Note Compiler',
    pitch: 'Talk a messy idea out loud and it compiles a spec, task list, and first prompt.',
    moonshot: 'Speech becomes the fastest path from thought to running software.',
    firstTinyBuild: 'Record, transcribe, model-structure into spec + tasks + prompt.',
    viralHook: 'Raw rant beside the clean compiled spec.',
    killMetric: 'One voice note becomes a started build.',
    whyNow: 'Voice is faster than typing and models can finally structure it well.',
    tags: ['voice', 'planning', 'creator-tools'],
    complexity: 2,
    buildMinutes: 130,
    stack: 'Web Speech API + model call + Vite',
  },
  {
    title: 'Dependency Weather',
    pitch: 'A forecast for your project — which dependencies will break, age out, or bite you next.',
    moonshot: 'Maintenance becomes predictable instead of a surprise tax.',
    firstTinyBuild: 'Read lockfile, score each dep by risk, render a weather-style report.',
    viralHook: 'Post your project’s "storm warning" card.',
    killMetric: 'It flags one real upgrade before it breaks.',
    whyNow: 'Fast AI builds accumulate dependency debt nobody is watching.',
    tags: ['maintenance', 'dependencies', 'developer-tools'],
    complexity: 2,
    buildMinutes: 140,
    stack: 'Lockfile parser + registry API + Vite',
  },
  {
    title: 'Idea Compost Bin',
    pitch: 'Drop dead ideas in; it periodically recombines them into unexpected new ones.',
    moonshot: 'No idea is ever wasted — they decompose into the next thing.',
    firstTinyBuild: 'Idea inbox, scheduled model recombination, surface 3 hybrids a week.',
    viralHook: 'Share the weirdest hybrid the compost produced.',
    killMetric: 'One composted hybrid gets actually built.',
    whyNow: 'Builders generate ideas faster than they can use them.',
    tags: ['ideation', 'creativity', 'local-first'],
    complexity: 2,
    buildMinutes: 110,
    stack: 'Local store + scheduled model call',
  },
  {
    title: 'Screenshot Diff Detective',
    pitch: 'Feed it two screenshots of your app and it tells you exactly what changed and whether it is better.',
    moonshot: 'Visual regressions get caught the moment they happen, by taste not pixels.',
    firstTinyBuild: 'Two-image upload, model vision diff, ranked list of changes.',
    viralHook: 'Before/after with the detective’s verdict overlaid.',
    killMetric: 'It catches one real visual regression.',
    whyNow: 'AI ships UI changes fast; nobody is reviewing how they look.',
    tags: ['vision', 'qa', 'design'],
    complexity: 2,
    buildMinutes: 120,
    stack: 'Vite + image upload + model vision',
  },
  {
    title: 'Launch Day Director',
    pitch: 'A countdown cockpit that runs your launch — assets, posts, checks — like a film shoot.',
    moonshot: 'Every solo launch runs like a coordinated production.',
    firstTinyBuild: 'Timeline of launch beats with checklists and copy slots.',
    viralHook: 'Time-lapse of the cockpit on launch day.',
    killMetric: 'One launch runs start to finish through it.',
    whyNow: 'Building is fast now; launching well is the real bottleneck.',
    tags: ['launch', 'planning', 'creator-tools'],
    complexity: 3,
    buildMinutes: 160,
    stack: 'Vite + local timeline state',
  },
  {
    title: 'Focus Tax Meter',
    pitch: 'It watches your app-switching and shows the real-time cost of every context switch.',
    moonshot: 'Attention becomes a visible currency you spend on purpose.',
    firstTinyBuild: 'Track foreground app changes, render a live focus-cost gauge.',
    viralHook: 'People post their brutal daily focus-tax number.',
    killMetric: 'Someone cuts switching after seeing the meter.',
    whyNow: 'Agentic work scatters attention across more surfaces than ever.',
    tags: ['focus', 'menu-bar', 'health'],
    complexity: 2,
    buildMinutes: 130,
    stack: 'Electron + active-window polling',
  },
  {
    title: 'Stack Postcard Maker',
    pitch: 'It turns your real toolstack and spend into a shareable retro travel postcard.',
    moonshot: 'Every builder’s setup becomes a piece of collectible identity.',
    firstTinyBuild: 'Pick tools, auto-design a postcard, export an image.',
    viralHook: 'Postcards posted as "wish you were building here".',
    killMetric: '20 postcards get generated and shared.',
    whyNow: 'Toolstacks are identity now; people love showing them off.',
    tags: ['creator-tools', 'design', 'share'],
    complexity: 1,
    buildMinutes: 90,
    stack: 'Canvas render + Vite',
  },
  {
    title: 'Cold Start Concierge',
    pitch: 'It writes the first real interaction for any app you build so it never feels empty.',
    moonshot: 'No app ever launches with a dead, blank first screen again.',
    firstTinyBuild: 'Describe the app, get empty-state copy, sample data, and a first task.',
    viralHook: 'Blank screen vs concierge-filled screen side by side.',
    killMetric: 'One app ships with a concierge-built first run.',
    whyNow: 'AI builds the features; the first-run experience is still an afterthought.',
    tags: ['onboarding', 'product', 'creator-tools'],
    complexity: 2,
    buildMinutes: 100,
    stack: 'Vite + model call',
  },
  {
    title: 'Repo Time Capsule',
    pitch: 'It seals a snapshot of your project plus a note to your future self, opened on a set date.',
    moonshot: 'Every project becomes a conversation across time with the person who built it.',
    firstTinyBuild: 'Capture repo state + a letter, lock until a chosen date.',
    viralHook: 'People share capsules opening months later.',
    killMetric: 'One capsule gets opened and read.',
    whyNow: 'Fast builds blur together; deliberate checkpoints restore meaning.',
    tags: ['memory', 'git', 'local-first'],
    complexity: 2,
    buildMinutes: 120,
    stack: 'Local store + scheduled unlock',
  },
  {
    title: 'Pricing Wind Tunnel',
    pitch: 'Test a price against simulated buyer personas before you ever charge a real customer.',
    moonshot: 'Pricing stops being a guess and becomes a thing you can rehearse.',
    firstTinyBuild: 'Enter offer + price, model-simulate 5 personas, get objections and a verdict.',
    viralHook: 'Share the persona that roasted your pricing hardest.',
    killMetric: 'One price gets changed before launch.',
    whyNow: 'Indie builders ship fast but still price by vibes.',
    tags: ['pricing', 'indie-business', 'experiments'],
    complexity: 2,
    buildMinutes: 120,
    stack: 'Vite + model call',
  },
  {
    title: 'Keystroke Garden',
    pitch: 'Your typing and shipping activity grows a living generative garden on your desktop.',
    moonshot: 'Productive work literally cultivates something beautiful you tend over months.',
    firstTinyBuild: 'Activity feed drives a procedural plant that grows and wilts.',
    viralHook: 'People post their flourishing or dying gardens.',
    killMetric: 'Someone keeps the garden alive for two weeks.',
    whyNow: 'Work feels abstract; ambient generative feedback makes it tangible.',
    tags: ['generative-art', 'ambient', 'desktop'],
    complexity: 3,
    buildMinutes: 170,
    stack: 'Electron + canvas/WebGL',
  },
  {
    title: 'Meeting Exhaust Filter',
    pitch: 'Paste any meeting transcript and it extracts only the decisions and the owners.',
    moonshot: 'Meetings produce a clean machine-readable trail instead of vague memory.',
    firstTinyBuild: 'Transcript in, decisions + owners + deadlines out as a tidy card.',
    viralHook: 'A 60-minute transcript reduced to 4 lines.',
    killMetric: 'One extracted decision actually gets tracked.',
    whyNow: 'Transcripts are everywhere; the signal is still buried.',
    tags: ['productivity', 'meetings', 'tools'],
    complexity: 1,
    buildMinutes: 90,
    stack: 'Single-page app + model call',
  },
  {
    title: 'Side Quest Generator',
    pitch: 'When you are stuck, it hands you a 20-minute side build that recharges momentum.',
    moonshot: 'Creative blocks become a feature — a deck of tiny wins always ready.',
    firstTinyBuild: 'One button that deals a scoped, finishable micro-project card.',
    viralHook: 'People post the side quest that unstuck them.',
    killMetric: 'Three side quests get finished in a week.',
    whyNow: 'AI makes tiny builds cheap; the scarce thing is knowing what tiny thing to do.',
    tags: ['ideation', 'momentum', 'creator-tools'],
    complexity: 1,
    buildMinutes: 80,
    stack: 'Single-page app + model call',
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
  // Every idea ever shown — titles are cheap, and the model must not repeat any.
  const shownTitles = [
    ...new Set(
      history
        .filter((event) => event.event === 'shown')
        .map((event) => (event.idea || event).title)
        .filter(Boolean),
    ),
  ].slice(-160)
  const { liked, blocked } = feedbackSummary(history)
  return [
    shownTitles.length
      ? 'ALREADY USED — never repeat or re-skin any of these, and avoid the same core mechanic:\n' +
        shownTitles.map((item) => '- ' + item).join('\n')
      : '',
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
    signal: String(idea.signal || idea.trend || '').slice(0, 160),
    rankReason: String(idea.rankReason || '').slice(0, 220),
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

// Shape raw ideas and keep only the ones not seen / not near-duplicates.
// Mutates and returns `picked`; never pads.
function pickFresh(rawIdeas, cli, source, history, picked) {
  rawIdeas.forEach((idea, i) => {
    if (picked.length >= FRESH_COUNT) return
    const shaped = shapeIdea(idea, i, cli, source)
    if (!tooSimilar(shaped, history, picked)) picked.push(shaped)
  })
  return picked
}

// BANK ordered least-recently-shown first, so offline fallbacks rotate
// instead of serving the same ideas every time.
function bankByRecency(history) {
  const lastSeen = new Map()
  history
    .filter((event) => event.event === 'shown')
    .forEach((event, index) => {
      const title = (event.idea || event).title
      if (title) lastSeen.set(title.toLowerCase(), index)
    })
  return [...BANK].sort((a, b) => {
    const ai = lastSeen.has(a.title.toLowerCase()) ? lastSeen.get(a.title.toLowerCase()) : -1
    const bi = lastSeen.has(b.title.toLowerCase()) ? lastSeen.get(b.title.toLowerCase()) : -1
    return ai - bi
  })
}

// Top up to FRESH_COUNT from the BANK — dedup-respecting first, then
// least-recently-shown as a last resort (never an exact dup of the picks).
function padFromBank(picked, cli, history) {
  if (picked.length >= FRESH_COUNT) return picked
  const ranked = bankByRecency(history)
  ranked.forEach((idea, i) => {
    if (picked.length >= FRESH_COUNT) return
    const shaped = shapeIdea(idea, i, cli, 'bank')
    if (!tooSimilar(shaped, history, picked)) picked.push(shaped)
  })
  ranked.forEach((idea, i) => {
    if (picked.length >= FRESH_COUNT) return
    const shaped = shapeIdea(idea, i, cli, 'bank')
    if (!picked.some((p) => p.signature === shaped.signature)) picked.push(shaped)
  })
  return picked
}

function finalize(picked, cli) {
  rememberShown(picked, cli)
  return picked
}

function fallbackIdeas(targetCli) {
  return finalize(padFromBank([], targetCli, readHistory()), targetCli)
}

function buildFirstPrompt(idea, cli) {
  return [
    `GOAL: build a small, polished first version of "${idea.title}" in {{PROJECT_DIR}}`,
    ``,
    `DONE WHEN:`,
    `- The first useful interaction for "${idea.title}" works locally`,
    `- The app includes the concept, kill metric, and a clear first action`,
    `- VERIFY exits 0`,
    ``,
    `SCOPE:`,
    `- edit: {{PROJECT_DIR}}/**`,
    `- do not touch: {{PROJECT_DIR}}/.git/**, {{PROJECT_DIR}}/node_modules/**, {{PROJECT_DIR}}/dist/**, {{PROJECT_DIR}}/build/**, files outside {{PROJECT_DIR}}`,
    ``,
    `CONSTRAINTS:`,
    `- Ship the smallest local MVP that proves the core mechanic`,
    `- Use existing project conventions when working inside an existing repo`,
    `- No broad rewrites, no unnecessary dependencies`,
    ``,
    `VERIFY: {{VERIFY}}`,
    ``,
    `ON FAILURE: after 4 iterations without progress, dump the blocker, last failing command, changed files, and next recommended action to {{PROJECT_DIR}}/goal-forge-report.html, then stop.`,
    ``,
    `CONTEXT:`,
    `Concept: ${idea.pitch}`,
    idea.moonshot ? `Moonshot north star: ${idea.moonshot}` : '',
    idea.firstTinyBuild ? `Tiny first build: ${idea.firstTinyBuild}` : '',
    idea.viralHook ? `Share hook: ${idea.viralHook}` : '',
    idea.killMetric ? `Kill metric: ${idea.killMetric}` : '',
    idea.whyNow ? `Why now: ${idea.whyNow}` : '',
    idea.signal ? `Internet signal: ${idea.signal}` : '',
    idea.rankReason ? `Why this was ranked: ${idea.rankReason}` : '',
    idea.tags && idea.tags.length ? `Tags: ${idea.tags.join(', ')}` : '',
    `Suggested stack: ${idea.stack}`,
    `Use ${cli} for the build.`,
    ``,
    `NON-GOALS:`,
    `- Do not turn this into a generic CRUD wrapper`,
    `- Do not expand beyond the tiny first build until DONE WHEN passes`,
  ]
    .filter(Boolean)
    .join('\n')
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function stripTags(value) {
  return decodeEntities(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function xmlItems(xml, limit = 10) {
  const out = []
  const itemRe = /<item\b[\s\S]*?<\/item>/gi
  let match
  while ((match = itemRe.exec(xml)) && out.length < limit) {
    const item = match[0]
    const title = item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const traffic = item.match(/<ht:approx_traffic[^>]*>([\s\S]*?)<\/ht:approx_traffic>/i)
    const news = [...item.matchAll(/<ht:news_item_title[^>]*>([\s\S]*?)<\/ht:news_item_title>/gi)]
      .slice(0, 2)
      .map((m) => stripTags(m[1]))
      .filter(Boolean)
    if (title) {
      out.push({
        source: 'Google Trends',
        title: stripTags(title[1]),
        detail: traffic ? stripTags(traffic[1]) : news.join(' · '),
      })
    }
  }
  return out
}

async function googleTrendSignals() {
  const resp = await fetchWithTimeout('https://trends.google.com/trending/rss?geo=US', {}, 9000)
  if (!resp.ok) return []
  return xmlItems(await resp.text(), 12)
}

async function hackerNewsSignals() {
  const top = await fetchWithTimeout('https://hacker-news.firebaseio.com/v0/topstories.json', {}, 7000)
  if (!top.ok) return []
  const ids = (await top.json()).slice(0, 8)
  const items = await Promise.all(
    ids.map(async (id) => {
      try {
        const resp = await fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {}, 5000)
        if (!resp.ok) return null
        const item = await resp.json()
        return item && item.title ? { source: 'Hacker News', title: item.title, detail: `${item.score || 0} points` } : null
      } catch {
        return null
      }
    }),
  )
  return items.filter(Boolean)
}

async function githubSignals() {
  const resp = await fetchWithTimeout('https://github.com/trending?since=daily', {
    headers: { 'User-Agent': 'MaxxToken' },
  }, 9000)
  if (!resp.ok) return []
  const html = await resp.text()
  return [...html.matchAll(/<h2[^>]*>\s*<a[^>]*href="\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .slice(0, 8)
    .map((m) => ({ source: 'GitHub Trending', title: stripTags(m[2]).replace(/\s*\/\s*/g, '/'), detail: m[1] }))
    .filter((item) => item.title)
}

async function collectSignals() {
  const settled = await Promise.allSettled([googleTrendSignals(), hackerNewsSignals(), githubSignals()])
  const signals = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
  return signals.slice(0, 24)
}

function signalPrompt(signals) {
  if (!signals.length) return 'Live signal fetch failed; infer from evergreen builder-market demand.'
  return signals
    .slice(0, 18)
    .map((s, i) => `${i + 1}. [${s.source}] ${s.title}${s.detail ? ` — ${s.detail}` : ''}`)
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

function buildIdeaPrompt(recentContext, lenses, extraAvoid) {
  const seed = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  return [
    'You are the moonshot idea engine for MaxxToken, an app that nudges builders',
    'to spend the AI subscriptions they already pay for by building something real.',
    `Randomness seed: ${seed}`,
    '',
    BUILDER_CONTEXT,
    '',
    recentContext,
    extraAvoid && extraAvoid.length
      ? '\nThese were just rejected for being too close to past ideas — go further:\n' +
        extraAvoid.map((t) => '- ' + t).join('\n')
      : '',
    '',
    `Propose ${CANDIDATE_COUNT} intense, weird, useful app ideas worth building right now.`,
    `Bias this batch toward these angles (mix them, do not label them): ${lenses.join('; ')}.`,
    'Taste: future-proof software, agentic workflows, tiny tools that can compound,',
    'AI-native interfaces, private/local-first where useful, creator-builder tools,',
    'small single-problem apps that could grow into a serious portfolio product.',
    '',
    'Every idea must be genuinely NEW — different domain, different core mechanic,',
    'different from each other and from everything in ALREADY USED above. No generic',
    'CRUD, no wrappers, no toy-only roast apps, no startup buzzword soup. Each idea',
    'needs a borderline-crazy moonshot north star AND a tiny first build that ships',
    'in a few hours — a strange artifact from 2030 that starts as one sharp MVP today.',
    '',
    'Return ONLY a JSON array, no prose. Each item:',
    '{"title": str, "pitch": str (1 sentence), "moonshot": str (1 sentence),',
    '"firstTinyBuild": str (1 sentence), "viralHook": str (1 sentence),',
    '"killMetric": str (1 sentence), "whyNow": str (1 sentence),',
    '"tags": [1-4 short lowercase strings], "complexity": 1|2|3,',
    '"buildMinutes": int, "stack": str (short)}',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildBurnPrompt(recentContext, signals, targetProvider) {
  const seed = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  return [
    'You are the Burn Challenge engine for MaxxToken.',
    'Your job: turn live internet demand signals into three high-value startup-style app ideas',
    'that a builder can start immediately to burn unused AI subscription quota.',
    `Randomness seed: ${seed}`,
    '',
    BUILDER_CONTEXT,
    '',
    `Route these ideas to: ${targetProvider?.name || 'the most unused model'} (${targetProvider?.cli || 'claude'}).`,
    '',
    'LIVE SIGNALS:',
    signalPrompt(signals),
    '',
    recentContext,
    '',
    `Return exactly ${BURN_COUNT} ideas ranked from highest expected value to lowest.`,
    'The #1 idea must be the strongest synthesis of search trend heat, builder demand,',
    'shareability, and tiny-MVP feasibility. The other two should be meaningfully different.',
    '',
    'No generic AI wrapper. No todo apps. No dashboards unless the signal makes them urgent.',
    'Each idea should feel like a sharp startup seed, but the first build must be doable today.',
    '',
    'Return ONLY a JSON array, no prose. Each item:',
    '{"title": str, "pitch": str (1 sentence), "moonshot": str (1 sentence),',
    '"firstTinyBuild": str (1 sentence), "viralHook": str (1 sentence),',
    '"killMetric": str (1 sentence), "whyNow": str (1 sentence),',
    '"signal": str (the live signal used), "rankReason": str (why it ranked here),',
    '"tags": [1-4 short lowercase strings], "complexity": 1|2|3,',
    '"buildMinutes": int, "stack": str (short)}',
  ]
    .filter(Boolean)
    .join('\n')
}

// targetProvider = { name, cli } — the most-underused subscription, so the
// build gets routed to whatever you are burning money on.
async function generateIdeas(targetProvider) {
  const cli = (targetProvider && targetProvider.cli) || 'claude'
  const history = readHistory()
  const creds = readClaudeCredentials()
  if (!creds) return fallbackIdeas(cli)
  const recentContext = promptHistory(history)

  try {
    let token = creds.data.claudeAiOauth.accessToken
    const exp = creds.data.claudeAiOauth.expiresAt
    if (exp && exp - Date.now() < 5 * 60 * 1000) {
      const t = await refresh(creds)
      if (t) token = t
    }

    const call = (tok, prompt) =>
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
          max_tokens: 6000,
          temperature: 1,
          messages: [{ role: 'user', content: prompt }],
        }),
      }, 28000)

    const fetchBatch = async (prompt) => {
      let resp = await call(token, prompt)
      if (resp.status === 401) {
        const t = await refresh(creds)
        if (t) {
          token = t
          resp = await call(token, prompt)
        }
      }
      if (!resp.ok) return null
      const data = await resp.json()
      const text = (data.content || []).map((b) => b.text || '').join('')
      return extractJson(text)
    }

    // First pass.
    const picked = []
    const first = await fetchBatch(buildIdeaPrompt(recentContext, pickLenses(3), []))
    if (first && first.length) pickFresh(first, cli, 'Claude', history, picked)

    // Retry once with a harder avoid-list if dedup left us short.
    if (picked.length < FRESH_COUNT) {
      const rejected = (first || [])
        .map((idea) => idea && idea.title)
        .filter(Boolean)
        .slice(0, 16)
      const second = await fetchBatch(buildIdeaPrompt(recentContext, pickLenses(4), rejected))
      if (second && second.length) pickFresh(second, cli, 'Claude', history, picked)
    }

    if (!picked.length) return fallbackIdeas(cli)
    return finalize(padFromBank(picked, cli, history), cli)
  } catch {
    return fallbackIdeas(cli)
  }
}

async function generateBurnIdeas(targetProvider) {
  const cli = (targetProvider && targetProvider.cli) || 'claude'
  const history = readHistory()
  const signals = await collectSignals().catch(() => [])
  const creds = readClaudeCredentials()
  const fallback = () => finalize(padFromBank([], cli, history).slice(0, BURN_COUNT), cli)
  if (!creds) return { signals, ideas: fallback() }
  const recentContext = promptHistory(history)

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
          max_tokens: 4200,
          temperature: 0.9,
          messages: [{ role: 'user', content: buildBurnPrompt(recentContext, signals, targetProvider) }],
        }),
      }, 30000)

    let resp = await call(token)
    if (resp.status === 401) {
      const t = await refresh(creds)
      if (t) {
        token = t
        resp = await call(token)
      }
    }
    if (!resp.ok) return { signals, ideas: fallback() }
    const data = await resp.json()
    const text = (data.content || []).map((b) => b.text || '').join('')
    const raw = extractJson(text)
    const picked = []
    if (raw && raw.length) pickFresh(raw, cli, 'Signals', history, picked)
    const ideas = finalize(padFromBank(picked, cli, history).slice(0, BURN_COUNT), cli)
    return { signals, ideas }
  } catch {
    return { signals, ideas: fallback() }
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

module.exports = { generateIdeas, generateBurnIdeas, recordIdeaFeedback }
