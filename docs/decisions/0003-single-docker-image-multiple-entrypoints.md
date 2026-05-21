---
status: accepted
date: 2025-12-15
decision-makers: [CSA development team]
---

# 0003: Single Docker Image with Multiple Entrypoints

## Context and Problem Statement

The backend needs to run multiple distinct workloads: a persistent REST API server and nine scheduled jobs. All workloads share the same NestJS codebase and database models. The question is whether to package these as one Docker image or as separate images per workload.

Current job entrypoints:

| Entrypoint | Job Type | Description |
|-----------|----------|-------------|
| `data-ingestion.ts` | INGEST_DATA | Orchestrator: runs ICM + MIS ingestion |
| `ingest-icm.ts` | INGEST_ICM | Standalone ICM data fetch |
| `ingest-mis.ts` | INGEST_MIS | Standalone MIS data reload |
| `run-eligibility.ts` | RUN_ELIGIBILITY | Run eligibility rules on master table |
| `sync-icm.ts` | SYNC_ICM | Push updates back to ICM |
| `auto-batch.ts` | AUTO_BATCH | Auto-batch eligible contacts |
| `cra-file-transfer.ts` | SEND_CRA_FILE | Build and send CRA outbound file |
| `cra-response-poll.ts` | POLL_CRA_RESPONSE | Poll and process CRA response files |
| `retry-failed.ts` | RETRY_FAILED | Retry stuck/failed jobs and sync flagged contacts |

## Decision Drivers

- Guarantee that the API server and all jobs run exactly the same code at the same version
- Minimize CI/CD pipeline complexity and image build time
- Enable job entrypoints to reuse the full NestJS DI graph (services, repositories, config)
- Avoid version skew between the API and jobs

## Considered Options

- **Single image, multiple `CMD` overrides**:one image built once; OpenShift CronJobs override the default command
- **Separate image per workload**:a distinct Dockerfile and build for each job plus the API

## Decision Outcome

**Chosen: Single image, multiple `CMD` overrides**

Building one image and overriding the entrypoint command per workload ensures all running processes share an identical binary. There is no risk of a job running a different version of the eligibility engine or state machine than the API. CI/CD builds one image, tags it, and all OpenShift workloads reference that tag.

The NestJS `NestFactory.createApplicationContext()` API makes this practical: each job entrypoint bootstraps only the modules it needs, without starting an HTTP listener, then exits with code `0` (success) or `1` (failure) for OpenShift to observe.

### Consequences

- **Good:** Atomic deployments: API and all jobs are always on the same code version
- **Good:** Single build step in CI/CD; one image tag to promote through environments
- **Good:** Job entrypoints reuse all services (EligibilityService, JobRunner, etc.) without duplication
- **Good:** OpenShift uses the exit code to determine CronJob success/failure natively
- **Bad:** Image includes all job code even for the API Deployment (slightly larger image); acceptable trade-off

## Pros and Cons of the Options

### Single image, multiple CMD overrides

**Pros:**
- One build, one tag, one promotion pipeline
- Zero version skew between API and jobs
- Full NestJS DI available to every entrypoint
- OpenShift CronJob failure detection via process exit code

**Cons:**
- Image is larger than strictly necessary for any single workload

### Separate image per workload

**Pros:**
- Each image is minimal for its role

**Cons:**
- Multiple builds per deployment; risk of version mismatch if builds drift
- Shared code (services, models) must be duplicated or extracted into a shared package
- More pipelines to maintain and coordinate
