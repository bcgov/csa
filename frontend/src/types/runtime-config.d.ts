// Runtime configuration loaded from /config.json
// This file is generated at container startup from environment variables
export interface RuntimeConfig {
  VITE_KEYCLOAK_URL: string
  VITE_KEYCLOAK_REALM: string
  VITE_KEYCLOAK_CLIENT_ID: string
  VITE_API_BASE_URL?: string
}

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: RuntimeConfig
  }
}

export { }

