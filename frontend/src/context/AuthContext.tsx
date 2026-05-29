import type Keycloak from 'keycloak-js'
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getRuntimeConfig, initializeKeycloak } from '../config/keycloak.config'
import { generateMockToken, isLocalMode, MOCK_USER } from '../config/mock-auth'
import { verifyCSAAccess } from '../service/admin-service'

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  hasCSAAccess: boolean | null
  csaAccessError: string | null
  csaAccessAlert: string | null
  clearCsaAccessAlert: () => void
  user: {
    name?: string
    email?: string
    username?: string
    idirUsername?: string
    roles?: string[]
  } | null
  login: () => void
  logout: () => void
  token: string | undefined
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasCSAAccess, setHasCSAAccess] = useState<boolean | null>(null)
  const [csaAccessError, setCsaAccessError] = useState<string | null>(null)
  const [csaAccessAlert, setCsaAccessAlert] = useState<string | null>(null)
  const [user, setUser] = useState<AuthContextType['user']>(null)
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null)
  const [mockToken, setMockToken] = useState<string | undefined>(undefined)

  const clearCsaAccessAlert = useCallback(() => {
    setCsaAccessAlert(null)
  }, [])

  useEffect(() => {
    // Initialize authentication
    const initAuth = async () => {
      // Check if running in local mode - bypass SSO completely
      if (isLocalMode()) {
        console.log('Running in LOCAL mode - bypassing SSO authentication')
        const token = generateMockToken()
        setMockToken(token)
        sessionStorage.setItem('authToken', token)
        setIsAuthenticated(true)
        setHasCSAAccess(true)
        setUser({
          name: MOCK_USER.name,
          email: MOCK_USER.email,
          username: MOCK_USER.username,
          idirUsername: MOCK_USER.idirUsername,
          roles: MOCK_USER.roles,
        })
        setIsLoading(false)
        return
      }

      // Standard Keycloak/SSO authentication flow
      try {
        const keycloakInstance = await initializeKeycloak()
        setKeycloak(keycloakInstance)

        // Check if CSA access was previously denied - if so, skip auto-SSO to avoid loop
        const csaAccessDenied = sessionStorage.getItem('csaAccessDenied')

        keycloakInstance
          .init({
            // If access was denied, don't auto-authenticate (prevents loop)
            onLoad: csaAccessDenied ? undefined : 'check-sso',
            silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
            pkceMethod: 'S256',
            redirectUri: getRuntimeConfig()?.VITE_APP_REDIRECT || window.location.origin + '/',
          })
          .then(async (authenticated) => {
            if (authenticated && keycloakInstance.tokenParsed) {
              if (keycloakInstance.token) {
                sessionStorage.setItem('authToken', keycloakInstance.token)
                console.log('Calling admin api to verify CSA access...')

                // Verify CSA access via admin API
                try {
                  const csaAccessResponse = await verifyCSAAccess()
                  console.log('CSA access response:', csaAccessResponse)

                  // Check if token is expired
                  if (csaAccessResponse.tokenExpired) {
                    console.warn('Token expired, prompting re-login')
                    setIsAuthenticated(false)
                    setHasCSAAccess(false)
                    setCsaAccessAlert('Your session has expired. Please login again.')
                    sessionStorage.removeItem('authToken')
                    setIsLoading(false)
                    keycloakInstance.logout({ redirectUri: window.location.origin })
                    return
                  }

                  // Only grant access if BOTH:
                  // 1. hasAccess is true AND
                  // 2. message is exactly 'User has CSA access'
                  const hasValidAccess =
                    csaAccessResponse.hasAccess === true &&
                    csaAccessResponse.message === 'User has CSA access'

                  if (hasValidAccess) {
                    // Clear any previous access denied flag
                    sessionStorage.removeItem('csaAccessDenied')
                    setIsAuthenticated(true)
                    setHasCSAAccess(true)
                    setUser({
                      name: keycloakInstance.tokenParsed.name,
                      email: keycloakInstance.tokenParsed.email,
                      username: keycloakInstance.tokenParsed.preferred_username,
                      idirUsername: keycloakInstance.tokenParsed.idir_username?.toUpperCase(),
                      roles: keycloakInstance.tokenParsed.realm_access?.roles || [],
                    })
                    setIsLoading(false)

                    // Set up token refresh only when access is granted
                    setInterval(() => {
                      keycloakInstance
                        .updateToken(70)
                        .then((refreshed) => {
                          if (refreshed && keycloakInstance.token) {
                            sessionStorage.setItem('authToken', keycloakInstance.token)
                            console.log('Token refreshed')
                          }
                        })
                        .catch(() => {
                          console.error('Failed to refresh token')
                        })
                    }, 60000) // Check every minute
                  } else {
                    // User is not authorized to access CSA
                    console.warn('CSA access denied:', csaAccessResponse)
                    setIsAuthenticated(false)
                    setHasCSAAccess(false)
                    setCsaAccessError(
                      csaAccessResponse.message || 'You do not have access to CSA application',
                    )
                    setCsaAccessAlert('User not authorised to access CSA')
                    sessionStorage.removeItem('authToken')
                    // Set flag to prevent SSO loop on redirect
                    sessionStorage.setItem('csaAccessDenied', 'true')
                    // Clear Keycloak token locally without triggering IdP logout
                    keycloakInstance.clearToken()
                    setIsLoading(false)
                    // Redirect to landing page
                    window.location.href = window.location.origin
                  }
                } catch (error) {
                  console.error('Failed to verify CSA access:', error)
                  setIsAuthenticated(false)
                  setHasCSAAccess(false)
                  setCsaAccessError('Failed to verify CSA access. Please try again.')
                  setCsaAccessAlert('User not authorised to access CSA')
                  sessionStorage.removeItem('authToken')
                  // Set flag to prevent SSO loop on redirect
                  sessionStorage.setItem('csaAccessDenied', 'true')
                  // Clear Keycloak token locally without triggering IdP logout
                  keycloakInstance.clearToken()
                  setIsLoading(false)
                  // Redirect to landing page
                  window.location.href = window.location.origin
                }
              } else {
                setIsAuthenticated(false)
                setIsLoading(false)
              }
            } else {
              // Not authenticated via Keycloak
              setIsLoading(false)
            }
          })
          .catch((error) => {
            console.error('Keycloak initialization failed:', error)
            setIsLoading(false)
          })
      } catch (error) {
        console.error('Failed to load Keycloak config:', error)
        setIsLoading(false)
      }
    }

    initAuth()
  }, [])

  const login = () => {
    // In local mode, just set authenticated
    if (isLocalMode()) {
      const token = generateMockToken()
      setMockToken(token)
      sessionStorage.setItem('authToken', token)
      setIsAuthenticated(true)
      setHasCSAAccess(true)
      setUser({
        name: MOCK_USER.name,
        email: MOCK_USER.email,
        username: MOCK_USER.username,
        idirUsername: MOCK_USER.idirUsername,
        roles: MOCK_USER.roles,
      })
      return
    }
    // Clear access denied flag to allow retry
    sessionStorage.removeItem('csaAccessDenied')
    keycloak?.login()
  }

  const logout = () => {
    sessionStorage.removeItem('authToken')
    // In local mode, just clear state
    if (isLocalMode()) {
      setMockToken(undefined)
      setIsAuthenticated(false)
      setHasCSAAccess(null)
      setUser(null)
      return
    }
    keycloak?.logout({
      redirectUri: window.location.origin,
    })
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        hasCSAAccess,
        csaAccessError,
        csaAccessAlert,
        clearCsaAccessAlert,
        user,
        login,
        logout,
        token: mockToken || keycloak?.token,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
