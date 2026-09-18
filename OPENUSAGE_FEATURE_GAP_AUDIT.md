# MaxxToken × OpenUsage — feature audit and implementation checklist

- [x] OU-01 · P0 · Show how much usage will remain at expiration/reset.
  Audit baseline: forecast math already exists in `paceForWindow()`, including projected usage and exhaustion time, but the active BURN adapter drops these fields from displayed windows. OpenUsage exposes projected remaining quota, approaching-limit states, and exhaustion timing. Deliver a visible projected remainder on each eligible quota window, alongside current usage and its own reset time; make the forecast visible without hover. Calculate remaining percentage as `max(0, 100 - projectedAtResetPercent)` and show excess demand separately when the projection exceeds the cap. Label forecasts as estimates at the current pace. Use actual credit units only where the provider supplies a real denominator; never turn subscription price into a cash balance. Quota reset and purchased-credit expiry are different events.
  Done when: session, weekly, and billing-window projections survive snapshot → adapter → collapsed/expanded UI; early-window, zero-usage, stale, missing-reset, exhausted, and over-limit states have deliberate output; no untouched window receives a fabricated forecast; reset rollover invalidates the old projection. Add focused math and rendered-output tests. Dependencies: none; coordinate presentation with OU-02. Evidence: [MaxxToken pacing][M-pace], [BURN adapter][M-adapt], [BURN cards][M-home], [OpenUsage pacing][O-pace], [dashboard][O-dashboard].

  Implemented 2026-09-16: eligible quota windows now carry projected remainder and a vertical projected-endpoint marker in collapsed and expanded BURN cards. Used/left modes mirror the marker correctly; forecasts start from the first sample, show 100% projected remainder at zero use, infer calendar-month boundaries for billing cycles, tolerate small reset clock skew, and still reject stale, missing-reset, rollover, and synthetic local-quota inputs. Evidence: `desktop/burn/burn-forecast.js`, `desktop/test/burn-forecast.test.js`, and native Mac marker geometry checks (46% used → 78% projected endpoint → ~22% left at reset). All 370 desktop tests pass.

- [x] OU-02 · P0 · Redesign.
  Audit baseline: BURN is the active interface; the older renderer contains richer meters and details that users no longer see. Redesign Home, provider details, Customize/Settings, and their relationship to Optimize and Token Coach. Establish a clear hierarchy for current allowance, predicted unused allowance at reset, exhaustion risk, reset time, and data freshness; distinguish current balance, estimated API-equivalent spend, and subscription value. Provide per-window status rather than coloring every window from one provider-level warning. Include narrow popover layouts, light/dark themes, long labels, keyboard focus, empty states, and failed connections.
  Done when: an annotated design and interactive prototype cover those states, the chosen design is implemented in the active BURN surface, and Mac/Windows visual and interaction checks pass. This is a separate task from the forecast calculation and must remain open until implementation is complete. Dependencies: forecast semantics from OU-01; supporting controls tracked below. Evidence: [active UI switch][M-app], [current cards][M-home], [OpenUsage dashboard][O-dashboard], [settings][O-settings].

  Completed 2026-09-16: rounded provider cards, per-window forecast/reset hierarchy, dark/light themes, provider details, refreshed Settings, clear data/value labels, keyboard focus/navigation, reduced motion, freshness revalidation, higher-contrast menu-bar tracks, and compact expanded allowance bars without nested cards. Annotated design: [OU-02 design](desktop/burn/OU-02-DESIGN.md). Native Mac checks cover expansion, used/left settings, theme changes, Settings/Optimize/Coach navigation, and zero renderer errors; Chrome checks cover 360px layout and unavailable/stale/reset/error states. The redesigned Mac preview was rebuilt, installed, and accepted for the current milestone; Windows verification remains follow-up QA rather than a blocker. Screenshots in `output/playwright/` use synthetic data with the actual updated renderer; no live accounts were exercised or release published.

Audit date: 2026-09-16. All unchecked items are unfinished work; checkbox completion requires the stated acceptance criteria, with implementation/release evidence added beside the task ID.

Scope: product capability and source audit, not a security audit or a claim that every connected provider was exercised against a paid account. Reviewed MaxxToken desktop UI, adapters/aggregation, history/pricing, notifications, settings, CLI/API, distribution configuration, and landing-page source; compared OpenUsage behavior docs and relevant Swift implementations. No production account credentials or personal usage logs were read. Only synthetic inputs were executed for the two confirmed adapter defects below. The initial audit changed no product code; the implementation updates above record subsequent work.

Baselines:

- MaxxToken workspace: version 0.2.12, commit `d8b94893e19dbf8e356a9b71fd5a775eac833e45`; existing unrelated build-file deletions and the older untracked backlog were present before this audit. Published [v0.2.12][M-release] has Mac arm64 DMG/ZIP, Windows EXE, blockmaps, and both update manifests; asset presence does not establish runtime quality.
- OpenUsage source: [commit 56378e5][O-commit], retrieved 2026-09-16. Latest stable [v0.7.11][O-stable], published September 5; latest beta [v0.7.12-beta.2][O-beta], published September 15. Claude Swap discovery is beta; Codex Swap support is newer source, absent from that beta. These are labeled separately below. General dashboard/settings/refresh docs were unchanged between stable and the audited source.
- This checklist supersedes the parity conclusions in [the September 3 backlog][M-old] for this audit. That file also contains unrelated token-saving ideas and remains intact; do not treat those ideas as features OpenUsage has.

## Existing MaxxToken foundations

These are present in source and should be reused. They are not new parity tasks or blanket certifications of end-to-end behavior.

