# Release checklist

1. Bump `package.json` to a version newer than the latest published release and commit the release changes. Never reuse a version already seen by the updater.
2. Run `npm ci` and `npm test` from `desktop/`.
3. Run `npm run release:build`. The macOS command explicitly builds DMG and ZIP for `universal`; the Windows command explicitly builds NSIS for `x64`.
4. Sign the DMG itself with `codesign --force --sign 'Developer ID Application: Rachel Larralde (5U92RP4C5J)' --timestamp dist/MaxxToken-<version>-universal.dmg`, then notarize and staple with `bash ~/.claude/scripts/notarize.sh dist/MaxxToken-<version>-universal.dmg` using the `maxxtoken-notary` Keychain profile.
5. Regenerate the DMG blockmap after signing/stapling with `node_modules/app-builder-bin/mac/app-builder_arm64 blockmap --input dist/MaxxToken-<version>-universal.dmg --output dist/MaxxToken-<version>-universal.dmg.blockmap` on Apple Silicon, then run `npm run release:refresh-manifests` and `npm run release:validate`. Signing/stapling changes the DMG size and checksum. Do not use `--build-only` for a release. The gate requires the eight assets, current checksums and sizes, ZIP updater path, channel-correct manifests (`latest*` for stable or the prerelease label), universal app and native helper, macOS 12 deployment target, Developer ID signatures on app and DMG, stapled DMG, and x64 Windows payload.
6. Test the packaged app natively on Apple Silicon and on physical Intel Mac hardware. Test update installation from the previous published version on both architectures. Install and launch the Windows x64 EXE on Windows; checking its PE header does not establish runtime compatibility. Rosetta testing is useful additional coverage but does not replace Intel hardware. For beta releases, verify opt-in, complete channel assets, and a return to stable without downgrading.
7. Run the secret scans in the repository `AGENTS.md`; inspect `git diff --cached`; verify local state, build output, logs, and screenshots remain ignored.
8. Upload the DMG, macOS ZIP, Windows EXE, all three blockmaps, `latest-mac.yml`, and `latest.yml` to the matching `v<version>` GitHub release. Do not publish an incomplete asset set.
9. Check `gh release view v<version> --repo rachel-nocode/maxxtoken --json assets --jq '.assets[].name'`. Download the published manifests and confirm `latest-mac.yml` points to the universal ZIP and `latest.yml` points to the EXE.
10. Update the Polar download only after the GitHub assets and previous-version update path pass.

### macOS compatibility warnings during testing

Normal release validation scans every bundled Mach-O component for arm64 and x86_64 support, but executes only the host's native helper slice. Use native arm64 Node on Apple Silicon. An explicit `npm run release:validate -- --rosetta-smoke` also executes the Intel helper through Rosetta; macOS 27 can attribute its “App Update Required” warning to MaxxToken even when every component supports Apple Silicon. Keep that optional test on a dedicated test machine; it does not replace physical Intel verification. Do not force `arch -x86_64` for ordinary launches or QA on the user's Mac.
