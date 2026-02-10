import { registerAs } from '@nestjs/config'

export const adminConfig = registerAs('admin', () => {
  const icmApiUrl = process.env.ICM_API_URL
  const icmTrustedUsername = process.env.ICM_TRUSTED_USERNAME
  const keycloakTokenUrl = process.env.KEYCLOAK_TOKEN_URL
  const keycloakClientId = process.env.KEYCLOAK_CLIENT_ID
  const keycloakClientSecret = process.env.KEYCLOAK_CLIENT_SECRET

  const useMockData = process.env.USE_MOCK_DATA === 'true'
  if (!useMockData) {
    if (!icmApiUrl) throw new Error('ICM_API_URL is required')
    if (!icmTrustedUsername) throw new Error('ICM_TRUSTED_USERNAME is required')
    if (!keycloakTokenUrl) throw new Error('KEYCLOAK_TOKEN_URL is required')
    if (!keycloakClientId) throw new Error('KEYCLOAK_CLIENT_ID is required')
    if (!keycloakClientSecret) throw new Error('KEYCLOAK_CLIENT_SECRET is required')
  }

  return {
    icmApiUrl,
    icmTrustedUsername,
    keycloakTokenUrl,
    keycloakClientId,
    keycloakClientSecret,
  }
})
