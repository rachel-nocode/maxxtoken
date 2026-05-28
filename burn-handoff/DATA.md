# DATA — record shapes + sample data

The prototype is seeded with five providers and four missions. Use these as
your fixtures while wiring screens; replace with real values from your
detection layer once the UI is up.

## Provider record

```ts
type Provider = {
  id: 'chatgpt' | 'claude' | 'cursor' | 'kimi' | 'grok' | (string & {});
  name: string;             // 'ChatGPT'
  plan: string;             // 'Pro 20×', 'Max 20×', 'Pro+', 'Basic', 'Build'
  used: number;             // overall cap used, 0..100 — the headline %
  s5h: number;              // 5-hour window used %
  w7d: number;              // 7-day window used %
  status: 'ok' | 'warn' | 'idle';   // 'warn' → burning row treatment
  reset: string;            // '01h 11m' / '11d 02h' — already humanised
  spark: number[];          // 9 numbers, last-9 sync ticks for the sparkline

  tokens: {
    today:  { tok: number; usd: number };
    yest:   { tok: number; usd: number };
    last30: { tok: number; usd: number };
  };
  inOut: {
    in: number;       // M (millions of tokens); render as "{n}M"
    cached: number;   // M
    out: number;      // M
    events: number;   // total event count; rendered with .toLocaleString()
  };
  models: ProviderModel[];
};

type ProviderModel = {
  name: string;       // 'gpt-5', 'sonnet-4.5', 'haiku-4', etc.
  burn: number;       // 0..100 — share of this provider's traffic
  tok: number;        // M (or B if > 1000) — see formatter below
  usd: number;        // 0 means "incl. in plan"
  color: string;      // BURN.lime or BURN.warn — override per row if needed
};
```

### Sample (verbatim from the prototype)

```ts
export const BURN_PROVIDERS: Provider[] = [
  {
    id: 'chatgpt', name: 'ChatGPT', plan: 'Pro 20×',
    used: 23, s5h: 4, w7d: 23, status: 'ok', reset: '01h 11m',
    spark: [12,15,18,20,21,22,23,23,23],
    tokens: {
      today:  { tok: 87,   usd: 83.40 },
      yest:   { tok: 234,  usd: 239.35 },
      last30: { tok: 5486, usd: 4889.28 },
    },
    inOut: { in: 2834, cached: 2644, out: 7.7, events: 22557 },
    models: [
      { name: 'gpt-5',      burn: 78, tok: 4280, usd: 3812.10 },
      { name: 'gpt-5-mini', burn: 18, tok:  980, usd:  870.40 },
      { name: 'o4-mini',    burn:  4, tok:  226, usd:  206.78 },
    ],
  },
  {
    id: 'claude', name: 'Claude', plan: 'Max 20×',
    used: 8, s5h: 0, w7d: 8, status: 'ok', reset: '02h 57m',
    spark: [2,4,5,6,7,7,8,8,8],
    tokens: {
      today:  { tok: 12,   usd: 18.40 },
      yest:   { tok: 34,   usd: 41.20 },
      last30: { tok: 1280, usd: 1542.00 },
    },
    inOut: { in: 920, cached: 740, out: 2.1, events: 4180 },
    models: [
      { name: 'sonnet-4.5', burn: 64, tok: 820, usd: 988.20 },
      { name: 'opus-4.1',   burn: 30, tok: 380, usd: 460.10 },
      { name: 'haiku-4',    burn:  6, tok:  80, usd:  94.10 },
    ],
  },
  {
    id: 'cursor', name: 'Cursor', plan: 'Pro+',
    used: 17, s5h: 17, w7d: 22, status: 'ok', reset: '11d 02h',
    spark: [6,9,11,13,14,15,16,17,17],
    tokens: {
      today:  { tok: 42,   usd: 0 },
      yest:   { tok: 88,   usd: 0 },
      last30: { tok: 2140, usd: 0 },
    },
    inOut: { in: 1402, cached: 1180, out: 3.4, events: 8902 },
    models: [
      { name: 'gpt-5',      burn: 52, tok: 1112, usd: 0 },
      { name: 'sonnet-4.5', burn: 41, tok:  880, usd: 0 },
      { name: 'auto',       burn:  7, tok:  148, usd: 0 },
    ],
  },
  {
    id: 'kimi', name: 'Kimi', plan: 'Basic',
    used: 1, s5h: 0, w7d: 1, status: 'idle', reset: '4d 11h',
    spark: [0,0,1,1,1,1,1,1,1],
    tokens: {
      today:  { tok: 0,  usd: 0 },
      yest:   { tok: 2,  usd: 0 },
      last30: { tok: 18, usd: 0 },
    },
    inOut: { in: 14, cached: 8, out: 0.4, events: 22 },
    models: [{ name: 'k2', burn: 100, tok: 18, usd: 0 }],
  },
  {
    id: 'grok', name: 'Grok', plan: 'Build',
    used: 31, s5h: 31, w7d: 31, status: 'warn', reset: '01h 09m',
    spark: [8,14,19,22,25,27,29,30,31],
    tokens: {
      today:  { tok: 1.7, usd: 1.75 },
      yest:   { tok: 0,   usd: 0 },
      last30: { tok: 1.7, usd: 1.75 },
    },
    inOut: { in: 1.4, cached: 0.2, out: 0.1, events: 318 },
    models: [{ name: 'grok-build', burn: 100, tok: 1.7, usd: 1.75 }],
  },
];
```

### Token formatter

