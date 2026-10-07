# City playbook — national expansion

> Phase 3.2 (`v2.1-expansion`) + Mobile/Store/Ops track. Supply-first launch; cities are **config**, not hard-coded.

## Related ADRs

- [`docs/ADRS/008-region-config.md`](ADRS/008-region-config.md) — region JSON schema
- [`docs/ADRS/007-cross-border-recommerce.md`](ADRS/007-cross-border-recommerce.md) — export interfaces only

## Required config keys (`config/regions/<city>.json`)

| Key | Purpose |
| --- | --- |
| `city` | Stable city id (e.g. `lagos`, `ibadan`) |
| `displayName` | UI label |
| `timezone` | Default `Africa/Lagos` |
| `communities[]` | Focus areas for discovery / sell chips |
| `geocoding` | Lat/lng fixtures per community |
| `logistics.baseFeeKobo` / `perKmKobo` | Delivery quote inputs |
| `priceBands` | Valuation / comps bands |
| `psp` | `{ enabled, provider }` feature flags |

Validate: `pnpm validate:cities`

## Shipped cities

| City | File | Notes |
| --- | --- | --- |
| Lagos | `lagos.json` | Launch city |
| Abuja | `abuja.json` | Phase 3.2 |
| Port Harcourt | `port-harcourt.json` | Phase 3.2 |
| Ibadan | `ibadan.json` | Ops track — supply-first before marketing |

## Per-city ops runbook (PRD §57)

1. Confirm founding-seller density before marketing spend.
2. Seed communities + circular partners for the city (`Community.city` = region key).
3. Fraud watchlist seed + verification partner coverage note.
4. Support rota owner for the city (Slack/on-call).
5. Smoke: `pnpm validate:cities`, search, delivery quote, email auth, Paystack mock, `k6 run scripts/k6/smoke.js`.
6. Announce in CHANGELOG.

## Surfaces

- `GET /regions` drives city pickers (web Account/Sell/Corporate; mobile home label).
- Corporate relocation uses `cityFrom` / `cityTo` from the same list.
