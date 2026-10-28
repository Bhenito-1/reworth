# Phase 8 hardening — Admin Operations Portal (tag kept)

> **Tag:** `v0.8-admin` already on `7c7599d` — **not moved**.  
> **Branch:** `phase-8-admin-harden`  
> **Roles:** Backend · Admin FE · Docs

## Context

MVP Phase 8 portal (auth, RBAC, 13+ pages, audit, KPIs) shipped under `v0.8-admin`. This harden closes residual acceptance gaps without retagging.

## Closed in this harden

| Gap | Fix |
| --- | --- |
| JWT claims | Access tokens include `admin` + `totpVerified` |
| Finance stub collision | Removed stub `GET /admin/finance/summary` from `AdminUsersController` (real summary via monetization) |
| Page-level RBAC | `AuthGuard` + `rolesForPath` → 403 UI for deep-links |
| TOTP enroll UI | Admin `/security` → setup + verify |
| Disputes resolve UI | Full/partial refund, release, cancel via Payments |
| Fraud actions | Review → suspend (revokes sessions + notify) / whitelist |
| Dispute audit | `DISPUTE_RESOLVED` with before/after in service layer |
| Tests | 7-role × area matrix; dispute resolve audit + PSP refund |

## Acceptance mapping

1. Content Moderator → listings OK; Transactions refund / finance → 403 + `RBAC_DENIED`
2. Risk analyst → fraud review → suspend → `revokeAllRefreshTokens` + in-app notify (queued immediately)
3. Finance/Support → dispute partial refund → payment refund row + buyer notify + audit
4. Mutating admin actions continue to write `AuditLog`
5. Docs updated; **tag `v0.8-admin` unchanged**

## Verify

```bash
pnpm --filter @reworth/api exec jest src/admin/admin-rbac.spec.ts src/orders/orders-payments.spec.ts --no-coverage
```
