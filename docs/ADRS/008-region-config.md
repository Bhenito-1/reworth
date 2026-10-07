# ADR-008: Region config (config-driven cities)

- **Status:** Accepted
- **Date:** 2026-09-13
- **Deciders:** Solution Architect, Backend Lead, Ops (Phase 3.2)

## Context

National expansion was previously assumed to arrive via a mythical `v1.0.1-multicity` tag that never landed in-repo. Hard-coded Lagos community centroids in `MockGeocodingProvider` and fixed delivery fee math blocked Abuja / Port Harcourt without code changes. Phase 3.2 introduces greenfield **region JSON config**.

## Decision

1. **Source of truth** — `config/regions/<city>.json` (override directory via `REGION_CONFIG_DIR`).
2. **Launch set** — Lagos, Abuja, Port Harcourt, **Ibadan** (config-only; supply-first before marketing).
3. **Required keys** — `city`, `displayName`, `timezone` (`Africa/Lagos`), `communities[]`, `geocoding` (lat/lng per community), `logistics.baseFeeKobo` / `perKmKobo`, `priceBands`, `psp.enabled`.
4. **Runtime** — `RegionConfigService` loads all JSON at boot; `getCity`, `listCities`, `getCommunityGeo`, `getDeliveryRates`. Geocoding + delivery quote resolve via this service with Lagos fallback.
5. **Automation** — `scripts/validate-city-config.mjs` + `docs/CITY_PLAYBOOK.md` for supply-first launch ops.
6. **No code change for core listing/search** when adding a city that only needs geo + logistics + PSP flags — drop a JSON file and validate.

## Consequences

- New cities are ops/config work, not Nest feature PRs (unless tax/regulatory flags need schema).
- Community rows should set `Community.city` to the region key for analytics isolation.
- Cross-border export remains out of scope (ADR-007).

## References

- PRD §54–56 · Prompt 3.2 · `docs/CITY_PLAYBOOK.md`
