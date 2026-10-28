# CURSOR-PROMPT.md — ReWorth MVP Journey (Prompts 1–11)

> **How to use:** Execute **one phase instruction at a time**. Do not implement future phases in the same PR. Full acceptance criteria for each phase are summarized below; expand from `PRD.md` when implementing. After launch, continue with [`CURSOR-PROMPT-PHASE2-3.md`](CURSOR-PROMPT-PHASE2-3.md).

## Conflict rule

| Concern | Source of truth |
| --- | --- |
| Product decisions (scope, UX, acceptance, ambition) | [`PRD.md`](PRD.md) (60 sections) |
| Engineering decisions & build order | **This brief** (`CURSOR-PROMPT.md`) |

If this brief and the PRD conflict: **product follows the PRD; engineering and sequencing follow this brief.**

---

## Master brief overview

You are the complete full-stack development team for **ReWorth**, a consumer recommerce marketplace (**buy · sell · swap · give away**) launching in Lagos, Nigeria — Lekki, Ikoyi, Victoria Island, Oniru, VGC, Chevron, Ajah and surrounding communities.

- First-time user photographs an item and has it **live in ~60 seconds** with AI assistance.
- Long-term ambition: Nigeria's leading recommerce ecosystem.
- Brand tagline: *"Lagos, your unused things are worth something."*
- Authoritative product spec: `PRD.md` — read fully before writing code.

### 14-role team

| Role | Owns |
| --- | --- |
| Product Owner | Scope, acceptance criteria, Definition-of-Done sign-off, phase reports |
| Solution Architect | System design, ADRs (`docs/ADRS/`), phase plans, module boundaries |
| Backend Lead (NestJS) | API, domain services, state machines, jobs, tests |
| Frontend Engineer (Next.js) | Web storefront, PDP, discovery surfaces |
| Mobile Engineer (React Native/Expo) | iOS + Android, camera, push, offline resilience |
| Database Engineer | PostgreSQL schema, migrations, indexes, OpenSearch mappings, seed |
| AI/ML Engineer | Photo→listing, price intel, NL search, content scanning |
| Payments Engineer | PSP, escrow state machine, webhooks, idempotency, refunds, payouts |
| DevOps / Platform | Docker, CI/CD, environments, secrets, observability, load tests |
| QA Lead | Test strategy, automated suites, golden-path e2e, UAT |
| Security Engineer | PRD §44–45 controls, per-phase threat review, hardening |
| UX/UI Designer | Design system, screens, loading/empty/error, a11y (PRD §38–39) |
| Data Analyst | KPI events (PRD §36), dashboard SQL, metric definitions |
| Ops / Support Lead | Admin workflows, moderation queues, support tickets, runbooks |

### Working agreements

1. **One phase at a time.** Plan → implement → update `AGENTS.md` + `docs/PHASE_STATUS.md`.
2. Work is done only per **Definition of Done** (PRD §59).
3. One branch + one PR per phase. Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
4. Never invent credentials — placeholders in `.env.example` only.
5. Every external service = **interface + prod adapter + deterministic mock**.
6. Uncovered decisions → smallest reasonable choice + ADR; **≤3 open questions** per phase.

### Baked-in stack (no substitutions without ADR)

| Area | Decision |
| --- | --- |
| Monorepo | Turborepo + pnpm |
| Mobile | React Native + Expo (iOS + Android) |
| Web + Admin | Next.js 15 App Router, TypeScript, Tailwind |
| API | NestJS modular monolith, REST `/api/v1` |
| Database | PostgreSQL 16 + Prisma; Redis + BullMQ |
| Media | S3-compatible (adobe/s3mock in dev), presigned uploads |
| Search | OpenSearch + Postgres FTS fallback adapter |
| Auth | JWT (short access + rotating refresh), email/password, Google/Apple OAuth |
| Payments | Paystack + mock PSP; escrow-shaped (ADR-002 / PRD §17) |
| AI | Multimodal LLM (OpenAI GPT-4o default) + rule-based mock |
| Locale | NGN, en-NG, WAT |

### Definition of Done (PRD §59)

A feature is done only when: functional requirements pass · UX approved · responsive · security review · analytics events · error/loading/empty states · accessibility · automated tests pass · documentation updated · Product Owner acceptance.

---

## Phase table (0–10) with git tags

