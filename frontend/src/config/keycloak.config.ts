import Keycloak from 'keycloak-js'

// Keycloak configuration
const keycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_URL || 'https://your-keycloak-server.com/auth',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'your-realm',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'csa-frontend',
}

// Initialize Keycloak instance
const keycloak = new Keycloak(keycloakConfig)

export default keycloak
