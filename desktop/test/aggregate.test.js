const assert = require('node:assert/strict')
const test = require('node:test')

const { _private } = require('../lib/aggregate')
const codex = require('../lib/adapters/codex')
const claude = require('../lib/adapters/claude')
const openai = require('../lib/adapters/openai-api')
const azureopenai = require('../lib/adapters/azure-openai')
const mistral = require('../lib/adapters/mistral')
const cursor = require('../lib/adapters/cursor')
const copilot = require('../lib/adapters/copilot')
const copilotAuth = require('../lib/copilot-auth')
const windsurf = require('../lib/adapters/windsurf')
const kiro = require('../lib/adapters/kiro')
const opencode = require('../lib/adapters/opencode')
const opencodego = require('../lib/adapters/opencode-go')
const alibaba = require('../lib/adapters/alibaba')
const alibabaTokenPlan = require('../lib/adapters/alibaba-token-plan')
const augment = require('../lib/adapters/augment')
const jetbrains = require('../lib/adapters/jetbrains')
const warp = require('../lib/adapters/warp')
const elevenlabs = require('../lib/adapters/elevenlabs')
const kilo = require('../lib/adapters/kilo')
const perplexity = require('../lib/adapters/perplexity')
const codebuff = require('../lib/adapters/codebuff')
const commandcode = require('../lib/adapters/commandcode')
const crof = require('../lib/adapters/crof')
const venice = require('../lib/adapters/venice')
const moonshot = require('../lib/adapters/moonshot')
const kimik2 = require('../lib/adapters/kimi-k2')
const doubao = require('../lib/adapters/doubao')
const groq = require('../lib/adapters/groq')
const grok = require('../lib/adapters/grok')
const deepgram = require('../lib/adapters/deepgram')
const stepfun = require('../lib/adapters/stepfun')
const llmproxy = require('../lib/adapters/llmproxy')
const ollama = require('../lib/adapters/ollama')
const abacus = require('../lib/adapters/abacus')
const amp = require('../lib/adapters/amp')
const factory = require('../lib/adapters/factory')
const antigravity = require('../lib/adapters/antigravity')
const minimax = require('../lib/adapters/minimax')
const manus = require('../lib/adapters/manus')
const vertexai = require('../lib/adapters/vertexai')
const synthetic = require('../lib/adapters/synthetic')
const mimo = require('../lib/adapters/mimo')
const bedrock = require('../lib/adapters/bedrock')
const zai = require('../lib/adapters/zai')
const t3chat = require('../lib/adapters/t3chat')
const usageHistory = require('../lib/usage-history')
const storageFootprint = require('../lib/storage-footprint')
const providerStatus = require('../lib/provider-status')
const providerLinks = require('../lib/provider-links')
const providerIds = require('../lib/provider-ids')
const secrets = require('../lib/secrets')
const config = require('../lib/config')
const maxxAlerts = require('../lib/maxx-alerts')
const widgetSnapshot = require('../lib/widget-snapshot')
const trayTitle = require('../lib/tray-title')
const providerConfigCli = require('../lib/provider-config-cli')
const usageSnapshotCli = require('../lib/usage-snapshot-cli')
const providerDetection = require('../lib/provider-detection')
const tokenCost = require('../lib/token-cost')
const quotaNotifications = require('../lib/quota-notifications')
const launch = require('../lib/launch')
const logCli = require('../lib/log-cli')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')

function loadBurnAdaptForTest() {
  const source = fs.readFileSync(path.join(__dirname, '../burn/burn-adapt.js'), 'utf8')
  const context = { Date }
  vm.createContext(context)
  vm.runInContext(source, context)
  return context
}

test('monthly quota value exposes one canonical spent/left pair', () => {
  const value = _private.valueFromMonthly({ monthly: 200 }, 12, {
    label: 'live quota',
    accuracy: 'live',
  })

  assert.equal(value.totalValue, 200)
  assert.equal(value.spentValue, 24)
  assert.equal(value.leftValue, 176)
  assert.equal(value.capturedValue, value.spentValue)
  assert.equal(value.burnValue, value.leftValue)
  assert.equal(value.capturedPct, 12)
  assert.equal(value.remainingPct, 88)
})

test('provider links mirror CodexBar dashboard and status targets', () => {
  assert.equal(providerLinks.linksForProvider('codex').dashboard, 'https://chatgpt.com/codex/settings/usage')
  assert.equal(providerLinks.linksForProvider('claude').dashboard, 'https://claude.ai/settings/usage')
  assert.equal(providerLinks.linksForProvider('claude').status, 'https://status.claude.com/')
  assert.equal(providerLinks.linksForProvider('cursor').dashboard, 'https://cursor.com/dashboard?tab=usage')
  assert.equal(providerLinks.linksForProvider('bedrock').status, 'https://health.aws.amazon.com/health/status')
  assert.equal(providerLinks.linksForProvider('t3chat').dashboard, 'https://t3.chat/settings/customization')
  assert.equal(providerLinks.linksForProvider('azure-openai').dashboard, 'https://ai.azure.com')
  assert.equal(
    providerLinks.linksForProvider('alibaba-token-plan').dashboard,
    'https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/token-plan',
  )
  assert.equal(providerLinks.linksForProvider('groqcloud').dashboard, 'https://console.groq.com/dashboard/metrics')
  assert.deepEqual(providerLinks.linksForProvider('synthetic'), {})
  assert.equal(providerLinks.linkForProvider('claude', 'billing'), 'https://console.anthropic.com/settings/billing')
  assert.equal(providerLinks.linkForProvider('claude', 'made-up'), null)
})

test('provider icon assets cover CodexBar provider branding', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8')
  const block = renderer.match(/const PROVIDER_ICON = \{([\s\S]*?)\n\}/)?.[1] || ''
  const mapped = Object.fromEntries(
    [...block.matchAll(/^\s*([a-z0-9]+):\s*(?:'([^']+)'|null),/gm)].map((match) => [match[1], match[2] || null]),
  )
  const providers = Object.keys(config._private.normalizeProviders({}))
  const allowedFallbacks = new Set(['azureopenai', 'moonshot'])

  for (const id of providers) {
    if (allowedFallbacks.has(id)) continue
    assert.ok(mapped[id], `${id} should use a provider icon asset`)
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'providers', mapped[id])), `${id} icon asset should exist`)
  }
})

test('CodexBar provider ids canonicalize to MaxxToken cards', () => {
  assert.equal(providerIds.canonicalProviderId('abacusai'), 'abacus')
  assert.equal(providerIds.canonicalProviderId('alibaba-coding-plan'), 'alibaba')
  assert.equal(providerIds.canonicalProviderId('alibaba-token-plan'), 'alibabatokenplan')
  assert.equal(providerIds.canonicalProviderId('bailian-token-plan'), 'alibabatokenplan')
  assert.equal(providerIds.canonicalProviderId('azure-openai'), 'azureopenai')
  assert.equal(providerIds.canonicalProviderId('groqcloud'), 'groq')
  assert.equal(providerIds.canonicalProviderId('t3-chat'), 't3chat')
})

test('config merge accepts CodexBar provider ids without ghost cards', () => {
  const providers = config._private.normalizeProviders({
    abacusai: { enabled: true, monthly: 60 },
    'alibaba-token-plan': { enabled: true, monthly: 40 },
    'azure-openai': { enabled: true, monthly: 75 },
    azureopenai: { plan: 'Canonical wins', monthly: 80 },
    groqcloud: { enabled: true },
    ghost: { enabled: true },
  })

  assert.equal(providers.abacus.enabled, true)
  assert.equal(providers.abacus.monthly, 60)
  assert.equal(providers.alibabatokenplan.enabled, true)
  assert.equal(providers.alibabatokenplan.monthly, 40)
  assert.equal(providers.azureopenai.enabled, true)
  assert.equal(providers.azureopenai.plan, 'Canonical wins')
  assert.equal(providers.azureopenai.monthly, 80)
  assert.equal(providers.groq.enabled, true)
  assert.equal(providers.abacusai, undefined)
  assert.equal(providers.ghost, undefined)
})

test('config clamps token history window like CodexBar cost history', () => {
  assert.equal(config._private.normalizeTokenHistoryDays(0), 1)
  assert.equal(config._private.normalizeTokenHistoryDays(90), 90)
  assert.equal(config._private.normalizeTokenHistoryDays(999), 365)
  assert.equal(config._private.normalizeTokenHistoryDays('nope'), 30)
})

test('config normalizes CodexBar-style quota warning thresholds', () => {
  assert.deepEqual(config._private.normalizeQuotaWarningThresholds([20, 50, 20, -4, 500]), [99, 50, 20, 0])
  assert.deepEqual(config._private.normalizeQuotaWarningThresholds([]), [50, 20])
})

test('config normalizes provider-specific alert overrides', () => {
  const provider = config._private.normalizeProviderConfig({
    name: 'Claude',
    alertsEnabled: false,
    alertReservePct: 500,
  })

  assert.equal(provider.alertsEnabled, false)
  assert.equal(provider.alertReservePct, 99)
})

test('provider config CLI lists and toggles providers with CodexBar aliases', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-provider-cli-'))
  const file = path.join(tmp, 'config.json')
  const stdout = []
  const stderr = []
  const io = {
    stdout: { write: (text) => stdout.push(text) },
    stderr: { write: (text) => stderr.push(text) },
  }

  try {
    assert.equal(providerConfigCli.run(['providers'], io, file), 0)
    assert.match(stdout.join(''), /claude\s+Claude/)
    assert.match(stdout.join(''), /t3-chat/)

    stdout.length = 0
    assert.equal(providerConfigCli.run(['enable', 'claude', 't3-chat', 'azure-openai'], io, file), 0)
    assert.equal(stdout.join('').trim(), 'claude=on t3chat=on azureopenai=on')
    let saved = config.loadConfig(file)
    assert.equal(saved.providers.claude.enabled, true)
    assert.equal(saved.providers.t3chat.enabled, true)
    assert.equal(saved.providers.azureopenai.enabled, true)

    stdout.length = 0
    assert.equal(providerConfigCli.run(['config', 'disable', 't3'], io, file), 0)
    saved = config.loadConfig(file)
    assert.equal(saved.providers.t3chat.enabled, false)
    assert.equal(stdout.join('').trim(), 't3chat=off')

    assert.equal(providerConfigCli.run(['enable', 'not-real'], io, file), 1)
    assert.match(stderr.join(''), /Unknown provider/)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('provider detection preselects local providers without touching config file', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-detect-'))
  fs.mkdirSync(path.join(home, '.codex', 'sessions'), { recursive: true })
  fs.mkdirSync(path.join(home, '.config', 'claude', 'projects'), { recursive: true })
  fs.mkdirSync(path.join(home, '.gemini'), { recursive: true })
  fs.writeFileSync(path.join(home, '.gemini', 'oauth_creds.json'), '{}')
  const detections = providerDetection.detectLocalProviders({
    home,
    env: {},
    execFileSync: () => {
      throw new Error('not installed')
    },
  })
  const applied = providerDetection.applyDetectionsToConfig(config.loadConfig(path.join(home, 'missing.json')), detections)

  assert.equal(detections.codex.reason, 'Codex sessions found')
  assert.equal(detections.claude.detected, true)
  assert.equal(detections.gemini.detected, true)
  assert.equal(applied.providers.codex.enabled, true)
  assert.equal(applied.providers.claude.enabled, true)
  assert.equal(applied.providers.gemini.enabled, true)
  assert.equal(fs.existsSync(path.join(home, 'missing.json')), false)

  fs.rmSync(home, { recursive: true, force: true })
})

test('provider detection can use login shell binaries', () => {
  const detections = providerDetection.detectLocalProviders({
    home: path.join(os.tmpdir(), 'maxxtoken-empty-home'),
    env: {},
    execFileSync: (_bin, args) => {
      if (String(args[1]).includes('claude')) return '/usr/local/bin/claude\n'
      throw new Error('missing')
    },
  })

  assert.equal(detections.claude.reason, 'Claude CLI found')
  assert.equal(detections.codex, undefined)
})

test('grok local scanner aggregates CodexBar-style signals token totals', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-grok-'))
  const now = Date.parse('2026-05-22T12:00:00Z')
  const signalA = path.join(home, 'sessions', 'project-a', 'session-a', 'signals.json')
  const signalB = path.join(home, 'sessions', 'project-b', 'session-b', 'signals.json')
  const cycle = {
    startMs: Date.parse('2026-05-01T00:00:00Z'),
    endMs: Date.parse('2026-06-01T00:00:00Z'),
    daysElapsed: 22,
    daysLeft: 10,
  }

  try {
    fs.writeFileSync(path.join(home, 'auth.json'), '{}')
    fs.mkdirSync(path.dirname(signalA), { recursive: true })
    fs.mkdirSync(path.dirname(signalB), { recursive: true })
    fs.writeFileSync(signalA, JSON.stringify({
      totalTokensBeforeCompaction: 1200,
      contextTokensUsed: 300,
      primaryModelId: 'grok-code-fast-1',
      modelsUsed: ['grok-code-fast-1', 'grok-4'],
    }))
    fs.writeFileSync(signalB, JSON.stringify({
      inputTokens: 50,
      cachedInputTokens: 10,
      outputTokens: 25,
      model: 'grok-4',
    }))
    fs.utimesSync(signalA, new Date(now), new Date(now))
    fs.utimesSync(signalB, new Date(now - 86400000), new Date(now - 86400000))

    const scanned = await grok.read(cycle, { grokHome: home, now, tokenHistoryDays: 30, fetchImpl: async () => {
      throw new Error('offline')
    } })

    assert.equal(scanned.connected, true)
    assert.equal(scanned.sessions, 2)
    assert.equal(scanned.activeDays, 2)
    assert.equal(scanned.tokenUsage.source, 'local Grok signals')
    assert.equal(scanned.tokenUsage.total, 1585)
    assert.equal(scanned.tokenUsage.input, 1550)
    assert.equal(scanned.tokenUsage.cached, 10)
    assert.equal(scanned.tokenUsage.output, 25)
    assert.deepEqual(scanned.tokenUsage.modelBreakdowns.map((row) => row.model), ['grok-code-fast-1', 'grok-4'])
    assert.equal(scanned.tokenUsage.dailyBreakdown.length, 2)
    assert.equal(scanned.tokenUsage.dailyBreakdown[0].modelBreakdowns[0].model, 'grok-code-fast-1')
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('grok web billing parser reads CodexBar gRPC-web quota payloads', async () => {
  const now = Date.parse('2026-05-22T12:00:00Z')
  const resetSeconds = Math.floor(Date.parse('2026-06-01T00:00:00Z') / 1000)
  const field = (number, wire) => varint((number << 3) | wire)
  const fixed32 = Buffer.alloc(4)
  fixed32.writeFloatLE(37.5, 0)
  const reset = varint(resetSeconds)
  const nested = Buffer.concat([
    field(1, 5), fixed32,
    field(5, 2), frame(Buffer.concat([field(1, 0), reset])),
  ])
  const grpcBody = grpcWebFrame(Buffer.concat([field(1, 2), frame(nested)]))
  const parsed = grok._private.parseGrokWebBillingResponse(grpcBody, now)

  assert.equal(parsed.usedPercent, 37.5)
  assert.equal(parsed.resetsAt, resetSeconds * 1000)

  const calls = []
  const fetched = await grok._private.fetchWebBilling({ cookieHeader: 'sso=abc; sso-rw=def' }, {
    now,
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return {
        ok: true,
        status: 200,
        headers: new Map(),
        arrayBuffer: async () => grpcBody,
      }
    },
  })

  assert.equal(fetched.usedPercent, 37.5)
  assert.equal(calls[0].options.headers.Cookie, 'sso=abc; sso-rw=def')
  assert.equal(calls[0].options.headers['Content-Type'], 'application/grpc-web+proto')

  function varint(value) {
    let n = BigInt(value)
    const out = []
    do {
      let byte = Number(n & 0x7fn)
      n >>= 7n
      if (n) byte |= 0x80
      out.push(byte)
    } while (n)
    return Buffer.from(out)
  }

  function frame(payload) {
    return Buffer.concat([varint(payload.length), payload])
  }

  function grpcWebFrame(payload) {
    const header = Buffer.alloc(5)
    header[0] = 0
    header.writeUInt32BE(payload.length, 1)
    return Buffer.concat([header, payload])
  }
})

test('grok auth resolver refreshes expired OIDC access tokens before billing', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-grok-auth-'))
  const now = Date.parse('2026-05-22T12:00:00Z')
  const scope = 'https://auth.x.ai::client-id'
  const authPath = path.join(home, 'auth.json')

  try {
    fs.writeFileSync(authPath, JSON.stringify({
      [scope]: {
        key: 'old-access-token',
        auth_mode: 'oidc',
        email: 'user@example.com',
        refresh_token: 'refresh-token',
        expires_at: '2026-05-22T11:00:00.000Z',
        oidc_issuer: 'https://auth.x.ai',
        oidc_client_id: 'client-id',
      },
    }))

    const calls = []
    const credentials = await grok._private.resolveCredentialsFresh(home, {
      now,
      fetchImpl: async (url, options) => {
        calls.push({ url, options })
        if (String(url).endsWith('/.well-known/openid-configuration')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ token_endpoint: 'https://auth.x.ai/oauth2/token' }),
          }
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'new-access-token', refresh_token: 'new-refresh-token', expires_in: 3600 }),
        }
      },
    })

    assert.equal(credentials.accessToken, 'new-access-token')
    assert.equal(credentials.auth.refreshToken, 'new-refresh-token')
    assert.equal(calls.length, 2)
    assert.equal(String(calls[1].options.body), 'grant_type=refresh_token&refresh_token=refresh-token&client_id=client-id')

    const persisted = JSON.parse(fs.readFileSync(authPath, 'utf8'))[scope]
    assert.equal(persisted.key, 'new-access-token')
    assert.equal(persisted.refresh_token, 'new-refresh-token')
    assert.equal(persisted.expires_at, '2026-05-22T13:00:00.000Z')
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('provider detection preselects token providers from env and local credential files', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-detect-creds-'))
  fs.mkdirSync(path.join(home, '.kimi', 'credentials'), { recursive: true })
  fs.writeFileSync(path.join(home, '.kimi', 'credentials', 'kimi-code.json'), '{}')
  fs.mkdirSync(path.join(home, '.local', 'share', 'kilo'), { recursive: true })
  fs.writeFileSync(path.join(home, '.local', 'share', 'kilo', 'auth.json'), '{}')
  fs.mkdirSync(path.join(home, '.config', 'manicode'), { recursive: true })
  fs.writeFileSync(path.join(home, '.config', 'manicode', 'credentials.json'), '{}')
  fs.mkdirSync(path.join(home, '.aws'), { recursive: true })
  fs.writeFileSync(path.join(home, '.aws', 'credentials'), '[default]')

  const detections = providerDetection.detectLocalProviders({
    home,
    env: {
      OPENAI_API_KEY: 'sk-test',
      AZURE_OPENAI_ENDPOINT: 'https://example.openai.azure.com',
      ALIBABA_TOKEN_PLAN_COOKIE: 'login=test',
      GROK_COOKIE: 'sso=test',
      GROQ_API_KEY: 'gsk-test',
      T3CHAT_COOKIE: 'session=test',
    },
    execFileSync: () => {
      throw new Error('not installed')
    },
  })

  assert.equal(detections.openai.reason, 'OPENAI_API_KEY found')
  assert.equal(detections.azureopenai.reason, 'AZURE_OPENAI_ENDPOINT found')
  assert.equal(detections.alibabatokenplan.reason, 'ALIBABA_TOKEN_PLAN_COOKIE found')
  assert.equal(detections.grok.reason, 'GROK_COOKIE found')
  assert.equal(detections.groq.reason, 'GROQ_API_KEY found')
  assert.equal(detections.t3chat.reason, 'T3CHAT_COOKIE found')
  assert.equal(detections.kimi.reason, 'Kimi credentials found')
  assert.equal(detections.kilo.reason, 'Kilo auth found')
  assert.equal(detections.codebuff.reason, 'Codebuff credentials found')
  assert.equal(detections.bedrock.reason, 'AWS credentials found')

  fs.rmSync(home, { recursive: true, force: true })
})

test('provider detection can use extra CodexBar provider CLI binaries', () => {
  const detections = providerDetection.detectLocalProviders({
    home: path.join(os.tmpdir(), 'maxxtoken-empty-home'),
    env: {},
    execFileSync: (_bin, args) => {
      if (String(args[1]).includes('amp')) return '/opt/homebrew/bin/amp\n'
      if (String(args[1]).includes('kiro-cli')) return '/opt/homebrew/bin/kiro-cli\n'
      if (String(args[1]).includes('opencodego')) return '/opt/homebrew/bin/opencodego\n'
      throw new Error('missing')
    },
  })

  assert.equal(detections.amp.reason, 'Amp CLI found')
  assert.equal(detections.kiro.reason, 'Kiro CLI found')
  assert.equal(detections.opencodego.reason, 'OpenCode Go CLI found')
})

test('config normalizes menu bar metric', () => {
  assert.equal(config._private.normalizeTrayMetric('burnbar'), 'burnbar')
  assert.equal(config._private.normalizeTrayMetric('target'), 'target')
  assert.equal(config._private.normalizeTrayMetric('reset'), 'reset')
  assert.equal(config._private.normalizeTrayMetric('left'), 'left')
  assert.equal(config._private.normalizeTrayMetric('spent'), 'spent')
  assert.equal(config._private.normalizeTrayMetric('nope'), 'burnbar')
})

test('config normalizes usage meter mode', () => {
  assert.equal(config._private.normalizeUsageMeterMode('used'), 'used')
  assert.equal(config._private.normalizeUsageMeterMode('left'), 'left')
  assert.equal(config._private.normalizeUsageMeterMode('remaining'), 'left')
  assert.equal(config._private.normalizeUsageMeterMode('nope'), 'used')
})

test('tray title formats configured menu bar metric', () => {
  const now = Date.parse('2026-05-21T12:00:00Z')
  const snap = {
    totals: {
      left: 386.7,
      spent: 28.3,
      capturedPct: 7,
      tokens: { total: 1234567 },
      resetQueue: [{ resetAt: now + 3 * 3600000 }],
    },
    maxxTarget: { name: 'Claude', resetAt: now + 6 * 3600000 },
  }

  assert.equal(trayTitle.trayTitleFromSnapshot(snap, 'left', now), ' $387')
  assert.equal(trayTitle.trayTitleFromSnapshot(snap, 'spent', now), ' $28 spent')
  assert.equal(trayTitle.trayTitleFromSnapshot(snap, 'percent', now), ' 7%')
  assert.equal(trayTitle.trayTitleFromSnapshot(snap, 'target', now), ' Claude')
  assert.equal(trayTitle.trayTitleFromSnapshot(snap, 'reset', now), ' 3h 0m')
  assert.equal(trayTitle.trayTitleFromSnapshot(snap, 'tokens', now), ' 1.2M')
  assert.equal(trayTitle.trayTitleFromSnapshot({ totals: { left: 12 } }, 'tokens', now), ' $12')
})

test('Windows launcher script opens prompt-capable CLIs through PowerShell', () => {
  const home = String.raw`C:\Users\Rachel`
  const script = launch._private.buildWindowsScript({
    cliBin: 'claude',
    cliPath: String.raw`C:\Users\Rachel\AppData\Roaming\npm\claude.cmd`,
    dir: String.raw`C:\work\maxxtoken-test`,
    promptFile: String.raw`C:\Users\Rachel\.maxxtoken\forge-prompt.txt`,
    env: {
      APPDATA: String.raw`C:\Users\Rachel\AppData\Roaming`,
      LOCALAPPDATA: String.raw`C:\Users\Rachel\AppData\Local`,
    },
    home,
  })

  assert.ok(script.includes(String.raw`Set-Location -LiteralPath 'C:\work\maxxtoken-test'`))
  assert.ok(script.includes(String.raw`& 'C:\Users\Rachel\AppData\Roaming\npm\claude.cmd' (Get-Content -Raw -LiteralPath 'C:\Users\Rachel\.maxxtoken\forge-prompt.txt')`))
  assert.ok(script.includes('Press Enter to close'))
})

test('Windows CLI resolution checks PATHEXT shims before shell lookup', () => {
  const seen = []
  const found = launch._private.resolveCli('codex', {
    platform: 'win32',
    home: '/Users/Rachel',
    env: {
      APPDATA: '/Users/Rachel/AppData/Roaming',
      LOCALAPPDATA: '/Users/Rachel/AppData/Local',
      PATH: '/tools;/bin',
      PATHEXT: '.EXE;.CMD',
    },
    fs: {
      accessSync: (file) => {
        seen.push(file)
        if (!file.endsWith('codex.cmd')) throw new Error('missing')
      },
      constants: fs.constants,
    },
    execFileSync: () => {
      throw new Error('where should not run')
    },
  })

  assert.ok(found.endsWith('codex.cmd'))
  assert.ok(seen.some((file) => file.endsWith('codex.exe')))
})

test('log CLI defaults to Windows roaming app data on win32', () => {
  assert.equal(
    logCli.defaultLogPath('win32', { APPDATA: String.raw`C:\Users\Rachel\AppData\Roaming` }, String.raw`C:\Users\Rachel`),
    path.join(String.raw`C:\Users\Rachel\AppData\Roaming`, 'maxxtoken-menubar', 'debug.log'),
  )
})

