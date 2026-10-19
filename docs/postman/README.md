# Postman — ReWorth API

Import these into Postman (or Insomnia) to exercise staging / local `/api/v1`.

## Files

| File | Purpose |
| --- | --- |
| `ReWorth-API.postman_collection.json` | Golden-path requests (health → browse → OTP → authed → admin) |
| `ReWorth-Local.postman_environment.json` | `baseUrl` = `http://localhost:3001/api/v1` |
| `ReWorth-Staging.postman_environment.json` | Placeholder staging host — edit `baseUrl` |

## How to use

1. **Import** the collection + one environment.
2. Select **ReWorth Local** (or Staging after you set the host).
3. Run folder **1 → 2 → 3 → 4** in order (or Collection Runner).
4. After `auth/otp/request`, `debugCode` is auto-saved (mock SMS). Then run `otp/verify` — `accessToken` is saved for Bearer calls.
5. Admin: run `admin/auth/login` (seeded `risk@demo.reworth.ng` / `DemoRisk!2026`).

## Demo phones / passwords

| Persona | Phone / email | Password |
| --- | --- | --- |
| Ori (seller) | `+2348010000001` / `ori@demo.reworth.ng` | `DemoOri!2026` |
| Ayo (buyer) | `+2348010000002` / `ayo@demo.reworth.ng` | `DemoAyo!2026` |
| Risk admin | `risk@demo.reworth.ng` | `DemoRisk!2026` |

See also `docs/API.md`, `docs/DEMO.md`, and `scripts/api-selftest.mjs` for the automated twin of this collection.