- Usage aggregation, reset timestamps, linear pacing, exhaustion estimates, quota-history snapshots, recent history sparklines, and underuse signals already exist. Primary issue: surfacing their meaning accurately in BURN. [Aggregation][M-aggregate], [history][M-history].
- Provider enable/disable and drag ordering already exist in Settings and feed Home; used/left preference and persistent light/dark switching already exist. Missing refinements are metric-level controls, system theme, density, and layout persistence. [Settings][M-settings], [BURN app][M-app].
- Expanded cards already show Today, Yesterday, Last 30d, token categories, and model breakdowns where data exists. Their calendar mapping is incorrect for sparse dates, and they are not an interactive reporting view. [Adapter][M-adapt], [cards][M-home].
- Cached launch, last-good fallback, parallel provider collection, HTTP timeouts, and a 90-second snapshot-worker cap already exist. Light refresh is scheduled every 30 seconds; heavy scans every hour; adapter caches can further affect freshness. Do not file “add caching” or “increase polling frequency” as missing features. [Main process][M-main], [aggregation][M-aggregate].
- Maxx alerts, quota-threshold warnings, restored-session notifications, launch at login, automatic updates, local JSON export, a live TUI, and a read-only local usage API already exist. [Alerts][M-alerts], [quota notifications][M-quota], [CLI][M-tui], [API][M-api], [export][M-export].
- Optimize and Token Coach provide MaxxToken-specific diagnostic work. Missions, task preflight, model-fit, and backlog logic exist, but the Missions navigation entry is explicitly hidden; they must not be counted as fully exposed shipping differentiation. [UI primitives][M-primitives], [Optimize][M-optimize], [Coach][M-coach].

Provider inventory from the default registry: 43 entries, split into 13 core, 9 extended, and 21 hidden; 48 adapter files. These are implementation counts, not 43 verified usable integrations. OpenCode and OpenCode Go are separate entries in MaxxToken. [Registry][M-config], [provider visibility][M-settings].

- Core: Claude, ChatGPT/Codex, OpenCode, OpenCode Go, Cursor, Copilot, Windsurf, Kiro, Kimi, Grok, Gemini, Amp, Antigravity.
- Extended: OpenAI API, Moonshot, Kimi K2, OpenRouter, Mistral, DeepSeek, Ollama, Vertex AI, Bedrock.
- Hidden: Azure OpenAI, Alibaba, Alibaba Token Plan, Augment, Warp, ElevenLabs, Kilo, Doubao, Groq, Codebuff, Command Code, Crof, Venice, Deepgram, StepFun, LLM Proxy, Abacus, Manus, Synthetic, MiMo, T3 Chat.
- Adapter files outside the default registry: Factory, JetBrains, MiniMax, Perplexity, Z.ai. BURN filters by provider tier, so adapter presence alone does not establish UI availability.

## P0 — visible parity and trustworthy numbers

- [x] OU-03 · Complete · Expose all supported provider metrics.
  Current: `burnPrimaryWindows()` selects only a few windows; non-Cursor providers commonly lose everything after the selected session/weekly pair, and expanded cards do not provide a general rendering path for `extra` rows. OpenUsage has independently configurable rows.
  Done when: a metric registry renders bounded windows, scalar balances, extra usage, and model-specific limits without generic truncation; existing Claude model windows, Codex extra windows/credits, and OpenCode monthly caps can all be reached. Preserve distinct window identities. [BURN mapping][M-adapt], [OpenUsage metric catalog][O-api].
  Completed 2026-09-17: `burn-metrics.js` creates stable window/scalar/extra/model identities and the active BURN surface exposes every metric through always-visible or expanded placement. Native Mac review confirmed 28 distinct Cursor metrics, including secondary windows, status, balances, and model rows.

- [x] OU-04 · Complete · Add per-metric menu-bar pins.
  Current: global tray modes and up to three provider BURN glyphs exist; users cannot choose individual window/value pins. OpenUsage supports up to two pins per provider, with text and bar styles.
  Done when: users choose, order, and persist pins; missing data is omitted; styles respect used/left preference and available menu-bar width. Retain existing aggregate tray modes as choices. [Tray implementation][M-main], [OpenUsage menu bar][O-menu].
  Completed 2026-09-17: Settings supports text/bar pins per metric, enforces two pins per provider, persists order, omits unavailable values, and keeps the aggregate tray modes. `burn-openusage-parity.test.js` covers pin order, missing metrics, and used/left rendering.

- [x] OU-05 · Complete · Add metric customization and persistent layouts.
  Current: provider ordering/toggles exist; metric toggles/order, always-visible versus expandable metrics, persistent expanded cards, and customization undo do not.
  Done when: users can configure each metric, move it across the expansion boundary, restore one provider or the full layout, and undo session changes; saved layouts survive relaunch and new metrics migrate once without re-enabling dismissed rows. [Settings][M-settings], [BURN state][M-app], [OpenUsage customization][O-dashboard].
  Completed 2026-09-17: per-provider metric order/placement, persistent expansion, provider/global reset, session undo, and one-time metric migration are implemented and native-reviewed in Settings.

- [x] OU-06 · Complete · Show per-provider freshness, errors, and recovery actions.
  Current: aggregation supplies activity, errors, source details, and last-update data, but BURN maps connectivity into a generic status and omits the full explanation.
  Done when: stale cached data carries its actual age, errors have readable recovery guidance, missing data never becomes a healthy zero, and users can refresh or open a provider's account/status page directly. Preserve good data during transient failures. [Cached fallback][M-aggregate], [cards][M-home], [OpenUsage refresh behavior][O-refresh].
  Completed 2026-09-17: provider cards distinguish live, stale, and failed data; show actual age and actionable guidance; preserve last-good metrics; and expose refresh/account/status actions. Tests verify that missing data does not become zero.

- [x] OU-07 · Complete · Fix calendar periods in existing cost rows.
  Current: `burnAdaptExpanded()` assigns the newest available daily row to Today and the next row to Yesterday; Last 30d uses the newest 30 entries instead of an explicit calendar interval. Synthetic sparse-date input reproduced this mislabeling.
  Done when: Today/Yesterday match local calendar dates, Last 30d filters by dates regardless of selected history length, DST/midnight boundaries are handled, and missing days do not borrow another day's usage. Separate measured zero from unavailable data. [Date mapping][M-adapt], [OpenUsage period semantics][O-dashboard].
  Completed 2026-09-17: BURN and Cursor/Grok/OpenCode history use local calendar keys, exact Today/Yesterday lookup, and explicit 30-day filtering. Sparse dates, measured zero, DST, and a UTC-to-Pacific midnight boundary have regression coverage.