test('t3 chat JSONL parser maps CodexBar customer usage windows', () => {
  const reset4h = Date.parse('2026-05-21T20:00:00Z')
  const periodEnd = Date.parse('2026-06-01T00:00:00Z')
  const response = `${JSON.stringify({
    result: {
      data: {
        json: {
          usageFourHourPercentage: 12.5,
          usageFourHourNextResetAt: reset4h,
          usageMonthPercentage: 34.4,
          billingNextResetAt: Date.parse('2026-07-01T00:00:00Z'),
          usageBand: 'max',
          lifetimeBalance: '3.5',
          subscription: {
            productName: 'pro-plan',
            status: 'active',
            currentPeriodEnd: periodEnd,
          },
        },
      },
    },
  })}\n`

  const snapshot = t3chat._private.parseJSONLines(response, Date.parse('2026-05-21T18:00:00Z'))

  assert.equal(snapshot.connected, true)
  assert.equal(snapshot.plan, 'Pro Plan')
  assert.equal(snapshot.usageBand, 'max')
  assert.equal(snapshot.lifetimeBalance, 3.5)
  assert.equal(snapshot.subscriptionStatus, 'active')
  assert.deepEqual(snapshot.windows, [
    {
      label: 'Base - max',
      kind: '4h',
      usedPct: 13,
      resetAt: reset4h,
      periodMs: 4 * 3600e3,
    },
    {
      label: 'Overage',
      kind: 'cycle',
      usedPct: 34,
      resetAt: periodEnd,
      periodMs: null,
    },
  ])
})

test('t3 chat overage reset comes from subscription period end only', () => {
  const billingReset = Date.parse('2026-07-01T00:00:00Z')
  const snapshot = t3chat._private.snapshotFromCustomerData({
    usageMonthPercentage: 9,
    billingNextResetAt: billingReset,
    usageBand: 'standard',
  })

  assert.equal(snapshot.windows[0].label, 'Overage')
  assert.equal(snapshot.windows[0].resetAt, null)
})

test('t3 chat cURL parser captures cookie and useful browser headers', () => {
  const context = t3chat._private.requestContext(
    "curl 'https://t3.chat/api/trpc/getCustomerData?batch=1' " +
      "-H 'Cookie: session=abc; theme=dark' " +
      "--header=$'User-Agent: Browser\\'s Agent' " +
      "-H 'X-Deployment-Id: dep_123' " +
      "-H 'x-client-context: ctx'",
  )

  assert.equal(context.cookieHeader, 'session=abc; theme=dark')
  assert.equal(context.headers['User-Agent'], "Browser's Agent")
  assert.equal(context.headers['X-Deployment-Id'], 'dep_123')
  assert.equal(context.headers['x-client-context'], 'ctx')
})

test('unknown usage is not counted as full remaining value', () => {
  const value = _private.valueFromMonthly({ monthly: 200 }, null, {
    label: 'live quota',
    accuracy: 'live',
  })

  assert.equal(value.totalValue, null)
  assert.equal(value.spentValue, null)
  assert.equal(value.leftValue, null)
  assert.equal(value.capturedPct, null)
  assert.equal(value.remainingPct, null)
})

test('totals sum provider spent and left instead of recomputing from config', () => {
  const providers = [
    { connected: true, totalValue: 200, spentValue: 24, leftValue: 176, valueAccuracy: 'live' },
    { connected: true, totalValue: 200, spentValue: 4, leftValue: 196, valueAccuracy: 'live' },
    { connected: true, totalValue: 15, spentValue: 0.3, leftValue: 14.7, valueAccuracy: 'live' },
    { connected: true, totalValue: null, spentValue: null, leftValue: null, valueAccuracy: 'live' },
  ]

  const totals = _private.totalsFromProviders(providers)

  assert.equal(totals.totalValue, 415)
  assert.equal(totals.spent, 28.3)
  assert.equal(totals.left, 386.7)
  assert.equal(totals.planCount, 3)
  assert.equal(totals.capturedPct, 7)
  assert.equal(totals.remainingPct, 93)
})

test('credit balances use actual remaining balance as left value', () => {
  const value = _private.valueFromSpendLeft(0, 99.11, {
    label: 'live credit balance',
    accuracy: 'live',
  })

  assert.equal(value.totalValue, 99.11)
  assert.equal(value.spentValue, 0)
  assert.equal(value.leftValue, 99.11)
  assert.equal(value.capturedPct, 0)
})

test('token totals sum tracked provider session tokens', () => {
  const totals = _private.tokenTotalsFromProviders([
    { connected: true, tokenUsage: { input: 100, cached: 20, output: 10, total: 130 } },
    { connected: true, tokenUsage: { input: 8, cached: 2, output: 1, total: 11 } },
    { connected: false, tokenUsage: { input: 999, cached: 0, output: 0, total: 999 } },
  ])

  assert.equal(totals.input, 108)
  assert.equal(totals.cached, 22)
  assert.equal(totals.output, 11)
  assert.equal(totals.total, 141)
  assert.equal(totals.providerCount, 2)
})

test('token totals include estimated costs when providers expose real token pricing', () => {
  const totals = _private.tokenTotalsFromProviders([
    { connected: true, tokenUsage: { input: 100, cached: 20, output: 10, total: 130, costUSD: 0.42 } },
    { connected: true, tokenUsage: { input: 8, cached: 2, output: 1, total: 11 } },
    { connected: true, tokenUsage: { input: 5, cached: 0, output: 5, total: 10, costUSD: 0.03 } },
  ])

  assert.ok(Math.abs(totals.costUSD - 0.45) < 0.000001)
  assert.equal(totals.costProviderCount, 2)
})

test('token daily cost summary only counts providers with real daily token cost rows', () => {
  const daily = _private.tokenDailyCostFromProviders([
    {
      id: 'claude',
      connected: true,
      tokenUsage: {
        total: 500,
        dailyBreakdown: [
          { date: '2026-05-22', input: 100, cached: 20, output: 30, total: 150, costUSD: 0.42 },
          { date: '2026-05-21', input: 80, cached: 10, output: 20, total: 110, costUSD: 0.30 },
        ],
      },
    },
    {
      id: 'codex',
      connected: true,
      tokenUsage: {
        total: 200,
        dailyBreakdown: [
          { date: '2026-05-22', input: 40, cached: 5, output: 5, total: 50, costUSD: 0.08 },
          { date: '2026-05-21', input: 20, cached: 0, output: 10, total: 30 },
        ],
      },
    },
    {
      id: 'cursor',
      connected: true,
      tokenUsage: {
        total: 999,
        dailyBreakdown: [{ date: '2026-05-22', input: 999, cached: 0, output: 0, total: 999 }],
      },
    },
    { id: 'offline', connected: false, tokenUsage: { total: 1, dailyBreakdown: [{ date: '2026-05-22', total: 1, costUSD: 99 }] } },
  ])

  assert.equal(daily.latest.dayKey, '2026-05-22')
  assert.equal(daily.latest.total, 1199)
  assert.equal(daily.latest.providerCount, 3)
  assert.equal(daily.latest.costProviderCount, 2)
  assert.ok(Math.abs(daily.latest.costUSD - 0.5) < 0.000001)
  assert.equal(daily.previous.dayKey, '2026-05-21')
  assert.equal(daily.previous.costProviderCount, 1)
  assert.ok(Math.abs(daily.deltaCostUSD - 0.2) < 0.000001)
  assert.equal(daily.deltaTokens, 1059)
})

test('token cost estimates Claude model breakdowns with cache pricing', () => {
  const usage = {
    modelBreakdowns: [
      {
        model: 'claude-sonnet-4-6',
        input: 1500,
        uncachedInput: 1000,
        cacheCreation: 500,
        cacheRead: 2000,
        cached: 2000,
        output: 100,
        total: 3600,
      },
    ],
  }

  const estimate = tokenCost._private.estimateClaudeTokenCost(usage)
  assert.equal(estimate.costUSD, 0.006975)
  assert.equal(estimate.modelBreakdowns[0].costUSD, 0.006975)
  assert.equal(estimate.modelBreakdowns[0].costAccuracy, 'estimate')
  assert.ok(['built-in', 'models.dev'].includes(estimate.modelBreakdowns[0].pricingSource))
  assert.deepEqual(estimate.pricedModels, ['claude-sonnet-4-6'])
  assert.deepEqual(estimate.unpricedModels, [])

  const withCost = tokenCost.withTokenCost('claude', {
    ...usage,
    dailyBreakdown: [{ date: '2026-05-21', ...usage.modelBreakdowns[0], modelBreakdowns: usage.modelBreakdowns }],
  })
  assert.equal(withCost.dailyBreakdown[0].costUSD, 0.006975)
  assert.equal(withCost.dailyBreakdown[0].modelBreakdowns[0].costAccuracy, 'estimate')
})

test('token cost estimates Codex model breakdowns with cache pricing', () => {
  const usage = {
    modelBreakdowns: [
      {
        model: 'openai/gpt-5-codex',
        input: 140,
        cached: 50,
        output: 15,
        total: 205,
      },
    ],
  }

  const estimate = tokenCost._private.estimateCodexTokenCost(usage)
  assert.equal(estimate.costUSD, 0.00026875)
  assert.equal(estimate.modelBreakdowns[0].costUSD, 0.00026875)
  assert.equal(estimate.modelBreakdowns[0].costAccuracy, 'estimate')
  assert.ok(['built-in', 'models.dev'].includes(estimate.modelBreakdowns[0].pricingSource))
  assert.deepEqual(estimate.pricedModels, ['openai/gpt-5-codex'])

  const withCost = tokenCost.withTokenCost('codex', {
    ...usage,
    dailyBreakdown: [{ date: '2026-05-21', ...usage.modelBreakdowns[0], modelBreakdowns: usage.modelBreakdowns }],
  })
  assert.equal(withCost.costUSD, 0.00026875)
  assert.equal(withCost.dailyBreakdown[0].costUSD, 0.00026875)
})

test('token cost estimates Grok Build with hypothetical xAI API pricing', () => {
  const usage = {
    modelBreakdowns: [
      {
        model: 'grok-build',
        input: 1000,
        cached: 200,
        output: 50,
        total: 1250,
      },
    ],
  }

  const estimate = tokenCost._private.estimateGrokTokenCost(usage)
  assert.ok(Math.abs(estimate.costUSD - 0.00094) < 0.0000001)
  assert.equal(estimate.costAccuracy, 'hypothetical')
  assert.equal(estimate.modelBreakdowns[0].pricingSource, 'xAI pricing')
  assert.equal(estimate.modelBreakdowns[0].pricingModel, 'grok-build-0.1')

  const withCost = tokenCost.withTokenCost('grok', {
    ...usage,
    dailyBreakdown: [{ date: '2026-05-21', ...usage.modelBreakdowns[0], modelBreakdowns: usage.modelBreakdowns }],
  })
  assert.ok(Math.abs(withCost.costUSD - 0.00094) < 0.0000001)
  assert.equal(withCost.costAccuracy, 'hypothetical')
  assert.ok(Math.abs(withCost.dailyBreakdown[0].costUSD - 0.00094) < 0.0000001)
})

test('token cost leaves Codex unpriced when the model is unknown', () => {
  const usage = {
    modelBreakdowns: [
      { model: 'mystery-codex', input: 100, cached: 10, output: 5, total: 115 },
    ],
  }

  assert.equal(tokenCost._private.estimateCodexTokenCost(usage), null)
  assert.equal(tokenCost.withTokenCost('codex', usage), usage)
})

test('codex live usage parser keeps Spark and credit buckets', () => {
  const usage = codex._private.parseLiveUsage({
    plan_type: 'pro',
    rate_limit: {
      primary_window: { used_percent: 12, limit_window_seconds: 18000, reset_after_seconds: 60 },
      secondary_window: { used_percent: 34, limit_window_seconds: 604800, reset_after_seconds: 120 },
    },
    additional_rate_limits: [{
      limit_name: 'GPT-5.3-Codex-Spark',
      metered_feature: 'codex_bengalfox',
      rate_limit: {
        primary_window: { used_percent: 0, limit_window_seconds: 18000 },
        secondary_window: { remaining_percent: 97, limit_window_seconds: 604800 },
      },
    }],
    credits: { has_credits: true, balance: '42.5' },
  })

  assert.equal(usage.planType, 'Pro 20x')
  assert.deepEqual(usage.windows.map((w) => w.label), ['Session', 'Weekly', 'Spark', 'Spark Weekly'])
  assert.equal(usage.windows.find((w) => w.label === 'Spark Weekly').usedPct, 3)
  assert.deepEqual(usage.extra.find((e) => e.label === 'Credits left'), { label: 'Credits left', value: '42.5' })
})

test('claude usage parser exposes CodexBar-style specific buckets', () => {
  const windows = claude._private.windowsFromUsage({
    five_hour: { utilization: 2, resets_at: '2026-05-26T12:00:00Z' },
    seven_day: { utilization: 13, resets_at: '2026-05-30T12:00:00Z' },
    seven_day_oauth_apps: { utilization: 9, resets_at: '2026-05-30T12:00:00Z' },
    seven_day_sonnet: null,
    seven_day_opus: { utilization: 4, resets_at: '2026-05-30T12:00:00Z' },
    seven_day_design: { utilization: 0, resets_at: null },
    seven_day_cowork: null,
  })

  assert.deepEqual(windows.map((w) => w.label), [
    'Session',
    'Weekly',
    'OAuth Apps',
    'Sonnet',
    'Opus',
    'Claude Design',
    'Daily Routines',
  ])
  assert.equal(windows.find((w) => w.label === 'Sonnet').usedPct, 0)
  assert.equal(windows.find((w) => w.label === 'Daily Routines').usedPct, 0)
})

test('burn adapter only renders primary provider windows plus Claude Agent SDK credit', () => {
  const { burnAdaptProvider } = loadBurnAdaptForTest()
  const resetAt = Date.now() + 5 * 3600e3
  const adapted = burnAdaptProvider({
    id: 'claude',
    name: 'Claude',
    plan: 'Max 20x',
    connected: true,
    capturedPct: 3,
    resetAt,
    windows: [
      { label: 'Session', kind: '5h', usedPct: 2, resetAt },
      { label: 'Weekly', kind: '7d', usedPct: 3, resetAt },
      { label: 'Sonnet', kind: '7d', usedPct: 0, resetAt },
      { label: 'Opus', kind: '7d', usedPct: 0, resetAt },
      { label: 'Agent SDK', kind: 'agent-sdk-credit', usedPct: null, valueLabel: '$200/mo', resetAt },
    ],
  })

  const visible = JSON.parse(JSON.stringify(adapted.windows.map((w) => [w.label, w.value])))
  assert.deepEqual(visible, [
    ['5H', '2%'],
    ['7D', '3%'],
    ['AGENT SDK', '$200/MO'],
  ])
  assert.equal(adapted.windowSummary, '5H 2% · 7D 3% · AGENT SDK $200/MO')
})

test('burn adapter can show session quota left without changing raw usage sorting fields', () => {
  const { burnAdaptProvider } = loadBurnAdaptForTest()
  const resetAt = Date.now() + 5 * 3600e3
  const adapted = burnAdaptProvider({
    id: 'claude',
    name: 'Claude',
    plan: 'Max 20x',
    connected: true,
    capturedPct: 75,
    remainingPct: 25,
    resetAt,
    windows: [
      { label: 'Session', kind: '5h', usedPct: 80, remainingPct: 20, resetAt },
      { label: 'Weekly', kind: '7d', usedPct: 30, resetAt },
    ],
  }, { usageMeterMode: 'left' })

  assert.equal(adapted.used, 75)
  assert.equal(adapted.meterPct, 20)
  assert.equal(adapted.meterLabel, 'LEFT')
  assert.equal(adapted.meterValue, '20%')
  const visible = JSON.parse(JSON.stringify(adapted.windows.map((w) => [w.label, w.pct, w.value])))
  assert.deepEqual(visible, [
    ['5H', 20, '20% LEFT'],
    ['7D', 70, '70% LEFT'],
  ])
  assert.equal(adapted.windowSummary, '5H 20% LEFT · 7D 70% LEFT')
})

test('burn adapter collapsed meter prefers 5-hour session over weekly headline', () => {
  const { burnAdaptProvider } = loadBurnAdaptForTest()
  const resetAt = Date.now() + 5 * 3600e3
  const adapted = burnAdaptProvider({
    id: 'codex',
    name: 'ChatGPT',
    plan: 'Pro',
    connected: true,
    capturedPct: 95,
    remainingPct: 5,
    resetAt,
    windows: [
      { label: 'Session', kind: '5h', usedPct: 12, remainingPct: 88, resetAt },
      { label: 'Weekly', kind: '7d', usedPct: 95, remainingPct: 5, resetAt: resetAt + 2 * 86400e3 },
    ],
  })

  assert.equal(adapted.used, 95)
  assert.equal(adapted.meterPct, 12)
  assert.equal(adapted.meterValue, '12%')
  assert.equal(adapted.meterLabel, 'USED')
})

test('burn adapter collapsed left meter prefers 5-hour session remaining', () => {
  const { burnAdaptProvider } = loadBurnAdaptForTest()
  const resetAt = Date.now() + 5 * 3600e3
  const adapted = burnAdaptProvider({
    id: 'codex',
    name: 'ChatGPT',
    plan: 'Pro',
    connected: true,
    capturedPct: 95,
    remainingPct: 5,
    resetAt,
    windows: [
      { label: 'Session', kind: '5h', usedPct: 12, remainingPct: 88, resetAt },
      { label: 'Weekly', kind: '7d', usedPct: 95, remainingPct: 5, resetAt: resetAt + 2 * 86400e3 },
    ],
  }, { usageMeterMode: 'left' })

  assert.equal(adapted.used, 95)
  assert.equal(adapted.meterPct, 88)
  assert.equal(adapted.meterValue, '88%')
  assert.equal(adapted.meterLabel, 'LEFT')
})

test('burn adapter does not borrow provider remaining for 5-hour collapsed left meter', () => {
  const { burnAdaptProvider } = loadBurnAdaptForTest()
  const resetAt = Date.now() + 5 * 3600e3
  const adapted = burnAdaptProvider({
    id: 'codex',
    name: 'ChatGPT',
    plan: 'Pro',
    connected: true,
    capturedPct: 5,
    remainingPct: 95,
    resetAt,
    windows: [
      { label: 'Session', kind: '5h', usedPct: 1, resetAt },
      { label: 'Weekly', kind: '7d', usedPct: 5, resetAt: resetAt + 2 * 86400e3 },
    ],
  }, { usageMeterMode: 'left' })

  assert.equal(adapted.meterPct, 99)
  assert.equal(adapted.meterValue, '99%')
  assert.equal(adapted.windowSummary, '5H 99% LEFT · 7D 95% LEFT')
})

test('Claude Agent SDK credit amount follows official paid plan tiers', () => {
  assert.equal(_private.claudeAgentSdkCreditAmount('Pro'), 20)
  assert.equal(_private.claudeAgentSdkCreditAmount('Max 5x'), 100)
  assert.equal(_private.claudeAgentSdkCreditAmount('Max 20x'), 200)
  assert.equal(_private.claudeAgentSdkCreditAmount('Claude'), null)
})

test('Claude Agent SDK credit window tracks live extra usage when API reports it', () => {
  const cycle = { endMs: Date.parse('2026-07-01T00:00:00Z') }
  const w = _private.claudeAgentSdkCreditWindow('Max 20x', cycle, {
    usedUSD: 15.74,
    limitUSD: 200,
    utilization: 7.87,
  })
  assert.equal(w.label, 'Agent SDK')
  assert.equal(w.kind, 'agent-sdk-credit')
  assert.equal(w.usedPct, 8)
  assert.equal(w.valueLabel, '$15.74 / $200')
  assert.equal(w.creditUSD, 200)
  assert.equal(w.spentUSD, 15.74)
  assert.equal(w.leftUSD, 184.26)
  assert.equal(w.resetAt, cycle.endMs)
})

test('Claude Agent SDK credit window falls back to static plan credit without live data', () => {
  const cycle = { endMs: Date.parse('2026-07-01T00:00:00Z') }
  const w = _private.claudeAgentSdkCreditWindow('Max 20x', cycle, null)
  assert.equal(w.usedPct, null)
  assert.equal(w.valueLabel, '$200/mo')
})

test('burn adapter shows live Agent SDK credit spend with a real meter', () => {
  const { burnAdaptProvider } = loadBurnAdaptForTest()
  const resetAt = Date.now() + 5 * 3600e3
  const adapted = burnAdaptProvider({
    id: 'claude',
    name: 'Claude',
    plan: 'Max 20x',
    connected: true,
    capturedPct: 3,
    resetAt,
    windows: [
      { label: 'Session', kind: '5h', usedPct: 2, resetAt },
      { label: 'Weekly', kind: '7d', usedPct: 3, resetAt },
      { label: 'Agent SDK', kind: 'agent-sdk-credit', usedPct: 8, valueLabel: '$15.74 / $200', creditUSD: 200, spentUSD: 15.74, leftUSD: 184.26, resetAt },
    ],
  })
  const sdk = adapted.windows.find((w) => w.label === 'AGENT SDK')
  assert.equal(sdk.value, '$15.74 / $200')
  assert.equal(sdk.pct, 8)
})

test('token cost uses cached models.dev prices for new OpenAI and Anthropic models', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-models-dev-'))
  const old = process.env.MAXXTOKEN_MODELS_DEV_CACHE_ROOT
  process.env.MAXXTOKEN_MODELS_DEV_CACHE_ROOT = root
  tokenCost._private.modelsDev._private.resetForTesting()
  try {
    tokenCost._private.modelsDev.save({
      providers: {
        openai: {
          id: 'openai',
          models: {
            'gpt-9-codex': {
              id: 'gpt-9-codex',
              cost: { input: 2, output: 10, cache_read: 0.2 },
            },
          },
        },
        anthropic: {
          id: 'anthropic',
          models: {
            'claude-future': {
              id: 'claude-future',
              cost: { input: 4, output: 20, cache_read: 0.4, cache_write: 5 },
            },
          },
        },
      },
    })

    assert.deepEqual(tokenCost._private.codexCostBreakdown({
      model: 'openai/gpt-9-codex',
      input: 100,
      cached: 40,
      output: 10,
    }), { costUSD: 0.000228, pricingSource: 'models.dev', pricingModel: 'gpt-9-codex' })
    assert.deepEqual(tokenCost._private.claudeCostBreakdown({
      model: 'anthropic.claude-future',
      uncachedInput: 100,
      cacheCreation: 10,
      cacheRead: 40,
      output: 10,
    }), { costUSD: 0.000666, pricingSource: 'models.dev', pricingModel: 'claude-future' })
  } finally {
    if (old == null) delete process.env.MAXXTOKEN_MODELS_DEV_CACHE_ROOT
    else process.env.MAXXTOKEN_MODELS_DEV_CACHE_ROOT = old
    tokenCost._private.modelsDev._private.resetForTesting()
  }
})

