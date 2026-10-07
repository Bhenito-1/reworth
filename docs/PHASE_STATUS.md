# Phase status

| Field | Value |
| --- | --- |
| Current | **Design elevation** `v1.0.3-design-elevation` |
| Last completed phase | **3.3 — Monetization** `v2.2-monetization` |
| Status | **Shipped** |
| Last updated | 2026-09-30 |

## Cart, units, and seller confirmation (ADR-011)

- Cart does not create an order or hold stock (`/cart` on web, Profile → Cart on mobile)
- Sellers set units available; price is per unit
- New orders reserve units until the seller confirms, the buyer pays, or the order is cancelled or rejected
- Seller inventory lists every listing, including sold-out items (`/inventory`, Profile → Stock)
- Sellers can remove a listing from the marketplace when nothing is in progress. Sold-out listings stay in inventory and cannot be deleted
- Apply migration `20260930190000_cart_inventory`

## Design elevation summary (`v1.0.3-design-elevation`)

- Email consumer registration (+ OAuth); SMS / phone OTP removed (ADR-010)
- `docs/DESIGN.md` + token sync; contrast audit in CI
- Mobile `OnboardingFlow`; web email onboarding parity
- Remaining full-app screen elevation continues against DESIGN.md checklist

## Ops patch (2026-09-30) — listing media + moderation

- Direct multipart upload `POST /media/direct` (web + mobile sell) so photos are stored then marked READY
- Pipeline fails closed if the object is missing (no fake READY URLs)
- **Object storage:** `STORAGE_DRIVER=s3` → `S3StorageAdapter` against compose service `s3mock` (adobe/s3mock). Public URLs: `http://localhost:9000/reworth-media/...`
- `ListingModeration` snapshot on publish; admin listings detail shows images + scores
- `with-root-env.mjs` Windows fix so `pnpm prisma:deploy` works

## Resume

Finish Sell/PDP/Chat/Home elevation vs DESIGN.md; Boost/Plus web companion; staging k6 UAT (`docs/PERF.md`). Apply migration `20260930160000_listing_moderation` if not yet applied.

## MVP residual harden (no retag)

- Phase 9 / 8 / 6 hardens already on default branch — tags unchanged.
