# Mobile · Store · Ops track

> Explicit product continuation after Phase 3.2 (`v2.1-expansion`). Not a numbered PRD phase — tracks **1 mobile parity**, **2 store readiness**, **3 ops/launch**.

## Goals

1. **Mobile parity** — Expo app is primary; close rows in `docs/MOBILE_PARITY.md` (mobile-first doctrine).
2. **Store readiness** — `PUSH_PROVIDER=expo` adapter, device token register, `eas.json` + store metadata stubs; replace placeholder EAS `projectId` before submit.
3. **Ops / launch** — Ibadan in `config/regions/`; NDPR checklist; staging k6 smoke script.

## Status

| Track | Status |
| --- | --- |
| Mobile tools on home | Shipped (this tranche) |
| Expo push provider + register | Shipped (mock default; expo when env set) |
| EAS / app.json | Stubbed — set real `extra.eas.projectId`; App Links / Universal Links wired (`associatedDomains` + `intentFilters` + `public/.well-known/*`) |
| Ibadan config | Shipped |
| NDPR + k6 | Docs/scripts stubbed |

## Run mobile

```bash
# API + infra up first
pnpm --filter @reworth/mobile dev
```

Set `EXPO_PUBLIC_API_URL` to your LAN API if using a device.

## Store push

```bash
# .env
PUSH_PROVIDER=expo
EXPO_ACCESS_TOKEN=   # optional
```

## Ops

```bash
pnpm validate:cities
# k6 (optional): k6 run scripts/k6/smoke.js -e BASE_URL=https://staging.api…
```