test('widget snapshot exports compact token-maxxing state and keeps enabled providers visible', () => {
  const snap = {
    generatedAt: Date.parse('2026-05-21T12:00:00Z'),
    cycle: { label: 'May cycle', daysLeft: 10, totalDays: 31 },
    totals: {
      totalValue: 400,
      spent: 120,
      left: 280,
      capturedPct: 30,
      planCount: 2,
      tokens: {
        total: 123,
        input: 100,
        cached: 10,
        output: 13,
        costUSD: 0.04,
        costProviderCount: 1,
        providerCount: 1,
        dailyCost: { latest: { dayKey: '2026-05-21', total: 123, costUSD: 0.04, providerCount: 1, costProviderCount: 1 }, days: [] },
      },
      tokenTrend: { direction: 'up', deltaTotal: 42, deltaCostUSD: 0.02 },
      resetQueue: [{ providerId: 'claude', reservePct: 70, resetAt: Date.parse('2026-05-22T12:00:00Z') }],
      trend: { direction: 'up', deltaPct: 8 },
      history: { sampleCount: 4 },
    },
    rating: { stars: 2, verdict: 'Leaking value. Pick a mission.' },
    maxxTarget: { id: 'claude', name: 'Claude', reservePct: 70 },
    providers: [
      {
        id: 'claude',
        name: 'Claude',
        plan: 'Max',
        connected: true,
        activity: 'live',
        capturedPct: 30,
        remainingPct: 70,
        spentValue: 60,
        leftValue: 140,
        sourceLabel: 'local Claude logs',
        windows: [
          {
            label: 'Weekly',
            kind: '7d',
            usedPct: 30,
            resetAt: Date.parse('2026-05-22T12:00:00Z'),
            history: { missRiskPct: 80 },
            pace: { tone: 'reserve', leftLabel: '20% in reserve', willLastToReset: true, expectedUsedPercent: 50, projectedAtResetPercent: 80 },
          },
          { label: 'Session', kind: '5h', usedPct: 10, resetAt: Date.parse('2026-05-21T15:00:00Z') },
          { label: 'Agent SDK', kind: 'agent-sdk-credit', usedPct: null, valueLabel: '$200/mo', creditUSD: 200, resetAt: Date.parse('2026-06-15T00:00:00Z') },
        ],
        tokenUsage: {
          total: 123,
          input: 100,
          cached: 10,
          output: 13,
          costUSD: 0.04,
          costAccuracy: 'estimate',
          pricingSource: 'models.dev',
          pricingSources: ['models.dev'],
          source: 'local Claude logs',
          modelBreakdowns: [
            { model: 'claude-opus-4-7', input: 80, cached: 10, output: 10, total: 100, costUSD: 0.03, costAccuracy: 'estimate', pricingSource: 'models.dev', pricingModel: 'claude-opus-4-7', requests: 4 },
            { model: 'claude-sonnet-4-6', input: 20, cached: 0, output: 3, total: 23, costUSD: 0.01, costAccuracy: 'estimate', requests: 2 },
          ],
          dailyBreakdown: [
            {
              date: '2026-05-21',
              total: 123,
              costUSD: 0.04,
              requests: 6,
              modelBreakdowns: [{ model: 'claude-opus-4-7', input: 80, cached: 10, output: 10, total: 100, costUSD: 0.03, costAccuracy: 'estimate', requests: 4 }],
            },
          ],
        },
      },
      { id: 'cursor', name: 'Cursor', connected: false, needsKey: true, error: 'Cursor needs Cookie', windows: [] },
    ],
  }

  const compact = widgetSnapshot.buildWidgetSnapshot(snap)

  assert.equal(compact.generatedAt, '2026-05-21T12:00:00.000Z')
  assert.equal(compact.totals.left, 280)
  assert.equal(compact.maxxTarget.id, 'claude')
  assert.equal(compact.resetQueue.length, 1)
  assert.deepEqual(compact.enabledProviderIds, ['claude', 'cursor'])
  assert.equal(compact.providers.length, 2)
  assert.equal(compact.providers[0].sourceLabel, 'local Claude logs')
  assert.equal(compact.providers[0].links.status, 'https://status.claude.com/')
  assert.equal(compact.providers[0].links.dashboard, 'https://claude.ai/settings/usage')
  assert.equal(compact.providers[0].primaryWindow.label, 'Weekly')
  assert.equal(compact.providers[0].primaryWindow.historyRiskPct, 80)
  assert.equal(compact.providers[0].primaryWindow.pace.expectedUsedPercent, 50)
  assert.equal(compact.providers[0].primaryWindow.pace.projectedAtResetPercent, 80)
  assert.equal(compact.providers[0].secondaryWindow.label, 'Session')
  assert.equal(compact.providers[0].windows[2].valueLabel, '$200/mo')
  assert.equal(compact.providers[0].windows[2].creditUSD, 200)
  assert.equal(compact.providers[0].tokenUsage.total, 123)
  assert.equal(compact.providers[0].tokenUsage.costUSD, 0.04)
  assert.equal(compact.providers[0].tokenUsage.pricingSource, 'models.dev')
  assert.equal(compact.providers[0].tokenUsage.topModels[0].model, 'claude-opus-4-7')
  assert.equal(compact.providers[0].tokenUsage.topModels[0].pricingSource, 'models.dev')
  assert.equal(compact.providers[0].dailyUsage[0].dayKey, '2026-05-21')
  assert.equal(compact.providers[0].dailyUsage[0].totalTokens, 123)
  assert.equal(compact.providers[0].dailyUsage[0].topModels[0].costUSD, 0.03)
  assert.equal(compact.totals.tokenTrend.deltaCostUSD, 0.02)
  assert.equal(compact.totals.tokens.dailyCost.latest.costUSD, 0.04)
  assert.equal(compact.providers[1].id, 'cursor')
  assert.equal(compact.providers[1].connected, false)
  assert.equal(compact.providers[1].needsKey, true)
  assert.equal(compact.providers[1].error, 'Cursor needs Cookie')
})

test('widget snapshot preserves daily token totals from split token fields', () => {
  const compact = widgetSnapshot.buildWidgetSnapshot({
    generatedAt: Date.parse('2026-06-02T12:00:00Z'),
    providers: [
      {
        id: 'claude',
        name: 'Claude',
        connected: true,
        windows: [],
        tokenUsage: {
          total: 1200,
          input: 100,
          cached: 1000,
          output: 100,
          costUSD: 0.42,
          dailyBreakdown: [
            {
              dayKey: '2026-06-02',
              input: 12,
              cached: 345,
              output: 6,
              costUSD: 0.13,
            },
          ],
        },
      },
    ],
  })

  assert.equal(compact.providers[0].dailyUsage[0].totalTokens, 363)
  assert.equal(compact.providers[0].tokenUsage.dailyUsage[0].totalTokens, 363)
  assert.equal(compact.providers[0].dailyUsage[0].costUSD, 0.13)
})

test('cached provider fallback keeps last good usage when a transient poll fails', () => {
  const now = Date.parse('2026-05-22T21:00:00Z')
  const providers = [
    {
      id: 'kimi',
      name: 'Kimi',
      plan: 'Basic',
      monthly: 15,
      connected: true,
      error: 'Usage fetch failed.',
      windows: [],
      capturedPct: null,
      spentValue: null,
      leftValue: null,
    },
  ]
  const cache = {
    generatedAt: new Date(now - 60000).toISOString(),
    providers: [
      {
        id: 'kimi',
        name: 'Kimi',
        plan: 'Basic',
        monthly: 15,
        connected: true,
        capturedPct: 2,
        spentValue: 0.3,
        leftValue: 14.7,
        sourceLabel: 'live quota',
        primaryWindow: { label: 'Weekly', kind: '7d', usedPct: 2, resetAt: now + 86400000 },
      },
    ],
  }

  const [fallback] = _private.applyCachedProviderFallbacks(providers, cache, now)

  assert.equal(fallback.error, null)
  assert.equal(fallback.activity, 'stale')
  assert.equal(fallback.capturedPct, 2)
  assert.equal(fallback.spentValue, 0.3)
  assert.equal(fallback.leftValue, 14.7)
  assert.equal(fallback.windows[0].label, 'Weekly')
  assert.equal(fallback.sourceLabel, 'cached live quota')
  assert.equal(fallback.lastUpdatedAt, now - 60000)
})

test('carryForwardTokenUsage fills null tokenUsage from cache on light pulls', () => {
  const providers = [
    { id: 'claude', connected: true, tokenUsage: null },
    { id: 'codex', connected: true, tokenUsage: { total: 999, topModels: [{ model: 'gpt' }] } },
    { id: 'kimi', connected: false, tokenUsage: null },
  ]
  const cache = {
    providers: [
      { id: 'claude', tokenUsage: { total: 12345, topModels: [{ model: 'sonnet' }], dailyUsage: [{ date: '2026-05-30', total: 12345 }] } },
      { id: 'kimi', tokenUsage: { total: 5 } },
    ],
  }

  const out = _private.carryForwardTokenUsage(providers, cache)

  // claude was null + connected → carried forward (and compacted to modelBreakdowns/dailyBreakdown).
  assert.equal(out[0].tokenUsage.total, 12345)
  assert.deepEqual(out[0].tokenUsage.modelBreakdowns, [{ model: 'sonnet' }])
  assert.deepEqual(out[0].tokenUsage.dailyBreakdown, [{ date: '2026-05-30', total: 12345 }])
  // codex already had fresh tokenUsage → untouched.
  assert.equal(out[1].tokenUsage.total, 999)
  // kimi is disconnected → never carried, stays null.
  assert.equal(out[2].tokenUsage, null)
})

test('carryForwardTokenUsage leaves providers untouched when cache missing', () => {
  const providers = [{ id: 'claude', connected: true, tokenUsage: null }]
  assert.equal(_private.carryForwardTokenUsage(providers, null)[0].tokenUsage, null)
})

test('usage snapshot CLI renders overview and token burn from the last widget snapshot', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-usage-cli-'))
  const file = path.join(tmp, 'widget-snapshot.json')
  const snap = widgetSnapshot.buildWidgetSnapshot({
    generatedAt: Date.parse('2026-05-21T12:00:00Z'),
    cycle: { label: 'May cycle', daysLeft: 10, totalDays: 31 },
    totals: {
      totalValue: 400,
      spent: 120,
      left: 280,
      capturedPct: 30,
      planCount: 1,
      tokens: { total: 123, input: 100, cached: 10, output: 13, costUSD: 0.04, costProviderCount: 1, providerCount: 1 },
    },
    maxxTarget: { id: 'claude', name: 'Claude', reservePct: 70 },
    providers: [
      {
        id: 'claude',
        name: 'Claude',
        plan: 'Max',
        connected: true,
        capturedPct: 30,
        remainingPct: 70,
        spentValue: 60,
        leftValue: 140,
        sourceLabel: 'local Claude logs',
        windows: [{ label: 'Weekly', kind: '7d', usedPct: 30, resetAt: Date.parse('2026-05-22T12:00:00Z') }],
        tokenUsage: {
          total: 123,
          input: 100,
          cached: 10,
          output: 13,
          costUSD: 0.04,
          pricingSource: 'models.dev',
          pricingSources: ['models.dev'],
          source: 'local Claude logs',
          modelBreakdowns: [{ model: 'claude-opus-4-7', input: 80, cached: 10, output: 10, total: 100, costUSD: 0.03, pricingSource: 'models.dev', requests: 4 }],
          dailyBreakdown: [{ date: '2026-05-21', total: 123, costUSD: 0.04, requests: 4 }],
        },
      },
    ],
  })
  fs.writeFileSync(file, JSON.stringify(snap, null, 2))

  const stdout = []
  const stderr = []
  const io = {
    stdout: { write: (text) => stdout.push(text) },
    stderr: { write: (text) => stderr.push(text) },
  }

  try {
    assert.equal(usageSnapshotCli.run(['overview', '--file', file], io), 0)
    const overview = stdout.join('')
    assert.match(overview, /MaxxToken/)
    assert.match(overview, /May cycle/)
    assert.match(overview, /\$120/)
    assert.match(overview, /Token burn/)
    assert.match(overview, /Next maxx: Claude/)

    stdout.length = 0
    assert.equal(usageSnapshotCli.run(['tokens', '--file', file], io), 0)
    const tokenOutput = stdout.join('')
    assert.match(tokenOutput, /claude-opus-4-7/)
    assert.match(tokenOutput, /models\.dev pricing/)
    assert.match(tokenOutput, /2026-05-21/)

    stdout.length = 0
    assert.equal(usageSnapshotCli.run(['tokens', '--json', '--file', file], io), 0)
    const payload = JSON.parse(stdout.join(''))
    assert.equal(payload.totals.total, 123)
    assert.equal(payload.providers[0].tokenUsage.topModels[0].model, 'claude-opus-4-7')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('usage snapshot CLI explains missing snapshots', () => {
  const stdout = []
  const stderr = []
  const io = {
    stdout: { write: (text) => stdout.push(text) },
    stderr: { write: (text) => stderr.push(text) },
  }

  assert.equal(usageSnapshotCli.run(['overview', '--file', path.join(os.tmpdir(), 'maxxtoken-missing-snapshot.json')], io), 1)
  assert.equal(stdout.join(''), '')
  assert.match(stderr.join(''), /snapshot is missing/)
})

test('provider source labels prefer real token sources', () => {
  const providers = _private.addProviderSourceLabels([
    {
      id: 'claude',
      connected: true,
      valueLabel: 'live quota',
      valueAccuracy: 'live',
      tokenUsage: { input: 1, cached: 0, output: 2, total: 3, source: 'local Claude logs' },
    },
    {
      id: 'cursor',
      connected: true,
      valueLabel: 'live Cursor usage',
      valueAccuracy: 'live',
    },
    {
      id: 'manual',
      connected: true,
      valueLabel: 'configured monthly cap',
      valueAccuracy: 'estimate',
    },
  ])

  assert.equal(providers[0].sourceLabel, 'local Claude logs')
  assert.equal(providers[1].sourceLabel, 'live Cursor usage')
  assert.equal(providers[2].sourceLabel, 'estimated usage')
})

test('reset queue ranks upcoming windows before value disappears', () => {
  const now = Date.parse('2026-05-21T12:00:00Z')
  const queue = _private.resetQueueFromProviders([
    {
      id: 'claude',
      name: 'Claude',
      connected: true,
      leftValue: 160,
      windows: [
        {
          label: 'Weekly',
          kind: '7d',
          usedPct: 30,
          resetAt: now + 3 * 3600000,
          periodMs: 7 * 86400000,
          history: { missRiskPct: 80 },
        },
      ],
    },
    {
      id: 'codex',
      name: 'ChatGPT',
      connected: true,
      leftValue: 80,
      windows: [
        { label: 'Session', kind: '5h', usedPct: 10, resetAt: now + 45 * 60000, periodMs: 5 * 3600000 },
        { label: 'Done', kind: '5h', usedPct: 100, resetAt: now + 30 * 60000, periodMs: 5 * 3600000 },
      ],
    },
    {
      id: 'future',
      name: 'Future',
      connected: true,
      leftValue: 999,
      windows: [{ label: 'Monthly', kind: 'cycle', usedPct: 0, resetAt: now + 20 * 86400000, periodMs: 30 * 86400000 }],
    },
  ], now)

  assert.equal(queue.length, 2)
  assert.equal(queue[0].providerId, 'codex')
  assert.equal(queue[0].windowLabel, 'Session')
  assert.equal(queue[0].reservePct, 90)
  assert.equal(queue[0].valueLeft, 72)
  assert.equal(queue[0].urgent, true)
  assert.equal(queue[1].providerId, 'claude')
  assert.equal(queue[1].historyRiskPct, 80)
})

test('pace helper reports reserve when usage is behind elapsed window', () => {
  const now = Date.parse('2026-05-21T12:00:00Z')
  const pace = _private.paceForWindow({
    label: 'Weekly',
    kind: '7d',
    usedPct: 25,
    resetAt: now + 3.5 * 86400000,
    periodMs: 7 * 86400000,
  }, now)

  assert.equal(pace.stage, 'far-reserve')
  assert.equal(pace.leftLabel, '25% in reserve')
  assert.equal(pace.expectedUsedPercent, 50)
  assert.equal(pace.willLastToReset, true)
})

test('pace helper reports deficit and runout when usage is ahead of elapsed window', () => {
  const now = Date.parse('2026-05-21T12:00:00Z')
  const pace = _private.paceForWindow({
    label: 'Weekly',
    kind: '7d',
    usedPct: 80,
    resetAt: now + 3.5 * 86400000,
    periodMs: 7 * 86400000,
  }, now)

  assert.equal(pace.stage, 'far-deficit')
  assert.equal(pace.leftLabel, '30% in deficit')
  assert.equal(pace.expectedUsedPercent, 50)
  assert.equal(pace.willLastToReset, false)
  assert.equal(pace.exhaustsAt, now + 0.875 * 86400000)
})

test('pace helper stays quiet right after reset', () => {
  const now = Date.parse('2026-05-21T12:00:00Z')
  const pace = _private.paceForWindow({
    label: 'Weekly',
    kind: '7d',
    usedPct: 1,
    resetAt: now + 6.9 * 86400000,
    periodMs: 7 * 86400000,
  }, now)

  assert.equal(pace, null)
})

test('maxx target prioritizes high-value reserve before reset', () => {
  const now = Date.parse('2026-05-21T12:00:00Z')
  const target = _private.maxxTargetFromProviders([
    {
      id: 'kimi',
      name: 'Kimi',
      connected: true,
      capturedPct: 2,
      leftValue: 14.7,
      windows: [{ resetAt: now + 4 * 86400000 }],
      pace: { tone: 'reserve', deltaPercent: -43, leftLabel: '43% in reserve' },
    },
    {
      id: 'claude',
      name: 'Claude',
      connected: true,
      capturedPct: 16,
      leftValue: 168,
      windows: [{ resetAt: now + 3 * 86400000 }],
      pace: { tone: 'reserve', deltaPercent: -55, leftLabel: '55% in reserve' },
    },
    {
      id: 'grok',
      name: 'Grok',
      connected: true,
      capturedPct: 30,
      leftValue: 69.3,
      windows: [],
    },
  ], now)

  assert.equal(target.id, 'claude')
  assert.equal(target.reason, '55% in reserve')
  assert.equal(target.reservePct, 55)
})

test('maxx target skips providers with major or critical service incidents', () => {
  const now = Date.parse('2026-05-21T12:00:00Z')
  const target = _private.maxxTargetFromProviders([
    {
      id: 'claude',
      name: 'Claude',
      connected: true,
      capturedPct: 10,
      leftValue: 180,
      windows: [{ resetAt: now + 2 * 86400000 }],
      status: { indicator: 'major', label: 'Major outage' },
    },
    {
      id: 'codex',
      name: 'ChatGPT',
      connected: true,
      capturedPct: 40,
      leftValue: 120,
      windows: [{ resetAt: now + 2 * 86400000 }],
      status: { indicator: 'none', label: 'Operational' },
    },
  ], now)

  assert.equal(target.id, 'codex')
})

test('statuspage parser maps operational and degraded provider status', () => {
  const status = providerStatus.parseStatusPageStatus({
    page: { updated_at: '2026-05-21T12:00:00.000Z' },
    status: { indicator: 'minor', description: 'Partial degradation' },
  }, Date.parse('2026-05-21T12:05:00Z'))

  assert.equal(status.indicator, 'minor')
  assert.equal(status.label, 'Partial outage')
  assert.equal(status.description, 'Partial degradation')
  assert.equal(status.updatedAt, Date.parse('2026-05-21T12:00:00.000Z'))
})

test('google workspace parser finds active Gemini incidents', () => {
  const status = providerStatus.parseGoogleWorkspaceStatus([
    {
      begin: '2026-05-21T10:00:00Z',
      end: null,
      modified: '2026-05-21T12:00:00Z',
      externalDesc: '**Summary**\n- Gemini is degraded',
      statusImpact: 'SERVICE_DISRUPTION',
      severity: 'medium',
      affectedProducts: [{ id: 'npdyhgECDJ6tB66MxXyo', title: 'Gemini' }],
    },
  ], 'npdyhgECDJ6tB66MxXyo', Date.parse('2026-05-21T12:05:00Z'))

  assert.equal(status.indicator, 'major')
  assert.equal(status.label, 'Major outage')
  assert.equal(status.description, 'Gemini is degraded')
  assert.equal(status.updatedAt, Date.parse('2026-05-21T12:00:00Z'))
})

test('maxx alert candidate appears once for valuable capacity near reset', () => {
  const now = Date.parse('2026-05-21T12:00:00Z')
  const candidate = maxxAlerts.alertCandidateFromSnapshot({
    maxxTarget: {
      id: 'claude',
      name: 'Claude',
      reason: '55% in reserve',
      reservePct: 55,
      valueLeft: 168,
      resetAt: now + 3 * 3600000,
      historyRiskNote: '100% miss risk',
    },
    providers: [
      {
        id: 'claude',
        status: { indicator: 'none' },
        windows: [{ label: 'Weekly', resetAt: now + 3 * 3600000 }],
      },
    ],
  }, now)

  assert.equal(candidate.key, `claude:Weekly:${Math.round((now + 3 * 3600000) / 60000)}`)
  assert.equal(candidate.title, 'Maxx Claude before reset')
  assert.match(candidate.body, /55% in reserve/)
  assert.match(candidate.body, /\$168 left/)

  const first = maxxAlerts.shouldPostAlert(candidate, { sent: {} }, now)
  assert.equal(first.shouldPost, true)
  const second = maxxAlerts.shouldPostAlert(candidate, first.state, now + 60000)
  assert.equal(second.shouldPost, false)
})

test('maxx alert candidate ignores far resets and broken providers', () => {
  const now = Date.parse('2026-05-21T12:00:00Z')
  const base = {
    maxxTarget: {
      id: 'claude',
      name: 'Claude',
      reason: '55% in reserve',
      reservePct: 55,
      valueLeft: 168,
      resetAt: now + 3 * 86400000,
    },
    providers: [{ id: 'claude', status: { indicator: 'none' }, windows: [] }],
  }

  assert.equal(maxxAlerts.alertCandidateFromSnapshot(base, now), null)
  assert.equal(
    maxxAlerts.alertCandidateFromSnapshot({
      ...base,
      maxxTarget: { ...base.maxxTarget, resetAt: now + 3 * 3600000 },
      providers: [{ id: 'claude', status: { indicator: 'critical' }, windows: [] }],
    }, now),
    null,
  )
})

test('maxx alert candidate honors custom alert thresholds', () => {
  const now = Date.parse('2026-05-21T12:00:00Z')
  const snap = {
    maxxTarget: {
      id: 'claude',
      name: 'Claude',
      reason: '30% in reserve',
      reservePct: 30,
      resetAt: now + 12 * 3600000,
    },
    providers: [{ id: 'claude', status: { indicator: 'none' }, windows: [] }],
  }

  assert.equal(maxxAlerts.alertCandidateFromSnapshot(snap, now, { hoursBeforeReset: 6 }), null)
  assert.equal(maxxAlerts.alertCandidateFromSnapshot(snap, now, { hoursBeforeReset: 24 })?.providerId, 'claude')
  assert.equal(maxxAlerts.alertCandidateFromSnapshot(snap, now, { hoursBeforeReset: 24, minReservePct: 40 }), null)
})

test('maxx alert candidate honors provider-specific warning overrides', () => {
  const now = Date.parse('2026-05-21T12:00:00Z')
  const snap = {
    maxxTarget: {
      id: 'claude',
      name: 'Claude',
      reason: '20% in reserve',
      reservePct: 20,
      resetAt: now + 12 * 3600000,
    },
    providers: [{ id: 'claude', status: { indicator: 'none' }, windows: [] }],
  }

  assert.equal(maxxAlerts.alertCandidateFromSnapshot(snap, now, { hoursBeforeReset: 24 })?.providerId ?? null, null)
  assert.equal(
    maxxAlerts.alertCandidateFromSnapshot(snap, now, {
      hoursBeforeReset: 24,
      providers: { claude: { alertReservePct: 15 } },
    })?.providerId,
    'claude',
  )
  assert.equal(
    maxxAlerts.alertCandidateFromSnapshot(snap, now, {
      hoursBeforeReset: 24,
      providers: { claude: { alertsEnabled: false, alertReservePct: 15 } },
    }),
    null,
  )
})

test('quota notifications mirror CodexBar depleted and restored session transitions', () => {
  const state = quotaNotifications._private.emptyState()
  const configSnapshot = { sessionQuotaNotificationsEnabled: true }
  const provider = (usedPct) => ({
    providers: [
      {
        id: 'claude',
        name: 'Claude',
        connected: true,
        windows: [{ label: 'Session', kind: '5h', usedPct, resetAt: Date.now() + 3600000, periodMs: 5 * 3600000 }],
      },
    ],
  })

  let result = quotaNotifications.evaluateSnapshotWithState(provider(90), configSnapshot, state)
  assert.equal(result.events.length, 0)

  result = quotaNotifications.evaluateSnapshotWithState(provider(100), configSnapshot, result.state)
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].transition, 'depleted')
  assert.match(result.events[0].title, /Claude session depleted/)

  result = quotaNotifications.evaluateSnapshotWithState(provider(25), configSnapshot, result.state)
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].transition, 'restored')
  assert.match(result.events[0].body, /available again/)
})

test('quota notifications fire low quota thresholds once and clear when capacity returns', () => {
  const state = quotaNotifications._private.emptyState()
  const configSnapshot = {
    sessionQuotaNotificationsEnabled: false,
    quotaWarningNotificationsEnabled: true,
    quotaWarningSessionThresholds: [50, 20],
    quotaWarningWeeklyThresholds: [40, 10],
  }
  const snap = (sessionUsed, weeklyUsed) => ({
    providers: [
      {
        id: 'codex',
        name: 'ChatGPT',
        connected: true,
        windows: [
          { label: 'Session', kind: '5h', usedPct: sessionUsed, resetAt: Date.now() + 3600000, periodMs: 5 * 3600000 },
          { label: 'Weekly', kind: '7d', usedPct: weeklyUsed, resetAt: Date.now() + 86400000, periodMs: 7 * 86400000 },
        ],
      },
    ],
  })

  let result = quotaNotifications.evaluateSnapshotWithState(snap(45, 20), configSnapshot, state)
  assert.equal(result.events.length, 0)

  result = quotaNotifications.evaluateSnapshotWithState(snap(55, 20), configSnapshot, result.state)
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].type, 'quota-warning')
  assert.equal(result.events[0].windowKind, 'session')
  assert.equal(result.events[0].threshold, 50)

  result = quotaNotifications.evaluateSnapshotWithState(snap(70, 20), configSnapshot, result.state)
  assert.equal(result.events.length, 0)

  result = quotaNotifications.evaluateSnapshotWithState(snap(40, 20), configSnapshot, result.state)
  assert.equal(result.events.length, 0)

  result = quotaNotifications.evaluateSnapshotWithState(snap(55, 65), configSnapshot, result.state)
  assert.equal(result.events.length, 2)
  assert.deepEqual(result.events.map((event) => `${event.windowKind}:${event.threshold}`).sort(), ['session:50', 'weekly:40'])
})

test('quota warning markers map remaining thresholds onto used progress bars', () => {
  assert.deepEqual(quotaNotifications._private.warningMarkerPercents([50, 20], true), [50, 80])
  assert.deepEqual(quotaNotifications._private.warningMarkerPercents([0, 99, 20, 20], true), [1, 80])
  assert.deepEqual(quotaNotifications._private.warningMarkerPercents([50, 20], false), [50, 20])
})