| Phase | Prompt | Tag | Goal |
| --- | --- | --- | --- |
| 0 | Prompt 1 | `v0.0-scaffold` | Foundations — monorepo, infra, CI, design system, healthz, branded landing |
| 1 | Prompt 2 | `v0.1-auth` | Accounts, auth & identity — install → verified account <90s |
| 2 | Prompt 3 | `v0.2-listings` | Listings, media & AI-assisted listing (~60s publish) |
| 3 | Prompt 4 | `v0.3-discovery` | Home rails, search, favourites / saved searches |
| 4 | Prompt 5 | `v0.4-chat-offers` | WebSocket chat + offers; PII block; reserve on accept |
| 5 | Prompt 6 | `v0.5-orders-payments` | Paystack escrow, disputes, idempotent money ops |
| 6 | Prompt 7 | `v0.6-logistics-notifications` | Pickup/meet/delivery quotes + PRD §29 notification engine |
| 7 | Prompt 8 | `v0.7-trust` | Two-way reviews + trust score + public profile |
| 8 | Prompt 9 | `v0.8-admin` | Full ops portal (7 roles), KPIs, audit-enforced mutations |
| 9 | Prompt 10 | `v0.9-risk-security` | Risk engine, moderation, SECURITY/PRIVACY, k6 |
| 10 | Prompt 11 | `v0.9.0-rc` | UAT §58, seed, launch runbooks, MVP §50 status table |

**Out of MVP** (data-model ready only — PRD §51–52): swap marketplace, moving sales, estate communities, saved-search alerts, advanced recommendations, AI price intelligence v2, vehicle inspection, luxury authentication, seller analytics, pro sellers, referrals, AI assistant, room scan, consignment, corporate relocation, national expansion. See [`CURSOR-PROMPT-PHASE2-3.md`](CURSOR-PROMPT-PHASE2-3.md).

---

## Prompt 1 — Phase 0: Foundations (`v0.0-scaffold`)

**Goal:** Bootable monorepo with infra, CI, design system, health endpoints, and branded landing. No domain features.

**Deliverables (summary):**
- Commit `PRD.md`, this file, `CURSOR-PROMPT-PHASE2-3.md`, `AGENTS.md`, Cursor rules, ADRs, doc stubs.
- Turborepo: `apps/api|web|admin|mobile` + `packages/shared|ui-web|config`.
- Docker Compose: Postgres 16, Redis, adobe/s3mock, OpenSearch, Mailhog.
- Design system: palette `#FAF9F7` / `#111315` / `#0E9F6E` + soft gold verification; SELL dominant; ListingCard pattern; mobile bottom nav Home · Discover · SELL · Chats · Profile.
- `GET /api/v1/healthz` (+ readyz/metrics stub); web landing with brand + tagline + SELL CTA; admin shell.

**Acceptance:** `pnpm install && docker compose up -d && pnpm dev` boots api + web + admin; CI green; tag `v0.0-scaffold`.

---

## Prompt 2 — Phase 1: Accounts, Auth & Identity (`v0.1-auth`)

**Goal:** Install → verified account in under 90 seconds. Admin RBAC seed.

**In scope (summary):** Phone OTP (rate-limited), JWT access + rotating refresh with reuse detection, Google/Apple OAuth, optional email/password (Argon2id), devices, profiles, L1/L2/L3 verification (NIN/BVN/gov ID via licensed-provider interface — never store raw IDs), 7 admin roles + Super Admin from env, onboarding UI (web + mobile), admin login + 2FA shell.

**Acceptance:** Demo <90s with email auth; stolen refresh revokes family; L3 mock badge with no raw ID in DB/logs; Support 403 on Finance + audit; tag `v0.1-auth`.

---

## Prompt 3 — Phase 2: Listings, Media & AI-Assisted Listing (`v0.2-listings`)

**Goal:** Photograph → AI draft → publish in ~60 seconds.

**In scope (summary):** Categories from PRD §26; listing fields PRD §9 + vehicle JSONB §27; presigned S3 uploads (adobe/s3mock in dev); BullMQ image pipeline (EXIF strip, resize, WebP/AVIF, dHash); multimodal AI draft (title, description, category, condition, price range) + rule-based mock; Sell mode purchase-ready; Swap / Swap+Cash / Give Away data-modelled only; listing state machine Draft → … → Sold/Rejected; PDP.

**Acceptance:** Golden-path publish ~60s with mock AI; media never proxied through API; tag `v0.2-listings`.

---

## Prompt 4 — Phase 3: Discovery — Home, Search & Favourites (`v0.3-discovery`)

**Goal:** Hyperlocal discovery with search that feels visual-first.

**In scope (summary):** Home rails (Nearby, Just Listed, Price Drops, Moving Sales teaser, categories, Recommended stub); OpenSearch indexing + Postgres FTS fallback; keyword + NL search parser; filters (distance, price, condition, category, verification, delivery, date); favourites + saved searches (alerts deferred to post-launch); geo radius bands 2/5/10/25 km / All Lagos; exact addresses never in browse payloads.

**Acceptance:** Search + nearby rails demoable; FTS fallback works without OpenSearch; tag `v0.3-discovery`.

---

