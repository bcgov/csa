import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { USER_PROFILE } from '../../admin/constants/user-profile.constants'
import { BlockDqStewardGuard } from './block-dq-steward.guard'

function createContext(userProfile: unknown): ExecutionContext {
  const request = { userProfile }
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext
}

describe('BlockDqStewardGuard', () => {
  const guard = new BlockDqStewardGuard()

  it('allows CSA_STANDARD users', () => {
    expect(guard.canActivate(createContext(USER_PROFILE.CSA_STANDARD))).toBe(true)
  })

  it('allows requests with no userProfile (CSAGuard should set this)', () => {
    expect(guard.canActivate(createContext(undefined))).toBe(true)
    expect(guard.canActivate(createContext(null))).toBe(true)
  })

  it('blocks DATA_QUALITY_STEWARD with 403', () => {
    expect(() => guard.canActivate(createContext(USER_PROFILE.DATA_QUALITY_STEWARD))).toThrow(
      ForbiddenException,
    )
    expect(() => guard.canActivate(createContext(USER_PROFILE.DATA_QUALITY_STEWARD))).toThrow(
      'Data Quality Stewards do not have access to this resource',
    )
  })
})