test('usage history records one hourly sample per provider window', () => {
  const now = Date.parse('2026-05-21T12:10:00Z')
  const providers = [
    {
      id: 'claude',
      name: 'Claude',
      connected: true,
      windows: [
        { label: 'Weekly', kind: '7d', usedPct: 20, resetAt: now + 3 * 86400000, periodMs: 7 * 86400000 },
      ],
    },
  ]
  const first = usageHistory.samplesFromProviders(providers, now)
  const second = usageHistory.samplesFromProviders([
    {
      ...providers[0],
      windows: [{ ...providers[0].windows[0], usedPct: 25 }],
    },
  ], now + 20 * 60000)
  const merged = usageHistory.mergeSamples(first, second, now + 20 * 60000)

  assert.equal(merged.length, 1)
  assert.equal(merged[0].usedPct, 25)
})

test('usage history records hourly total value trend', () => {
  const now = Date.parse('2026-05-21T12:10:00Z')
  const first = usageHistory.totalRecordFromSnapshot({
    totalValue: 400,
    spent: 40,
    left: 360,
    capturedPct: 10,
    planCount: 2,
  }, now)
  const second = usageHistory.totalRecordFromSnapshot({
    totalValue: 400,
    spent: 80,
    left: 320,
    capturedPct: 20,
    planCount: 2,
  }, now + 3 * 3600000)
  const merged = usageHistory.mergeTotals([first], [second], now + 3 * 3600000)
  const trend = usageHistory.valueTrendSummary({ totals: merged }, now + 3 * 3600000)

  assert.equal(merged.length, 2)
  assert.equal(trend.direction, 'up')
  assert.equal(trend.deltaPct, 10)
  assert.equal(trend.deltaSpent, 40)
  assert.equal(trend.currentPct, 20)
  assert.equal(trend.providerCount, 2)
  assert.deepEqual(trend.points.map((point) => point.capturedPct), [10, 20])
  assert.equal(trend.points[1].spentValue, 80)
})

test('usage history records hourly token trend', () => {
  const now = Date.parse('2026-05-21T12:10:00Z')
  const first = usageHistory.tokenRecordFromTotals({
    input: 100,
    cached: 25,
    output: 10,
    total: 135,
    costUSD: 0.05,
    costProviderCount: 1,
    providerCount: 1,
    historyDays: 30,
  }, now)
  const second = usageHistory.tokenRecordFromTotals({
    input: 160,
    cached: 40,
    output: 20,
    total: 220,
    costUSD: 0.12,
    costProviderCount: 2,
    providerCount: 2,
    historyDays: 30,
  }, now + 2 * 3600000)
  const merged = usageHistory.mergeTokenTotals([first], [second], now + 2 * 3600000)
  const trend = usageHistory.tokenTrendSummary({ tokens: merged }, now + 2 * 3600000)

  assert.equal(merged.length, 2)
  assert.equal(trend.direction, 'up')
  assert.equal(trend.deltaTotal, 85)
  assert.equal(trend.deltaInput, 60)
  assert.equal(trend.deltaCached, 15)
  assert.equal(trend.deltaOutput, 10)
  assert.equal(trend.deltaCostUSD, 0.06999999999999999)
  assert.equal(trend.currentCostUSD, 0.12)
  assert.equal(trend.costProviderCount, 2)
  assert.equal(trend.currentTotal, 220)
  assert.equal(trend.providerCount, 2)
  assert.equal(trend.historyDays, 30)
  assert.deepEqual(trend.points.map((point) => point.total), [135, 220])
  assert.deepEqual(trend.points.map((point) => point.costUSD), [0.05, 0.12])
})

test('usage history exposes near-reset waste insight', () => {
  const resetAt = Date.parse('2026-05-20T12:00:00Z')
  const window = { label: 'Weekly', kind: '7d', resetAt: resetAt + 7 * 86400000, periodMs: 7 * 86400000 }
  const history = {
    samples: [
      { providerId: 'claude', providerName: 'Claude', windowLabel: 'Weekly', kind: '7d', periodMs: 7 * 86400000, resetAt, usedPct: 40, capturedAt: resetAt - 30 * 60000 },
      { providerId: 'claude', providerName: 'Claude', windowLabel: 'Weekly', kind: '7d', periodMs: 7 * 86400000, resetAt: resetAt - 7 * 86400000, usedPct: 60, capturedAt: resetAt - 7 * 86400000 - 45 * 60000 },
      { providerId: 'claude', providerName: 'Claude', windowLabel: 'Weekly', kind: '7d', periodMs: 7 * 86400000, resetAt, usedPct: 10, capturedAt: resetAt - 3 * 86400000 },
    ],
  }
  const insight = usageHistory.windowInsight(history, 'claude', window, resetAt + 60000)

  assert.equal(insight.averageUnusedPct, 50)
  assert.equal(insight.missRiskPct, 100)
  assert.equal(insight.riskLabel, '100% miss risk')
  assert.equal(insight.sampleCount, 2)
})

test('usage history attaches compact per-window series for expanded provider charts', () => {
  const now = Date.parse('2026-05-21T12:00:00Z')
  const resetAt = now + 3 * 86400000
  const window = { label: 'Weekly', kind: '7d', usedPct: 40, resetAt, periodMs: 7 * 86400000 }
  const history = {
    samples: [
      { providerId: 'claude', providerName: 'Claude', windowLabel: 'Weekly', kind: '7d', periodMs: 7 * 86400000, resetAt, usedPct: 20, capturedAt: now - 2 * 3600000 },
      { providerId: 'claude', providerName: 'Claude', windowLabel: 'Weekly', kind: '7d', periodMs: 7 * 86400000, resetAt, usedPct: 30, capturedAt: now - 3600000 },
      { providerId: 'claude', providerName: 'Claude', windowLabel: 'Weekly', kind: '7d', periodMs: 7 * 86400000, resetAt, usedPct: 40, capturedAt: now },
      { providerId: 'codex', providerName: 'ChatGPT', windowLabel: 'Weekly', kind: '7d', periodMs: 7 * 86400000, resetAt, usedPct: 99, capturedAt: now },
    ],
  }

  const series = usageHistory.windowSeries(history, 'claude', window, now)
  assert.deepEqual(series.map((point) => point.usedPct), [20, 30, 40])

  const providers = usageHistory.applyInsights([
    { id: 'claude', name: 'Claude', connected: true, windows: [window] },
  ], history, now)
  assert.deepEqual(providers[0].windows[0].historySeries.map((point) => point.usedPct), [20, 30, 40])
})

test('usage history summary surfaces worst recurring reset leak', () => {
  const now = Date.parse('2026-05-21T12:00:00Z')
  const history = {
    samples: [
      { providerId: 'claude', providerName: 'Claude', windowLabel: 'Weekly', kind: '7d', periodMs: 7 * 86400000, resetAt: now - 7 * 86400000, usedPct: 20, capturedAt: now - 7 * 86400000 - 20 * 60000 },
      { providerId: 'claude', providerName: 'Claude', windowLabel: 'Weekly', kind: '7d', periodMs: 7 * 86400000, resetAt: now - 14 * 86400000, usedPct: 40, capturedAt: now - 14 * 86400000 - 30 * 60000 },
      { providerId: 'codex', providerName: 'ChatGPT', windowLabel: 'Weekly', kind: '7d', periodMs: 7 * 86400000, resetAt: now - 7 * 86400000, usedPct: 80, capturedAt: now - 7 * 86400000 - 40 * 60000 },
      { providerId: 'claude', providerName: 'Claude', windowLabel: 'Weekly', kind: '7d', periodMs: 7 * 86400000, resetAt: now + 7 * 86400000, usedPct: 5, capturedAt: now },
    ],
  }

  const summary = usageHistory.historySummary(history, now)

  assert.equal(summary.sampleCount, 3)
  assert.equal(summary.providerCount, 2)
  assert.equal(summary.windowCount, 2)
  assert.equal(summary.averageUnusedPct, 53)
  assert.equal(summary.worst.providerId, 'claude')
  assert.equal(summary.worst.windowLabel, 'Weekly')
  assert.equal(summary.worst.averageUnusedPct, 70)
  assert.equal(summary.worst.missRiskPct, 100)
  assert.equal(summary.worst.sampleCount, 2)
})

test('usage history boosts maxx target when waste pattern is proven', () => {
  const now = Date.parse('2026-05-21T12:00:00Z')
  const target = _private.maxxTargetFromProviders([
    {
      id: 'codex',
      name: 'ChatGPT',
      connected: true,
      capturedPct: 20,
      leftValue: 100,
      windows: [{ resetAt: now + 3 * 86400000 }],
      pace: { tone: 'reserve', deltaPercent: -20, leftLabel: '20% in reserve' },
    },
    {
      id: 'claude',
      name: 'Claude',
      connected: true,
      capturedPct: 20,
      leftValue: 100,
      windows: [{ resetAt: now + 3 * 86400000 }],
      pace: { tone: 'reserve', deltaPercent: -20, leftLabel: '20% in reserve' },
      history: { averageUnusedPct: 70, missRiskPct: 100, sampleCount: 3, label: 'Usually leaves 70%', riskLabel: '100% miss risk' },
    },
  ], now)

  assert.equal(target.id, 'claude')
  assert.equal(target.historyNote, 'Usually leaves 70%')
  assert.equal(target.historicalWastePct, 70)
  assert.equal(target.historyRiskNote, '100% miss risk')
  assert.equal(target.historyRiskPct, 100)
})

test('storage footprint scanner totals top-level provider data and cleanup recommendations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-storage-'))
  const claudeRoot = path.join(root, '.claude')
  fs.mkdirSync(path.join(claudeRoot, 'projects', 'project-a'), { recursive: true })
  fs.mkdirSync(path.join(claudeRoot, 'file-history'), { recursive: true })
  fs.writeFileSync(path.join(claudeRoot, 'projects', 'project-a', 'session.jsonl'), '12345')
  fs.writeFileSync(path.join(claudeRoot, 'file-history', 'checkpoint'), '123')

  const footprint = storageFootprint.scanProvider('claude', [claudeRoot], Date.parse('2026-05-21T12:00:00Z'))

  assert.equal(footprint.totalBytes, 8)
  assert.equal(footprint.hasLocalData, true)
  assert.deepEqual(footprint.components.map((component) => component.name), ['projects', 'file-history'])
  assert.equal(footprint.recommendations[0].title, 'Manual cleanup: past sessions')
  assert.equal(footprint.recommendations[1].title, 'Manual cleanup: file checkpoints')
})

test('provider snapshots attach cached local footprints for known scanner roots', () => {
  storageFootprint._private.resetCacheForTesting()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-codex-home-'))
  fs.mkdirSync(path.join(root, 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(root, 'sessions', 'one.jsonl'), 'abcdef')
  const old = process.env.CODEX_HOME
  process.env.CODEX_HOME = root
  try {
    const providers = _private.addProviderStorageFootprints([
      { id: 'codex', name: 'Codex', connected: true, extra: [] },
      { id: 'cursor', name: 'Cursor', connected: true, extra: [] },
    ], Date.parse('2026-05-21T12:00:00Z'))

    assert.equal(providers[0].storageFootprint.totalBytes, 6)
    assert.equal(providers[0].extra[0].label, 'Local data')
    assert.equal(providers[0].extra[0].value, '6 B')
    assert.equal(providers[1].storageFootprint, undefined)
  } finally {
    if (old == null) delete process.env.CODEX_HOME
    else process.env.CODEX_HOME = old
    storageFootprint._private.resetCacheForTesting()
  }
})

test('codex token parser prefers last usage deltas over repeated totals', () => {
  const usage = codex._private.parseCodexTokenUsage(
    [
      JSON.stringify({
        type: 'turn_context',
        timestamp: '2026-05-21T12:00:00Z',
        payload: { model: 'openai/gpt-5-codex' },
      }),
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-05-21T12:01:00Z',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10 },
            last_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10 },
          },
        },
      }),
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-05-21T12:02:00Z',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 1000, cached_input_tokens: 900, output_tokens: 100 },
            last_token_usage: { input_tokens: 40, cached_input_tokens: 30, output_tokens: 5 },
          },
        },
      }),
    ].join('\n'),
  )

  assert.equal(usage.input, 140)
  assert.equal(usage.cached, 50)
  assert.equal(usage.output, 15)
  assert.equal(usage.total, 205)
  assert.equal(usage.modelBreakdowns[0].model, 'gpt-5-codex')
  assert.equal(usage.modelBreakdowns[0].uncachedInput, 90)
  assert.equal(usage.dailyBreakdown[0].date, '2026-05-21')
  assert.equal(usage.dailyBreakdown[0].modelBreakdowns[0].model, 'gpt-5-codex')
})

test('codex token parser matches CodexBar gpt-5 fallback for model-less token events', () => {
  const usage = codex._private.parseCodexTokenUsage(
    JSON.stringify({
      type: 'event_msg',
      timestamp: '2026-05-21T12:01:00Z',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: { input_tokens: 100, cached_input_tokens: 90, output_tokens: 10 },
        },
      },
    }),
  )

  assert.equal(usage.modelBreakdowns[0].model, 'gpt-5')
  assert.equal(tokenCost.withTokenCost('codex', usage).costUSD, 0.00012375)
})

test('codex priority trace parser maps priority turns and completed models', () => {
  const request = codex._private.parseCodexPriorityTraceRow(
    'thread_id=thread-a turn.id=turn-a websocket request: ' +
      JSON.stringify({ type: 'response.create', service_tier: 'priority', model: 'openai/gpt-5.1-codex' }),
    '1779393449',
  )
  const completed = codex._private.parseCodexCompletedTraceRow(
    'turn_id=turn-a websocket event: ' +
      JSON.stringify({ type: 'response.completed', response: { model: 'openai/gpt-5.1-codex-mini' } }),
  )

  assert.deepEqual(request, {
    turnID: 'turn-a',
    threadID: 'thread-a',
    model: 'gpt-5.1-codex',
    timestamp: '1779393449',
  })
  assert.deepEqual(completed, { turnID: 'turn-a', model: 'gpt-5.1-codex-mini' })
})

test('codex token parser joins CodexBar priority metadata onto token counts', () => {
  const usage = codex._private.parseCodexTokenUsage(
    [
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-05-21T12:00:00Z',
        payload: { type: 'task_started', turn_id: 'turn-priority' },
      }),
      JSON.stringify({
        type: 'turn_context',
        timestamp: '2026-05-21T12:00:01Z',
        payload: { turn_id: 'turn-priority', model: 'gpt-5' },
      }),
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-05-21T12:01:00Z',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: { input_tokens: 100, cached_input_tokens: 10, output_tokens: 20 },
          },
        },
      }),
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-05-21T12:02:00Z',
        payload: { type: 'task_started', turn_id: 'turn-standard' },
      }),
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-05-21T12:03:00Z',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: { input_tokens: 50, cached_input_tokens: 5, output_tokens: 10 },
          },
        },
      }),
    ].join('\n'),
    {
      priorityTurns: {
        'turn-priority': { turnID: 'turn-priority', model: 'gpt-5.1-codex', timestamp: '1779393449' },
      },
    },
  )

  assert.equal(usage.priorityEvents, 1)
  assert.equal(usage.priorityTurnCount, 1)
  assert.equal(usage.serviceTierBreakdowns.find((row) => row.serviceTier === 'priority').total, 130)
  assert.equal(usage.serviceTierBreakdowns.find((row) => row.serviceTier === 'standard').total, 65)
  assert.equal(usage.modelBreakdowns[0].model, 'gpt-5.1-codex')
})

test('codex local token scanner aggregates multiple session files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-codex-sessions-'))
  const stamp = new Date().toISOString()
  const first = path.join(tmp, 'rollout-a.jsonl')
  const second = path.join(tmp, 'rollout-b.jsonl')
  fs.writeFileSync(first, [
    JSON.stringify({ type: 'turn_context', timestamp: stamp, payload: { model: 'openai/gpt-5-codex' } }),
    JSON.stringify({
      type: 'event_msg',
      timestamp: stamp,
      payload: {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 1 } },
      },
    }),
  ].join('\n'))
  fs.writeFileSync(second, [
    JSON.stringify({ type: 'turn_context', timestamp: stamp, payload: { model: 'gpt-5-mini' } }),
    JSON.stringify({
      type: 'event_msg',
      timestamp: stamp,
      payload: {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: 20, cached_input_tokens: 3, output_tokens: 4 } },
      },
    }),
  ].join('\n'))

  try {
    const usage = codex._private.readTokenUsage([first, second], {
      tokenHistoryDays: 30,
      priorityTurns: {},
      inheritedTotalsResolver: () => null,
    })

    assert.equal(usage.filesScanned, 2)
    assert.equal(usage.source, 'local Codex sessions')
    assert.equal(usage.input, 30)
    assert.equal(usage.cached, 5)
    assert.equal(usage.output, 5)
    assert.equal(usage.total, 40)
    assert.deepEqual(usage.modelBreakdowns.map((row) => row.model).sort(), ['gpt-5-codex', 'gpt-5-mini'])
    assert.equal(usage.dailyBreakdown[0].total, 40)
    assert.equal(usage.dailyBreakdown[0].modelBreakdowns.length, 2)

    usage.total = 1
    const cached = codex._private.readTokenUsage([first, second], {
      tokenHistoryDays: 30,
      priorityTurns: {},
      inheritedTotalsResolver: () => null,
    })
    assert.equal(cached.total, 40)
  } finally {
    codex._private.resetTokenScanCacheForTesting()
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('codex local token scanner dedupes duplicate session ids', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-codex-sessions-'))
  const stamp = new Date().toISOString()
  const first = path.join(tmp, 'rollout-a.jsonl')
  const duplicate = path.join(tmp, 'rollout-b.jsonl')
  const unique = path.join(tmp, 'rollout-c.jsonl')
  const tokenEvent = (input) => JSON.stringify({
    type: 'event_msg',
    timestamp: stamp,
    payload: {
      type: 'token_count',
      info: { last_token_usage: { input_tokens: input, cached_input_tokens: 0, output_tokens: 1 } },
    },
  })
  fs.writeFileSync(first, [
    JSON.stringify({ type: 'session_meta', payload: { session_id: 'session-a' } }),
    tokenEvent(10),
  ].join('\n'))
  fs.writeFileSync(duplicate, [
    JSON.stringify({ type: 'session_meta', payload: { session_id: 'session-a' } }),
    tokenEvent(99),
  ].join('\n'))
  fs.writeFileSync(unique, [
    JSON.stringify({ type: 'session_meta', payload: { session_id: 'session-b' } }),
    tokenEvent(20),
  ].join('\n'))

  try {
    const usage = codex._private.readTokenUsage([first, duplicate, unique], {
      tokenHistoryDays: 30,
      priorityTurns: {},
      inheritedTotalsResolver: () => null,
    })

    assert.equal(usage.filesScanned, 2)
    assert.equal(usage.sessionsScanned, 2)
    assert.equal(usage.input, 30)
    assert.equal(usage.output, 2)
    assert.equal(usage.total, 32)
  } finally {
    codex._private.resetTokenScanCacheForTesting()
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('codex token parser treats forked total-only snapshots as inherited baseline', () => {
  const usage = codex._private.parseCodexTokenUsage(
    [
      JSON.stringify({
        type: 'session_meta',
        payload: { session_id: 'child-session', forked_from_id: 'parent-session' },
      }),
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-05-21T12:01:00Z',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 100, cached_input_tokens: 10, output_tokens: 5 },
          },
        },
      }),
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-05-21T12:02:00Z',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 150, cached_input_tokens: 20, output_tokens: 8 },
          },
        },
      }),
    ].join('\n'),
  )

  assert.equal(usage.sessionId, 'child-session')
  assert.equal(usage.forkedFromId, 'parent-session')
  assert.equal(usage.input, 50)
  assert.equal(usage.cached, 10)
  assert.equal(usage.output, 3)
  assert.equal(usage.total, 63)
})

test('codex token parser subtracts inherited parent totals for forked sessions', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-codex-fork-'))
  const parent = path.join(tmp, 'rollout-parent.jsonl')
  const child = path.join(tmp, 'rollout-child.jsonl')
  fs.writeFileSync(parent, [
    JSON.stringify({ type: 'session_meta', timestamp: '2026-05-21T12:00:00Z', payload: { id: 'parent-session' } }),
    JSON.stringify({
      type: 'event_msg',
      timestamp: '2026-05-21T12:10:00Z',
      payload: {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: 100, cached_input_tokens: 10, output_tokens: 5 } },
      },
    }),
  ].join('\n'))
  fs.writeFileSync(child, [
    JSON.stringify({
      type: 'session_meta',
      timestamp: '2026-05-21T12:30:00Z',
      payload: { id: 'child-session', forked_from_id: 'parent-session', timestamp: '2026-05-21T12:30:00Z' },
    }),
    JSON.stringify({
      type: 'event_msg',
      timestamp: '2026-05-21T12:31:00Z',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: 100, cached_input_tokens: 10, output_tokens: 5 },
        },
      },
    }),
    JSON.stringify({
      type: 'event_msg',
      timestamp: '2026-05-21T12:32:00Z',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: 130, cached_input_tokens: 15, output_tokens: 7 },
        },
      },
    }),
  ].join('\n'))

  try {
    const resolver = codex._private.makeInheritedTotalsResolver([parent, child], { includeAll: false })
    const usage = codex._private.parseCodexTokenUsage(fs.readFileSync(child, 'utf8'), {
      inheritedTotalsResolver: resolver,
    })

    assert.equal(usage.sessionId, 'child-session')
    assert.equal(usage.forkedFromId, 'parent-session')
    assert.equal(usage.input, 30)
    assert.equal(usage.cached, 5)
    assert.equal(usage.output, 2)
    assert.equal(usage.total, 37)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('claude local token scanner dedupes streaming chunks and excludes vertex logs', () => {
  const now = Date.parse('2026-05-21T17:00:00-07:00')
  const rows = [
    {
      type: 'assistant',
      timestamp: new Date(now).toISOString(),
      requestId: 'req-1',
      message: {
        id: 'msg-1',
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 },
      },
    },
    {
      type: 'assistant',
      timestamp: new Date(now).toISOString(),
      requestId: 'req-1',
      message: {
        id: 'msg-1',
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 12, cache_creation_input_tokens: 3, cache_read_input_tokens: 4, output_tokens: 5 },
      },
    },
    {
      type: 'assistant',
      timestamp: new Date(now).toISOString(),
      requestId: 'req_vrtx_2',
      message: {
        id: 'msg_vrtx_2',
        model: 'claude-sonnet-4@20250514',
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    },
  ]
  const tmp = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'claude-token-test-'))
  const file = require('node:path').join(tmp, 'session.jsonl')
  require('node:fs').writeFileSync(file, rows.map((row) => JSON.stringify(row)).join('\n'))
  try {
    const usage = claude._private.scanClaudeTokenUsage([file], now)
    assert.equal(usage.input, 15)
    assert.equal(usage.uncachedInput, 12)
    assert.equal(usage.cacheCreation, 3)
    assert.equal(usage.cacheRead, 4)
    assert.equal(usage.cached, 4)
    assert.equal(usage.output, 5)
    assert.equal(usage.total, 24)
    assert.equal(usage.requests, 1)
    assert.equal(usage.historyDays, 30)
    assert.equal(usage.historyTotal, 24)
    assert.equal(usage.last30DaysTotal, 24)
    assert.deepEqual(usage.modelNames, ['claude-sonnet-4-20250514'])
    assert.deepEqual(usage.modelBreakdowns, [
      {
        model: 'claude-sonnet-4-20250514',
        input: 15,
        uncachedInput: 12,
        cacheCreation: 3,
        cacheRead: 4,
        cached: 4,
        output: 5,
        total: 24,
        requests: 1,
      },
    ])
    assert.equal(usage.dailyBreakdown.length, 1)
    assert.equal(usage.dailyBreakdown[0].date, '2026-05-21')
    assert.equal(usage.dailyBreakdown[0].total, 24)
    assert.equal(usage.dailyBreakdown[0].modelBreakdowns[0].model, 'claude-sonnet-4-20250514')
  } finally {
    require('node:fs').rmSync(tmp, { recursive: true, force: true })
  }
})

test('claude local token scanner honors configured history window', () => {
  const now = Date.parse('2026-05-21T17:00:00-07:00')
  const recent = {
    type: 'assistant',
    timestamp: new Date(now - 2 * 86400000).toISOString(),
    requestId: 'recent',
    message: {
      id: 'recent',
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 },
    },
  }
  const old = {
    type: 'assistant',
    timestamp: new Date(now - 20 * 86400000).toISOString(),
    requestId: 'old',
    message: {
      id: 'old',
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 },
    },
  }
  const tmp = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'claude-token-window-'))
  const file = require('node:path').join(tmp, 'session.jsonl')
  require('node:fs').writeFileSync(file, [recent, old].map((row) => JSON.stringify(row)).join('\n'))
  try {
    const usage = claude._private.scanClaudeTokenUsage([file], now, 7)
    assert.equal(usage.total, 11)
    assert.equal(usage.historyDays, 7)
    assert.equal(usage.historyTotal, 11)
    assert.equal(usage.last30DaysTotal, null)
    assert.equal(usage.period, '7d')
  } finally {
    require('node:fs').rmSync(tmp, { recursive: true, force: true })
  }
})

