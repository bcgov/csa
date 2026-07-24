---
status: accepted
date: 2026-03-26
decision-makers: [CSA development team]
---

# 0012: Structured Logging Design

## Context and Problem Statement

The backend runs in OpenShift where logs are captured from stdout and forwarded to a centralised log aggregator. Log output must be machine-parseable in production for alerting and search, and human-readable in development for local debugging. The default NestJS console logger does not support JSON output, structured metadata fields, or the syslog severity levels required by operations.

## Decision Drivers

- Production logs must be structured JSON so log aggregators (e.g., Splunk, ELK) can index fields
- Development logs must be human-readable with colours and timestamps
- Logs must flow to stdout only; the platform (OpenShift/Kubernetes) collects and forwards them, no file writing in the application
- Log level must be configurable at runtime via an environment variable
- Severity must distinguish `crit` (data quality failure, requires intervention) from `error` (unexpected runtime error, may self-recover) and `alert` (system-level emergency)
- Structured metadata (e.g., `{ category: 'DATA_QUALITY', caseRowId: '...' }`) must be attachable to individual log entries

## Considered Options

- **Winston + nest-winston**:production-grade logging library; replaces NestJS's default logger; supports custom levels, JSON format, and metadata fields
- **NestJS built-in `ConsoleLogger`**:default logger; outputs plaintext; no JSON support; no custom log levels; no structured metadata
- **Pino**:high-performance JSON logger for Node.js; minimal API

## Decision Outcome

**Chosen: Winston via `nest-winston`, with a custom `AppLogger` wrapper**

Winston replaces the NestJS built-in logger as the global logger via `WinstonModule.createLogger()`. The format switches based on `NODE_ENV`:

- **Production** (`NODE_ENV=production`): `winston.format.json()` with timestamps and error stacks, machine-parseable JSON to stdout
- **Development**: NestJS-style pretty-print with colours and millisecond timestamps

A custom `AppLogger` class extends NestJS's `Logger` and adds two methods beyond the standard set: `crit()` and `alert()`. Both accept an optional `metadata` object whose key-value pairs are merged into the log entry as top-level JSON fields, enabling structured filtering in log aggregators (e.g., `category:DATA_QUALITY`).

### Custom Log Levels (syslog-inspired)

| Level | Priority | Use |
|-------|----------|-----|
| `alert` | 0 (highest) | System-level emergency requiring immediate escalation |
| `crit` | 1 | Data quality or integrity failure requiring human intervention (e.g., a contact skipped due to missing required fields) |
| `error` | 2 | Unexpected runtime error; may self-recover on retry |
| `warn` | 3 | Recoverable issue or expected edge case worth noting |
| `info` | 4 | Normal operational events (job start/end, record counts) |
| `debug` | 5 | Detailed trace for development |
| `verbose` | 6 | Highly detailed trace; NestJS framework-level |

Winston's level filter includes all messages at or above the configured level. Default: `info` in production, `debug` in development.

### Console-Only Transport

A single `Console` transport writes to stdout. No file transports are configured. This is intentional: OpenShift collects stdout via its log pipeline, centralises storage, and provides log rotation. Writing to files inside a container would bypass this pipeline and create disk-space management concerns.

### Consequences

- **Good:** Production logs are structured JSON; all fields (timestamp, level, context, message, metadata) are individually indexable
- **Good:** `crit` and `alert` levels allow alerting rules to distinguish data quality failures from general errors
- **Good:** Metadata object on `AppLogger.crit()` / `.alert()` lets callers attach structured context (e.g., `{ caseRowId, invalidFields }`) without string interpolation
- **Good:** Log level configurable at runtime via `LOG_LEVEL` env var without redeployment
- **Good:** Development output is human-readable with colours; no JSON noise locally
- **Bad:** Winston adds a dependency and configuration layer not present in the NestJS default logger
- **Bad:** Custom levels (`crit`, `alert`) are not part of NestJS's `LogLevel` type; callers must use `AppLogger` rather than the interface type to access them

## Pros and Cons of the Options

### Winston + nest-winston (chosen)

**Pros:**
- JSON output in production; human-readable in development
- Custom syslog levels (`crit`, `alert`) with metadata support
- Console-only transport; platform collects logs
- Log level configurable via `LOG_LEVEL` env var

**Cons:**
- Additional dependency; custom level wiring required

### NestJS built-in ConsoleLogger

**Pros:**
- Zero additional dependencies

**Cons:**
- Plaintext output only; no JSON format
- No custom log levels; no structured metadata fields
- Cannot distinguish `crit` from `error` without string conventions

### Pino

**Pros:**
- Fastest JSON logger for Node.js; very low overhead
- JSON output by default

**Cons:**
- Less NestJS ecosystem support than `nest-winston`
- Custom log levels require additional configuration
- Pretty-print in development requires a separate `pino-pretty` dependency

## Job Monitoring dual-write (Activities table)

The Monitoring UI (`job_activities`) stores a **curated subset** of logs — not a copy of Splunk.

| Level / API | Splunk | Activities |
|-------------|--------|------------|
| `log` / `info` / `debug` | Yes | No |
| `warn` / `error` / `crit` **without** `activityType` or `category` | Yes (Splunk alerting) | No |
| `warn` / `error` / `crit` **with** `activityType` or `category` on `AppLogger` | Yes | Yes |

Demote to `log` only **engineering noise** (mocks, config fallbacks, internal backfill detail). Keep integration failures, auth denials, and data-quality skips at **`warn`** in Splunk even when they are not written to Activities.

Use **`AppLogger`** in monitored domains (jobs, eligibility, batch, CRA, WKL, ICM). Use Nest **`Logger`** for infra (auth, OpenShift, mocks, Prisma) where Activities do not apply.

Tag example:

```typescript
this.logger.warn('2 contacts skipped due to missing CRA fields (batch 5)', {
  activityType: JobActivityType.BATCH,
  related: '2 contacts skipped due to missing CRA mandatory fields (batch 5)',
})
```

See [job-monitoring-implementation-plan.md](../functional-design/job-monitoring-implementation-plan.md) Phase 5.1.
