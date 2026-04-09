// Runtime configuration loaded from /config.json
// This file is generated at container startup from environment variables
export type AppEnvironment = 'DEV' | 'TEST' | 'PRE-PROD' | 'PROD'

export interface RuntimeConfig {
  VITE_KEYCLOAK_URL: string
  VITE_KEYCLOAK_REALM: string
  VITE_KEYCLOAK_CLIENT_ID: string
  VITE_API_BASE_URL?: string
  VITE_APP_REDIRECT?: string
  VITE_APP_ENV?: AppEnvironment
}

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: RuntimeConfig
  }
}

export {}
