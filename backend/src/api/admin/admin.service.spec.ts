import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { KeycloakAuthService } from 'src/common/auth/keycloak-auth.service'
import { AdminService } from './admin.service'

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
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('getUserPermissions', () => {
    it('should return admin permissions for admin users', async () => {
      const result = await service.getUserPermissions('admin.user')

      expect(result).toBeDefined()
      expect(result.username).toBe('admin.user')
      expect(result.permissions.length).toBeGreaterThan(2)
      expect(result.responsibilities).toContain('admin')
      expect(result.retrievedAt).toBeDefined()
    })

    it('should return reviewer permissions for reviewer users', async () => {
      const result = await service.getUserPermissions('reviewer.user')

      expect(result).toBeDefined()
      expect(result.username).toBe('reviewer.user')
      expect(result.responsibilities).toContain('reviewer')
    })

    it('should return basic permissions for regular users', async () => {
      const result = await service.getUserPermissions('regular.user')

      expect(result).toBeDefined()
      expect(result.username).toBe('regular.user')
      expect(result.responsibilities).toContain('user')
      expect(result.permissions.length).toBe(2) // base permissions only
    })
  })

  describe('hasPermission', () => {
    it('should return true for admin user with admin permissions', async () => {
      const result = await service.hasPermission('admin.user', 'admin.access')

      expect(result).toBe(true)
    })

    it('should return false for regular user with admin permissions', async () => {
      const result = await service.hasPermission('regular.user', 'admin.access')

      expect(result).toBe(false)
    })

    it('should return true for all users with read permissions', async () => {
      const result = await service.hasPermission('regular.user', 'applicants.read')

      expect(result).toBe(true)
    })
  })

  describe('hasResponsibility', () => {
    it('should return true for admin user with admin responsibility', async () => {
      const result = await service.hasResponsibility('admin.user', 'admin')

      expect(result).toBe(true)
    })

    it('should return false for regular user with admin responsibility', async () => {
      const result = await service.hasResponsibility('regular.user', 'admin')

      expect(result).toBe(false)
    })

    it('should return true for reviewer user with reviewer responsibility', async () => {
      const result = await service.hasResponsibility('reviewer.user', 'reviewer')

      expect(result).toBe(true)
    })
  })
})
