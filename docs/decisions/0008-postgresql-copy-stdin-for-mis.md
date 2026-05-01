---
status: accepted
date: 2026-02-10
decision-makers: [CSA development team]
---

# 0008: PostgreSQL COPY FROM STDIN for MIS CSV Ingestion

## Context and Problem Statement

MIS financial data arrives as three CSV files stored in S3. Each file must be loaded into a PostgreSQL staging table. The files can be large (tens of thousands of rows). The loading method must be fast, memory-efficient, and reliable.

## Decision Drivers

- Files must not be fully buffered in memory before loading (S3 objects can be large)
- Loading must be transactional: if the load fails mid-file, the staging table must remain in its previous state
- Performance: loading speed matters for keeping the daily ingestion window short
- The approach must work with the existing `pg` + Prisma stack

## Considered Options

- **PostgreSQL `COPY FROM STDIN` via streaming**:pipe the S3 download stream directly into PostgreSQL using the `pg-copy-streams` library
- **Row-by-row `INSERT` statements**:parse CSV in Node.js and execute one `INSERT` per row
- **Bulk `INSERT` with `unnest()`**:batch CSV rows into arrays and insert via unnest (same pattern used for ICM)

## Decision Outcome

**Chosen: PostgreSQL `COPY FROM STDIN` via streaming**

`COPY FROM STDIN` is the fastest PostgreSQL bulk loading mechanism. Combined with the `pg-copy-streams` library, the S3 download stream is piped directly into the PostgreSQL `COPY` command without buffering the entire file in application memory. This makes ingestion efficient regardless of file size.

The load is wrapped in a transaction (`BEGIN / COMMIT`). A temporary table is created to receive the CSV data; if loading succeeds and the row count is greater than zero, the staging table is truncated and replaced atomically. If anything fails, `ROLLBACK` leaves the staging table untouched.

The unnest bulk-insert pattern used for ICM is not suitable here because it requires all rows to be collected in memory before executing the statement - defeating the purpose of streaming.

### Consequences

- **Good:** S3 download stream is piped directly to PostgreSQL; no full-file buffering in Node.js memory
- **Good:** Fastest PostgreSQL bulk load mechanism; significantly faster than row-by-row INSERT
- **Good:** Transactional: rollback on any failure leaves the staging table in its previous state
- **Good:** Empty file detection (rowCount === 0) rejects files with headers but no data rows
- **Bad:** `COPY FROM STDIN` bypasses row-level triggers and some constraints; must validate data quality at the application layer
- **Bad:** Requires a raw `pg.Pool` connection (not Prisma's managed connection pool) for the copy stream

## Pros and Cons of the Options

### PostgreSQL COPY FROM STDIN (chosen)

**Pros:**
- Streaming: no full-file memory buffer
- Fastest PostgreSQL bulk loading method
- Transactional via temp table + TRUNCATE + INSERT pattern

**Cons:**
- Bypasses row-level triggers; application must validate data
- Requires raw `pg` client rather than Prisma

### Row-by-row INSERT

**Pros:**
- Simple; works with Prisma ORM

**Cons:**
- ~100× slower than COPY for large files
- Memory pressure: must parse entire CSV before inserting, or manage complex streaming + batching
- Transactional guarantees require explicit transaction management

### Bulk INSERT with unnest()

**Pros:**
- Used successfully for ICM data (suitable for pre-fetched data)

**Cons:**
- Requires all rows in memory as arrays before executing
- PostgreSQL statement size limits may be hit for very large files
- Slower than COPY for large datasets
