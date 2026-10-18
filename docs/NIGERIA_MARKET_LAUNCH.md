# Nigeria market — what is left to sell well

> Product Owner + Ops. **Not a numbered PRD phase.**  
> Companion to `docs/LAUNCH.md` (production rails), `docs/CITY_PLAYBOOK.md` (city config), and `docs/ReWorth-Product-Deck.html` (stakeholder deck).  
> Last updated: 2026-10-06

The product is already **feature-rich** (buy · sell · swap · give away, OTP, NGN, multi-city pickers, chat/offers, escrow-shaped checkout, communities, moving sales, referrals, boosts). What is left to **sell well in Nigeria** is **live rails + density + trust** — not more cities or screens.

PRD §54–56: an empty marketplace fails irrespective of technology. First commercial objective is **quality supply density**, not downloads.

Do **not** add more cities or features first. Do **not** market all 10 pilots at once.

**Sell-well order:** Lagos density → live Paystack + Termii → stores + push → founding-seller programme → then market Abuja / PH / Ibadan once those cities have inventory.

---

## 1. Liquidity (the real GTM)

| Item | Owner | Status |
| --- | --- | --- |
| Recruit founding sellers (estates, relocators, property managers) | Ops / Growth | ☐ |
| Seed toward ~500 sellers / 2,500–5,000 quality items | Ops | ☐ |
| Start **Lagos corridors** (Lekki Ph1, Ikoyi, VI, Oniru, Chevron, VGC, Ajah) | Product | ☐ |
| Per-city: seed `Community.city`, circular partners, support owner | Ops | ☐ |
| Confirm density **before** paid marketing in that city | Growth | ☐ |
| Founding perks: free verification, listings, collection, featured, early-seller badge | Product | ☐ |

Cities in `config/regions` are **open in the picker**. They are not yet **stocked**. Empty Abuja/Kano feeds will look worse than a dense Lekki–Ikoyi–VI marketplace.

---

## 2. Money Nigerians trust

Still mock-default in local. Conversion vs WhatsApp “transfer / pay on delivery” needs live escrow.

| Item | Owner | Status |
| --- | --- | --- |
| `PAYMENTS_PROVIDER=paystack` + live keys | Payments Eng | ☐ |
| HTTPS webhook + HMAC secret | DevOps | ☐ |
| Escrow release / refund dry-run on staging | Payments Eng | ☐ |
| PSP merchant / licensing sign-off | Legal / Finance | ☐ |

Detail: `docs/LAUNCH.md` §A · `docs/STAGING_RAILS.md` · ADR-002.

---

## 3. OTP that actually arrives

Auth spine is SMS + WhatsApp OTP. If codes don’t land, every first session is lost.

| Item | Owner | Status |
| --- | --- | --- |
| Termii live keys (SMS + WhatsApp) in staging/prod | DevOps | ☐ |
| OTP templates approved | Product | ☐ |
| Wallet balance alerts | Ops | ☐ |

Detail: `docs/LAUNCH.md` §B · `docs/STAGING_RAILS.md`.

---

## 4. App in people’s hands

| Item | Owner | Status |
| --- | --- | --- |
| Play Store + App Store submit (screenshots, keywords, tagline) | Mobile / Marketing | ☐ |
| Real EAS `projectId`; fill AASA TEAMID + Play SHA | Mobile | ☐ |
| `PUSH_PROVIDER=expo` + FCM/APNs (replace mock) | Mobile | ☐ |
| Maestro ≤60s device recording | Mobile | ☐ |

Mock push = missed chat / offer / order alerts. Detail: `docs/LAUNCH.md` §C, §G · `docs/MOBILE_STORE_OPS_TRACK.md`.

---

## 5. Trust & legal (Nigeria)

ReWorth’s pitch vs Jiji / WhatsApp groups is **safer, structured resale**. That only works if escrow, verification, and disputes are real in production.

| Item | Owner | Status |
| --- | --- | --- |
| External penetration test | Security | ☐ |
| NDPR / privacy counsel review | Legal | ☐ |
| Processor DPAs (Termii, Paystack, object storage, identity vendor) | Legal | ☐ |
| Identity vendor live (not mock L3) | Trust | ☐ |
| Fraud watchlist seed per marketed city | Risk | ☐ |

Detail: `docs/PRIVACY.md` · `docs/LAUNCH.md` external sign-offs.

---

## 6. Ops that keep the market alive

Slow or scammy = one public thread and the brand is damaged.

| Item | Owner | Status |
| --- | --- | --- |
| Staging k6 p95 &lt; 500ms at 500 VUs | DevOps | ☐ |
| On-call rota + escalation | Ops | ☐ |
| Backup + restore drill | DevOps | ☐ |
| Prod rate limits; `DISABLE_THROTTLE` unset | Security | ☐ |
| Domain + TLS + CORS allowlist | DevOps | ☐ |
| Analytics dashboards vs PRD §36 KPIs | Data | ☐ |

Detail: `docs/LAUNCH.md` §D–F · `docs/PERF.md` · `docs/RUNBOOK.md`.

---

## What not to do next

- Do not add more cities to the public picker until Lagos has supply density.
- Do not turn on paid acquisition for a city with empty community chips.
- Do not treat cross-border (ADR-007) or self-serve promoted search (ADR-009) as launch blockers.

## Open questions (≤3)

1. Founding-seller target: Lagos-only first 90 days, or dual Lagos + Abuja from week one?
2. Collection support: ReWorth-operated pickup vs partner courier for founding sellers?
3. Identity vendor for live L3 (who, SLA, NDPR DPA date)?
