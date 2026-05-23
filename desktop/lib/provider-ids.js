const ALIASES = {
  abacusai: 'abacus',
  'alibaba-coding-plan': 'alibaba',
  'alibaba-token': 'alibabatokenplan',
  'alibaba-token-plan': 'alibabatokenplan',
  'azure-openai': 'azureopenai',
  'bailian-token-plan': 'alibabatokenplan',
  groqcloud: 'groq',
  'kimi-k2': 'kimik2',
  'open-code': 'opencode',
  'open-code-go': 'opencodego',
  t3: 't3chat',
  't3-chat': 't3chat',
  'vertex-ai': 'vertexai',
}

function canonicalProviderId(id) {
  const key = String(id || '').trim().toLowerCase()
  return ALIASES[key] || key
}

function aliasesForProvider(id) {
  const canonical = canonicalProviderId(id)
  return Object.entries(ALIASES)
    .filter(([, target]) => target === canonical)
    .map(([alias]) => alias)
}

module.exports = {
  ALIASES,
  canonicalProviderId,
  aliasesForProvider,
}
