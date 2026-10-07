# Mobile parity audit

> **Doctrine:** ReWorth is mobile-first. Primary surface = iOS + Android (`apps/mobile`). Web = companion. Admin = out of scope.  
> **Statuses:** `full` · `partial` · `missing`  
> **Audited:** 2026-09-16 · Post adoption P0–P11 (B2B mobile)  
> **Owners:** Mobile Lead + Product · update when shipping consumer surfaces

## Legend

| Status | Meaning |
| --- | --- |
| **full** | Comparable user journey on mobile and web |
| **partial** | Mobile has a subset, lib-only, badge-only, or simplified modal vs full web page |
| **missing** | User-facing on web; no (or non-wired) mobile UI |

Companion column notes web’s intended role when mobile is primary.

---

## Core marketplace

| Flow | Mobile | Web | Notes |
| --- | --- | --- | --- |
| Onboarding (email register + profile) | **full** | **full** | Mobile: in-app steps. Web: `/onboarding/*` |
| Home / discovery rails | **full** | **full** | `DiscoveryHome` vs `/` |
| Search | **full** | **full** | `SearchPanel` vs `/search` |
| Favourites / wishlist | **full** | **full** | Heart saves for later. Profile → Wishlist and web `/wishlist` can add those items to the cart |
| Listing detail (PDP) | **full** | **full** | Modal vs `/listings/[id]` — companion OK |
| Sell / publish | **full** | **full** | `SellFlow` vs `/sell` — camera + gallery filmstrip on mobile |
| Chat / messaging | **full** | **full** | `ChatScreens` vs `/chats` |
| Checkout (mock Paystack) | **full** | **full** | `CheckoutModal` vs `/checkout` |
| Orders list + detail | **full** | **full** | Profile orders vs `/orders`. Seller confirm/reject and pay-after-confirm on both |
| Cart | **full** | **full** | Profile → Cart vs `/cart`. Cart is not an order |
| Seller inventory | **full** | **full** | Profile → Stock vs `/inventory`. Includes sold listings. Remove when nothing is in progress; sold-out stays |
| Disputes | **full** | **full** | `DisputeModal` vs `/disputes/[id]` |
| Public seller profile | **full** | **full** | `UserProfileModal` vs `/users/[id]` · `/u/[handle]` |
| Privacy / account delete | **full** | **full** | `PrivacySettings` vs `/settings/privacy` |
| Notification preferences | **full** | **full** | Mobile centre + §29 prefs + quiet hours; web `/settings/notifications` |
| In-app notification centre | **full** | **full** | Mobile `NotificationsScreens`; web `/notifications` |
| OAuth Google / Apple | **full** | **full** | Mobile + web method step → mock/live `POST /auth/oauth/:provider/callback` |

---

## Post-launch 2.x

| Flow | Mobile | Web | Notes |
| --- | --- | --- | --- |
| Swap propose / respond | **full** | **full** | Mobile: PDP propose → chat; Accept/Reject on `SWAP_PROPOSAL_CARD` |
| Give-away claim | **full** | **full** | Claim on PDP; web also `/listings/[id]/claims` queue |
| Moving sales browse / follow | **full** | **full** | Mobile: `MovingSalesModal` + Home rail; web `/moving-sales` |
| Moving sale create | **full** | **full** | Mobile create in modal; web `/moving-sales/new` |
| Estate communities browse / join | **full** | **full** | Mobile: `CommunitiesModal`; web `/communities` |
| My communities / invites | **full** | **full** | Mobile Mine tab + invite redeem; web `/account/communities` |
| Saved-search alerts | **full** | **full** | Mobile: Search → Save alert; Profile → Saved → Alerts (pause/digest/delete); web `/my` + `/search` |
| Recommendations (similar / home) | **full** | **full** | Mobile: PDP similar + Home **For you** (`surface=home`); web rails |
| Price intelligence on sell | **full** | **full** | Mobile sell: range, quick/max, confidence, Use recommended |
| Seller analytics | **full** | **full** | Mobile: Profile → Stats (`SellerAnalyticsPanel`); web `/sell/analytics` |
| Vehicle inspection (book / badge) | **full** | **full** | Mobile: Book inspection sheet (request/pay/schedule); web paths fixed to `/listings/:id/inspections` |
| Luxury authentication badge | **full** | **full** | Sell **Require luxury authentication**; PDP badge; post-fund job |
| Pro seller / bulk tools | **full** | **full** | Mobile: Profile → Pro seller modal; web `/pro` |
| Referrals | **full** | **full** | Mobile: Profile → Referrals modal; web `/referrals` |
| Storefront handle | **full** | **full** | Mobile: `StorefrontModal` + Pro view/share; deep link `/u/:handle`; web `/u/[handle]` |

