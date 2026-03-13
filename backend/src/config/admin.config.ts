import { registerAs } from '@nestjs/config'

export const adminConfig = registerAs('admin', () => {
  const icmApiUrl = process.env.ICM_API_URL?.replace(/\/Employee\/?$/, '')
  const icmTrustedUsername = process.env.ICM_TRUSTED_USERNAME
  const icmUsername = process.env.ICM_API_USERNAME
  const keycloakTokenUrl = process.env.ICM_TOKEN_URL
  const keycloakClientId = process.env.ICM_CLIENT_ID
  const keycloakClientSecret = process.env.ICM_CLIENT_SECRET

  // SSO Keycloak JWKS URL for verifying frontend tokens
  const ssoKeycloakUrl = process.env.SSO_KEYCLOAK_URL
  const ssoKeycloakRealm = process.env.SSO_KEYCLOAK_REALM
  const ssoKeycloakJwksUrl =
    ssoKeycloakUrl && ssoKeycloakRealm
      ? `${ssoKeycloakUrl.replace(/\/$/, '')}/realms/${ssoKeycloakRealm}/protocol/openid-connect/certs`
      : undefined

  if (!icmApiUrl) {
    throw new Error('ICM_API_URL is required')
  }
  if (!icmTrustedUsername) {
    throw new Error('ICM_TRUSTED_USERNAME is required')
  }
  if (!icmUsername) {
    throw new Error('ICM_API_USERNAME is required')
  }
  if (!keycloakTokenUrl) {
    throw new Error('KEYCLOAK_TOKEN_URL is required')
  }
  if (!keycloakClientId) {
    throw new Error('KEYCLOAK_CLIENT_ID is required')
  }
  if (!keycloakClientSecret) {
    throw new Error('KEYCLOAK_CLIENT_SECRET is required')
  }
  if (!ssoKeycloakJwksUrl) {
    throw new Error('SSO_KEYCLOAK_URL and SSO_KEYCLOAK_REALM are required')
  }

  return {
    icmApiUrl,
    icmTrustedUsername,
    icmUsername,
    keycloakTokenUrl,
    keycloakClientId,
    keycloakClientSecret,
    ssoKeycloakJwksUrl,
  }
})
