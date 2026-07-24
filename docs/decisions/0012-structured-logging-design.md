---
status: accepted
date: 2026-03-26
decision-makers: [CSA development team]
---

# 0012: Structured Logging Design

## Context and Problem Statement

The backend runs in OpenShift where logs are captured from stdout and forwarded to a centralised log aggregator. Production logs must be machine-parseable for alerting and search; development logs must remain human-readable. The default NestJS console logger does not support JSON output, structured metadata, or the syslog severity levels required by operations.

Job Monitoring (see [job-monitoring-implementation-plan.md](../../documentation/job-monitoring-implementation-plan.md)) adds a second consumer: a curated **Activities** table for the Monitoring UI. That table must not mirror all Splunk output.

## Decision Drivers

- Production logs must be structured JSON so aggregators (e.g. Splunk) can index fields
- Development logs must be human-readable with colours and timestamps
- Logs flow to stdout only; the platform collects and forwards them — no file writing in the application
- Log level must be configurable at runtime via an environment variable
- Severity must distinguish data-quality failures (`crit`) from general errors and system emergencies (`alert`)
- Structured metadata must be attachable to individual log entries
- Monitoring Activities must capture operator-relevant events only, not engineering narrative or infra noise

## Considered Options

- **Winston + nest-winston**: production-grade logging; replaces NestJS default logger; supports custom levels, JSON format, and metadata
- **NestJS built-in ConsoleLogger**: plaintext only; no JSON, custom levels, or structured metadata
- **Pino**: high-performance JSON logger; less NestJS ecosystem support for custom levels

## Decision Outcome

**Chosen: Winston via nest-winston, with a custom AppLogger wrapper**

Winston replaces the NestJS built-in logger as the global logger. Format switches by environment:

- **Production:** structured JSON to stdout
- **Development:** human-readable output with colours and timestamps

A single console transport writes to stdout only. OpenShift collects logs via its pipeline; the application does not write log files.

Log level is configurable via `LOG_LEVEL` (default `info` in production, `debug` in development).

### Severity levels (syslog-inspired)

| Level | Use |
|-------|-----|
| `alert` | System-level emergency |
| `crit` | Data quality or integrity failure requiring intervention |
| `error` | Unexpected runtime error |
| `warn` | Recoverable issue or expected edge case |
| `info` | Normal operational events |
| `debug` / `verbose` | Trace detail |

AppLogger extends the NestJS logger and adds `crit()` and `alert()`, each accepting optional metadata merged as top-level JSON fields for aggregator filtering.

### Activities dual-write (Monitoring)

Splunk receives all application logs. The Activities table receives only **tagged** operator-relevant warnings, errors, and critical events from monitored domains (jobs, eligibility, batch, CRA, WKL, ICM).

| Event type | Splunk | Activities |
|------------|--------|------------|
| Informational / debug narrative | Yes | No |
| Warnings, errors, critical events without Monitoring tags | Yes | No |
| Warnings, errors, critical events tagged for Monitoring | Yes | Yes |

Infra concerns (auth, OpenShift, mocks) use the standard NestJS logger and never write to Activities. Engineering noise (mocks, config fallbacks, internal backfill detail) is logged at informational level. Integration failures, auth denials, and data-quality issues remain at warning level in Splunk even when not promoted to Activities.

Implementation detail (tag fields, call-site conventions) lives in the [job monitoring implementation plan](../../documentation/job-monitoring-implementation-plan.md) Phase 5.1, not in this ADR.

### Consequences

- **Good:** Production logs are structured and indexable; custom levels support targeted alerting
- **Good:** Metadata on log entries avoids string interpolation for structured search
- **Good:** Monitoring UI shows a curated operator view without duplicating Splunk
- **Bad:** Winston adds a dependency and configuration beyond the NestJS default
- **Bad:** Custom levels require AppLogger; callers cannot rely on the NestJS Logger interface alone
- **Bad:** Dual-write policy requires discipline at call sites to avoid Activities noise or missed operator events

## Pros and Cons of the Options

### Winston + nest-winston (chosen)

**Pros:**
- JSON in production; readable output in development
- Custom syslog levels with metadata support
- Console-only transport; platform-native log collection

**Cons:**
- Additional dependency and custom level wiring

### NestJS ConsoleLogger

**Pros:**
- No additional dependencies

**Cons:**
- Plaintext only; no structured metadata or custom levels

### Pino

**Pros:**
- Fast JSON logging with low overhead

**Cons:**
- Less NestJS integration for custom levels; pretty-print needs extra tooling in development
