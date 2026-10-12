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
| Home / discovery rails | **full** | **full** | `DiscoveryHome` vs `/`. Home starts with every listing. Category chips filter the homepage for this visit only; refresh or the × control shows every item again. Choose a location limits it to one state and area; signing out clears that choice. Signed-in seller's own listings stay out of the marketplace and appear in My listings |
| Search | **full** | **full** | `SearchPanel` vs `/search`. Query required before search or save alert. Empty results cannot be saved. Price min cannot exceed max. Conditions show in sentence case. Marketplace search omits the signed-in seller's own listings |
| Favourites / wishlist | **full** | **full** | Heart saves for later. Empty wishlist opens search. A listing with no units left is removed from every wishlist. Profile → Wishlist and web `/wishlist` can add remaining items to the cart |
| Listing detail (PDP) | **full** | **full** | Modal vs `/listings/[id]` — companion OK |
| Sell / publish | **full** | **full** | `SellFlow` vs `/sell` — camera + gallery filmstrip on mobile. Payout bank details are saved as entered |
| Chat / messaging | **full** | **full** | `ChatScreens` vs `/chats`. Mute hides badges. A blocked person replaces the message bar with Unblock, and Safety shows Unblock user |
| Checkout (mock Paystack) | **full** | **full** | `CheckoutModal` vs `/checkout` |
| Orders list + detail | **full** | **full** | Profile orders vs `/orders`. Pay and cancel are separate actions. A cancelled order shows Cancelled and moves to the Cancelled tab. Unpaid orders show Awaiting payment |
| Cart | **full** | **full** | Profile → Cart vs `/cart`. Cart is not an order |
| Seller inventory | **full** | **full** | My listings (mobile tab, web `/selling`; `/inventory` redirects). Refresh reloads from the server. First 10 show, then See more. All statuses in one list. Drafts: Continue and Delete. Boost, feature, inspection, and moving sale only on live listings. Remove from marketplace only while live; accepted orders stay and must be fulfilled |
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
| Swap propose / respond | **full** | **full** | Propose swap with photos, title, description, and a delivery day. Roboflow checks the photos before the offer is sent. Accept, reject, or cancel in chat. After any of those, the proposal buttons disappear for both people. A swap that was accepted is cancelled from the order, and only before either person pays the delivery fee. Accept opens a swap order for both people, alerts the other person, and takes the listing off the marketplace. Each person pays delivery plus a ₦500 swap fee. Either person can cancel the unpaid order, which puts only the original listing back. The other person's proposal was never a listing, so a cancel or reject does not put it on the marketplace. Only the person who listed it can remove it, from My listings, the same as any other live listing. Swap and gift skip bank details |
| Give-away claim | **full** | **full** | No payout account when listing a gift. Get this gift opens checkout with a delivery quote for the buyer's area |
| Moving sales browse / follow | **full** | **full** | Mobile: `MovingSalesModal` + Home rail; web `/moving-sales` |
| Moving sale create | **full** | **full** | Mobile create in modal; web `/moving-sales/new` |
| Estate communities browse / join | **full** | **full** | Mobile: `CommunitiesModal`; web `/communities` |
| My communities / invites | **full** | **full** | Mobile Mine tab + invite redeem; web `/account/communities` |
| Saved-search alerts | **full** | **full** | Mobile: Search → Save alert; Profile → Wishlist → Alerts. Open search opens Discover with that alert's filters. Web `/my` + `/search` |
| Recommendations (similar / home) | **full** | **full** | Similar items are other live listings in the same category. Tapping one opens that listing (mobile PDP; web `/listings/:id`). Home **For you** stays `surface=home`. |
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
| Shareable listing URLs | **full** | **full** | Share opens WhatsApp, Facebook, X, or copies the public `/listings/:id` link. Origin is `EXPO_PUBLIC_WEB_URL` / `NEXT_PUBLIC_WEB_URL`, otherwise the live site address. |
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
