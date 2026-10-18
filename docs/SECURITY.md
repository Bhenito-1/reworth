# Security — ReWorth (PRD §44)

> Living control map for Phase 9 (`v0.9-risk-security`). Not a substitute for an external penetration test.

## Control matrix

| Control (PRD §44) | Status | Where / notes |
| --- | --- | --- |
| TLS in transit | Mitigated | Terminated at reverse proxy / platform; local HTTP for compose |
| Encryption at rest | Deferred | Postgres/S3 volume encryption = infra responsibility at launch |
| Argon2id passwords | Implemented | `apps/api/src/auth/crypto.util.ts` |
| Auth throttle | Implemented | `@Throttle` auth bucket on login/register (SMS OTP removed, ADR-010) |
| JWT access + refresh rotation | Implemented | `auth.service.ts`; reuse detection revokes family |
| Admin TOTP 2FA | Implemented | Setup available; org policy may enforce later |
| RBAC (7 admin roles) | Implemented | `docs/RBAC.md`, `admin-roles.ts`, `AdminOnlyGuard` |
| Audit logging | Implemented | `AuditService` on admin + sensitive user actions |
| Secure uploads | Implemented | MIME sniff (`file-type`), 10MB cap, malware scan adapter (mock) |
| Global + per-route rate limits | Implemented | Throttler 120/min default; auth 20, search 60, upload 30 |
| CSP + security headers | Implemented | `helmet` in `apps/api/src/main.ts`; Next headers below |
| Input validation | Implemented | `ValidationPipe` whitelist + forbid; Zod helpers `zod-boundary.ts` |
| Secrets hygiene | Implemented | `.env.example` placeholders only; CI must not print secrets |
| Dependency audit gate | Implemented | `pnpm audit --prod --audit-level=critical` in CI (critical blockers; moderate findings tracked pre-launch) |
| User token ≠ admin API | Implemented | `AdminOnlyGuard` + tests |
| Device session visibility | Implemented | `GET/DELETE /me/devices`, logout-all |
| Risk / fraud signals | Implemented | Risk engine + `RiskEvent` / `RiskAssessment` |
| Content moderation | Implemented | Keywords + mock image mod + appeals |

## OWASP Top 10 self-review

| # | Risk | ReWorth posture |
| --- | --- | --- |
| A01 Broken access control | JWT guards, ownership checks, admin RBAC, IDOR-sensitive listing/order paths reviewed |
| A02 Cryptographic failures | Argon2id; JWT secrets via env; no raw NIN/BVN stored |
| A03 Injection | Prisma parameterized queries; ValidationPipe; no raw SQL in app code |
| A04 Insecure design | Escrow-shaped payments (ADR-002); risk scoring on publish |
| A05 Security misconfiguration | Helmet headers; CORS allowlist; powered-by hidden |
| A06 Vulnerable components | `pnpm audit` CI gate |
| A07 Auth failures | Auth throttle, refresh reuse detection, suspended users rejected |
| A08 Data integrity | Paystack webhook HMAC; audit logs for admin mutations |
| A09 Logging failures | Pino request logs; audit trail; avoid logging secrets/PII gov IDs |
| A10 SSRF | Presigned uploads to S3 (adobe/s3mock locally); no user-controlled server-side fetch of arbitrary URLs |

## Pen-test checklist (external)

- [ ] Auth: login brute-force, refresh reuse, JWT alg confusion
- [ ] IDOR: listings, chats, orders, disputes, `/me/export`
- [ ] Admin: role bypass, TOTP skip, CSRF on cookie (if cookies added)
- [ ] Upload: polyglot files, oversized, SVG XSS, malware EICAR
- [ ] Rate limit bypass via IP spoofing / distributed clients
- [ ] Payment webhook forgery / replay
- [ ] Chat PII leak + off-platform solicitation evasion
- [ ] Risk/moderation bypass (price/title obfuscation)
- [ ] Privacy: export completeness, delete residual PII
- [ ] Infra: TLS, secrets in CI logs, open Redis/s3mock ports

## Secrets audit

| Location | Rule |
| --- | --- |
| Git | No `.env`, keys, or tokens — `.env.example` only |
| Runtime | Env-per-environment (local / staging / prod) |
| CI | Dummy `DATABASE_URL` for Prisma generate only |

## Known deferred

- Enforce TOTP for every admin login (policy)
- httpOnly cookie session transport for web
- Real malware + NSFW vendor adapters (mocks in place)
- Production WAF / bot management
