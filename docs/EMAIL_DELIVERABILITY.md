# Email deliverability (Resend)

Inbox placement is mostly **domain authentication**, not HTML polish.

## Required in Resend

1. Add and **verify** the exact domain used in `EMAIL_FROM` (e.g. `agriflowafrica.com`).
2. Publish Resend’s **SPF**, **DKIM**, and **DMARC** DNS records (status must be Verified).
3. Send only from that verified domain — prefer `hello@` / `accounts@`, **not** `noreply@` (no-reply is a known spam signal).
4. Set `EMAIL_REPLY_TO` to a **monitored** address on the same domain.
5. Set `EMAIL_APP_URL` to a **public https** origin (not `http://localhost:3000`). Localhost CTAs are omitted automatically.

## App env

```env
EMAIL_PROVIDER=resend
EMAIL_FROM=ReWorth <hello@your-verified-domain.com>
EMAIL_REPLY_TO=hello@your-verified-domain.com
EMAIL_APP_URL=https://app.your-domain.com
RESEND_API_KEY=re_...
```

## Template rules we enforce in code

- Matching plain-text + simple HTML (no hidden preheaders / heavy layout)
- No localhost links in CTAs
- Warns at boot if `EMAIL_FROM` / `EMAIL_REPLY_TO` use no-reply
