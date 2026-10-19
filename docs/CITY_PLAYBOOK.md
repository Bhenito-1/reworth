# City playbook — national expansion

> Phase 3.2 (`v2.1-expansion`) + Mobile/Store/Ops track. Supply-first launch; cities are **config**, not hard-coded.

## Related ADRs

- [`docs/ADRS/008-region-config.md`](ADRS/008-region-config.md) — region JSON schema
- [`docs/ADRS/007-cross-border-recommerce.md`](ADRS/007-cross-border-recommerce.md) — export interfaces only

## Required config keys (`config/regions/<city>.json`)

| Key | Purpose |
| --- | --- |
| `city` | Stable city id (e.g. `lagos`, `abuja`) |
| `displayName` | UI label |
| `timezone` | Default `Africa/Lagos` |
| `status` | `pilot` (public picker) · `supply` (config-ready) · `disabled` |
| `communities[]` | Focus areas for discovery / sell chips |
| `geocoding` | Lat/lng fixtures per community |
| `logistics.baseFeeKobo` / `perKmKobo` | Delivery quote inputs |
| `priceBands` | Valuation / comps bands |
| `psp` | `{ enabled, provider }` feature flags |

Validate: `pnpm validate:cities`

## Shipped cities

| City | File | Status | Notes |
| --- | --- | --- | --- |
| Lagos | `lagos.json` | **pilot** | SW launch city |
| Ogun | `ogun.json` | **pilot** | Southwest |
| Ibadan | `ibadan.json` | **pilot** | Oyo / Southwest |
| Osun | `osun.json` | **pilot** | Southwest |
| Ondo | `ondo.json` | **pilot** | Southwest |
| Ekiti | `ekiti.json` | **pilot** | Southwest |
| Edo | `edo.json` | **pilot** | South-South (Benin) |
| Abuja | `abuja.json` | **pilot** | FCT |
| Port Harcourt | `port-harcourt.json` | **pilot** | Rivers |
| Kano | `kano.json` | **pilot** | North-West |

**Consumer pilot:** `GET /regions` returns SW + Edo + Abuja + PH + Kano. Ops/full list: `GET /regions?all=1`. Override via `REGION_PILOT_CITIES`.

## Per-city ops runbook (PRD §57)

1. Confirm founding-seller density before marketing spend.
2. Seed communities + circular partners for the city (`Community.city` = region key).
3. Fraud watchlist seed + verification partner coverage note.
4. Support rota owner for the city (Slack/on-call).
5. Smoke: `pnpm validate:cities`, search, delivery quote, email auth, Paystack mock, `k6 run scripts/k6/smoke.js`.
6. Announce in CHANGELOG.

## Surfaces

- `GET /regions` drives city pickers (web Account/Sell/Corporate; mobile Home + Profile) — **pilot = SW + Edo + Abuja + PH + Kano**.
- Corporate relocation uses `cityFrom` / `cityTo` from the same list.
