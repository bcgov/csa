---
status: accepted
date: 2026-02-06
decision-makers: [CSA development team]
---

# 0007: ICM Incremental Sync vs. MIS Full Reload

## Context and Problem Statement

The system ingests data from two sources: ICM (case management REST API) and MIS (CSV files in S3). Both sources must be loaded into PostgreSQL staging tables before the eligibility engine runs. The question is whether to sync each source incrementally (only changed records since the last run) or perform a full reload every time.

## Decision Drivers

- Ingestion must complete within a reasonable daily window
- Data must be accurate: no stale or missing records after ingestion
- ICM API supports date-based filtering; MIS exports do not provide delta information
- MIS CSV files represent a complete current snapshot of all records
- The eligibility engine must not run against partial or stale data

## Considered Options

- **ICM incremental + MIS full reload**:ICM fetches only records updated since the last run; MIS always truncates and reloads all three staging tables
- **Both incremental**:both sources use timestamp-based filtering
- **Both full reload**:both sources truncate and reload on every run

## Decision Outcome

**Chosen: ICM incremental, MIS full reload**

The two sources have fundamentally different data export characteristics:

**ICM** exposes a REST API with filter parameters on date fields (`updatedDate`). Fetching only records changed since the last successful run (minus a configurable lookback buffer) is both correct and practical. ICM has ~7 endpoints returning thousands of records; a full reload every day would be slow and put unnecessary load on the ICM API.

**MIS** provides CSV file exports that represent the complete current state of all financial records. There is no `lastModifiedDate` field or delta export format. Each file is a full snapshot. Attempting to implement an incremental strategy on MIS data would require either a reliable modification timestamp (unavailable) or storing and diffing the previous snapshot (complex). Full truncate-and-reload is the correct, idempotent approach.

The **all-or-nothing gate** at the MIS level (all three files must be present, or none are loaded) prevents the eligibility engine from running against a partial MIS snapshot.

### Consequences

- **Good:** ICM incremental reduces API call volume by orders of magnitude on subsequent runs
- **Good:** MIS full reload is simple, idempotent, and guarantees staging tables reflect the exact current export
- **Good:** A lookback buffer (`ICM_CURSOR_LOOKBACK_DAYS`, default: 2 days) protects against missed records near the cursor boundary
- **Good:** If ICM ingestion fails, the timestamp cursor is not advanced; the next run retries from the same point
- **Bad:** ICM full load on the first run (null cursor) may be slow; subsequent runs are fast
- **Bad:** MIS full reload discards any records not in the latest export, which is intentional but requires trust in the completeness of MIS exports

## Pros and Cons of the Options

### ICM incremental + MIS full reload (chosen)

**Pros:**
- Correct for both data source characteristics
- ICM API load minimized on recurring runs
- MIS staging tables always reflect the latest complete export

**Cons:**
- Two different ingestion strategies to maintain

### Both incremental

**Cons:**
- MIS exports have no modification timestamps; true incremental is not possible
- Would require snapshot-diff logic for MIS, adding significant complexity

### Both full reload

**Pros:**
- Simplest implementation; one strategy for all sources

**Cons:**
- ICM full reload on every daily run is slow and places unnecessary load on the ICM REST API
- Risk of hitting ICM rate limits or timeouts on large datasets
