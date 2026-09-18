# Product and setup guide

This guide describes MaxxToken v0.2.13.

## Install

### macOS

The v0.2.13 Mac release supports Apple Silicon and Intel. Download the universal DMG from the [latest release](https://github.com/rachel-nocode/maxxtoken/releases/latest), open it, and drag MaxxToken to Applications. The app is signed and notarized. macOS 12 or later is required.

MaxxToken runs as a menu-bar app. If macOS closes it immediately, open it from Applications once. Screen-capture privacy masking is opt-in and uses a bundled detector without requesting Screen Recording permission; usage stays hidden when detection is pending, limited, or unavailable.

Mac users can install the same current stable app from the maintained tap:

```bash
brew install --cask rachel-nocode/maxxtoken/maxxtoken
```

If Homebrew 7 asks for trust, run `brew trust --cask rachel-nocode/maxxtoken/maxxtoken`, then retry installation. The cask supports Apple Silicon and Intel. Use `brew upgrade --cask --greedy rachel-nocode/maxxtoken/maxxtoken` to update and `brew uninstall --cask rachel-nocode/maxxtoken/maxxtoken` to remove it.

### Windows

Download the x64 `MaxxToken-*-setup.exe` from the [latest release](https://github.com/rachel-nocode/maxxtoken/releases/latest). The current Windows beta is unsigned and may trigger SmartScreen. Screen-capture privacy masking and iCloud history sync are unavailable on Windows.

### Updates

Use `Settings → Check for updates` for a manual check. Version 0.2.13 adds stable/beta selection and an automatic-check toggle: stable remains the default, beta requires opt-in, and manual checks still work when automatic checks are off. Beta updates require a published beta release; stable remains the recommended channel.

## First run

1. Open Settings and enable only the providers you use. Core supported providers appear first; experimental providers are labeled.
2. Sign in through the provider's own app or CLI when automatic discovery is available. For key or browser-session providers, use the credential control shown by MaxxToken.
3. Refresh. A provider card reports live, stale, failed, or unavailable data; missing data is not rendered as zero.
4. Choose used or left bars, provider order, metric order/visibility, and up to two menu-bar pins per provider.
5. Install the version-matched CLI from `Settings → Diagnostics & CLI` if you want terminal or script access.

Credential values entered in MaxxToken are encrypted with the operating system's credential protection. Environment variables and provider-owned credential files remain under the behavior of the shell or provider tool that created them.

## Reading the dashboard

Each metric keeps its own meaning. A percentage can represent a rolling quota, weekly allowance, billing-period credit pool, request cap, or budget. Balances without a reliable denominator remain scalar values rather than invented percentages.

Reset time is the provider-reported time for that metric. A billing reset and purchased-credit expiry are separate events. Stale data shows its age and keeps the last good values through a transient refresh failure.

### Forecasts

Eligible quota windows show an estimated amount remaining at reset based on the pace observed inside the current window. The estimate starts from available samples and is invalidated when the window rolls over. MaxxToken withholds it for stale data, missing or invalid reset times, and synthetic/inferred windows such as an OpenCode Go local-database fallback.

Forecasts are directional estimates. Provider throttling, model mix, time away from the computer, team usage, and a short observation window can change the result. An estimate over 100% demand is shown as excess demand rather than a negative balance.

### Tokens and value

Measured means the provider or a supported local history supplied the quantity. Estimated cost applies a known model price to measured tokens. Hypothetical subscription value applies the configured plan price to quota use and is not money held by the provider. Partial totals identify unpriced models; missing prices remain unknown instead of becoming zero.

## Settings

- Providers: enable, disable, and order visible integrations. Newly discovered Claude and Codex accounts can appear separately.
- Metrics: order rows, choose always-visible/expanded/hidden placement, persist expanded cards, reset one provider or the complete layout, and undo changes from the current session.
- Menu bar/system tray: choose aggregate modes or pin up to two metrics per provider as text or bars.
- Alerts: configure session and weekly thresholds, approaching-reset notices, and per-provider controls. Notifications depend on OS notification permission.
- Appearance: light, dark, or system theme; used/left bars; compact/comfortable density; 12-hour or 24-hour time.
- Reports: build local period reports and privacy-redacted share cards. Estimates and partial pricing remain labeled.
- Network: optional HTTP, HTTPS, or SOCKS5 proxy. Loopback API calls bypass it. Proxy credentials use encrypted storage.
- Pricing fallback: optional fallback model for unknown Codex pricing. It is off by default.
- History: choose a 1–365 day local token-log scan/lookback. Normalized usage snapshots are retained for up to 120 days. Optional iCloud Drive sync is Mac-only, device/account bound, and excludes credentials and raw transcripts.
- Diagnostics & CLI: set log level, copy/reveal logs, install the matching CLI, or reset preferences while preserving credentials and usage history.

Optimize and Token Coach analyze visible usage, context/storage footprint, and local token history. Their recommendations depend on available data and should not be read as provider billing records.

## Data refresh and availability

The app performs light provider refreshes and less frequent heavier local-history scans. Provider-side caches and rate limits can delay changes. A manual refresh can bypass MaxxToken's provider cache, but it cannot force an upstream provider to publish newer data.

The app keeps a last-good snapshot for transient failures and shows freshness. Provider endpoints and local file formats are not stable public contracts; experimental integrations may require more frequent repair. See the [provider table](providers.md) and [troubleshooting guide](troubleshooting.md).
