# ADR-011 — Maps & locate-me (GPS → community snap)

## Status
Accepted — 2026-10-08 · Phase A + B + C (meetup pin) shipped · live track deferred

## Context
Buyers and sellers expect Uber/InDrive-style “where am I?” on a map. ReWorth today uses **community centroids** in `config/regions/*.json` + `MockGeocodingProvider` for search/delivery. PRD §20 forbids exposing precise home addresses in browse.

## Decision

1. **Phase A** — Device GPS via Expo `expo-location` → `GET /api/v1/regions/locate?lat=&lng=` → snap to **nearest community centroid** across pilot cities. Persist preferred city (+ suggested community label). No public street address.
2. **Phase B (map UI)** — After locate, mobile opens `LocateMapSheet` (`react-native-maps`): you + community centroid. iOS Apple Maps; Android Google Maps (API key in `app.json` for store builds).
3. **Phase C (meetup pin)** — `POST /conversations/:id/meetup-pin` stores a **SYSTEM** message with JSON `{ v:1, kind:"MEETUP_PIN", lat, lng, label }`. Visible only to conversation participants. Mobile: Chat → **Meetup pin** → map drop / GPS → share; tap card to open map. Catalog `MeetPoint` on orders remains for curated landmarks.
4. **Provider** — `GeocodingProvider.reverse?(lat, lng)` on mock/region haversine. Optional later Google/Mapbox street reverse, still snap browse to community codes.
5. **Deferred** — Live location share during handover/delivery (WebSocket + consent + TTL). Not required for marketplace MVP.

## Privacy
- Browse: community only.
- Locate map “you” pin: session UI only.
- Meetup pin: chat participants only; never public PDP.

## Consequences
- Nest `GET /regions/locate` before `GET /regions/:city`.
- Meetup pin uses SYSTEM body protocol (no Prisma enum migration). Clients must `parseMeetupPin`.
- Android production maps need Google Maps API key.

## References
- PRD §§19–20 · `docs/NIGERIA_MARKET_LAUNCH.md` · ADR-008
