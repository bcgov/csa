# Frontend Runtime Configuration - OpenShift Deployment

## Problem
Frontend app was not picking up environment variables from OpenShift ConfigMaps because:
1. Vite builds environment variables **at build time**, not runtime
2. OpenShift ConfigMaps only provide values **at runtime**
3. The configuration needed to be loaded dynamically from a mounted file

## Solution Implemented

### Approach: Serve ConfigMap as `/config.json`

The ConfigMap (`csa-frontend-runtime-config`) is mounted as a volume at `/runtime-config` and served by Caddy at `/config.json`. The frontend loads this file at startup to get Keycloak configuration.

**No hardcoded values anywhere** - Application loads settings from `/config.json` or fails with a clear error message.

---

## Implementation Details

### 1. ConfigMap Structure

**File**: OpenShift ConfigMap `csa-frontend-runtime-config`

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: csa-frontend-runtime-config
  labels:
    app.kubernetes.io/name: csa-frontend
data:
  config.json: |
    {
      "apiBaseUrl": "/api",
      "keycloak": {
        "url": "https://loginproxy.gov.bc.ca/auth",
        "realm": "standard",
        "clientId": "cfd-csa-6221"
      }
    }
```

### 2. Deployment Configuration

**File**: `charts/app/templates/frontend/templates/deployment.yaml`

```yaml
spec:
  template:
    spec:
      containers:
        - name: frontend
          volumeMounts:
            - name: runtime-config
              mountPath: /runtime-config
              readOnly: true
      volumes:
        - name: runtime-config
          configMap:
            name: csa-frontend-runtime-config
            items:
              - key: config.json
                path: config.json
```

### 3. Caddyfile Configuration

**File**: `frontend/Caddyfile`

Added route to serve the config.json from mounted ConfigMap:

```caddyfile
:3000 {
  # Serve runtime config from mounted ConfigMap
  handle /config.json {
    root * /runtime-config
    file_server
  }

  # Serve application files
  root * /srv
  file_server
  # ... rest of config
}
```

### 4. Keycloak Configuration

**File**: `frontend/src/config/keycloak.config.ts`

Loads configuration from `/config.json` and validates structure:

```typescript
async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const response = await fetch('/config.json')
  if (!response.ok) {
    throw new Error(`Failed to load /config.json: ${response.status}`)
  }

  const config = await response.json()
  const keycloakConfig = config.keycloak

  if (!keycloakConfig || !keycloakConfig.url || !keycloakConfig.realm || !keycloakConfig.clientId) {
    throw new Error('Invalid Keycloak configuration in /config.json')
  }

  return {
    VITE_KEYCLOAK_URL: keycloakConfig.url,
    VITE_KEYCLOAK_REALM: keycloakConfig.realm,
    VITE_KEYCLOAK_CLIENT_ID: keycloakConfig.clientId,
  }
}

async function initializeKeycloak(): Promise<Keycloak> {
  const config = await loadRuntimeConfig()

  return new Keycloak({
    url: config.VITE_KEYCLOAK_URL,
    realm: config.VITE_KEYCLOAK_REALM,
    clientId: config.VITE_KEYCLOAK_CLIENT_ID,
  })
}
```

**Key Points:**
- ❌ **NO hardcoded values** - All configuration from ConfigMap
- ✅ **Validates structure** - Checks for `keycloak` object and required fields
- ✅ **Fail-fast** - Throws error if config.json is missing or invalid
- ✅ **Clear error messages** - Easy to debug configuration issues

### 5. Dockerfile

**File**: `frontend/Dockerfile`

Creates `/runtime-config` directory with proper permissions:

```dockerfile
# Create runtime-config directory for ConfigMap mount
RUN mkdir -p /data /config /tmp/coraza /runtime-config \
  && chgrp -R 0 /srv /etc/caddy /data /config /tmp /runtime-config \
  && chmod -R g=u /srv /etc/caddy /data /config /tmp /runtime-config
```

### 6. Startup Script

**File**: `frontend/inject-env.sh`

Simplified to just start Caddy (config comes from ConfigMap):

```bash
#!/bin/sh
echo "Starting Caddy web server..."
echo "Runtime configuration should be available at /config.json"

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
```

---

## How It Works

### Container Startup
```
1. OpenShift mounts ConfigMap at /runtime-config/config.json
   ↓
2. Dockerfile ensures /runtime-config has proper permissions
   ↓
3. inject-env.sh starts Caddy
   ↓
4. Caddy serves /runtime-config/config.json as /config.json
```

### Frontend Initialization
```
1. Browser loads application
   ↓
2. App fetches /config.json
   ↓
3. Validates Keycloak settings exist
   ↓
