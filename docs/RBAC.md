# ReWorth Admin RBAC — permission matrix

Roles (Prisma `AdminRole`):

| Role | Code |
| --- | --- |
| Super Admin | `SUPER_ADMIN` |
| Operations | `OPERATIONS` |
| Customer Support | `CUSTOMER_SUPPORT` |
| Risk / Fraud | `RISK_FRAUD` |
| Finance | `FINANCE` |
| Marketing | `MARKETING` |
| Content Moderator | `CONTENT_MODERATOR` |

`SUPER_ADMIN` bypasses all role checks. **AdminOnlyGuard** rejects JWTs with zero roles on every `/admin/*` route (except `POST /admin/auth/login` and challenge-based `POST /admin/auth/totp/verify`).

**Estate Manager** is not an `AdminRole` enum value — it is a scoped `CommunityManager` assignment (user ↔ community). See Phase 2.2 matrix below.

## Page / action matrix (Phase 8)

| Area | CONTENT_MODERATOR | RISK_FRAUD | FINANCE | CUSTOMER_SUPPORT | MARKETING | OPERATIONS | SUPER_ADMIN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard KPIs | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Users list / export | — | ✓ | — | ✓ | — | ✓ | ✓ |
| Users suspend / unsuspend | — | ✓ | — | ✓ | — | ✓ | ✓ |
| Users whitelist | — | ✓ | — | — | — | ✓ | ✓ |
| Listings moderate (approve/reject/remove) | ✓ | ✓ (remove) | — | — | — | ✓ | ✓ |
| Listings feature / promotions | — | — | — | — | ✓ | ✓ | ✓ |
| Orders read | — | — | ✓ | ✓ | — | ✓ | ✓ |
| Orders refund | — | — | ✓ | — | — | — | ✓ |
| Finance summary | — | — | ✓ | — | — | — | ✓ |
| Disputes list / resolve | — | — | ✓ | ✓ | — | ✓ | ✓ |
| Verifications | — | ✓ | — | ✓ | — | ✓ | ✓ |
| Reports | ✓ | ✓ | — | — | — | ✓ | ✓ |
| Fraud / risk-events | — | ✓ | — | — | — | ✓ | ✓ |
| Support tickets | — | — | — | ✓ | — | ✓ | ✓ |
| Catalog (categories, meet points, scan rules, banners, communities) | ✓ (keywords/catalog) | — | — | — | ✓ | ✓ | ✓ |
| Analytics | — | — | ✓ | — | ✓ | ✓ | ✓ |
| Audit log | — | ✓ | — | — | — | ✓ | ✓ |

## Estate communities (Phase 2.2 / `v1.1`)

| Area | Estate Manager (`CommunityManager`) | OPERATIONS | SUPER_ADMIN |
| --- | --- | --- | --- |
| List / edit own scoped community | ✓ (assigned community only) | ✓ all | ✓ all |
| Membership approve / reject / suspend | ✓ scoped community | ✓ all | ✓ all |
| Community KPIs (members, pending, live listings) | ✓ scoped community | ✓ all | ✓ all |
| Assign / remove managers | — | ✓ | ✓ |
| Full `/admin/communities` admin UI | scoped via assignment | ✓ | ✓ |

Catalog “communities” tab remains for quick create; membership queue lives on Admin **Communities**.

### Explicit denials

- **CONTENT_MODERATOR** must receive **403** on `/admin/orders/:id/refund` and `/admin/finance/*` (not transactions/finance).
- **CUSTOMER_SUPPORT** must receive **403** on Finance routes; denials are audit-logged (`RBAC_DENIED`).
- Consumer tokens (no `UserRole`) → **403** `ADMIN_ONLY_DENIED`.

## Auth

| Endpoint | Notes |
| --- | --- |
| `POST /admin/auth/login` | Requires ≥1 AdminRole; may return `totpRequired` + `challengeToken` |
| `POST /admin/auth/totp/setup` | JWT + AdminOnly → otpauth URL |
| `POST /admin/auth/totp/verify` | Challenge completes login, or Bearer enables TOTP |

## Phase 1 endpoints (still valid)

| Endpoint | Allowed roles |
| --- | --- |
| `POST /admin/users` | SUPER_ADMIN, OPERATIONS |
| `GET /admin/users/:id` | SUPER_ADMIN, OPERATIONS, CUSTOMER_SUPPORT, RISK_FRAUD |
| `POST /admin/users/:id/roles` | SUPER_ADMIN, OPERATIONS |
| `GET /admin/finance/summary` | FINANCE, SUPER_ADMIN, OPERATIONS (real handler: monetization module) |

## Verification levels (users)

| Level | Meaning |
| --- | --- |
| L1_PHONE | Deferred — SMS OTP removed (ADR-010); email registration is the consumer path |
| L2_EMAIL | Email verified (password or OAuth) |
| L3_IDENTITY | Licensed ID check (NIN/BVN/gov ID) — **hash only**, never raw |

Identity Verified badge = L3 `VERIFIED`.

## Seed

```bash
# from apps/api (after migrate)
pnpm exec prisma db seed
```

Uses `ADMIN_SUPER_EMAIL` / `ADMIN_SUPER_PASSWORD` from env. Super Admin seed unchanged.