```ts
function formatTokens(tok: number): string {
  if (typeof tok !== 'number') return String(tok);
  if (tok >= 1000) return `${(tok / 1000).toFixed(1)}B`;  // 5486 → 5.5B
  if (tok >= 1)    return `${tok}M`;                       // 87 → 87M
  return `${(tok * 1000).toFixed(0)}K`;                    // 0.4 → 400K
}
```

### USD formatter

`$X.XX` (`toFixed(2)`) when `> 0`. Show an em-dash `—` (`text3`) when 0,
except in the per-model row where 0 reads as `incl.` (in `text3`).

### Reset string formatter

Format `reset` upstream — render verbatim. Pattern is one of:
- `XXh XXm` (under a day, e.g. `01h 11m`, `02h 57m`)
- `Xd XXh`  (over a day, e.g. `11d 02h`, `4d 11h`)

Uppercase only at render time — the data is mixed case.

---

## Mission record

```ts
type Mission = {
  n: string;              // '#1', '#2', etc. — keep the hash
  title: string;          // 'Changelog Séance'
  body: string;           // one-line description
  quote: string;          // italic mono line
  difficulty: 1 | 2 | 3;  // count of lit squares
  time: string;           // '~120m'
  stack: string;          // 'Node git parser + Vite'
  rec: Provider['id'];    // recommended provider (drives the context strip)
};
```

### Sample (verbatim from the prototype)

```ts
export const BURN_MISSIONS: Mission[] = [
  {
    n: '#1', title: 'Changelog Séance',
    body: 'Point it at a repo and it narrates the project history as a dramatic story you can replay.',
    quote: 'AI-built repos move fast and lose their why; narrated history rebuilds context.',
    difficulty: 3, time: '~120m',
    stack: 'Node git parser + model call + Vite',
    rec: 'claude',
  },
  {
    n: '#2', title: 'Ambient Status Orb',
    body: 'A tiny always-on desktop orb that glows with the one number that matters today.',
    quote: 'Builders drown in dashboards; one ambient signal beats constant checking.',
    difficulty: 3, time: '~130m',
    stack: 'Electron transparent window + JSON socket',
    rec: 'cursor',
  },
  {
    n: '#3', title: 'Prompt Fossil Record',
    body: 'It quietly archives every prompt you send and surfaces the ones that actually worked.',
    quote: 'Prompts are real IP now and everyone throws them away.',
    difficulty: 3, time: '~120m',
    stack: 'Local SQLite + Raycast extension',
    rec: 'claude',
  },
  {
    n: '#4', title: 'Token Diet Coach',
    body: 'Rewrites your latest prompts to be 40% shorter while preserving intent.',
    quote: 'Cheapest token is the one you never sent.',
    difficulty: 2, time: '~80m',
    stack: 'Single model call + clipboard hook',
    rec: 'kimi',
  },
];
```

---

## Settings: provider list

```ts
const SETTINGS_PROVIDERS = [
  { id: 'chatgpt', name: 'ChatGPT',    sub: 'Pro 20× · detected' },
  { id: 'claude',  name: 'Claude',     sub: 'Max 20× · detected' },
  { id: 'cursor',  name: 'Cursor',     sub: 'Pro+ · detected',     cookie: true },
  { id: 'kimi',    name: 'Kimi',       sub: 'Basic · detected' },
  { id: 'grok',    name: 'Grok',       sub: 'Build · detected',    cookie: true },
  { id: 'openai',  name: 'OpenAI API', sub: 'Admin API · add API key', cookie: true },
];
```

`cookie: true` providers show the inline paste-field + SAVE button below
their row when enabled.

Cookie placeholders:
- `cursor`: `Cookie: WorkosCursorSessionToken=...`
- everyone else with `cookie: true`: `Cookie: sso=...; sso-rw=... or Bearer ...`

---

## Notifications defaults

```ts
const NOTIFS_DEFAULT = {
  ideas:    true,  // 'Idea missions'
  alerts:   true,  // 'Maxx alerts'
  restored: true,  // 'Session restored'
  quota:    true,  // 'Quota warnings'
};

const NOTIFS_DROPDOWNS = [
  { label: 'Session warning', value: '50% + 20% left' },
  { label: 'Weekly warning',  value: '50% + 20% left' },
  { label: 'Alert window',    value: '48h before reset' },
  { label: 'Reserve floor',   value: '25% unused' },
];
```

## App defaults

```ts
const APP_DROPDOWNS = [
  { label: 'Menu bar',       value: 'Value left' },
  { label: 'Token history',  value: '30 days' },
];
const APP_TOGGLES = [
  { label: 'Light mode',     defaultOn: false },
  { label: 'Open at login',  defaultOn: true },
];
```

## Updates

`'v0.2.3-beta.1'` — sample. Pull from the real version constant.

---

## Context-strip recommender (Missions)

The lime strip at the top of the Missions screen says e.g.
`USE CLAUDE · 8% USED · $184 LEFT TO BURN`.

Pick the provider with **the highest reasonable burn budget remaining**:
1. Filter out `status === 'warn'`.
2. Among the rest, prefer the one with the lowest `used %`.
3. Tiebreak on largest `(monthly_cap_usd - spent_today_usd)`.

If none qualify, hide the strip.

---

## Footer numbers (Home, Missions)

`SPENT` / `LEFT` / `SYNC` are global, not per-provider:

```ts
{
  spent: sum(providers, p => p.tokens.today.usd + p.tokens.yest.usd /* + ... */),
  left:  monthlyCapUSD - spent,
  sync:  '15m', // time since last detection sync
}
```

The exact rollup is up to you — the strip just shows the rollup. The
prototype hard-codes `$181`, `$421`, `15m`.
