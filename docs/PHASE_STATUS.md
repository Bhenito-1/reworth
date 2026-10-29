# Phase status

| Field | Value |
| --- | --- |
| Current | **Design elevation complete** `v1.0.3-design-elevation` |
| Last completed phase | **3.3 — Monetization** `v2.2-monetization` |
| Status | **Shipped** |
| Last updated | 2026-09-30 |

## Cart, units, and seller confirmation (ADR-011)

- Cart does not create an order or hold stock (`/cart` on web, Profile → Cart on mobile)
- Sellers set units available; price is per unit
- New orders reserve units until the seller confirms, the buyer pays, or the order is cancelled or rejected
- My listings shows every listing (live, in review, rejected, sold, closed, removed) on mobile and `/selling`. Drafts resume in Sell and can be deleted. Boost and other live seller tools only appear on live listings
- Remove from marketplace is only for a live listing. Remaining units leave the marketplace and the status becomes Removed. An already accepted order must still be fulfilled
- Apply migration `20260930190000_cart_inventory`

## Design elevation summary (`v1.0.3-design-elevation`)

### Foundation (PR #22 — shipped)

- Email consumer registration (+ OAuth); SMS / phone OTP removed (`docs/ADRS/010-remove-sms-providers.md`)
- `docs/DESIGN.md` + token sync; contrast audit in CI
- Mobile `OnboardingFlow`; web email onboarding parity
- Profile customise: avatar (optional), name, bio, community

### Brand palette refresh (navy / orange / beige)

- Tokens: Soft White `#FCFAF6`, Beige `#F2E7D5`, Navy `#172A3A`, Orange `#D96A32`, Slate `#59636D`
- Primary CTA = Burnt Orange; Secondary = Midnight Navy; Chip selected = Beige
- Chat: beige / soft-orange bubbles; contrast audit updated

### Listing AI assist (`docs/ADRS/010-openai-listing-assist.md`)

- `AI_PROVIDER=openai` + `OPENAI_API_KEY` → GPT-4o vision/text draft on Sell **Analyze**
- Default remains `mock` (rule-based); OpenAI failures fall back to mock

### Adoption P0s (shipped in code)

- JWT access default **24h** + boot/interval refresh; Home no longer clears session on network blips
- Clearer 429 copy on mobile
- Sell photos: `media/complete` accepts `inlineBase64` + seeds placeholder bytes for vision
- Prisma seed ships **21 LIVE Lagos listings** with cover images (`DEMO_SEED`)
- Home falls back to Lagos-wide when preferred community has no inventory

### Adoption P1 (shipped in code)

- Expo push: foreground handler + tap listeners route chat / order / listing / moving-sale / community
- Mobile **Communities** modal (browse / mine / join / invite redeem)
- Mobile **Moving Sales** modal (browse / follow / create) + Home rail cards
- Profile shortcuts + Home banners wired

### Adoption P2 (shipped in code)

- Checkout: escrow / meetup / delivery copy + trust badges + photo thumb
- Sell: **Take photo** (camera) + gallery + removable filmstrip scan-line
- Profile **Stats** tab — seller analytics (views / saves / offers / revenue)

### Adoption P3 (shipped in code)

- Ask ReWorth: suggestion chips, mutation **Confirm**, search/bundle/valuation cards
- Room scan: multi-photo upload, detect phases, item include/skip, create drafts
- Search filters: price min/max + sort; Offer sheet: asking price + % chips; BottomSheet scrolls

### Adoption P4 (shipped in code)

- Mobile **Referrals** modal (code, share, invite status) from Profile
- Mobile **Pro seller** modal (apply / subscribe / bulk CSV)
- Web companion: PDP Boost + Featured purchase; `/sell` Seller Plus upgrade/cancel

### Adoption P5 (shipped in code)

- OAuth Google / Apple on mobile + web email onboarding
- Client libs call `POST /auth/oauth/:provider/callback` (API mock adapter when secrets unset)

### Adoption P6 (shipped in code)

