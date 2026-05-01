---
status: accepted
date: 2026-01-28
decision-makers: [CSA development team]
---

# 0004: OpenShift CronJobs Instead of an In-App Scheduler

## Context and Problem Statement

Four recurring jobs need to run on a schedule: daily data ingestion, weekly CRA file transfer, periodic CRA response polling, and periodic retry of failed jobs. The backend is a NestJS application that could manage these schedules internally. Alternatively, the platform (OpenShift) can trigger them externally as CronJobs.

## Decision Drivers

- Job execution must be observable and auditable (success/failure recorded in platform logs)
- A failed job must not silently succeed from the platform's perspective
- The API process should remain lean and focused; it should not hold scheduler state in memory
- Job execution must survive an API pod restart without losing schedule state
- OpenShift native tooling should be preferred when it fits the use case

## Considered Options

- **OpenShift CronJobs**:platform-level scheduled containers, each running a short-lived process
- **`@nestjs/schedule` (in-app)**:NestJS decorator-based scheduler running inside the API process

## Decision Outcome

**Chosen: OpenShift CronJobs**

OpenShift CronJobs run each job as an independent, short-lived container. The container exits with code `0` on success and `1` on failure. OpenShift records this outcome and can alert on failures. The API process carries no scheduler overhead and job scheduling is visible in the GitOps manifests alongside all other workload definitions.

The `NestFactory.createApplicationContext()` pattern makes each entrypoint a clean, self-contained process: it boots the required NestJS modules, runs the job, and exits, no HTTP server, no lingering state.

### Consequences

- **Good:** Job success/failure is an OS-level exit code; OpenShift observes it natively
- **Good:** API pods are stateless and lightweight; no scheduler heartbeat or lock management
- **Good:** Job schedules are defined in GitOps manifests, versioned alongside code
- **Good:** Each job run is an isolated process; a crash in one job cannot affect the API or other jobs
- **Bad:** Schedule changes require a GitOps manifest update and deployment rather than a code change
- **Bad:** Minimum scheduling resolution is one minute (Kubernetes CronJob limitation)

## Pros and Cons of the Options

### OpenShift CronJobs

**Pros:**
- Platform-native; schedule visible in GitOps manifests
- Exit code = job result; OpenShift failure detection is automatic
- No scheduler state in the API process; clean separation of concerns
- Job runs are isolated processes; failures cannot cascade to the API

**Cons:**
- Schedule defined in YAML, not code; requires a deploy to change timing
- Minimum granularity: 1-minute intervals

### `@nestjs/schedule` (in-app)

**Pros:**
- Schedule defined in code, co-located with business logic
- Sub-minute precision possible

**Cons:**
- Scheduler runs inside the API process; a stuck job can degrade the API
- Pod restart loses in-flight job state; requires distributed locking to prevent duplicate runs
- Job success/failure not visible to OpenShift without additional instrumentation
