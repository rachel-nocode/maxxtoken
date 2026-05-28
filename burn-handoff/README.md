# MaxxToken · "Burn" — Claude Code handoff package

This folder is everything Claude Code needs to build section **12 · Burn** from
`MaxxToken redesign.html` against your real codebase.

## What to do

1. Drop your screenshots into `assets/` (file naming is in `assets/README.md`).
2. Open Claude Code at your repo root.
3. Paste the contents of **`PROMPT.md`** into Claude Code. That prompt instructs it to read everything in this folder.
4. Optionally drag the PNGs from `assets/` into the chat too — they help Claude see the target visually.

## What's in here

| File | Purpose |
| --- | --- |
| `PROMPT.md` | The prompt to paste into Claude Code. Refers to everything else. |
| `SPEC.md` | The full design spec — tokens, primitives, four screens, acceptance. |
| `TOKENS.md` | Color, type, spacing, radius — copy/paste constants. |
| `PRIMITIVES.md` | Every reusable component (bar, sparkline, header, etc.) with exact props. |
| `SCREENS.md` | Layout of Home, Missions, New Mission, Settings — line by line. |
| `DATA.md` | Shape of the provider + mission records, with sample data. |
| `COPY.md` | Every user-facing string verbatim. |
| `ICONS.md` | All icons as SVG path data — drop straight into an `<Icon>` component. |
| `reference/` | The original JSX prototype — the source of truth for any ambiguity. |
| `assets/` | Drop your PNGs here. Filenames listed in `assets/README.md`. |

## Source of truth

If the spec disagrees with the reference JSX, **the JSX wins** — it's the
prototype the user signed off on. The markdown is a faithful description of it.

The prototype lives at `MaxxToken redesign.html` → section "12 · Burn ·
full interactive system". You can run it from the project root.
