# maxxToken — Project Instructions

## Always run a FRESH instance of the app

When asked to run/relaunch the app (or when launching it yourself to test a
change), ALWAYS guarantee a fresh instance loads the latest code. The app uses
Electron `requestSingleInstanceLock()` (`desktop/main.js`), so a stale instance
already holding the lock makes any new launch exit silently — and your code
changes never appear. This has bitten us multiple times.

Required sequence every time:

```bash
# 1. Kill ALL existing dev instances and wait for them to die
pkill -9 -f "Developer/maxxToken/desktop/node_modules/electron" 2>/dev/null; sleep 2
# 2. Confirm zero remain (must print 0)
ps aux | grep "Developer/maxxToken/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron " | grep -v grep | wc -l
# 3. Launch fresh
cd desktop && nohup ./node_modules/.bin/electron . >/tmp/maxx-electron.log 2>&1 & disown
# 4. Verify exactly 1 instance is running
sleep 5; ps aux | grep "Developer/maxxToken/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron " | grep -v grep | wc -l
```

Never assume a relaunch worked just because the launch command returned — the
single-instance lock means it can no-op. Always verify the running instance is
new (step 4 must show 1, after step 2 showed 0).

Note: the packaged app also exists at `/Applications/MaxxToken.app`. The dev
instance and the installed app each add a menubar icon. Don't confuse them.

## Releases can silently break auto-update — follow the checklist EVERY time

A release is not "done" when the DMG builds. The auto-updater can break in ways
that only surface on a *user's already-installed copy*, never on your dev
machine. This already bit us: **0.2.4 shipped DMG-only because the build used
`electron-builder --mac dmg`, which overrides the `["dmg","zip"]` target and
drops the mac `.zip`. macOS auto-update (electron-updater) downloads the ZIP,
not the DMG, so every existing user got `ERROR: ZIP file not provided` on
"Check for updates."** The app worked fine; the *update path* was dead.

Treat every release as able to break the update for all existing users. Before
publishing, verify ALL of these — do not skip any:

1. **Version bumped** in `desktop/package.json` (and committed). A release that
   reuses a version the updater already saw is a no-op.
2. **Mac builds BOTH targets.** Use `electron-builder --mac dmg zip --publish never`
   (or bare `electron-builder --mac`). NEVER `--mac dmg` alone — it silently
   drops the zip the updater needs.
3. **DMG signed + notarized + stapled.** Sign = Developer ID Application: Rachel
   Larralde (5U92RP4C5J). Notarize via `bash ~/.claude/scripts/notarize.sh
   <path-to.dmg>` (keychain profile `maxxtoken-notary`). The notarization ticket
   binds to the `.app`, so it covers the same app inside the zip.
4. **Windows EXE builds + runs on x64.** `electron-builder --win nsis --x64
   --publish never` — pass `--x64` explicitly (bare `--win` packages arm64,
   which won't run on x64 Windows test machines; payload must be PE32+ x86-64).
5. **Auto-update manifests are correct — the step that actually prevents the
   regression.** After building, open `dist/latest-mac.yml` and confirm the
   `*-mac.zip` appears BOTH under `files:` and as the top-level `path:`. Confirm
   `dist/latest.yml` (Windows) points at the `.exe`. If `latest-mac.yml` `path:`
   is a `.dmg`, the build is broken — rebuild with the zip target.
6. **Upload the COMPLETE asset set** to the GitHub release (tag `vX.Y.Z`):
   dmg, **mac zip**, exe, all three `.blockmap` files, `latest-mac.yml`,
   `latest.yml`. A missing mac zip or stale yml breaks Mac auto-update even
   though the release looks populated.
7. **Verify the published release end-to-end.** Run
   `gh release view vX.Y.Z --repo rachel-nocode/maxxtoken --json assets --jq '.assets[].name'`
   and confirm the mac `.zip` is listed; download `latest-mac.yml` and confirm
   its `path:` is the zip. Ideally test "Check for updates" from a copy of the
   previous version before announcing.

The repo is release-only ([[maxxtoken-repo-release-only]]); installers are also
distributed on Polar (Rachel updates those manually). Full mechanics live in the
`build-notarize-workflow` memory — keep both in sync.
