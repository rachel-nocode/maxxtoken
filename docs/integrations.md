# CLI and local API

This guide describes the CLI and local API included in MaxxToken v0.2.13.

## Install the CLI

Install the version-matched command from `Settings → Diagnostics & CLI`. The installed command is a wrapper around the packaged app, which keeps encrypted provider credentials available even when the window is closed.

```bash
maxxtoken
maxxtoken --once
maxxtoken --json
maxxtoken --provider claude --provider codex
maxxtoken limits
maxxtoken limits --provider claude --force-refresh
maxxtoken --ascii --no-color
maxxtoken --help
```

Interactive keys are `q` to quit, `r` to refresh, `u` to switch used/left, and `j`/`k` to scroll. Output automatically becomes a single frame when piped.

The CLI tries the running app's loopback API, then a live packaged collection, then the last cached snapshot. Explicit source failures exit nonzero instead of silently switching sources. `--provider` is repeatable. `--force-refresh` bypasses MaxxToken provider caches, subject to upstream caching and rate limits.

Exit codes:

- `0`: success.
- `1`: invalid options or an explicitly selected source failed.
- `2`: automatic discovery found no usable source.
- `3`: unknown or unavailable provider.
- `4`: forced refresh failed.

## Local HTTP API

The read-only API listens on `127.0.0.1:7878` by default. Advanced users can change `localApiPort` in the revealed MaxxToken config file and restart the app; `maxxtoken --port <n>` selects a CLI lookup port without changing the app listener.

- `GET /v1/health`: API health and snapshot availability.
- `GET /v1/usage`: sanitized current snapshot.
- `GET /v1/usage/:provider`: one provider/account when unambiguous.
- `GET /v1/limits`: stable limits contract, schema version `1.0`.
- `GET /v1/limits/:provider`: limits contract filtered to one provider family.
- `GET /v1/limits?provider=claude&provider=codex`: repeated provider filters.

The API accepts GET and HEAD only. It binds to loopback, rejects non-loopback peers and Host headers, emits no CORS permission, and exposes a field allowlist. Account email, cookies, saved keys, provider links, and secret-adjacent extra fields are omitted. It has no mutation or credential endpoints.

`/v1/usage` reflects the current app snapshot and can change as the UI model evolves. `/v1/limits` is the versioned scripting contract: stable resource IDs, raw values/units, safe account IDs, freshness, reset metadata, and structured errors. Scripts should tolerate unavailable fields and unknown future resource kinds.

## Proxy behavior

The app and packaged CLI support HTTP, HTTPS, and SOCKS5 proxies configured under Settings. Remote provider requests use the proxy; loopback requests never do. Proxy URLs containing embedded credentials are rejected; enter the optional username and password in the separate fields so they use encrypted storage. Pricing supplement URLs must be credential-free HTTPS URLs.

## Exported data

JSON/CSV exports and reports can contain usage, safe account identifiers, provider names, model names, dates, and estimated cost. Privacy mode can redact account display details, but exports should still be reviewed before sharing. Raw credential material is not part of the export schema.
