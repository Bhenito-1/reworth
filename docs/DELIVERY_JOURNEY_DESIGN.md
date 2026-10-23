# Delivery journey design — customer-centric

> **Status:** Design freeze · **Sprint active** — `docs/SPRINT_DELIVERY_JOURNEY.md`  
> **Product:** ReWorth · Lagos-first recommerce  
> **Owner roles:** Product + UX · Logistics Eng · Mobile · Payments  
> **Conflict rule:** Product → `PRD.md` §19–20 · Escrow → ADR-002 · Maps → ADR-011  

## Why this doc

ReWorth already has **fulfilment plumbing**: pickup / meet-point / delivery flags, delivery quote before pay, mock courier, shipment status machine, address disclose after fund, meetup pins, managed pickup SKUs.

What is **not** yet designed as a **customer journey** is the human path: how a Lagos buyer and seller *feel* safe choosing delivery, track it without anxiety, and know when money and goods change hands.

This draft is **buyer- and seller-centric first**. Couriers and ops adapters come second.

---

## 1. Jobs to be done

### Buyer
> “I found something nearby. I don’t want to chase a stranger on WhatsApp. I want it brought to me (or a safe handoff), with clear cost, clear timing, and my money protected until I have the item.”

### Seller
> “I listed in 60 seconds. I don’t want endless ‘where are you?’ chats. I want a clear day to hand over, my address private until it’s real, and payout only after a clean handoff.”

### Platform promise
Delivery is **trust logistics**, not a classifieds afterthought: quote → pay (escrow-shaped) → collect → deliver → confirm → release.

---

## 2. Principles (customer-centric)

1. **Clarity before money** — Quote, ETA window, and who does what appear *before* Paystack. No surprise fees after fund.
2. **Privacy by stage** — Exact address never in browse (PRD §20). Seller address disclosed only when funded + delivery selected. Buyer delivery address shared only with logistics / seller as needed for that leg.
3. **One live order story** — Buyer and seller see the **same timeline language**, not two different apps’ jargon.
4. **Anxiety has a home** — Every wait state answers: *What happens next? Who acts? When should I worry?*
5. **Choice without shame** — Meetup / pickup / delivery are peers. Delivery is premium convenience, not “the only serious option.”
6. **Local voice** — Copy in en-NG: estates, corridors, “rider,” “safe meetup,” WAT times — not generic global parcel UX.
7. **Escrow is visible** — “Protected until you confirm” sits beside tracking, not buried in legalese.
8. **Fail soft** — Failed pickup, wrong item, no-show: guided paths, not dead ends into chat chaos.

---

## 3. Fulfilment map (what we offer)

| Mode | Customer mental model | When it wins |
| --- | --- | --- |
| **Meetup** | “We meet at a known safe spot.” | Same corridor, item portable, trust via chat + pin |
| **Buyer pickup** | “I collect from seller (address after pay).” | Buyer has mobility; seller stays home |
| **Platform delivery** | “A rider collects from seller and brings it to me.” | Distance, bulk, time-poor buyers |
| **Managed pickup** *(SKU)* | “ReWorth schedules a white-glove slot.” | Higher AOV / Instant Buy / founding sellers |

**This design focus:** **Platform delivery** end-to-end, with clear handoffs to meetup/pickup when delivery is not chosen or fails over.

---

## 4. End-to-end journey (happy path)

Persona: **Ada** (buyer, Lekki) buys a sofa from **Tunde** (seller, Yaba). Chooses **ReWorth delivery**.

```text
Discover → Chat / Offer → Checkout (quote) → Pay (escrow)
    → Seller prepares → Rider collect → In transit → Delivered
    → Ada confirms → Escrow release → Reviews
```

### Stage narrative

