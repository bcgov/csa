# CSA Backend

NestJS API for Child Special Allowance — contacts, batches, CRA file exchange, and ICM/MIS sync jobs.

## Tech stack

Node.js 24 · NestJS 11 · TypeScript · Prisma 7 · PostgreSQL 16 (PostGIS) · Vitest

## Source layout (`src/`)

| Folder | Role |
|--------|------|
| **api** | REST layer — contacts, batches, jobs (UI triggers), weekly CRA files, admin, audit trail |
| **cra** | CRA outbound send, inbound RSP/WKL poll and processing, file transfer adapters |
| **sync** | ICM/MIS ingest, staging tables, eligibility rules, ICM sync-back |
| **jobs** | Job registry, handlers, CLI entrypoints (`npm run job:*`) |
| **common** | Auth, state machines, Prisma, logging, shared utils |
| **config** | Env-based config (`DEPLOY_ENV`, CRA, sync, database) |

Local dev (`DEPLOY_ENV=local`): ICM/MIS/CRA use `.local/storage/` instead of real APIs or S3.

## Setup

From **repo root** (recommended):

```bash
make env          # copy .env files (first time)
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
make db           # Postgres, migrations, seed
make backend      # http://localhost:3000
```

Or from **`backend/`** only:

```bash
nvm use
npm install
cp .env.example .env    # DEPLOY_ENV=local, POSTGRES_PASSWORD=default
make db                 # from repo root
npm run start:dev
```

Swagger: http://localhost:3000/api

## Local data baseline

After `make db`:

- **32 contacts** in CSA + staging (baseline ingest simulated Feb 2026)
- **10 more** after `make data-fetch` + `make run-eligibility` (42 total)
- **Batches** — create in the UI (not seeded)

## CRA mock workflow (local)

After sending a batch to CRA from the UI:

```bash
make generate-cra-response    # mock RSP → .local/storage/cra-mock/inbound/
make poll-cra-response
make generate-cra-wkl         # mock WKL
make poll-cra-response        # contacts → In Pay
```

Optional: `RESPONSE_OUTCOME=mixed` / `WKL_OUTCOME=mixed` for per-record outcomes.

Re-running poll after regenerating files requires a fresh seed or clearing inbound `transfer_files` rows.

## Testing

```bash
npm test
npm run test:cov
```

## Mock API

When `DEPLOY_ENV=local`, `/api/mock` serves JSON fixtures from `src/api/mock/data/`.
