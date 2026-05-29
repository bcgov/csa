/**
 * Mock authentication utilities for local development
 * Used when VITE_APP_ENV=LOCAL to bypass SSO completely
 */

export interface MockUser {
  name: string
  email: string
  username: string
  idirUsername: string
  roles: string[]
}

// Default mock user for local development
export const MOCK_USER: MockUser = {
  name: 'Local Dev User',
  email: 'local.dev@gov.bc.ca',
  username: 'localdev',
  idirUsername: 'LOCALDEV',
  roles: ['csa-user'],
}

/**
 * Generate a mock JWT token for local development
 * This token won't be cryptographically signed but contains the expected claims
 * The backend should skip signature verification when SKIP_SSO_VERIFICATION=true
 */
export function generateMockToken(user: MockUser = MOCK_USER): string {
  const header = {
    alg: 'none', // No signature for mock token
    typ: 'JWT',
  }

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    exp: now + 3600 * 8, // 8 hours from now
    iat: now,
    sub: user.username,
    name: user.name,
    email: user.email,
    preferred_username: user.username,
    idir_username: user.idirUsername,
    realm_access: {
      roles: user.roles,
    },
    // Mark this as a mock token so backend can identify it
    mock_token: true,
  }

  // Base64URL encode
  const base64UrlEncode = (obj: object): string => {
    const json = JSON.stringify(obj)
    const base64 = btoa(json)
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  // Create unsigned JWT (header.payload.)
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.mock_signature`
}

/**
 * Check if we're running in local development mode
 */
export function isLocalMode(): boolean {
  // Check Vite env variable (case-insensitive)
  const viteEnv = import.meta.env.VITE_APP_ENV
  const isLocal = viteEnv?.toUpperCase() === 'LOCAL'

  if (isLocal) {
    console.log('Local mode detected: VITE_APP_ENV =', viteEnv)
  }

  return isLocal
}