| # | Stage | Buyer sees | Seller sees | System |
| --- | --- | --- | --- | --- |
| 0 | **Choose how it arrives** | Cards: Meetup · Pickup · Delivery + price + ETA | Which methods they enabled on listing | Quote API; region rates |
| 1 | **Pay with protection** | Breakdown: item + protection + delivery; “Released when you confirm” | “Ada paid — prepare item” | FUNDED; shipment `QUOTED` |
| 2 | **We’re arranging collection** | “Waiting for Tunde to confirm ready” + tip | “Confirm ready for pickup” + window | Seller ready → `ASSIGNED` |
| 3 | **Rider collecting from seller** | Corridor ETA | “Rider arriving · have item packed” | `ASSIGNED` → `PICKED_UP` |
| 4 | **On the way** | “Item with rider · heading to you” | “Collected — payout after Ada confirms” | `IN_TRANSIT` |
| 5 | **Out for delivery** | Live status + contact rider (masked) | Same status (read-only) | `OUT_FOR_DELIVERY` |
| 6 | **Delivered** | “Confirm it looks right” primary CTA | “Waiting for Ada’s confirmation” | `DELIVERED` |
| 7 | **Confirmed** | Rate experience | Payout initiated | Buyer confirm → escrow release |

---

## 5. Customer experience surfaces (mobile-first)

Build order: **mobile** → web companion parity.

### 5.1 Checkout — “How do you want it?”

- Three large choice cards (not buried radio rows).
- Delivery card shows: **fee (₦)**, **window** (e.g. “Today 2–6pm WAT” or “Tomorrow”), **distance band**.
- Secondary line: “Exact address stays private until payment.”
- Empty / unavailable: if seller disabled delivery → explain + suggest meetup.

### 5.2 Order home — single timeline

One vertical timeline shared by buyer & seller (role-aware CTAs):

1. Paid & protected  
2. Seller preparing  
3. Rider collecting  
4. On the way  
5. Delivered — confirm  
6. Complete  

Each step: title · one sentence · timestamp · optional photo (handover snap).

### 5.3 Tracking sheet (Phase B+)

- Corridor-level map (community centroids → later live track per ADR-011 deferred).
- **No raw phone numbers** in UI; “Call rider” via masked / in-app if partner supports.
- Help: “Item not moving?” → delay reason + support ticket deep link.

### 5.4 Confirm receipt

- Photo of item optional but encouraged for disputes.
- Condition chips: “As described” / “Issue — open dispute.”
- Confirm releases escrow (ADR-002). Auto-release timer copy shown clearly (“If you don’t respond in X days…”).

### 5.5 Seller “ready for collection”

- Checklist: packed · accessible · photos match listing.
- Choose pickup window (WAT slots).
- Cancel / reschedule with buyer-visible reason.

---

## 6. Emotional beats (design for trust)

| Moment | Risk | Design response |
| --- | --- | --- |
| Pre-pay fee shock | Abandon | Quote early; show fee on PDP “Delivery from ₦…” |
| Post-pay silence | “Did I get scammed?” | Push within minutes: “Seller notified · next step” |
| Waiting on seller | Buyer anxiety | Countdown / nudge seller; buyer can message once |
| Rider late | Blame platform | Proactive status + new ETA + apology credit path (ops) |
| Doorstep | Wrong item | Confirm UI + dispute in 2 taps |
| Payout wait | Seller distrust | Escrow meter: “Protected · releases on confirm” |

---

## 7. Notifications (must feel human)

| Event | Buyer | Seller |
| --- | --- | --- |
| Delivery selected + funded | “Payment protected. Delivery arranged.” | “Prepare item — confirm ready.” |
| Seller marked ready | “Collection scheduled {window}.” | Confirm |
| Rider assigned | “Rider assigned · ETA {x}.” | “Rider en route to you.” |
| Collected | “On the way to you.” | “Collected.” |
| Out for delivery | “Out for delivery · be available.” | FYI |
| Delivered | “Confirm receipt to release payment.” | “Awaiting buyer confirm.” |
| Confirmed | “Done — leave a review.” | “Payout started.” |
| Exception | Plain language + next action | Same |

Quiet hours + caps remain (Phase 6). Order-critical cannot be fully muted.

---

## 8. Edge journeys (must be designed, not improvised)

1. **Seller no-show / not ready** — Auto-nudge → buyer choice: wait / switch to meetup / cancel+refund path.  
2. **Buyer unreachable at delivery** — Reattempt policy (1–2) + depot / safe drop options (partner-dependent).  
3. **Item mismatch / damage** — Photo evidence → dispute workflow (PRD §18) without releasing escrow.  
4. **Delivery unavailable for corridor** — Soft fail to meetup with suggested meet points.  
5. **Partial cart / multi-item** — One shipment vs split (v1: one listing = one shipment; multi-cart later).  
6. **Give-away / swap delivery fees** — Already fee-shaped; copy must say who pays what before pay.

