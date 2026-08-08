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
make db       # Postgres, migrations, seed
make dev      # backend + frontend
```

Open **http://localhost:5173** (frontend). API: **http://localhost:3000/api**.

### Quick start (Windows)

PowerShell from the repo root:

```powershell
.\scripts\local-dev.ps1 env
.\scripts\local-dev.ps1 db
.\scripts\local-dev.ps1 dev
```

Requires Docker Desktop and Node.js 24. See [frontend/README.md](frontend/README.md) and [backend/README.md](backend/README.md) for details.

### Environment summary

| App | Variable | Local value | Purpose |
|-----|----------|-------------|---------|
| Backend | `DEPLOY_ENV` | `local` | Skip SSO/JWT; accept local dev token |
| Backend | `NODE_ENV` | `development` | Node runtime mode |
| Frontend | `VITE_APP_ENV` | `LOCAL` | Toolbar + skip Keycloak |
| Frontend | `PORT` | `5173` | Vite dev server port |
| Frontend | `BACKEND_URL` | `http://localhost:3000` | Vite proxy target |

Copy `backend/.env.example` → `backend/.env` and `frontend/.env.example` → `frontend/.env` before first run (`make env` or `local-dev.ps1 env`).

### More detail

- [backend/README.md](backend/README.md) — API setup, env vars, testing
- [frontend/README.md](frontend/README.md) — UI setup, auth, Vite proxy
