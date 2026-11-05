# Sprint — Delivery journey (customer-centric)

> **Epic:** `delivery-journey` · Design: `docs/DELIVERY_JOURNEY_DESIGN.md`  
> **Doctrine:** Mobile-first → web companion parity  
> **Started:** 2026-10-23  
> **Decisions for this sprint:** Next-day ETA copy (honest MVP) · Confirm photos optional · Mock courier OK (D5 later)

## Goal

Ship the **customer story** on top of existing logistics plumbing: clear checkout, shared order timeline, confirm CTA tied to escrow language.

## Sprint backlog

| ID | Slice | Surface | DoD |
| --- | --- | --- | --- |
| **D1** | Checkout clarity | Mobile → web | Fulfilment choice cards; fee + ETA before pay; privacy line |
| **D2** | Order timeline | Mobile → web | Humanized shipment steps; buyer confirm / seller prepare cues |
| **D3** | Tracking sheet | Mobile → web | Corridor map + help (follow-up sprint if timeboxed) |
| **D4** | Exceptions | Both | No-show / dispute entry copy (follow-up) |
| **D5** | Partner rail | API | `PartnerDeliveryProvider` + webhook HMAC + staging rails §4 |
| **D6** | Driver milestones | Mobile → web + API | Driver auth, assigned-only updates, idempotent / stale / FAILED handling |

## This sprint (in scope)

- [x] Sprint + design freeze note  
- [x] D1 mobile checkout (fulfilment choice cards + ETA / privacy copy)  
- [x] D2 mobile order timeline (`DeliveryJourneyTimeline`)  
- [x] D1/D2 web parity (checkout copy + order timeline)  
- [x] Update `AGENTS.md` / `PHASE_STATUS.md` / `MOBILE_PARITY.md`  
- [x] **D3** mobile `DeliveryTrackingSheet` (corridor map + help)  
- [x] **D3** web `DeliveryTrackingPanel` + dispute deep link  
- [x] **D4** exception banner (failed / unreachable / seller delay / item check) + expanded dispute entry  
- [x] **D5** `PartnerDeliveryProvider` (dry-run/live) + webhook signature + `STAGING_RAILS` §4  
- [x] **D6** Driver milestones (`POST /driver/shipments/:orderId/milestones`, mobile Driver runs, web `/driver`)

## Two-screen test

Buyer and driver need separate logins. `localhost` and `127.0.0.1` do not share browser storage, so keep both windows open.

1. Screen A — [http://localhost:3000](http://localhost:3000). Sign in as the buyer `ayo@demo.reworth.ng` / `DemoAyo!2026`. The sofa is Ada’s listing, so it appears in Search, not under Ayo’s own listings.
2. Screen B — [http://127.0.0.1:3000/driver](http://127.0.0.1:3000/driver). Sign in as `demo-driver@reworth.local` / `DemoDriver!2026`. This window is the rider console (no marketplace nav).
3. On A, search **kivik**, open the IKEA Kivik sofa, place the order, and pay with **Simulate payment**. No seller sign-in. The fee for furniture is the van rate (₦12,000 + ₦800/km), not the parcel rate.
4. On B, the run appears as **Waiting for a rider** with areas only. **Accept delivery**. Pickup and dropoff lines appear. Mark Collected → On the way → Out for delivery → Delivered.
5. On A, the order timeline updates about every 8 seconds through **Rider accepted** and **Delivered**. Confirm receipt to release the funds.

Ops can flag another account from Admin → Users → **Make rider**. A rider who declines is skipped. The buyer can ask for another attempt twice after a failed run. A partner webhook cannot move a run that already has a rider.

## Out of scope / deferred

- Signing a specific courier vendor (GIG/Kwik/Fez) — adapter is vendor-agnostic HTTP  
- Live rider GPS (ADR-011 deferred)  
- Multi-cart split shipments  
- Dedicated rider native app (MVP uses flagged consumer account + Driver runs)  

## PO acceptance (sprint)

Buyer sees fee + window before pay; tracks seller → rider → me in plain language; confirms receipt from order. Seller sees payout unlock tied to confirm. Address never shown pre-pay.
