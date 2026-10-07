# MVP scope status — PRD §50 (`v0.9.0-rc`)

| §50 item | Status | Evidence |
| --- | --- | --- |
| User registration | **Shipped** | Email/password + OAuth; UAT U01; `apps/api/src/auth` |
| Phone verification | **Deferred** | SMS OTP removed (ADR-010); L1 phone verify later |
| Profiles | **Shipped** | `GET/PATCH /me`; web account |
| Basic identity verification | **Shipped** | L3 + mock provider; admin verification queue |
| Create listing | **Shipped** | Listings API + sell UI; UAT U03; e2e G01 |
| Photo upload | **Shipped** | Presign + media pipeline; MIME/10MB |
| AI listing assistance | **Shipped** | Assist mock/OpenAI; UAT U04 |
| Categories | **Shipped** | Seeded taxonomy; `/categories` |
| Search | **Shipped** | Keyword + NL; e2e G02 |
| Location filters | **Shipped** | Community + radius; home/search |
| Product pages | **Shipped** | Web/mobile PDP |
| Favourite | **Shipped** | Favourites API; UAT U09 |
| Chat | **Shipped** | Conversations + WS; e2e G02 |
| Offers | **Shipped** | Offer state machine; e2e G02 |
| Buy Now | **Shipped** | Orders from listing/intent |
| Basic protected payment architecture | **Shipped** | Escrow-shaped Paystack/mock; ADR-002 |
| Pickup | **Shipped** | Meet points + fulfilment |
| Delivery integration | **Shipped** | Mock delivery provider; `demo:delivery` |
| Notifications | **Shipped-with-gap** | In-app + mock push (FCM/APNs deferred) |
| Reviews | **Shipped** | Mutual reviews + trust score |
| Reporting | **Shipped** | Listing/user reports + admin |
| Admin dashboard | **Shipped** | `apps/admin` KPIs |
| Basic moderation | **Shipped** | Phase 9 pipeline + admin queues |
| Transaction history | **Shipped** | Orders list + admin payment trace |

## Top 5 risks to launch

1. **Staging load not proven** — local k6 cannot certify p95 &lt; 500ms at 500 VUs (`docs/PERF.md`).  
2. **Push is mock** — buyers may miss time-critical alerts without FCM/APNs.  
3. **PSP go-live** — webhook/HMAC misconfig blocks escrow.  
4. **Email deliverability** — register welcome mail + transactional alerts.  
5. **External pen-test + NDPR counsel unfinished** — legal/security gate.

## External sign-offs still required

- Penetration test sign-off  
- NDPR / privacy counsel review  
- PSP merchant licensing / live key approval  
- App Store & Play Store review  
- Staging performance sign-off (k6)
