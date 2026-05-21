---
status: accepted
date: 2026-05-01
decision-makers: [CSA development team]
---

# 0013: Decoupled Standalone Job Entrypoints

## Context and Problem Statement

Initially, the job framework relied on a single orchestrator job (INGEST_DATA) that chained sub-jobs in a fixed sequence: ICM ingestion, MIS ingestion, eligibility, and ICM sync-back. CRA jobs (send file, poll response) also ran as monolithic entrypoints. This meant:

- Re-running a single step (e.g., eligibility after a data fix) required running the entire pipeline
- All sub-jobs shared the same cron schedule, even when their needs differed
- A failure in one step (e.g., MIS) blocked all downstream steps (e.g., eligibility)
- There was no way for end users to trigger specific jobs from the UI
- Debugging was harder because logs mixed multiple job steps in one run

The question is whether to keep the orchestrator as the sole execution path or to give each job its own standalone entrypoint.

## Decision Drivers

- Operations teams need to re-run individual jobs without triggering the full pipeline
- Different jobs have different scheduling needs (ingestion daily, eligibility every few hours)
- End users need to trigger specific jobs from the UI (e.g., run eligibility, auto-batch)
- Failures in one job should not block unrelated jobs
- Job logs should be scoped to a single concern for easier debugging

## Considered Options

- **Standalone entrypoints per job**:each job type gets its own entrypoint and can be triggered independently via CronJob, API, or CLI
- **Orchestrator-only**:keep INGEST_DATA as the sole entry path; sub-jobs can only run as part of the chain

## Decision Outcome

**Chosen: Standalone entrypoints per job**

Each job type now has its own entrypoint in `src/jobs/entrypoints/`. Jobs can be triggered three ways:

1. **OpenShift CronJob**, each job has its own schedule
2. **API endpoint**, end users trigger jobs from the UI (fire-and-forget pattern)
3. **CLI**, ops/devs run `node dist/jobs/entrypoints/<job>.js` directly on a pod

The orchestrator (INGEST_DATA) still exists for running the full ingestion pipeline as a single unit, but it is no longer the only way to execute sub-jobs. Each sub-job (INGEST_ICM, INGEST_MIS, RUN_ELIGIBILITY, SYNC_ICM, AUTO_BATCH) works independently.

All jobs share the same BaseJob framework with inline retry (3 attempts with exponential backoff) and are covered by the RETRY_FAILED cron for delayed retry.

### Consequences

- **Good:** Ops can re-run a single job after a data fix without triggering the full pipeline
- **Good:** Each job can have its own cron schedule tuned to its needs
- **Good:** Failure isolation, a MIS ingestion failure does not block eligibility from running
- **Good:** End users can trigger eligibility and auto-batch from the UI
- **Good:** Logs are scoped to a single job, making debugging straightforward
- **Good:** The orchestrator remains available for full pipeline runs when needed
- **Bad:** More OpenShift CronJob manifests to maintain (9 entrypoints vs. 4)
- **Bad:** Operators must understand job dependencies (e.g., eligibility needs staging data from ingestion)

## Pros and Cons of the Options

### Standalone entrypoints per job

**Pros:**
- Full operational flexibility, run any job independently
- Independent scheduling per job type
- Failure isolation between unrelated jobs
- Enables user-triggered jobs via API
- Cleaner, single-concern job logs

**Cons:**
- More CronJob configurations to manage
- Job dependency knowledge shifts to operators (e.g., don't run eligibility before ingestion)

### Orchestrator-only

**Pros:**
- Simple deployment, fewer CronJobs to configure
- Job ordering is guaranteed by the orchestrator

**Cons:**
- No way to re-run individual steps
- All sub-jobs locked to one schedule
- One failure blocks the entire chain
- No path for user-triggered jobs
- Mixed logs from multiple steps in a single run
