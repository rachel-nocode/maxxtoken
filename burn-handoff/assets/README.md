# assets/

Drop your PNG screenshots of section 12 into this folder. Claude Code reads
these directly when you drag them into the chat.

## Expected filenames

These match the artboard ids in `app.jsx` so the names already line up with
what's on the design canvas:

| Filename | What it should show |
| --- | --- |
| `burn-home-static.png` | Home, all rows collapsed. |
| `burn-home-expanded.png` | Home with one row (ChatGPT in the prototype) expanded. |
| `burn-missions.png` | Missions list. |
| `burn-mission-setup.png` | New Mission form (folder + models + goal). |
| `burn-settings.png` | Settings — provider list + notifications open. |
| `burn-app.png` | Optional: any interactive view you want to flag as the target. |

If your screenshots are named something else, that's fine — just rename
them so Claude Code can match them to the screen names in `SCREENS.md`.

## How to capture them (if you need to redo any)

1. Open `MaxxToken redesign.html` at the project root.
2. Scroll to section "12 · Burn · full interactive system".
3. Each artboard has its own bordered region. Use macOS `Cmd-Shift-4` →
   spacebar → click the artboard window to grab just that frame.

## Why they matter

The markdown spec is precise, but pixels are pixels. When Claude Code is
working on a screen, drag the matching PNG into the chat — it will compare
its draft against the picture and catch things the prose missed (spacing
nudges, exact alignment, the mood of the burn-tinted row).