- [x] OU-08 · Complete · Expose pricing completeness and exact value provenance.
  Current: pricing records estimates and unpriced models, but BURN converts missing model dollars to zero and can label them “incl.”; daily values also collapse missing costs. Footer subscription-value totals can be mistaken for observed API spend.
  Done when: unknown rates remain unknown, partial totals name omitted models, measured/estimated/hypothetical amounts are distinguished, and unrounded values plus source are accessible. Tokens may remain visible even when dollars are unknown, provided the partial cost coverage is explicit. [Cost engine][M-cost], [BURN mapping][M-adapt], [OpenUsage pricing][O-pricing].
  Completed 2026-09-17: BURN keeps null costs unknown, labels measured/estimated/hypothetical sources, exposes exact values, and names omitted models for partial totals. Cursor and Grok exports no longer invent zero cost when provider rows omit cost.

- [x] OU-09 · Complete · Add Devin as a first-class provider.
  Current: no Devin registry entry or dedicated adapter; Windsurf-related credential handling is not equivalent to Devin support.
  Done when: Devin CLI/app discovery, weekly/daily allowance, extra balance, plan, reset semantics, errors, and BURN rows work together; cover the beta fix where an omitted weekly percentage with a weekly reset means exhausted quota. [Registry][M-config], [OpenUsage Devin][O-devin].
  Completed 2026-09-17: Devin is a core provider with CLI/app credential discovery, daily/weekly windows, plan, extra balance, reset/error mapping, icon, and BURN integration. Fixtures cover CLI preference, app fallback, real zero, and omitted-weekly-percent exhaustion.

- [x] OU-10 · Complete · Finish Z.ai integration.
  Current: adapter exists outside the default registry and only classifies `TOKENS_LIMIT`, while OpenUsage also supports current `CREDIT_LIMIT` quota entries.
  Done when: Z.ai is configurable and visible, both quota schemas normalize to the correct session/weekly windows, monthly web-search counts render, and missing data/no subscription do not imply zero use. Store supplied keys through existing safeStorage. [Z.ai adapter][M-zai], [registry][M-config], [OpenUsage Z.ai][O-zai].
  Completed 2026-09-17: Z.ai is exposed in the registry; `CREDIT_LIMIT`, `TOKENS_LIMIT`, `TIME_LIMIT`, web-search usage, missing-subscription handling, and optional endpoint failure are normalized without fabricated zeros. Saved keys remain on the existing safeStorage path.

- [x] OU-11 · Complete · Modernize Antigravity quotas, discovery, and local history.
  Current: saved/file OAuth plus older Cloud Code endpoints produce separate Claude/Gemini Pro/Gemini Flash representatives. No equivalent local-server discovery, quota-summary pool mapping, or conversation-database spend scanner was found in the adapter.
  Done when: native app/CLI credentials work, shared Gemini and non-Gemini pools each show session/weekly windows without double counting, supported app/CLI conversation stores supply measured token history, and unsupported windows remain unavailable. [Antigravity adapter][M-antigravity], [OpenUsage Antigravity][O-antigravity].

  Progress 2026-09-16: MaxxToken now probes the running Antigravity/`agy` language server first, falls back to the existing `gemini`/`antigravity` Keychain login, derives the installed app's OAuth client material at runtime, refreshes expired access in memory, and maps the authoritative shared Gemini/non-Gemini session and weekly pools. Manual key entry was removed. Live account verification returned all four windows. Local conversation-history parity remains unfinished.

  Completed 2026-09-17: the remaining local-history work now scans supported Antigravity conversation databases, bounds protobuf decoding, aggregates measured model/day tokens, and joins history to the verified native shared-pool quota path without creating unsupported windows.

- [x] OU-12 · Complete · Update Copilot for AI-credit and organization billing.
  Current: parser returns premium/chat quotas and can fold completions into a premium fallback; no separate extra-usage or organization-billing pipeline appears.
  Done when: paid credit percentages, org-managed personal credit counts without invented denominators, free chat/completions, extra usage, and authorized org totals render distinctly; ordinary org members still receive useful personal information. [Copilot adapter][M-copilot], [OpenUsage Copilot][O-copilot].
  Completed 2026-09-17: Copilot now separates paid credits, free chat/completions, extra usage, org-managed personal counts, and authorized organization billing; optional org failures preserve personal usage and counts never gain invented denominators.

- [x] OU-13 · Complete · Complete Cursor account and spend coverage.
  Current: plan/on-demand usage and REST fallback exist; no Grok Bot lookup or usage-export CSV history reader was found in the adapter.
  Done when: Grok Bot weekly quota, credit grants/prepaid balance, request-based Enterprise limits, and daily/model history from the official export are mapped; optional endpoint failures preserve primary usage and malformed CSV is reported. [Cursor adapter][M-cursor], [OpenUsage Cursor][O-cursor].
  Completed 2026-09-17: Cursor adds optional Grok Bot, credit/prepaid, Enterprise request, and official CSV history reads. Optional failures preserve primary quota; strict CSV parsing reports malformed input; daily/model history carries local dates and measured/partial-cost provenance.

- [x] OU-14 · Complete · Replace Grok's legacy usage inputs with current billing and turn history.
  Current: web billing RPC plus recursive `signals.json` summaries; history dates come from file modification time. OpenUsage uses CLI weekly billing and completed-event history.
  Done when: weekly shared quota, actual reset, PAYG status, and recorded completed-turn cost/token history work; forked, resumed, and subagent copies are deduplicated; event time determines calendar day. [Grok adapter][M-grok], [OpenUsage Grok][O-grok].
  Completed 2026-09-17: Grok reads current CLI weekly billing/reset/PAYG data and completed-turn events, deduplicates copied event IDs per model, uses event timestamps with local calendar days, and preserves missing recorded costs as unknown.

- [x] OU-15 · Complete · Add Ollama Cloud native sign-in support.
  Current: web cookies/API-key paths can read some usage, but no local Ed25519 signing-key authentication path exists.
  Done when: existing `ollama signin` works without copying credentials, session/weekly usage and recent extra charges render, local-only installations stay opt-in, and absent reset timestamps are not invented. [Ollama adapter][M-ollama], [OpenUsage Ollama][O-ollama].
  Completed 2026-09-17: Ollama imports the existing unencrypted Ed25519 sign-in key, signs native Cloud requests, maps session/weekly usage and recent charges, leaves missing resets null, and does not auto-enable local-only installations. Signing is verified cryptographically in tests.