test('claude local token scanner dedupes matching rows across files and prefers parent logs', () => {
  const now = Date.parse('2026-05-21T17:00:00-07:00')
  const base = {
    type: 'assistant',
    timestamp: new Date(now).toISOString(),
    requestId: 'req-cross-file',
    message: {
      id: 'msg-cross-file',
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 10, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 4 },
    },
  }
  const subagent = {
    ...base,
    isSidechain: true,
    message: {
      ...base.message,
      usage: { input_tokens: 20, cache_creation_input_tokens: 3, cache_read_input_tokens: 4, output_tokens: 5 },
    },
  }
  const tmp = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'claude-token-cross-file-'))
  const parentFile = require('node:path').join(tmp, 'parent.jsonl')
  const subagentDir = require('node:path').join(tmp, 'subagents')
  const subagentFile = require('node:path').join(subagentDir, 'child.jsonl')
  require('node:fs').mkdirSync(subagentDir)
  require('node:fs').writeFileSync(parentFile, JSON.stringify(base))
  require('node:fs').writeFileSync(subagentFile, JSON.stringify(subagent))
  try {
    const usage = claude._private.scanClaudeTokenUsage([parentFile, subagentFile], now)
    assert.equal(usage.input, 12)
    assert.equal(usage.cached, 3)
    assert.equal(usage.output, 4)
    assert.equal(usage.total, 19)
    assert.equal(usage.requests, 1)
  } finally {
    require('node:fs').rmSync(tmp, { recursive: true, force: true })
  }
})

test('cursor usage summary maps cents and plan percentages', () => {
  const usage = cursor._private.parseUsageSummary(
    {
      billingCycleEnd: '2026-06-01T00:00:00.000Z',
      membershipType: 'pro',
      individualUsage: {
        plan: {
          used: 525,
          limit: 2000,
          autoPercentUsed: 20,
          apiPercentUsed: 30,
          totalPercentUsed: 26.25,
        },
        onDemand: {
          used: 120,
          limit: 5000,
        },
      },
    },
    { email: 'test@example.com', name: 'Test User' },
  )

  assert.equal(usage.plan, 'Pro')
  assert.equal(usage.planUsedUSD, 5.25)
  assert.equal(usage.planLimitUSD, 20)
  assert.equal(usage.onDemandUsedUSD, 1.2)
  assert.equal(usage.onDemandLimitUSD, 50)
  assert.equal(usage.planPercentUsed, 26.25)
  assert.equal(usage.autoPercentUsed, 20)
  assert.equal(usage.apiPercentUsed, 30)
  assert.equal(usage.email, 'test@example.com')
})

test('cursor dashboard usage maps app auth current-period data', () => {
  const usage = cursor._private.parseDashboardUsage(
    {
      billingCycleEnd: '1782156872000',
      planUsage: {
        totalSpend: 142,
        includedSpend: 142,
        limit: 7000,
        autoPercentUsed: 2.1,
        apiPercentUsed: 0,
        totalPercentUsed: 2.03,
      },
      spendLimitUsage: {
        individualUsed: 25,
        individualLimit: 20000,
      },
    },
    {
      planInfo: {
        planName: 'Pro+',
        includedAmountCents: 7000,
        price: '$60/mo',
        billingCycleEnd: '1782156872000',
      },
    },
    { email: 'test@example.com', firstName: 'Test', lastName: 'User' },
    { sourceLabel: 'Cursor app auth' },
  )

  assert.equal(usage.plan, 'Pro+')
  assert.equal(usage.planUsedUSD, 1.42)
  assert.equal(usage.planLimitUSD, 70)
  assert.equal(usage.monthlyPriceUSD, 60)
  assert.equal(usage.planPercentUsed, 2.03)
  assert.equal(usage.autoPercentUsed, 2.1)
  assert.equal(usage.apiPercentUsed, 0)
  assert.equal(usage.onDemandUsedUSD, 0.25)
  assert.equal(usage.onDemandLimitUSD, 200)
  assert.equal(usage.email, 'test@example.com')
  assert.equal(usage.name, 'Test User')
  assert.equal(usage.sourceLabel, 'Cursor app auth')
})

