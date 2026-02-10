import { Test, TestingModule } from '@nestjs/testing'
import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { of } from 'rxjs'
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
    httpService.post.mockReturnValue(of({ data: { access_token: 'test-token' } }))

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
})
