const CAPABILITY_STATUSES = new Set(['supported', 'experimental', 'hidden'])

const definitions = [
  ['claude', 'Claude', 'Max', 200, 'core', 'supported', 'auto', ['claude'], []],
  ['codex', 'ChatGPT', 'Pro', 200, 'core', 'supported', 'auto', ['codex'], []],
  ['opencode', 'OpenCode', 'Go', 60, 'core', 'supported', 'cookie', ['opencode'], []],
  ['opencodego', 'OpenCode Go', 'Go', 60, 'core', 'supported', 'auto', ['opencodego'], []],
  ['openai', 'OpenAI API', 'Admin API', 50, 'extended', 'supported', 'key', [], ['OPENAI_ADMIN_KEY', 'OPENAI_API_KEY']],
  ['azureopenai', 'Azure OpenAI', 'Deployment', 20, 'hidden', 'hidden', 'key', [], ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT']],
  ['cursor', 'Cursor', 'Pro', 20, 'core', 'supported', 'cookie', ['cursor'], []],
  ['copilot', 'Copilot', 'Pro', 10, 'core', 'supported', 'key', ['copilot'], []],
  ['windsurf', 'Windsurf', 'Pro', 15, 'core', 'supported', 'cookie', ['windsurf'], ['WINDSURF_SESSION', 'WINDSURF_DEVIN_SESSION']],
  ['devin', 'Devin', 'Core', 20, 'core', 'supported', 'auto', ['devin'], []],
  ['kiro', 'Kiro', 'Free', 50, 'core', 'supported', 'auto', ['kiro-cli', 'kiro'], []],
  ['alibaba', 'Alibaba', 'Coding Plan', 20, 'hidden', 'hidden', 'cookie', ['alibaba-coding-plan'], ['ALIBABA_CODING_PLAN_API_KEY', 'ALIBABA_QWEN_API_KEY', 'DASHSCOPE_API_KEY', 'ALIBABA_CODING_PLAN_COOKIE']],
  ['alibabatokenplan', 'Alibaba Token Plan', 'Token Plan', 20, 'hidden', 'hidden', 'cookie', ['alibaba-token-plan', 'alibaba-token', 'bailian-token-plan'], ['ALIBABA_TOKEN_PLAN_COOKIE', 'ALIBABA_TOKEN_PLAN_HOST', 'ALIBABA_TOKEN_PLAN_QUOTA_URL']],
  ['augment', 'Augment', 'Code', 30, 'hidden', 'hidden', 'cookie', ['auggie'], []],
  ['jetbrains', 'JetBrains AI', 'AI Pro', 10, 'hidden', 'hidden', 'auto', [], []],
  ['warp', 'Warp', 'AI', 20, 'hidden', 'hidden', 'key', ['warp'], ['WARP_API_KEY', 'WARP_TOKEN']],
  ['elevenlabs', 'ElevenLabs', 'Creator', 22, 'hidden', 'hidden', 'key', ['elevenlabs'], ['ELEVENLABS_API_KEY', 'XI_API_KEY']],
  ['kilo', 'Kilo', 'Pass', 20, 'hidden', 'hidden', 'key', ['kilo'], []],
  ['kimi', 'Kimi', 'Basic', 15, 'core', 'supported', 'auto', ['kimi'], ['KIMI_API_KEY', 'KIMI_KEY']],
  ['moonshot', 'Moonshot / Kimi API', 'API', 20, 'extended', 'experimental', 'key', ['moonshot'], []],
  ['kimik2', 'Kimi K2', 'Credits', 20, 'extended', 'experimental', 'key', [], ['KIMI_K2_API_KEY', 'KIMI_API_KEY', 'KIMI_KEY']],
  ['doubao', 'Doubao', 'Ark API', 20, 'hidden', 'hidden', 'key', ['doubao'], ['DOUBAO_API_KEY', 'ARK_API_KEY']],
  ['grok', 'Grok', 'Build', 99, 'core', 'supported', 'cookie', ['grok'], ['GROK_COOKIE', 'GROK_SESSION_COOKIE', 'GROK_ACCESS_TOKEN', 'GROK_BEARER_TOKEN', 'GROK_TOKEN']],
  ['groq', 'Groq', 'API', 20, 'hidden', 'hidden', 'key', [], ['GROQ_API_KEY']],
  ['gemini', 'Gemini', 'Pro', 20, 'core', 'supported', 'auto', ['gemini'], []],
  ['openrouter', 'OpenRouter', 'API', 20, 'extended', 'supported', 'key', [], ['OPENROUTER_API_KEY']],
  ['perplexity', 'Perplexity', 'Pro', 20, 'hidden', 'hidden', 'cookie', [], ['PERPLEXITY_API_KEY', 'PPLX_API_KEY']],
  ['mistral', 'Mistral', 'API', 20, 'extended', 'experimental', 'cookie', [], ['MISTRAL_COOKIE', 'MISTRAL_SESSION_COOKIE']],
  ['codebuff', 'Codebuff', 'Pro', 20, 'hidden', 'hidden', 'key', ['codebuff'], ['CODEBUFF_API_KEY']],
  ['commandcode', 'Command Code', 'Pro', 30, 'hidden', 'hidden', 'cookie', ['commandcode'], ['COMMAND_CODE_COOKIE', 'COMMANDCODE_COOKIE']],
  ['crof', 'Crof', 'API', 20, 'hidden', 'hidden', 'key', ['crof'], ['CROF_API_KEY']],
  ['venice', 'Venice', 'API', 20, 'hidden', 'hidden', 'key', ['venice'], ['VENICE_API_KEY', 'VENICE_KEY']],
  ['deepseek', 'DeepSeek', 'API', 10, 'extended', 'experimental', 'key', [], ['DEEPSEEK_API_KEY']],
  ['deepgram', 'Deepgram', 'API', 20, 'hidden', 'hidden', 'key', [], ['DEEPGRAM_API_KEY']],
  ['stepfun', 'StepFun', 'Step Plan', 20, 'hidden', 'hidden', 'key', ['stepfun'], ['STEPFUN_API_KEY', 'STEPFUN_TOKEN']],
  ['llmproxy', 'LLM Proxy', 'Quota Stats', 20, 'hidden', 'hidden', 'key', ['llmproxy'], ['LLM_PROXY_API_KEY', 'LLM_PROXY_BASE_URL']],
  ['ollama', 'Ollama', 'Cloud', 20, 'extended', 'experimental', 'cookie', [], ['OLLAMA_API_KEY', 'OLLAMA_KEY', 'OLLAMA_COOKIE', 'OLLAMA_SESSION_COOKIE']],
  ['abacus', 'Abacus AI', 'Credits', 20, 'hidden', 'hidden', 'cookie', ['abacusai'], ['ABACUS_COOKIE', 'ABACUS_SESSION_COOKIE']],
  ['amp', 'Amp', 'Credits', 40, 'core', 'supported', 'cookie', ['amp'], ['AMP_COOKIE', 'AMP_SESSION_COOKIE']],
  ['factory', 'Factory', 'Droid', 20, 'hidden', 'hidden', 'cookie', ['factory'], []],
  ['antigravity', 'Antigravity', 'Google AI', 20, 'core', 'supported', 'auto', ['antigravity', 'agy'], []],
  ['minimax', 'MiniMax', 'Coding Plan', 20, 'hidden', 'hidden', 'cookie', ['minimax'], ['MINIMAX_CODING_API_KEY', 'MINIMAX_API_KEY', 'MINIMAX_COOKIE', 'MINIMAX_AUTHORIZATION_TOKEN']],
  ['manus', 'Manus', 'Pro', 20, 'hidden', 'hidden', 'cookie', ['manus'], ['MANUS_SESSION_TOKEN', 'MANUS_SESSION_ID', 'MANUS_COOKIE']],
  ['vertexai', 'Vertex AI', 'Google Cloud', 20, 'extended', 'experimental', 'key', ['vertexai', 'gcloud'], ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT']],
  ['synthetic', 'Synthetic', 'API', 20, 'hidden', 'hidden', 'key', ['synthetic'], ['SYNTHETIC_API_KEY', 'SYNTHETIC_COOKIE']],
  ['mimo', 'Xiaomi MiMo', 'Credits', 20, 'hidden', 'hidden', 'cookie', ['mimo'], ['MIMO_COOKIE', 'MIMO_COOKIE_HEADER']],
  ['bedrock', 'AWS Bedrock', 'Cost Explorer', 20, 'extended', 'experimental', 'key', ['aws'], ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_PROFILE']],
  ['t3chat', 'T3 Chat', 'Pro', 20, 'hidden', 'hidden', 'cookie', ['t3chat'], ['T3CHAT_COOKIE', 'T3_CHAT_COOKIE', 'T3CHAT_CURL', 'T3_CHAT_CURL']],
  ['zai', 'Z.ai', 'GLM Coding', 20, 'extended', 'supported', 'key', ['zai'], ['ZAI_API_KEY', 'Z_AI_API_KEY', 'GLM_API_KEY']],
]

const PROVIDER_CAPABILITIES = Object.freeze(Object.fromEntries(definitions.map((row) => {
  const [id, name, plan, monthly, tier, status, auth, cliBins, envKeys] = row
  return [id, Object.freeze({
    id,
    name,
    plan,
    monthly,
    tier,
    status,
    auth,
    adapter: true,
    discovery: Object.freeze({ cliBins: Object.freeze(cliBins), envKeys: Object.freeze(envKeys) }),
  })]
})))

function getProviderCapability(id) {
  return PROVIDER_CAPABILITIES[String(id || '').toLowerCase()] || null
}

function defaultProviders() {
  return Object.fromEntries(Object.values(PROVIDER_CAPABILITIES).map((capability) => [capability.id, {
    name: capability.name,
    plan: capability.plan,
    monthly: capability.monthly,
    enabled: false,
    tier: capability.tier,
    status: capability.status,
    auth: capability.auth,
  }]))
}

function validateProviderRegistry(adapterIds = []) {
  const adapters = new Set(adapterIds)
  const registryIds = Object.keys(PROVIDER_CAPABILITIES)
  const missingAdapters = registryIds.filter((id) => PROVIDER_CAPABILITIES[id].adapter && !adapters.has(id))
  const unreachableAdapters = [...adapters].filter((id) => !PROVIDER_CAPABILITIES[id])
  const invalidStatuses = registryIds.filter((id) => !CAPABILITY_STATUSES.has(PROVIDER_CAPABILITIES[id].status))
  return {
    ok: !missingAdapters.length && !unreachableAdapters.length && !invalidStatuses.length,
    missingAdapters,
    unreachableAdapters,
    invalidStatuses,
  }
}

module.exports = {
  PROVIDER_CAPABILITIES,
  getProviderCapability,
  defaultProviders,
  validateProviderRegistry,
}
