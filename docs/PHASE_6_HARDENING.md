# Phase 6 hardening — Logistics + Notifications (no retag)

> **Tag:** `v0.6-logistics-notifications` stays as-is. This tranche closes residual UI/wiring gaps after the tagged MVP ship.  
> **Branch:** `phase-6-logistics-harden`  
> **Roles:** Backend · Mobile Lead · Web companion · Docs

## What shipped in this harden

### API
- **Resend email adapter** (`ResendEmailProvider`) behind `EMAIL_PROVIDER=resend` + `RESEND_API_KEY`
- Existing quiet-hours fields on profile (`quietHoursStart` / `quietHoursEnd`) already enforced in notification send path

### Mobile (`apps/mobile`)
- In-app **notification centre** + §29 prefs + quiet hours (`NotificationsScreens.tsx`)
- Deep-link handling into order / dispute / chat / listing
- Checkout: meet-point picker + delivery quote before pay
- Order detail: shipment tracking + seller one-way address disclose (PICKUP)

### Web companion
- Checkout: meet points + delivery quote (no longer hardcoding `deliveryFeeKobo: 0`)
- Order detail: shipment tracking + pickup address disclose
- `/settings/notifications`: quiet hours PATCH `/me`

## Explicitly out of scope
- Moving or recreating `v0.6-logistics-notifications`
- Expo push production certification (still mock-default)
- Promoted-search self-serve (ADR-009)

## Verify
1. `EMAIL_PROVIDER=mock` (default) — unit tests green
2. Mobile: Profile → Notifications → toggle prefs / quiet hours; checkout DELIVERY quotes before Paystack
3. Web: `/checkout` quote path; `/orders/[id]` tracking/disclose; quiet hours on settings
4. Deep link `reworth://orders/<id>` opens order on mobile

## Parity
See `docs/MOBILE_PARITY.md` — notification centre + prefs moved to **full** on mobile.
