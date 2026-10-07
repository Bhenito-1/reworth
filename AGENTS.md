# AGENTS.md — ReWorth living context

> Update this file after every phase. Resume point of truth with `docs/PHASE_STATUS.md`.

## Overview

**ReWorth** is a consumer recommerce marketplace (**buy · sell · swap · give away**) launching in **Lagos, Nigeria** (multi-city via region config).

- Tagline: *"Lagos, your unused things are worth something."*
- **Conflict rule:** Product → `PRD.md`. Engineering → `CURSOR-PROMPT.md` / `CURSOR-PROMPT-PHASE2-3.md`.

## Mobile-first doctrine

- **Primary product surface:** iOS + Android (`apps/mobile`, Expo).
- **Web** (`apps/web`) is a **responsive companion** — browse, search, listing detail, checkout — not the lead surface.
- **Admin** (`apps/admin`) is ops-only; out of scope for mobile parity.
- **Every feature** is designed, built, and tested mobile-first.
- **Build order within every phase:** mobile (iOS + Android) → web parity.
- **Web parity** ships in-phase **or** is explicitly listed under Known gaps / `docs/MOBILE_PARITY.md` — never silently skipped.

## Definition of Done

Functional · UX · **mobile behaviour verified on iOS + Android; web parity delivered or tracked in known gaps** · security · analytics · error/loading/empty states · a11y · tests · docs · PO acceptance. (PRD §59, mobile-first amendment.)

## Current phase

| Field | Value |
| --- | --- |
| Phase | **Design elevation** `v1.0.3-design-elevation` (+ email register; SMS removed ADR-010) |
| Last completed (post-launch) | **3.3** (`v2.2-monetization`) |
| MVP Admin | **`v0.8-admin`** (+ harden) |
| MVP Risk / Security | **`v0.9-risk-security`** (+ harden) |
| Status | **Shipped** (`v1.0.3-design-elevation`) |
| Cart & inventory | **Shipped** (ADR-011) — cart, unit stock, seller confirm/reject, cancel-before-pay, guarded listing removal |
| Next | Remaining DESIGN.md screen elevation (Sell/PDP/Chat/Home rails); Boost/Plus web parity; Maestro ≤60s device recording; staging k6 UAT |

## MVP / post-launch

MVP: scaffold → … → trust (`v0.7`) → **admin (`v0.8-admin`)** → risk (`v0.9`) → RC.  
Post-launch through `v2.2-monetization`: swap → communities → intelligence → verticals → AI → B2B/expansion → monetization.

## Known gaps

- Expo push mock; staging k6 certification; pen-test / NDPR / store sign-offs
- Real device Maestro ≤60s recording still open (`e2e/mobile/00_demo_60s.yaml`)
- L1 phone verification deferred (SMS OTP removed — ADR-010)
- Universal / App Links stubs: fill AASA TEAMID + Play SHA before prod
- Cross-border: ADR-007 design only; consumer pilot = SW + Edo + Abuja + PH + Kano (`config/regions`, `status=pilot`)
- Web companion for Boost / Featured / Seller Plus (mobile full — see `docs/MOBILE_PARITY.md`)
- Promoted search self-serve later (ADR-009 admin-assigned)
- Payments still mock-default in local (Paystack adapter present)
- NSFW image moderation remains the rule-based mock (`IMAGE_MODERATION_PROVIDER`). Image-title checks use the Roboflow workflow in `apps/api/src/vision` and enter moderation as a review signal (mismatch, low confidence, or a failed check → admin review)

See `docs/PHASE_STATUS.md`, `docs/BUYER_JOURNEY_AUDIT.md`, `docs/METRICS.md`, `docs/ADRS/009-promoted-search-admin.md`.