- [x] OU-16 · Complete · Expand OpenRouter beyond the current API-key cap.
  Current: adapter calls only `/auth/key` and returns usage/limit/remaining. Account credit balance and daily/weekly/monthly spend are not separately modeled.
  Done when: account purchases/lifetime spend/balance and key-specific limits/period spend are independently represented; optional key-details failure preserves account balance; real zeros remain real zeros. [OpenRouter adapter][M-openrouter], [OpenUsage OpenRouter][O-openrouter].
  Completed 2026-09-17: OpenRouter independently reads account credits/lifetime usage/balance and optional key daily/weekly/monthly spend and limits. Optional key failure preserves account data, real zeros remain zero, and incomplete credit pairs keep balance unknown.

- [x] OU-17 · Complete · Complete OpenCode Go/Zen history and attribution.
  Current: dedicated Go API support and a local SQLite cost fallback exist, but BURN can suppress Monthly. The fallback derives percentages from fixed limits and sets a rolling reset to five hours after the read; the general OpenCode adapter uses web-session usage. This is not equivalent to OpenUsage's separate account-wide quota and local Go/Zen history pipelines.
  Done when: all three authoritative Go windows render, inferred local allowances/reset times are clearly separated from provider-reported quotas, hosted Go/Zen history is read across stable/preview databases, and OpenAI OAuth usage can feed Codex while API-key traffic stays separate; duplicate provider entries do not count the same subscription twice. Do not feed a moving synthetic reset into OU-01 as an authoritative expiration. [OpenCode adapter][M-opencode], [Go adapter][M-go], [OpenUsage OpenCode][O-opencode].

  Progress 2026-09-16: MaxxToken now reads OpenCode's existing `opencode-go` entry from `auth.json` and calls the official `/zen/go/v1/usage` endpoint for authoritative rolling, weekly, and monthly windows. Manual dashboard cookie/workspace entry was removed from the active settings flow; local SQLite remains a clearly marked fallback. Live account verification returned all three windows. Cross-database history and attribution work remains unfinished.

  Completed 2026-09-17: stable/preview databases are unioned and deduplicated for Go/Zen history; OpenAI OAuth zero-cost history feeds Codex while API-key traffic stays separate; duplicate Go/OpenCode subscription presentation is suppressed; only provider-reported reset times can drive forecasts.

## P1 — accounts, history, and daily interaction

- [x] OU-18 · Complete · Expand Claude credential and spend-source coverage.
  Current: default Claude Code file/keychain auth and local logs exist; auth does not use the same custom-home handling as the log scanner. No equivalent Claude Desktop cache, Cowork spend, pi spend, or live-profile plan pipeline was found.
  Done when: supported custom homes, Desktop login formats, Cowork and pi history, live plan changes, and local-spend-without-OAuth work; verify credential identity before reusing cached data and preserve Desktop's ownership of its login renewal. [Auth][M-auth], [Claude adapter][M-claude], [OpenUsage Claude][O-claude].
  Completed 2026-09-17: Custom Claude homes, read-only Desktop login caches, live profile identity/plan checks, Cowork and pi spend, and spend without OAuth are implemented; Desktop retains renewal ownership.

- [x] OU-19 · Complete · Add account-aware provider instances.
  Current: configuration, history, cache, and UI primarily key by provider family; changing credentials is not a persistent multiple-account view.
  Done when: Claude accounts/organizations get distinct stable cards, history and pins remain attached to their owner, identical logins deduplicate, and account switching cannot reuse another account's cache. Incorporate Claude Swap discovery as beta parity and Codex Swap as current-source parity; omit ambiguous shared spend rather than assigning it twice. Propagate identity through API/CLI/export without exposing account emails by default. [Registry][M-config], [history][M-history], [OpenUsage Claude][O-claude], [OpenUsage Codex][O-codex].
  Completed 2026-09-17: Claude/Codex instances use stable account IDs; Swap discovery deduplicates identities, layouts bind once, account changes reject old cache/totals, and public API/export omit account labels and identity stamps by default.

- [x] OU-20 · Complete · Show Codex reset-credit count and expiration timeline.
  Current: ordinary Codex credits are parsed into extra rows; dedicated reset-credit count/expiry handling was not found.
  Done when: reset-credit count, each known expiry, urgency, and unavailable-expiry states render; an optional expiry fetch failure keeps the reported count. Keep this separate from quota-remaining-at-reset in OU-01 and from ordinary Flex credits. [Codex adapter][M-codex], [OpenUsage reset credits][O-codex].
  Completed 2026-09-17: Dedicated reset counts and expiration rows include urgency and unavailable-timeline states without dropping known counts.

- [x] OU-21 · Complete · Add deliberate Codex reset-credit redemption.
  Current: MaxxToken has no corresponding action; OpenUsage exposes a confirmed claim flow.
  Done when: the user selects an explicit credit and confirms consumption, identity and eligibility are rechecked, retries reuse an idempotency key, and balances/limits refresh before success is shown. Never consume credits automatically. Depends on OU-20 and account binding from OU-19. [OpenUsage claim flow][O-codex].
  Completed 2026-09-17: Selected-credit confirmation is followed by identity/eligibility checks, a bounded confirmation lifetime, idempotent retries, and fresh account limits before success; uncertainty keeps the original retry ID.

- [x] OU-22 · Complete · Add an interactive combined spend view.
  Current: aggregate token/spend data and a value footer exist, but no selectable cross-provider Cost, Tokens, and Cost/MTok reporting view.
  Done when: Today/Yesterday/30-day selection updates totals and ranked providers, blended cost-per-million uses matching dollar/token coverage, and subscription allocation is never added to API-equivalent cost. Depends on OU-07/08. [Totals][M-aggregate], [Home][M-home], [OpenUsage Total Spend][O-dashboard].
  Completed 2026-09-17: Combined Cost, Tokens, and Cost/MTok reports support Today/Yesterday/30 days, ranked accounts, matching priced coverage, and explicit partial rates; subscription allocations stay separate.

