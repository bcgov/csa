import { describe, expect, it } from 'vitest'
import { extractUsernameFromPayload, toUserInfoDto } from './token-utils'

describe('token-utils', () => {
  describe('extractUsernameFromPayload', () => {
    it('should prefer idir_username', () => {
      const payload = {
        idir_username: 'jdoe',
        preferred_username: 'other@idir',
        email: 'a@b.com',
        sub: 'sub1',
      }
      expect(extractUsernameFromPayload(payload)).toBe('JDOE')
    })

    it('should extract from preferred_username when idir_username is absent', () => {
      const payload = { preferred_username: 'john.doe@idir', email: 'a@b.com', sub: 'sub1' }
      expect(extractUsernameFromPayload(payload)).toBe('JOHN.DOE')
    })

    it('should extract from email when preferred_username is absent', () => {
      const payload = { email: 'user@example.com', sub: 'sub1' }
      expect(extractUsernameFromPayload(payload)).toBe('USER')
    })

    it('should use sub as last resort', () => {
      const payload = { sub: 'user789' }
      expect(extractUsernameFromPayload(payload)).toBe('USER789')
    })

    it('should return UNKNOWN when no fields available', () => {
      expect(extractUsernameFromPayload({})).toBe('UNKNOWN')
    })
  })

  describe('toUserInfoDto', () => {
    it('should map decoded JWT payload to UserInfoDto', () => {
      const decoded = {
        email: 'john@example.com',
        given_name: 'John',
        family_name: 'Doe',
        sub: 'sub123',
        exp: 1234567890,
      }
      const result = toUserInfoDto(decoded, 'JOHN.DOE')
      expect(result).toEqual({
        username: 'JOHN.DOE',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
      })
    })

    it('should handle missing optional fields', () => {
      const result = toUserInfoDto({}, 'UNKNOWN')
      expect(result).toEqual({
        username: 'UNKNOWN',
        email: undefined,
        firstName: undefined,
        lastName: undefined,
      })
    })
  })
})
