# CSA Backend

NestJS Backend for the Child Special Allowance application.

## Tech Stack

- **Runtime:** Node.js 24
- **Framework:** NestJS 11
- **Language:** TypeScript 5
- **ORM:** Prisma 7
- **Database:** PostgreSQL 16 with PostGIS
- **Testing:** Vitest + Supertest
- **Build:** SWC (via NestJS CLI)

## Prerequisites
- Node.js 24+ (use `nvm use` to load from `.nvmrc`)
- [Colima](https://github.com/abiosoft/colima) or Docker Desktop for PostgreSQL

## Setup

1. **Start Colima and the database** (from repo root):
   ```bash
   make db
   ```
   Or manually:
   ```bash
   colima start
   docker compose up -d database migrations
   ```
2. **Install dependencies:** `npm install`
3. **Configure environment:** `cp .env.example .env`
   - `DEPLOY_ENV=local` skips SSO/JWT and uses `.local/storage` for ICM/MIS/CRA integrations
   - `POSTGRES_PASSWORD=default` must match `docker-compose.yml`
4. **Generate Prisma client:** `npx prisma generate`
5. **Seed the database:** `make seed` (included in `make db`) — loads baseline staging via ingest, 5 linked contacts, batches, and incremental fixtures for the next data fetch
6. **Start the development server:** `npm run start:dev`

After seed, run **Data Fetch** then **Run Eligibility** from the UI (or `npm run job:data-ingestion` / `npm run job:run-eligibility`) to insert 5 new test contacts.

Start the frontend separately from `frontend/` with `VITE_APP_ENV=LOCAL` in `frontend/.env`.

### API Documentation
Swagger documentation is available at http://localhost:3000/api when the server is running.

## Testing
**Run unit tests:** `npm test`
**Run tests with coverage:** `npm run test:cov`

## Mock API
When `ENABLE_MOCK_API=true`, a mock API is available at `/mock`.
- `GET /mock` - List available mock files
- `GET /mock/:filename` - Get mock data from a JSON file
Add JSON files to `src/api/mock/data/` to create new mock endpoints.
