# OU-02 · BURN interface design

## Home

1. The provider header identifies the account plan and its own freshness state. Live, cached, and failed readings never share the same treatment.
2. The primary allowance row keeps four facts together: window name, current used/left value, projected allowance left at reset, and that window's reset countdown.
3. The filled rail is current usage. The solid vertical marker is the estimated endpoint at the current pace. Forecast text remains visible when a marker is unavailable and explains early, zero, stale, missing-reset, exhausted, and rollover states.
4. Warning color belongs to the affected window. A risky weekly window does not recolor a healthy session window.
5. Trend data appears only when history exists for the displayed primary window. Missing history does not become a flat synthetic trend.
6. Expanding a card reveals each allowance as its own rounded panel, followed by measured tokens and clearly labeled estimated API-equivalent spend. Footer dollars are labeled as plan value used/left, not cash balance or billed spend.

## Recovery and empty states

- Failed connections replace the meter with the provider error and a Settings recovery action, so missing data cannot read as a healthy zero.
- Cached readings retain the last good usage, show its age and source, and pause the forecast.
- An empty Home explains how to enable a provider and links to Settings.
- A failed manual refresh keeps the last successful data visible and reports the failure inline.

## Settings and navigation

- Settings uses the same rounded surfaces and quiet hierarchy as Home. Provider order, enablement, warning controls, credentials, notifications, appearance, menu-bar mode, support, updates, and export remain available.
- Optimize, Token Coach, Settings, Home, and Back keep their existing routes. Escape returns to Home or closes Home; Command/Control-comma opens Settings; Command/Control-R refreshes.

## Adaptation and accessibility

- Layout targets the 420-pixel Electron popover and remains readable at 360 pixels. Long provider and plan labels truncate before controls.
- Dark and light palettes use the same semantic hierarchy and keep the BURN accent for progress, focus, and healthy status.
- Provider summaries are native buttons with `aria-expanded` and `aria-controls`. Collapsed detail is inert and hidden from the accessibility tree. Every interactive control has a two-pixel focus ring.
- Motion respects `prefers-reduced-motion`; reset and freshness labels revalidate every minute without an extra network request.
