# Agent Instructions

## Public Repo Secret Safety

This repo is public. Treat any token, API key, cookie, session ID, OAuth credential, private key, `.env` value, copied request header, local app-state JSON, or provider credential JSON as sensitive.

Before every commit or push:

1. Inspect staged changes with `git diff --cached` and do not commit raw secrets.
2. Run a secret-pattern pass across the working tree, especially JSON, env-like, config, log, and adapter files.
3. Check for provider token shapes: `sk-*`, `sk-ant-*`, `gh[pousr]_`, `AIza*`, `AKIA*`, JWTs, Bearer tokens, cookies, refresh/access/session tokens, private key blocks, and long high-entropy literals.
4. Verify ignored local state stays ignored: `.claude/`, `.codex/`, `.playwright-mcp/`, `node_modules/`, `dist/`, `desktop/dist/`, debug logs, screenshots, and one-off private strategy files.
5. Never echo raw suspected secrets in chat, logs, commit messages, or reports. Redact them.
6. If a real secret is found in committed history or a pushed commit, stop and say so plainly. Recommend rotating the credential and cleaning history instead of only deleting it from the latest file.

Useful scan commands before committing:

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!desktop/node_modules/**' --glob '!dist/**' --glob '!desktop/dist/**' --glob '!.git/**' --glob '!AGENTS.md' -i '(sk-[A-Za-z0-9_-]{24,}|sk-ant-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{30,}|AIza[0-9A-Za-z_-]{35}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|BEGIN .*PRIVATE KEY|xox[baprs]-[A-Za-z0-9-]{20,}|sk_live_[A-Za-z0-9]{20,}|rk_live_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|Bearer [A-Za-z0-9._~+/-]{24,})'
rg -n --hidden --glob '!node_modules/**' --glob '!desktop/node_modules/**' --glob '!dist/**' --glob '!desktop/dist/**' --glob '!.git/**' --glob '!AGENTS.md' --glob '*.{json,env,toml,yml,yaml,js,ts}' -i '(api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|session[_-]?token|id[_-]?token|password|passwd|credential)\s*[:=]\s*["'\''][^"'\'']{20,}["'\'']'
```

Known fake test fixtures may still trigger these scans. Verify they are obvious fixtures like `abc`, `fake`, or `*-token` test strings before proceeding.

Prefer storing user credentials only through the app's Keychain-backed `safeStorage` path. Do not add plaintext credential fallbacks, JSON env dumps, or debug output that serializes all saved keys.

## Releases can silently break auto-update — follow the checklist EVERY time

A release is not "done" when the DMG builds. The auto-updater can break in ways that only surface on a *user's already-installed copy*, never on the build machine. This already happened: **0.2.4 shipped DMG-only because the build used `electron-builder --mac dmg`, which overrides the `["dmg","zip"]` target in `desktop/package.json` and drops the mac `.zip`. macOS auto-update (electron-updater) downloads the ZIP, not the DMG, so every existing user got `ERROR: ZIP file not provided` on "Check for updates."** The app itself was fine; the update path was dead.

Treat every release as able to break the update for all existing users. Verify ALL of these before publishing — do not skip any:

1. **Version bumped** in `desktop/package.json` and committed. Reusing a version the updater already saw is a no-op.
2. **Mac builds BOTH targets:** `electron-builder --mac dmg zip --publish never` (or bare `electron-builder --mac`). NEVER `--mac dmg` alone — it silently drops the zip the updater needs.
3. **DMG signed + notarized + stapled.** Sign = Developer ID Application: Rachel Larralde (5U92RP4C5J). Notarize via `bash ~/.claude/scripts/notarize.sh <path-to.dmg>` (keychain profile `maxxtoken-notary`). The notarization ticket binds to the `.app`, so it covers the same app inside the zip.
4. **Windows EXE builds + runs on x64:** `electron-builder --win nsis --x64 --publish never`. Pass `--x64` explicitly — bare `--win` packages arm64, which won't run on x64 Windows machines (payload must be PE32+ x86-64).
5. **Auto-update manifests are correct — the step that actually prevents the regression.** After building, open `dist/latest-mac.yml` and confirm the `*-mac.zip` appears BOTH under `files:` and as the top-level `path:`. Confirm `dist/latest.yml` (Windows) points at the `.exe`. If `latest-mac.yml` `path:` is a `.dmg`, the build is broken — rebuild with the zip target.
6. **Upload the COMPLETE asset set** to the GitHub release (tag `vX.Y.Z`, repo `rachel-nocode/maxxtoken`): dmg, **mac zip**, exe, all three `.blockmap` files, `latest-mac.yml`, `latest.yml`. A missing mac zip or stale yml breaks Mac auto-update even though the release looks populated.
7. **Verify the published release end-to-end:** `gh release view vX.Y.Z --repo rachel-nocode/maxxtoken --json assets --jq '.assets[].name'` — confirm the mac `.zip` is listed; download `latest-mac.yml` and confirm its `path:` is the zip. Ideally test "Check for updates" from a copy of the previous version before announcing.

This repo is release-only (source stays private; the public repo hosts releases). Installers are also distributed on Polar (updated manually).
