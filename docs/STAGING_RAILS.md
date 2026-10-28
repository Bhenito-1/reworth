# Staging rails — Paystack + Termii (+ push)

> DevOps / Payments / Mobile. **Never commit live secrets.** Put them in the staging secret manager / host env only.  
> Companion: [`LAUNCH.md`](LAUNCH.md) · [`RUNBOOK.md`](RUNBOOK.md) · [`.env.example`](../.env.example)

**Goal:** Flip staging from mock OTP/payments/push to production-shaped adapters so Nigeria go-live can be dry-run before store submit.

## 0. Preconditions

- [ ] Staging API URL HTTPS (e.g. `https://staging-api.reworth.ng/api/v1`)
- [ ] Staging web origin on CORS allowlist (`WEB_ORIGIN`)
- [ ] Postgres + Redis healthy; `pnpm --filter @reworth/api exec prisma migrate deploy`
- [ ] Seed or staging seed available for OTP/demo users
- [ ] `DISABLE_THROTTLE` **unset** on staging (except temporary k6 windows)

## 1. Paystack (escrow-shaped)

### Env (staging secret store)

```bash
PAYMENTS_PROVIDER=paystack
PAYSTACK_SECRET_KEY=sk_test_…          # use test keys on staging; live only on prod
PAYSTACK_PUBLIC_KEY=pk_test_…
PAYSTACK_WEBHOOK_SECRET=whsec_…        # from Paystack dashboard → Webhooks
```

### Webhook

1. Paystack Dashboard → Settings → Webhooks  
2. URL: `https://<staging-api-host>/api/v1/webhooks/paystack` (`PaymentsController` `@Post('webhooks/paystack')`)  
3. Copy signing secret → `PAYSTACK_WEBHOOK_SECRET`  
4. Enable events needed for charge success / refund (match adapter)

### Dry-run checklist

| Step | Pass? |
| --- | --- |
| Create funded order on staging | ☐ |
| Webhook received; order → FUNDED (or equivalent) | ☐ |
| Handover → buyer confirm → release | ☐ |
| Refund / dispute path once | ☐ |
| Rollback: set `PAYMENTS_PROVIDER=mock`, restart API | ☐ |

Incident playbook: `RUNBOOK.md` §1.

## 2. Termii (SMS + WhatsApp OTP)

### Env

```bash
SMS_PROVIDER=termii
WHATSAPP_PROVIDER=termii
TERMII_API_KEY=
TERMII_SENDER_ID=                    # approved sender
TERMII_WHATSAPP_DEVICE_ID=           # dashboard device / sender
TERMII_BASE_URL=https://api.ng.termii.com
```

### Dry-run checklist

| Step | Pass? |
| --- | --- |
| Request OTP to a real NG mobile | ☐ |
| SMS arrives &lt; 30s | ☐ |
| WhatsApp channel arrives (if enabled) | ☐ |
| Verify OTP → session issued | ☐ |
| Wallet balance alert configured on Termii | ☐ |
| Rollback: `SMS_PROVIDER=mock` `WHATSAPP_PROVIDER=mock` | ☐ |

Staging may still log `debugCode` when mock; with Termii live, **do not** expose OTP in API responses.

Incident playbook: `RUNBOOK.md` §2.

## 3. Push (Expo)

```bash
PUSH_PROVIDER=expo
ENABLE_PUSH=true
EXPO_ACCESS_TOKEN=                   # optional rate-limit token
```

| Step | Pass? |
| --- | --- |
| Device registers Expo push token | ☐ |
| Chat / offer / order push received in foreground + background | ☐ |
| Quiet hours respected | ☐ |
| Rollback: `PUSH_PROVIDER=mock` `ENABLE_PUSH=false` | ☐ |

## 4. Suggested cutover order

1. Termii on staging (auth spine)  
2. Paystack test keys + webhook  
3. Expo push  
4. One golden path: OTP → sell → offer → pay → meetup pin → complete  
5. Maestro `00_demo_60s` on a device build pointed at staging  
6. k6 mid-gate then staging 500 VU (`docs/PERF.md`) with throttle policy agreed  

## 5. What stays mock until prod counsel

- `IDENTITY_PROVIDER=mock` until NDPR DPA + live vendor  
- Live `sk_live` Paystack only after merchant / licensing sign-off (`LAUNCH.md` external sign-offs)

## 6. Record

| Date | Env | Operator | Paystack | Termii | Push | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| | staging | | ☐ | ☐ | ☐ | |

After first green row, update `docs/PHASE_STATUS.md` resume and tick `LAUNCH.md` §A–C staging rows.
