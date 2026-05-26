# Missions ideas

1. **Project Missions**
   Pick folder, goal, models.
   MaxxToken suggests best model order for task.
   Reason: turns idle quota into useful project progress.

2. **Quota Burn Challenges**
   Show "use Claude session now" or "spend Kimi before reset."
   One click opens prompt, repo, or terminal task.
   Reason: makes token maxxing actionable, not just visible.

3. **Model Relay Missions**
   Split one big job across models.
   Example: Claude plans, Codex edits, Kimi reviews, Grok researches.
   Reason: uses every subscription for strengths instead of forcing one model to do everything.

## Model trust ideas

1. **Baseline Mode**
   Learn normal burn rate per provider.
   Flag when today drains faster than usual.

2. **Token Leak Alert**
   Detect sudden token spikes on similar work.
   Explain likely causes: bigger context, retries, cache miss, model switch.

3. **Model Health Score**
   Score each provider from speed, errors, retry rate, token burn, and quota drain.
   Show simple language: "Codex feels worse today."

4. **Before / After Runs**
   Compare similar sessions over time.
   Example: "This review used 38% more tokens than usual."

5. **Context Bloat Meter**
   Warn when long chat history, huge files, or repeated context likely wastes tokens.
   Reason: saves users from accidental burn.

6. **Save Mode**
   Suggest cheaper routing before big tasks.
   Example: Kimi researches, Codex edits, Claude reviews.

7. **Maxx Mode**
   Push unused quota closest to reset.
   Reason: keeps the original token maxxing promise.

8. **Nerf Radar**
   Combine local anomalies with public chatter.
   Say "complaints high" or "burn anomaly detected," not "provider nerfed."

9. **Provider Receipts**
   Show concrete evidence.
   Example: "3 failed refreshes, 2x token drain, 18m stale data."

10. **Session Quality Log**
    Let users mark a session good or bad.
    Correlate quality with model, time, token burn, and provider status.

11. **What Changed?**
    Detect model, reset window, plan, source, or burn-rate changes.
    Reason: answers "why does this feel different?"

12. **Trust Panel**
    One compact expanded section.
    Example: "Fresh data · Normal burn · No outage · Public chatter low."

## Keep it light

- Main menu stays a dashboard.
- Cards show one small insight at a time.
- Deep diagnostics live behind one "Why?" or "Trust" action.
- No constant background scraping.
- Local baseline first.
- Public sentiment optional and cached.
- Save raw evidence locally, not in the UI.
- Prefer receipts over opinions.
- Use short claims: "faster drain," "stale data," "public chatter high."
- Avoid saying a provider is nerfed unless we have direct proof.

Best next product wedge:
Local Baseline + Token Leak Alert.
It gives concrete value without turning MaxxToken into another bloated CodexBar.

## Compact Trust reveal

- Keep provider cards compact by default.
- Add one tiny "Why?" or "Trust" action only when there is something to explain.
- Hover opens a small floating popover.
- Click pins it so the user can read or copy the receipts.
- Escape or outside click closes it.
- The popover should not change card height.
- Use three receipt rows max.
- No charts.
- No paragraphs.
- Example: `Fresh data · 2m old`.
- Example: `Burn rate · +18% vs normal`.
- Example: `Public chatter · elevated`.
- Use it for evidence, not vibes.
- Hover is bonus.
- Click is the accessibility fallback.
- Avoid a full diagnostics page until the signals earn that weight.

## Multiple accounts per provider

- Doable, but current MaxxToken config is one account per provider.
- Today `providers.claude`, `providers.codex`, and saved secrets all use provider id as the key.
- That means one provider card equals one account right now.
- CodexBar uses generic token accounts for API keys and cookie headers.
- CodexBar also has special Codex managed accounts with separate scoped `CODEX_HOME` folders.
- Each account needs a stable id, label, provider id, source type, optional workspace id, and secret reference.
- Secrets should be keyed by account id, not provider id.
- Aggregation should emit virtual cards like `claude:personal` and `claude:work`.
- Totals should sum enabled accounts, but dedupe matching provider account ids to avoid double counting.
- UI should default to grouped provider cards with compact account rows.
- Optional setting can split accounts into separate cards.
- Best first phase: API-key and cookie-header providers.
- Harder second phase: CLI/OAuth providers like Codex, Claude, and Kimi.
- Main risk: same provider account discovered twice through browser, CLI, and manual token.
- Product promise: "multiple account aliases per provider, grouped by default."
