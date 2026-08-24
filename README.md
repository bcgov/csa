# Child Special Allowance

Federal benefit provided by the Canada Revenue Agency (CRA) for eligible children in ministry care. Hosted on OpenShift.

Read [CONTRIBUTING.md](docs/CONTRIBUTING.md) for info on collaborating in this repo.

## Local development

### Prerequisites

- **Node.js 24** — use `nvm use` in `backend/` (see `backend/.nvmrc`)
- **Docker** — [Colima](https://github.com/abiosoft/colima) (macOS) or Docker Desktop (Windows/macOS)

### Quick start (macOS / Linux)

From the repo root:

```bash
make env      # copy .env.example files (first time only)
make install  # npm install in backend + frontend
make db       # Postgres, migrations, fixtures, seed
make dev      # backend + frontend
```

Open **http://localhost:5173** (frontend). API: **http://localhost:3000/api**.

With `DEPLOY_ENV=local`, ICM/MIS/CRA integrations read from `.local/storage/` (populated during `make db` seed). No MinIO or real ICM required for laptop dev.

**Local pipeline test (after `make db`):**

1. App starts with **32 contacts** + matching staging baseline
2. `make data-fetch` → loads **10 new** ICM/MIS records
3. `make run-eligibility` → **42 contacts** total
4. Create a batch in the UI, send to CRA, then use `make generate-cra-response`, `make poll-cra-response`, `make generate-cra-wkl`, `make poll-cra-response` for the full flow

See [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for module layout and setup detail.

### Quick start (Windows)

Use WSL or Git Bash with the same `make` targets above, or run steps manually — see [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).

### Environment summary

| App | Variable | Local value | Purpose |
|-----|----------|-------------|---------|
| Backend | `DEPLOY_ENV` | `local` | Skip SSO/JWT; local ICM/MIS/CRA file integrations |
| Backend | `FILE_STORAGE_PATH` | `../.local/storage` | CRA + ICM/MIS fixture directory |
| Backend | `NODE_ENV` | `development` | Node runtime mode |
| Frontend | `VITE_APP_ENV` | `LOCAL` | Toolbar + skip Keycloak |
| Frontend | `PORT` | `5173` | Vite dev server port |
| Frontend | `BACKEND_URL` | `http://localhost:3000` | Vite proxy target |

Copy `backend/.env.example` → `backend/.env` and `frontend/.env.example` → `frontend/.env` before first run (`make env`).

### More detail

- [backend/README.md](backend/README.md) — API setup, env vars, testing
- [frontend/README.md](frontend/README.md) — UI setup, auth, Vite proxy
