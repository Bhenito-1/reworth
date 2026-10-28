# Privacy — ReWorth (PRD §45 / NDPR summary)

> **Not legal advice.** Counsel review required before public launch and any NDPR filings.

## Principles

- Collect only data needed to operate buy · sell · chat · escrow · logistics in Lagos communities
- Users can **access**, **correct**, **export**, and **request deletion** (subject to lawful retention)
- Consent for marketing / email is recorded and changeable
- Exact addresses are never exposed in browse/search payloads
- Identity documents: store provider references / hashes only — never raw NIN/BVN in logs or public UI

## Data subject rights (product)

| Right | Endpoint / UI | Behaviour |
| --- | --- | --- |
| Access / export | `GET /me/export` · Web `/settings/privacy` · Mobile Privacy settings | JSON package: profile, addresses, listings summary, order ids, devices, consents — **no** password hashes or refresh tokens |
| Correction | `PATCH /me` | Profile fields |
| Deletion | `POST /me/delete-request` | Status → DELETED; phone/email pseudonymised; profile scrubbed; sessions revoked; **orders/payments retained** with PII stripped where applicable (retention for disputes / finance) |
| Consent | `GET/PUT /me/consents` | Channels: `MARKETING`, `EMAIL` |

## Retention (product policy — confirm with counsel)

| Data | Retention intent |
| --- | --- |
| Active account PII | Until deletion request + processing |
| Orders / payments / escrow ledger | Retain for finance, tax, dispute windows; buyer/seller display names may be pseudonymised after delete |
| Chat messages | Soft-retain for scam investigation window; scrub on hard purge job (Phase 10+) |
| Audit logs | Retain for security/ops; actor ids may remain |
| Risk / moderation decisions | Retain for model/ops integrity |

## NDPR-oriented summary (informal)

Nigeria Data Protection Regulation expectations that ReWorth aims to meet in product design:

1. **Lawful basis** — contract performance (marketplace) + consent (marketing email)
2. **Purpose limitation** — recommerce transactions, trust & safety, support
3. **Data minimisation** — community-level location in discovery; private address only post-intent
4. **Security** — see `docs/SECURITY.md`
5. **Rights** — export / correct / delete flows above
6. **Processors** — payments (Paystack), identity vendor, object storage, email provider — DPAs required before prod

## Contact (placeholder)

Privacy requests: `privacy@reworth.ng` (configure before launch).