---

## 9. Information architecture (copy system)

Use one vocabulary everywhere (mobile, web, push, admin):

| Avoid | Prefer |
| --- | --- |
| “Fulfilled” | “On its way” / “Delivered” |
| “Consignment note” | “Collection from seller” |
| “Last mile” | “Rider to you” |
| “COD” | Never — ReWorth is protected pay |

Status labels aligned to shipment enum but **humanized** in UI:

`QUOTED` → Delivery quoted · `ASSIGNED` → Rider assigned · `PICKED_UP` → Collected from seller · `IN_TRANSIT` → On the way · `OUT_FOR_DELIVERY` → Out for delivery · `DELIVERED` → Delivered · confirm · `FAILED` → Needs attention

---

## 10. Metrics (customer outcomes)

| Metric | Target intent |
| --- | --- |
| Checkout → delivery selected rate | Convenience demand |
| Quote → pay conversion | Fee/ETA clarity |
| Time funded → seller “ready” | Seller responsiveness |
| Time ready → collected | Rider / partner SLA |
| Delivered → confirm < 24h | Trust loop speed |
| Delivery-related dispute rate | Quality of journey |
| CSAT after delivery | Human experience |

---

## 11. What exists vs gap

| Capability | Today | Gap for this journey |
| --- | --- | --- |
| Quote before pay | Yes (mock / region rates) | Human ETA windows, PDP “from ₦” |
| Shipment status SM | Yes (API) | Customer timeline UX + shared copy |
| Address disclose | Yes (funded) | Guided seller checklist + buyer reassurance |
| Meetup pins | Yes (ADR-011 C) | Clear fork when delivery fails over |
| Live track | Deferred | Corridor map + partner ETA first |
| Live courier (GIG/Kwik/etc.) | Mock adapter | Prod adapter + webhooks |
| Confirm → escrow | Yes | Delivery-specific confirm UX + photos |
| Proactive exception UX | Thin | Designed exception paths §8 |

**Verdict:** Backend spine exists; **customer-centric delivery journey UI + partner ETA + exception playbooks** are the design/build gap.

---

## 12. Proposed delivery epic (when PO schedules)

Mobile-first → web parity.

| Slice | Outcome |
| --- | --- |
| **D0 Design freeze** | This doc + mid-fi flows approved (buyer + seller) |
| **D1 Checkout clarity** | Choice cards, quote+ETA, PDP delivery teaser |
| **D2 Order timeline** | Shared status story + CTAs (ready / confirm) |
| **D3 Tracking sheet** | Corridor map + rider status + help |
| **D4 Exceptions** | No-show, reattempt, dispute entry |
| **D5 Partner rail** | Live provider adapter on staging (with Termii/Paystack rails) |

Track as epic `delivery-journey` (no new numbered phase tag). Sprint: `docs/SPRINT_DELIVERY_JOURNEY.md`.

---

## 13. Open questions (≤3)

1. **Partner model for Lagos founding sellers:** ReWorth-operated pickup fleet vs third-party courier first? (`NIGERIA_MARKET_LAUNCH.md` Q2) — **deferred to D5**  
2. **ETA promise:** Same-day corridor SLA vs next-day default for MVP honesty? — **Sprint decision: next-day default copy**  
3. **Confirm photos:** Required for AOV above ₦X, or always optional? — **Sprint decision: optional**

---

## 14. Acceptance sketch (PO)

A buyer can:

1. See delivery fee + window before paying.  
2. Track “seller → rider → me” in plain language.  
3. Confirm receipt (or dispute) without leaving the order.  
4. Never see a seller’s exact address before payment.  

A seller can:

1. Know exactly when to pack and when the rider comes.  
2. Keep address private until funded.  
3. See payout unlock tied to buyer confirm.  

---

*Next step when ready: mid-fi mobile frames for D1–D3, then ADR if partner choice changes ADR-002 / logistics adapter boundaries.*
