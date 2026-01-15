import React, { createContext, useContext, useEffect, useState } from 'react'
import keycloak from '../config/keycloak.config'

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
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
  const [user, setUser] = useState<AuthContextType['user']>(null)

  useEffect(() => {
    // Initialize Keycloak
    keycloak
      .init({
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
        pkceMethod: 'S256',
        redirectUri: 'https://csa-frontend-dec59b-dev.apps.silver.devops.gov.bc.ca/',
        // redirectUri: window.location.origin + '/',
      })
      .then((authenticated) => {
        setIsAuthenticated(authenticated)
        setIsLoading(false)

        if (authenticated && keycloak.tokenParsed) {
          setUser({
            name: keycloak.tokenParsed.name,
            email: keycloak.tokenParsed.email,
            username: keycloak.tokenParsed.preferred_username,
            roles: keycloak.tokenParsed.realm_access?.roles || [],
          })

          // Store token in localStorage
          if (keycloak.token) {
            localStorage.setItem('authToken', keycloak.token)
          }

          // Set up token refresh
          setInterval(() => {
            keycloak
              .updateToken(70)
              .then((refreshed) => {
                if (refreshed && keycloak.token) {
                  localStorage.setItem('authToken', keycloak.token)
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
  }, [])

  const login = () => {
    keycloak.login()
  }

  const logout = () => {
    localStorage.removeItem('authToken')
    keycloak.logout({
      redirectUri: window.location.origin,
    })
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        login,
        logout,
        token: keycloak.token,
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
