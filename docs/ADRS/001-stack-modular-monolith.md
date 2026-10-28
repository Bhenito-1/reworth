# ADR-001: Modular monolith stack

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** Solution Architect, Backend Lead, DevOps (Prompt 1 / Phase 0)

## Context

PRD §40 lists acceptable options (e.g. React Native *or* Flutter; NestJS *or* FastAPI; Elasticsearch *or* OpenSearch). The team needs a single, non-negotiable MVP stack to avoid thrash.

## Decision

Ship a **Turborepo + pnpm modular monolith**:

| Layer | Choice |
| --- | --- |
| API | NestJS, REST `/api/v1`, logical modules per PRD §41 (not microservices) |
| Web / Admin | Next.js 15 App Router + TypeScript + Tailwind |
| Mobile | React Native + Expo (one codebase → iOS + Android) |
| DB | PostgreSQL 16 + Prisma |
| Cache / jobs | Redis + BullMQ |
| Media | S3-compatible object storage (adobe/s3mock locally, AWS S3 in prod) |
| Search | OpenSearch, with **Postgres full-text fallback** for lightweight/dev |
| Auth | JWT (short access + rotating refresh), email/password, Google/Apple OAuth |
| Payments | Paystack adapter + mock PSP |
| AI | Multimodal LLM adapter (OpenAI GPT-4o default) + rule-based mock |
| Locale | NGN, en-NG, Africa/Lagos (WAT) |

Premature microservice splits are explicitly out of scope (PRD §41).

## Consequences

- Faster local DX and simpler CI for MVP.
- Module boundaries must stay clean so extraction is possible later.
- Stack substitutions require a **new ADR** — do not silently swap Flutter/FastAPI/etc.

## References

- PRD §§40–43, §46–48
- `CURSOR-PROMPT.md` § Fixed stack
- `AGENTS.md` baked-in stack table
