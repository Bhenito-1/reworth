# Universal / App Links (store readiness)

Host these at the production web origin (`https://reworth.ng`):

| Path | File |
| --- | --- |
| `/.well-known/apple-app-site-association` | `apple-app-site-association` (no extension; `Content-Type: application/json`) |
| `/.well-known/assetlinks.json` | Android Digital Asset Links |

## Before go-live

1. Replace `TEAMID` in AASA with the Apple Developer Team ID.
2. Replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` with the Play Console / upload key SHA-256.
3. Confirm Expo `app.json` associatedDomains + intentFilters match the live hosts.
4. Maestro `appId` must be `com.reworth.app` (same as `bundleIdentifier` / `package`).
