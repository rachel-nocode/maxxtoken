# DATA_GAPS — Token Coach (PRD section 7)

Missing or partial fields, each with a proposed workaround. Per PRD rule 3: never fake these.

## G1 — Codex `cache_creation_tokens`: NOT EMITTED
Codex rollouts report `cached_input_tokens` (cache reads) but no cache-write counter.
**Workaround:** compute R3 cache-hit ratio as `cached_input_tokens / input_tokens` only.
Verdict copy for Codex must say "cache hits" and never claim cache-write costs. Hide any
cache-creation-based sub-insight for Codex sessions entirely.

## G2 — Claude effort level: STRING-EMBEDDED, NOT A CLEAN FIELD
Effort appears inside `type:"attachment"` rows as escaped JSON (`"effort\":{\"level\":\"medium\"}`),
not as a structured column on assistant rows.
**Workaround (two-tier):**
1. Cheap heuristic: scan attachment rows per session for the last `"effort\":{\"level\":\"(\w+)\"}` match; treat as session-level effort.
2. Fallback: model name as effort proxy (fable/opus = high-cost class, sonnet = mid, haiku = low).
If neither resolves → R2 skips that session (no partial verdicts).

## G3 — `~/.maxxtoken/usage-history.json` currently EMPTY (0 bytes) — ✅ FIXED
Root cause: the snapshot worker is `child.kill()`ed by the main process as soon as it posts its
result, and `writeHistory` used fire-and-forget `fs.promises.writeFile` — which truncates before
writing. SIGTERM in that window left a 0-byte file; the next surviving write self-healed it, so
the corruption was intermittent. Fixed in `lib/usage-history.js`: synchronous atomic write
(pid-suffixed tmp + rename) — readers see old or new content, never torn. Regression test in
`test/usage-history-write.test.js`.
R4 still runs from BOTH feeds (Codex in-band `rate_limits` + Claude usage-history samples);
Claude samples now accumulate reliably for the limit forecast.

## G4 — Claude limit EVENTS (the actual "you hit the wall" moment): INDIRECT
Anthropic OAuth usage API gives utilization %, not a discrete "limit reached" event. The transcript
does not log 429s/limit refusals as structured rows.
**Workaround:** derive events: utilization sample ≥ 100% (or `quota-notifications.json` warning
threshold fired) = limit event at that sample's timestamp. Precision is bounded by the app's polling
interval — verdict evidence must show "around HH:MM", not fake precision.

## G5 — Per-request prompt CHARACTER length for Claude sidechains
Subagent (sidechain) user rows exist but parent/child attribution for prompt length is heuristic
(`isSidechain`, `/subagents/` path role).
**Workaround:** R2 evaluates parent-session prompts only in v1; sidechain traffic is counted toward
session totals (R1) but excluded from effort-mismatch prompt sampling.

## G6 — "Diff size" for R2/R6 task classification
Neither agent logs a structured diff size per turn.
**Workaround:** v1 proxy = `output_tokens` of the turn. v1.1 may parse tool-use blocks for
Edit/Write payload sizes (Claude transcripts contain them; Codex `response_item` rows too).

## G7 — Limit-tier denominators (what 100% MEANS in tokens)
Both providers report percentages, not absolute token quotas, so "Cost: X tokens AND % of weekly
limit" (PRD card anatomy) can state observed tokens and observed %-movement, but not an exact
tokens-per-% conversion.
**Workaround:** compute an empirical tokens-per-% rate from same-window deltas (tokens consumed
between two samples ÷ %-points moved). Show "≈" and only when ≥2 clean samples exist in the window;
otherwise the card shows tokens + % separately without equivalence.

## G8 — "License validation is the ONLY network call" (spec 15.1): pre-existing outbound calls, audited
Licensing itself adds exactly one endpoint (`api.polar.sh/v1/customer-portal/license-keys/*`,
key + machine label only — never usage data). The app already makes these other outbound calls,
all core free-tracker function or user-initiated, none sending local usage data anywhere:
- **Provider usage adapters** (`lib/adapters/*.js`, ~45 providers): READ the user's own usage
  from each provider's API with the user's own credentials. Inbound data, nothing uploaded.
- **Auto-updater** (`electron-updater` → GitHub releases): version checks + downloads.
- **models.dev pricing** (`lib/models-dev-pricing.js`): public price table fetch.
- **Missions idea generation** (`lib/ideas.js`, `lib/llm.js`): user-initiated LLM calls.
**Resolution:** spec principle reads as "licensing introduces no new data egress" — holds.
The positioning line "your data never leaves your machine" stays accurate: usage analysis
(Token Coach verdicts) runs 100% on-device; verdict content is never transmitted.
