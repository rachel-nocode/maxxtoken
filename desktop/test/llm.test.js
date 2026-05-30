const { test } = require('node:test')
const assert = require('node:assert')
const { GEN_PROVIDERS, canGenerateWith, generationCapableProviders, generateText } = require('../lib/llm')

test('GEN_PROVIDERS each have a baseUrl + model', () => {
  for (const [id, spec] of Object.entries(GEN_PROVIDERS)) {
    assert.ok(/^https:\/\//.test(spec.baseUrl), `${id} baseUrl is https`)
    assert.ok(spec.model && typeof spec.model === 'string', `${id} has a model`)
  }
})

test('canGenerateWith is false for unknown provider', () => {
  assert.strictEqual(canGenerateWith('not-a-provider'), false)
})

test('canGenerateWith is false when no key is available (no safeStorage in test env)', () => {
  // Without Electron safeStorage getKey returns null, so even registry providers
  // are not generation-capable here. Asserts we never claim a key we lack.
  assert.strictEqual(canGenerateWith('openrouter'), false)
})

test('generationCapableProviders returns an array subset of the registry', () => {
  const caps = generationCapableProviders()
  assert.ok(Array.isArray(caps))
  for (const id of caps) assert.ok(GEN_PROVIDERS[id], `${id} is in the registry`)
})

test('generateText rejects for a provider with no spec', async () => {
  await assert.rejects(() => generateText('nope', 'hi'), /No generation spec/)
})
