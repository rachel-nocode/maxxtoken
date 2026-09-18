# MaxxToken Homebrew tap

Install the published MaxxToken app:

```sh
brew install --cask rachel-nocode/maxxtoken/maxxtoken
```

If Homebrew asks for trust, allow this cask specifically with `brew trust --cask rachel-nocode/maxxtoken/maxxtoken`, then retry.

The current cask installs version 0.2.13 for Apple Silicon and Intel on macOS 12 or later.

The cask downloads the same signed, notarized DMG as the [public release](https://github.com/rachel-nocode/maxxtoken/releases/tag/v0.2.13), checks its SHA-256 digest, and installs MaxxToken.app. Purchasing or activating MaxxToken remains separate from installation.

## Update and remove

MaxxToken's built-in updater remains available. To update through Homebrew:

```sh
brew update
brew upgrade --cask --greedy maxxtoken
```

Remove the Homebrew-installed app:

```sh
brew uninstall --cask maxxtoken
```

Uninstall leaves preferences, history, credentials, and any separately installed CLI intact. No destructive `zap` rule is included. If MaxxToken was installed manually, quit it and move that app out of Applications before installing the cask; keep its data if you want to retain settings.

## Product documentation

These guides describe the current release:

- [Product and setup](docs/product-guide.md)
- [Providers and limitations](docs/providers.md)
- [CLI and local API](docs/integrations.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Sanitized provider contributions](docs/provider-contributions.md)

## Maintenance

Use immutable versioned release URLs and a real SHA-256 checksum; never use `:latest` or `:no_check`. Every macOS release must include both DMG and ZIP, both blockmaps, and a valid `latest-mac.yml` pointing to the ZIP. Windows releases retain the x64 EXE, its blockmap, and `latest.yml`. Verify signatures/notarization, architecture support, update behavior, and isolated Homebrew install/upgrade/uninstall before changing this cask.

Keep this repository limited to casks and public documentation. MaxxToken application source and credentials are not published here.

Maintainer references: [Homebrew Cask Cookbook](https://docs.brew.sh/Cask-Cookbook) and [tap maintenance](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap).