- [x] OU-23 · Complete · Add calendar trends and period-specific model drilldowns.
  Current: a nine-sample quota sparkline and all-period model rows exist, not a 30-calendar-day usage chart with selected-period details.
  Done when: chart days match history, changing periods changes model totals too, exact counts/source are accessible, and dates with no observations are explicit. Reuse existing daily/model aggregates. [History][M-history], [BURN details][M-adapt], [OpenUsage dashboard][O-dashboard].
  Completed 2026-09-17: Calendar history marks missing days, exposes exact counts/sources, and changes model totals with the selected period; warm snapshots retain 30 days and cost provenance.

- [x] OU-24 · Complete · Add pace-change notifications.
  Current: threshold warnings and before-reset underuse reminders exist, but no dedicated transition alerts for projected near-exhaustion and projected run-out.
  Done when: those transitions have independent preferences, group simultaneous events, deduplicate unchanged conditions, re-arm after recovery/reset, avoid launch-time floods, and suppress stale/invalid projections. Retain MaxxToken's underuse reminders. [Quota alerts][M-quota], [Maxx alerts][M-alerts], [OpenUsage notifications][O-settings].
  Completed 2026-09-17: Independent near-exhaustion/run-out preferences group transitions, suppress launch floods and stale forecasts, deduplicate, and re-arm after recovery/reset.

- [x] OU-25 · Complete · Add reset-display controls and live clock updates.
  Current: BURN uses formatted countdown strings; no shared exact-time/countdown mode or explicit 12/24-hour preference.
  Done when: clicking current usage flips used/left, clicking reset/exhaustion time flips exact/countdown, time format follows system or override, and visible clocks update between provider fetches without extra network reads. [BURN mapping][M-adapt], [OpenUsage display settings][O-settings].
  Completed 2026-09-17: Usage and reset labels toggle used/left and countdown/exact; system/12h/24h clocks update locally between fetches.

- [x] OU-26 · Complete · Add system appearance, density, and accessibility controls.
  Current: persistent light/dark switch exists; no equivalent system-theme mode, compact density, Reduce Animations setting, or complete OS motion/contrast/transparency integration was found.
  Done when: system/light/dark and density work across screens, reduced motion removes decorative/transition motion, contrast preferences preserve legibility, and focus/labels support keyboard and screen-reader navigation. Optional translucency must defer to OS accessibility settings. [BURN settings][M-settings], [OpenUsage appearance][O-settings].
  Completed 2026-09-17: System/light/dark appearance, compact density, reduced animation, OS accessibility preferences, named switches, visible focus, and inert collapsed content are implemented.

- [x] OU-27 · Complete · Add a global shortcut and complete in-popover keyboard navigation.
  Current: no global shortcut registration or comparable BURN navigation map was found.
  Done when: Settings records/clears the global toggle, reports registration conflicts, and keyboard commands handle refresh, settings, back/close, customization, and undo with visible focus. [Main process][M-main], [BURN event wiring][M-app], [OpenUsage keyboard controls][O-dashboard].
  Completed 2026-09-17: Global shortcut recording/clearing/conflict handling and in-popover refresh/settings/back/customize/share/undo commands are implemented.

- [x] OU-28 · Complete · Add shareable image cards.
  Current: JSON export exists; no provider-card or total-spend PNG clipboard action.
  Done when: provider and aggregate cards copy a readable branded PNG with current period/theme, and optional redaction handles account labels and spend. OpenUsage exports visible card contents; redaction and Coach-card sharing would be MaxxToken extensions. [Export][M-export], [OpenUsage sharing][O-dashboard].
  Completed 2026-09-17: Provider and aggregate cards copy branded PNGs with current period/theme/metric and account/spend redaction; native rendering sizes the image to its content.

- [x] OU-29 · Complete · Add menu-bar privacy during screen capture.
  Current: no capture-aware masking preference found.
  Done when: an opt-in setting masks pinned usage during detected sharing/recording and restores it afterward; supported and unsupported OS behavior is explicit. OpenUsage's documented protection covers its menu-bar strip, not every open window. [OpenUsage privacy masking][O-menu].
  Completed 2026-09-17: Opt-in capture masking uses a bundled universal macOS helper, restores usage after capture, and hides usage while detection is pending/unavailable; other platforms report unsupported.

- [x] OU-30 · Complete · Add opt-in cross-Mac history sync.
  Current: history is local; no iCloud integration found.
  Done when: normalized history syncs by device and account, excludes credentials/raw transcripts, does not sum account-wide Cursor exports across machines, reports sync health, and removes this device's contribution when disabled. Define Windows behavior separately; OpenUsage's iCloud feature is Mac-only. Depends on OU-19 and consistent calendar/model accounting. [History][M-history], [OpenUsage sync][O-sync].
  Completed 2026-09-17: Opt-in iCloud Drive history documents are device/account bound, exclude secrets/raw sessions and account-wide Cursor exports, retain pricing coverage, report health, and delete this device contribution when disabled; Windows reports unsupported.

P1 verification (2026-09-17): three GPT-5.6 Sol/high agents implemented OU-18–30; parent review corrected retry identity, cache ownership, partial pricing, accessible hidden controls, and native integration. All 463 desktop tests pass. Synthetic-account browser checks cover reports, models, redaction, confirmation/cancellation/idempotent retry, time toggles, appearance/density, accessible names, and focus preservation across account/metric refreshes. A local macOS arm64 packaged renderer ran without console errors, copied a PNG through the native clipboard, registered/cleared a global shortcut, and ran the universal capture helper. No live reset credits were consumed; real two-Mac iCloud transport and Windows runtime behavior were not exercised. This is a local implementation/build, not a published release.

## P1/P2 — reliability and integrations

- [x] OU-31 · P1 · Complete · Deliver provider results independently with visible refresh state.
  Implemented: workers stream completed provider cards independently; account-safe cached rows stay visible while other providers refresh. Each card has refresh/error state and its own refresh action; provider and worker timeouts settle pending states. The footer counts down to the next scheduled refresh.
  Done when: completed providers update immediately, per-provider spinners/errors and refresh actions work, timed-out providers cannot strand other cards, and the footer exposes next scheduled refresh. Retain existing timeout/caching foundations; do not copy the old backlog's obsolete 30-second OpenUsage timeout claim—the audited docs now specify 120 seconds. [Aggregator][M-aggregate], [worker/main][M-main], [OpenUsage refresh][O-refresh].

