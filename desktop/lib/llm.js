// Generic OpenAI-compatible chat generation, used as the Missions "self-eating
// fallback": when the primary Claude OAuth idea call is rate-limited, we
// re-route generation to whichever underused provider the user already has a
// key for — so the idea engine itself burns surplus quota instead of going
// dark. Pure transport + a small provider registry; callers own the prompt.

const { getKey } = require('./secrets')
const { fetchWithTimeout } = require('./http')

// Providers that expose an OpenAI-compatible /chat/completions endpoint and
// whose stored secret is a usable inference key (not a usage-read cookie).
// Model ids are flagship-ish: burning is the point, so we don't pick the
// cheapest tier. Keyed by canonical provider id (matches secrets/getKey).
const GEN_PROVIDERS = {
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-sonnet-4.5' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  grok: { baseUrl: 'https://api.x.ai/v1', model: 'grok-4' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' },
}

function canGenerateWith(providerId) {
  const spec = GEN_PROVIDERS[providerId]
  if (!spec) return false
  try {
    return Boolean(getKey(providerId))
  } catch {
    return false
  }
}

// All generation-capable providers (registry ∩ has-key), for callers that want
// to know what fallbacks are available before choosing an order.
function generationCapableProviders() {
  return Object.keys(GEN_PROVIDERS).filter(canGenerateWith)
}

// Run one chat completion via an OpenAI-compatible provider. Returns the raw
// assistant text, or throws (caller decides whether to try the next provider).
async function generateText(providerId, prompt, options = {}) {
  const spec = GEN_PROVIDERS[providerId]
  if (!spec) throw new Error(`No generation spec for provider ${providerId}`)
  const key = getKey(providerId)
  if (!key) throw new Error(`No API key for provider ${providerId}`)

  const resp = await fetchWithTimeout(
    `${spec.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || spec.model,
        max_tokens: options.maxTokens || 4200,
        temperature: options.temperature == null ? 0.9 : options.temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    options.timeout || 30000,
  )
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    const err = new Error(`generateText ${providerId} HTTP ${resp.status}`)
    err.status = resp.status
    err.body = body.slice(0, 300)
    throw err
  }
  const data = await resp.json()
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new Error(`generateText ${providerId} empty response`)
  return text
}

module.exports = { generateText, canGenerateWith, generationCapableProviders, GEN_PROVIDERS }
