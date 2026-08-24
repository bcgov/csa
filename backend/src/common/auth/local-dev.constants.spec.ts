import { describe, expect, it } from 'vitest'
import { USER_PROFILE } from 'src/api/admin/constants/user-profile.constants'
import { localDevIcmResponsibility, resolveLocalDevProfile } from './local-dev.constants'

describe('local-dev.constants', () => {
  describe('resolveLocalDevProfile', () => {
    it('returns CSA_STANDARD by default', () => {
      expect(resolveLocalDevProfile(undefined)).toBe(USER_PROFILE.CSA_STANDARD)
    })

    it('accepts DATA_QUALITY_STEWARD from header hint', () => {
      expect(resolveLocalDevProfile('DATA_QUALITY_STEWARD')).toBe(USER_PROFILE.DATA_QUALITY_STEWARD)
    })

    it('falls back to CSA_STANDARD for invalid hints', () => {
      expect(resolveLocalDevProfile('NOT_A_PROFILE')).toBe(USER_PROFILE.CSA_STANDARD)
    })
  })

  describe('localDevIcmResponsibility', () => {
    it('maps profiles to ICM responsibility names', () => {
      expect(localDevIcmResponsibility(USER_PROFILE.CSA_STANDARD)).toBe('ICM CSA Application - RW')
      expect(localDevIcmResponsibility(USER_PROFILE.DATA_QUALITY_STEWARD)).toBe('ICM Data Steward')
    })
  })
})
