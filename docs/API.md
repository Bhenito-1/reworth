# API reference (`/api/v1`) — `v0.9.0-rc`

> Regenerated for Phase 10 from the Nest route surface. For interactive OpenAPI, run the API and use route inventory below. Full Swagger UI can be enabled later via `@nestjs/swagger` without changing contracts.

**Base (local):** `http://localhost:3001/api/v1`  
**Auth:** `Authorization: Bearer <accessToken>` (user). Admin routes require admin JWT (+ optional TOTP session).

**Postman:** import `docs/postman/ReWorth-API.postman_collection.json` + Local/Staging env (`docs/postman/README.md`).

## Health

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/healthz` | no | Liveness |
| GET | `/readyz` | no | Readiness |
| GET | `/metrics` | no | Prometheus text stub |

### Example

```http
GET /api/v1/healthz
→ 200 {"status":"ok"}
```

## Auth

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | no | Email/password |
| POST | `/auth/login` | no | Email/password |
| POST | `/auth/refresh` | no | Rotation + reuse detection |
| POST | `/auth/logout` | no | |
| POST | `/auth/oauth/:provider/callback` | no | Google/Apple mock/live |

## Me / privacy

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET/PATCH | `/me` | user | Profile |
| GET | `/me/export` | user | DSAR JSON |
| GET/PUT | `/me/consents` | user | MARKETING/EMAIL |
| GET | `/me/devices` | user | |
| DELETE | `/me/devices/:id` | user | |
| POST | `/me/logout-all` | user | |
| POST | `/me/delete-request` | user | Pseudonymise |

## Listings / media / discovery

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/categories` | no | |
| POST/GET | `/listings` | mixed | Create auth; browse public |
| GET/PATCH/DELETE | `/listings/:id` | mixed | |
| POST | `/listings/:id/assist` | user | AI draft |
| POST | `/listings/:id/publish` | user | Risk + moderation |
| POST | `/listings/:id/images` | user | |
| POST | `/listings/:id/appeal` | user | After REJECTED |
| POST | `/listings/:id/report` | user | |
| POST | `/media/presign` | user | |
| POST | `/media/complete` | user | |
| GET | `/search` | no | |
| POST | `/search/nl` | no | |
| GET | `/home` | no | Rails |

## Chat / offers / social

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET/POST | `/conversations` | user | |
| GET/POST | `/conversations/:id/messages` | user | |
| POST | `/listings/:id/offers` | user | |
| POST | `/offers/:id/accept\|reject\|counter` | user | |
| POST | `/listings/:id/favourite` | user | |
| GET | `/me/favourites` | user | |

## Orders / payments / disputes / delivery

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST/GET | `/orders` | user | |
| POST | `/orders/:id/handed-over` | user | |
| POST | `/orders/:id/confirm-receipt` | user | |
| POST | `/payments/initiate` | user | |
| POST | `/webhooks/paystack` | HMAC | Raw body |
| POST | `/orders/:id/disputes` | user | |
| GET | `/meet-points` | no | |
| GET | `/orders/:id/delivery-quote` | user | |

## Reviews / trust / notifications

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/orders/:id/reviews` | user | |
| GET | `/users/:id/trust-score` | no | |
| GET | `/notifications` | user | |

## Admin (`/admin/*`)

Admin-only JWT. Key groups: `/admin/auth/*`, `/admin/dashboard/kpis`, users, listings, orders, disputes, verifications, reports, risk-events, appeals, support, catalog, promotions, analytics, audit. See `docs/RBAC.md`.

### Example — admin login

```http
POST /api/v1/admin/auth/login
Content-Type: application/json

{"email":"risk@demo.reworth.ng","password":"DemoRisk!2026"}
```
