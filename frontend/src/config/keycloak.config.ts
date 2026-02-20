import Keycloak from 'keycloak-js'
import type { RuntimeConfig } from '../types/runtime-config'

// Load runtime configuration from /config.json served by the container
async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const response = await fetch('/config.json')
    if (!response.ok) {
      throw new Error(`Failed to load /config.json: ${response.status} ${response.statusText}`)
    }

    const config = await response.json()

    // Extract Keycloak settings from the config
    const keycloakConfig = config.keycloak

    if (!keycloakConfig) {
      throw new Error(
        'Keycloak configuration not found in /config.json. Expected "keycloak" property.',
      )
    }

    // Validate required fields
    if (!keycloakConfig.url || !keycloakConfig.realm || !keycloakConfig.clientId) {
      throw new Error(
        'Invalid Keycloak configuration in /config.json. Required: url, realm, clientId',
      )
    }

    const runtimeConfig: RuntimeConfig = {
      VITE_KEYCLOAK_URL: keycloakConfig.url,
      VITE_KEYCLOAK_REALM: keycloakConfig.realm,
      VITE_KEYCLOAK_CLIENT_ID: keycloakConfig.clientId,
      VITE_API_BASE_URL: config.apiBaseUrl || '/api', // Load API base URL from config
      VITE_APP_REDIRECT_URI: config.redirectUri || window.location.origin + '/', // Load redirect URI from config
    }

    // Cache the config
    window.__RUNTIME_CONFIG__ = runtimeConfig
    console.log('Keycloak configuration loaded successfully from /config.json')
    console.log('API base URL:', runtimeConfig.VITE_API_BASE_URL)

    return runtimeConfig
  } catch (error) {
    console.error('Failed to load Keycloak configuration from /config.json:', error)
    throw new Error(
      'Application requires runtime configuration from /config.json. Please ensure the ConfigMap is properly mounted.',
    )
  }
}

// Get runtime config (use cached version if available)
function getRuntimeConfig(): RuntimeConfig | null {
  return window.__RUNTIME_CONFIG__ || null
}

// Initialize Keycloak with runtime configuration
async function initializeKeycloak(): Promise<Keycloak> {
  const config = await loadRuntimeConfig()

  // Create Keycloak instance with runtime configuration
  const keycloakInstance = new Keycloak({
    url: config.VITE_KEYCLOAK_URL,
    realm: config.VITE_KEYCLOAK_REALM,
    clientId: config.VITE_KEYCLOAK_CLIENT_ID,
  })

  return keycloakInstance
}

export { getRuntimeConfig, initializeKeycloak }
