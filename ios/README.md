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

## Local (macOS + Xcode) — real device

```bash
open ios/WaRelay.xcodeproj
# or regenerate: cd ios && xcodegen generate
```

1. Xcode: Team/signing + **Push Notifications** capability (entitlements already have `aps-environment`).
2. Apple Developer → Keys → create **APNs Auth Key** (`.p8`). Note Key ID + Team ID.
3. Backend `.env` (Firebase **not** required for iOS):
   ```
   APNS_KEY_ID=...
   APNS_TEAM_ID=...
   APNS_BUNDLE_ID=com.warelay.app
   APNS_KEY_P8="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
   APNS_PRODUCTION=false
   ```
   Use `APNS_PRODUCTION=true` only for App Store / TestFlight / Ad Hoc production pushes. Debug builds need **sandbox** (`false`).
4. Settings → backend host: `http://PC_LAN_IP:4500` (Docker) or `:3000` (local Node) — never `127.0.0.1` on device.
5. Login on a **physical iPhone** → grant notifications → APNs hex token registers via `/devices/register`.

Optional Firebase: add `GoogleService-Info.plist` if you also want FCM; direct APNs works without it.

Realtime: Socket.IO `message:matched` while connected; REST poller if the socket drops; APNs for background alerts.

## Manual test checklist

- [ ] Login / logout / session restore
- [ ] Folder chips + unread badges
- [ ] Filters, search, pagination
- [ ] Expand marks read; star / thumbs up / done; Open WhatsApp (`?text=`)
- [ ] Live `message:matched` via Socket.IO
- [ ] Remote FCM push on new match (app backgrounded)
- [ ] Local notification test in Settings
