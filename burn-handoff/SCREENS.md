# SCREENS — line-by-line layout

Use this when you're staring at one screen and need to know exactly what
goes where, top to bottom. Everything below is verified against
`reference/burn-system.jsx`.

---

## Screen 1 · Home

```
BurnWindow
├── BurnHeader (Home mode)
│   ├── spark tile + "MaxxToken" wordmark + "BURN" pill
│   ├── flex spacer
│   ├── diamond btn → goto Missions
│   └── gear btn → goto Settings
│
├── BurnLiveStrip
│   ├── live dot
│   ├── "LIVE · 5 STREAMS"
│   ├── flex spacer
│   └── "{n} BURNING" (warn, only when > 0)
│
├── scrollable body
│   └── for each provider:
│       BurnProviderRow
│       ├── (clickable card; whole row toggles expand)
│       ├── top sub-row:
│       │   avatar 14 · name · plan · spacer · sparkline · used % · chevron-btn
│       ├── BurnSegBar (28 × 5)
│       └── caption row:
│           "5H x% · 7D y%"  /  "RESET XXh XXm"
│
│       BurnProviderExpanded (when expanded)
│       ├── BurnWindowBar  SESSION · 5H
│       ├── BurnWindowBar  WEEKLY · 7D
│       ├── BurnSectionHead  COST | estimated|plan-included
│       │   ├── BurnCostRow  Today / Yesterday / Last 30d  (×3)
│       ├── BurnSectionHead  TOKENS | {events} EVENTS
│       │   └── 3-column grid: BurnStat IN / CACHED / OUT
│       └── BurnSectionHead  MODEL BURN | {n} ACTIVE
│           └── one BurnModelRow per model:
│               name · tok · $ · burn%   then BurnSegBar (20 × 3)
│
└── BurnFooter
    └── 3 tiles: SPENT (lime) · LEFT (warn) · SYNC (text)
```

### Behavior

| Trigger | Effect |
| --- | --- |
| Click anywhere on a collapsed row | Toggles that row's expanded panel. |
| Click the chevron button | Same toggle. `stopPropagation`. |
| Click diamond | Push `Missions`. |
| Click gear | Push `Settings`. |
| Burning provider | Row bg `rgba(255,107,92,0.05)`; bar + sparkline + % switch to `warn`. |
| `expandedId` state | Only one row open at a time. Clicking the open row collapses it. |

---

## Screen 2 · Missions

```
BurnWindow
├── BurnHeader (Subpage mode, diamondActive=true)
│   ├── "‹ BACK · MISSIONS"
│   ├── flex spacer
│   ├── diamond btn (active border)
│   └── gear btn
│
├── BurnLiveStrip (label="UNUSED TOKENS · BURN THEM ON IDEAS")
│
├── scrollable body
│   ├── Context strip:
│   │   bg rgba(182,255,60,0.04), padding 10/14, bottom hairline.
│   │   "USE CLAUDE · 8% USED · $184 LEFT TO BURN" in lime mono 11.
│   │
│   ├── for each mission:
│   │   BurnIdeaCard
│   │   ├── row 1: "#N" + title + spacer + time est
│   │   ├── row 2: body copy
│   │   ├── row 3: italic mono quote with lime border-left
│   │   └── row 4: 3 difficulty dots · stack chip · "Start build →"
│   │
│   └── tail caption:
│       "MORE IDEAS REFRESH EVERY 12H · OR SUBMIT ONE"
│
└── BurnFooter (same as Home)
```

### Behavior

