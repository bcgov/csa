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
- PostgreSQL database running (via Docker or local)

## Setup

1. **Install dependencies:** `npm install`
2. **Configure environment:** `cp .env.example .env` 
3. **Generate Prisma client:** `npx prisma generate`
4. **Start the database (if not already running):**
   from root directory: `docker compose up -d database migrations`
5. **Seed the database(optional):** `npx prisma db seed`
6. **Start the development server:** `npm run start:dev`

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