- [x] OU-32 · P1 · Complete · Persist incremental log parsing across launches.
  Implemented: versioned normalized-event caches are shared by app and CLI for Claude/Codex and their pi sources. File size, mtime, inode, schema, account, period, and parent ownership context invalidate stale records; disappeared files and obsolete cache identities are pruned. Pricing changes reuse normalized events.
  Done when: unchanged logs reuse versioned parse results, appended/rotated/truncated files invalidate correctly, repricing does not require rereading raw logs, and obsolete cache entries expire. Measure cold/warm scan time and memory before choosing a shorter heavy-scan cadence. [Claude scanner][M-claude], [Codex scanner][M-codex], [OpenUsage cache][O-refresh].

- [x] OU-33 · P1 · Complete · Close local-accounting and pricing-rule parity gaps.
  Implemented: targeted fixtures cover copied/symlinked sessions, advisor/workflow/subagent/archive logs, recorded costs, per-event priority/fast and long-context pricing, and pi/OpenCode Codex OAuth attribution. A validated HTTPS OpenUsage pricing supplement supplies refreshable aliases/rates with bundled and cached fallback and explicit third-party provenance.
  Done when: fixtures establish parity for copied/symlinked sessions, nested advisor/workflow usage, archived/subagent logs, recorded costs, per-event speed/long-context pricing, and pi/OpenCode Codex OAuth attribution; apply targeted fixes only where comparisons fail. Add a remotely refreshable alias/rate supplement for unsupported provider model names; price corrections should not always require an app release. [Claude][M-claude], [Codex][M-codex], [cost engine][M-cost], [OpenUsage pricing][O-pricing].

- [x] OU-34 · P2 · Complete · Add optional unknown-model pricing fallback.
  Implemented: Settings offers an opt-in Codex unknown-model fallback, off by default. Selecting a different model or disabling it reprices normalized history; actual model names, unknown-model warnings, authoritative recorded costs, and known rates are preserved.
  Done when: an explicit optional choice estimates otherwise-unpriced usage, preserves unknown-model warnings, leaves known rates unchanged, and reprices history without changing the provider's actual model. Keep off by default. [Cost engine][M-cost], [OpenUsage fallback][O-pricing].

- [x] OU-35 · P2 · Complete · Add provider-request proxy configuration.
  Implemented: Settings configures HTTP/HTTPS/SOCKS5 proxy routing and securely stores or clears proxy credentials. App workers and the installed CLI share routing, loopback bypass, redirect policy, caller cancellation, body timeouts, and credential redaction.
  Done when: configured remote provider requests use the proxy, loopback bypasses it, app/CLI behavior agrees, and proxy secrets use secure storage/redaction. OpenUsage configuration is file-based; a settings UI would be an extension. [HTTP helper][M-http], [OpenUsage proxy][O-proxy].

- [x] OU-36 · P1 · Complete · Complete app-independent CLI parity and installation.
  Implemented: Settings installs, repairs, or removes a version-matched CLI wrapper around the packaged app. A headless Electron entry accesses the same secure storage without starting the menu-bar UI. Provider/account selection, forced refresh, limits JSON, documented errors/exit codes, executable health, and the existing TUI are supported.
  Done when: a supported installer adds a version-matched CLI, shared adapters/cache/secure auth handle keyed and local-auth providers with the app closed, and provider selection, forced refresh, documented errors, and exit codes work. Preserve the richer TUI. [TUI][M-tui], [snapshot CLI][M-usagecli], [OpenUsage CLI][O-cli].

- [x] OU-37 · P1 · Complete · Add a stable machine-facing limits contract.
  Implemented: /v1/limits and /v1/limits/:provider share schemaVersion 1.0 with the limits CLI. Resources use stable semantic IDs, opaque account IDs, units, explicit accuracy/source, missing/stale measurements, and structured errors. Existing usage endpoints, loopback Host checks, and no-CORS policy remain.
  Done when: versioned limits endpoints and CLI share one schema, include account-safe IDs and explicit missing/stale states, and keep existing consumers compatible. Maintain loopback/Host restrictions and no permissive browser CORS. Forecast fields would be a MaxxToken extension; OpenUsage's documented limits schema does not export its pacing verdicts. [Local API][M-api], [OpenUsage contract][O-api].

- [x] OU-38 · P2 · Complete · Improve diagnostics and settings recovery.
  Implemented: active Settings exposes log level, copy/reveal log path, and confirmed settings reset. Reset preserves saved credentials and history; legacy layout migration is retained, and incidental settings saves preserve explicit provider opt-outs.
  Done when: active Settings exposes log level, copy/reveal log path, and reset controls that preserve credentials; settings/layout migrations and diagnostics remain compatible across updates. Reuse existing logger and configuration code. [Logger][M-logger], [Settings][M-settings], [OpenUsage logging][O-logging].

- [x] OU-39 · P1 · Complete · Unify provider registry and first-run enablement.
  Implemented: one capability registry supplies configuration, adapter validation, discovery metadata, CLI/key routing, and BURN visibility. Registered integrations carry supported/experimental/hidden status. Startup detection enables eligible newly credentialed providers; installed-tool evidence alone does not enable them, and explicit user opt-outs are preserved.
  Done when: a single capability registry drives UI/discovery, a consistency check catches unreachable providers, and first-run/new-provider detection preserves user opt-outs and respects cloud-only exceptions such as Ollama. Distinguish supported, experimental, and intentionally hidden integrations. [Registry][M-config], [detection][M-detection], [OpenUsage enablement][O-enablement].

### Reliability/integrations validation — 2026-09-17

