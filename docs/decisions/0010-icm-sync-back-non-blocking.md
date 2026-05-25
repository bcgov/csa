---
status: accepted
date: 2026-02-18
decision-makers: [CSA development team]
---

# 0010: ICM Sync-Back is Non-Blocking in the Daily Orchestrator

## Context and Problem Statement

After the eligibility engine updates CSA statuses, those changes must be pushed back to ICM so the case management system stays in sync. This sync-back runs as the final step of the `INGEST_DATA` daily orchestrator. If the ICM API is unavailable during the sync-back, a decision is needed: should the overall `INGEST_DATA` job fail, or should sync-back failure be treated as recoverable and the job still succeed?

## Decision Drivers

- The core purpose of the daily pipeline is data ingestion and eligibility evaluation; sync-back is secondary
- The ICM API can be temporarily unavailable without affecting data correctness in the CSA database
- A transient ICM outage must not cause the entire daily ingestion to be marked as failed and retried
- Unflushed sync-back records are tracked via a flag (`icm_integration_status = true`) and will be retried on the next run

## Considered Options

- **Non-blocking (failure is a warning)**:if sync-back fails, log a warning and mark `INGEST_DATA` as SUCCESS; flagged contacts are retried on the next run
- **Blocking (failure fails the parent)**:if sync-back fails, `INGEST_DATA` is marked FAILED and the retry job re-runs the entire pipeline including ingestion and eligibility

## Decision Outcome

**Chosen: Non-blocking**

The CSA database is the authoritative source of truth for CSA status. ICM is a downstream consumer of that data. A transient ICM API failure should not:
- Cause the daily eligibility results to be discarded
- Trigger a retry of MIS and ICM ingestion (which already succeeded)
- Block the caseworker view from reflecting fresh eligibility results

The sync-back is designed for resilience: `icm_integration_status = true` flags every contact whose status changed. The flag is only cleared after a confirmed successful ICM API response. If sync-back fails, the flag remains set and the contacts are included in the next run automatically, without reprocessing anything else.

### Consequences

- **Good:** A transient ICM outage does not fail or delay the daily ingestion result
- **Good:** Caseworkers see fresh eligibility data regardless of ICM availability
- **Good:** Retry is automatic and incremental: only unflushed contacts are retried, not the full pipeline
- **Bad:** ICM may be briefly out of sync with CSA; the gap closes on the next run but cannot be reduced below one day without a separate sync job
- **Bad:** Sync-back failure is a warning, not an alert; monitoring must watch for persistent ICM_INTEGRATION_STATUS backlogs

## Pros and Cons of the Options

### Non-blocking (chosen)

**Pros:**
- Protects the daily ingestion pipeline from ICM API instability
- Idempotent retry: only contacts with `icm_integration_status = true` are sent
- Caseworkers see current eligibility data even if ICM is down

**Cons:**
- ICM may lag by one day in edge cases
- Requires monitoring of unsynced contact counts to detect persistent failures

### Blocking

**Pros:**
- ICM is always updated in the same run as eligibility

**Cons:**
- A single ICM API outage causes the entire daily job to be FAILED
- Retry re-runs MIS ingestion and ICM data fetch even though they already succeeded
- Eligibility results may not be visible to caseworkers until the retry completes
