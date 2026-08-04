import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../context/AuthContext'

const { mockInitializeKeycloak, mockGetRuntimeConfig, mockVerifyCSAAccess } = vi.hoisted(() => ({
  mockInitializeKeycloak: vi.fn(),
  mockGetRuntimeConfig: vi.fn(),
  mockVerifyCSAAccess: vi.fn(),
}))

vi.mock('../config/keycloak.config', () => ({
  initializeKeycloak: mockInitializeKeycloak,
  getRuntimeConfig: mockGetRuntimeConfig,
}))

vi.mock('../service/admin-service', () => ({
  verifyCSAAccess: mockVerifyCSAAccess,
}))

function AuthProbe() {
  const { isLoading, hasCSAAccess, user, logout } = useAuth()

  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="has-access">{String(hasCSAAccess)}</div>
      <div data-testid="profile">{user?.userProfile ?? ''}</div>
      <button onClick={logout}>logout</button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()

    mockGetRuntimeConfig.mockReturnValue({
      VITE_APP_REDIRECT: 'http://localhost/',
    })

    vi.spyOn(global, 'setInterval').mockImplementation(() => 1 as unknown as NodeJS.Timeout)
  })

  it('stores userProfile and icmResponsibility in session storage on successful login', async () => {
    const keycloakMock = {
      token: 'mock-token',
      tokenParsed: {
        name: 'Test User',
        email: 'test@example.com',
        preferred_username: 'test.user',
        idir_username: 'idir\\test.user',
        realm_access: { roles: ['user'] },
      },
      init: vi.fn().mockResolvedValue(true),
      login: vi.fn(),
      logout: vi.fn(),
      clearToken: vi.fn(),
      updateToken: vi.fn().mockResolvedValue(false),
    }

    mockInitializeKeycloak.mockResolvedValue(keycloakMock)
    mockVerifyCSAAccess.mockResolvedValue({
      hasAccess: true,
      username: 'test.user',
      userInfo: { username: 'test.user' },
      message: 'User has CSA access',
      userProfile: 'DATA_QUALITY_STEWARD',
      icmResponsibility: 'ICM CSA Application - RW',
    })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    expect(screen.getByTestId('has-access')).toHaveTextContent('true')
    expect(screen.getByTestId('profile')).toHaveTextContent('DATA_QUALITY_STEWARD')
    expect(sessionStorage.getItem('userProfile')).toBe('DATA_QUALITY_STEWARD')
    expect(sessionStorage.getItem('icmResponsibility')).toBe('ICM CSA Application - RW')
  })

  it('clears cached profile keys and logs out when token is expired', async () => {
    sessionStorage.setItem('userProfile', 'CSA_STANDARD')
    sessionStorage.setItem('icmResponsibility', 'ICM CSA Application - RO')

    const keycloakMock = {
      token: 'mock-token',
      tokenParsed: {
        name: 'Test User',
        email: 'test@example.com',
        preferred_username: 'test.user',
        idir_username: 'idir\\test.user',
        realm_access: { roles: ['user'] },
      },
      init: vi.fn().mockResolvedValue(true),
      login: vi.fn(),
      logout: vi.fn(),
      clearToken: vi.fn(),
      updateToken: vi.fn().mockResolvedValue(false),
    }

    mockInitializeKeycloak.mockResolvedValue(keycloakMock)
    mockVerifyCSAAccess.mockResolvedValue({
      hasAccess: false,
      username: 'test.user',
      userInfo: { username: 'test.user' },
      message: 'Token expired',
      tokenExpired: true,
    })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(keycloakMock.logout).toHaveBeenCalled()
    })

    expect(sessionStorage.getItem('userProfile')).toBeNull()
    expect(sessionStorage.getItem('icmResponsibility')).toBeNull()
  })

  it('clears cached profile keys on explicit logout', async () => {
    const keycloakMock = {
      token: 'mock-token',
      tokenParsed: {
        name: 'Test User',
        email: 'test@example.com',
        preferred_username: 'test.user',
        idir_username: 'idir\\test.user',
        realm_access: { roles: ['user'] },
      },
      init: vi.fn().mockResolvedValue(true),
      login: vi.fn(),
      logout: vi.fn(),
      clearToken: vi.fn(),
      updateToken: vi.fn().mockResolvedValue(false),
    }

    mockInitializeKeycloak.mockResolvedValue(keycloakMock)
    mockVerifyCSAAccess.mockResolvedValue({
      hasAccess: true,
      username: 'test.user',
      userInfo: { username: 'test.user' },
      message: 'User has CSA access',
      userProfile: 'CSA_STANDARD',
      icmResponsibility: 'ICM CSA Application - RO',
    })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    fireEvent.click(screen.getByRole('button', { name: 'logout' }))

    expect(sessionStorage.getItem('authToken')).toBeNull()
    expect(sessionStorage.getItem('userProfile')).toBeNull()
    expect(sessionStorage.getItem('icmResponsibility')).toBeNull()
    expect(keycloakMock.logout).toHaveBeenCalledWith({ redirectUri: window.location.origin })
  })
})
