# Performance — Phase 9 (`v0.9-risk-security`)

## Targets

| Surface | Budget |
| --- | --- |
| API p95 (k6, 500 VUs) | **&lt; 500ms** |
| Web Lighthouse performance | ≥ 80 |
| Web LCP (3G sim) | &lt; 3s on home / listing / search |

## k6 scripts

| Script | Purpose |
| --- | --- |
| [`infra/k6/mixed-load.js`](../infra/k6/mixed-load.js) | Mixed home/search/listings + health (arrival-rate, 500 VUs) |
| [`infra/k6/phase9-500vu-gate.js`](../infra/k6/phase9-500vu-gate.js) | Hot-path gate (health/categories/readyz × 500 VUs) |
| [`infra/k6/local-mid-gate.js`](../infra/k6/local-mid-gate.js) | Laptop mid-gate (50 VUs / 60s) before staging 500 VU |
| [`infra/k6/results-phase9-summary.json`](../infra/k6/results-phase9-summary.json) | Latest local summary export |

```bash
# Prefer cloud staging. Local: DISABLE_THROTTLE=1 on API.
k6 run -e API_BASE_URL=https://staging.example/api/v1 infra/k6/phase9-500vu-gate.js
k6 run -e API_BASE_URL=https://staging.example/api/v1 infra/k6/mixed-load.js
```

### Local staging-shaped runs (2026-09-13)

Hardware: single Nest process on Windows laptop, Postgres available, Redis offline (memory home cache), `DISABLE_THROTTLE=1`.

| Run | VUs | Outcome |
| --- | --- | --- |
| Gate (health/categories) | 500 | Healthy responses **med ~62ms**; overall p95 inflated by saturated 5xx/timeouts under unconstrained concurrency — **does not meet budget on this host** |
| Mixed arrival-rate | 500 | Same saturation pattern when DB routes included |

### Local health smoke (2026-09-20)

`k6 run -e API_BASE_URL=http://127.0.0.1:3001 infra/k6/health-smoke.js` against running Nest + Docker Postgres/Redis:

| Check | Result |
| --- | --- |
| http_req_failed | 0% |
| http_req_duration p95 | **~5ms** (1 VU, 15s) |
| Thresholds | Pass |

This does **not** replace the 500 VU staging gate — it confirms the smoke script + local API path before device/PO demos.

### Local mid-gate 50 VU (2026-09-30)

`k6 run -e API_BASE_URL=http://127.0.0.1:3011/api/v1 infra/k6/local-mid-gate.js` against Nest without `DISABLE_THROTTLE=1`:

| Check | Result |
| --- | --- |
| http_req_failed | **~98%** (throttle / 429 storm under 50 VUs) |
| http_req_duration p95 | ~981ms |
| Thresholds | Fail — expected without `DISABLE_THROTTLE` |

Re-run with `DISABLE_THROTTLE=1` on the API before treating mid-gate as a local pass. Staging 500 VU remains required.

### Top 3 offenders fixed (local)

| # | Hotspot | Fix |
| --- | --- | --- |
| 1 | Rate-limit 429 storm | `DISABLE_THROTTLE` for load tests; `SkipThrottle` on health; named throttles for auth/search/upload |
| 2 | Home 200-row rails + Redis crash | Cap 60 rows; Redis errors → memory cache (no process abort) |
| 3 | Browse page size | Default 20 / max 50 |

## Lighthouse CI

Config: `apps/web/lighthouserc.js` — performance ≥ 80, LCP &lt; 3000ms.

```bash
pnpm --filter @reworth/web lhci
```
