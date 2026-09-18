const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const config = require('../lib/config')
const diagnostics = require('../lib/diagnostics')
const detection = require('../lib/provider-detection')
const capabilities = require('../lib/provider-capabilities')

const ADAPTER_IDS = [
  'codex', 'openai', 'azureopenai', 'claude', 'cursor', 'copilot', 'windsurf', 'devin', 'kiro',
  'opencode', 'opencodego', 'alibaba', 'alibabatokenplan', 'augment', 'jetbrains', 'warp',
  'elevenlabs', 'kilo', 'kimi', 'moonshot', 'kimik2', 'doubao', 'gemini', 'grok', 'groq',
  'openrouter', 'perplexity', 'mistral', 'codebuff', 'commandcode', 'crof', 'venice', 'deepseek',
  'deepgram', 'stepfun', 'llmproxy', 'ollama', 'abacus', 'amp', 'factory', 'antigravity',
  'minimax', 'manus', 'vertexai', 'synthetic', 'mimo', 'bedrock', 'zai', 't3chat',
]

test('provider capability registry reaches every adapter and drives defaults', () => {
  const validation = capabilities.validateProviderRegistry(ADAPTER_IDS)
  assert.deepEqual(validation, { ok: true, missingAdapters: [], unreachableAdapters: [], invalidStatuses: [] })
  const defaults = config.loadConfig(path.join(os.tmpdir(), `missing-${Date.now()}.json`))
  assert.deepEqual(Object.keys(defaults.providers).sort(), [...ADAPTER_IDS].sort())
  assert.equal(defaults.providers.jetbrains.status, 'hidden')
  assert.equal(defaults.providers.ollama.auth, 'cookie')
  assert.equal(defaults.providers.vertexai.status, 'experimental')
})

test('config normalizes diagnostics, proxy, fallback, and immutable capabilities', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-config-reliability-'))
  const file = path.join(tmp, 'config.json')
  fs.writeFileSync(file, JSON.stringify({
    onboardingComplete: true,
    logLevel: 'debug',
    proxy: { enabled: true, url: 'socks5://user:password@127.0.0.1:9050', bypassLoopback: false },
    unknownModelFallback: { enabled: true, models: { codex: 'future-model-label' } },
    providers: { claude: { enabled: true, monthly: 123, tier: 'hidden', status: 'hidden', auth: 'key' } },
  }))
  const loaded = config.loadConfig(file)
  assert.equal(loaded.logLevel, 'debug')
  assert.deepEqual(loaded.proxy, { enabled: true, url: 'socks5://127.0.0.1:9050', bypassLoopback: true })
  assert.deepEqual(loaded.unknownModelFallback, { enabled: true, models: { codex: 'future-model-label' } })
  assert.equal(loaded.providers.claude.monthly, 123)
  assert.equal(loaded.providers.claude.tier, 'core')
  assert.equal(loaded.providers.claude.status, 'supported')
  assert.equal(loaded.providers.claude.auth, 'auto')
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('detection does not turn installed tools or opted-out providers into subscriptions', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-registry-detect-'))
  const detected = detection.detectLocalProviders({
    home,
    env: { OPENAI_API_KEY: 'fixture-key' },
    execFileSync: (_bin, args) => {
      const command = String(args[1])
      if (command.includes("'claude'")) return '/usr/local/bin/claude\n'
      if (command.includes("'ollama'")) return '/usr/local/bin/ollama\n'
      throw new Error('missing')
    },
  })
  assert.equal(detected.claude.evidenceType, 'installed')
  assert.equal(detected.ollama, undefined)
  const base = config.loadConfig(path.join(home, 'missing.json'))
  base.providerOptOuts = ['openai']
  const applied = detection.applyDetectionsToConfig(base, detected)
  assert.equal(applied.providers.claude.enabled, false)
  assert.equal(applied.providers.openai.enabled, false)
  fs.rmSync(home, { recursive: true, force: true })
})

