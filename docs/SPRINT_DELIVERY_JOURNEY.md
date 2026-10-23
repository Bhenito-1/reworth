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

## Out of scope / deferred

- Signing a specific courier vendor (GIG/Kwik/Fez) — adapter is vendor-agnostic HTTP  
- Live rider GPS (ADR-011 deferred)  
- Multi-cart split shipments  

## PO acceptance (sprint)

Buyer sees fee + window before pay; tracks seller → rider → me in plain language; confirms receipt from order. Seller sees payout unlock tied to confirm. Address never shown pre-pay.
