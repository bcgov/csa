# CSA Documentation

Documentation for the **Child Special Allowance (CSA)** application — a BC Gov system that manages CRA benefit eligibility for children in ministry care.

## Where to find documentation

| Location | Audience | Contents |
|----------|----------|----------|
| [Azure DevOps Wiki](https://dev.azure.com/BC-MCFD-Procurement/MCFD%20Transformation%20Development/_wiki/wikis/MCFD%20Transformation-Development.wiki/1293/CSA-Documentation) | Team, stakeholders | Primary wiki for architecture, business logic, and operations |
| [`local-context/wiki/`](../local-context/wiki/CSA-Documentation.md) | Developers | Source markdown for the ADO wiki (sync manually) |
| [`docs/decisions/`](decisions/) | Developers | Architecture Decision Records (ADRs) |
| [`docs/operations/`](operations/) | DevOps, platform | Production sizing, runbooks |
| [`documentation/`](../documentation/) | BA, UX, operations, developers | Functional design specs, production runbook, CRA file format, remediation guides |
| [`backend/README.md`](../backend/README.md) | Developers | Backend setup, testing, API docs |
| [`frontend/README.md`](../frontend/README.md) | Developers | Frontend setup and configuration |

## Architecture Decision Records

| # | Title | Status |
|---|-------|--------|
| [0001](decisions/0001-backend-framework.md) | Choose a Backend API Framework | accepted |
| [0002](decisions/0002-frontend-framework.md) | Choose a Frontend Framework | accepted |
| [0003](decisions/0003-single-docker-image-multiple-entrypoints.md) | Single Docker Image with Multiple Entrypoints | accepted |
| [0004](decisions/0004-openshift-cronjobs-no-in-app-scheduler.md) | OpenShift CronJobs Instead of an In-App Scheduler | accepted |
| [0005](decisions/0005-flyway-for-database-migrations.md) | Flyway for Database Migrations | accepted |
| [0006](decisions/0006-cra-s3-transfer-mode-entrust-deferral.md) | CRA File Exchange via S3 + Manual Operations | accepted |
| [0007](decisions/0007-icm-incremental-mis-full-reload.md) | ICM Incremental Sync vs. MIS Full Reload | accepted |
| [0008](decisions/0008-postgresql-copy-stdin-for-mis.md) | PostgreSQL COPY FROM STDIN for MIS CSV Ingestion | accepted |
| [0009](decisions/0009-transition-map-state-machines.md) | Transition-Map State Machines for the CSA Contact Lifecycle | accepted |
| [0010](decisions/0010-icm-sync-back-non-blocking.md) | ICM Sync-Back is Non-Blocking in the Daily Orchestrator | accepted |
| [0011](decisions/0011-sessionstorage-for-jwt-tokens.md) | sessionStorage for JWT Token Storage (Post Pen-Test) | accepted |
| [0012](decisions/0012-structured-logging-design.md) | Structured Logging Design | accepted |
| [0013](decisions/0013-decoupled-standalone-job-entrypoints.md) | Decoupled Standalone Job Entrypoints | accepted |

## Functional design

| Document | Description |
|----------|-------------|
| [Job Monitoring View (VW-02)](../documentation/job-runs-and-activity-log.md) | FDD — Job List, Job History, and Activities (APL-10/11/12) |
| [Job Monitoring — Implementation Plan](../documentation/job-monitoring-implementation-plan.md) | Developer plan: schema, API, instrumentation, UI |
| [Contact Merge](../documentation/contact-merge.md) | Proposal for ICM duplicate contact consolidation |

## Operations

| Document | Description |
|----------|-------------|
| [Production Runbook](../documentation/prod-runbook.md) | Promotion checklist, backups, rollback |
| [Prod Resource Sizing Plan](operations/prod-resource-sizing-plan.md) | Backend memory/CPU sizing for `dec59b-prod` |
| [PVC Backup Image](../backup/README.md) | Backup utility for the `csa-backend` PVC |

## Local development

```bash
# From repo root — start database and migrations
docker compose up -d database migrations

# Backend (from backend/)
nvm use && npm install && npx prisma generate && npm run start:dev

# Frontend (from frontend/)
nvm use && npm install && npm run dev
```

See [backend/README.md](../backend/README.md) and [frontend/README.md](../frontend/README.md) for full setup instructions.

## Deployment

CSA runs on **OpenShift** (namespace `dec59b-*`) via **GitOps**:

- **Images:** `ghcr.io/bcgov/csa-backend`, `csa-frontend`, `csa-flyway`, `csa-backup`
- **Manifests:** [`bcgov-c/tenant-gitops-dec59b`](https://github.com/bcgov-c/tenant-gitops-dec59b) (not in this repo)
- **CI/CD:** GitHub Actions on `dev` / `test` / `main` → image build → GitOps update → ArgoCD sync

## Syncing wiki content to Azure DevOps

The canonical wiki source lives in [`local-context/wiki/`](../local-context/wiki/). To update the [ADO wiki](https://dev.azure.com/BC-MCFD-Procurement/MCFD%20Transformation%20Development/_wiki/wikis/MCFD%20Transformation-Development.wiki/1293/CSA-Documentation):

1. Edit the relevant markdown file under `local-context/wiki/`
2. Copy the updated content into the matching ADO wiki page
3. Preserve heading hierarchy and internal links (ADO uses relative paths between wiki pages)
