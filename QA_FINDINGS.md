# QA_FINDINGS — Token Coach Loop 4 gauntlet

Hostile-QA pass per PRD section 12 Loop 4, run 2026-06-10 on branch `token-coach`.
Scenarios live as permanent regression tests in `desktop/test/token-coach-qa.test.js` (10 tests).

## Findings (all fixed in this pass)

### F1 — One rule could monopolize the Daily Verdict ✅ FIXED
**Repro:** run engine on real local data (147 sessions). All 5 card slots filled with R1
long-thread verdicts; R2/R3/R4 insights invisible.
**Fix:** `maxCardsPerRule: 2` in config, enforced in the engine after waste ranking.
**Regression test:** "QA: 100 sessions stay within card caps and finish fast".

### F2 — R1 and R3 double-billed the same tokens ✅ FIXED
**Repro:** 6 uncached long threads → R1 flags each session AND R3 counts the same sessions
as cache misses; two cards describe the same waste with contradicting fixes.
**Fix:** engine runs R1 first and excludes R1-flagged sessionIds from R3's pool. R1 wins
because "start a fresh chat" is the more specific fix; R3 remains for the diffuse
many-small-sessions pattern.
**Regression test:** "QA: R1-flagged sessions are not double-billed by R3".

### F3 — 🟢 good-habit card missing entirely ✅ FIXED
**Repro:** PRD section 5 specifies GOOD HABIT severity (max 1/day); engine had no green path —
a clean user saw a blank screen instead of reinforcement (and section 10 wants ≥1 verdict/day).
**Fix:** two deterministic green cards in the engine, observed numbers only:
- `green-cache` — overall cache hit ratio ≥ 70% across ≥3 sessions ("X% of re-reads came from
  cache — N tokens you did not pay full price for").
- `green-clean` — ≥3 sessions, zero waste verdicts.
Green appends only when a card slot is free (never displaces waste) and never fires from a
single session.
**Regression tests:** greenCache, greenClean, and never-displaces tests.

## Gauntlet results (PRD scenarios)

| Scenario | Expected | Result |
|---|---|---|
| Empty data | gracefully nothing | ✅ `[]`, no crash (also null/`{}` inputs) |
| 1 session | nothing (no single-point judgments) | ✅ no green from one data point; R1 only if genuinely long |
| 100 sessions | ≤5 cards, fast | ✅ <1s, caps hold |
| Corrupted log lines | skip bad lines, keep verdicts | ✅ 150 corrupted lines interleaved — R1 still fires |
| Codex-only user | Codex verdicts, zero Claude wording | ✅ string-level assertion |
| Never hit limits | no R4 card | ✅ slow climbs never flag |

## Real-data smoke (this machine, 7 days)

Before fixes: `R1:red ×5` (monopolized).
After fixes: `R1:red ×2 · R2:yellow · GREEN:green` — diverse, capped, ends on reinforcement.

## Known remaining gaps (tracked, not blockers)

- **G3** `usage-history.json` empty → Claude-side R4/forecast dark until fixed (task #9).
- **R2 Claude** skipped by design until the effort attachment-row heuristic lands (G2).
- Pre-existing `opencode-go` test failure — unrelated to Token Coach (task #10).
