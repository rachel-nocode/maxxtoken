# COPY — every user-facing string

Verbatim. Casing matters — uppercase in the source means uppercase on screen.

## Wordmark
- `Maxx` + `Token` (the "Token" half is lime)

## Header pills
- `BURN` (the right-side pill on Home, mono uppercase)

## Subpage back labels (after `‹ BACK · `)
- `MISSIONS`
- `NEW MISSION`
- `DETECTED PROVIDERS`

## Live strip
- Home: `LIVE · {N} STREAMS`  + (when burning > 0) `{N} BURNING`
- Missions: `UNUSED TOKENS · BURN THEM ON IDEAS`

## Mission context strip
- `USE {PROVIDER} · {N}% USED · ${N} LEFT TO BURN`

## Footer tile labels
- `SPENT`, `LEFT`, `SYNC`

## Provider row
- Caption left: `5H {n}% · 7D {n}%`
- Caption right: `RESET {reset}` (uppercased)

## Expanded row · window bars
- Label: `SESSION · 5H` / `WEEKLY · 7D`
- Caption (right): `RESETS IN {reset}` (uppercased)

## Expanded row · section heads
- `COST` — right meta: `estimated` (or `plan included` for Cursor)
- `TOKENS` — right meta: `{events} EVENTS` (with `.toLocaleString()`)
- `MODEL BURN` — right meta: `{n} ACTIVE`

## Expanded row · cost rows
- `Today`, `Yesterday`, `Last 30d`

## Expanded row · stat tiles
- `IN`, `CACHED`, `OUT`

## Expanded row · model rows
- Trailing: `{tokens} tok`, `${usd}` (or `incl.` when 0), `{burn}%`

## Missions

### Card row 1
- Left: `{#N}` then title (e.g. `#1   Changelog Séance`).
- Right: time est, e.g. `~120M` (uppercased from `~120m`).

### Card row 3 — italic quote
Italic mono with 2px lime left border.

### Card row 4
- 3 difficulty squares (lit = `m.difficulty`).
- Stack chip.
- `Start build →`

### Below the last card
- `MORE IDEAS REFRESH EVERY 12H · OR SUBMIT ONE`  
  ("SUBMIT ONE" in lime, underlined)

## New Mission

### Section heads
- `FOLDER` — right: path (`~/folder`) when picked, else `NONE`.
- `MODELS` — right: `{n} SELECTED`.
- `GOAL` — right: `{n} CHAR` when input present, else `OPTIONAL`.

### FOLDER body
- Button label: `Pick folder` initially; after pick: `~/{folderName}`.
- After pick, a `CHANGE` link.

### MODELS rows
For each provider:
- `{NAME}` (uppercased mono 12 / 700).
- Sub: `{plan} · {used}%` (uppercased).
- Action label (right):
  - `AUTO-START` (lime) — if provider has cookie/API key.
  - `COPY PROMPT` (text3) — otherwise.

### GOAL textarea
- Placeholder: `Ship the smallest useful version of...`

### Footer buttons (left to right)
- `BACK` (ghost)
- `COPY GOAL` (ghost)
- spacer
- `Start mission →` (primary lime)

## Settings

### Hint banner
`PLAN VALUES STAY AUTOMATIC. USE THE CONFIG FILE ONLY FOR OVERRIDES.`

### Provider rows
- Sub: `{plan} · DETECTED` (uppercased; for OpenAI API → `ADMIN API · ADD API KEY`).
- Right dropdown: `WARN AUTO` (default).
- Cookie placeholders (when row enabled and `cookie: true`):
  - Cursor: `Cookie: WorkosCursorSessionToken=...`
  - Others: `Cookie: sso=...; sso-rw=... or Bearer ...`
- Cookie row trailing button: `SAVE` (ghost).

### NOTIFICATIONS group
- Head right meta: `{n} ON`
- Toggle rows: `Idea missions`, `Maxx alerts`, `Session restored`, `Quota warnings`.
- Dropdown rows:
  - `Session warning` → `50% + 20% left`
  - `Weekly warning` → `50% + 20% left`
  - `Alert window` → `48h before reset`
  - `Reserve floor` → `25% unused`

### APP group
- Head right meta: `DARK · VALUE LEFT`
- Dropdown rows: `Menu bar` → `Value left`; `Token history` → `30 days`.
- Toggle rows: `Light mode`, `Open at login`.

### UPDATES group
- Head right meta: e.g. `v0.2.3-BETA.1` (the version string, uppercased).

### Footer
- Left ghost-text: `REVEAL CONFIG`, `REVEAL LOG`.
- Right primary lime: `Save`.

## Universal casing rule

Mono labels are **uppercased** when they're eyebrows, captions, section
heads, or button labels.  
Sans labels are **mixed case** (`Idea missions`, `Light mode`).  
Provider names keep their canonical casing (`ChatGPT`, `Claude`, `Cursor`,
`Kimi`, `Grok`).
