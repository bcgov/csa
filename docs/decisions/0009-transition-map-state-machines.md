---
status: accepted
date: 2026-02-27
decision-makers: [CSA development team]
---

# 0009: Transition-Map State Machines for the CSA Contact Lifecycle

## Context and Problem Statement

The CSA contact lifecycle involves 14 states, complex valid/invalid transition rules, and actor restrictions (some transitions can only be performed by a caseworker, others only by the system). Without a formal model, status-transition logic risks being scattered across multiple services with inconsistent validation, allowing invalid states silently.

## Decision Drivers

- All status transitions must be validated; invalid transitions must be rejected explicitly
- Some events are restricted by actor (USER vs. SYSTEM); this must be enforced centrally
- The valid transitions for each state must be queryable at runtime (the frontend needs this to render available actions)
- The model must be easy to audit and extend without touching application logic
- Avoid importing a heavy state machine library for what is essentially a finite set of rules

## Considered Options

- **Custom transition-map**:define transitions as a plain `{ fromState: { event: toState } }` object; validate with utility functions
- **Third-party state machine library (e.g., XState, Robot)**:import a dedicated FSM library
- **Ad hoc enum checks**:`if (status === 'eligible' && event === 'ADD_TO_BATCH')` scattered across service methods

## Decision Outcome

**Chosen: Custom transition-map**

The transition map is a plain JavaScript object that explicitly enumerates every valid `(fromState, event) → toState` pairing. Three utility functions operate on it: `canTransition`, `getNextState`, and `getValidEvents`. The actor model and HOLD/RESUME pattern are layered on top.

This approach requires zero external dependencies and keeps all transition rules in one auditable location. The `GET /api/state-machines/csa` endpoint returns the valid user-triggerable events for each state, which the frontend uses to render available actions dynamically.

Three state machines are defined:
- **CSA Contact Status**:14 states, 13 events, actor restrictions
- **Batch Status**:6 states, 5 events, SYSTEM-only
- **Batch Detail Status**:4 states, 3 events, SYSTEM-only

### Consequences

- **Good:** All valid transitions are explicit and auditable in one file
- **Good:** `getValidEvents()` powers the frontend's dynamic action rendering without hardcoding UI logic
- **Good:** Invalid transitions return a structured error rather than silently allowing bad state
- **Good:** Zero external dependencies; no library versioning risk
- **Bad:** Actor model and multi-target transitions (e.g., RESUME returning to stored `resumeStatus`) required custom extension beyond the basic map pattern
- **Bad:** No visual state machine diagram generated from the definition (diagram must be maintained separately)

## Pros and Cons of the Options

### Custom transition-map (chosen)

**Pros:**
- Zero dependencies
- Explicit, auditable, co-located transition rules
- `getValidEvents()` queryable at runtime for frontend integration

**Cons:**
- Actor model and dynamic targets must be hand-implemented
- No auto-generated visual diagram

### Third-party library (XState, Robot)

**Pros:**
- Rich tooling: visualization, testing utilities
- Industry-standard concepts (guards, actions, services)

**Cons:**
- Adds a significant dependency; library updates require migration
- XState v5's actor model introduces complexity that exceeds the project's needs
- Team must learn library-specific APIs and patterns

### Ad hoc enum checks

**Pros:**
- Quickest to write initially

**Cons:**
- Transition logic scattered across ContactsService, BatchesService, CRA handlers
- No single source of truth; easy to miss a check in one service
- `getValidEvents()` cannot be implemented without duplicating all the conditions
