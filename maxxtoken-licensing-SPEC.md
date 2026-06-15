# SPEC: maxxtoken — Licensing & Paywall (Addendum to Token Coach PRD)

> **Companion to `maxxtoken-diagnosis-PRD.md`. Give BOTH files to your agent.**
> Sections continue PRD numbering. PRD sections 1–13 remain unchanged except 8 (superseded below).

---

## 14. Pricing (supersedes PRD section 8)

| | Free Tracker | Token Coach |
|---|---|---|
| Live usage tracker + charts | ✅ | ✅ |
| Daily Verdict cards (R1–R4) | — | ✅ |
| Weekly report | — | ✅ |
| Limit forecast | — | ✅ |
| Price | $0 | **$39 one-time** |
| Updates | always | **includes 1 year of updates**; app works forever after |

Positioning line (use in-app and on site): *"Pay once. Runs local. Your data never leaves your machine."*

> Future "Pro" subscription is explicitly OUT OF SCOPE for this spec. Do not scaffold for it.

## 15. Licensing principles (hard constraints)

1. **Local-first stays true.** License validation is the ONLY network call the app ever makes. Usage data is never sent — not even anonymized — during validation.
2. **Offline must work.** A valid license cached locally keeps all paid features working with no internet, indefinitely. Validation server down ≠ locked-out customer.
3. **No DRM arms race.** One honest gate. No obfuscation sprints, no hardware fingerprinting beyond a simple machine count. Pirates were never customers.
4. **Fail open, log quietly.** If validation errors ambiguously (timeout, 5xx), keep features unlocked during grace period and retry silently. Never punish paying users for our outages.
5. **One source of truth in code:** a single `licenseState` — everything gates off it. No scattered `isPaid` booleans.

## 16. Provider & purchase flow

- **Merchant of record: Polar** (handles checkout, global sales tax/VAT, license key issuance + validation API). Fallback acceptable: Lemon Squeezy — same shape, agent should abstract behind one `LicenseProvider` interface either way.
- Product: "maxxtoken Token Coach — Lifetime" @ $39. License policy: key valid forever, **activation limit: 3 machines**, deactivation allowed (user can free a seat).

### Flow
```
App (locked) → [Unlock Token Coach $39] → opens checkout in browser
→ user pays → Polar emails license key
→ user pastes key in app → app calls validate/activate API
→ success: store license record locally → unlock
```

No accounts. No login. Email + key only.

## 17. License states (the state machine)

```
UNLICENSED → (key activated) → LICENSED
LICENSED → (revalidation fails: refunded/disabled key) → REVOKED
LICENSED → (revalidation unreachable > grace period) → GRACE
GRACE → (successful revalidation) → LICENSED
GRACE → (grace expired, still unreachable) → stays GRACE  ← never auto-lock on network failure
REVOKED → UNLICENSED (paid features lock, free tracker untouched)
```

| State | Paid features | UI |
|---|---|---|
| UNLICENSED | locked | upsell surfaces (section 19) |
| LICENSED | unlocked | license info in Settings |
| GRACE | **unlocked** | tiny non-blocking "couldn't verify license" note in Settings only |
| REVOKED | locked | "License no longer valid" + re-enter key field |

### Revalidation policy
- Validate on activation, then re-validate **silently at most once per 7 days**, only when app is already running and online.
- Grace period: **30 days** of failed/unreachable checks before even *considering* state changes — and per the table above, unreachable NEVER locks. Only an explicit "key revoked/refunded" API response locks.

## 18. Local license record

Stored in OS-appropriate app data dir (Keychain/DPAPI-protected where easy; plaintext JSON acceptable per principle 3 — do not over-engineer).

```json
{
  "key": "XXXX-...",
  "email": "user@example.com",
  "activatedAt": "ISO8601",
  "lastValidatedAt": "ISO8601",
  "status": "LICENSED",
  "machineId": "stable-uuid-generated-once"
}
```

`machineId`: random UUID generated on first run and persisted — NOT derived from hardware serials.

## 19. Paywall UX

### Gating surfaces (free users)
1. **Verdicts tab:** render 1 REAL verdict from their own data, blurred/teased below the fold card: *"3 more verdicts found today — Unlock Token Coach $39"*. Their own waste is the best sales pitch. If no verdicts exist, show example card clearly labeled "EXAMPLE".
2. **Weekly report + forecast:** locked tiles with one-line description + unlock button.
3. **Settings → License:** key entry field, always available.

