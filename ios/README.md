# WA Relay iOS

Native SwiftUI client (iOS 16+) for the wa-relay backend.

## Cloud build (no Mac)

### GitHub Actions

1. Push the repo to GitHub
2. Open **Actions → iOS Build** (runs on push to `ios/**`, or **Run workflow**)
3. Download artifact **`WaRelay-ios-simulator`** (`.app` zip — for Simulator / CI only)

#### Signed IPA (real iPhone)

Requires Apple Developer Program. Add repo **Secrets**:

| Secret | Value |
|--------|--------|
| `IOS_CERTIFICATE_BASE64` | base64 of distribution `.p12` |
| `IOS_CERTIFICATE_PASSWORD` | `.p12` password |
| `IOS_PROVISION_PROFILE_BASE64` | base64 of `.mobileprovision` (Ad Hoc) |
| `IOS_TEAM_ID` | 10-char Team ID |
| `KEYCHAIN_PASSWORD` | any random password for the CI keychain |

Then: **Actions → iOS Build → Run workflow →** enable **Also build signed IPA**.

On Windows, install the IPA with [Sideloadly](https://sideloadly.io) (cable + Apple ID).

### Codemagic

See root [`codemagic.yaml`](../codemagic.yaml). Connect the GitHub repo at [codemagic.io](https://codemagic.io), run **WaRelay iOS (Simulator)** or **WaRelay iOS (IPA)** after Apple signing is linked.

## Local (macOS + Xcode)

```bash
open ios/WaRelay.xcodeproj
# or regenerate: cd ios && xcodegen generate
```

1. Settings → backend host (`http://127.0.0.1:3000` Simulator, or PC LAN IP)
2. Login with a backend user
3. Inbox refreshes via 3s polling (no Socket.IO/Firebase SPM — keeps cloud CI stable). Remote FCM push is deferred (`local-…` tokens skipped by backend).

## Manual test checklist

- [ ] Login / logout / session restore
- [ ] Folder chips + unread badges
- [ ] Filters, search, pagination
- [ ] Expand marks read; star / done; Open WhatsApp
- [ ] Live `message:matched` via Socket.io
- [ ] Local notification test in Settings
