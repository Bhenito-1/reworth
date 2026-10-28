# ADR-002: Payments escrow via regulated PSP

- **Status:** Implemented (Phase 5 / `v0.5-orders-payments`)
- **Date:** 2026-09-12
- **Deciders:** Payments Engineer, Security Engineer, Solution Architect

## Context

PRD §17 requires Nigerian payment methods and transaction protection where applicable, and states:

> The marketplace itself should not improperly hold customer funds outside an appropriate regulated payment framework.

Buyer protection (PRD §18) needs a hold → deliver → confirm → release flow without ReWorth becoming an unlicensed custodian of customer funds.

## Decision

1. Use a **regulated payment service provider (PSP)** — **Paystack** as the primary production adapter for MVP — to hold/settle funds according to the PSP’s escrow / split / delayed-settlement capabilities as configured for Nigeria.
2. Model an **escrow-shaped state machine** in ReWorth (order/payment entities, webhooks, idempotency keys) that mirrors: pay → held → item delivered → buyer confirms → release (or dispute/refund).
3. Provide a **deterministic mock PSP** for local/CI so E2E works with zero network calls.
4. ReWorth application databases store **payment references and statuses**, not raw card data; no “wallet balance” that implies ReWorth custody outside the PSP framework.
5. Legal/compliance review of the exact Paystack product configuration is a **launch sign-off** item (Phase 10), not a reason to invent an in-house ledger for customer funds.

## Consequences

- Phase 5 depends on webhook reliability, idempotency, and dispute hooks.
- Swap + Cash (post-launch `v1.0`) reuses the same cash-leg escrow path.
- If PSP product limits change, update this ADR and adapters — do not hold funds in a ReWorth-controlled account that violates §17.

## Implementation (Phase 5)

- `PaymentProvider` + `MockPsp` + `PaystackAdapter` under `apps/api/src/providers/`
- Orders / Payments / Disputes Nest modules; escrow state machine; auto-release + seller-response expiry schedulers
- Env: `PAYMENTS_PROVIDER`, `BUYER_PROTECTION_FEE_*`, `ORDER_AUTO_RELEASE_DAYS`, `BUYER_PROTECTION_COVERAGE_DAYS`

### Escrow order lifecycle (2026-09-30)

Happy path statuses:

`CREATED` / `PAYMENT_PENDING` → `FUNDED` (payment in escrow) → `SHIPPED` or `HANDED_OVER` → `DELIVERED` (courier) → buyer `RECEIVED` → escrow **release** → `COMPLETED`

Seller is not paid until buyer confirms receipt (or auto-release after dispatch/handover / dispute resolution). Auto-release no longer pays out from `FUNDED` alone. Instant Buy buyer-confirm calls the same `confirmReceipt` → escrow release path. Admin **Orders** shows lifecycle stages, escrow label, payments, payouts, and delivery events. Shared helpers: `@reworth/shared` `buildOrderLifecycle` / `buildEscrowSnapshot`.

## References

- PRD §§17–18, §44, §50
- `CURSOR-PROMPT.md` Prompt 6
- Phase tag `v0.5-orders-payments`
