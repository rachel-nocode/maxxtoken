const { test } = require('node:test')
const assert = require('node:assert')
const codex = require('../lib/adapters/codex')

const { parseResponsesSse } = codex._private

test('parseResponsesSse concatenates output_text deltas in order', () => {
  const sse = [
    'data: {"type":"response.created"}',
    'data: {"type":"response.output_text.delta","delta":"Hello"}',
    'data: {"type":"response.output_text.delta","delta":", world"}',
    'data: {"type":"response.completed"}',
    'data: [DONE]',
  ].join('\n')
  assert.strictEqual(parseResponsesSse(sse), 'Hello, world')
})

test('parseResponsesSse ignores reasoning/other events and keepalives', () => {
  const sse = [
    ': keepalive',
    'data: {"type":"response.reasoning.delta","delta":"thinking"}',
    'data: {"type":"response.output_text.delta","delta":"["}',
    'data: not-json',
    'data: {"type":"response.output_text.delta","delta":"]"}',
  ].join('\n')
  assert.strictEqual(parseResponsesSse(sse), '[]')
})

test('parseResponsesSse returns empty string for no text deltas', () => {
  assert.strictEqual(parseResponsesSse('data: {"type":"response.completed"}'), '')
  assert.strictEqual(parseResponsesSse(''), '')
})

test('codex exposes generate + canGenerate', () => {
  assert.strictEqual(typeof codex.generate, 'function')
  assert.strictEqual(typeof codex.canGenerate, 'function')
})