test('diagnostics reset preserves completed onboarding while restoring safe defaults', () => {
  const reset = diagnostics.resetSettings({ onboardingComplete: true, logLevel: 'debug' })
  assert.equal(reset.onboardingComplete, true)
  assert.equal(reset.logLevel, 'info')
  assert.deepEqual(reset.unknownModelFallback, { enabled: false, models: {} })
  assert.deepEqual(reset.proxy, { enabled: false, url: '', bypassLoopback: true })
  assert.equal(diagnostics.setLogLevel(reset, 'warn').logLevel, 'warn')
  assert.equal(diagnostics.setLogLevel(reset, 'invalid').logLevel, 'info')
})

test('incidental config saves preserve only explicit provider opt-outs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-optouts-'))
  const file = path.join(tmp, 'config.json')
  const initial = config.loadConfig(path.join(tmp, 'missing.json'))
  initial.onboardingComplete = true
  initial.providerOptOuts = ['cursor']
  initial.logLevel = 'debug'
  config.saveConfig(initial, file)
  const loaded = config.loadConfig(file)
  assert.deepEqual(loaded.providerOptOuts, ['cursor'])
  assert.equal(loaded.providerOptOuts.includes('ollama'), false)
  assert.equal(loaded.providerOptOuts.includes('openai'), false)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('explicit provider choices add and clear opt-outs without trapping new defaults', () => {
  const current = config.loadConfig(path.join(os.tmpdir(), `missing-current-${Date.now()}.json`))
  current.onboardingComplete = true
  current.providers.claude.enabled = true
  current.providerOptOuts = ['cursor']
  const disabled = JSON.parse(JSON.stringify(current))
  disabled.providers.claude.enabled = false
  disabled.pricingSupplementUrl = 'https://example.test/pricing.json'
  disabled.providerOptOuts = config.mergeProviderOptOuts(current, disabled)
  assert.deepEqual(disabled.providerOptOuts.sort(), ['claude', 'cursor'])
  assert.equal(disabled.providerOptOuts.includes('ollama'), false)

  const reenabled = JSON.parse(JSON.stringify(disabled))
  reenabled.providers.cursor.enabled = true
  reenabled.providerOptOuts = config.mergeProviderOptOuts(disabled, reenabled)
  assert.deepEqual(reenabled.providerOptOuts, ['claude'])
  assert.equal(config._private.normalizePricingSupplementUrl(disabled.pricingSupplementUrl), 'https://example.test/pricing.json')
})

test('first onboarding save records the choices shown to the user', () => {
  const current = config.loadConfig(path.join(os.tmpdir(), `missing-onboarding-${Date.now()}.json`))
  const selected = JSON.parse(JSON.stringify(current))
  selected.onboardingComplete = true
  selected.providers.claude.enabled = true
  selected.providerOptOuts = config.mergeProviderOptOuts(current, selected)
  assert.equal(selected.providerOptOuts.includes('claude'), false)
  assert.equal(selected.providerOptOuts.includes('cursor'), true)
  assert.equal(selected.providerOptOuts.includes('ollama'), false)
  assert.equal(selected.providerOptOuts.includes('openai'), false)
})

test('startup detection save keeps future providers eligible', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maxxtoken-detected-save-'))
  const file = path.join(tmp, 'config.json')
  const current = config.loadConfig(path.join(tmp, 'missing.json'))
  current.onboardingComplete = true
  const detected = detection.applyDetectionsToConfig(current, {
    openai: { detected: true, evidenceType: 'credentials' },
  })
  config.saveConfig(detected, file)
  const loaded = config.loadConfig(file)
  assert.equal(loaded.providers.openai.enabled, true)
  assert.deepEqual(loaded.providerOptOuts, [])
  assert.equal(loaded.providerOptOuts.includes('ollama'), false)
  fs.rmSync(tmp, { recursive: true, force: true })
})
