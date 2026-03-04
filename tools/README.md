# Sparkle Tools

This directory contains the Sparkle framework tools needed for signing updates.

## Contents

- `bin/` — Sparkle command-line tools
  - `generate_keys` — Generate EdDSA key pair for signing
  - `sign_update` — Sign DMG files for auto-update
- `CHANGELOG` — Sparkle version history
- `INSTALL` — Installation instructions
- `LICENSE` — Sparkle license (MIT)
- `SampleAppcast.xml` — Example appcast configuration

## Usage

### Generate Keys (First Time Only)

```bash
cd tools
./bin/generate_keys
```

This will:
1. Generate an EdDSA key pair
2. Store the private key in macOS Keychain
3. Output the public key for `Info.plist`

### Sign Update

```bash
cd tools
./bin/sign_update ../dist/MiniDock-0.9.2-beta.dmg
```

Output format:
```
sparkle:edSignature="..." length="..."
```

Copy these values to `public/appcast.xml`.

## Version

Sparkle 2.6.4 (June 2024)

## Links

- **Official Site**: https://sparkle-project.org/
- **GitHub**: https://github.com/sparkle-project/Sparkle
- **Documentation**: https://sparkle-project.org/documentation/

## Notes

- The full Sparkle.framework is NOT included in version control (binary files)
- Only the command-line tools are versioned
- Private keys are stored in macOS Keychain, never in git
- Public key is in `macos/Info.plist` (`SUPublicEDKey`)
