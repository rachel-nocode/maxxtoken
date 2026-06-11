# DATA_AUDIT — Token Coach (PRD section 7)

Audited 2026-06-10 on branch `token-coach`, real local data on Rachel's machine.
Per PRD: every required field, where it comes from, whether it exists today, one real sample value.

## Claude Code (agent type: `claude-code`)

Source of truth: transcript JSONL files at `~/.claude/projects/<project-slug>/*.jsonl`
(roots resolved by `desktop/lib/adapters/claude.js` → `claudeProjectsRoots()`, honors `CLAUDE_CONFIG_DIR`).
Live quota: Anthropic OAuth usage API (`https://api.anthropic.com/api/oauth/usage`) read by `adapters/claude.js`.

| Field | Source | Available today? | Sample value |
|---|---|---|---|
| session_id | `sessionId` on every transcript row | ✅ YES (in raw rows; **current parser drops it** — `parseClaudeTokenUsageFromText` keeps messageId/requestId only) | `"dd848c6f-8e09-485e-9a4c-3372e4c08d60"` |
| message timestamps | `timestamp` on every row (ISO 8601) | ✅ YES | `"2026-06-11T03:07:41.793Z"` |
| input_tokens per request | `message.usage.input_tokens` on `type:"assistant"` rows | ✅ YES (already parsed by `usageFromRow()`) | `25333` |
| output_tokens per request | `message.usage.output_tokens` | ✅ YES | `241` |
| cache_read_tokens | `message.usage.cache_read_input_tokens` | ✅ YES | `15458` |
| cache_creation_tokens | `message.usage.cache_creation_input_tokens` (plus `cache_creation.ephemeral_1h/5m` split) | ✅ YES | `7459` |
| model name | `message.usage` sibling `message.model` | ✅ YES (parsed, dedup keyed) | `"claude-fable-5"` |
| effort level | string-embedded inside `type:"attachment"` rows (`"effort\":{\"level\":\"medium\"}`); also user setting in `~/.claude/settings.json` | ⚠️ PARTIAL — needs string-scan heuristic, not a clean field | `{"level":"medium"}` |
| limit/quota events | OAuth usage API `five_hour` / `seven_day` `utilization` + `resets_at` (live); sampled over time into `~/.maxxtoken/usage-history.json` by `desktop/lib/usage-history.js` (`samples[]` per providerId/windowLabel, 120-day retention, 12k cap) | ✅ YES live; ⚠️ history file currently **empty (0 bytes)** on this machine — see DATA_GAPS | `usedPct: 11` (5h window), `quota-notifications.json`: `"claude": { "remaining": 89 }` |
| rolling window state | same as above + `~/.maxxtoken/quota-notifications.json` (`sessions.<provider>.remaining`, `warnings.<provider>:<window>`) | ✅ YES | `"codex:session": { "lastRemaining": 95 }` |
| agent type | implied by source tree (`~/.claude/projects` vs `~/.codex/sessions`) | ✅ YES | `claude-code` |
| prompt length (R2) | `type:"user"` rows → `message.content` text length; `promptId`, `promptSource`, `permissionMode`, `gitBranch`, `cwd` also present | ✅ YES (content stays local, only lengths used) | user row keys: `cwd, entrypoint, gitBranch, isSidechain, message, parentUuid, permissionMode, promptId, promptSource, sessionId, timestamp, type, userType, uuid, version` |
| sidechain/subagent flag | `isSidechain` + path role (`/subagents/`) | ✅ YES (parsed) | `false` |

## Codex (agent type: `codex`)

Source of truth: rollout JSONL files at `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`
(parsed by `desktop/lib/adapters/codex.js` → `rolloutFiles()`, `parseCodexTokenSnapshots()`).

