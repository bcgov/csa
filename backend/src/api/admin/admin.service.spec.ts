import { Test, TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import { AdminService } from './admin.service'
import * as jwt from 'jsonwebtoken'

describe('AdminService', () => {
  let service: AdminService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService],
    }).compile()

    service = module.get<AdminService>(AdminService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('decodeToken', () => {
    it('should decode a valid JWT token', () => {
      const mockPayload = {
        sub: 'user123',
        preferred_username: 'john.doe',
        email: 'john.doe@example.com',
        given_name: 'John',
        family_name: 'Doe',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }

      const token = jwt.sign(mockPayload, 'secret')
      const result = service.decodeToken(token)

      expect(result).toBeDefined()
      expect(result.username).toBe('john.doe')
      expect(result.email).toBe('john.doe@example.com')
      expect(result.firstName).toBe('John')
      expect(result.lastName).toBe('Doe')
      expect(result.sub).toBe('user123')
    })

    it('should handle Bearer prefix in token', () => {
      const mockPayload = {
        preferred_username: 'jane.doe',
        email: 'jane.doe@example.com',
      }

      const token = jwt.sign(mockPayload, 'secret')
      const bearerToken = `Bearer ${token}`
      const result = service.decodeToken(bearerToken)

      expect(result.username).toBe('jane.doe')
    })

    it('should throw UnauthorizedException for invalid token', () => {
      expect(() => service.decodeToken('invalid-token')).toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException for empty token', () => {
      expect(() => service.decodeToken('')).toThrow(UnauthorizedException)
    })

    it('should use email as username if preferred_username is not present', () => {
      const mockPayload = {
        email: 'user@example.com',
        sub: 'user456',
      }

      const token = jwt.sign(mockPayload, 'secret')
      const result = service.decodeToken(token)

      expect(result.username).toBe('user@example.com')
    })

    it('should use sub as username if both preferred_username and email are not present', () => {
      const mockPayload = {
        sub: 'user789',
      }

      const token = jwt.sign(mockPayload, 'secret')
      const result = service.decodeToken(token)

      expect(result.username).toBe('user789')
    })
  })

  describe('extractUsername', () => {
    it('should extract username from token', () => {
      const mockPayload = {
        preferred_username: 'test.user',
      }

      const token = jwt.sign(mockPayload, 'secret')
      const username = service.extractUsername(token)

      expect(username).toBe('test.user')
    })
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

  describe('getPermissionsFromToken', () => {
    it('should get permissions directly from token', async () => {
      const mockPayload = {
        preferred_username: 'admin.user',
      }

      const token = jwt.sign(mockPayload, 'secret')
      const result = await service.getPermissionsFromToken(token)

      expect(result).toBeDefined()
      expect(result.username).toBe('admin.user')
      expect(result.responsibilities).toContain('admin')
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
