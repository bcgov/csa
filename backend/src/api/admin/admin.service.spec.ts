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
    it('should bypass ICM when DEPLOY_ENV is local', async () => {
      mockConfigService.get.mockImplementationOnce((key: string) => {
        if (key === 'app.deployEnv') return 'local'
        return undefined
      })

      const result = await service.verifyCSAAccess('any.user')

      expect(result.hasAccess).toBe(true)
      expect(result.message).toBe('User has CSA access')
      expect(result.userProfile).toBe('CSA_STANDARD')
      expect(result.icmResponsibility).toBe('ICM CSA Application - RW')
      expect(mockHttpService.get).not.toHaveBeenCalled()
    })

    it('should honor local dev profile hint when DEPLOY_ENV is local', async () => {
      mockConfigService.get.mockImplementationOnce((key: string) => {
        if (key === 'app.deployEnv') return 'local'
        return undefined
      })

      const result = await service.verifyCSAAccess('any.user', 'DATA_QUALITY_STEWARD')

      expect(result.userProfile).toBe('DATA_QUALITY_STEWARD')
      expect(result.icmResponsibility).toBe('ICM Data Steward')
    })

    it('should return hasAccess true for users with RW responsibility', async () => {
      mockHttpService.get.mockReturnValue(
        of(createICMApiResponse([{ Name: 'ICM CSA Application - RW' }])),
      )

      const result = await service.verifyCSAAccess('admin.user')

      expect(result.hasAccess).toBe(true)
      expect(result.message).toBe('User has CSA access')
      expect(result.userProfile).toBe('CSA_STANDARD')
      expect(result.icmResponsibility).toBe('ICM CSA Application - RW')
    })

    it('should return hasAccess true for users with RO responsibility', async () => {
      mockHttpService.get.mockReturnValue(
        of(createICMApiResponse([{ Name: 'ICM CSA Application - RO' }])),
      )

      const result = await service.verifyCSAAccess('reviewer.user')

      expect(result.hasAccess).toBe(true)
      expect(result.message).toBe('User has CSA access')
      expect(result.userProfile).toBe('CSA_STANDARD')
      expect(result.icmResponsibility).toBe('ICM CSA Application - RO')
    })

    it('should return DATA_QUALITY_STEWARD for users with Data Steward and RW responsibilities', async () => {
      mockHttpService.get.mockReturnValue(
        of(
          createICMApiResponse([
            { Name: 'ICM Data Steward' },
            { Name: 'ICM CSA Application - RW' },
          ]),
        ),
      )

      const result = await service.verifyCSAAccess('data.steward.user')

      expect(result.hasAccess).toBe(true)
      expect(result.message).toBe('User has CSA access')
      expect(result.userProfile).toBe('DATA_QUALITY_STEWARD')
      expect(result.icmResponsibility).toBe('ICM CSA Application - RW')
    })

    it('should return hasAccess false for users with Data Steward and RO responsibilities', async () => {
      mockHttpService.get.mockReturnValue(
        of(
          createICMApiResponse([
            { Name: 'ICM Data Steward' },
            { Name: 'ICM CSA Application - RO' },
          ]),
        ),
      )

      const result = await service.verifyCSAAccess('data.steward.ro.user')

      expect(result.hasAccess).toBe(false)
      expect(result.message).toBe('User does not have ICM CSA Application responsibility')
    })

    it('should return hasAccess false for users with only Data Steward responsibility', async () => {
      mockHttpService.get.mockReturnValue(of(createICMApiResponse([{ Name: 'ICM Data Steward' }])))

      const result = await service.verifyCSAAccess('data.steward.only.user')

      expect(result.hasAccess).toBe(false)
      expect(result.message).toBe('User does not have ICM CSA Application responsibility')
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

    it('should return CSA_STANDARD when user has both RW and RO responsibilities', async () => {
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
      expect(result.message).toBe('User has CSA access')
      expect(result.userProfile).toBe('CSA_STANDARD')
      expect(result.icmResponsibility).toBe('ICM CSA Application - RW')
    })
  })
})