## Prompt 5 — Phase 4: Chat + Offers (`v0.4-chat-offers`)

**Goal:** Secure negotiation without leaking PII.

**In scope (summary):** WebSocket chat (text, images, listing preview); offer / counter / accept / reject with 24h default expiry; accept → listing Reserved; PII block (phone/email patterns); scam phrase scanning; block / report / mute; FCM for new messages (full notification engine in Phase 6).

**Acceptance:** Offer lifecycle + reserve; blocked PII never delivered; tag `v0.4-chat-offers`.

---

## Prompt 6 — Phase 5: Orders, Protected Payments & Disputes (`v0.5-orders-payments`)

**Goal:** Escrow-shaped protected checkout via regulated PSP (PRD §17 / ADR-002).

**In scope (summary):** Order state machine; Paystack adapter + mock PSP; hold → deliver → confirm → release; refunds/payouts; idempotent money ops + webhook verification; dispute workflow (report → evidence → seller response → resolution); buyer protection claims per PRD §18.

**Acceptance:** Full protected purchase with mock PSP; webhook replay safe; tag `v0.5-orders-payments`.

---

## Prompt 7 — Phase 6: Logistics + Notification Engine (`v0.6-logistics-notifications`)

**Goal:** Fulfilment choices + reliable multi-channel notifications (PRD §29).

**In scope (summary):** Buyer pickup, meet point, platform delivery with quote-before-pay; delivery partner adapter + mock; notification categories and granular prefs; in-app + push + email (Mailhog in dev); quiet hours / rate limits.

**Acceptance:** Quote shown before pay; notification prefs respected; tag `v0.6-logistics-notifications`.

---

## Prompt 8 — Phase 7: Trust — Reviews + Trust Score (`v0.7-trust`)

**Goal:** Post-transaction reputation that buyers and sellers can trust.

**In scope (summary):** Two-way reviews only after completed transactions; criteria (accuracy, communication, punctuality, experience); trust score signals (PRD §16); public profile (rating, Identity Verified ✓, transaction count, member since, response time).

**Acceptance:** Reviews gated to completed orders; public profile matches score rules; tag `v0.7-trust`.

---

## Prompt 9 — Phase 8: Admin Operations Portal (`v0.8-admin`)

**Goal:** Ops can run the marketplace without engineering help.

**In scope (summary):** Full portal for Users, Listings, Transactions, Payments, Disputes, Verification, Reports, Fraud, Support, Promotions, Categories, Locations, Analytics, CMS; 7 RBAC roles; every mutation audit-logged; KPI dashboard hooks (PRD §36).

**Acceptance:** Role matrix enforced; audited mutation demo; tag `v0.8-admin`.

---

## Prompt 10 — Phase 9: Risk, Moderation & Security Hardening (`v0.9-risk-security`)

**Goal:** Production-ready risk posture before UAT.

**In scope (summary):** Fraud/risk scoring (PRD §32); content moderation (PRD §33); complete `docs/SECURITY.md` + `docs/PRIVACY.md`; rate limits, upload hardening, pen-test checklist; k6 load scripts; high-risk listing → manual review.

**Acceptance:** High-risk path forces review; security docs complete; k6 baseline recorded; tag `v0.9-risk-security`.

---

## Prompt 11 — Phase 10: UAT, Seed & Launch Readiness (`v0.9.0-rc`)

**Goal:** Prove PRD §58 acceptance + launch ops readiness.

**In scope (summary):** Seed founding-seller density (supply-first PRD §55); UAT script covering §58 buyer/seller/admin paths; `docs/UAT.md` + `docs/RUNBOOK.md`; regenerate `docs/API.md` from OpenAPI; MVP §50 status table; backlog pointers to Phase 2–3 prompts; changelog for `v0.9.0-rc`.

**Acceptance:** UAT checklist signed; every §50 item mapped shipped / gap / deferred; tag `v0.9.0-rc`.

---

## Appendix — Quick Resume Cheat Sheet

If a phase stalls or context runs out, paste exactly:

```
Continue: resume Phase N from docs/PHASE_STATUS.md. Re-read AGENTS.md and
PRD.md, verify the last commit's tests still pass, then continue the plan. Do not restart completed work.
```

**Phase tags:** `v0.0-scaffold` · `v0.1-auth` · `v0.2-listings` · `v0.3-discovery` · `v0.4-chat-offers` · `v0.5-orders-payments` · `v0.6-logistics-notifications` · `v0.7-trust` · `v0.8-admin` · `v0.9-risk-security` · `v0.9.0-rc`

**After launch:** full post-MVP series in [`CURSOR-PROMPT-PHASE2-3.md`](CURSOR-PROMPT-PHASE2-3.md) — tags `v1.0` → `v2.1` with an **entry gate** confirming MVP stability before any 2.x work.
