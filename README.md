# ReWorth

Lagos-first consumer recommerce marketplace — **buy · sell · swap · give away**.

> *Lagos, your unused things are worth something.*

**Release:** [`v0.9.0-rc`](CHANGELOG.md) — see [`docs/MVP_STATUS.md`](docs/MVP_STATUS.md).

## Docs

| File | Purpose |
| --- | --- |
| [`PRD.md`](PRD.md) | Product requirements |
| [`AGENTS.md`](AGENTS.md) | Living engineering context |
| [`docs/PHASE_STATUS.md`](docs/PHASE_STATUS.md) | Resume / current phase |
| [`docs/UAT.md`](docs/UAT.md) | §58 acceptance checklist |
| [`docs/DEMO.md`](docs/DEMO.md) | 10-minute demo script |
| [`docs/LAUNCH.md`](docs/LAUNCH.md) | Launch checklist |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | Incident playbooks |
| [`docs/API.md`](docs/API.md) | REST `/api/v1` |
| [`CHANGELOG.md`](CHANGELOG.md) | Release notes |

## 10-minute local run

Prerequisites: **Node 20+**, **pnpm 9**, **Docker Desktop**.

```bash
# 1. Env
cp .env.example .env

# 2. Install
pnpm install

# 3. Infra
docker compose -f infra/docker-compose.yml up -d

# 4. Migrate + seed (loads monorepo-root .env for Prisma)
pnpm db:deploy
pnpm db:seed
pnpm seed:staging
# Fast demos only: SEED_STAGING_SKIP_HEAVY=1 pnpm seed:staging

# 5. Dev
pnpm dev
```

| Surface | URL |
| --- | --- |
| Web | http://localhost:3000 |
| API | http://localhost:3001/api/v1/healthz |
| Admin | http://localhost:3002 |

**Demo login:** Ori `ori@demo.reworth.ng` / `DemoOri!2026` — walkthrough in [`docs/DEMO.md`](docs/DEMO.md).

Media uses **adobe/s3mock** locally (`STORAGE_DRIVER=s3` → `http://localhost:9000/reworth-media/...`). The API talks to it with `S3StorageAdapter`. The same client talks to AWS S3 when `S3_ENDPOINT` changes.

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis s3mock
```

Fallback: `STORAGE_DRIVER=local` serves files from API disk at `/api/v1/media/files`.

For Cloudinary-backed media (web + mobile), set `STORAGE_DRIVER=cloudinary` and provide
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` to the
API service only. Clients upload via `/api/v1/media/direct` (listings) or
`/api/v1/media/store` (avatars, room-scan, worth); the API writes to Cloudinary and
returns `res.cloudinary.com` URLs (including sized `w_640` / webp transforms).

```bash
# Golden-path e2e (skips if API down)
pnpm exec playwright install chromium
pnpm test:e2e
```

## Stack

Expo · Next.js 15 · NestJS · PostgreSQL/Prisma · Redis/BullMQ · adobe/s3mock · OpenSearch · Paystack · OpenAI — see ADR-001 / ADR-010.

## License

Proprietary — all rights reserved.
