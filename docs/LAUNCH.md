# Launch checklist — `v0.9.0-rc` → production

> Ops + DevOps. Do **not** paste live secrets into this file — use the secret manager.

## A. Payments (PSP)

| Item | Owner | Status |
| --- | --- | --- |
| Switch `PAYMENTS_PROVIDER=paystack` + live keys | Payments Eng | ☐ |
| Webhook URL HTTPS + HMAC secret rotated | DevOps | ☐ |
| Runbook: test→live switch + rollback to mock | Ops | ☐ see RUNBOOK #1 |
| Escrow release / refund dry-run on staging | Payments Eng | ☐ |

## B. Email

| Item | Owner | Status |
| --- | --- | --- |
| Email provider live credentials (or mock for staging) | DevOps | ☐ |
| Transactional templates approved | Product | ☐ |

## C. Push (FCM / APNs)

| Item | Owner | Status |
| --- | --- | --- |
| FCM server key / APNs key in secret store | Mobile | ☐ |
| Replace mock push adapter in prod | Mobile | ☐ |
| Quiet-hours respected | Backend | ☐ |

## D. Edge / CDN / TLS

| Item | Owner | Status |
| --- | --- | --- |
| Domain + TLS certs (web, admin, API, CDN) | DevOps | ☐ |
| S3 CDN public URL (adobe/s3mock locally) | DevOps | ☐ |
| CORS allowlist = production origins only | Backend | ☐ |

## E. Traffic & flags

| Item | Owner | Status |
| --- | --- | --- |
| Rate limits tuned (auth/search/upload) | Security | ☐ |
| `DISABLE_THROTTLE` unset in prod | DevOps | ☐ |
| Feature-flag audit (swap/give-away off until v1.0) | PO | ☐ |

## F. Ops readiness

| Item | Owner | Status |
| --- | --- | --- |
| On-call rota + escalation | Ops | ☐ |
| Status page URL | DevOps | ☐ |
| Backup + restore drill executed & timed | DevOps | ☐ record below |
| Pen-test slot booked | Security | ☐ |
| NDPR / privacy counsel review slot | Legal | ☐ |
| Analytics dashboards live (§36 KPIs) vs staging | Data | ☐ |

### Backup restore drill log

| Date | Environment | RPO/RTO measured | Operator | Pass? |
| --- | --- | --- | --- | --- |
| | staging | | | ☐ |

## G. Store / web install

| Item | Owner | Status |
| --- | --- | --- |
| Simulator screenshots (iOS + Android) | Mobile | ☐ |
| Store descriptions + keywords | Marketing | ☐ |
| Tagline: *Lagos, your unused things are worth something.* | Brand | ☐ |
| Web PWA installability (manifest + icons) | Web | ☐ / deferred if gap |

## External sign-offs still required

1. External penetration test sign-off  
2. NDPR / privacy counsel review  
3. PSP merchant / licensing confirmation  
4. App Store + Play Store review approval  
5. Staging k6 p95 &lt; 500ms at 500 VUs (`docs/PERF.md`)
