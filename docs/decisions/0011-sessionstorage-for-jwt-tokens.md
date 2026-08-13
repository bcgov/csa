---
status: accepted
date: 2026-02-17
decision-makers: [CSA development team, security reviewer]
consulted: [pen-test team (ZAP)]
---

# 0011: sessionStorage for JWT Token Storage (Post Pen-Test)

## Context and Problem Statement

The CSA frontend authenticates users via Keycloak OIDC and receives a JWT access token. This token must be stored client-side so it can be included as a `Bearer` token on subsequent API requests. A ZAP penetration test identified "JWT Stored in Browser localStorage" as a medium-severity finding. The token storage mechanism must be updated to reduce the risk window.

## Decision Drivers

- Reduce the persistence window of stored tokens to limit exposure from XSS attacks
- Token must be available to Axios interceptors for every API request
- Solution must not require changes to the Keycloak realm configuration
- Must address the specific pen-test finding

## Considered Options

- **`sessionStorage`**:tab-scoped storage; cleared when the tab is closed
- **`localStorage`**:persistent storage; survives browser restarts
- **In-memory only**:token held in a JavaScript variable; lost on page reload
- **httpOnly cookie**:server-set cookie not accessible to JavaScript; requires backend session management

## Decision Outcome

**Chosen: `sessionStorage`**

Moving from `localStorage` to `sessionStorage` directly addresses the pen-test finding. The key difference is that `sessionStorage` is scoped to the browser tab and cleared automatically when the tab is closed. Tokens do not persist across browser sessions, reducing the window during which a stolen token could be replayed.

The XSS attack surface is identical between `localStorage` and `sessionStorage`, both are readable by JavaScript in the same origin. However, `sessionStorage` is preferable because:
1. Tokens do not persist after the user closes the tab (natural session end)
2. Tokens are not shared across tabs (each tab has its own session)

The `httpOnly` cookie approach would require Keycloak to issue a session cookie and the backend to validate it, which is a significantly larger architectural change and outside the scope of what can be configured on this application's side.

In-memory-only storage was rejected because page reloads would require re-authentication, which is disruptive for caseworkers doing daily work.

### Consequences

- **Good:** Directly resolves the pen-test finding
- **Good:** Tokens automatically cleared when the tab is closed, natural session boundary
- **Good:** Tokens not shared across browser tabs, reduced blast radius if one tab is compromised
- **Good:** No backend changes required; Axios interceptors continue to function identically
- **Bad:** XSS risk is not eliminated; any XSS vulnerability in the SPA could still access `sessionStorage`
- **Bad:** Token lost on page refresh if the Keycloak silent SSO check (`check-sso`) fails to restore the session

## Pros and Cons of the Options

### sessionStorage (chosen)

**Pros:**
- Resolves pen-test finding
- Token cleared on tab close; no cross-tab sharing
- No backend or Keycloak changes required

**Cons:**
- XSS in the SPA can still read `sessionStorage`

### localStorage

**Pros:**
- Token survives page reloads without re-authentication

**Cons:**
- Pen-test finding; tokens persist indefinitely across browser restarts
- Token accessible across all tabs in the same origin

### In-memory only

**Pros:**
- Not accessible via `localStorage` or `sessionStorage` API

**Cons:**
- Token lost on page reload; user must re-authenticate
- Disruptive for normal caseworker workflows

### httpOnly cookie

**Pros:**
- Token not accessible to JavaScript at all; best XSS protection

**Cons:**
- Requires Keycloak realm configuration changes
- Requires the backend to validate session cookies instead of Bearer tokens
- CSRF risk must be mitigated separately
- Significantly larger implementation scope
