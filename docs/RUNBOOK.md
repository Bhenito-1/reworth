# Runbook — top incidents (`v0.9.0-rc`)

Detection → mitigation → rollback → comms. Placeholders only — wire real channels before launch.

---

### 1. PSP (Paystack) down / webhook failures
- **Detect:** Payment error rate ↑; `PAYSTACK_WEBHOOK_FAILED` logs; unpaid orders stuck INITIATED  
- **Mitigate:** Enable mock PSP for browse-only? Prefer: queue retries; pause new checkouts via flag `payments_enabled=false`  
- **Rollback:** Revert to last known good Paystack keys; replay webhooks from Paystack dashboard  
- **Comms:** “Payments temporarily unavailable — listings still browsable.”

### 2. Auth / session degradation
- **Detect:** Login/register error rate ↑; refresh reuse detections spike  
- **Mitigate:** Check JWT secrets/TTL; clear bad refresh families; confirm email provider for register welcome mail  
- **Rollback:** Roll back API auth deploy; keep email auth  
- **Comms:** “Sign-in temporarily slow — try again shortly.”

### 3. Search index lag / OpenSearch down
- **Detect:** Search p95 ↑; empty results vs Postgres count  
- **Mitigate:** Postgres FTS fallback already in stack — confirm provider; rebuild index job  
- **Rollback:** Force `SEARCH_PROVIDER=postgres`  
- **Comms:** Soft — users see slower but correct results.

### 4. Payment webhook backlog
- **Detect:** BullMQ depth ↑; orders PAID without capture event  
- **Mitigate:** Scale workers; manual capture from admin order detail  
- **Rollback:** N/A — drain queue  
- **Comms:** Internal only unless buyer-facing delay &gt; 15m.

### 5. Image / media queue backlog
- **Detect:** ListingImage stuck PENDING; BullMQ media queue  
- **Mitigate:** `BULLMQ_INLINE=true` emergency; scale workers; `MEDIA_PIPELINE=mock` last resort  
- **Rollback:** Restore sharp pipeline  
- **Comms:** “Photo processing delayed.”

### 6. DB primary failover
- **Detect:** `readyz` fail; Prisma connection errors  
- **Mitigate:** Promote replica per cloud runbook; point `DATABASE_URL`  
- **Rollback:** Fail back after sync  
- **Comms:** Status page — “Degraded performance.”

### 7. Push notification failures
- **Detect:** Mock-only in MVP; FCM/APNs error rate when live  
- **Mitigate:** Fall back to email/in-app for critical alerts; disable non-critical push  
- **Rollback:** Previous FCM key  
- **Comms:** In-app bell still works.

### 8. Redis / cache outage
- **Detect:** Home cache errors (memory fallback should keep serving)  
- **Mitigate:** Confirm memory fallback; disable Redis-dependent jobs  
- **Rollback:** Restore Redis URL  
- **Comms:** None unless home latency spikes.

### 9. Auth / JWT spike (refresh reuse)
- **Detect:** Mass session revoke; security alerts  
- **Mitigate:** Force logout-all for affected users; rotate JWT secret (invalidate all)  
- **Rollback:** Keep new secret  
- **Comms:** “Please sign in again.”

### 10. Fraud / scam wave
- **Detect:** RiskEvent volume ↑; chat OFF_PLATFORM hits  
- **Mitigate:** Lower HIGH threshold temporarily; force under_review; suspend ring  
- **Rollback:** Restore thresholds  
- **Comms:** Safety centre banner.

### 11. Dispute surge
- **Detect:** Open disputes KPI ↑  
- **Mitigate:** Staff admin queue; extend seller response window if needed  
- **Rollback:** N/A  
- **Comms:** “Our team is reviewing cases.”

### 12. CDN / media 404s
- **Detect:** Broken images on PDP  
- **Mitigate:** Check S3_PUBLIC_URL / CDN purge; s3mock or S3 bucket policy  
- **Rollback:** Prior CDN config  
- **Comms:** Soft.

### 13. Admin TOTP lockout
- **Detect:** Ops cannot login  
- **Mitigate:** Super Admin resets TOTP via DB runbook (break-glass); never disable AdminOnlyGuard  
- **Rollback:** N/A  
- **Comms:** Internal.

### 14. Rate-limit false positives
- **Detect:** 429 on legit mobile NAT  
- **Mitigate:** Raise search/auth limits; IP allowlist for offices  
- **Rollback:** Prior limits  
- **Comms:** Soft.

### 16. Swap / give-away leg failure
- **Detect:** Order DISPUTED with SWAP_LEG_FAILURE / SupportTicket; one leg FAILED|RETURNED  
- **Mitigate:** Follow ADR-003 — hold cash escrow; Ops confirms returns; full refund via dispute resolution; listings LIVE or REMOVED  
- **Rollback:** N/A  
- **Comms:** Both parties — “Your swap is paused while we help resolve the hand-over.”

---

## Comms template

```
[ReWorth status] We are investigating {incident}.
Impact: {impact}. Next update: {time WAT}.
Status: https://status.example (TBD)
```
