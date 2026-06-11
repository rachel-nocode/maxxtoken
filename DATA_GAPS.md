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

## G3 — `~/.maxxtoken/usage-history.json` currently EMPTY (0 bytes)
`usage-history.js` writes async fire-and-forget; the file on this machine is empty even though
`quota-notifications.json` is current. Either snapshot recording isn't running on this build or a
write was truncated.
**Workaround:** R4 must run from BOTH feeds: Codex in-band `rate_limits` (always present in rollouts,
needs no app history) and Claude usage-history samples when ≥ `MIN_HISTORY_SAMPLES`. If Claude history
is empty → R4 emits Codex-only verdicts; never interpolate Claude limit timing.
**Action item:** debug why usage-history.json is empty before shipping the limit forecast (forecast
quality depends on it for Claude).

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