| Field | Source | Available today? | Sample value |
|---|---|---|---|
| session_id | `session_meta` row + `payload.session_id` (adapter already resolves, codex.js:668) | ✅ YES | `"019eb455-dc56-7353-b9e9-5188f5b6ead7"` |
| message timestamps | `timestamp` on every rollout line | ✅ YES | `"2026-06-11T01:40:03.786Z"` |
| input_tokens per request | `event_msg` / `token_count` → `info.last_token_usage.input_tokens` | ✅ YES | `24374` |
| output_tokens per request | `info.last_token_usage.output_tokens` (+ separate `reasoning_output_tokens`) | ✅ YES | `558` (+ `224` reasoning) |
| cache_read_tokens | `info.last_token_usage.cached_input_tokens` | ✅ YES | `2432` |
| cache_creation_tokens | — not emitted by Codex | ❌ NO (see DATA_GAPS G1) | — |
| model name | `turn_context.model` / `response.model` (adapter resolves per turn, strips `openai/` prefix) | ✅ YES | `"gpt-5.3-codex"` class |
| effort level | `turn_context` → `"effort":"medium"` | ✅ YES (clean field) | `"medium"` |
| limit/quota events | `rate_limits` object on **every** token_count event: `primary` (5h) / `secondary` (weekly) `used_percent`, `window_minutes`, `resets_at`, `plan_type` | ✅ YES — best-in-class; per-event rolling state | `primary: { used_percent: 4.0, window_minutes: 300, resets_at: 1781152955 }` |
| rolling window state | same (in-band, timestamped) | ✅ YES | `secondary: { used_percent: 7.0, window_minutes: 10080 }` |
| agent type | source tree | ✅ YES | `codex` |
| prompt length (R2) | `response_item` rows with `role:"user"` content | ✅ YES | — |
| context window size | `info.model_context_window` | ✅ YES (bonus — enables long-thread % full) | `258400` |

## Existing app infrastructure to reuse

| Piece | Path | Relevance to Token Coach |
|---|---|---|
| Optimize signal engine | `desktop/lib/optimize-detect.js` (1097 lines) | Existing detector/signal pattern; Verdict engine follows same shape |
| Window history sampler | `desktop/lib/usage-history.js` | R4 limit-collision + limit forecast feed |
| Quota warnings state | `desktop/lib/quota-notifications.js` → `~/.maxxtoken/quota-notifications.json` | Limit events (thresholds fired per window) |
| Per-request Claude scan | `adapters/claude.js` → `scanClaudeTokenUsage()` | Extend to keep `sessionId`/`uuid`/prompt-length → session grouping for R1/R5 |
| Per-turn Codex scan | `adapters/codex.js` → `parseCodexTokenSnapshots()` | Already session-keyed snapshots |
| Compact snapshot | `desktop/lib/widget-snapshot.js` → `~/.maxxtoken/widget-snapshot.json` | Daily totals incl. input/cached/output split per day |
| Model ranking | `desktop/lib/model-fit.js` | "What to do instead" half of R2/R6 verdicts |
| Preflight estimate | `desktop/lib/preflight-estimate.js` | Limit forecast ("at this pace you hit the wall at 3pm") |

## Rule feasibility verdict (v1)

| Rule | Feasible today? | Notes |
|---|---|---|
| R1 Long-thread bleed | ✅ | Both agents: per-request input_tokens + session grouping. Claude needs parser to keep sessionId (small change). Codex bonus: `model_context_window` gives exact %-full. |
| R2 Effort mismatch | ✅ Codex / ⚠️ Claude | Codex effort is a clean field. Claude effort needs attachment-row heuristic or model-name proxy. |
| R3 Cache misses | ✅ | Claude: full cache fields. Codex: cache_read available (`cached_input_tokens`); ratio computable without cache_creation. |
| R4 Limit collision | ✅ | Codex: in-band rate_limits per event. Claude: usage-history samples + quota-notifications thresholds. |
| R5 Stale-session restart | ✅ (v1.1) | Timestamps + session gap computable both agents. |
| R6 Model overkill | ⚠️ (v1.1) | Model per request available both; "task class" needs prompt-length + diff-size heuristics. |
