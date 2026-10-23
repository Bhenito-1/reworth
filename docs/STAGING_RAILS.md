# Staging rails — Paystack + Termii (+ push) + delivery partner

> DevOps / Payments / Mobile / Logistics. **Never commit live secrets.** Put them in the staging secret manager / host env only.  
> Companion: [`LAUNCH.md`](LAUNCH.md) · [`RUNBOOK.md`](RUNBOOK.md) · [`SPRINT_DELIVERY_JOURNEY.md`](SPRINT_DELIVERY_JOURNEY.md) · [`.env.example`](../.env.example)

**Goal:** Flip staging from mock OTP/payments/push/delivery to production-shaped adapters so Nigeria go-live can be dry-run before store submit.

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

## 4. Delivery partner (D5)

> Customer UX (D1–D4) works on `DELIVERY_PROVIDER=mock`. Partner rail is optional until a courier contract is signed.

### Env

```bash
DELIVERY_PROVIDER=partner
DELIVERY_PARTNER_MODE=dry-run          # staging without live courier keys
# DELIVERY_PARTNER_MODE=live
# DELIVERY_PARTNER_API_URL=https://…
# DELIVERY_PARTNER_API_KEY=…
DELIVERY_WEBHOOK_SECRET=…              # HMAC-SHA256 → header x-reworth-delivery-signature
```

### Webhook

1. Partner dashboard → webhook URL: `https://<staging-api-host>/api/v1/webhooks/delivery`  
2. Events map to Prisma `DeliveryShipmentStatus`: `ASSIGNED` · `PICKED_UP` · `IN_TRANSIT` · `OUT_FOR_DELIVERY` · `DELIVERED` · `FAILED`  
3. Body: `{ orderId? , providerRef? , status , failureReason? }` (one of orderId / providerRef required)  
4. Sign raw JSON with `DELIVERY_WEBHOOK_SECRET` (sha256 hex)

### Dry-run checklist

| Step | Pass? |
| --- | --- |
| `DELIVERY_PARTNER_MODE=dry-run` — checkout creates `partner_dry_*` ref | ☐ |
| Manual/demo status advance still updates buyer/seller timeline | ☐ |
| Webhook with valid signature → status advance | ☐ |
| Bad signature → 401 | ☐ |
| Rollback: `DELIVERY_PROVIDER=mock` | ☐ |

## 5. Suggested cutover order

1. Termii on staging (auth spine)  
2. Paystack test keys + webhook  
3. Expo push  
4. Delivery partner dry-run → live when contracted  
5. One golden path: OTP → sell → offer → pay → delivery / meetup → confirm  
6. Maestro `00_demo_60s` on a device build pointed at staging  
7. k6 mid-gate then staging 500 VU (`docs/PERF.md`) with throttle policy agreed  

## 6. What stays mock until prod counsel

- `IDENTITY_PROVIDER=mock` until NDPR DPA + live vendor  
- Live `sk_live` Paystack only after merchant / licensing sign-off (`LAUNCH.md` external sign-offs)  
- `DELIVERY_PROVIDER=mock` until courier commercial + NDPR DPA  

## 7. Record

| Date | Env | Operator | Paystack | Termii | Push | Delivery | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | staging | | ☐ | ☐ | ☐ | ☐ | |

After first green row, update `docs/PHASE_STATUS.md` resume and tick `LAUNCH.md` §A–C staging rows.