- Mobile saved-search alerts: Search → **Save alert**; Profile → Saved → **Alerts** (pause / digest / delete / open)
- Reuses `/me/saved-searches` + favourites payload; opens Discover with seeded filters

### Adoption P7 (shipped in code)

- Ask bundle **Save & share**; `SharedBundleModal` for `/ask/bundles/:token` deep links
- Save-to-my-bundles + re-share; push/deep-link kind `bundle`

### Adoption P8 (shipped in code)

- Pro **storefront** modal (`GET /storefronts/:handle`); deep link `/u/:handle`
- Pro seller → View / Share storefront

### Adoption P9 (shipped in code)

- Swap chat Accept/Reject; propose opens conversation
- Vehicle inspection book (request/pay/schedule); web verticals paths fixed
- Luxury `authRequired` + donate-if-unsold on Sell

### Still open vs full directive

- ~~Chat bubbles~~ token pass (`ChatScreens` → `theme/tokens` + `useColors`)
- ~~Orders timeline / Notifications~~ token pass (`OrdersScreens`, `NotificationsScreens`)
- ~~PDP sheets~~ token pass (`ListingDetailModal` brand badges + sheets)
- Maestro stubs present (`e2e/mobile/*.yaml` + README); Sell/PDP/tabs **testIDs** wired; **appId** aligned to `com.reworth.app`; **real-device ≤60s recording** still open
- Shareable listing URLs: PDP Share + `https://reworth.ng/listings/:id` deep link (mobile + web companion)
- Universal / App Links: Expo associatedDomains + Android intentFilters; web `/.well-known` AASA + assetlinks stubs (replace TEAMID / Play SHA before prod)
- Full-app hex purge: core consumer screens + CTA `onAccent` token (light/dark safe); only `theme/tokens.ts` retains palette hex
- P10 partials closed: Worth photo/share, sell price intel, consign/pickup lifecycle, Home For you recs
- P11 B2B: Corporate relocation + Partner console on mobile (Profile)
- Pilot cities: **SW + Edo + Abuja + PH + Kano** (`lagos`, `ogun`, `ibadan`, `osun`, `ondo`, `ekiti`, `edo`, `abuja`, `port-harcourt`, `kano`)
- Brand-asset pass: mobile onboarding / Chat / Orders status badges; web onboarding illustrations; Sell empty/photo CTAs; dispute status badge
- ~~Hex purge~~ → `theme/tokens` + `onAccent` / `--rw-on-accent`
- Local k6 **health-smoke** pass 2026-09-20 (p95 ~5ms @ 1 VU); **staging 500 VU gate** still required
- Remaining full-app screen elevation continues against DESIGN.md (Sell / PDP / Chat / Home)

## Ops patch (2026-09-30) — listing media + moderation

- Direct multipart upload `POST /media/direct` (web + mobile sell) so photos are stored then marked READY
- Pipeline fails closed if the object is missing (no fake READY URLs)
- **Object storage:** `STORAGE_DRIVER=s3` → `S3StorageAdapter` against compose service `s3mock` (adobe/s3mock). Public URLs: `http://localhost:9000/reworth-media/...`
- `ListingModeration` snapshot on publish; admin listings detail shows images + scores
- `with-root-env.mjs` Windows fix so `pnpm prisma:deploy` works

## Active epic — Delivery journey (2026-10-23)

- Design: `docs/DELIVERY_JOURNEY_DESIGN.md` · Sprint: `docs/SPRINT_DELIVERY_JOURNEY.md`
- **Sprint complete (D1–D6 code):** checkout · timeline · map/help · exceptions · partner adapter · driver milestones (auth + idempotent / stale / FAILED)

## Resume

1. Staging rails: `docs/STAGING_RAILS.md` (Termii → Paystack → Expo push → delivery partner §4)  
2. Nigeria GTM: `docs/NIGERIA_MARKET_LAUNCH.md`  
3. Maestro ≤60s device record  
4. Staging k6 500 VU · Store IDs