test('cursor app auth importer reads Cursor global storage without exposing tokens', () => {
  try {
    require('node:child_process').execFileSync('/bin/zsh', ['-lc', 'command -v sqlite3'], { stdio: 'ignore' })
  } catch {
    return
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-cursor-state-'))
  const db = path.join(tmp, 'state.vscdb')
  try {
    require('node:child_process').execFileSync('sqlite3', [
      db,
      [
        'create table ItemTable(key text primary key, value text);',
        "insert into ItemTable values('cursorAuth/accessToken','jwt-token');",
        "insert into ItemTable values('cursorAuth/refreshToken','refresh-token');",
        "insert into ItemTable values('cursorAuth/stripeMembershipType','pro_plus');",
        "insert into ItemTable values('cursorAuth/stripeSubscriptionStatus','active');",
        "insert into ItemTable values('cursorAuth/cachedEmail','test@example.com');",
      ].join(' '),
    ])

    const auth = cursor._private.appAuthFromState({ stateDB: db, dashboardBase: 'https://api2.cursor.test' })

    assert.equal(auth.accessToken, 'jwt-token')
    assert.equal(auth.refreshToken, 'refresh-token')
    assert.equal(auth.membershipType, 'pro_plus')
    assert.equal(auth.subscriptionStatus, 'active')
    assert.equal(auth.email, 'test@example.com')
    assert.equal(auth.dashboardBase, 'https://api2.cursor.test')
    assert.equal(auth.sourceLabel, 'Cursor app auth')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('cursor cookie header accepts copied Cookie prefix', () => {
  assert.equal(
    cursor._private.cookieHeader('Cookie: WorkosCursorSessionToken=abc; other=123'),
    'WorkosCursorSessionToken=abc; other=123',
  )
})

test('cursor browser importer reads CodexBar session cookies from Cursor app profiles', () => {
  try {
    require('node:child_process').execFileSync('/bin/zsh', ['-lc', 'command -v sqlite3'], { stdio: 'ignore' })
  } catch {
    return
  }
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-cursor-browser-'))
  const cookieDB = path.join(home, 'Library', 'Application Support', 'Cursor', 'Default', 'Network', 'Cookies')
  try {
    fs.mkdirSync(path.dirname(cookieDB), { recursive: true })
    require('node:child_process').execFileSync('sqlite3', [
      cookieDB,
      [
        'create table cookies(host_key text, path text, name text, value text);',
        "insert into cookies values('.cursor.com','/','WorkosCursorSessionToken','cursor-session');",
        "insert into cookies values('.cursor.com','/','other','ok');",
      ].join(' '),
    ])

    const files = cursor._private.browserCookieFiles(home)
    const sessions = cursor._private.cookieRecordsFromFiles(files)

    assert.equal(files.length, 1)
    assert.equal(sessions[0].sourceLabel, 'Cursor App Default')
    assert.match(sessions[0].cookieHeader, /WorkosCursorSessionToken=cursor-session/)
    assert.match(sessions[0].cookieHeader, /other=ok/)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('openai admin usage aggregates spend and tokens', () => {
  const usage = openai._private.parseAdminUsage(
    {
      data: [
        {
          start_time: 1779235200,
          results: [
            { amount: { value: '1.50' }, line_item: 'Responses API' },
            { amount: { value: 0.25 }, line_item: 'Images' },
          ],
        },
      ],
    },
    {
      data: [
        {
          start_time: 1779235200,
          results: [
            {
              input_tokens: 100,
              input_cached_tokens: 20,
              output_tokens: 50,
              num_model_requests: 2,
              model: 'gpt-5.1',
            },
            {
              input_tokens: 10,
              output_tokens: 5,
              num_model_requests: 1,
              model: 'gpt-5.1',
            },
          ],
        },
      ],
    },
    new Date('2026-05-21T00:00:00Z'),
  )

  assert.equal(usage.source, 'admin-api')
  assert.equal(usage.spent, 1.75)
  assert.equal(usage.tokens.input, 110)
  assert.equal(usage.tokens.cached, 20)
  assert.equal(usage.tokens.output, 55)
  assert.equal(usage.tokens.total, 165)
  assert.equal(usage.tokens.requests, 3)
  assert.deepEqual(usage.tokens.modelBreakdowns, [
    { model: 'gpt-5.1', input: 110, cached: 20, output: 55, total: 165, requests: 3 },
  ])
  assert.deepEqual(usage.tokens.dailyBreakdown, [
    {
      date: '2026-05-20',
      input: 110,
      cached: 20,
      output: 55,
      total: 165,
      requests: 3,
      costUSD: 1.75,
      modelBreakdowns: [{ model: 'gpt-5.1', input: 110, cached: 20, output: 55, total: 165, requests: 3 }],
    },
  ])
  assert.equal(usage.topModel.model, 'gpt-5.1')
  assert.equal(usage.topLineItem.name, 'Responses API')
})

test('openai credit balance maps legacy billing credits', () => {
  const usage = openai._private.parseCreditBalance(
    {
      total_granted: 20,
      total_used: 7.5,
      total_available: 12.5,
      grants: {
        data: [{ expires_at: 1780272000 }],
      },
    },
    new Date('2026-05-21T00:00:00Z'),
  )

  assert.equal(usage.source, 'billing-api')
  assert.equal(usage.granted, 20)
  assert.equal(usage.spent, 7.5)
  assert.equal(usage.available, 12.5)
  assert.equal(usage.resetAt, 1780272000 * 1000)
})

test('azure openai config parser trims saved json and normalizes endpoint', () => {
  const saved = azureopenai._private.parseSavedConfig(
    `{"apiKey":" azure-key ","endpoint":"example-resource.openai.azure.com","deploymentName":" chat-prod "}`,
  )

  assert.equal(saved.apiKey, 'azure-key')
  assert.equal(saved.endpoint, 'example-resource.openai.azure.com')
  assert.equal(saved.deploymentName, 'chat-prod')
  assert.equal(azureopenai._private.endpointURL(saved.endpoint).toString(), 'https://example-resource.openai.azure.com/')
})

test('azure openai URL preserves endpoint path and deployment escaping', () => {
  const url = azureopenai._private.chatCompletionsURL(
    new URL('https://proxy.example.com/base'),
    'chat prod',
    '2024-10-21',
  )

  assert.equal(
    url.toString(),
    'https://proxy.example.com/base/openai/deployments/chat%20prod/chat/completions?api-version=2024-10-21',
  )
})

test('azure openai v1 URL uses model field and openai-compatible path', () => {
  const url = azureopenai._private.chatCompletionsURL(
    new URL('https://example-resource.openai.azure.com/openai/v1'),
    'chat-prod',
    'v1',
  )
  const body = azureopenai._private.validationBody('chat-prod', 'v1')

  assert.equal(url.toString(), 'https://example-resource.openai.azure.com/openai/v1/chat/completions')
  assert.equal(body.model, 'chat-prod')
  assert.equal(body.max_completion_tokens, 1)
  assert.equal(body.max_tokens, undefined)
})

test('copilot usage parses direct quota snapshots', () => {
  const usage = copilot._private.parseUsage({
    copilot_plan: 'pro',
    quota_reset_date: '2026-06-01T00:00:00Z',
    quota_snapshots: {
      premium_interactions: {
        entitlement: 300,
        remaining: 225,
        percent_remaining: 75,
        quota_id: 'premium_interactions',
      },
      chat: {
        entitlement: 1000,
        remaining: 400,
        percent_remaining: 40,
        quota_id: 'chat',
      },
    },
  })

  assert.equal(usage.plan, 'Copilot Pro')
  assert.equal(usage.premium.usedPct, 25)
  assert.equal(usage.premium.entitlement, 300)
  assert.equal(usage.premium.remaining, 225)
  assert.equal(usage.chat.usedPct, 60)
  assert.equal(usage.resetAt, Date.parse('2026-06-01T00:00:00Z'))
})

test('copilot usage falls back to monthly quota counts', () => {
  const usage = copilot._private.parseUsage({
    copilot_plan: 'business',
    monthly_quotas: {
      completions: 500,
      chat: 1000,
    },
    limited_user_quotas: {
      completions: 125,
      chat: 750,
    },
  })

  assert.equal(usage.plan, 'Copilot Business')
  assert.equal(usage.premium.usedPct, 75)
  assert.equal(usage.chat.usedPct, 25)
})

test('copilot auth normalizes enterprise hosts', () => {
  assert.equal(copilotAuth._private.normalizeHost('https://octo.ghe.com/login/device'), 'octo.ghe.com')
  assert.equal(copilotAuth._private.normalizeHost('api.github.com'), 'api.github.com')
  assert.equal(copilotAuth._private.requestURL('github.com', '/login/device/code'), 'https://github.com/login/device/code')
})

test('groq prometheus parser sums scalar series', () => {
  const value = groq._private.parseScalar({
    status: 'success',
    data: {
      result: [{ value: [1710000000, '2.5'] }, { value: [1710000000, '1.5'] }],
    },
  })

  assert.equal(value, 4)
})

test('groq snapshot maps rates to minute labels', () => {
  const usage = groq._private.parseSnapshot(
    {
      requests: 2,
      inputTokens: 100,
      outputTokens: 50,
      cacheHits: 3,
    },
    Date.parse('2026-05-21T00:00:00.000Z'),
  )

  assert.equal(usage.requestsPerMinute, 120)
  assert.equal(usage.tokensPerMinute, 9000)
  assert.equal(usage.cacheHitsPerMinute, 180)
  assert.equal(usage.requestLabel, '120 req/min')
  assert.equal(usage.tokenLabel, '9000 tok/min')
  assert.equal(usage.cacheLabel, '180 cache/min')
})

test('groq metrics URL uses configured API base', () => {
  const url = groq._private.metricsURL('sum(rate)', new URL('https://api.groq.com/v1'))

  assert.equal(url.toString(), 'https://api.groq.com/v1/metrics/prometheus/api/v1/query?query=sum%28rate%29')
})

test('mistral cookie parser requires ory session and extracts csrf', () => {
  const cookie = mistral._private.normalizeCookie('Cookie: foo=bar; ory_session_test=abc; csrftoken=csrf')

  assert.equal(cookie, 'foo=bar; ory_session_test=abc; csrftoken=csrf')
  assert.equal(mistral._private.csrfToken(cookie), 'csrf')
  assert.equal(mistral._private.normalizeCookie('foo=bar; csrftoken=csrf'), null)
})

test('mistral billing parser aggregates spend tokens and daily models', () => {
  const usage = mistral._private.parseResponse({
    completion: {
      models: {
        'mistral-large-latest::mistral-large-2411': {
          input: [
            {
              billing_metric: 'mistral-large-2411',
              billing_display_name: 'mistral-large-latest',
              billing_group: 'input',
              timestamp: '2026-05-14',
              value: 1000,
              value_paid: 1000,
            },
          ],
          output: [
            {
              billing_metric: 'mistral-large-2411',
              billing_display_name: 'mistral-large-latest',
              billing_group: 'output',
              timestamp: '2026-05-14',
              value: 100,
              value_paid: 100,
            },
          ],
        },
      },
    },
    libraries_api: {
      pages: {
        models: {
          'mistral-ocr-latest': {
            input: [
              {
                billing_metric: 'pages',
                billing_display_name: 'OCR pages',
                billing_group: 'input',
                timestamp: '2026-05-15',
                value: 4,
                value_paid: 4,
              },
            ],
          },
        },
      },
    },
    currency: 'EUR',
    currency_symbol: '€',
    start_date: '2026-05-01T00:00:00Z',
    end_date: '2026-05-31T23:59:59.999Z',
    prices: [
      { billing_metric: 'mistral-large-2411', billing_group: 'input', price: '0.0000017' },
      { billing_metric: 'mistral-large-2411', billing_group: 'output', price: '0.0000051' },
      { billing_metric: 'pages', billing_group: 'input', price: '0.01' },
    ],
  })

  assert.equal(usage.totalInputTokens, 1000)
  assert.equal(usage.totalOutputTokens, 100)
  assert.equal(usage.totalTokens, 1100)
  assert.equal(usage.modelCount, 1)
  assert.equal(usage.currencySymbol, '€')
  assert.equal(usage.daily[0].day, '2026-05-14')
  assert.equal(usage.daily[0].models[0].name, 'mistral-large-latest')
  assert.ok(Math.abs(usage.totalCost - (1000 * 0.0000017 + 100 * 0.0000051 + 4 * 0.01)) < 0.0001)
})

test('deepgram saved config accepts json and pipe formats', () => {
  assert.deepEqual(deepgram._private.parseSavedConfig('{"apiKey":" dg-test ","projectID":" project-123 "}'), {
    apiKey: 'dg-test',
    projectID: 'project-123',
  })
  assert.deepEqual(deepgram._private.parseSavedConfig('dg-test|project-123'), {
    apiKey: 'dg-test',
    projectID: 'project-123',
  })
})

test('deepgram usage parser sums breakdown metrics', () => {
  const usage = deepgram._private.parseUsage(
    {
      start: '2025-01-16',
      end: '2025-01-23',
      results: [
        {
          hours: 1619.7242069444444,
          total_hours: 1621.7395791666668,
          agent_hours: 41.33564388888889,
          tokens_in: 1200,
          tokens_out: 340,
          tts_characters: 9158866,
          requests: 373381,
        },
        {
          hours: 2.25,
          total_hours: 3.5,
          requests: 19,
        },
      ],
    },
    { projectID: 'project-123', name: 'Speech Lab' },
    Date.parse('2026-05-21T00:00:00.000Z'),
  )

  assert.equal(usage.projectID, 'project-123')
  assert.equal(usage.projectName, 'Speech Lab')
  assert.equal(usage.requests, 373400)
  assert.equal(usage.hours, 1621.9742069444444)
  assert.equal(usage.totalHours, 1625.2395791666668)
  assert.equal(usage.agentHours, 41.33564388888889)
  assert.equal(usage.tokensIn, 1200)
  assert.equal(usage.tokensOut, 340)
  assert.equal(usage.totalTokens, 1540)
  assert.equal(usage.ttsCharacters, 9158866)
})

test('deepgram aggregate combines projects and display lines', () => {
  const first = deepgram._private.parseUsage(
    { start: '2025-01-16', end: '2025-01-23', results: [{ hours: 1, total_hours: 2, requests: 3 }] },
    { projectID: 'project-a', name: 'Alpha' },
  )
  const second = deepgram._private.parseUsage(
    {
      start: '2025-01-17',
      end: '2025-01-24',
      results: [{ hours: 4, total_hours: 5, tokens_in: 10, tokens_out: 5, tts_characters: 40, requests: 6 }],
    },
    { projectID: 'project-b', name: 'Beta' },
  )

  const usage = deepgram._private.aggregateSnapshots([first, second], Date.parse('2026-05-21T00:00:00.000Z'))

  assert.equal(usage.projectID, 'all')
  assert.equal(usage.projectCount, 2)
  assert.equal(usage.requests, 9)
  assert.equal(usage.hours, 5)
  assert.equal(usage.totalHours, 7)
  assert.equal(usage.totalTokens, 15)
  assert.deepEqual(deepgram._private.displayLines(usage), [
    'Requests: 9',
    '5 audio hours · 7 billable hours',
    '15 tokens · 40 TTS chars',
    'Period: 2025-01-16 to 2025-01-24',
  ])
})

test('stepfun token normalizer extracts Oasis token from cookie header', () => {
  assert.equal(stepfun._private.normalizeToken('Oasis-Token=abc123...def456; Oasis-Webid=someid'), 'abc123...def456')
  assert.equal(stepfun._private.normalizeToken('  raw-token  '), 'raw-token')
  assert.deepEqual(stepfun._private.parseSavedConfig('{"token":" Oasis-Token=saved; other=x "}'), {
    token: 'saved',
  })
})

test('stepfun parser maps string timestamps and flexible rates', () => {
  const usage = stepfun._private.parseSnapshot(
    {
      status: 1,
      five_hour_usage_left_rate: 1,
      five_hour_usage_reset_time: '1777528800',
      weekly_usage_left_rate: 0.99781543,
      weekly_usage_reset_time: '1777899600',
    },
    Date.parse('2026-05-21T00:00:00.000Z'),
    'Step Pro',
  )

  assert.equal(usage.fiveHourUsageLeftRate, 1)
  assert.equal(usage.weeklyUsageLeftRate, 0.99781543)
  assert.equal(usage.fiveHourUsedPct, 0)
  assert.ok(usage.weeklyUsedPct > 0.21 && usage.weeklyUsedPct < 0.22)
  assert.equal(usage.fiveHourUsageResetTime, 1777528800 * 1000)
  assert.equal(usage.weeklyUsageResetTime, 1777899600 * 1000)
  assert.equal(usage.planName, 'Step Pro')
})

test('stepfun parser rejects failed API status and missing fields', () => {
  assert.throws(() => stepfun._private.parseSnapshot({ status: 0, message: 'Unauthorized' }), /Unauthorized/)
  assert.throws(() => stepfun._private.parseSnapshot({ status: 1 }), /Missing usage/)
})

test('llm proxy parser maps quota stats summary', () => {
  const usage = llmproxy._private.parseSnapshot(
    {
      providers: {
        openai: {
          credential_count: 3,
          active_count: 2,
          exhausted_count: 1,
          total_requests: 120,
          tokens: {
            input_cached: 1000,
            input_uncached: 2000,
            output: 3000,
          },
          approx_cost: 12.5,
          quota_groups: {
            default: {
              remaining_percent: 42,
              reset_time: '2026-05-18T12:00:00Z',
            },
          },
        },
        anthropic: {
          credential_count: 1,
          active_count: 1,
          exhausted_count: 0,
          total_requests: 40,
          tokens: {
            input_cached: 0,
            input_uncached: 500,
            output: 500,
          },
          approx_cost: 3,
          quota_groups: [{ remaining_percent: 80 }],
        },
      },
      summary: {
        total_requests: 160,
        total_tokens: 7000,
        approx_cost: 15.5,
      },
    },
    Date.parse('2026-05-21T00:00:00.000Z'),
  )

  assert.equal(usage.providerCount, 2)
  assert.equal(usage.credentialCount, 4)
  assert.equal(usage.activeCredentialCount, 3)
  assert.equal(usage.exhaustedCredentialCount, 1)
  assert.equal(usage.totalRequests, 160)
  assert.equal(usage.totalTokens, 7000)
  assert.equal(usage.approximateCostUSD, 15.5)
  assert.equal(usage.minimumRemainingPercent, 42)
  assert.equal(usage.nextResetAt, Date.parse('2026-05-18T12:00:00Z'))
  assert.equal(usage.topProviders[0].name, 'openai')
})

test('llm proxy URL and saved config helpers match CodexBar', () => {
  assert.equal(llmproxy._private.quotaStatsURL('https://proxy.example.com'), 'https://proxy.example.com/v1/quota-stats')
  assert.equal(llmproxy._private.quotaStatsURL('https://proxy.example.com/v1'), 'https://proxy.example.com/v1/quota-stats')
  assert.deepEqual(llmproxy._private.parseSaved('{"apiKey":" key ","baseURL":" https://proxy.example.com "}'), {
    apiKey: 'key',
    baseURL: 'https://proxy.example.com',
  })
  assert.deepEqual(llmproxy._private.parseSaved('key|https://proxy.example.com'), {
    apiKey: 'key',
    baseURL: 'https://proxy.example.com',
  })
})

test('ollama parser maps cloud usage from settings HTML', () => {
  const usage = ollama._private.parseHTML(
    `
    <div>
      <h2 class="text-xl">
        <span>Cloud Usage</span>
        <span class="text-xs">free</span>
      </h2>
      <h2 id="header-email">user@example.com</h2>
      <div>
        <span>Session usage</span>
        <span>0.1% used</span>
        <div class="local-time" data-time="2026-01-30T18:00:00Z">Resets in 3 hours</div>
      </div>
      <div>
        <span>Weekly usage</span>
        <span>0.7% used</span>
        <div class="local-time" data-time="2026-02-02T00:00:00Z">Resets in 2 days</div>
      </div>
    </div>
    `,
    Date.parse('2026-01-01T00:00:00.000Z'),
  )

  assert.equal(usage.planName, 'free')
  assert.equal(usage.accountEmail, 'user@example.com')
  assert.equal(usage.sessionUsedPercent, 0.1)
  assert.equal(usage.weeklyUsedPercent, 0.7)
  assert.equal(usage.sessionResetsAt, Date.parse('2026-01-30T18:00:00Z'))
  assert.equal(usage.weeklyResetsAt, Date.parse('2026-02-02T00:00:00Z'))
})

test('ollama parser handles hourly usage and signed out pages', () => {
  const usage = ollama._private.parseHTML(`
    <span>Hourly usage</span>
    <span>2.5% Used</span>
    <div class="local-time" data-time="2026-01-30T18:00:00.123Z"></div>
    <span>Weekly usage</span>
    <div style="width: 4.2%"></div>
  `)

  assert.equal(usage.sessionUsedPercent, 2.5)
  assert.equal(usage.weeklyUsedPercent, 4.2)
  assert.equal(usage.sessionResetsAt, Date.parse('2026-01-30T18:00:00.123Z'))
  assert.throws(
    () =>
      ollama._private.parseHTML(`
        <h1>Sign in to Ollama</h1>
        <form action="/auth/signin"><input type="email" /><input type="password" /></form>
      `),
    /Not logged in/,
  )
})

test('ollama cookie and API helpers match CodexBar behavior', () => {
  assert.equal(
    ollama._private.normalizeCookieHeader('Cookie: theme=dark; next-auth.session-token.0=abc'),
    'theme=dark; next-auth.session-token.0=abc',
  )
  assert.equal(ollama._private.normalizeCookieHeader('analytics_session_id=noise; theme=dark'), null)
  assert.deepEqual(ollama._private.parseSaved('{"cookieHeader":" __Secure-session=abc; theme=dark "}'), {
    apiKey: null,
    cookieHeader: '__Secure-session=abc; theme=dark',
  })
  assert.equal(ollama._private.parseTags({ models: [{}, {}] }).modelCount, 2)
})

test('abacus parser maps compute points and billing info', () => {
  const usage = abacus._private.parseSnapshot(
    {
      totalComputePoints: 1000,
      computePointsLeft: 750,
    },
    {
      nextBillingDate: '2026-06-01T00:00:00.123Z',
      currentTier: 'Pro',
    },
  )

  assert.equal(usage.creditsUsed, 250)
  assert.equal(usage.creditsLeft, 750)
  assert.equal(usage.creditsTotal, 1000)
  assert.equal(usage.usedPct, 25)
  assert.equal(usage.resetsAt, Date.parse('2026-06-01T00:00:00.123Z'))
  assert.equal(usage.planName, 'Pro')
})

test('abacus envelope parser detects auth and malformed payloads', () => {
  assert.deepEqual(
    abacus._private.parseResultEnvelope({ success: true, result: { totalComputePoints: 1 } }, 'compute'),
    { totalComputePoints: 1 },
  )
  assert.throws(
    () => abacus._private.parseResultEnvelope({ success: false, error: 'session expired' }, 'compute'),
    /unauthorized|expired/,
  )
  assert.throws(() => abacus._private.parseSnapshot({ wrong: 1 }), /Missing Abacus credit fields/)
})

test('abacus cookie helpers normalize saved and env-shaped headers', () => {
  assert.equal(abacus._private.normalizeCookieHeader('Cookie: foo=bar; baz=qux'), 'foo=bar; baz=qux')
  assert.deepEqual(abacus._private.parseSaved('{"cookieHeader":" foo=bar; baz=qux "}'), {
    cookieHeader: 'foo=bar; baz=qux',
  })
})

test('amp parser maps CodexBar free tier usage from settings HTML', () => {
  const now = Date.parse('2026-05-22T12:00:00Z')
  const usage = amp._private.parseFreeTierHTML(`
    <script>
      __sveltekit_x.data = {
        freeTierUsage:{bucket:"ubi",quota:1000,hourlyReplenishment:42,windowHours:24,used:338.5}
      };
    </script>
  `, now)

  assert.equal(usage.connected, true)
  assert.equal(usage.source, 'Amp web session')
  assert.equal(usage.plan, 'Amp Free')
  assert.equal(usage.quota, 1000)
  assert.equal(usage.used, 338.5)
  assert.equal(usage.remaining, 661.5)
  assert.equal(usage.hourlyReplenishment, 42)
  assert.equal(usage.windowHours, 24)
  assert.ok(Math.abs(usage.usedPct - 33.85) < 0.001)
  assert.equal(usage.resetAt, now + (338.5 / 42) * 3600000)
})

test('amp parser maps CodexBar prefetched getFreeTierUsage key', () => {
  const usage = amp._private.parseFreeTierHTML(`
    <script>
      __sveltekit_x.data = {
        "w6b2h6/getFreeTierUsage/":{bucket:"ubi",quota:1000,hourlyReplenishment:42,windowHours:24,used:0}
      };
    </script>
  `)

  assert.equal(usage.quota, 1000)
  assert.equal(usage.used, 0)
})

test('amp web fetch keeps only the session cookie and rejects signed-out pages', async () => {
  assert.equal(amp._private.sessionCookieHeader('Cookie: foo=bar; session=abc; other=1'), 'session=abc')
  await assert.rejects(
    async () => amp._private.fetchWeb('session=bad', async () => ({
      ok: true,
      status: 200,
      text: async () => '<html>Please sign in to Amp.</html>',
    })),
    /Not logged in to Amp/,
  )
})

test('amp web fetch returns usage from settings HTML', async () => {
  let request = null
  const usage = await amp._private.fetchWeb('session=abc', async (url, init) => {
    request = { url, init }
    return {
      ok: true,
      status: 200,
      text: async () => '<script>freeTierUsage:{quota:100,hourlyReplenishment:10,windowHours:24,used:25}</script>',
    }
  })

  assert.equal(request.url, 'https://ampcode.com/settings')
  assert.equal(request.init.headers.Cookie, 'session=abc')
  assert.equal(usage.usedPct, 25)
  assert.equal(usage.remaining, 75)
})

test('windsurf cache parser maps quota remaining to used windows', () => {
  const usage = windsurf._private.parseCachedPlanInfo(
    {
      planName: 'Windsurf Pro',
      endTimestamp: 1780272000000,
      quotaUsage: {
        dailyRemainingPercent: 70,
        weeklyRemainingPercent: 25,
        dailyResetAtUnix: 1780012800,
        weeklyResetAtUnix: 1780272000,
      },
      usage: {
        messages: 500,
        usedMessages: 150,
        remainingMessages: 350,
        flowActions: 100,
        usedFlowActions: 75,
        remainingFlowActions: 25,
      },
    },
    1779400000000,
  )

  assert.equal(usage.plan, 'Windsurf Pro')
  assert.equal(usage.daily.usedPct, 30)
  assert.equal(usage.weekly.usedPct, 75)
  assert.equal(usage.daily.resetAt, 1780012800 * 1000)
  assert.equal(usage.weekly.resetAt, 1780272000 * 1000)
  assert.equal(usage.messages.used, 150)
  assert.equal(usage.flowActions.remaining, 25)
})

test('windsurf cache parser falls back to usage counters', () => {
  const usage = windsurf._private.parseCachedPlanInfo({
    planName: 'Windsurf Trial',
    usage: {
      messages: 200,
      remainingMessages: 50,
      flowActions: 80,
      remainingFlowActions: 20,
    },
  })

  assert.equal(usage.daily.usedPct, 75)
  assert.equal(usage.weekly.usedPct, 75)
  assert.equal(usage.messages.used, 150)
  assert.equal(usage.flowActions.used, 60)
})

test('windsurf web session parser accepts CodexBar devin key bundles', () => {
  const parsed = windsurf._private.parseManualSessionInput(`
    devin_session_token=devin-session-token$abc
    devin_auth1_token=auth1_xyz
    devin_account_id=account-123
    devin_primary_org_id=org-456
  `)

  assert.equal(parsed.sessionToken, 'devin-session-token$abc')
  assert.equal(parsed.auth1Token, 'auth1_xyz')
  assert.equal(parsed.accountID, 'account-123')
  assert.equal(parsed.primaryOrgID, 'org-456')

  const camel = windsurf._private.parseManualSessionInput(JSON.stringify({
    devinSessionToken: 'devin-session-token$def',
    devinAuth1Token: 'auth1_def',
    devinAccountId: 'account-456',
    devinPrimaryOrgId: 'org-789',
  }))
  assert.equal(camel.sessionToken, 'devin-session-token$def')
  assert.equal(windsurf._private.parseManualSessionInput('not a session'), null)
})

test('windsurf browser importer reads CodexBar devin localStorage keys from Chromium profiles', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-windsurf-browser-'))
  const levelDB = path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Local Storage', 'leveldb')
  fs.mkdirSync(levelDB, { recursive: true })
  fs.writeFileSync(
    path.join(levelDB, '000003.log'),
    [
      'https://windsurf.com',
      'devin_session_token:"devin-session-token$abc"',
      'devin_auth1_token:"auth1_xyz"',
      'devin_account_id:"account-123"',
      'devin_primary_org_id:"org-456"',
    ].join('\0'),
  )

  const sessions = windsurf._private.importBrowserSessions({ home })

  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].sourceLabel, 'Chrome Default')
  assert.equal(sessions[0].session.sessionToken, 'devin-session-token$abc')
  assert.equal(sessions[0].session.auth1Token, 'auth1_xyz')
  assert.equal(sessions[0].session.accountID, 'account-123')
  assert.equal(sessions[0].session.primaryOrgID, 'org-456')
})

test('provider detection preselects Windsurf when browser localStorage session exists', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-windsurf-detect-'))
  const levelDB = path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Local Storage', 'leveldb')
  fs.mkdirSync(levelDB, { recursive: true })
  fs.writeFileSync(
    path.join(levelDB, '000003.log'),
    'devin_session_token:"devin-session-token$abc"\0devin_auth1_token:"auth1_xyz"\0devin_account_id:"acct-123"\0devin_primary_org_id:"org-456"',
  )

  const detections = providerDetection.detectLocalProviders({
    home,
    env: {},
    execFileSync: () => {
      throw new Error('no shell')
    },
  })

  assert.equal(detections.windsurf.detected, true)
  assert.equal(detections.windsurf.reason, 'Windsurf browser session found')
})

test('windsurf web fetch sends CodexBar protobuf auth headers and maps quota windows', async () => {
  const payload = windsurf._private.encodePlanStatusResponseForTesting({
    planName: 'Windsurf Pro',
    planEnd: 1780272000000,
    dailyQuotaRemainingPercent: 70,
    weeklyQuotaRemainingPercent: 25,
    dailyQuotaResetAtUnix: 1780012800,
    weeklyQuotaResetAtUnix: 1780272000,
  })
  let request = null
  const fakeFetch = async (url, init) => {
    request = { url, init }
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => payload,
    }
  }

  const response = await windsurf._private.fetchWebPlanStatus({
    sessionToken: 'devin-session-token$abc',
    auth1Token: 'auth1_xyz',
    accountID: 'account-123',
    primaryOrgID: 'org-456',
  }, fakeFetch)
  const usage = windsurf._private.parseWebPlanStatus(response)

  assert.equal(request.init.headers['x-devin-session-token'], 'devin-session-token$abc')
  assert.equal(request.init.headers['x-devin-auth1-token'], 'auth1_xyz')
  assert.ok(Buffer.from(request.init.body).includes(Buffer.from('devin-session-token$abc')))
  assert.equal(usage.plan, 'Windsurf Pro')
  assert.equal(usage.daily.usedPct, 30)
  assert.equal(usage.weekly.usedPct, 75)
  assert.equal(usage.daily.resetAt, 1780012800 * 1000)
  assert.equal(usage.source, 'Windsurf web session')
})

test('windsurf read falls back to imported browser session when local cache is missing', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-windsurf-read-'))
  const levelDB = path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Local Storage', 'leveldb')
  fs.mkdirSync(levelDB, { recursive: true })
  fs.writeFileSync(
    path.join(levelDB, '000003.log'),
    'devin_session_token:"browser-token"\0devin_auth1_token:"auth1"\0devin_account_id:"acct"\0devin_primary_org_id:"org"',
  )
  const oldSession = process.env.WINDSURF_SESSION
  const oldDevin = process.env.WINDSURF_DEVIN_SESSION
  delete process.env.WINDSURF_SESSION
  delete process.env.WINDSURF_DEVIN_SESSION
  try {
    const payload = windsurf._private.encodePlanStatusResponseForTesting({
      planName: 'Windsurf Teams',
      dailyQuotaRemainingPercent: 90,
      weeklyQuotaRemainingPercent: 50,
    })
    let request = null
    const usage = await windsurf.read({
      home,
      savedKey: null,
      dbPath: path.join(home, 'missing-state.vscdb'),
      fetch: async (url, init) => {
        request = { url, init }
        return { ok: true, status: 200, arrayBuffer: async () => payload }
      },
    })

    assert.equal(request.init.headers['x-devin-session-token'], 'browser-token')
    assert.equal(usage.connected, true)
    assert.equal(usage.plan, 'Windsurf Teams')
    assert.equal(usage.daily.usedPct, 10)
    assert.equal(usage.weekly.usedPct, 50)
  } finally {
    if (oldSession == null) delete process.env.WINDSURF_SESSION
    else process.env.WINDSURF_SESSION = oldSession
    if (oldDevin == null) delete process.env.WINDSURF_DEVIN_SESSION
    else process.env.WINDSURF_DEVIN_SESSION = oldDevin
  }
})

test('kiro usage parser maps credits, bonus credits, and reset date', () => {
  const usage = kiro._private.parseUsageOutput(
    `
Estimated Usage | resets on 2026-06-01 | KIRO FREE
██████ 30%
(15.00 of 50 covered in plan)
Bonus credits: 4/10 credits used, expires in 12 days
Overages: Disabled
Manage usage: https://app.kiro.dev/account/usage
`,
    { email: 'kiro@example.com', authMethod: 'AWS Builder ID' },
    Date.parse('2026-05-21T12:00:00Z'),
  )

  assert.equal(usage.plan, 'Kiro Free')
  assert.equal(usage.creditsUsed, 15)
  assert.equal(usage.creditsTotal, 50)
  assert.equal(usage.creditsRemaining, 35)
  assert.equal(usage.creditsPercent, 30)
  assert.equal(usage.bonusCredits.remaining, 6)
  assert.equal(usage.bonusCredits.expiryDays, 12)
  assert.equal(usage.email, 'kiro@example.com')
  assert.equal(usage.resetAt, Date.parse('2026-06-01T00:00:00'))
})

test('kiro MM/DD reset date rolls into next year when needed', () => {
  const resetAt = kiro._private.parseResetDate('01/10', Date.parse('2026-05-21T12:00:00Z'))

  assert.equal(resetAt, new Date(2027, 0, 10).getTime())
})

test('opencode parser maps nested rolling and weekly usage windows', () => {
  const usage = opencode._private.parseSubscription(
    JSON.stringify({
      data: {
        billing: {
          rollingUsage: { usagePercent: 0.4, resetInSec: 3600 },
          weeklyUsage: { used: 30, limit: 100, resetAt: '2026-05-28T12:00:00.000Z' },
        },
      },
    }),
    Date.parse('2026-05-21T12:00:00.000Z'),
  )

  assert.equal(usage.rolling.usedPct, 40)
  assert.equal(usage.rolling.resetAt, Date.parse('2026-05-21T13:00:00.000Z'))
  assert.equal(usage.weekly.usedPct, 30)
  assert.equal(usage.weekly.resetAt, Date.parse('2026-05-28T12:00:00.000Z'))
})

test('opencode cookie header keeps only session auth cookies', () => {
  assert.equal(
    opencode._private.cookieHeader('Cookie: theme=dark; auth=abc; __Host-auth=def; other=nah'),
    'auth=abc; __Host-auth=def',
  )
})

test('opencode go parser maps rolling, weekly, monthly, and zen balance', () => {
  const usage = opencodego._private.parseSubscription(
    JSON.stringify({
      data: {
        go: {
          rollingUsage: { usagePercent: 25, resetInSec: 900 },
          weeklyUsage: { used: 20, limit: 50, resetInSec: 604800 },
          monthlyUsage: { percent: 0.5, resetInSec: 2592000 },
        },
      },
      account: { currentBalanceUSD: '12.34' },
    }),
    Date.parse('2026-05-21T12:00:00.000Z'),
  )

  assert.equal(usage.rolling.usedPct, 25)
  assert.equal(usage.weekly.usedPct, 40)
  assert.equal(usage.monthly.usedPct, 50)
  assert.equal(usage.zenBalanceUSD, 12.34)
  assert.equal(usage.monthly.resetAt, Date.parse('2026-06-20T12:00:00.000Z'))
})

test('opencode go zen parser handles page text fallback', () => {
  assert.equal(opencodego._private.parseZenBalance('<div>Zen balance</div><strong>$1,234.56</strong>'), 1234.56)
})

test('opencode go accepts legacy saved OpenCode cookie', () => {
  secrets.setProcessOverride({ opencode: 'Cookie: theme=dark; auth=legacy; __Host-auth=host; other=nope' })
  try {
    assert.equal(opencodego._private.resolveCookie(), 'auth=legacy; __Host-auth=host')
  } finally {
    secrets.setProcessOverride(null)
  }
})

test('opencode go reads API key from OpenCode auth.json candidates', () => {
  const home = '/tmp/maxx-home'
  const authFile = `${home}/.local/share/opencode/auth.json`
  const files = {
    [authFile]: JSON.stringify({ 'opencode-go': { type: 'api', key: 'go-key' } }),
  }
  const fsImpl = { readFileSync(file) { return files[file] } }

  const found = opencodego._private.resolveApiKey({ home, fs: fsImpl, env: {} })

  assert.equal(found.key, 'go-key')
  assert.equal(found.source, authFile)
})

test('opencode go reads dashboard credentials from env and config files', () => {
  const envCreds = opencodego._private.resolveDashboardCredentials({
    env: {
      OPENCODE_GO_WORKSPACE_ID: 'wrk_ABC123',
      OPENCODE_GO_AUTH_COOKIE: 'bare-cookie',
    },
  })
  assert.equal(envCreds.workspaceID, 'wrk_ABC123')
  assert.equal(envCreds.cookie, 'auth=bare-cookie')
  assert.equal(envCreds.source, 'environment')

  const home = '/tmp/maxx-home'
  const configFile = `${home}/.config/opencode-bar/opencode-go.json`
  const files = {
    [configFile]: JSON.stringify({ workspaceId: 'wrk_FROMFILE', authCookie: 'auth=file-cookie; theme=nope' }),
  }
  const fsImpl = { readFileSync(file) { return files[file] } }
  const configCreds = opencodego._private.resolveDashboardCredentials({ home, fs: fsImpl, env: {} })

  assert.equal(configCreds.workspaceID, 'wrk_FROMFILE')
  assert.equal(configCreds.cookie, 'auth=file-cookie')
  assert.equal(configCreds.source, configFile)
})

test('alibaba parser maps quota payload windows', () => {
  const now = Date.parse('2023-11-14T22:13:20.000Z')
  const usage = alibaba._private.parseUsageSnapshot(
    {
      data: {
        codingPlanInstanceInfos: [{ planName: 'Alibaba Coding Plan Pro' }],
        codingPlanQuotaInfo: {
          per5HourUsedQuota: 52,
          per5HourTotalQuota: 1000,
          per5HourQuotaNextRefreshTime: 1700000300000,
          perWeekUsedQuota: 800,
          perWeekTotalQuota: 5000,
          perWeekQuotaNextRefreshTime: 1700100000000,
          perBillMonthUsedQuota: 1200,
          perBillMonthTotalQuota: 20000,
          perBillMonthQuotaNextRefreshTime: 1701000000000,
        },
      },
      status_code: 0,
    },
    now,
  )

  assert.equal(usage.planName, 'Alibaba Coding Plan Pro')
  assert.equal(usage.fiveHourUsedQuota, 52)
  assert.equal(usage.fiveHourTotalQuota, 1000)
  assert.equal(usage.weeklyTotalQuota, 5000)
  assert.equal(usage.monthlyTotalQuota, 20000)
  assert.equal(usage.fiveHourNextRefreshTime, 1700000300000)

  const windows = alibaba._private.toWindows(usage, now)
  assert.equal(windows[0].label, '5-hour')
  assert.equal(Math.round(windows[0].usedPct), 5)
  assert.equal(windows[2].label, 'Monthly')
  assert.equal(windows[2].total, 20000)
})

test('alibaba parser selects active instance and does not borrow expired quota', () => {
  const now = Date.parse('2023-11-14T22:13:20.000Z')
  const usage = alibaba._private.parseUsageSnapshot(
    {
      data: {
        codingPlanInstanceInfos: [
          {
            planName: 'Expired Starter',
            status: 'EXPIRED',
            codingPlanQuotaInfo: {
              per5HourUsedQuota: 7,
              per5HourTotalQuota: 100,
              per5HourQuotaNextRefreshTime: 1700000100000,
            },
          },
          {
            planName: 'Active Pro',
            status: 'VALID',
          },
        ],
      },
      status_code: 0,
    },
    now,
  )

  assert.equal(usage.planName, 'Active Pro')
  assert.equal(usage.fiveHourTotalQuota, null)
  assert.equal(alibaba._private.toWindows(usage, now).length, 0)
})

test('alibaba cookie and endpoint helpers match CodexBar defaults', () => {
  assert.equal(alibaba._private.normalizeCookieHeader('Cookie: foo=bar; baz=qux'), 'foo=bar; baz=qux')
  assert.equal(alibaba._private.region('cn').currentRegionID, 'cn-beijing')
  assert.equal(
    alibaba._private.quotaURL(alibaba._private.region('intl')).startsWith(
      'https://modelstudio.console.alibabacloud.com/data/api.json',
    ),
    true,
  )
  assert.deepEqual(alibaba._private.parseSaved('{"apiKey":" cpk-test ","region":"cn"}'), {
    apiKey: 'cpk-test',
    cookieHeader: null,
    region: 'cn',
    host: null,
    quotaURL: null,
  })
})

test('alibaba token plan parser maps monthly credit usage', () => {
  const now = Date.parse('2026-05-22T12:00:00.000Z')
  const usage = alibabaTokenPlan._private.parseUsageSnapshot(
    {
      statusCode: 0,
      data: {
        tokenPlanInstanceInfo: {
          planName: 'Alibaba Token Plan Team',
          status: 'VALID',
          tokenPlanQuotaInfo: {
            totalQuota: '100,000',
            remainingQuota: 87000,
            nextRefreshTime: '2026-06-01 00:00:00',
          },
        },
      },
    },
    now,
  )

  assert.equal(usage.planName, 'Alibaba Token Plan Team')
  assert.equal(usage.totalQuota, 100000)
  assert.equal(usage.remainingQuota, 87000)
  assert.equal(usage.usedQuota, null)
  assert.equal(usage.resetsAt, Date.parse('2026-06-01 00:00:00'))

  const windows = alibabaTokenPlan._private.toWindows(usage)
  assert.equal(windows.length, 1)
  assert.equal(windows[0].label, 'Monthly')
  assert.equal(windows[0].used, 13000)
  assert.equal(windows[0].total, 100000)
  assert.equal(Math.round(windows[0].usedPct), 13)
})

test('alibaba token plan helpers match CodexBar defaults', () => {
  assert.equal(alibabaTokenPlan._private.normalizeCookieHeader('Cookie: foo=bar; baz=qux'), 'foo=bar; baz=qux')
  assert.equal(
    alibabaTokenPlan._private.quotaURL().startsWith('https://bailian-cs.console.aliyun.com/data/api.json'),
    true,
  )
  assert.equal(
    alibabaTokenPlan._private.dashboardURL(),
    'https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/token-plan',
  )
  assert.deepEqual(alibabaTokenPlan._private.parseSaved('{"cookieHeader":" foo=bar ","host":"bailian.example.com"}'), {
    cookieHeader: 'foo=bar',
    host: 'bailian.example.com',
    quotaURL: null,
  })
})

test('augment auggie parser maps account status credits', () => {
  const usage = augment._private.parseAuggieStatus(
    [
      'Max Plan 450,000 credits / month',
      '11,657 remaining · 953,170 / 964,827 credits used',
      '2 days remaining in this billing cycle (ends 1/8/2026)',
    ].join('\n'),
    Date.parse('2026-01-06T00:00:00Z'),
  )

  assert.equal(usage.source, 'cli')
  assert.equal(usage.creditsRemaining, 11657)
  assert.equal(usage.creditsUsed, 953170)
  assert.equal(usage.creditsLimit, 964827)
  assert.equal(Math.round(usage.usedPct), 99)
  assert.equal(usage.plan, 'Max Plan 450,000 credits/month')
})

test('augment web parser derives credit limit and reset date', () => {
  const usage = augment._private.parseCreditsResponse(
    {
      usageUnitsRemaining: 70,
      usageUnitsConsumedThisBillingCycle: 30,
      usageBalanceStatus: 'ok',
    },
    {
      planName: 'Augment Pro',
      billingPeriodEnd: '2026-06-01T00:00:00.000Z',
      email: 'aug@example.com',
    },
  )

  assert.equal(usage.source, 'web')
  assert.equal(usage.plan, 'Augment Pro')
  assert.equal(usage.creditsLimit, 100)
  assert.equal(usage.usedPct, 30)
  assert.equal(usage.email, 'aug@example.com')
  assert.equal(usage.resetAt, Date.parse('2026-06-01T00:00:00.000Z'))
})

test('jetbrains quota parser reads escaped AI quota XML', () => {
  const xml = `
<application>
  <component name="AIAssistantQuotaManager2">
    <option name="quotaInfo" value="{&quot;type&quot;:&quot;AI Pro&quot;,&quot;current&quot;:&quot;40&quot;,&quot;maximum&quot;:&quot;100&quot;,&quot;until&quot;:&quot;2026-06-01T00:00:00.000Z&quot;,&quot;tariffQuota&quot;:{&quot;available&quot;:&quot;60&quot;}}" />
    <option name="nextRefill" value="{&quot;type&quot;:&quot;monthly&quot;,&quot;next&quot;:&quot;2026-06-01T00:00:00.000Z&quot;,&quot;tariff&quot;:{&quot;amount&quot;:&quot;100&quot;,&quot;duration&quot;:&quot;P1M&quot;}}" />
  </component>
</application>`

  const usage = jetbrains._private.parseQuotaXML(xml, 'WebStorm 2026.1', Date.parse('2026-05-21T12:00:00.000Z'))

  assert.equal(usage.plan, 'AI Pro')
  assert.equal(usage.used, 40)
  assert.equal(usage.maximum, 100)
  assert.equal(usage.available, 60)
  assert.equal(usage.usedPct, 40)
  assert.equal(usage.refillAmount, 100)
  assert.equal(usage.ide, 'WebStorm 2026.1')
  assert.equal(usage.resetAt, Date.parse('2026-06-01T00:00:00.000Z'))
})

test('jetbrains IDE detector recognizes common config folders', () => {
  const ide = jetbrains._private.parseIDEDir('PyCharm2026.1', '/tmp/JetBrains')

  assert.equal(ide.displayName, 'PyCharm 2026.1')
  assert.equal(ide.quotaFilePath, '/tmp/JetBrains/PyCharm2026.1/options/AIAssistantQuotaManager2.xml')
})

test('warp parser maps request limit and combined bonus grants', () => {
  const usage = warp._private.parseUsage({
    data: {
      user: {
        __typename: 'UserOutput',
        user: {
          requestLimitInfo: {
            isUnlimited: false,
            nextRefreshTime: '2026-06-01T00:00:00.000Z',
            requestLimit: 100,
            requestsUsedSinceLastRefresh: 25,
          },
          bonusGrants: [
            {
              requestCreditsGranted: 20,
              requestCreditsRemaining: 5,
              expiration: '2026-05-25T00:00:00.000Z',
            },
          ],
          workspaces: [
            {
              bonusGrantsInfo: {
                grants: [
                  {
                    requestCreditsGranted: 30,
                    requestCreditsRemaining: 10,
                    expiration: '2026-05-25T00:00:00.000Z',
                  },
                  {
                    requestCreditsGranted: 50,
                    requestCreditsRemaining: 25,
                    expiration: '2026-06-10T00:00:00.000Z',
                  },
                ],
              },
            },
          ],
        },
      },
    },
  })

  assert.equal(usage.requestLimit, 100)
  assert.equal(usage.requestsUsed, 25)
  assert.equal(usage.usedPct, 25)
  assert.equal(usage.resetAt, Date.parse('2026-06-01T00:00:00.000Z'))
  assert.equal(usage.bonusCreditsTotal, 100)
  assert.equal(usage.bonusCreditsRemaining, 40)
  assert.equal(usage.bonusNextExpiration, Date.parse('2026-05-25T00:00:00.000Z'))
  assert.equal(usage.bonusNextExpirationRemaining, 15)
})

test('warp parser handles unlimited accounts', () => {
  const usage = warp._private.parseUsage({
    data: {
      user: {
        __typename: 'UserOutput',
        user: {
          requestLimitInfo: {
            isUnlimited: 'true',
            requestLimit: 0,
            requestsUsedSinceLastRefresh: 999,
          },
        },
      },
    },
  })

  assert.equal(usage.isUnlimited, true)
  assert.equal(usage.usedPct, 0)
  assert.equal(usage.resetAt, null)
})

test('elevenlabs parser maps subscription credits and voice slots', () => {
  const usage = elevenlabs._private.parseUsage(
    {
      tier: 'creator',
      character_count: 25000,
      character_limit: 100000,
      voice_slots_used: 2,
      voice_limit: 10,
      professional_voice_slots_used: 1,
      professional_voice_limit: 2,
      current_overage: { amount: '0', currency: 'usd' },
      status: 'active',
      next_character_count_reset_unix: 1738356858,
    },
    Date.parse('2026-05-21T00:00:00.000Z'),
  )

  assert.equal(usage.tier, 'creator')
  assert.equal(usage.characterCount, 25000)
  assert.equal(usage.characterLimit, 100000)
  assert.equal(usage.remainingCharacters, 75000)
  assert.equal(usage.usedPct, 25)
  assert.equal(usage.voiceSlotsUsed, 2)
  assert.equal(usage.voiceLimit, 10)
  assert.equal(usage.professionalVoiceSlotsUsed, 1)
  assert.equal(usage.professionalVoiceLimit, 2)
  assert.equal(usage.resetAt, 1738356858000)
})

test('elevenlabs subscription URL handles versioned base URL', () => {
  assert.equal(elevenlabs._private.subscriptionURL('https://api.elevenlabs.io'), 'https://api.elevenlabs.io/v1/user/subscription')
  assert.equal(elevenlabs._private.subscriptionURL('https://api.elevenlabs.io/v1/'), 'https://api.elevenlabs.io/v1/user/subscription')
})

test('kilo parser maps credit blocks and pass subscription', () => {
  const usage = kilo._private.parseSnapshot([
    {
      result: {
        data: {
          json: {
            creditBlocks: [
              { amount_mUsd: 100000000, balance_mUsd: 25000000 },
              { amount_mUsd: 50000000, balance_mUsd: 50000000 },
            ],
            autoTopUpEnabled: false,
          },
        },
      },
    },
    {
      result: {
        data: {
          json: {
            subscription: {
              tier: 'tier_49',
              currentPeriodUsageUsd: 12.5,
              currentPeriodBaseCreditsUsd: 49,
              currentPeriodBonusCreditsUsd: 10,
              nextBillingAt: '2026-06-01T00:00:00.000Z',
            },
          },
        },
      },
    },
    {
      result: {
        data: {
          json: {
            enabled: true,
            amountCents: 2000,
          },
        },
      },
    },
  ])

  assert.equal(usage.creditsTotal, 150)
  assert.equal(usage.creditsRemaining, 75)
  assert.equal(usage.creditsUsed, 75)
  assert.equal(usage.passUsed, 12.5)
  assert.equal(usage.passTotal, 59)
  assert.equal(usage.passRemaining, 46.5)
  assert.equal(usage.passBonus, 10)
  assert.equal(usage.passResetsAt, Date.parse('2026-06-01T00:00:00.000Z'))
  assert.equal(usage.plan, 'Pro')
  assert.equal(usage.autoTopUpEnabled, true)
  assert.equal(usage.autoTopUpMethod, '$20')
})

test('kilo auth parser reads local CLI access token', () => {
  assert.equal(kilo._private.parseAuthToken('{"kilo":{"access":"abc123"}}'), 'abc123')
})

test('perplexity parser maps recurring purchased and bonus credits', () => {
  const usage = perplexity._private.parseCreditsResponse(
    {
      balance_cents: 23065,
      renewal_date_ts: 1780272000,
      current_period_purchased_cents: 0,
      credit_grants: [
        { type: 'recurring', amount_cents: 10000, expires_at_ts: 1780272000 },
        { type: 'purchased', amount_cents: 40000 },
        { type: 'promotional', amount_cents: 55000, expires_at_ts: 1780272000 },
      ],
      total_usage_cents: 81935,
    },
    Date.parse('2026-05-21T00:00:00.000Z'),
  )

  assert.equal(usage.plan, 'Max')
  assert.equal(usage.recurringTotalCents, 10000)
  assert.equal(usage.recurringUsedCents, 10000)
  assert.equal(usage.purchasedTotalCents, 40000)
  assert.equal(usage.purchasedUsedCents, 40000)
  assert.equal(usage.promoTotalCents, 55000)
  assert.equal(usage.promoUsedCents, 31935)
  assert.equal(usage.balanceCents, 23065)
  assert.equal(usage.totalCents, 105000)
  assert.equal(usage.renewalDate, 1780272000000)
})

test('perplexity cookie parser accepts bare full and chunked session cookies', () => {
  assert.deepEqual(perplexity._private.cookieCandidates('abc123')[0], {
    name: '__Secure-authjs.session-token',
    token: 'abc123',
  })

  assert.deepEqual(
    perplexity._private.cookieCandidates('foo=bar; __Secure-authjs.session-token=live; __Secure-next-auth.session-token=old')[0],
    { name: '__Secure-authjs.session-token', token: 'live' },
  )

  assert.deepEqual(
    perplexity._private.cookieCandidates('authjs.session-token.1=b; authjs.session-token.0=a')[0],
    { name: 'authjs.session-token', token: 'ab' },
  )
})

test('codebuff parser maps usage credits and reset date', () => {
  const usage = codebuff._private.parseUsagePayload({
    usage: '1250',
    quota: '5000',
    remainingBalance: 3750,
    autoTopupEnabled: true,
    next_quota_reset: '2026-06-01T00:00:00.000Z',
  })

  assert.equal(usage.used, 1250)
  assert.equal(usage.total, 5000)
  assert.equal(usage.remaining, 3750)
  assert.equal(usage.autoTopUpEnabled, true)
  assert.equal(usage.nextQuotaReset, Date.parse('2026-06-01T00:00:00.000Z'))
})

test('codebuff parser maps subscription tier and weekly window', () => {
  const usage = codebuff._private.parseSubscriptionPayload({
    subscription: {
      status: 'active',
      displayName: 'Pro',
      billingPeriodEnd: '2026-06-01T00:00:00.000Z',
    },
    rateLimit: {
      weeklyUsed: 2100,
      weeklyLimit: 7000,
      weeklyResetsAt: '2026-05-28T00:00:00.000Z',
    },
    user: {
      email: 'coder@example.com',
    },
  })

  assert.equal(usage.tier, 'Pro')
  assert.equal(usage.status, 'active')
  assert.equal(usage.weeklyUsed, 2100)
  assert.equal(usage.weeklyLimit, 7000)
  assert.equal(usage.weeklyResetsAt, Date.parse('2026-05-28T00:00:00.000Z'))
  assert.equal(usage.billingPeriodEnd, Date.parse('2026-06-01T00:00:00.000Z'))
  assert.equal(usage.email, 'coder@example.com')
})

test('codebuff auth parser reads CLI credentials token', () => {
  assert.equal(codebuff._private.parseAuthToken('{"default":{"authToken":"cb-local"}}'), 'cb-local')
  assert.equal(codebuff._private.parseAuthToken('{"authToken":"cb-top"}'), 'cb-top')
})

test('command code cookie parser accepts bare and better-auth session cookies', () => {
  assert.deepEqual(commandcode._private.cookieOverride('bare-token'), {
    name: '__Secure-better-auth.session_token',
    token: 'bare-token',
    headerValue: '__Secure-better-auth.session_token=bare-token',
  })

  assert.equal(
    commandcode._private.cookieOverride('Cookie: foo=bar; __Secure-better-auth.session_token=live').headerValue,
    '__Secure-better-auth.session_token=live',
  )

  assert.equal(commandcode._private.cookieOverride('foo=bar'), null)
})

test('command code snapshot maps plan credits and reset date', () => {
  const usage = commandcode._private.parseSnapshot(
    {
      credits: {
        monthlyCredits: 22.5,
        purchasedCredits: 5,
        premiumMonthlyCredits: 1,
        opensourceMonthlyCredits: 0,
      },
    },
    {
      success: true,
      data: {
        planId: 'individual-pro',
        status: 'active',
        currentPeriodEnd: '2026-06-01T00:00:00.000Z',
      },
    },
    Date.parse('2026-05-21T00:00:00.000Z'),
  )

  assert.equal(usage.plan.displayName, 'Pro')
  assert.equal(usage.monthlyCreditsTotal, 30)
  assert.equal(usage.monthlyCreditsUsed, 7.5)
  assert.equal(usage.usedPct, 25)
  assert.equal(usage.purchasedCredits, 5)
  assert.equal(usage.premiumMonthlyCredits, 1)
  assert.equal(usage.billingPeriodEnd, Date.parse('2026-06-01T00:00:00.000Z'))
})

test('command code snapshot handles free tier credits without subscription', () => {
  const usage = commandcode._private.parseSnapshot({ credits: { monthlyCredits: 3 } }, { success: true })

  assert.equal(usage.plan, null)
  assert.equal(usage.monthlyCreditsTotal, null)
  assert.equal(usage.monthlyCreditsUsed, null)
  assert.equal(usage.usedPct, 0)
})

test('command code snapshot rejects unknown active plans', () => {
  assert.throws(
    () =>
      commandcode._private.parseSnapshot(
        { credits: { monthlyCredits: 3 } },
        { success: true, data: { planId: 'individual-secret', status: 'active' } },
      ),
    /Unknown Command Code plan/,
  )
})

test('crof parser maps credits request quota and central reset', () => {
  const usage = crof._private.parseUsage(
    {
      credits: 9.9999,
      requests_plan: 1000,
      usable_requests: 998,
    },
    Date.parse('2026-05-08T18:30:00.000Z'),
  )

  assert.equal(usage.credits, 9.9999)
  assert.equal(usage.requestsPlan, 1000)
  assert.equal(usage.usableRequests, 998)
  assert.equal(usage.requestsUsed, 2)
  assert.equal(usage.usedPct, 1)
  assert.equal(usage.resetAt, Date.parse('2026-05-09T05:00:00.000Z'))
})

test('crof parser clamps overreported usable requests', () => {
  const usage = crof._private.parseUsage(
    {
      credits: 0,
      requests_plan: 1000,
      usable_requests: 1200,
    },
    Date.parse('2026-05-08T18:30:00.000Z'),
  )

  assert.equal(usage.requestsUsed, 0)
  assert.equal(usage.usedPct, 0)
})

test('venice parser maps DIEM epoch allocation progress', () => {
  const usage = venice._private.parseBalance({
    canConsume: true,
    consumptionCurrency: 'BUNDLED_CREDITS',
    balances: {
      diem: '75.5',
      usd: '10.00',
    },
    diemEpochAllocation: '100',
  })

  assert.equal(usage.currency, 'BUNDLED_CREDITS')
  assert.equal(usage.diemBalance, 75.5)
  assert.equal(usage.usdBalance, 10)
  assert.equal(usage.diemEpochAllocation, 100)
  assert.equal(usage.used, 24.5)
  assert.equal(usage.remaining, 75.5)
  assert.equal(usage.usedPct, 24.5)
  assert.equal(usage.unit, 'diem')
  assert.equal(usage.label, 'DIEM 75.50 / 100.00 epoch allocation')
})

test('venice parser prefers USD when active currency is USD', () => {
  const usage = venice._private.parseBalance({
    canConsume: true,
    consumptionCurrency: 'USD',
    balances: {
      diem: 50,
      usd: 12.34,
    },
    diemEpochAllocation: 100,
  })

  assert.equal(usage.unit, 'dollars')
  assert.equal(usage.total, 12.34)
  assert.equal(usage.remaining, 12.34)
  assert.equal(usage.usedPct, 0)
  assert.equal(usage.label, '$12.34 USD remaining')
})

test('venice parser marks unavailable or empty balance exhausted', () => {
  const usage = venice._private.parseBalance({
    canConsume: false,
    consumptionCurrency: 'USD',
    balances: {
      diem: 0,
      usd: 100,
    },
  })

  assert.equal(usage.usedPct, 100)
  assert.equal(usage.total, 0)
  assert.equal(usage.label, 'Balance unavailable for API calls')
})

test('moonshot parser maps available voucher and cash balances', () => {
  const usage = moonshot._private.parseBalance({
    code: 0,
    data: {
      available_balance: 49.58,
      voucher_balance: 50,
      cash_balance: 12.34,
    },
    scode: '0x0',
    status: true,
  })

  assert.equal(usage.availableBalance, 49.58)
  assert.equal(usage.voucherBalance, 50)
  assert.equal(usage.cashBalance, 12.34)
  assert.equal(usage.deficit, 0)
})

test('moonshot parser surfaces negative cash balance as deficit', () => {
  const usage = moonshot._private.parseBalance({
    code: 0,
    data: {
      available_balance: 49.58,
      voucher_balance: 50,
      cash_balance: -0.42,
    },
    scode: '0x0',
    status: true,
  })

  assert.equal(usage.deficit, 0.42)
})

test('moonshot balance URL switches regions', () => {
  assert.equal(moonshot._private.balanceURL('international'), 'https://api.moonshot.ai/v1/users/me/balance')
  assert.equal(moonshot._private.balanceURL('china'), 'https://api.moonshot.cn/v1/users/me/balance')
})

test('kimi k2 parser reads nested usage credits and timestamp', () => {
  const usage = kimik2._private.parseUsage({
    data: {
      usage: {
        total: 120,
        credits_remaining: 30,
        average_tokens: 42,
        updated_at: '2024-01-02T03:04:05Z',
      },
    },
  })

  assert.equal(usage.consumed, 120)
  assert.equal(usage.remaining, 30)
  assert.equal(usage.averageTokens, 42)
  assert.equal(usage.updatedAt, Date.parse('2024-01-02T03:04:05Z'))
})

test('kimi k2 parser falls back to remaining credits header', () => {
  const usage = kimik2._private.parseUsage({ total_credits_consumed: 50 }, { 'X-Credits-Remaining': '25' })

  assert.equal(usage.consumed, 50)
  assert.equal(usage.remaining, 25)
})

test('kimi k2 parser accepts millisecond timestamps', () => {
  const usage = kimik2._private.parseUsage({
    timestamp: 1700000000000,
    credits_remaining: 10,
    total_credits_consumed: 5,
  })

  assert.equal(usage.updatedAt, 1700000000000)
})

test('doubao parser maps request quota headers', () => {
  const usage = doubao._private.parseSnapshot(
    200,
    {
      'x-ratelimit-remaining-requests': '80',
      'x-ratelimit-limit-requests': '100',
      'x-ratelimit-reset-requests': '2026-06-01T00:00:00.000Z',
    },
    null,
    Date.parse('2026-05-21T00:00:00.000Z'),
    'doubao-seed-2.0-code',
  )

  assert.equal(usage.apiKeyValid, true)
  assert.equal(usage.remainingRequests, 80)
  assert.equal(usage.limitRequests, 100)
  assert.equal(usage.usedPct, 20)
  assert.equal(usage.resetTime, Date.parse('2026-06-01T00:00:00.000Z'))
  assert.equal(usage.model, 'doubao-seed-2.0-code')
})

test('doubao parser shows active key when headers are absent', () => {
  const usage = doubao._private.parseSnapshot(
    200,
    {},
    { usage: { total_tokens: 17 } },
    Date.parse('2026-05-21T00:00:00.000Z'),
  )

  assert.equal(usage.apiKeyValid, true)
  assert.equal(usage.remainingRequests, 0)
  assert.equal(usage.limitRequests, 0)
  assert.equal(usage.usedPct, 0)
  assert.equal(usage.totalTokens, 17)
})

test('doubao reset parser accepts duration headers', () => {
  const now = Date.parse('2026-05-21T00:00:00.000Z')
  assert.equal(doubao._private.parseResetTime('1h30m', now), now + 90 * 60000)
  assert.equal(doubao._private.parseResetTime('120', now), now + 120000)
})

test('zai parser maps weekly, mcp, and 5-hour limits', () => {
  const usage = zai._private.parseUsageSnapshot(
    {
      code: 200,
      msg: 'ok',
      success: true,
      data: {
        planName: 'Pro',
        limits: [
          {
            type: 'TOKENS_LIMIT',
            unit: 6,
            number: 1,
            usage: 1000,
            currentValue: 250,
            remaining: 800,
            percentage: 12,
            nextResetTime: 1780272000000,
          },
          {
            type: 'TOKENS_LIMIT',
            unit: 3,
            number: 5,
            usage: 100,
            currentValue: 20,
            remaining: 70,
            percentage: 1,
            nextResetTime: 1780000000000,
          },
          {
            type: 'TIME_LIMIT',
            unit: 5,
            number: 1,
            usage: 100,
            currentValue: 50,
            remaining: 50,
            percentage: 99,
          },
        ],
      },
    },
    Date.parse('2026-05-21T00:00:00.000Z'),
  )

  assert.equal(usage.planName, 'Pro')
  assert.equal(usage.tokenLimit.windowMinutes, 10080)
  assert.equal(usage.tokenLimit.usedPct, 25)
  assert.equal(usage.sessionTokenLimit.windowMinutes, 300)
  assert.equal(usage.sessionTokenLimit.usedPct, 30)
  assert.equal(usage.timeLimit.isMCPMonthlyMarker, true)
  assert.equal(usage.timeLimit.usedPct, 50)
})

test('zai parser rejects api errors and missing data', () => {
  assert.throws(() => zai._private.parseUsageSnapshot({ code: 1001, msg: 'Authorization Token Missing', success: false }), /Authorization Token Missing/)
  assert.throws(() => zai._private.parseUsageSnapshot({ code: 200, msg: 'ok', success: true }), /Missing data/)
})

test('zai url helpers honor quota override, host, and region', () => {
  assert.equal(zai._private.quotaURL({ region: 'global' }), 'https://api.z.ai/api/monitor/usage/quota/limit')
  assert.equal(zai._private.quotaURL({ region: 'bigmodel-cn' }), 'https://open.bigmodel.cn/api/monitor/usage/quota/limit')
  assert.equal(zai._private.quotaURL({ apiHost: 'open.bigmodel.cn' }), 'https://open.bigmodel.cn/api/monitor/usage/quota/limit')
  assert.equal(zai._private.quotaURL({ quotaURL: 'open.bigmodel.cn/api/coding' }), 'https://open.bigmodel.cn/api/coding')
  assert.equal(zai._private.modelUsageURL({ apiHost: 'https://proxy.example.com/base' }), 'https://proxy.example.com/base')
})

test('zai model usage parser sums tokens and model names', () => {
  const usage = zai._private.parseModelUsage({
    code: 200,
    msg: 'success',
    success: true,
    data: {
      x_time: ['2026-05-14 08:00', '2026-05-14 09:00'],
      modelDataList: [
        { modelName: 'glm-4.6', tokensUsage: [100, null] },
        { modelName: 'glm-4.5', tokensUsage: [50, 25] },
      ],
    },
  })

  assert.deepEqual(usage.xTime, ['2026-05-14 08:00', '2026-05-14 09:00'])
  assert.deepEqual(usage.modelNames, ['glm-4.6', 'glm-4.5'])
  assert.deepEqual(usage.modelDataList[0].tokensUsage, [100, null])
  assert.equal(usage.totalTokens, 175)
})

test('factory manual credentials accept cookies bearer headers and bare tokens', () => {
  assert.deepEqual(factory._private.manualCredentials('Cookie: access-token=jwt.token.value; session=abc'), {
    cookieHeader: 'access-token=jwt.token.value; session=abc',
    bearerToken: 'jwt.token.value',
  })
  assert.deepEqual(factory._private.manualCredentials('Authorization: Bearer factory-access-token'), {
    cookieHeader: null,
    bearerToken: 'factory-access-token',
  })
  assert.deepEqual(factory._private.manualCredentials('{"cookieHeader":" session=abc ","bearerToken":" token-123 "}'), {
    cookieHeader: 'session=abc',
    bearerToken: 'token-123',
  })
})

test('factory legacy snapshot maps standard premium and token totals', () => {
  const usage = factory._private.parseLegacySnapshot(
    {
      organization: {
        name: 'Acme',
        subscription: {
          factoryTier: 'team',
          orbSubscription: { plan: { name: 'Team' } },
        },
      },
      userProfile: { id: 'user-1', email: 'user@example.com' },
    },
    {
      usage: {
        startDate: 1700000000000,
        endDate: 1700003600000,
        standard: {
          userTokens: 100,
          orgTotalTokensUsed: 250,
          totalAllowance: 1000,
          usedRatio: 0.1,
        },
        premium: {
          userTokens: 20,
          orgTotalTokensUsed: 40,
          totalAllowance: 100,
          usedRatio: 0.2,
        },
      },
      userId: 'user-1',
    },
  )

  assert.equal(usage.mode, 'legacy')
  assert.equal(usage.planName, 'Team')
  assert.equal(usage.organizationName, 'Acme')
  assert.equal(usage.standard.usedPct, 10)
  assert.equal(usage.premium.usedPct, 20)
  assert.equal(usage.periodEnd, 1700003600000)
  assert.equal(usage.totalUserTokens, 120)
})

test('factory legacy percent prefers valid api ratio and falls back to allowance math', () => {
  assert.equal(factory._private.percentFromRatio(0.361558685, 0, 72311737), 36.1558685)
  assert.equal(factory._private.percentFromRatio(10, 0, 0), 10)
  assert.equal(Math.round(factory._private.percentFromRatio(0, 20_000_000, 5_826_293)), 29)
  assert.equal(factory._private.percentFromRatio(1.5, 100_000_000, 50_000_000), 50)
})

test('factory token-rate snapshot maps 5h weekly monthly core and extra usage', () => {
  const now = Date.parse('2026-05-21T00:00:00.000Z')
  const usage = factory._private.parseTokenRateSnapshot(
    {
      organization: {
        name: 'Acme',
        subscription: {
          factoryTier: 'team',
          orbSubscription: { plan: { name: 'Team' } },
        },
      },
    },
    {
      usesTokenRateLimitsBilling: true,
      extraUsageBalanceCents: 2500,
      overagePreference: 'core',
      limits: {
        standard: {
          fiveHour: { usedPercent: 12, secondsRemaining: 3600 },
          weekly: { usedPercent: 34, secondsRemaining: 7200 },
          monthly: { usedPercent: 56, secondsRemaining: 10800 },
        },
        core: {
          fiveHour: { usedPercent: 7, secondsRemaining: 1800 },
          weekly: { usedPercent: 8, secondsRemaining: 2800 },
          monthly: { usedPercent: 9, secondsRemaining: 3800 },
        },
      },
    },
    null,
    now,
  )

  assert.equal(usage.mode, 'token-rate')
  assert.equal(usage.standard.fiveHour.usedPct, 12)
  assert.equal(usage.standard.fiveHour.resetAt, now + 3600 * 1000)
  assert.equal(usage.standard.weekly.periodMs, 7 * 24 * 60 * 60000)
  assert.equal(usage.core.monthly.usedPct, 9)
  assert.equal(usage.extraUsageBalanceCents, 2500)
  assert.equal(usage.overagePreference, 'core')
})

test('factory billing window treats stale ended rolling windows as reset', () => {
  const now = Date.parse('2026-05-21T00:00:00.000Z')
  const window = factory._private.parseBillingWindow(
    {
      usedPercent: 88,
      windowEnd: '2026-05-20T23:00:00.000Z',
    },
    300,
    now,
  )

  assert.equal(window.usedPct, 0)
  assert.equal(window.resetAt, null)
})

test('antigravity parser maps available model quotas', () => {
  const quotas = antigravity._private.parseModelQuotas({
    models: {
      'claude-sonnet-4': {
        displayName: 'Claude Sonnet 4',
        quotaInfo: { remainingFraction: 0.5, resetTime: '2025-12-24T12:00:00Z' },
      },
      'gemini-3-pro-low': {
        displayName: 'Gemini 3 Pro Low',
        quotaInfo: { remainingFraction: 0.8 },
      },
    },
  })

  assert.equal(quotas.length, 2)
  assert.equal(quotas[0].label, 'Claude Sonnet 4')
  assert.equal(quotas[0].resetAt, Date.parse('2025-12-24T12:00:00Z'))
})

test('antigravity selector chooses claude pro-low and flash representatives', () => {
  const windows = antigravity._private.selectedWindows([
    { label: 'Claude Thinking', modelId: 'claude-thinking', remainingFraction: 0.7 },
    { label: 'Claude Sonnet 4', modelId: 'claude-sonnet-4', remainingFraction: 0.3 },
    { label: 'Gemini 3 Pro', modelId: 'gemini-3-pro', remainingFraction: 0.1 },
    { label: 'Gemini 3 Pro Low', modelId: 'gemini-3-pro-low', remainingFraction: 0.9 },
    { label: 'Gemini 3 Flash', modelId: 'MODEL_PLACEHOLDER_M47', remainingFraction: 1 },
  ])

  assert.equal(windows[0].label, 'Claude')
  assert.equal(windows[0].remainingPct, 30)
  assert.equal(windows[1].label, 'Gemini Pro')
  assert.equal(windows[1].remainingPct, 90)
  assert.equal(windows[2].label, 'Gemini Flash')
  assert.equal(windows[2].remainingPct, 100)
})

test('antigravity selector filters lite autocomplete and falls back visibly', () => {
  const windows = antigravity._private.selectedWindows([
    { label: 'Gemini 3 Pro Lite', modelId: 'gemini-3-pro-lite', remainingFraction: 0.6 },
    { label: 'Gemini 3 Flash Lite', modelId: 'gemini-3-flash-lite', remainingFraction: 0.2 },
    { label: 'Tab Autocomplete', modelId: 'tab_autocomplete_model', remainingFraction: 0.9 },
  ])

  assert.equal(windows.length, 1)
  assert.equal(windows[0].label, 'Claude')
  assert.equal(windows[0].remainingPct, 20)
})

test('antigravity merges verified quota buckets when available models look unused', () => {
  const merged = antigravity._private.mergeVerifiedQuotas(
    [
      { label: 'Claude Sonnet', modelId: 'claude-sonnet', remainingFraction: 1, resetAt: null },
      { label: 'Gemini Pro', modelId: 'gemini-pro', remainingFraction: 1, resetAt: null },
    ],
    [
      { label: 'claude-sonnet', modelId: 'claude-sonnet', remainingFraction: 0.4, resetAt: 1775000000000 },
    ],
  )

  assert.equal(antigravity._private.shouldVerifyQuotas(merged), false)
  assert.equal(merged[0].remainingFraction, 0.4)
  assert.equal(merged[0].resetAt, 1775000000000)
})

test('antigravity plan resolver maps tiers and id token claims', () => {
  assert.equal(antigravity._private.planFromCodeAssist({ currentTier: { id: 'free-tier' } }, {}), 'Free')
  assert.equal(
    antigravity._private.planFromCodeAssist({ currentTier: { id: 'free-tier' } }, { hostedDomain: 'example.com' }),
    'Workspace',
  )
  assert.equal(antigravity._private.planFromCodeAssist({ currentTier: { id: 'standard-tier' } }, {}), 'Paid')
})

test('minimax credentials accept coding keys cookies and copied curl headers', () => {
  assert.equal(minimax._private.apiKeyKind('sk-cp-abc'), 'codingPlan')
  assert.equal(minimax._private.apiKeyKind('sk-api-abc'), 'standard')
  assert.deepEqual(minimax._private.parseCredentials('Cookie: user=abc; groupid=team-1'), {
    apiKey: null,
    cookieHeader: 'user=abc; groupid=team-1',
    bearerToken: null,
    groupID: 'team-1',
    region: null,
  })
  assert.deepEqual(
    minimax._private.parseCredentials(`curl -H 'Cookie: session=abc; other=123' -H 'Authorization: Bearer bearer-1' -H 'GroupId: group-9'`),
    {
      apiKey: null,
      cookieHeader: 'session=abc; other=123',
      bearerToken: 'bearer-1',
      groupID: 'group-9',
      region: null,
    },
  )
})

test('minimax legacy remains treats usage count as remaining prompts', () => {
  const start = Date.parse('2026-05-21T10:00:00Z')
  const end = Date.parse('2026-05-21T15:00:00Z')
  const usage = minimax._private.parseCodingPlanRemains(
    {
      data: {
        current_subscribe_title: 'Coding Pro',
        model_remains: [
          {
            current_interval_total_count: 1000,
            current_interval_usage_count: 250,
            start_time: start,
            end_time: end,
          },
        ],
      },
    },
    start,
  )

  assert.equal(usage.planName, 'Coding Pro')
  assert.equal(usage.availablePrompts, 1000)
  assert.equal(usage.currentPrompts, 750)
  assert.equal(usage.remainingPrompts, 250)
  assert.equal(usage.usedPct, 75)
  assert.equal(usage.windowMinutes, 300)
  assert.equal(usage.resetsAt, end)
  assert.deepEqual(usage.services[0], {
    label: 'Text Generation',
    usage: 750,
    limit: 1000,
    remaining: 250,
    usedPct: 75,
    windowMinutes: 300,
    resetAt: end,
  })
})

test('minimax weekly remains adds weekly prompt window', () => {
  const usage = minimax._private.parseCodingPlanRemains({
    data: {
      current_interval_total_count: 1000,
      current_interval_usage_count: 1000,
      current_weekly_total_count: 6000,
      current_weekly_usage_count: 5376,
      weekly_end_time: 1770000000000,
    },
  })

  assert.equal(usage.services[1].label, 'Weekly')
  assert.equal(usage.services[1].usage, 624)
  assert.equal(usage.services[1].remaining, 5376)
  assert.equal(usage.services[1].usedPct, 10.4)
  assert.equal(usage.services[1].resetAt, 1770000000000)
})

test('minimax multi-service remains maps service windows and percentages', () => {
  const now = Date.parse('2026-05-21T08:00:00')
  const usage = minimax._private.parseCodingPlanRemains(
    {
      data: {
        services: [
          {
            service_type: 'text-generation',
            window_type: '5 hours',
            time_range: '10:00-15:00(UTC+8)',
            usage: 2,
            limit: 10,
          },
          {
            service_type: 'Image',
            window_type: 'Today',
            time_range: '2026/05/21 00:00 - 2026/05/22 00:00',
            usage: '5',
            limit: '50',
            percent: '10',
          },
        ],
      },
    },
    now,
  )

  assert.equal(usage.services[0].label, 'Text Generation')
  assert.equal(usage.services[0].usedPct, 20)
  assert.equal(usage.services[0].remaining, 8)
  assert.equal(usage.services[0].windowMinutes, 300)
  assert.equal(usage.services[1].label, 'Image')
  assert.equal(usage.services[1].usedPct, 10)
  assert.equal(usage.services[1].windowMinutes, 1440)
  assert.equal(usage.availablePrompts, 10)
  assert.equal(usage.currentPrompts, 2)
})

test('minimax billing summary aggregates successful token records', () => {
  const now = Date.parse('2026-05-21T12:00:00')
  const billing = minimax._private.parseBillingSummary(
    {
      data: {
        charge_records: [
          {
            consume_token: 100,
            consume_cash_after_voucher: 0.25,
            ymd: '20260521',
            method: 'chat',
            model: 'abab6.5s',
            result: 'SUCCESS',
          },
          {
            consume_input_token: 30,
            consume_output_token: 20,
            consume_cash: 0.1,
            ymd: '20260520',
            method: 'chat',
            model: 'abab6.5s',
            status: 'SUCCESS',
          },
          {
            consume_token: 999,
            consume_cash: 9,
            ymd: '20260521',
            method: 'failed',
            model: 'bad',
            result: 'FAILED',
          },
        ],
      },
    },
    now,
  )

  assert.equal(billing.todayTokens, 100)
  assert.equal(billing.last30DaysTokens, 150)
  assert.equal(billing.todayCash, 0.25)
  assert.equal(billing.last30DaysCash, 0.35)
  assert.deepEqual(billing.topMethod, { name: 'chat', tokens: 150 })
  assert.deepEqual(billing.topModel, { name: 'abab6.5s', tokens: 150 })
})

test('manus session token parser accepts bare tokens cookies and curl', () => {
  assert.equal(manus._private.sessionToken('abc123'), 'abc123')
  assert.equal(manus._private.sessionToken('foo=bar; session_id=token-a; baz=qux'), 'token-a')
  assert.equal(manus._private.sessionToken('Cookie: foo=bar; Session_ID=token-b'), 'token-b')
  assert.equal(manus._private.sessionToken(`curl -H 'Cookie: foo=bar; session_id=token-c' https://manus.im`), 'token-c')
  assert.equal(manus._private.sessionToken('foo=bar; hello=world'), null)
  assert.equal(manus._private.parseSaved('{"sessionToken":"saved-token"}'), 'saved-token')
})

test('manus credits parser maps monthly and daily refresh windows', () => {
  const usage = manus._private.parseCreditsResponse(
    {
      totalCredits: 2869,
      freeCredits: 1500,
      periodicCredits: 1369,
      proMonthlyCredits: 4000,
      maxRefreshCredits: 300,
      refreshCredits: 30,
      addonCredits: 10,
      eventCredits: 5,
      nextRefreshTime: '2026-04-13T00:00:00Z',
      refreshInterval: 'daily',
    },
    Date.parse('2026-04-12T12:00:00Z'),
  )

  assert.equal(usage.totalCredits, 2869)
  assert.equal(usage.periodicCredits, 1369)
  assert.equal(usage.proMonthlyCredits, 4000)
  assert.ok(Math.abs(usage.monthlyUsedPct - 65.775) < 0.000001)
  assert.equal(usage.refreshUsedPct, 90)
  assert.equal(usage.addonCredits, 10)
  assert.equal(usage.eventCredits, 5)
  assert.equal(usage.nextRefreshTime, Date.parse('2026-04-13T00:00:00Z'))
})

test('manus credits parser rejects unrelated payloads and accepts envelopes', () => {
  assert.throws(() => manus._private.parseCreditsResponse({ error: 'unauthorized' }), /missing expected credits/)
  const wrapped = manus._private.parseCreditsResponse({
    data: {
      totalCredits: 100,
      proMonthlyCredits: 200,
      periodicCredits: 50,
      maxRefreshCredits: 10,
      refreshCredits: 5,
    },
  })

  assert.equal(wrapped.totalCredits, 100)
  assert.equal(wrapped.monthlyUsedPct, 75)
  assert.equal(wrapped.refreshUsedPct, 50)
})

test('vertex ai adc parser maps user and service account credentials', () => {
  const user = vertexai._private.parseADC(
    {
      client_id: 'client-id',
      client_secret: 'client-secret',
      refresh_token: 'refresh-token',
      access_token: 'access-token',
      token_expiry: '2026-05-21T12:00:00Z',
    },
    { GOOGLE_CLOUD_PROJECT: 'env-project' },
  )

  assert.equal(user.type, 'user')
  assert.equal(user.projectID, 'env-project')
  assert.equal(user.accessToken, 'access-token')
  assert.equal(user.refreshToken, 'refresh-token')
  assert.equal(user.expiryDate, Date.parse('2026-05-21T12:00:00Z'))

  const service = vertexai._private.parseADC(
    {
      type: 'service_account',
      project_id: 'service-project',
      private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
      client_email: 'vertex@test.iam.gserviceaccount.com',
    },
    {},
  )

  assert.equal(service.type, 'service_account')
  assert.equal(service.projectID, 'service-project')
  assert.equal(service.email, 'vertex@test.iam.gserviceaccount.com')
})

test('vertex ai quota parser matches usage and limit series by quota key', () => {
  const series = (quotaMetric, limitName, location, value) => ({
    metric: { labels: { quota_metric: quotaMetric, limit_name: limitName } },
    resource: { labels: { location } },
    points: [{ value: { int64Value: String(value) } }],
  })
  const quota = vertexai._private.parseQuotaUsage(
    { timeSeries: [series('aiplatform.googleapis.com/online_prediction_requests', 'requests', 'us-central1', 25)] },
    { timeSeries: [series('aiplatform.googleapis.com/online_prediction_requests', 'requests', 'us-central1', 100)] },
  )

  assert.equal(quota.requestsUsedPercent, 25)
  assert.equal(quota.matchedSeries, 1)
  assert.equal(quota.usageSeries, 1)
  assert.equal(quota.limitSeries, 1)
})

test('vertex ai claude log scanner filters vertex entries and sums tokens', () => {
  const vertexByMetadata = {
    type: 'assistant',
    timestamp: '2026-05-21T10:00:00Z',
    metadata: { provider: 'vertexai', projectId: 'vertex-project' },
    message: {
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 10, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 5 },
    },
  }
  const vertexByID = {
    type: 'assistant',
    timestamp: '2026-05-21T10:00:01Z',
    requestId: 'req_vrtx_123',
    message: {
      id: 'msg_vrtx_456',
      model: 'claude-opus-4-5-20251101',
      usage: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 20, output_tokens: 50 },
    },
  }
  const claude = {
    type: 'assistant',
    timestamp: '2026-05-21T10:00:02Z',
    metadata: { provider: 'anthropic' },
    message: {
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 999, output_tokens: 999 },
    },
  }
  const usage = vertexai._private.scanClaudeVertexUsage(
    [
      {
        toString() {
          return 'unused'
        },
      },
    ],
    Date.parse('2026-05-20T00:00:00Z'),
  )
  assert.equal(usage, null)

  const text = [vertexByMetadata, vertexByID, claude].map((row) => JSON.stringify(row)).join('\n')
  const tmp = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'vertexai-test-'))
  const file = require('node:path').join(tmp, 'session.jsonl')
  require('node:fs').writeFileSync(file, text)
  try {
    const scanned = vertexai._private.scanClaudeVertexUsage([file], Date.parse('2026-05-20T00:00:00Z'))
    assert.equal(scanned.input, 112)
    assert.equal(scanned.uncachedInput, 110)
    assert.equal(scanned.cacheCreation, 2)
    assert.equal(scanned.cacheRead, 23)
    assert.equal(scanned.cached, 23)
    assert.equal(scanned.output, 55)
    assert.equal(scanned.total, 190)
    assert.equal(scanned.requests, 2)
    assert.deepEqual(scanned.modelNames, ['claude-opus-4-5-20251101', 'claude-sonnet-4-20250514'])
    assert.deepEqual(scanned.modelBreakdowns, [
      {
        model: 'claude-opus-4-5-20251101',
        input: 100,
        uncachedInput: 100,
        cacheCreation: 0,
        cacheRead: 20,
        cached: 20,
        output: 50,
        total: 170,
        requests: 1,
      },
      {
        model: 'claude-sonnet-4-20250514',
        input: 12,
        uncachedInput: 10,
        cacheCreation: 2,
        cacheRead: 3,
        cached: 3,
        output: 5,
        total: 20,
        requests: 1,
      },
    ])
    assert.equal(scanned.dailyBreakdown.length, 1)
    assert.equal(scanned.dailyBreakdown[0].date, '2026-05-21')
    assert.equal(scanned.dailyBreakdown[0].total, 190)
    assert.equal(scanned.dailyBreakdown[0].modelBreakdowns.length, 2)
  } finally {
    require('node:fs').rmSync(tmp, { recursive: true, force: true })
  }
})