| Trigger | Effect |
| --- | --- |
| Click `Start build →` on any card | Push `Mission Setup`. (Pre-select the card's `rec` provider in the Models list.) |
| Click "SUBMIT ONE" link | Out of scope for v1 — leave as inert `text-decoration: underline`. |
| Click BACK | Pop to `Home`. |
| Click diamond | No-op (we're already here). |
| Click gear | Push `Settings`. |

---

## Screen 3 · New Mission (Mission Setup)

```
BurnWindow
├── BurnHeader (Subpage mode, no live strip)
│   └── "‹ BACK · NEW MISSION"
│
├── scrollable body (padding 14, vertical gap 14)
│   ├── section FOLDER
│   │   BurnSectionHead "FOLDER" | path or "NONE"
│   │   └── "Pick folder" button (turns lime once picked) + "CHANGE" link
│   │
│   ├── section MODELS
│   │   BurnSectionHead "MODELS" | "{n} SELECTED"
│   │   └── one BurnModelCheck per provider:
│   │       checkbox · avatar · NAME · "plan · used%" · spacer · action
│   │
│   └── section GOAL
│       BurnSectionHead "GOAL" | "{n} CHAR" or "OPTIONAL"
│       └── textarea (78px, mono 11.5)
│
└── sticky footer (no BurnFooter — different)
    ├── "BACK" ghost
    ├── "COPY GOAL" ghost
    ├── flex spacer
    └── "Start mission →" lime primary
```

### Behavior

| Trigger | Effect |
| --- | --- |
| Click `Pick folder` | Open OS folder picker. Persist last-chosen folder. |
| Toggle `BurnModelCheck` | Update local selection state. The right-side action label (`AUTO-START` vs `COPY PROMPT`) is purely derived from provider capability — not a toggle. |
| Type in textarea | Live-update `GOAL` right meta to `{n} CHAR`. |
| Click `Start mission →` | Validate (folder + ≥1 model). Then kick off the mission flow (whatever your existing `runMission` is). |
| Click `BACK` (footer or header) | Pop to `Missions`. |
| Click `COPY GOAL` | Copy textarea contents to clipboard. |

---

## Screen 4 · Settings

```
BurnWindow
├── BurnHeader (Subpage mode, settingsActive=true)
│   └── "‹ BACK · DETECTED PROVIDERS"
│
├── scrollable body
│   ├── Hint banner:
│   │   margin 14, lime-tinted, mono 10.5.
│   │   "PLAN VALUES STAY AUTOMATIC. USE THE CONFIG FILE ONLY FOR OVERRIDES."
│   │
│   ├── provider rows (padding 0/14, gap 6):
│   │   for each SETTINGS_PROVIDERS:
│   │     BurnProvSettingRow
│   │     ├── main row:
│   │     │   drag-handle (list icon) · avatar 15 · column(name + sub) ·
│   │     │   BurnSettingDropdown "WARN AUTO" · BurnSwitch
│   │     └── inline cookie row (if cookie:true && enabled):
│   │         text input (placeholder) + SAVE button
│   │
│   ├── group NOTIFICATIONS (collapsible, open by default)
│   │   BurnCollapsibleHead "NOTIFICATIONS" | "{n} ON"
│   │   ├── BurnToggleRow Idea missions
│   │   ├── BurnToggleRow Maxx alerts
│   │   ├── BurnToggleRow Session restored
│   │   ├── BurnToggleRow Quota warnings
│   │   ├── BurnDropdownRow Session warning  → "50% + 20% left"
│   │   ├── BurnDropdownRow Weekly warning   → "50% + 20% left"
│   │   ├── BurnDropdownRow Alert window     → "48h before reset"
│   │   └── BurnDropdownRow Reserve floor    → "25% unused"
│   │
│   ├── group APP (collapsible, closed by default)
│   │   BurnCollapsibleHead "APP" | "DARK · VALUE LEFT"
│   │   ├── BurnDropdownRow Menu bar       → "Value left"
│   │   ├── BurnDropdownRow Token history  → "30 days"
│   │   ├── BurnToggleRow   Light mode
│   │   └── BurnToggleRow   Open at login
│   │
│   └── group UPDATES (head only — never opens in v1)
│       BurnCollapsibleHead "UPDATES" | "{version}"
│
└── sticky footer
    ├── "REVEAL CONFIG" text-only (text3)
    ├── "REVEAL LOG"    text-only (text3)
    ├── flex spacer
    └── "Save" lime primary
```

### Behavior

| Trigger | Effect |
| --- | --- |
| Drag a provider row (handle) | Reorder list. Persist order. |
| Toggle a provider switch | Enable/disable detection for that provider. |
| Cursor / Grok / OpenAI API switch ON | Reveal inline cookie row. SAVE persists the value. |
| `WARN AUTO` dropdown | Choose threshold mode per provider. (Options out of scope — show dropdown chrome only.) |
| `NOTIFICATIONS` head | Toggle group open/closed. |
| `APP` head | Same. |
| `UPDATES` head | No-op in v1 — just shows the version on the right. |
| `REVEAL CONFIG` / `REVEAL LOG` | Open the file in Finder. |
| `Save` | Persist all dirty settings + close the popover. |
| Click BACK | Pop to `Home`. |
| Click gear | No-op (we're here). |
| Click diamond | Push `Missions`. |

---

## Routing summary

State machine (matches `BurnApp` in `reference/burn-system.jsx`):

```ts
type Screen = 'home' | 'missions' | 'mission-setup' | 'settings';

// transitions:
home          --diamond-->     missions
home          --gear-->        settings
missions      --back/diamond-->home
missions      --start-build--> mission-setup
missions      --gear-->        settings
mission-setup --back-->        missions
mission-setup --start-mission-->home   (after success)
settings      --back/gear-->   home
```

Diamond and gear are reachable from every screen header — wire them at the
`BurnHeader` level so each subpage gets the cross-routing for free.
