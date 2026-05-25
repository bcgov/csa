---
status: accepted
date: 2025-12-15
decision-makers: [CSA development team]
---

# 0001: Choose a Backend API Framework

## Context and Problem Statement

The CSA application requires a server-side framework to expose a REST API for the frontend, run background data ingestion jobs, and integrate with external systems (ICM, MIS, CRA). The framework must support TypeScript, scale to an enterprise workload, and be maintainable by a small team over a multi-year lifespan.

The project was bootstrapped from the [BC Gov OpenShift Quickstart](https://github.com/bcgov/quickstart-openshift) template, which provides a reference stack for TypeScript applications deployed on OpenShift. NestJS is the backend framework used in that template, making it an already-vetted choice within the BC Gov environment.

## Decision Drivers

- TypeScript-first development with strong typing across the codebase
- Built-in support for dependency injection, modular architecture, and testability
- OpenAPI / Swagger support without a separate tool
- Active ecosystem and long-term maintenance outlook
- Developer onboarding speed
- Alignment with the BC Gov OpenShift Quickstart reference stack

## Considered Options

- **NestJS**:opinionated TypeScript framework with DI, decorators, and modular design
- **Express**:minimal Node.js framework, no opinions on structure
- **Fastify**:performance-focused Node.js framework
- **No framework**:plain Node.js with hand-rolled structure

## Decision Outcome

**Chosen: NestJS**

NestJS satisfies all decision drivers. Its module/provider/controller model enforces a consistent structure that reduces cognitive load when navigating the codebase. The built-in DI container makes unit testing straightforward, and `@nestjs/swagger` generates live API documentation directly from decorators.

### Consequences

- **Good:** Consistent project structure; any developer familiar with NestJS can orient quickly
- **Good:** Decorators (`@Controller`, `@Injectable`, `@UseGuards`) keep boilerplate out of business logic
- **Good:** Swagger UI auto-generated at `/api/docs` in non-production environments
- **Good:** `NestFactory.createApplicationContext()` allows job entrypoints to reuse the full DI graph without starting an HTTP server
- **Bad:** NestJS adds framework concepts (modules, providers, lifecycle hooks) that have a learning curve compared to plain Express

## Pros and Cons of the Options

### NestJS

**Pros:**
- TypeScript-native, decorator-based
- Built-in DI container, module system, lifecycle hooks
- OpenAPI generation via `@nestjs/swagger`
- Can run without HTTP server (ApplicationContext), used for job entrypoints

**Cons:**
- More opinionated; steeper initial learning curve than Express

### Express

**Pros:**
- Minimal, familiar, huge ecosystem

**Cons:**
- No structure enforced; architecture decisions deferred to the team
- No built-in DI; testing requires manual wiring
- No built-in OpenAPI support

### Fastify

**Pros:**
- Faster than Express for raw throughput

**Cons:**
- Smaller ecosystem, fewer BC Gov team members familiar with it
- No built-in DI or module system

### No framework

**Pros:**
- Zero dependencies, maximum control

**Cons:**
- Re-inventing routing, middleware, DI, and testing infrastructure
