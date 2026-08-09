# CSA Frontend

React UI for caseworkers — contact search, batches, job monitoring, weekly CRA files.

## Tech stack

React 19 · Vite · TypeScript · TanStack Router · MUI · Axios · Keycloak (skipped locally)

## Source layout (`src/`)

| Folder | Role |
|--------|------|
| **routes** | TanStack Router pages |
| **components** | Shared UI |
| **service** | API clients (proxied to backend) |
| **context** | Auth state |
| **config** | Keycloak + local dev bypass |

Local dev (`VITE_APP_ENV=LOCAL`): skips Keycloak; uses `local-dev-token` with backend `DEPLOY_ENV=local`.

## Setup

From **repo root** (recommended):

```bash
make env          # copy .env files (first time)
cd frontend && npm install && cd ..
make backend      # API on :3000 (separate terminal)
make frontend     # UI on http://localhost:5173
```

Or from **`frontend/`** only:

```bash
cp .env.example .env    # VITE_APP_ENV=LOCAL, BACKEND_URL=http://localhost:3000
npm install
npm run dev
```

Requires the backend running on port 3000. Vite proxies `/api` to `BACKEND_URL`.

## Testing

```bash
npm test
npm run test:cov
```
