# Mobile parity audit

> **Doctrine:** ReWorth is mobile-first. Primary surface = iOS + Android (`apps/mobile`). Web = companion. Admin = out of scope.  
> **Statuses:** `full` · `partial` · `missing`  
> **Audited:** 2026-09-14 · Post `v2.1-expansion` + Mobile/Store/Ops tranche  
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
| Sell / publish | **full** | **full** | `SellFlow` vs `/sell` (modes SELL/SWAP/GIVE_AWAY) |
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
| OAuth Google / Apple | **missing** | **missing*** | *API supports; neither consumer UI complete — track together, mobile first |

---

## Post-launch 2.x

| Flow | Mobile | Web | Notes |
| --- | --- | --- | --- |
| Swap propose / respond | **partial** | **full** | Mobile: propose from PDP; web fuller thread UX |
| Give-away claim | **full** | **full** | Claim on PDP; web also `/listings/[id]/claims` queue |
| Moving sales browse / follow | **missing** | **full** | Mobile: lib + home rail link only; no dedicated screens (`lib/moving-sales.ts` unwired) |
| Moving sale create | **missing** | **full** | Web `/moving-sales/new` |
| Estate communities browse / join | **missing** | **full** | Mobile: `lib/estate-communities.ts` unwired; web `/communities` |
| My communities / invites | **missing** | **full** | Web `/account/communities` |
| Saved-search alerts | **missing** | **full** | Intelligence alerts on web; no mobile alerts UI |
| Recommendations (similar / home) | **partial** | **full** | Mobile: similar on PDP; web home rails + surfaces |
| Price intelligence on sell | **partial** | **full** | Mobile sell shows comps when available; web richer |
| Seller analytics | **missing** | **full** | Mobile: `fetchSellerAnalytics` lib only; web `/sell/analytics` |
| Vehicle inspection (book / badge) | **partial** | **full** | Mobile: Inspected badge display; no book flow |
| Luxury authentication badge | **partial** | **full** | Display on PDP; no auth request flow |
| Pro seller / bulk tools | **missing** | **full** | Web `/pro` |
| Referrals | **missing** | **full** | Web `/referrals` |
| Storefront handle | **missing** | **full** | Web `/u/[handle]` pro storefront extras |

---

## Post-launch 3.x (AI · platform · B2B · monetization)

| Flow | Mobile | Web | Notes |
| --- | --- | --- | --- |
| Ask ReWorth assistant | **partial** | **full** | Mobile: `PlatformTools` Ask panel; web `/ask` + confirm UX |
| Shared budget bundles | **missing** | **full** | Web `/ask/bundles/[token]` |
| Room scan | **partial** | **full** | Mobile: demo scan modal; web `/room-scan` multi-photo |
| What's it worth | **partial** | **full** | Mobile: estimate card; web `/worth` + photo/share |
| Instant Buy | **partial** | **full** | Mobile: badge + buy path; no fulfilment scheduling UI |
| Consignment | **partial** | **full** | Mobile: create/list modal; web `/consign` fuller lifecycle |
| Managed pickup | **partial** | **full** | Mobile: book slots modal; web `/pickup` |
| Listing Boost / Featured | **full** | **missing*** | *Phase 3.3 mobile-shipped (`ListingDetailModal` boost sheet + chips); web PDP parity tracked |
| Seller Plus (upgrade / cancel) | **full** | **missing*** | *Phase 3.3 mobile-shipped (`SellFlow` plan card); web sell/account parity tracked |
| Corporate relocation workspace | **missing** | **full** | Web `/corporate` — B2B; still mobile-first for coordinators on phone |
| Estate partner console | **missing** | **full** | Web `/partner` |
| Circular donate-if-unsold (seller) | **missing** | **partial** | Web sell checkbox; hand-off mostly admin/API |
| Region / multi-city picker | **partial** | **full** | Mobile: home city label from `/regions`; web Account/Sell/Corporate pickers |

---

## Companion web (intended thin)

These are **expected** on web even when mobile leads; keep parity **full** or document intentional web-only deep links:

| Flow | Mobile | Web | Intent |
| --- | --- | --- | --- |
| Shareable listing URLs | deep link TBD | **full** | Web companion for links |
| SEO / marketing landing | N/A | **full** | Web-only OK |
| Admin ops | N/A | Admin app | Out of scope |

---

## Summary counts (consumer flows above)

| | full | partial | missing |
| --- | ---: | ---: | ---: |
| Mobile | ~16 | ~14 | ~14 |

Exact rows: see tables. **Priority close order (mobile-first):** communities → moving sales → seller analytics → Ask/Scan depth → corporate (if Persona C on-device) → referrals/pro · web Boost/Plus companion.

---

## Process

1. New consumer feature: ship mobile → update this file → web parity in-phase or add to `AGENTS.md` Known gaps.  
2. Do not mark a phase Done while mobile is **missing** unless Product explicitly defers into Known gaps.  
3. Admin never appears in this matrix.

## Related

- `docs/MOBILE_STORE_OPS_TRACK.md`  
- `AGENTS.md` · `.cursor/rules/project.mdc` · `stack.mdc` · `phases.mdc`
