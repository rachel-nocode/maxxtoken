# PRD: maxxtoken — Token Coach (Paid Diagnosis Layer)

> **Give this entire file to your agent as context before any coding session.**
> Free tier = the existing tracker. Paid tier = plain-English verdicts about token waste.

---

## 1. One-liner

maxxtoken Token Coach turns raw AI usage data into **plain-English verdicts** that tell users exactly where they wasted tokens and what to change — so $20–100/mo Claude Code & Codex users stop hitting limits without upgrading.

## 2. Problem

- Users on lower-tier plans constantly hit usage limits and complain publicly (especially Claude Code users).
- Free trackers (Open Usage, Codex Bar, maxxtoken free) show **charts, not answers**.
- Even power users (including the founder) look at their own usage data and "don't know what they're looking at."
- The fixes are known (effort levels, fresh threads, prompt caching, model choice) but buried in repos/docs only experts read.

## 3. Target user

"The Limit Complainer": pays $20–$200/mo for Claude Code and/or Codex, hits limits weekly, is NOT an AI researcher, wants someone to just tell them what to change.

## 4. Product principles (agents: treat these as hard constraints)

1. **Verdicts, not charts.** Every insight is a sentence a 10th grader understands. Charts are supporting evidence only.
2. **Every verdict has 3 parts:** WHAT happened → WHAT it cost → WHAT to do instead.
3. **Never guess.** If data is insufficient for an insight, hide that insight. No hallucinated numbers.
4. **Local-first.** All analysis runs on-device. No usage data leaves the machine. (Brand promise + zero API costs.)
5. **Cross-platform, multi-agent.** Claude Code + Codex from day one. macOS + Windows.

## 5. Core feature: The Daily Verdict

A single screen (and optional menu-bar summary) showing 1–5 verdict cards, ranked by tokens wasted.

### Verdict card anatomy
```
[SEVERITY ICON] [TITLE — max 8 words]
What happened: <1 sentence, plain English>
Cost: <tokens AND % of daily/weekly limit AND "≈ X hours of usage">
Fix: <1 imperative sentence>
[Evidence ▸] (collapsible: the sessions/numbers behind the verdict)
```

### Severity levels
- 🔴 WASTE ≥ 20% of period limit
- 🟡 WASTE 5–20%
- 🟢 GOOD HABIT (positive reinforcement, max 1 per day)

## 6. Detection rules (v1 — deterministic, no LLM needed)

| ID | Rule | Trigger | Required data fields |
|---|---|---|---|
| R1 | **Long-thread bleed** | Single session > N messages or > X tokens of resent context | session_id, per-message input_tokens, timestamps |
| R2 | **Effort mismatch** | High effort/model used on short prompts (< Y chars) with small diffs | effort/model per request, prompt length, output size |
| R3 | **Cache misses** | cache_read_tokens / input_tokens below threshold across sessions | cache_read_tokens, cache_creation_tokens, input_tokens |
| R4 | **Limit collision** | Usage spike within Z minutes of hitting limit | timestamps, limit events, rolling window usage |
| R5 | **Stale-session restart** | Resumed old session instead of fresh thread for a new task (heuristic: time gap > 4h, topic shift) | session_id, timestamps |
| R6 | **Model overkill** | Premium model on tasks where cheaper model output was identical-class (rename, format, small edit) | model, prompt classification |

> **Agent instruction:** Implement R1–R4 first. R5–R6 are v1.1. Thresholds (N, X, Y, Z) live in one config file — never hardcode.

## 7. Data contract

**Agent: before implementing ANY rule, run a data audit.** For each field below, output a table: `field | source (file/API/log path) | available today? | sample value`.

Required fields:
- session_id, message timestamps
- input_tokens, output_tokens per request
- cache_read_tokens, cache_creation_tokens
- model name, effort level (if exposed)
- limit/quota events or rolling window state
- agent type (claude-code | codex)

If a field is unavailable → flag it in `DATA_GAPS.md` with a proposed workaround. Do not fake it.

## 8. Tiers