4. Initializes Keycloak with runtime values
   ↓
5. Authentication flow begins
```

### Request Flow
```
Browser → GET /config.json → Caddy serves /runtime-config/config.json
                           ↓
Frontend reads config → Validates structure → Initializes Keycloak
```

---

## Configuration Sources

**Priority: ConfigMap ONLY**

```
1. /config.json (from mounted ConfigMap) ← ONLY SOURCE
   ↓ (if missing or invalid)
2. ❌ ERROR - Application fails to start
```

**No fallbacks, no defaults** - Configuration must be provided via ConfigMap.

---

## Deployment Steps

### 1. Verify ConfigMap exists
```bash
oc get configmap csa-frontend-runtime-config -n dec59b-dev -o yaml
```

Should contain:
```yaml
data:
  config.json: |
    {
      "keycloak": {
        "url": "https://loginproxy.gov.bc.ca/auth",
        "realm": "standard",
        "clientId": "cfd-csa-6221"
      }
    }
```

### 2. Rebuild frontend image
```bash
cd frontend
docker build -t <registry>/frontend:latest .
docker push <registry>/frontend:latest
```

### 3. Deploy to OpenShift
```bash
helm upgrade csa ./charts/app -n dec59b-dev
```

### 4. Verify config is accessible
```bash
# Check if volume is mounted
oc exec -it <frontend-pod> -- ls -la /runtime-config/

# Should show: config.json

# Check if Caddy serves it
oc exec -it <frontend-pod> -- wget -O- http://localhost:3000/config.json
```

### 5. Test in browser
- Open browser developer tools
- Go to Network tab
- Reload the page
- Look for request to `/config.json`
- Verify it returns the Keycloak configuration

---

## Troubleshooting

### 1. Config.json not found (404)

**Check if ConfigMap is mounted:**
```bash
oc exec -it <frontend-pod> -- ls -la /runtime-config/
```

If empty, check deployment volume mounts:
```bash
oc get deployment <frontend-deployment> -o yaml | grep -A 10 volumeMounts
```

**Fix:** Ensure deployment.yaml has proper volumeMounts configuration.

### 2. Permission denied accessing config.json

**Check permissions:**
```bash
oc exec -it <frontend-pod> -- ls -la /runtime-config/config.json
```

Should be readable by group 0.

**Fix:** Dockerfile creates /runtime-config with proper permissions.

### 3. Invalid configuration error

**Check config.json structure:**
```bash
oc exec -it <frontend-pod> -- cat /runtime-config/config.json
```

Must have this structure:
```json
{
  "keycloak": {
    "url": "...",
    "realm": "...",
    "clientId": "..."
  }
}
```

**Fix:** Update ConfigMap with correct structure.

### 4. Caddy not serving config.json

**Test Caddy route:**
```bash
oc exec -it <frontend-pod> -- curl http://localhost:3000/config.json
```

Should return JSON, not 404.

**Fix:** Check Caddyfile has the handle `/config.json` block.

### 5. Frontend shows "Failed to load /config.json"

**Check browser console:**
```javascript
fetch('/config.json').then(r => r.json()).then(console.log)
```

**Common causes:**
- ConfigMap not mounted
- Caddy route misconfigured
- File permissions incorrect

---

## Advantages of This Approach

| Aspect | Benefits |
|--------|----------|
| **Security** | No secrets in source code or Docker image |
| **Simplicity** | ConfigMap → Mount → Serve → Load |
| **Debugging** | Direct access to `/config.json` in pod and browser |
| **Configuration** | Single source of truth (ConfigMap) |
| **Deployment** | Same image works across all environments |
| **Validation** | Clear error messages if config missing/invalid |
| **Standards** | Follows Kubernetes/OpenShift best practices |

---

## Why No Environment Variables?

**Original approach (env vars):**
- ❌ Required generating config.json from env vars
- ❌ Extra shell script logic
- ❌ Two sources of truth (ConfigMap → env → config.json)

**Current approach (direct mount):**
- ✅ ConfigMap is directly served as-is
- ✅ No transformation needed
- ✅ One source of truth (ConfigMap)
- ✅ Simpler, more reliable

---

## Summary

✅ **Zero Hardcoded Values** - Configuration from ConfigMap only
✅ **Fail-Fast** - Application errors immediately if config missing
✅ **Simple Architecture** - ConfigMap → Mount → Serve → Load
✅ **Easy Debugging** - Inspect `/config.json` directly
✅ **Kubernetes Native** - Uses standard ConfigMap mounting
✅ **Production Ready** - Same image across all environments

The application expects Keycloak settings at runtime from `/config.json` served by the container, sourced from the mounted ConfigMap. If not available, the application throws a clear error and fails to start.

