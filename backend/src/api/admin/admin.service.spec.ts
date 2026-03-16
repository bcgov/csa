import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { KeycloakAuthService } from 'src/common/auth/keycloak-auth.service'
import { AdminService } from './admin.service'
import { ICMEmployeeResponse } from './interfaces/icm-api.interface'

describe('AdminService', () => {
  let service: AdminService

  const mockHttpService = {
    post: vi.fn(),
    get: vi.fn(),
  }

  const mockConfigService = {
    get: vi.fn(),
  }

  const mockKeycloakAuthService = {
    getBearerToken: vi.fn().mockResolvedValue('mock-bearer-token'),
  }

  // ICM response mocks
  const createICMResponse = (responsibilities: { Name: string }[]): ICMEmployeeResponse => ({
    lastpage: 'true',
    items: {
      Id: '1',
      'Party Name': 'Test User',
      'Login Name': 'testuser',
      Responsibility: responsibilities.map((r) => ({ ...r, Id: '1', Link: [] })),
      Link: [],
    },
    Link: { rel: '', href: '', name: '' },
  })

  const icmRWResponse = createICMResponse([{ Name: 'ICM CSA Application - RW' }])
  const icmROResponse = createICMResponse([{ Name: 'ICM CSA Application - RO' }])
  const icmNoAccessResponse = createICMResponse([])

  beforeEach(async () => {
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

  describe('getUserPermissions', () => {
    it('should return admin permissions for users with RW access', async () => {
      vi.spyOn(service, 'fetchUserFromICM').mockResolvedValue(icmRWResponse)

      const result = await service.getUserPermissions('admin.user')

      expect(result).toBeDefined()
      expect(result.username).toBe('admin.user')
      expect(result.permissions.length).toBeGreaterThan(2)
      expect(result.responsibilities).toContain('admin')
      expect(result.retrievedAt).toBeDefined()
    })

    it('should return reviewer permissions for users with RO access', async () => {
      vi.spyOn(service, 'fetchUserFromICM').mockResolvedValue(icmROResponse)

      const result = await service.getUserPermissions('reviewer.user')

      expect(result).toBeDefined()
      expect(result.username).toBe('reviewer.user')
      expect(result.responsibilities).toContain('reviewer')
    })

    it('should return basic permissions for users without CSA access', async () => {
      vi.spyOn(service, 'fetchUserFromICM').mockResolvedValue(icmNoAccessResponse)

      const result = await service.getUserPermissions('regular.user')

      expect(result).toBeDefined()
      expect(result.username).toBe('regular.user')
      expect(result.responsibilities).toContain('user')
      expect(result.permissions.length).toBe(2) // base permissions only
    })
  })

  describe('hasPermission', () => {
    it('should return true for user with RW access checking admin permissions', async () => {
      vi.spyOn(service, 'fetchUserFromICM').mockResolvedValue(icmRWResponse)

      const result = await service.hasPermission('admin.user', 'admin.access')

      expect(result).toBe(true)
    })

    it('should return false for user without CSA access checking admin permissions', async () => {
      vi.spyOn(service, 'fetchUserFromICM').mockResolvedValue(icmNoAccessResponse)

      const result = await service.hasPermission('regular.user', 'admin.access')

      expect(result).toBe(false)
    })

    it('should return true for all users with read permissions', async () => {
      vi.spyOn(service, 'fetchUserFromICM').mockResolvedValue(icmNoAccessResponse)

      const result = await service.hasPermission('regular.user', 'applicants.read')

      expect(result).toBe(true)
    })
  })

  describe('hasResponsibility', () => {
    it('should return true for user with RW access checking admin responsibility', async () => {
      vi.spyOn(service, 'fetchUserFromICM').mockResolvedValue(icmRWResponse)

      const result = await service.hasResponsibility('admin.user', 'admin')

      expect(result).toBe(true)
    })

    it('should return false for user without CSA access checking admin responsibility', async () => {
      vi.spyOn(service, 'fetchUserFromICM').mockResolvedValue(icmNoAccessResponse)

      const result = await service.hasResponsibility('regular.user', 'admin')

      expect(result).toBe(false)
    })

    it('should return true for user with RO access checking reviewer responsibility', async () => {
      vi.spyOn(service, 'fetchUserFromICM').mockResolvedValue(icmROResponse)

      const result = await service.hasResponsibility('reviewer.user', 'reviewer')

      expect(result).toBe(true)
    })
  })
})