### Rules
- Never interrupt the free tracker with modals. No nags on launch. Upsell lives only where paid value lives.
- Unlock is instant — no restart required.
- Visual: locked tiles follow PRD section 11 aesthetic; lock state uses dimmed cards + #FF6B00 unlock button.

## 20. Data contract additions

Agent: extend DATA_AUDIT.md with:
- App data directory path per OS for the license record
- Confirmation that license validation endpoint is the only outbound network call (audit existing code for any other calls; list them in DATA_GAPS.md if found)

## 21. Edge cases & acceptance criteria

| # | Scenario | Required behavior |
|---|---|---|
| E1 | Paste invalid/typo'd key | Inline error, no state change, retry allowed |
| E2 | Key already on 3 machines | Error explains limit + how to deactivate (link to Polar portal) |
| E3 | Offline at activation time | Clear "need internet once to activate" message; free tier unaffected |
| E4 | Offline for 6 months while LICENSED/GRACE | Everything still works |
| E5 | Refund issued in Polar | Next successful revalidation → REVOKED; free tracker still works |
| E6 | Clock tampering | Ignore. Per principle 3, not worth defending |
| E7 | User deletes license file | Back to UNLICENSED; re-pasting key re-activates (counts as same machine via stored... it's gone — counts as new activation; acceptable, that's what 3 seats are for) |
| E8 | Validation API returns 500 | Treat as unreachable → GRACE rules, retry next cycle |

**Ship gate:** all 8 edge cases have automated tests or documented manual test results in QA_FINDINGS.md.

## 22. Non-goals

- No subscriptions, no trials with timers, no accounts/auth, no cloud sync
- No telemetry/analytics added alongside licensing ("zero tracking" is part of the pitch)
- No regional pricing, coupons, or upgrade paths in v1 (Polar dashboard can handle discounts manually)

---

# 23. PROMPT LOOPS (continues PRD loop numbering)

## Loop 6 — Provider abstraction + activation
```
Read maxxtoken-diagnosis-PRD.md and this licensing spec (sections 14–22).
Implement:
1. LicenseProvider interface (activate, validate, deactivate) with a Polar
   implementation. Keep provider-specific code behind the interface.
2. Local license record per section 18, stored per section 20 paths.
3. The license state machine per section 17 as a pure, unit-tested module.
No UI yet. Tests: every transition in the state machine diagram, plus E1, E5, E8.
Stop and show me the state machine test output.
```

## Loop 7 — Gating & paywall UI
```
Read spec sections 15, 17, 19 and PRD section 11. Implement:
1. Single licenseState source of truth; gate Verdicts, weekly report, and
   forecast off it. Free tracker code paths must be untouched.
2. Verdicts-tab tease: 1 real verdict visible, rest locked, per section 19.
3. Settings → License screen: key entry, status display, GRACE note.
Dark brutalist, #FF6B00 unlock buttons, screenshot-worthy locked state.
No nag modals anywhere — verify by grepping for modal triggers on launch.
```

## Loop 8 — Revalidation + grace behavior
```
Read spec section 17. Implement silent 7-day revalidation and 30-day grace:
- Only runs when app is open and online; never blocks UI.
- Unreachable/5xx → GRACE (features stay unlocked). Only explicit
  revoked/refunded response → REVOKED.
Tests: E4 (6 months offline), E5, E8, and a fake clock advancing through
the full LICENSED → GRACE → LICENSED cycle.
```

## Loop 9 — Hostile QA gauntlet (licensing edition)
```
Act as a hostile QA engineer. Run every edge case E1–E8 from spec section 21
against the built app. Also verify: (a) the ONLY outbound network call is
license validation — capture and list all network activity, (b) free tracker
works identically with no license file present, (c) unlock requires no
restart. File all failures in QA_FINDINGS.md with repro steps. The ship gate
is section 21 — do not declare done until it passes.
```

---

## 24. Build order

1. Polar account + create $39 lifetime product (manual, ~20 min, do this first so the API is real)
2. Loop 6 (provider + state machine)
3. Loop 7 (gating + paywall UI)
4. Loop 8 (revalidation/grace)
5. Loop 9 (QA gauntlet) — ship gate
6. Launch thread on X: free tracker → "it found where my tokens were bleeding" → $39 unlock
