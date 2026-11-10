# AGENTS.md — ReWorth living context

> Update this file after every phase. Resume point of truth with `docs/PHASE_STATUS.md`.

## Overview

**ReWorth** is a consumer recommerce marketplace (**buy · sell · swap · give away**) launching in **Lagos, Nigeria** (multi-city via region config).

- Tagline: *"Lagos, your unused things are worth something."*
- **Conflict rule:** Product → `PRD.md`. Engineering → `CURSOR-PROMPT.md` / `CURSOR-PROMPT-PHASE2-3.md`.

## Surface doctrine

- **Primary consumer surface:** Web PWA (`apps/web`) — installable standalone app, responsive layout, offline shell (`public/sw.js`), Web Push via VAPID (`PUSH_PROVIDER=web-push`).
- **Admin** (`apps/admin`) is ops-only.
- The native Expo app was removed; do not reintroduce Expo push or `apps/mobile`.

## Definition of Done

Functional · UX · PWA behaviour verified on mobile + desktop browsers · security · analytics · error/loading/empty states · a11y · tests · docs · PO acceptance. (PRD §59, PWA amendment.)

## Current phase

| Field | Value |
| --- | --- |
| Phase | **Design elevation** `v1.0.3-design-elevation` (+ email register; SMS removed ADR-010) |
| Last completed (post-launch) | **3.3** (`v2.2-monetization`) |
| MVP Admin | **`v0.8-admin`** (+ harden) |
| MVP Risk / Security | **`v0.9-risk-security`** (+ harden) |
| Status | **Near complete** · web PWA primary · **delivery-journey** D1–D6 shipped (partner dry-run + driver milestones) · Web Push + VAPID |
| Next | Execute `docs/STAGING_RAILS.md` (Termii → Paystack test → web-push → delivery partner); staging k6 |

## MVP / post-launch

MVP: scaffold → … → trust (`v0.7`) → **admin (`v0.8-admin`)** → risk (`v0.9`) → RC.  
Post-launch through `v2.2-monetization`: swap → communities → intelligence → verticals → AI → B2B/expansion · monetization.

## Known gaps

- Staging k6 p95 certification; pen-test / NDPR / store sign-offs
- Cross-border: ADR-007 design only; consumer pilot = SW + Edo + Abuja + PH + Kano (`config/regions`, `status=pilot`)
- Device push tokens table dropped; use `/devices/web-push-subscriptions`. Offline caches public shells/assets only; API actions need connectivity.
- Promoted search self-serve later (ADR-009 admin-assigned)
- Payments still mock-default in local (Paystack adapter present)
- Termii live SMS/WhatsApp keys still pending (dual-channel mock verified)
- Maps: Phase A locate + Phase B map + Phase C chat meetup pins shipped; live track deferred (ADR-011)
- Delivery journey D1–D6 shipped (incl. driver milestones); live courier needs staging partner keys (`STAGING_RAILS` §4)

See `docs/PHASE_STATUS.md`, `docs/SPRINT_DELIVERY_JOURNEY.md`, `docs/DELIVERY_JOURNEY_DESIGN.md`, `docs/STAGING_RAILS.md`, `docs/NIGERIA_MARKET_LAUNCH.md`, `docs/PRODUCT_ECOSYSTEM_PO_REVIEW.md`, `docs/ReWorth-Product-Deck.html`, `docs/BUYER_JOURNEY_AUDIT.md`, `docs/METRICS.md`, `docs/ADRS/011-maps-locate-me.md`.
