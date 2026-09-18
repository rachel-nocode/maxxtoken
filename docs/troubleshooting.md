# Troubleshooting

These notes describe MaxxToken v0.2.13; use `maxxtoken --help` for available CLI options.

## A provider is unavailable

- Confirm it is enabled in Settings and read its auth/limitation row in [providers.md](providers.md).
- Sign in again through the provider app or CLI, or replace the saved key/session through MaxxToken. Then use the provider card's Refresh action.
- If the card is stale, keep the last-good value but check its timestamp. Upstream dashboards, rate limits, and cached exports can lag.
- A missing percentage is not zero. Some providers expose only a balance, local activity, or spend without a denominator.
- Experimental providers depend on less-stable endpoints or local formats and can break when the provider changes them.

## The numbers differ from a provider dashboard

- Compare the exact metric and reset window. Session, weekly, model, billing, organization, and purchased-credit pools are separate.
- Check the source/freshness label. Local activity and local token history do not equal account-wide billing.
- Team or organization use may change a shared pool outside this device.
- Cost can be measured, estimated from known prices, hypothetical from the configured subscription price, or partial when models are unpriced.
- Forecasted remainder is an estimate at the observed pace, not a provider guarantee.

## Forecast is missing

Forecasts require a usable percentage, a future reset, fresh data, and an eligible real window. They are intentionally absent for balances without expiry, stale/failed data, missing reset times, rollover samples, and inferred OpenCode Go local-database windows.

## CLI cannot connect

- Reinstall the matching CLI from `Settings → Diagnostics & CLI` after every app update.
- Start MaxxToken and test `maxxtoken --once`; then test `maxxtoken limits`.
- Check `maxxtoken --help` and the exit code. Code 2 means no source was discovered; code 3 means the provider ID is unavailable; code 4 means a forced refresh failed.
- If port 7878 is occupied, set `localApiPort` in the revealed advanced config file and restart MaxxToken; point the CLI at it with `--port` when needed.
- A corporate proxy does not apply to loopback. Configure remote proxy access in Settings.

## Notifications, menu-bar pins, or capture masking do not work

- Grant OS notification permission and confirm the relevant session/weekly/provider alert is enabled.
- Pins disappear when their metric is unavailable. Reopen Settings after the provider has refreshed.
- macOS capture masking is opt-in and requires the bundled detector to report full support. It does not request Screen Recording permission; when detection is limited or unavailable, usage remains hidden while the option is enabled. Windows reports it as unsupported.

## Update or install fails

- Version 0.2.13 Mac assets are universal and support Apple Silicon and Intel on macOS 12 or later.
- macOS auto-update uses the ZIP asset; a DMG alone is not sufficient. Download the latest complete release if an older updater reports a missing ZIP.
- Windows v0.2.13 requires x64. The unsigned beta installer may require the SmartScreen “More info” flow.
- If an update is offered but cannot apply, quit MaxxToken, download the matching installer from the [release page](https://github.com/rachel-nocode/maxxtoken/releases/latest), and install over the existing copy.

## Report a problem safely

Include MaxxToken version, OS/architecture, provider, source/freshness label, exact redacted error, and the steps that reproduce it. Diagnostics should be reviewed before sharing.

Never send API keys, cookies, session IDs, authorization headers, OAuth files, private keys, `.env` files, raw browser databases, or unredacted provider responses. Rotate the credential immediately if one was posted publicly.
