import type Keycloak from 'keycloak-js'
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getRuntimeConfig, initializeKeycloak } from '../config/keycloak.config'
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

  const clearCsaAccessAlert = useCallback(() => {
    setCsaAccessAlert(null)
  }, [])

  useEffect(() => {
    // Initialize Keycloak with runtime config
    const initAuth = async () => {
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
              // Clear any mock login state when using Keycloak SSO
              localStorage.removeItem('isLoggedIn')

              // Store token in localStorage
              if (keycloakInstance.token) {
                localStorage.setItem('authToken', keycloakInstance.token)

                console.log('Token stored in localStorage:', keycloakInstance.token)
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
                    localStorage.removeItem('authToken')
                    localStorage.removeItem('isLoggedIn') // Clear mock login state as well
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
                      roles: keycloakInstance.tokenParsed.realm_access?.roles || [],
                    })
                    setIsLoading(false)

                    // Set up token refresh only when access is granted
                    setInterval(() => {
                      keycloakInstance
                        .updateToken(70)
                        .then((refreshed) => {
                          if (refreshed && keycloakInstance.token) {
                            localStorage.setItem('authToken', keycloakInstance.token)
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
                    localStorage.removeItem('authToken')
                    localStorage.removeItem('isLoggedIn') // Clear mock login state as well
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
                  localStorage.removeItem('authToken')
                  localStorage.removeItem('isLoggedIn') // Clear mock login state as well
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
    // Clear access denied flag to allow retry
    sessionStorage.removeItem('csaAccessDenied')
    keycloak?.login()
  }

  const logout = () => {
    localStorage.removeItem('authToken')
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
        token: keycloak?.token,
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