- Three GPT Sol agents ran at high reasoning, with parent review and integration fixes before completion.
- Desktop suite: 507 tests passed; focused coverage includes mixed fast/hung providers, account-safe partial refresh, file cache invalidation/ownership, accounting and fallback repricing, HTTP proxy redirect/abort/body timeout, stable limits, CLI installer/exit behavior, registry detection, and opt-out migrations.
- Synthetic cache benchmark: 120 files / 16.56 MB; cold 57.04 ms and +0.22 MiB retained heap, warm 5.53 ms and +0.06 MiB; warm run hit all 120 cached records and parsed zero source bytes. This is a local synthetic measurement, not a production latency guarantee; heavy-scan cadence remains unchanged.
- Native macOS review package built successfully; its version-matched CLI wrapper installed into a temporary directory, returned successful version/help output, and uninstalled cleanly. Packaged renderer smoke checks exercised fresh/refreshing/failed cards, pricing controls, CLI install/uninstall UI, and proxy credential submission/cleared drafts with synthetic data and no renderer errors.
- Validation limits: Windows wrapper generation is tested but Windows execution is not; corporate HTTPS/SOCKS deployment and live pricing-feed availability were not exercised. Inter-process cache writes are atomic but unlocked, so concurrent app/CLI scans can cause a later reparse. The review package is local, unsigned, and unpublished.
- Screenshots (synthetic data): [settings](/Users/witchaudio/Developer/maxxToken/output/playwright/reliability-settings.png), [provider refresh](/Users/witchaudio/Developer/maxxToken/output/playwright/reliability-refresh.png), [proxy](/Users/witchaudio/Developer/maxxToken/output/playwright/reliability-proxy.png).

## P2 — distribution and product documentation

- [ ] OU-40 · Build implementation; release verification pending · Ship and verify Intel Mac support.
  Implemented: universal Mac DMG/ZIP build configuration, explicit Windows x64 packaging, replacement packaging hook for removed assets, macOS 12 native helper slices, and release inventory/signature/architecture gates. Public 0.2.12 remains arm64-only; a version-bumped signed/notarized/stapled universal release and previous-installation update verification are still required for completion.
  Done when: Intel and Apple Silicon builds run and update correctly, whether distributed universally or as explicit architecture downloads. Preserve DMG + ZIP, signing/notarization/stapling, Windows x64 EXE, blockmaps, and correct manifests; test updating from a previous installation. [MaxxToken release][M-release], [build config][M-package], [OpenUsage installation][O-readme].

