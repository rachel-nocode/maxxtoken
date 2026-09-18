# OpenUsage comparison and token-savings backlog

Research date: 2026-09-03

Scope: compare MaxxToken 0.2.12 with the closest product match, the native macOS app [robinebers/openusage](https://github.com/robinebers/openusage). The unrelated terminal-first fork [janekbaraniewski/openusage](https://github.com/janekbaraniewski/openusage) is included only as an idea source. Local MaxxToken findings come from the current workspace, especially `README.md`, `desktop/lib/config.js`, `desktop/lib/optimize-detect.js`, `desktop/lib/token-coach/`, `desktop/lib/local-api.js`, and `desktop/lib/usage-export.js`.

Audit update: 2026-09-17. Checked items below are verified against the current working tree and/or the release evidence recorded in `OPENUSAGE_FEATURE_GAP_AUDIT.md`. Most September implementation work remains unreleased: public v0.2.12 is the arm64-only release and does not contain every working-tree feature. Distribution items remain open until their published-release acceptance criteria are met.

## Product position to protect

- [x] Keep MaxxToken's core distinction: it diagnoses waste and recommends action instead of stopping at usage charts.
- [x] Keep Windows support. OpenUsage requires macOS 15+, while MaxxToken ships macOS and Windows installers.
- [x] Keep broad provider coverage. The current capability registry has 49 entries and 50 adapter files; 24 are exposed (17 supported, 7 experimental) while 25 remain intentionally hidden. OpenUsage documents 10 provider families.
- [x] Keep the privacy-hardened local API. MaxxToken rejects non-loopback hosts and omits browser CORS; OpenUsage warns that browser pages can read its loopback API.
- [x] Keep Token Coach's deterministic R1-R4 verdicts: long-thread bleed, effort mismatch, cache misses, and limit collision.
- [x] Keep Optimize signals: cache efficiency, input/output imbalance, expiring quota, dormant plans, configuration bloat, high default effort, and pace-to-limit risk.
- [ ] Keep task preflight, model-fit recommendations, project backlog scanning, and Missions that route work toward underused subscriptions.
  - Audit 2026-09-17: the underlying preflight/model-fit/backlog code exists, but the active BURN navigation explicitly hides Missions. Do not present it as exposed product differentiation until it is reachable.
- [x] Keep JSON export, terminal dashboard, status/incident links, local storage-footprint inspection, quota warnings, and session-restored notifications.
- [x] Keep no-telemetry default. OpenUsage documents a mandatory daily-active ping and crash reporting plus optional analytics in its [privacy policy](https://github.com/robinebers/openusage/blob/main/docs/privacy.md).

## OpenUsage parity backlog

OpenUsage capabilities below are documented in its [README](https://github.com/robinebers/openusage/blob/main/README.md), [dashboard guide](https://github.com/robinebers/openusage/blob/main/docs/dashboard.md), [settings guide](https://github.com/robinebers/openusage/blob/main/docs/settings.md), [menu-bar guide](https://github.com/robinebers/openusage/blob/main/docs/menu-bar.md), and [0.7.10 release](https://github.com/robinebers/openusage/releases/tag/v0.7.10).

### P0 — close visible product gaps

- [x] Add per-metric menu-bar pins.
  - Allow up to two pinned metrics per provider.
  - Offer compact text and mini-bar rendering.
  - Preserve MaxxToken's current global tray modes as presets.
  - Hide unavailable values instead of rendering empty placeholders.

- [ ] Add full dashboard customization.
  - Enable provider and metric show/hide controls.
  - Add Always Visible and On Demand sections.
  - Support drag-reordering of providers and metrics.
  - Persist expanded cards and layout choices.
  - Add per-provider reset, reset-all, and session undo.
  - Audit 2026-09-17: visibility, sections, saved expansion/layout, provider dragging, metric up/down ordering, reset, and undo are implemented; metric drag-and-drop remains absent from the active BURN UI.

- [x] Build first-class multi-account support.
  - Start with multiple Claude config directories, matching OpenUsage 0.7.10.
  - Use stable account IDs throughout cache, history, API, export, and UI.
  - Keep account identity out of the public loopback payload by default.
  - Add aggregation and per-account views without double-counting shared logs.

- [ ] Fix provider-registry drift and add parity providers.
  - Register currently unreachable adapters: `factory`, `jetbrains`, `minimax`, `perplexity`, and `zai` exist as adapter files but are absent from `desktop/lib/config.js`.
  - Add a registry test that fails when an adapter, detection rule, icon, config entry, and renderer entry disagree.
  - Add Devin as a first-class provider instead of treating Devin-shaped credentials only as Windsurf internals.
  - Verify Z.ai session, weekly, web-search, and credit-quota rows against OpenUsage behavior.
  - Audit 2026-09-17: one capability registry now reaches every adapter and covers Devin/Z.ai with focused fixtures, but its consistency validation verifies adapter registration only; no single test verifies detection rules, icons, config, and BURN renderer entries together.

- [x] Upgrade history and spend exploration.
  - Add Today, Yesterday, and 30 Days switches per provider.
  - Add provider usage-trend charts and per-model hover breakdowns.
  - Add cross-provider Cost, Cost/MTok, and Tokens views.
  - Clearly separate estimated local spend from provider-billed spend.
  - Preserve MaxxToken verdicts as the primary surface; charts remain supporting evidence.

- [ ] Harden local-log accounting against replay duplication.
  - Add regression fixtures for Codex subagent replay logs, auto-review aliases, symlinked log folders, malformed counters, and fast-tier pricing.
  - Compare totals against OpenUsage and `ccusage` on the same fixture corpus.
  - Require exact provenance on every calculated token and dollar total.
  - Audit 2026-09-17: copied/symlinked sessions, subagent/archive logs, malformed data, fast/long-context pricing, deduplication, and pricing provenance have targeted fixtures. No same-corpus comparison against both OpenUsage and `ccusage` was found.

### P1 — polish and retention

- [x] Add privacy masking during screen sharing and recording.
  - Replace menu-bar usage values with the MaxxToken mark while capture is active.
  - Restore values immediately when capture ends.
  - Default off and explain local OS capture detection.

- [ ] Add shareable provider and verdict cards.
  - Copy a clean PNG from provider headers and Token Coach verdicts.
  - Respect dark/light appearance.
  - Add an explicit redaction toggle for plan, spend, and account labels.
  - Audit 2026-09-17: provider and aggregate PNG cards with spend/account redaction are implemented (`desktop/lib/share-card.js`), but Token Coach verdict-card export and an explicit plan-redaction control are absent.

- [x] Add a global shortcut to toggle the popover.
  - Record and clear arbitrary shortcuts in Settings.
  - Detect conflicts and avoid stealing common system shortcuts.

- [ ] Add cross-device history sync.
  - Sync normalized history, not raw transcripts or credentials.
  - Use iCloud on macOS and define a separate opt-in path for Windows.
  - Merge by stable device/sample IDs and prevent double-counting.
  - Show sync health, last update, source devices, and a full delete control.
  - Audit 2026-09-17: opt-in, account/device-bound iCloud Drive history sync with health and delete is implemented for macOS; Windows is explicitly unsupported, so its separate opt-in path is still missing.

- [x] Add accessibility and density controls.
  - System/light/dark theme selector.
  - Default/compact density.
  - Reduce Animations and OS Reduce Motion support.
  - Increase Contrast/Reduce Transparency compatibility.
  - Auto/12-hour/24-hour reset-time formats.

- [ ] Add network proxy support for provider reads.
  - Support HTTP(S) and SOCKS5 without logging credentials.
  - Apply one normalized proxy policy across adapters.
  - Add connection testing and per-provider error attribution.
  - Audit 2026-09-17: HTTP(S)/SOCKS5 routing, encrypted credentials, loopback bypass, and shared app/CLI policy are implemented; no user-facing proxy connection-test flow was found.

- [ ] Improve stale-while-revalidate behavior.
  - Show cached values immediately on launch.
  - Add a hard 30-second timeout per provider refresh.
  - Cache parsed local logs incrementally across launches.
  - Avoid UI redraws when normalized values did not change.
  - Audit 2026-09-17: cached launch, last-good fallback, versioned incremental event caches, and 30-second per-provider refresh limits are implemented; no verified normalized-value redraw suppression was found.

### P2 — distribution and ecosystem

- [ ] Ship universal macOS builds.
  - Current [MaxxToken 0.2.12 release](https://github.com/rachel-nocode/maxxtoken/releases/tag/v0.2.12) assets are arm64-only; OpenUsage ships a universal binary.
  - Build and test x64 plus arm64 while preserving the required DMG and ZIP updater assets.
  - Audit 2026-09-17: universal DMG/ZIP build configuration and local signed/notarized candidate validation exist, but v0.2.12 remains arm64-only; a version-bumped published release and previous-install update verification are missing.

- [x] Publish a Homebrew cask.
  - Install the signed/notarized stable release.
  - Verify upgrade and uninstall paths.
  - Keep GitHub ZIP auto-update intact.

- [ ] Add stable and beta update channels.
  - Keep stable users off prereleases.
  - Add an explicit opt-in beta toggle.
  - Verify complete updater assets for both channels.
  - Audit 2026-09-17: stable-default/beta-opt-in controls and updater guards are implemented, but no complete published beta asset set or real cross-channel installation is verified.

- [ ] Make the one-shot CLI independent of the running app.
  - Reuse the same adapters, auth stores, pricing, cache, and normalized schema as the app.
  - Support `maxxtoken usage`, a provider argument, `--force`, and stable exit codes.
  - Retain the richer interactive TUI as a separate mode.
  - Audit 2026-09-17: the working-tree installed CLI shares adapters, secure auth, caches, provider selection, forced refresh, limits JSON, and exit codes with the app. It currently exposes `maxxtoken [options]` rather than the required `maxxtoken usage` subcommand, so this exact contract remains incomplete.

- [ ] Version a dedicated limits API.
  - Keep `/v1/usage` backward compatible.
  - Add a compact `/v1/limits` contract for agents and scripts.
  - Publish JSON Schema and compatibility tests.
  - Preserve MaxxToken's Host-header and no-CORS protections.
  - Audit 2026-09-17: `/v1/limits` and the CLI share tested schema version 1.0 with loopback/Host/no-CORS protections, but no published standalone JSON Schema was found.

- [ ] Publish an adapter SDK or provider protocol.
  - Document detection, auth, fetch, map, cache, and test-fixture contracts.
  - Let contributors add provider packages without exposing the private application source.
  - Add fixture redaction and secret-scanning requirements.
  - Audit 2026-09-17: `docs/provider-contributions.md` publishes a strong sanitized proposal/fixture and normalized-adapter protocol, but it does not provide a contributor-addable provider package/SDK or a complete fetch/map/cache implementation contract.

## Token-saving feature backlog

### Current savings capability (working tree, not a savings-performance claim)

- Optimize is exposed and diagnoses cache efficiency, input/output imbalance, expiring quota, dormant plans, configuration bloat, high default effort, and pace-to-limit risk. Its recoverable/headroom figures are modeled estimates, not observed savings.
- Token Coach is exposed with deterministic R1–R4 verdicts for long-thread bleed, effort mismatch, cache misses, and limit collision. R1's context floor and R2's short-prompt/small-answer effort inference are heuristics; neither has task-success or billed-savings validation.
- `desktop/lib/optimize-cli.js` can print the latest snapshot's Optimize signals, while the installed `maxxtoken` CLI can collect/report usage and limits without the menu-bar UI. No `maxxtoken headroom` command, tool-output wrapper, prompt proxy, compression layer, or savings ledger exists.
- Missions, preflight, model-fit, and backlog scanning code exists but Missions is hidden from active BURN navigation. Treat them as retained implementation, not an exposed savings workflow.

Everything below remains an idea unless checked. A local implementation alone does not demonstrate fewer billed tokens, lower quota consumption, or unchanged task success.

### P0 — measurement before intervention

- [ ] Build a Savings Lab benchmark harness.
  - Measure provider-billed input, cache-read, cache-write, output, reasoning, retries, wall time, and task success.
  - Compare baseline and intervention on identical tasks, repositories, models, and fresh caches.
  - Report cost per successful task, not just characters removed.
  - Keep raw fixtures reproducible and secret-free.
  - Motivation: [code-compression-bench](https://github.com/daseinlabs/code-compression-bench) standardizes like-for-like compression tests, while the 2026 paper [Token Reduction Is Not Cost Reduction](https://arxiv.org/abs/2607.12161) reports cases where compressed runs solved fewer tasks at higher cost per solve.

- [ ] Add intervention confidence and rollback contracts.
  - Classify suggestions as observe-only, reversible config edit, output filter, or request proxy.
  - Require preview, backup, exact restore, and post-change measurement.
  - Never compress source text used as an edit anchor.
  - Auto-disable an intervention when retries, failures, or total billed cost increase.

- [ ] Calibrate MaxxToken's estimates with observed quota movement.
  - Replace the fixed 200K-token mission-window assumption where empirical account data exists.
  - Show exact, provider-reported, empirically estimated, and heuristic values with different labels.
  - Learn per-provider and per-model tokens-per-quota-point ranges without pretending quotas are fixed token buckets.
  - Audit 2026-09-17: mission preflight still uses a fixed 200K-token window and a heuristic source weight; Token Coach already estimates tokens per quota point from observed Codex rate-limit deltas, but that limited estimate is not integrated into preflight or calibrated separately across provider, account, model, and window.

### P0 — diagnose more waste causes

- [ ] Add R5 stale-session restart verdict.
  - Detect a long idle gap plus a task/topic change.
  - Recommend a fresh thread and generate a compact handoff.
  - Compare against the platform guidance that starting a new session between phases avoids carrying unnecessary context in [GitHub's AI-usage optimization guide](https://docs.github.com/en/copilot/tutorials/optimize-ai-usage).

- [ ] Add R6 model-overkill verdict.
  - Classify small edits, formatting, renames, searches, and summaries.
  - Compare actual model/effort against the cheapest historically successful route.
  - Recommend downgrade-first with verifier-driven escalation.
  - Audit 2026-09-17: Token Coach R2 flags high effort on short-prompt/small-visible-output turns, but does not classify task types, compare historical successful routes, or verify an escalation path.

- [ ] Add R7 tool-output flood verdict.
  - Attribute context growth to commands, tests, logs, MCP results, and file reads.
  - Flag large successful output, repeated stack traces, ANSI/progress noise, and unchanged reruns.
  - Link each verdict to exact tool calls and retained bytes/tokens.
  - Study [RTK](https://github.com/rtk-ai/rtk), [Headroom](https://github.com/headroomlabs-ai/headroom), [context-mode](https://github.com/mksglu/context-mode), and [squeez](https://github.com/claudioemmanuel/squeez), but treat their savings claims as hypotheses until Savings Lab verifies them.

- [ ] Add R8 repeated-read and redundant-context verdict.
  - Detect the same file/range, search result, or tool payload entering context repeatedly without meaningful changes.
  - Estimate repeat cost across later turns, including cache weighting.
  - Recommend diff reads, symbol reads, or a fresh session.

- [ ] Add R9 retry-loop verdict.
  - Detect repeated failing commands, identical tool errors, oscillating edits, and reverted patches.
  - Separate useful verification loops from no-progress loops.
  - Recommend a stop-and-replan threshold and a saved blocker handoff.

- [ ] Add R10 evidence-based skill, MCP, and instruction tax verdict.
  - Extend the current flat MCP estimate into actual tool-schema token counts.
  - Parse transcripts to distinguish frequently used, cold, broken, and redundant skills/tools.
  - Recommend keep, mute description, disable, or remove.
  - Make every action reversible with quarantine and restore.
  - Reference implementation: [SkillReaper](https://github.com/thousandflowers/skillreaper).

- [ ] Add R11 output-verbosity verdict.
  - Measure prose output separately from code, commands, errors, and required artifacts.
  - Offer an installable concise-response skill for Claude, Codex, Gemini, Cursor, and Copilot.
  - Benchmark quality and total session cost; do not assume shorter replies always reduce full-run cost.
  - Reference skill: [Caveman](https://github.com/JuliusBrussee/caveman).

- [ ] Add R12 prompt-cache stability verdict.
  - Detect stable reusable prefixes, cache-breaking reorderings, volatile timestamps, and oversized always-on instructions.
  - Explain when cache reads save money versus when cache writes dominate.
  - Generate provider-specific remediation without mutating prompts automatically.
  - Audit 2026-09-17: Optimize measures aggregate cache efficiency and recommends stable repeated instructions, but does not inspect prefix order, volatile inputs, cache writes, or prompt-specific remediation.

### P1 — guided fixes users can apply

- [ ] Build a one-click Token Diet plan.
  - Rank the top three measured changes by expected saved quota and confidence.
  - Show before/after token estimates and affected agents.
  - Apply only selected reversible changes.
  - Re-measure after seven days and keep or roll back based on results.

- [ ] Generate compact fresh-context handoffs.
  - Preserve goal, verified facts, changed files, failing command, next step, and constraints.
  - Exclude raw logs and stale exploration.
  - Support Claude Code, Codex, OpenCode, Gemini CLI, and Cursor.
  - Study [token-reduce-skill](https://github.com/chimera-defi/token-reduce-skill) for path-first retrieval and handoff mechanics.

- [ ] Add token-budgeted repository maps.
  - Extract symbols and relationships with Tree-sitter.
  - Rank relevant definitions with a dependency graph.
  - Emit a strict token-budget map, then fetch exact source only when needed.
  - Reference: [Aider's repository map](https://github.com/Aider-AI/aider/blob/main/aider/website/docs/repomap.md).

- [ ] Add quiet command wrappers as an opt-in Savings Pack.
  - Preserve failures, warnings, changed tests, exit codes, filenames, and exact diff anchors.
  - Collapse passing tests, progress bars, repeated lines, and unchanged sections.
  - Keep raw output retrievable locally.
  - Never globally rewrite commands without preview and an off switch.

- [ ] Add MCP tool-catalog budgeting.
  - Measure tokens contributed by each server and tool schema.
  - Recommend disabling cold servers or switching large catalogs to lazy discovery.
  - Prototype code-mode execution for multi-tool jobs only after approval and security review.
  - Reference: [Bifrost Code Mode](https://github.com/maximhq/bifrost/blob/dev/docs/mcp/code-mode.mdx), which exposes a small meta-tool surface instead of every tool schema.

- [ ] Add verifier-driven model routing for Missions.
  - Start on the cheapest eligible model/effort.
  - Run deterministic tests or user-selected checks.
  - Escalate only when verification fails.
  - Learn route success by task type and repository.
  - Reference: [RouteLLM](https://github.com/lm-sys/RouteLLM).

- [ ] Add local-model offload recommendations.
  - Detect an available local runtime and models.
  - Route safe, low-risk work such as summarization, classification, log folding, and embeddings locally.
  - Never route secrets or proprietary code without explicit user choice.
  - Compare local latency/quality against subscription quota saved.

- [ ] Add API budget and router integrations.
  - Import spend, budgets, cache metrics, and routing outcomes from LiteLLM-compatible gateways.
  - Show per-key/project/team budgets without storing plaintext credentials.
  - Reference: [LiteLLM](https://github.com/BerriAI/litellm), which provides multi-provider routing, fallbacks, and spend tracking.

- [ ] Add semantic response caching for repeatable API workloads.
  - Start with exact-match caching and deterministic prompts.
  - Add semantic matching only with freshness, privacy, and correctness controls.
  - Exclude coding edits, current-state queries, and high-risk domains by default.
  - Reference: [GPTCache](https://github.com/zilliztech/GPTCache).

### P2 — experiments and watchlist

- [ ] Prototype prompt compression behind an experiment flag.
  - Evaluate [Microsoft LLMLingua](https://github.com/microsoft/LLMLingua) on documents, search results, and conversation handoffs.
  - Never use lossy compression on code slated for editing, commands, error strings, policies, or secrets.
  - Ship only if billed cost per successful task improves.

- [ ] Prototype sandboxed tool-output retention.
  - Store full outputs outside the model context.
  - Return compact summaries plus stable handles for exact retrieval.
  - Measure whether extra retrieval turns erase savings.
  - Compare Headroom, context-mode, and Bifrost approaches under the same benchmark.

- [ ] Investigate code-specific context selection.
  - Prefer symbol skeletons, call paths, line-anchored snippets, and exact-demand retrieval over generic prose compression.
  - Evaluate against real MaxxToken repositories and test correctness, not compression ratio.

- [ ] Import richer terminal reporting ideas from [OpenUsage.sh](https://github.com/janekbaraniewski/openusage).
  - Add daily, weekly, monthly, session, and billing-block reports.
  - Add CSV export, hooks, tmux/statusline output, active-tool detection, and optional Prometheus metrics.
  - Keep the menu-bar app's schema as the single source of truth.

## External skills and repositories to review

These are high-signal references, not dependency recommendations. Reported savings are usually project-authored and not comparable across tools.

- [ ] Review [code-compression-bench](https://github.com/daseinlabs/code-compression-bench).
  - Best idea to borrow: identical-task, identical-model, official-grader A/B harness.
  - Main caveat: benchmark coverage may not match subscription CLI behavior or MaxxToken's user mix.

- [ ] Review [SkillReaper](https://github.com/thousandflowers/skillreaper).
  - Best idea to borrow: transcript-evidence-based KEEP, REVIEW, MUTE, and REAP decisions with quarantine/restore.
  - Main caveat: character-based token estimates need provider-tokenizer calibration.

- [ ] Review [Aider's repository map](https://github.com/Aider-AI/aider/blob/main/aider/website/docs/repomap.md).
  - Best idea to borrow: Tree-sitter symbols plus graph ranking inside a fixed token budget.
  - Main caveat: language-parser coverage and stale indexes need explicit handling.

- [ ] Review [RTK](https://github.com/rtk-ai/rtk).
  - Best idea to borrow: command-specific structural filters and a local savings ledger.
  - Main caveat: hooks do not cover built-in Read/Grep tools, and compressed output can remove correctness-critical details.

- [ ] Review [Headroom](https://github.com/headroomlabs-ai/headroom).
  - Best idea to borrow: retrievable full payloads, tool-output compression, and cache-prefix alignment.
  - Main caveat: its headline savings are self-reported; proxy rewriting can break caches or trigger extra turns.

- [ ] Review [context-mode](https://github.com/mksglu/context-mode).
  - Best idea to borrow: sandbox large tool outputs and return compact handles/results to the model.
  - Main caveat: another MCP layer adds trust, setup, and retrieval-round-trip costs.

- [ ] Review [squeez](https://github.com/claudioemmanuel/squeez).
  - Best idea to borrow: cross-agent hooks, repeated-read diffs, and signature-mode source reads.
  - Main caveat: signature-only code is insufficient before exact edits.

- [ ] Review [Bifrost Code Mode](https://github.com/maximhq/bifrost/blob/dev/docs/mcp/code-mode.mdx).
  - Best idea to borrow: lazy tool discovery and one sandboxed orchestration call instead of large schemas and many model round trips.
  - Main caveat: atomic code-mode execution changes per-tool approval and audit semantics.

- [ ] Review [Microsoft LLMLingua](https://github.com/microsoft/LLMLingua).
  - Best idea to borrow: budget-controlled prompt and long-context compression.
  - Main caveat: generic token-level compression is unsuitable for exact code, policies, commands, and errors.

- [ ] Review [RouteLLM](https://github.com/lm-sys/RouteLLM).
  - Best idea to borrow: calibrated weak/strong routing based on quality-cost thresholds.
  - Main caveat: benchmark-trained API routing does not directly map to opaque subscription quota units.

- [ ] Review [LiteLLM](https://github.com/BerriAI/litellm).
  - Best idea to borrow: normalized spend, budgets, routing, fallbacks, and pricing across many APIs.
  - Main caveat: it is a gateway/server product; MaxxToken should integrate with it rather than absorb its scope.

- [ ] Review [GPTCache](https://github.com/zilliztech/GPTCache).
  - Best idea to borrow: exact and semantic response caching before an LLM call.
  - Main caveat: false semantic hits and stale responses are dangerous for changing code and current-state queries.

- [ ] Review [Caveman](https://github.com/JuliusBrussee/caveman).
  - Best idea to borrow: portable concise-output instructions that preserve code and commands.
  - Main caveat: prose savings can be offset by added instructions or corrective turns; benchmark the entire task.

- [ ] Review [token-reduce-skill](https://github.com/chimera-defi/token-reduce-skill).
  - Best idea to borrow: path-first retrieval, one-ranked-snippet responses, fresh-context handoffs, and cross-agent setup.
  - Main caveat: agent compliance varies, and an MCP installation can itself add always-on schema cost.

- [ ] Review [OpenUsage.sh](https://github.com/janekbaraniewski/openusage).
  - Best idea to borrow: broad report modes, hooks, daemon history, statuslines, CSV/JSON, and Prometheus output.
  - Main caveat: its terminal-first scope overlaps MaxxToken's TUI; reuse data-contract ideas instead of building a second product.

## Release gates for every savings feature

- [ ] Prove lower provider-billed cost or lower quota consumption on representative runs.
- [ ] Prove unchanged or improved task success and patch correctness.
- [ ] Count retries and added turns; do not hide them behind compression percentages.
- [ ] Preserve exact code, commands, errors, file paths, and edit anchors when correctness depends on them.
- [ ] Keep all analysis local unless the user explicitly enables a networked feature.
- [ ] Redact transcripts and credentials from benchmarks, logs, exports, screenshots, and crash reports.
- [ ] Provide preview, backup, restore, disable, and full-delete controls.
- [ ] Label third-party savings percentages as vendor/self-reported until reproduced by Savings Lab.
- [ ] Add adversarial fixtures for stale data, malformed logs, prompt-cache breaks, false semantic-cache hits, and compression-caused retry loops.
- [ ] Prefer verdicts users can act on over another chart.

## Research stop note

Discovery stopped after the main product comparison and the major token-saving lanes converged on the same mechanisms: fresh sessions, smaller always-on context, selective retrieval, quieter tool output, stable cacheable prefixes, cheaper-model routing, and measurable correctness-aware benchmarking. Further broad searching was producing duplicate implementations rather than new strategy classes.
