---
status: accepted
date: 2025-12-15
decision-makers: [CSA development team]
---

# 0002: Choose a Frontend Framework

## Context and Problem Statement

The CSA application needs a web interface for caseworkers to view contacts, manage eligibility, and handle batch submissions to CRA. The interface must be maintainable, integrate with BC Gov design components, and connect securely to the backend API via Keycloak authentication.

The project was bootstrapped from the [BC Gov OpenShift Quickstart](https://github.com/bcgov/quickstart-openshift) template. React is the frontend framework used in that template and is the standard UI library across BC Gov projects, ensuring compatibility with the BC Gov Design System.

## Decision Drivers

- Strong TypeScript support for type-safe API interactions
- Compatibility with the BC Gov Design System component library (`@bcgov/design-tokens`, `@bcgov/bc-sans`)
- Type-safe client-side routing without runtime route mismatches
- Developer familiarity and ecosystem maturity
- Support for Keycloak OIDC PKCE authentication flow
- Alignment with the BC Gov OpenShift Quickstart reference stack

## Considered Options

- **React 19 + TanStack Router**:component library with file-based, type-safe router
- **React 19 + React Router**:standard React routing library
- **Vue 3**:progressive JavaScript framework
- **Angular**:full opinionated framework from Google

## Decision Outcome

**Chosen: React 19 with TanStack Router**

React is the most widely used UI library in the BC Gov ecosystem, ensuring BC Gov Design System components work correctly and that developers can be onboarded from the broader government pool. TanStack Router was selected over React Router for its file-based route definition and full TypeScript inference on route parameters and search params, eliminating a class of runtime routing bugs.

### Consequences

- **Good:** Full TypeScript inference from URL parameters to component props
- **Good:** BC Gov Design System headers, footers, and fonts work without modification
- **Good:** Vite provides fast local development with HMR and small production bundles
- **Bad:** TanStack Router is less common than React Router; fewer examples in the wild
- **Bad:** React's render model still requires discipline to avoid excessive re-renders

## Pros and Cons of the Options

### React 19 + TanStack Router

**Pros:**
- File-based routes; type-safe link/navigation APIs
- React ecosystem: hooks, context, extensive tooling
- BC Gov Design System built for React

**Cons:**
- TanStack Router is a relatively newer choice with less community documentation than React Router

### React 19 + React Router v7

**Pros:**
- More widely documented and used

**Cons:**
- Route params are `string | undefined` at compile time; no compile-time route safety

### Vue 3

**Pros:**
- Arguably simpler API for small teams

**Cons:**
- BC Gov Design System components are React-first
- Smaller BC Gov developer pool with Vue experience

### Angular

**Pros:**
- Fully opinionated, batteries-included

**Cons:**
- Heavy framework, longer onboarding time
- BC Gov Design System not targeted at Angular
