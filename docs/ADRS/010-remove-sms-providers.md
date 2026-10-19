# ADR-010: Remove SMS providers

- **Status:** Accepted
- **Date:** 2026-09-29
- **Deciders:** Product / Backend (consumer auth simplification)

## Context

Account creation and login no longer use phone OTP. Keeping Termii/Twilio adapters and `/auth/otp/*` increased surface area without product use.

## Decision

1. Remove SMS provider interface and adapters (`mock`, Termii).
2. Remove consumer phone OTP request/verify API routes and `OtpChallenge` table.
3. Auth is email/password (+ existing OAuth paths). Admin TOTP (authenticator app) is unchanged.
4. Region config no longer carries `sms` flags.
5. Consent channels are `EMAIL` and `MARKETING` only (`SMS` enum value dropped).

## Consequences

- No SMS credentials or `SMS_PROVIDER` in env.
- L1 phone verification via OTP is deferred; email registration remains the consumer path.

## References

- ADR-001 (stack)
- Prior consumer onboarding: email-only