---

## Post-launch 3.x (AI · platform · B2B · monetization)

| Flow | Mobile | Web | Notes |
| --- | --- | --- | --- |
| Ask ReWorth assistant | **full** | **full** | Mobile: suggestions, confirmToken, search/bundle cards; web `/ask` |
| Shared budget bundles | **full** | **full** | Mobile: Save & share + `SharedBundleModal` deep link; web `/ask/bundles/[token]` |
| Room scan | **full** | **full** | Mobile: multi-photo upload, item toggle, drafts; web `/room-scan` |
| What's it worth | **full** | **full** | Mobile: photo upload + share estimate; web `/worth` |
| Instant Buy | **full** | **full** | Sell toggle; order schedule/confirm; `GET /instant-buy/by-order/:orderId` |
| Consignment | **full** | **full** | Mobile: create + list/sold/return lifecycle; web `/consign` |
| Managed pickup | **full** | **full** | Mobile: book slots + my pickups list; web `/pickup` |
| Listing Boost / Featured | **full** | **full** | Mobile PDP boost sheet; web PDP owner monetization card |
| Seller Plus (upgrade / cancel) | **full** | **full** | Mobile `SellFlow` plan card; web `/sell` Seller plan section |
| Corporate relocation workspace | **full** | **full** | Mobile: Profile → Corporate modal (apply/projects/intake/complete/invoice share); web `/corporate` |
| Estate partner console | **full** | **full** | Mobile: Profile → Partner console (KPIs + queue + session API key); web `/partner` |
| Circular donate-if-unsold (seller) | **full** | **full** | Sell checkbox → `POST /listings/:id/donate-if-unsold` (mobile + web) |
| Region / multi-city picker | **full** | **full** | Pilot SW + Edo + Abuja + PH + Kano; mobile Home sheet + Profile chips; web Account/Sell |

---

## Companion web (intended thin)

These are **expected** on web even when mobile leads; keep parity **full** or document intentional web-only deep links:

| Flow | Mobile | Web | Intent |
| --- | --- | --- | --- |
| Shareable listing URLs | **full** | **full** | Mobile PDP **Share** → `https://reworth.ng/listings/:id`; deep link opens PDP (`parseDeepLink`) |
| SEO / marketing landing | N/A | **full** | Web-only OK |
| Admin ops | N/A | Admin app | Out of scope |

---

## Summary counts (consumer flows above)

| | full | partial | missing |
| --- | ---: | ---: | ---: |
| Mobile | ~29 | ~5 | ~5 |

Exact rows: see tables. **Priority close order (mobile-first):** Maestro ≤60s device recording (testIDs ready); staging k6; Termii keys.

---

## Process

1. New consumer feature: ship mobile → update this file → web parity in-phase or add to `AGENTS.md` Known gaps.  
2. Do not mark a phase Done while mobile is **missing** unless Product explicitly defers into Known gaps.  
3. Admin never appears in this matrix.

## Related

- `docs/MOBILE_STORE_OPS_TRACK.md`  
- `AGENTS.md` · `.cursor/rules/project.mdc` · `stack.mdc` · `phases.mdc`
