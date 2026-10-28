# NDPR checklist (stub)

> Nigeria Data Protection Regulation readiness for ReWorth consumer + B2B surfaces. Legal review required before store submit / city marketing.

## In-product (engineering)

- [x] Privacy settings + account deletion path (mobile `PrivacySettings`, web settings)
- [x] Notification preference categories
- [ ] Consent copy for donate-if-unsold / circular hand-off (seller-facing)
- [ ] Corporate DPA record required before APPROVED (enforced in apply flow)
- [ ] Partner webhook payloads — no public PII in receipts (circular)

## Ops / legal

- [ ] Appoint NDPR Data Protection Officer contact
- [ ] Privacy policy + Terms URLs in App Store / Play Console
- [ ] Processor agreements: Paystack, S3 (adobe/s3mock locally), email provider, OpenAI (if enabled)
- [ ] Retention schedule for chat, device push tokens
- [ ] Breach notification playbook (link from `docs/RUNBOOK.md`)

## Evidence pack (pre-launch)

- [ ] Data-map: User, Listing, Order, Chat, Partner webhook, Circular hand-off
- [ ] Access control: admin RBAC (`docs/RBAC.md`)
- [ ] Staging pen-test notes

Owner: Compliance + Backend Lead. Update after each city launch.
