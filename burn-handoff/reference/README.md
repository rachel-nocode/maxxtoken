# reference/

The canonical prototype source. **If markdown disagrees with these files, the
JSX wins.**

| File | What's inside |
| --- | --- |
| `burn-system.jsx` | The full Burn system — tokens (`BURN`), every primitive, all four screens, and the `BurnApp` route shell. |
| `burn-static.jsx` | Non-interactive wrappers used by the design canvas. The `BurnSpecBlock` notes inside it are the original designer's commentary. |
| `mocks.jsx` | Shared primitives that pre-date the Burn system: `Icon`, `Badge`, `PaceBar` (old bar — not used in Burn), color tokens (`TOKEN`), `iconBtn`, the `sans` / `mono` constants. The `<Icon>` switch is used as-is by Burn. |
| `variations.jsx` | Contains `ProvGlyph` (the per-provider monograms) — Burn imports this. The four `V1Ledger / V2Burn / V3Bloom / V4Slate` variants are NOT part of v2; ignore them. |

## How to run locally

1. Open `MaxxToken redesign.html` at the project root.
2. The whole thing is a Babel-in-browser React canvas — no build step.
3. Section "12 · Burn · full interactive system" contains the live app. Click
   chevrons to expand rows; click the diamond / gear to navigate.

## What to port

You don't need to mirror the file split. Reasonable target layout in a
typical React/Swift codebase:

```
src/
  burn/
    tokens.ts        # everything from `BURN`
    primitives/      # BurnSegBar, BurnSparkline, BurnHeader, BurnLiveStrip,
                     # BurnFooter, BurnSwitch, BurnSectionHead, ...
    screens/
      Home.tsx
      Missions.tsx
      MissionSetup.tsx
      Settings.tsx
    data/
      providers.ts   # BURN_PROVIDERS or the real detection store
      missions.ts    # BURN_MISSIONS or the real source
    icons/
      Icon.tsx       # name-switched <svg>
      ProvGlyph.tsx
    BurnApp.tsx      # route shell
```

For SwiftUI / native: same split, just s/.tsx/.swift and replace the SVGs
with SF Symbols or vector assets equivalent to the paths in `ICONS.md`.
