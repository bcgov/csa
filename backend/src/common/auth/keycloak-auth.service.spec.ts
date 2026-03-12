import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { of, throwError } from 'rxjs'
import { KeycloakAuthService } from './keycloak-auth.service'

describe('KeycloakAuthService', () => {
  let service: KeycloakAuthService
  let httpService: { post: ReturnType<typeof vi.fn> }
  let configService: { get: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    httpService = { post: vi.fn() }

    configService = {
      get: vi.fn((key: string) => {
        const values: Record<string, string> = {
          'admin.keycloakTokenUrl': 'http://keycloak/token',
          'admin.keycloakClientId': 'client-id',
          'admin.keycloakClientSecret': 'client-secret',
        }
        return values[key]
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeycloakAuthService,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile()

    service = module.get<KeycloakAuthService>(KeycloakAuthService)
  })

  it('should request token from Keycloak with client_credentials', async () => {
    httpService.post.mockReturnValue(of({ data: { access_token: 'test-token', expires_in: 300 } }))

    const token = await service.getBearerToken()

    expect(token).toBe('test-token')
    expect(httpService.post).toHaveBeenCalledWith(
      'http://keycloak/token',
      expect.any(URLSearchParams),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    )
  })

  it('should reuse cached token on subsequent calls', async () => {
    httpService.post.mockReturnValue(of({ data: { access_token: 'test-token', expires_in: 300 } }))

    const token1 = await service.getBearerToken()
    const token2 = await service.getBearerToken()

    expect(token1).toBe('test-token')
    expect(token2).toBe('test-token')
    // Should only make one HTTP call since token is cached
    expect(httpService.post).toHaveBeenCalledTimes(1)
  })

  it('should refresh token when access token is expired', async () => {
    // First call returns token with refresh_token
    httpService.post.mockReturnValueOnce(
      of({
        data: {
          access_token: 'initial-token',
          refresh_token: 'refresh-token',
          expires_in: 1, // Very short expiry
        },
      }),
    )

    const token1 = await service.getBearerToken()
    expect(token1).toBe('initial-token')

    // Wait for token to expire (considering the 60s buffer, it should already be considered expired)
    // Second call should use refresh_token
    httpService.post.mockReturnValueOnce(
      of({
        data: {
          access_token: 'refreshed-token',
          refresh_token: 'new-refresh-token',
          expires_in: 300,
        },
      }),
    )

    const token2 = await service.getBearerToken()
    expect(token2).toBe('refreshed-token')
    expect(httpService.post).toHaveBeenCalledTimes(2)
  })

  it('should fall back to client_credentials when refresh fails', async () => {
    // First call returns token with refresh_token
    httpService.post.mockReturnValueOnce(
      of({
        data: {
          access_token: 'initial-token',
          refresh_token: 'refresh-token',
          expires_in: 1,
        },
      }),
    )

    await service.getBearerToken()

    // Refresh fails
    httpService.post.mockReturnValueOnce(throwError(() => new Error('Refresh failed')))
    // Fallback to client_credentials succeeds
    httpService.post.mockReturnValueOnce(
      of({
        data: {
          access_token: 'new-token',
          expires_in: 300,
        },
      }),
    )

    const token = await service.getBearerToken()
    expect(token).toBe('new-token')
  })

  it('should clear token cache when clearTokenCache is called', async () => {
    httpService.post.mockReturnValue(of({ data: { access_token: 'test-token', expires_in: 300 } }))

    await service.getBearerToken()
    expect(httpService.post).toHaveBeenCalledTimes(1)

    service.clearTokenCache()

    await service.getBearerToken()
    // Should make a new HTTP call after cache is cleared
    expect(httpService.post).toHaveBeenCalledTimes(2)
  })
})
