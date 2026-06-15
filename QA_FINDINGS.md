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

---

# QA_FINDINGS — Licensing gauntlet (spec section 21 ship gate)

Run 2026-06-11 on branch `token-coach`. All 8 edge cases live as permanent automated
tests across `desktop/test/license-machine.test.js` (13), `license-manager.test.js` (18),
`license-polar.test.js` (12) — 43 tests, all passing.

## Edge-case coverage (spec section 21 table)

| # | Scenario | Test | Result |
|---|---|---|---|
| E1 | Invalid/typo'd key | manager: "E1: invalid/typo key → inline error, no state change, retry allowed"; polar: "404 → invalid_key" | ✅ inline error, UNLICENSED unchanged, retry succeeds |
| E2 | Key already on 3 machines | manager: "E2: activation limit reached…"; polar: "403 → limit_reached" | ✅ message explains limit + Polar portal link |
| E3 | Offline at activation | manager: "E3: offline at activation…"; polar: "timeout/network failure → unreachable" | ✅ "need internet once" message, free tier untouched |
| E4 | Offline 6 months while LICENSED/GRACE | machine: "GRACE stays GRACE forever…"; manager: "E4: offline for 6 months…" (26 weekly failed checks, fake clock) | ✅ unlocked the whole time, GRACE note only |
| E5 | Refund issued in Polar | machine + manager + polar revoked-status tests | ✅ next successful revalidation → REVOKED; free tracker unaffected (gate is Coach-screen-only) |
| E6 | Clock tampering | machine: "E6 clock tampering: clock moved backwards…" | ✅ ignored, never locks |
| E7 | User deletes license file | manager: "E7: user deletes license file…" | ✅ UNLICENSED; re-paste re-activates as new seat |
| E8 | Validation API returns 500 | machine + manager E8 tests; polar: "5xx → unreachable" | ✅ GRACE rules, stays unlocked, retries next cycle |

## Loop 9 hostile-QA checks

- **(a) Only licensing network call is license validation:** `lib/license/` greps clean —
  single endpoint `api.polar.sh/v1/customer-portal/license-keys`; request body field
  allowlist asserted in `license-polar.test.js`. Pre-existing app calls audited in
  DATA_GAPS.md G8 (none egress usage data).
- **(b) Free tracker identical with no license file:** gate exists ONLY in
  `burn-coach.js` (Coach screen render) — Home/Optimize/Missions/Settings code paths
  never read `licenseState` for gating. No-record state = UNLICENSED handled by
  "fresh install is UNLICENSED and locked" + corrupted-file test.
- **(c) Unlock requires no restart:** `burnActivateLicense()` updates
  `burnState.license` from the activate response and re-renders in place.
- **No nag modals:** zero launch-time license UI; upsell renders only inside the
  Coach screen + Settings → LICENSE group. No `dialog.show*` added anywhere in the
  licensing paths.
- **State machine never locks on network failure:** asserted by every UNREACHABLE
  transition test; only explicit revoked/invalid answers move to REVOKED.

## Known limitations (tracked, not blockers)

- `lib/license/config.js` ships with empty `organizationId`/`checkoutUrl` until the
  Polar product exists — activation returns "Licensing is not configured in this
  build" and the unlock button opens maxxtoken.app. Fill both after creating the
  product (manual step).
- Weekly report + limit forecast render as locked tiles per spec 19.2; the unlocked
  implementations are the next build loops (PRD Loop 5).
