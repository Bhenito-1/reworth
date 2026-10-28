# PO review — Product ecosystem coverage

> Product Owner acceptance against marketing slide **“08 | THE PRODUCT ECOSYSTEM”**  
> (“One Marketplace, Multiple Ways to Create Value”)  
> Audited: 2026-10-07 · Surfaces: `apps/mobile`, `apps/web`, `apps/api` · Parity: `docs/MOBILE_PARITY.md`

**Verdict:** The five pillars on the slide are **real product capabilities**, not vapourware. Core consumer + web + moving sales + estate communities + corporate relocation + partner console are **shipped in code** with mobile ↔ web parity marked **full**.  

Several **slide bullets oversell** what is built today (interest groups, local events/pop-ups, CSR programmes, facility marketplaces as a separate product). Treat those as **roadmap / marketing stretch**, not launch acceptance.

---

## Scorecard vs slide

| Slide pillar | Claim | Product status | PO call |
| --- | --- | --- | --- |
| **1. Consumer app** | Buy · sell · swap · give away; local search; chat; verified users/items; Paystack; pickup/delivery | **Shipped** (mobile primary). Paystack adapter present; **live keys still launch gate** | **Accept** for MVP/demo; block public “secure Paystack” marketing until live PSP |
| **2. Web companion** | Advanced search/filters; listings & messages; analytics; multi-upload; account/payments | **Shipped** as companion (`/search`, `/sell`, `/chats`, `/sell/analytics`, checkout) | **Accept** |
| **3. Communities & groups** | Estate / neighbourhood marketplaces; trusted members; moderation | **Shipped:** browse/join/invite redeem, privacy, community listings, partner membership approve | **Accept** for estate communities |
| ↳ Interest-based groups | Church / alumni / hobby groups as first-class | **Partial** — community model can represent them via seed/config; no interest taxonomy / discovery UX | **Defer** — do not demo as distinct product |
| ↳ Group sales & announcements | Feed announcements | **Missing** as dedicated announcement surface | **Gap** |
| ↳ Local events & pop-up sales | Events calendar / pop-ups | **Missing** (moving sales cover time-boxed clear-outs, not general events) | **Gap / stretch** |
| **4. Moving sales** | Multi-item clear-out; featured section; start/end; reach local buyers | **Shipped:** create with deadline, attach listings, browse/follow, Home rail, web `/moving-sales` | **Accept** |
| ↳ Bundles / clear-out tools | Explicit bundle pricing tools | **Partial** — collection of listings under one sale; no separate “bundle price” SKU | **Accept with caveat** |
| **5. Corporate & estate tools** | Estate/facility marketplaces; bulk/managed listings; employee/resident groups; CSR; analytics | **Split** — see below | **Partial accept** |
| ↳ Corporate relocation | Bulk dispose with coordinator | **Shipped:** apply → projects → intake → complete → invoice (`/corporate`, mobile Corporate modal) | **Accept** |
| ↳ Estate partner console | KPIs, membership queue, API sync | **Shipped:** `/partner`, mobile Partner console, admin create estate partner, HMAC member sync | **Accept** |
| ↳ CSR & donation programmes | Dedicated CSR product | **Partial** — circular partners + donate-if-unsold; not full CSR programme suite | **Gap vs slide** |
| ↳ Dedicated facility marketplace product | Separate B2B product SKU | **Not a separate app** — estate = community + partner console | **Accept as current model**; rename slide language if needed |

---

## Ecosystem diagram (Individuals · Communities · Organisations · Estates · Moving sales)

| Segment | Covered? | How |
| --- | --- | --- |
| Individuals | **Yes** | Consumer app + web |
| Communities | **Yes** | Estate/semi-private communities |
| Organisations | **Yes (relocation)** | Corporate workspace; not full HR/CSR suite |
| Estates | **Yes** | Communities + estate partner console |
| Moving sales | **Yes** | Moving sales module |

Footer impact claims (more value, cleaner communities, sustainable consumption, local opportunity) are **brand narrative** — not acceptance tests.

---

## What is in scope and working (PO accepts)

1. **Core marketplace** — sell / buy / swap / give away, chat, offers, escrow-shaped checkout, pickup/delivery quotes.  
2. **Trust rails** — OTP, verification levels, reviews/trust, moderation/admin, disputes.  
3. **Communities** — list, join/request, invites, community-scoped listings, leave.  
4. **Moving sales** — create, deadline, attach live listings, browse, follow, notifications.  
5. **Corporate relocation** — account apply, projects with employee + deadline, intake, complete, invoice share.  
6. **Estate partner tools** — KPIs, membership approval queue, webhook/API member sync.  
7. **Supporting value** — consign, managed pickup, circular donate-if-unsold, pro seller / storefront, Seller Plus / boost / featured, Ask ReWorth, room scan.

Evidence: `docs/MOBILE_PARITY.md` rows for moving sales, communities, corporate, partner — all **full** / **full**.

---

## Gaps vs this slide (fix or cut from marketing)

| # | Slide language | Reality | Recommended action |
| --- | ---: | --- | --- |
| G1 | Interest-based groups | No dedicated interest discovery | Soften copy to “estate & private communities” or backlog interest tags |
| G2 | Group sales & announcements | No announcement feed | Backlog or use chat/community listings only in demos |
| G3 | Local events & pop-up sales | Not built | Remove from slide **or** position Moving Sales as the pop-up analogue |
| G4 | CSR & donation programmes | Donate-if-unsold + circular partners only | Rename to “circular / donate pathways” until CSR console exists |
| G5 | Bulk & managed listings (estate) | Pro bulk CSV + consign + corporate intake — not full estate CMS | Demo corporate intake + pro tools; don’t claim estate CMS |
| G6 | “Secure payments via Paystack” | Adapter + mock default; live keys pending | Demo with mock OK; public launch blocked on `docs/LAUNCH.md` §A |
| G7 | Web “multiple item uploads” | Sell flow multi-photo; not necessarily bulk multi-listing on web in one shot | Prefer Pro bulk / moving sale attach for multi-item demos |

---

## Launch blockers (not feature gaps)

These do **not** change the ecosystem map, but they block “sell well” claims:

- Live Paystack + Termii  
- Store distribution + real push  
- Lagos founding-seller density  
- NDPR / pen-test  

See `docs/NIGERIA_MARKET_LAUNCH.md`.

---

## PO decision

| Question | Answer |
| --- | --- |
| Does the product cover the ecosystem slide’s **pillars**? | **Yes** — consumer, web, communities, moving sales, corporate + estate partner. |
| Is every bullet on the slide accurate? | **No** — interest groups, events/pop-ups, and full CSR overclaim. |
| Ready to show investors/partners this slide? | **Yes, with revised bullets** (use table G1–G5). |
| Ready to mark Phase “ecosystem complete”? | **Yes for core pillars**; open a stretch backlog for G1–G5. |

### Acceptance for marketing

**Approved to say:**  
*ReWorth is one marketplace with a consumer app, web companion, estate communities, moving sales, and corporate relocation + estate partner tools.*

**Do not say yet:**  
*Interest groups, event calendar, pop-up marketplace product, and full CSR programme suite.*

---

## Next (if PO prioritises closing stretch)

1. Soften slide 08 copy to match shipped scope (1–2 hours, design).  
2. Optional P1: community announcements.  
3. Optional P2: interest tags on communities.  
4. Optional P3: CSR programme entity on top of circular partners.  
5. Keep launch order: density + Paystack + Termii before new B2B features.