test('synthetic parser maps live rolling weekly and search quota slots', () => {
  const usage = synthetic._private.parseUsageResponse(
    {
      subscription: {
        limit: 750,
        requests: 0,
        renewsAt: '2026-04-17T08:35:49.493Z',
      },
      weeklyTokenLimit: {
        nextRegenAt: '2026-04-17T05:19:30.000Z',
        percentRemaining: 98.05884722222223,
        maxCredits: '$36.00',
        remainingCredits: '$35.30',
        nextRegenCredits: '$0.72',
      },
      rollingFiveHourLimit: {
        nextTickAt: '2026-04-17T03:44:11.000Z',
        tickPercent: 0.05,
        remaining: 750,
        max: 750,
        limited: false,
      },
      search: {
        hourly: {
          limit: 250,
          requests: 2,
          renewsAt: '2026-04-17T04:30:01.494Z',
        },
      },
    },
    Date.parse('2026-04-17T03:00:00Z'),
  )

  assert.equal(usage.slottedQuotas.length, 3)
  assert.equal(usage.slottedQuotas[0].label, 'Rolling five-hour limit')
  assert.equal(usage.slottedQuotas[0].usedPercent, 0)
  assert.equal(usage.slottedQuotas[0].nextRegenPercent, 5)
  assert.equal(usage.slottedQuotas[1].label, 'Weekly token limit')
  assert.ok(Math.abs(usage.slottedQuotas[1].usedPercent - 1.9411527777777715) < 0.001)
  assert.equal(usage.slottedQuotas[1].cost.limit, 36)
  assert.ok(Math.abs(usage.slottedQuotas[1].cost.used - 0.7) < 0.0001)
  assert.equal(usage.slottedQuotas[1].cost.nextRegenAmount, 0.72)
  assert.equal(usage.slottedQuotas[2].label, 'Search hourly')
  assert.equal(usage.slottedQuotas[2].usedPercent, 0.8)
})

