# UAT — PRD §58 (Phase 10 / `v0.9.0-rc`)

> Execute on **web**, **iOS simulator**, **Android emulator**, and **admin**.  
> Preconditions: `docker compose -f infra/docker-compose.yml up -d`, `pnpm dev`, `pnpm --filter @reworth/api prisma:seed`, `pnpm seed:staging`.  
> Demo accounts: see [`DEMO.md`](DEMO.md).  
> Screenshot every pass into `docs/uat-evidence/` (local; do not commit PII).

**Automated coverage:** Playwright golden paths `e2e/web/golden-0{1-4}-*.spec.ts` · Maestro stubs `e2e/mobile/*.yaml`.

---

## A. User paths (PRD §58)

| # | Step | Preconditions | Expected | Web | iOS | Android | Auto |
| --- | --- | --- | --- | --- | --- | --- | --- |
| U01 | Create an account | Fresh email | Account created; session issued | ☐ | ☐ | ☐ | ☐ |
| U02 | Login with email | Existing account | Landing → home; JWT session | ☐ | ☐ | ☐ | ☐ |
| U03 | Create listing with photographs | Ori logged in | Draft listing + media attached | ☐ | ☐ | ☐ | G01 |
| U04 | Receive AI-generated draft title/description | Listing + images | Assist returns title/description | ☐ | ☐ | ☐ | G01 |
| U05 | Set a price | Draft listing | Price saved in NGN kobo | ☐ | ☐ | ☐ | G01 |
| U06 | Publish a listing | Draft ready | Status LIVE or UNDER_REVIEW | ☐ | ☐ | ☐ | G01 |
| U07 | Find nearby products | Home with community | Home rails show community listings | ☐ | ☐ | ☐ | ☐ |
| U08 | Search products | Indexed/LIVE listings | Search returns matches | ☐ | ☐ | ☐ | G02 |
| U09 | Save a listing | Ayo + LIVE listing | Favourite persisted | ☐ | ☐ | ☐ | G02 |
| U10 | Message a seller | Buyer + seller listing | Conversation + message delivered | ☐ | ☐ | ☐ | G02 |
| U11 | Make an offer | Conversation open | Offer PENDING | ☐ | ☐ | ☐ | G02 |
| U12 | Accept or reject an offer | Seller Ori | Offer ACCEPTED/REJECTED; listing may RESERVE | ☐ | ☐ | ☐ | G02 |
| U13 | Initiate a transaction | Accepted offer / buy now | Order + payment initiate (mock PSP) | ☐ | ☐ | ☐ | G03 |
| U14 | Select pickup or delivery | Checkout | Fulfilment method stored | ☐ | ☐ | ☐ | G03 |
| U15 | Receive transaction notifications | Funded order | In-app notification created | ☐ | ☐ | ☐ | G03 |
| U16 | Mark item as received | Handed over | Buyer confirm-receipt succeeds | ☐ | ☐ | ☐ | G03 |
| U17 | Complete a transaction | Receipt confirmed | Escrow release / COMPLETED | ☐ | ☐ | ☐ | G03 |
| U18 | Review another user | Completed order | Mutual review path available | ☐ | ☐ | ☐ | G03 |
| U19 | Report a problem | Live listing or chat | Report OPEN; dispute path works | ☐ | ☐ | ☐ | G04 |

## B. Admin paths (PRD §58)

| # | Step | Preconditions | Expected | Admin UI | Auto |
| --- | --- | --- | --- | --- | --- |
| A01 | View users | Admin login | User list + search | ☐ | ☐ |
| A02 | View listings | Admin login | Listings + filters | ☐ | ☐ |
| A03 | Moderate listings | UNDER_REVIEW item | Approve/reject/remove | ☐ | ☐ |
| A04 | Suspend accounts | Target user | Suspended; sessions invalidated | ☐ | ☐ |
| A05 | Review reports | OPEN report | Dismiss / action | ☐ | ☐ |
| A06 | Review transactions | Orders exist | Payment trace visible | ☐ | ☐ |
| A07 | Review disputes | Open dispute | Resolve → refund/release | ☐ | G04 |
| A08 | View basic analytics | KPIs seeded | Dashboard KPIs render | ☐ | ☐ |

## Sign-off

| Role | Name | Date | Result |
| --- | --- | --- | --- |
| QA Lead | | | ☐ 100% pass |
| Product Owner | | | ☐ Accepted |

**Known gaps at RC:** Expo push is mock-only; full Maestro CI requires device farm (stubs committed). Staging k6 p95 re-validation still required (`docs/PERF.md`).
