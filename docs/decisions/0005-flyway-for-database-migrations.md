---
status: accepted
date: 2025-12-15
decision-makers: [CSA development team]
---

# 0005: Flyway for Database Migrations

## Context and Problem Statement

The PostgreSQL schema needs versioned, repeatable migrations that apply consistently across dev, test, and production environments. The migration tool must integrate with the OpenShift deployment pipeline and must not require the application process to have DDL permissions at runtime.

## Decision Drivers

- Migrations must be plain SQL, no ORM-specific DSL that obscures the actual schema change
- Checksum validation to detect accidental modification of applied migrations
- OpenShift-compatible: runs as a Kubernetes Job before the API Deployment starts
- Battle-tested in enterprise PostgreSQL environments
- Recovery tooling for interrupted or partially applied migrations

## Considered Options

- **Flyway**:dedicated database migration tool; SQL-only; runs as a standalone process
- **Prisma Migrate**:ORM-integrated migration tool; generates SQL from Prisma schema diff
- **Raw SQL scripts with manual versioning**:ad hoc SQL files, no tooling

## Decision Outcome

**Chosen: Flyway**

Flyway runs as a separate Docker image (`csa-flyway`) deployed as a Kubernetes Job at deploy time, completing before the API pod starts. This separation means the application process never needs DDL privileges at runtime, which is a security best practice. Migrations are plain SQL files, readable and auditable without understanding any ORM dialect. The `repair` command handles interrupted migrations cleanly.

Prisma Migrate was rejected because it generates migration SQL from ORM schema diffs, which can produce unexpected DDL. Plain SQL gives the team full control and auditability, especially important for a production system with sensitive data.

### Consequences

- **Good:** Migrations are pure SQL, reviewable, portable, and ORM-independent
- **Good:** Checksum validation prevents silent modification of applied migrations
- **Good:** `flyway repair` recovers from interrupted runs without manual intervention
- **Good:** Application process has no DDL permissions at runtime (least privilege)
- **Good:** Migration state is stored in `flyway_schema_history` table, visible in the DB
- **Bad:** Schema changes require both a Prisma schema update and a Flyway SQL migration; must be kept in sync manually

## Pros and Cons of the Options

### Flyway

**Pros:**
- Pure SQL migrations; no ORM DSL to learn
- Checksum validation on every run; detects tampered files
- Standalone process; does not run inside the application
- `repair` command for recovery

**Cons:**
- Schema must be maintained in two places: `schema.prisma` (for Prisma client) and Flyway SQL files

### Prisma Migrate

**Pros:**
- Single source of truth: schema.prisma drives both ORM types and migrations
- Automated migration generation from schema diff

**Cons:**
- Generated SQL can be unexpected for complex changes (e.g., column renames, constraint changes)
- Requires the ORM to connect with DDL privileges; less separation from the application runtime
- Less mature in containerised / GitOps deployment patterns

### Raw SQL scripts with manual versioning

**Pros:**
- Maximum control

**Cons:**
- No tooling for tracking which scripts have been applied
- No checksums; silent modification is undetectable
- No built-in recovery from partial failures