| | Free | Token Coach (paid) |
|---|---|---|
| Live usage tracker | ✅ | ✅ |
| Pretty charts | ✅ | ✅ |
| Daily Verdict cards | — | ✅ |
| Weekly report ("Your week in tokens") | — | ✅ |
| Limit forecast ("at this pace you hit the wall at 3pm") | — | ✅ |
| Price | $0 | $6/mo or $49 lifetime |

## 9. Non-goals (v1)

- No team features. No cloud sync. No browser extension.
- No "extend your limits" claims — we reduce waste, we don't hack quotas.
- No LLM-generated insights in v1 (deterministic rules only — keeps it free to run, trustworthy, and local).

## 10. Success metrics

- A non-expert reads a verdict and can repeat the fix back in their own words (hallway test).
- ≥ 1 verdict/day for an active user with zero "insufficient data" errors shown.
- First 10 paying users from one X thread demoing the Daily Verdict.

## 11. Visual direction

Existing maxxtoken aesthetic: dark industrial/brutalist, orange accent #FF6B00, Space Grotesk headers, JetBrains Mono numbers. Verdict cards must look screenshot-able — they ARE the marketing.

---

# 12. PROMPT LOOPS (copy-paste these into Claude Code / Codex)

## Loop 0 — Data audit (run FIRST, once)
```
Read maxxtoken-diagnosis-PRD.md, section 7. Audit this repo and the local
data sources maxxtoken already reads. Produce DATA_AUDIT.md: a table of every
required field, where it comes from, whether it exists today, and one real
sample value. List missing fields in DATA_GAPS.md with proposed workarounds.
Do NOT write feature code yet.
```

## Loop 1 — One rule at a time (repeat per rule R1→R4)
```
Read maxxtoken-diagnosis-PRD.md sections 4–7 and DATA_AUDIT.md.
Implement rule R1 (Long-thread bleed) ONLY:
1. Pure function: takes parsed session data, returns Verdict objects matching
   the card anatomy in section 5 (what/cost/fix/evidence). No UI yet.
2. Thresholds from config, not hardcoded.
3. Unit tests with 3 fixtures: clear waste, borderline, clean session.
4. If data is insufficient, return nothing — never a partial verdict.
Stop after tests pass. Show me sample verdict output as JSON.
```

## Loop 2 — Plain-English pass (the part you struggle to prompt)
```
Here are verdict objects from rule R1: [paste JSON].
Rewrite each "what happened" and "fix" string so a smart 15-year-old who has
never heard the words "context window" or "prompt caching" understands it.
Rules: no jargon, max 20 words per sentence, use concrete comparisons
("re-sending your whole chat history every message"), imperative fixes.
Give me 3 variants per verdict. I will pick the winners and we lock them
as templates in verdicts/templates.ts.
```

## Loop 3 — Verdict card UI
```
Read PRD sections 5 and 11. Build the Verdict card component using the locked
templates. Dark brutalist, #FF6B00 accents, Space Grotesk/JetBrains Mono.
Severity icons per section 5. Evidence section collapsed by default.
Must look good in a screenshot at 600px wide (it will be posted on X).
Render with the 3 test fixtures from Loop 1. No new features.
```

## Loop 4 — Self-QA (your QA brain, automated)
```
Act as a hostile QA engineer. Read the PRD success metrics (section 10).
Test the Daily Verdict against: empty data, 1 session, 100 sessions,
corrupted log lines, a user who only used Codex, a user who never hit limits.
For each: does the app show a correct verdict, a 🟢 good-habit card, or
gracefully show nothing? File every failure as a GitHub-style issue in
QA_FINDINGS.md with repro steps.
```

## Loop 5 — Weekly report (after R1–R4 ship)
```
Read the PRD. Compose the "Your week in tokens" report: top 3 verdicts of
the week ranked by tokens wasted, one trend line, one 🟢 win. Output as a
single shareable image-ready view, same visual rules as Loop 3. This report
is also a marketing asset — it must make someone say "I need this."
```

---

## 13. Build order (don't let agents reorder this)

1. Loop 0 (data audit) — **today**
2. Loop 1 × rules R1–R4
3. Loop 2 (language lock)
4. Loop 3 (UI)
5. Loop 4 (QA gauntlet)
6. Ship paid beta to your 5 existing users + one X thread
7. Loop 5 (weekly report) only after first paying user