test('synthetic parser preserves slot identity when rolling quota is missing', () => {
  const usage = synthetic._private.parseUsageResponse({
    weeklyTokenLimit: {
      nextRegenAt: '2026-04-17T05:19:30.000Z',
      percentRemaining: 98,
      maxCredits: '$36.00',
      remainingCredits: '$35.30',
    },
    search: {
      hourly: {
        limit: 250,
        requests: 2,
        renewsAt: '2026-04-17T04:30:01.494Z',
      },
    },
  })

  assert.equal(usage.slottedQuotas[0], null)
  assert.equal(usage.slottedQuotas[1].label, 'Weekly token limit')
  assert.equal(usage.slottedQuotas[2].label, 'Search hourly')
})

test('synthetic parser handles fallback quotas and duration suffixes', () => {
  assert.equal(synthetic._private.windowMinutesFromText('5min'), 5)
  assert.equal(synthetic._private.windowMinutesFromText('5hr'), 300)
  assert.equal(synthetic._private.windowMinutesFromText('2days'), 2880)
  assert.equal(synthetic._private.windowMinutesFromText('junk'), null)

  const usage = synthetic._private.parseUsageResponse({
    plan: 'Starter',
    quotas: [
      { name: 'Monthly', limit: 1000, used: 250, reset_at: '2025-01-01T00:00:00Z' },
      { name: 'Daily', max: 200, remaining: 50, window_minutes: 1440 },
    ],
  })

  assert.equal(usage.planName, 'Starter')
  assert.equal(usage.quotas[0].usedPercent, 25)
  assert.equal(usage.quotas[1].usedPercent, 75)
  assert.equal(usage.quotas[1].windowMinutes, 1440)
})

test('mimo cookie header normalizer keeps required auth cookies', () => {
  const raw = `
    curl 'https://platform.xiaomimimo.com/api/v1/balance' \\
      -H 'Cookie: userId=123; api-platform_serviceToken=svc-token; ignored=value; api-platform_ph=ph-token'
  `

  assert.equal(
    mimo._private.normalizedCookieHeader(raw),
    'api-platform_ph=ph-token; api-platform_serviceToken=svc-token; userId=123',
  )
  assert.equal(mimo._private.normalizedCookieHeader('Cookie: userId=123'), null)
})

test('mimo cookie header builder prefers specific request-matching cookies', () => {
  const header = mimo._private.headerFromRecords(
    [
      {
        name: 'userId',
        value: 'root-user',
        domain: 'xiaomimimo.com',
        path: '/',
        expiresAt: Date.parse('2030-01-01T00:00:00Z'),
      },
      {
        name: 'userId',
        value: 'api-user',
        domain: 'platform.xiaomimimo.com',
        path: '/api',
        expiresAt: Date.parse('2028-01-01T00:00:00Z'),
      },
      {
        name: 'api-platform_serviceToken',
        value: 'partial-token',
        domain: 'platform.xiaomimimo.com',
        path: '/api/v1/bal',
        expiresAt: Date.parse('2030-01-01T00:00:00Z'),
      },
      {
        name: 'api-platform_serviceToken',
        value: 'valid-token',
        domain: '.xiaomimimo.com',
        path: '/',
        expiresAt: Date.parse('2030-01-01T00:00:00Z'),
      },
    ],
    Date.parse('2026-05-21T00:00:00Z'),
  )

  assert.equal(header, 'api-platform_serviceToken=valid-token; userId=api-user')
})

test('mimo parsers merge balance and token plan usage', () => {
  const now = Date.parse('2026-05-21T00:00:00Z')
  const usage = mimo._private.parseCombinedSnapshot(
    { code: 0, message: '', data: { balance: '25.51', currency: 'USD' } },
    { code: 0, message: '', data: { planCode: 'standard', currentPeriodEnd: '2026-06-04 23:59:59', expired: false } },
    {
      code: 0,
      message: '',
      data: {
        monthUsage: {
          percent: 0.0505,
          items: [{ name: 'month_total_token', used: 10100158, limit: 200000000, percent: 0.0505 }],
        },
      },
    },
    now,
  )

  assert.equal(usage.balance, 25.51)
  assert.equal(usage.currency, 'USD')
  assert.equal(usage.planCode, 'standard')
  assert.equal(usage.planPeriodEnd, Date.parse('2026-06-04 23:59:59Z'))
  assert.equal(usage.tokenUsed, 10_100_158)
  assert.equal(usage.tokenLimit, 200_000_000)
  assert.equal(usage.tokenPercent, 0.0505)
  assert.equal(usage.updatedAt, now)
})

test('bedrock saved settings accept json and env-style credentials', () => {
  assert.deepEqual(bedrock._private.parseSaved('{"accessKeyID":"AKIA","secretAccessKey":"secret","region":"eu-west-1","budget":500}'), {
    accessKeyID: 'AKIA',
    secretAccessKey: 'secret',
    sessionToken: null,
    region: 'eu-west-1',
    budget: 500,
    apiURL: null,
  })

  assert.deepEqual(
    bedrock._private.parseSaved('AWS_ACCESS_KEY_ID=AKIATEST\nAWS_SECRET_ACCESS_KEY=sekret\nAWS_DEFAULT_REGION=us-west-2\nCODEXBAR_BEDROCK_BUDGET=250'),
    {
      accessKeyID: 'AKIATEST',
      secretAccessKey: 'sekret',
      sessionToken: null,
      region: 'us-west-2',
      budget: 250,
      apiURL: null,
    },
  )
})

test('bedrock cost explorer parser totals only bedrock services', () => {
  const pages = [
    {
      ResultsByTime: [
        {
          TimePeriod: { Start: '2026-04-01', End: '2026-04-02' },
          Groups: [
            { Keys: ['Amazon Bedrock'], Metrics: { UnblendedCost: { Amount: '12.00', Unit: 'USD' } } },
            { Keys: ['Claude Sonnet (Bedrock Edition)'], Metrics: { UnblendedCost: { Amount: '8.50', Unit: 'USD' } } },
            { Keys: ['Amazon EC2'], Metrics: { UnblendedCost: { Amount: '99.00', Unit: 'USD' } } },
          ],
        },
      ],
    },
  ]

  assert.equal(bedrock._private.parseTotalCost(pages), 20.5)
  assert.deepEqual(bedrock._private.parseDailyEntries(pages), [
    {
      date: '2026-04-01',
      costUSD: 20.5,
      modelsUsed: ['Amazon Bedrock', 'Claude Sonnet (Bedrock Edition)'],
      modelBreakdowns: [
        { modelName: 'Amazon Bedrock', costUSD: 12, totalTokens: null },
        { modelName: 'Claude Sonnet (Bedrock Edition)', costUSD: 8.5, totalTokens: null },
      ],
    },
  ])
})

test('bedrock request signing adds aws authorization headers', () => {
  const headers = bedrock._private.signRequest({
    url: 'https://ce.us-east-1.amazonaws.com',
    body: '{}',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSInsightsIndexService.GetCostAndUsage',
    },
    credentials: {
      accessKeyID: 'AKIATEST',
      secretAccessKey: 'secret',
      sessionToken: 'session',
    },
    now: new Date('2026-05-10T12:00:00Z'),
  })

  assert.equal(headers.Host, 'ce.us-east-1.amazonaws.com')
  assert.equal(headers['X-Amz-Date'], '20260510T120000Z')
  assert.equal(headers['X-Amz-Security-Token'], 'session')
  assert.match(headers.Authorization, /^AWS4-HMAC-SHA256 Credential=AKIATEST\/20260510\/us-east-1\/ce\/aws4_request/)
})
