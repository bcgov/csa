import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { of, throwError } from 'rxjs'
import { KeycloakAuthService } from 'src/common/auth/keycloak-auth.service'
import { AdminService } from './admin.service'

describe('AdminService', () => {
  let service: AdminService
  let mockHttpService: { get: ReturnType<typeof vi.fn> }

  const mockConfigService = {
    get: vi.fn((key: string) => {
      const config: Record<string, string> = {
        'admin.icmApiUrl': 'https://icm.example.com',
        'admin.icmTrustedUsername': 'trusted-user',
        'app.deployEnv': 'dev',
      }
      return config[key]
    }),
  }

  const mockKeycloakAuthService = {
    getBearerToken: vi.fn().mockResolvedValue('mock-bearer-token'),
  }

  // ICM API response mocks
  const createICMApiResponse = (responsibilities: { Name: string }[]) => ({
    data: {
      lastpage: 'true',
      items: {
        Id: '1',
        'Party Name': 'Test User',
        'Login Name': 'testuser',
        Responsibility: responsibilities.map((r) => ({ ...r, Id: '1', Link: [] })),
        Link: [],
      },
      Link: { rel: '', href: '', name: '' },
    },
  })

  beforeEach(async () => {
    mockHttpService = {
      get: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: KeycloakAuthService,
          useValue: mockKeycloakAuthService,
        },
      ],
    }).compile()

    service = module.get<AdminService>(AdminService)
    vi.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('verifyCSAAccess', () => {
    it('should return hasAccess true for users with RW responsibility', async () => {
      mockHttpService.get.mockReturnValue(
        of(createICMApiResponse([{ Name: 'ICM CSA Application - RW' }])),
      )

      const result = await service.verifyCSAAccess('admin.user')

      expect(result.hasAccess).toBe(true)
      expect(result.message).toBe('User has CSA access')
      expect(result.icmResponsibility).toBe('ICM CSA Application - RW')
    })

    it('should return hasAccess true for users with RO responsibility', async () => {
      mockHttpService.get.mockReturnValue(
        of(createICMApiResponse([{ Name: 'ICM CSA Application - RO' }])),
      )

      const result = await service.verifyCSAAccess('reviewer.user')

      expect(result.hasAccess).toBe(true)
      expect(result.message).toBe('User has CSA access')
      expect(result.icmResponsibility).toBe('ICM CSA Application - RO')
    })

    it('should return hasAccess false for users without CSA responsibility', async () => {
      mockHttpService.get.mockReturnValue(of(createICMApiResponse([])))

      const result = await service.verifyCSAAccess('regular.user')

      expect(result.hasAccess).toBe(false)
      expect(result.message).toBe('User does not have ICM CSA Application responsibility')
    })

    it('should return hasAccess false when ICM API fails', async () => {
      mockHttpService.get.mockReturnValue(throwError(() => new Error('ICM API error')))

      const result = await service.verifyCSAAccess('any.user')

      expect(result.hasAccess).toBe(false)
      expect(result.message).toBe('Failed to verify user access from ICM system')
    })

    it('should prefer RW over RO when user has both responsibilities', async () => {
      mockHttpService.get.mockReturnValue(
        of(
          createICMApiResponse([
            { Name: 'ICM CSA Application - RW' },
            { Name: 'ICM CSA Application - RO' },
          ]),
        ),
      )

      const result = await service.verifyCSAAccess('admin.user')

      expect(result.hasAccess).toBe(true)
      expect(result.icmResponsibility).toBe('ICM CSA Application - RW')
    })
  })
})
