# MaxxToken

MaxxToken is a menu-bar and system-tray usage monitor for AI subscriptions and API accounts. It combines provider quota windows, resets, balances, local token history, and cost estimates so you can see what is available before it expires.

This repository is the public release channel. MaxxToken application source is private. Release assets and updater manifests live here; sanitized public guides are published in the [MaxxToken Homebrew tap](https://github.com/rachel-nocode/homebrew-maxxtoken/tree/main/docs).

## Download

The current public release is [v0.2.13](https://github.com/rachel-nocode/maxxtoken/releases/tag/v0.2.13):

- Apple Silicon and Intel Mac: universal signed/notarized DMG, plus the ZIP used by auto-update.
- Windows x64: NSIS installer. The current Windows beta is unsigned, so Windows may show a SmartScreen warning.

[Download the latest public release](https://github.com/rachel-nocode/maxxtoken/releases/latest). Existing installations update through `Settings → Check for updates`.

Mac users can also install the current stable build through the maintained Homebrew tap:

```bash
brew install --cask rachel-nocode/maxxtoken/maxxtoken
```

If Homebrew 7 asks for trust, run `brew trust --cask rachel-nocode/maxxtoken/maxxtoken`, then retry installation. The universal cask supports Apple Silicon and Intel and preserves the same signed/notarized app used by the DMG. Upgrade with `brew upgrade --cask --greedy rachel-nocode/maxxtoken/maxxtoken` and remove it with `brew uninstall --cask rachel-nocode/maxxtoken/maxxtoken`.

## Documentation

- [Product and setup guide](https://github.com/rachel-nocode/homebrew-maxxtoken/blob/main/docs/product-guide.md)
- [Provider support and limitations](https://github.com/rachel-nocode/homebrew-maxxtoken/blob/main/docs/providers.md)
- [CLI and local API](https://github.com/rachel-nocode/homebrew-maxxtoken/blob/main/docs/integrations.md)
- [Troubleshooting](https://github.com/rachel-nocode/homebrew-maxxtoken/blob/main/docs/troubleshooting.md)
- [Provider contribution protocol](https://github.com/rachel-nocode/homebrew-maxxtoken/blob/main/docs/provider-contributions.md)

## What MaxxToken reports

The following features are included in v0.2.13; availability of provider-specific data depends on the account and its connected client.

- Provider-supplied session, weekly, monthly, credit, and balance metrics where the provider exposes them.
- Per-window reset times, freshness, provider errors, status links, and manual refresh.
- Estimated remaining usage at reset for eligible quota windows, labeled as an estimate at the current pace.
- Measured local token history and model breakdowns where a supported local client records them.
- Estimated API-equivalent cost with explicit pricing coverage; unknown model prices remain unknown.
- Configurable provider/metric order, used or left display mode, menu-bar pins, alerts, reports, Optimize, and Token Coach.

Subscription price is not an account cash balance. Dollar values derived from a subscription price are labeled estimates; real balances and provider-reported spend retain their source.

## Privacy and credentials

Usage is processed locally. MaxxToken reads local client state and contacts enabled providers to retrieve usage; optional provider-status checks, pricing updates, auto-update, proxy routing, and iCloud history sync make the network requests described in the product guide. Raw prompts and transcripts are not sent to MaxxToken.

Credentials entered in the app are encrypted with Electron `safeStorage`, backed by the signed-in operating-system account. The loopback API removes account identity and secret-adjacent fields, binds to `127.0.0.1`, rejects non-loopback Host headers, and does not enable browser CORS.

## Support

Use the [troubleshooting guide](https://github.com/rachel-nocode/homebrew-maxxtoken/blob/main/docs/troubleshooting.md) first. When reporting a provider problem, include the provider name, MaxxToken version, operating system, the on-screen error, and redacted diagnostics. Never attach cookies, keys, authorization headers, credential files, or raw provider responses.

Built by [Rachel noCode](https://rachelnocode.com).
