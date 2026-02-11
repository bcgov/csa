import type Keycloak from 'keycloak-js'
import React, { createContext, useContext, useEffect, useState } from 'react'
import { initializeKeycloak } from '../config/keycloak.config'
import { verifyCSAAccess } from '../service/admin-service'

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  hasCSAAccess: boolean | null
  csaAccessError: string | null
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
  const [user, setUser] = useState<AuthContextType['user']>(null)
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null)

  useEffect(() => {
    // Initialize Keycloak with runtime config
    const initAuth = async () => {
      try {
        const keycloakInstance = await initializeKeycloak()
        setKeycloak(keycloakInstance)

        keycloakInstance
          .init({
            onLoad: 'check-sso',
            silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
            pkceMethod: 'S256',
            redirectUri: 'https://csa-frontend-dec59b-dev.apps.silver.devops.gov.bc.ca/',
            // redirectUri: window.location.origin + '/',
          })
          .then(async (authenticated) => {
            setIsAuthenticated(authenticated)
            setIsLoading(false)

            if (authenticated && keycloakInstance.tokenParsed) {
              setUser({
                name: keycloakInstance.tokenParsed.name,
                email: keycloakInstance.tokenParsed.email,
                username: keycloakInstance.tokenParsed.preferred_username,
                roles: keycloakInstance.tokenParsed.realm_access?.roles || [],
              })

              // Store token in localStorage
              if (keycloakInstance.token) {
                localStorage.setItem('authToken', keycloakInstance.token)

                console.log('Token stored in localStorage:', keycloakInstance.token)
                console.log('Calling admin api to verify CSA access...')

                // Verify CSA access via admin API
                try {
                  const csaAccessResponse = await verifyCSAAccess()
                  setHasCSAAccess(csaAccessResponse.hasAccess)
                  if (!csaAccessResponse.hasAccess) {
                    setCsaAccessError(
                      csaAccessResponse.message || 'You do not have access to CSA application',
                    )
                  }
                } catch (error) {
                  console.error('Failed to verify CSA access:', error)
                  setHasCSAAccess(false)
                  setCsaAccessError('Failed to verify CSA access. Please try again.')
                }
              }

              // Set up token refresh
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
