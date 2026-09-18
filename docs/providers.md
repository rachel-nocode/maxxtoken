# Provider support and limitations

This matrix describes the 24 integrations exposed in MaxxToken v0.2.13: 17 supported and 7 experimental. “Supported” means the integration has a maintained product path and synthetic coverage, not that every plan/region has been exercised. “Experimental” means the adapter is exposed but depends on a less-stable endpoint, local format, or incomplete account coverage.

Auth values entered in MaxxToken use encrypted OS-backed storage. Automatic discovery reads an existing provider-owned sign-in; it does not copy credentials into public diagnostics. Browser-session integrations can expire when the provider signs you out.

| Provider | Status | Authentication/discovery | Metrics and sources | Limits |
|---|---|---|---|---|
| Claude | Supported | Claude CLI/app OAuth from credential files or Keychain; local Claude/pi sessions | Provider session, weekly, model windows and extra-use/Agent SDK credit where returned; local token/model/day history | API can rate-limit; local history covers this device; subscription-value dollars are hypothetical |
| ChatGPT / Codex | Supported | Codex OAuth file or Keychain; local Codex/pi sessions | Provider session/weekly/model limits, credits and reset credits; local token/model/day history | API-key-only Codex auth cannot read subscription quota; history is device-local; reset-credit use requires explicit confirmation |
| OpenCode | Supported | Imported or saved OpenCode web session cookie | Five-hour and weekly workspace quota | Browser session and private dashboard shape can expire/change; requires a workspace; suppressed to avoid duplicate reporting when OpenCode Go key mode is active |
| OpenCode Go | Supported | Official key from OpenCode config; local `opencode.db`; configured/imported web session fallback | Five-hour, weekly and monthly caps where available; Zen balance; hosted/local token history | Local-database quotas/resets are inferred and forecasts are disabled for them; source coverage varies by auth mode |
| Cursor | Supported | Cursor app auth, narrowly scoped browser cookies, or saved Cookie header | Plan and model buckets, on-demand spend, grants/prepaid balance, Grok Bot weekly quota, Enterprise requests, official usage-export token/model/day history | Export and optional endpoints can fail without hiding primary usage; cookie fallback expires; team/account scopes can differ |
| GitHub Copilot | Supported | Saved GitHub token or local Copilot/`gh` authentication | Paid AI credits, free chat/completions, extra use, org-managed personal counts, and authorized organization billing | Org billing requires permission and is optional; org-managed counts without a denominator stay scalar |
| Windsurf | Supported | Existing Windsurf app web session; local app cache fallback | Daily/weekly allowance, messages and Flow actions | Local-cache mode can be stale and is labeled local; web-session fields/endpoints can change |
| Devin | Supported | `devin` CLI login or Devin app credentials | Daily and weekly allowance, plan and extra balance | Requires a current Devin CLI/app sign-in; plan/API availability can vary |
| Kiro | Supported | Installed, signed-in Kiro CLI | Base credits, bonus credits/expiry, plan and identity | Depends on CLI availability/output; managed plans may not expose a denominator |
| Kimi | Supported | Existing Kimi CLI credentials; configured Kimi key fallback | Session and weekly quota plus returned plan metadata | Requires usable Kimi sign-in; missing windows remain unavailable rather than zero |
| Grok | Supported | Grok CLI/app credentials; saved session fallback | Live weekly billing/reset and PAYG status; completed-turn token/model/day history with copied events deduplicated | Only recorded completed events enter history; missing recorded cost stays unknown; local history is device-local |
| Gemini | Supported | Local Gemini CLI history | Session count, active days, and most recent activity | Activity estimate only: Gemini does not supply quota windows here; configured plan-price value is hypothetical |
| Amp | Supported | Imported/saved Amp web session, then signed-in Amp CLI fallback | Regenerating web credit pool/reset or CLI credit balance | CLI balance has no reliable quota denominator/reset; web sessions expire |
| Antigravity | Supported | Running Antigravity/`agy` language server, then app/CLI Keychain credentials | Shared Gemini/non-Gemini session and weekly pools, plan/project metadata, supported local conversation token history | Requires a running/signed-in client or discoverable credentials; shared pools are intentionally not duplicated per model; local database coverage is format-specific |
| OpenAI API | Supported | OpenAI Admin key or API key | Admin 30-day spend, tokens, requests, model/day breakdowns; legacy credit balance where available | Admin reporting requires organization permission; ordinary API keys can provide less billing data; 30-day spend is not a subscription quota |
| OpenRouter | Supported | OpenRouter API key | Purchases, lifetime spend, current balance, daily/weekly/monthly spend, key spend/remaining and hard cap | Lifetime spend plus balance is not a reset window; key-detail endpoints/scopes may be unavailable |
| Z.ai | Supported | Z.ai/GLM API token with global or BigModel China endpoint selection | Token/credit session and long windows, resets, monthly web-search use, model-token history, plan | Requires an active GLM Coding Plan for quota; optional model endpoint failure preserves primary quota; regional schemas can differ |
| Moonshot / Kimi API | Experimental | Moonshot API key; international or China endpoint | Available/cash/voucher balance and deficit | Balance only, with no reset/expiry contract; endpoint/region coverage is not fully verified |
| Kimi K2 | Experimental | Kimi K2 API key | Consumed/remaining credits and average token amount when returned | Credit response shapes vary; no reliable reset is reported |
| Mistral | Experimental | Mistral browser-session cookie | Billing-period spend, tokens, model count and reset/end date | Uses a web session and billing response that can change; sign-out invalidates auth |
| DeepSeek | Experimental | DeepSeek API key | Current and topped-up balance | Spend/percentage can be inferred from configured cap; no provider reset window is available |
| Ollama Cloud | Experimental | Native `ollama signin`, then saved key or scoped browser session | Native/web session and weekly quota; plan/account; API connectivity, model count and recent charges where returned | API-key mode may prove access without quota percentages; native sign-in and web schemas can change |
| Vertex AI | Experimental | Google application-default credentials/`gcloud`; local Claude-on-Vertex logs can work alone | Cloud Monitoring quota series plus local token/model/day history | Requires project selection and Monitoring/IAM access; quota reset time is unavailable; logs cover this device only |
| AWS Bedrock | Experimental | Saved or environment-provided AWS access key, secret, optional session token and region | Cost Explorer month-to-date spend, optional monthly budget, region and daily cost history | Shared-profile/role discovery is not implemented; Cost Explorer data is delayed; IAM permission and account-level billing access are required |

## Metric behavior shared across providers

- Provider-reported quota percentages and resets are kept as separate resources. MaxxToken does not merge unrelated windows.
- Scalar credit/cash balances stay scalar unless the provider supplies a trustworthy total.
- Missing data is unavailable, not zero. A transient failure can display a timestamped last-good snapshot.
- Forecasts appear only on eligible fresh quota windows with a valid future reset. They are estimates at the observed pace.
- Local token logs measure supported activity on this device. Account dashboards can include other devices, teammates, deleted sessions, or provider-side adjustments.
- Pricing coverage is independent from token coverage. Partial cost totals identify unpriced models; unknown prices remain unknown.

The registry also contains internal/hidden adapters. They are omitted because they are not exposed product integrations and must not be inferred as supported from an icon or adapter file.