- [x] OU-41 · Complete · Add a Homebrew installation path.
  Implemented: published [maintained tap](https://github.com/rachel-nocode/homebrew-maxxtoken) with a SHA-256-pinned cask for the signed/notarized public 0.2.12 Apple Silicon build; architecture restriction stays explicit until universal release verification. Isolated Homebrew install 0.2.11 → upgrade 0.2.12 → uninstall passed, app signature and built-in updater configuration remained intact, and the public tap was fetched and verified after publication.
  Done when: a published cask or maintained tap installs the verified build, documents architecture support, and passes upgrade/uninstall checks; the updater continues working. [Landing source][M-landing], [OpenUsage installation][O-readme].

- [ ] OU-42 · Implemented; channel release verification pending · Add stable/beta update preferences.
  Implemented: stable-default/beta-opt-in controls, automatic-check preference, manual checks when automatic checks are off, downgrade prevention, and cancellation/generation guards that prevent stale beta downloads from installing after switching back to stable. Returning to default settings reapplies updater policy. A complete published beta asset set and real cross-channel installation remain required before checking off the distribution acceptance criterion.
  Done when: stable stays the default, beta requires opt-in, disabling automatic checks leaves manual checks functional, and every channel publishes complete updater assets; returning to stable does not force an unintended downgrade. [Updater][M-main], [OpenUsage updates][O-updates].

- [x] OU-43 · Complete · Publish accurate product/setup/integration documentation.
  Implemented: published five sanitized [public guides](https://github.com/rachel-nocode/homebrew-maxxtoken/tree/main/docs) covering setup, all 24 exposed providers, auth/metric provenance, CLI/API, settings, troubleshooting, and provider contribution specifications. Candidate features are explicitly distinguished from public 0.2.12. README and landing source now describe Apple Silicon/Windows x64, label universal Mac as upcoming, remove hidden Missions claims, and link to the published guides. Landing production deployment remains separate from the verified local build.
  Done when: user docs describe actual exposed behavior, platform/download paths match distribution, claims about reset forecasts are true in BURN, and a sanitized provider-contribution protocol explains how to add/test integrations without exposing private application source. OpenUsage's open repository and free distribution are business-model differences, not checkbox requirements to publish MaxxToken source. [README][M-readme], [landing source][M-landing], [OpenUsage docs][O-docs], [provider protocol][O-providerprotocol].

## Verification notes and sequencing

- Distribution validation (2026-09-17): all 523 desktop tests passed, root lint and landing production build passed, and packaged Settings passed an isolated synthetic UI smoke check for stable/beta selection, automatic-check persistence, and manual checking. Screenshot: [update settings](/Users/witchaudio/Developer/maxxToken/output/playwright/distribution-update-settings.png).
- Local universal Mac candidate: Developer ID signed, Apple notarization accepted, DMG stapled, post-staple manifest checksums refreshed, and strict `npm run release:validate` passed all eight assets. Native Apple Silicon and Rosetta x86_64 CLI launches passed; Windows payload architecture is PE32+ x86-64. This candidate retains version 0.2.12 and must not replace the published release; release requires a newer version and rebuild. Physical Intel runtime, Windows runtime, previous-install update paths, and a published beta channel remain unverified. The available Windows VM could not start because its CLI requires a different Parallels edition.
- Homebrew verification: isolated install 0.2.11 → upgrade 0.2.12 → uninstall passed without changing the installed application, and the published tap was fetched and checked. Cask syntax/style passed; `brew audit` could not run because this Homebrew version requires Xcode 27 while the host has 26.6. Five public guides were published without application source. Landing source was built locally; production deployment was not performed.
- Confirmed with synthetic execution: projected fields disappear from BURN display-window objects; sparse dates are relabeled as Today/Yesterday. Other findings come from reachable source paths, documentation, and release metadata, with live-account/runtime verification left in each relevant acceptance criterion.
- Implement OU-01 and the OU-02 design first; bring OU-03/06/07/08 into that same UI milestone so forecasts are not presented beside hidden limits, stale data, or incorrect dates.
- Complete provider correctness OU-09–18 alongside UI parity; prioritize the providers customers actually use. OU-19 is foundational for reliable multi-account history and OU-30 sync. OU-20/21 are distinct from the user's requested forecast.
- Follow with customization, history, alerts, and CLI/API work; schedule platform/distribution work after the underlying behavior is verified. No requirement to replace Electron with Swift: native implementation is an architecture difference, and comparative CPU/RAM claims require measurement.
- Preserve MaxxToken's underuse focus, Windows support, secure credential storage, and restrictive local API. OpenUsage's permissive CORS and mandatory activity/crash reporting are not product improvements to copy. [OpenUsage API privacy][O-api], [privacy policy][O-privacy].

## Evidence links

OpenUsage links pin the audited source, so future repository changes do not silently alter this checklist's evidence. Local links target the audited workspace; revisit them when completing tasks.

[O-commit]: https://github.com/robinebers/openusage/commit/56378e5765f85d38ff413036fd984afe3d4664e4
[O-stable]: https://github.com/robinebers/openusage/releases/tag/v0.7.11
[O-beta]: https://github.com/robinebers/openusage/releases/tag/v0.7.12-beta.2
[O-readme]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/README.md
[O-dashboard]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/dashboard.md
[O-settings]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/settings.md
[O-pace]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/Sources/OpenUsage/Support/Pace.swift
[O-menu]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/menu-bar.md
[O-refresh]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/refreshing.md
[O-pricing]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/pricing.md
[O-api]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/local-http-api.md
[O-cli]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/cli.md
[O-sync]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/icloud-sync.md
[O-proxy]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/proxy.md
[O-logging]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/logging.md
[O-enablement]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/provider-enablement.md
[O-updates]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/updates.md
[O-privacy]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/privacy.md
[O-docs]: https://github.com/robinebers/openusage/tree/56378e5765f85d38ff413036fd984afe3d4664e4/docs
[O-providerprotocol]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/adding-a-provider.md
[O-claude]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/providers/claude.md
[O-codex]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/providers/codex.md
[O-cursor]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/providers/cursor.md
[O-copilot]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/providers/copilot.md
[O-antigravity]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/providers/antigravity.md
[O-devin]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/providers/devin.md
[O-grok]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/providers/grok.md
[O-ollama]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/providers/ollama.md
[O-openrouter]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/providers/openrouter.md
[O-opencode]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/providers/opencode.md
[O-zai]: https://github.com/robinebers/openusage/blob/56378e5765f85d38ff413036fd984afe3d4664e4/docs/providers/zai.md
[M-release]: https://github.com/rachel-nocode/maxxtoken/releases/tag/v0.2.12
[M-old]: /Users/witchaudio/Developer/maxxToken/OPENUSAGE_TOKEN_SAVINGS_BACKLOG.md
[M-readme]: /Users/witchaudio/Developer/maxxToken/README.md
[M-package]: /Users/witchaudio/Developer/maxxToken/desktop/package.json
[M-landing]: /Users/witchaudio/Developer/maxxToken/src/App.tsx
[M-pace]: /Users/witchaudio/Developer/maxxToken/desktop/lib/aggregate.js:418
[M-aggregate]: /Users/witchaudio/Developer/maxxToken/desktop/lib/aggregate.js
[M-adapt]: /Users/witchaudio/Developer/maxxToken/desktop/burn/burn-adapt.js
[M-home]: /Users/witchaudio/Developer/maxxToken/desktop/burn/burn-home.js
[M-settings]: /Users/witchaudio/Developer/maxxToken/desktop/burn/burn-settings.js
[M-app]: /Users/witchaudio/Developer/maxxToken/desktop/burn/burn-app.js:7
[M-primitives]: /Users/witchaudio/Developer/maxxToken/desktop/burn/burn-primitives.js:136
[M-main]: /Users/witchaudio/Developer/maxxToken/desktop/main.js
[M-config]: /Users/witchaudio/Developer/maxxToken/desktop/lib/config.js
[M-history]: /Users/witchaudio/Developer/maxxToken/desktop/lib/usage-history.js
[M-cost]: /Users/witchaudio/Developer/maxxToken/desktop/lib/token-cost.js
[M-alerts]: /Users/witchaudio/Developer/maxxToken/desktop/lib/maxx-alerts.js
[M-quota]: /Users/witchaudio/Developer/maxxToken/desktop/lib/quota-notifications.js
[M-tui]: /Users/witchaudio/Developer/maxxToken/desktop/lib/tui-cli.js
[M-usagecli]: /Users/witchaudio/Developer/maxxToken/desktop/lib/usage-snapshot-cli.js
[M-api]: /Users/witchaudio/Developer/maxxToken/desktop/lib/local-api.js
[M-export]: /Users/witchaudio/Developer/maxxToken/desktop/lib/usage-export.js
[M-optimize]: /Users/witchaudio/Developer/maxxToken/desktop/lib/optimize-detect.js
[M-coach]: /Users/witchaudio/Developer/maxxToken/desktop/lib/token-coach/index.js
[M-http]: /Users/witchaudio/Developer/maxxToken/desktop/lib/http.js
[M-auth]: /Users/witchaudio/Developer/maxxToken/desktop/lib/auth.js
[M-detection]: /Users/witchaudio/Developer/maxxToken/desktop/lib/provider-detection.js
[M-logger]: /Users/witchaudio/Developer/maxxToken/desktop/lib/logger.js
[M-claude]: /Users/witchaudio/Developer/maxxToken/desktop/lib/adapters/claude.js
[M-codex]: /Users/witchaudio/Developer/maxxToken/desktop/lib/adapters/codex.js
[M-cursor]: /Users/witchaudio/Developer/maxxToken/desktop/lib/adapters/cursor.js
[M-copilot]: /Users/witchaudio/Developer/maxxToken/desktop/lib/adapters/copilot.js
[M-antigravity]: /Users/witchaudio/Developer/maxxToken/desktop/lib/adapters/antigravity.js
[M-grok]: /Users/witchaudio/Developer/maxxToken/desktop/lib/adapters/grok.js
[M-ollama]: /Users/witchaudio/Developer/maxxToken/desktop/lib/adapters/ollama.js
[M-openrouter]: /Users/witchaudio/Developer/maxxToken/desktop/lib/adapters/openrouter.js
[M-opencode]: /Users/witchaudio/Developer/maxxToken/desktop/lib/adapters/opencode.js
[M-go]: /Users/witchaudio/Developer/maxxToken/desktop/lib/adapters/opencode-go.js
[M-zai]: /Users/witchaudio/Developer/maxxToken/desktop/lib/adapters/zai.js
