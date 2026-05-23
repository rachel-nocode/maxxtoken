const { canonicalProviderId } = require('./provider-ids')

const LINKS = {
  abacus: {
    dashboard: 'https://apps.abacus.ai/chatllm/admin/compute-points-usage',
  },
  alibaba: {
    dashboard: 'https://bailian.console.aliyun.com/cn-beijing/?tab=model#/efm/coding_plan',
    status: 'https://status.aliyun.com',
  },
  alibabatokenplan: {
    dashboard: 'https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/token-plan',
    status: 'https://status.aliyun.com',
  },
  amp: {
    dashboard: 'https://ampcode.com/settings',
  },
  antigravity: {
    status: 'https://www.google.com/appsstatus/dashboard/products/npdyhgECDJ6tB66MxXyo/history',
  },
  augment: {
    dashboard: 'https://app.augmentcode.com/account/subscription',
  },
  azureopenai: {
    dashboard: 'https://ai.azure.com',
    status: 'https://azure.status.microsoft/en-us/status',
  },
  bedrock: {
    dashboard: 'https://console.aws.amazon.com/bedrock',
    status: 'https://health.aws.amazon.com/health/status',
  },
  claude: {
    dashboard: 'https://claude.ai/settings/usage',
    billing: 'https://console.anthropic.com/settings/billing',
    status: 'https://status.claude.com/',
  },
  codebuff: {
    dashboard: 'https://www.codebuff.com/usage',
  },
  codex: {
    dashboard: 'https://chatgpt.com/codex/settings/usage',
    status: 'https://status.openai.com/',
  },
  commandcode: {
    dashboard: 'https://commandcode.ai/studio',
  },
  copilot: {
    dashboard: 'https://github.com/settings/copilot',
    status: 'https://www.githubstatus.com/',
  },
  crof: {
    dashboard: 'https://crof.ai/dashboard',
  },
  cursor: {
    dashboard: 'https://cursor.com/dashboard?tab=usage',
    status: 'https://status.cursor.com',
  },
  deepgram: {
    dashboard: 'https://console.deepgram.com/project/',
    status: 'https://status.deepgram.com',
  },
  deepseek: {
    dashboard: 'https://platform.deepseek.com/usage',
    status: 'https://status.deepseek.com',
  },
  doubao: {
    dashboard:
      'https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&advancedActiveKey=subscribe',
  },
  elevenlabs: {
    dashboard: 'https://elevenlabs.io/app/developers/usage',
    status: 'https://status.elevenlabs.io',
  },
  factory: {
    dashboard: 'https://app.factory.ai/settings/billing',
    status: 'https://status.factory.ai',
  },
  gemini: {
    dashboard: 'https://gemini.google.com',
    status: 'https://www.google.com/appsstatus/dashboard/products/npdyhgECDJ6tB66MxXyo/history',
  },
  grok: {
    dashboard: 'https://grok.com/?_s=usage',
    status: 'https://status.x.ai',
  },
  groq: {
    dashboard: 'https://console.groq.com/dashboard/metrics',
    status: 'https://status.groq.com',
  },
  kilo: {
    dashboard: 'https://app.kilo.ai/usage',
  },
  kimi: {
    dashboard: 'https://www.kimi.com/code/console',
  },
  kiro: {
    dashboard: 'https://app.kiro.dev/account/usage',
    status: 'https://health.aws.amazon.com/health/status',
  },
  manus: {
    dashboard: 'https://manus.im',
  },
  minimax: {
    dashboard: 'https://platform.minimax.io/user-center/payment/coding-plan?cycle_type=3',
  },
  mimo: {
    dashboard: 'https://platform.xiaomimimo.com/#/console/balance',
  },
  mistral: {
    dashboard: 'https://admin.mistral.ai/organization/usage',
    status: 'https://status.mistral.ai',
  },
  moonshot: {
    dashboard: 'https://platform.moonshot.ai/console/account',
  },
  ollama: {
    dashboard: 'https://ollama.com/settings',
  },
  openai: {
    dashboard: 'https://platform.openai.com/usage',
    status: 'https://status.openai.com',
  },
  opencode: {
    dashboard: 'https://opencode.ai',
  },
  opencodego: {
    dashboard: 'https://opencode.ai',
  },
  openrouter: {
    dashboard: 'https://openrouter.ai/settings/credits',
    status: 'https://status.openrouter.ai',
  },
  perplexity: {
    dashboard: 'https://www.perplexity.ai/account/usage',
    status: 'https://status.perplexity.com/',
  },
  stepfun: {
    dashboard: 'https://platform.stepfun.com/plan-usage',
  },
  t3chat: {
    dashboard: 'https://t3.chat/settings/customization',
    billing: 'https://t3.chat/settings/subscription',
  },
  venice: {
    dashboard: 'https://venice.ai/settings/api',
  },
  vertexai: {
    dashboard: 'https://console.cloud.google.com/vertex-ai',
    status: 'https://status.cloud.google.com',
  },
  warp: {
    dashboard: 'https://docs.warp.dev/reference/cli/api-keys',
  },
  windsurf: {
    dashboard: 'https://windsurf.com/subscription/usage',
  },
  zai: {
    dashboard: 'https://z.ai/manage-apikey/subscription',
  },
}

function linksForProvider(id) {
  const links = LINKS[canonicalProviderId(id)]
  return links ? { ...links } : {}
}

function linkForProvider(id, kind) {
  const links = linksForProvider(id)
  const key = String(kind || '')
  return links[key] || null
}

module.exports = {
  linksForProvider,
  linkForProvider,
  _private: { LINKS },
}
