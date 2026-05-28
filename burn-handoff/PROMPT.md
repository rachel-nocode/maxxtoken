# Prompt — paste this into Claude Code at your repo root

---

You are implementing a new UI for the **MaxxToken** macOS menu-bar app. The
design is finished; your job is to wire it up against the existing codebase.

## Read this first

There is a folder at `burn-handoff/` (paste it into the repo if it isn't there
already). Read **every file** in it before writing any code:

1. `burn-handoff/SPEC.md` — overall design system + screen-by-screen spec.
2. `burn-handoff/TOKENS.md` — colors, type, spacing, radii.
3. `burn-handoff/PRIMITIVES.md` — the shared components and their props.
4. `burn-handoff/SCREENS.md` — the four screens, layout line-by-line.
5. `burn-handoff/DATA.md` — provider + mission record shapes.
6. `burn-handoff/COPY.md` — every user-facing string verbatim.
7. `burn-handoff/ICONS.md` — SVG path data for every icon.
8. `burn-handoff/reference/*.jsx` — the **canonical** prototype source. If the
   markdown is ambiguous, the JSX is the answer.
9. `burn-handoff/assets/*.png` — screenshots of every screen for visual reference.

## What I want you to do

1. Inspect the current source layout. Tell me:
   - Where the existing top-level screens (Home / Settings / etc) live.
   - Where the current progress-bar implementation lives.
   - Which provider data model you'll reuse.
2. Propose a file-tree plan for the new code — where new components go, what
   gets replaced, what stays. Do not write any code yet.
3. Wait for my "go" on the plan.
4. Then implement, **one screen at a time**, in this order:
   1. The four primitives (`BurnSegBar`, `BurnSparkline`, `BurnHeader`,
      `BurnLiveStrip`, `BurnFooter`).
   2. Home (collapsed rows).
   3. Home (expanded row — the in-place detail panel).
   4. Missions list + Mission Setup form.
   5. Settings.
5. After each screen, stop and let me sanity-check.

## Constraints

- **Do not invent new colors.** Use the tokens in `TOKENS.md` only.
- **Do not invent new components.** Every UI atom is in `PRIMITIVES.md`. If
  something is missing, ask — don't ship a one-off.
- **One progress component.** Every bar in the app goes through `BurnSegBar`.
  Delete any pre-existing bar implementations as you migrate screens.
- **Mono vs sans is a rule:** mono for timestamps, %, $, token counts,
  captions, and button labels. Sans for titles and body copy. See `TOKENS.md`.
- **Animations:** row expand/collapse 120ms ease; switch knob slide 120ms ease.
  Nothing else animates. No pulsing dots, no count-ups, no shimmer.
- **macOS-native primitives** where they exist (NSView / SwiftUI / RN — match
  the existing stack). Don't re-skin a web component if the rest of the app is
  native.

## Acceptance (mirror these in your PR description)

- [ ] All four screens implemented and routable: Home, Missions, New Mission, Settings.
- [ ] One progress component (`BurnSegBar`) used in all six places it appears.
- [ ] Burning state changes color in exactly three places: bar cells,
      sparkline, used-% number. No other red.
- [ ] Header is identical across screens; only the diamond / gear get the
      active border depending on which screen you're on.
- [ ] Footer (`SPENT · LEFT · SYNC`) shows on Home and Missions only.
- [ ] Settings: drag-reorder provider rows, switch state persists, cookie
      paste-and-save works on Cursor + Grok rows.
- [ ] Diamond from any screen → Missions. Gear from any screen → Settings.
      BACK on any subpage → Home.
- [ ] Only one row can be expanded at a time on Home (toggle behavior).

Begin.
