import { CSA_STATUS } from 'src/common/state-machine/constants/csa-status.constants'
import { describe, expect, it } from 'vitest'
import { ContactProfile } from '../../eligibility.types'
import { EligibilityContext } from '../rule.interface'
import { step1A_AgeCheck } from './step1a-age-check'

const makeContact = (overrides: Partial<ContactProfile> = {}): ContactProfile => ({
  personIdIcm: 'ICM-1',
  personIdMis: 'MIS-1',
  firstName: 'John',
  lastName: 'Doe',
  middleName: '',
  akaFirstName: null,
  akaLastName: null,
  dateOfBirth: new Date('2010-01-15'),
  age: 16,
  gender: 'M',
  caseNumber: 'CS-001',
  caseType: 'Child Services',
  caseStatus: 'Open',
  caseLoad: 'CL-1',
  legacyFileNumber: null,
  serviceOffice: null,
  assignedTo: null,
  csaStatus: null,
  existingContactId: null,
  din: null,
  csaSentDate: null,
  misLegalAuthCode: null,
  enrollForCsa: null,
  legalExpiryDate: null,
  effectiveLegalStatus: null,
  legalAuthorityCode: null,
  effectiveDate: null,
  birthCity: null,
  birthProvince: null,
  birthCountry: null,
  isIneligible: false,
  deceased: null,
  placements: [],
  orders: [],
  agreements: [],
  ...overrides,
})

const makeCtx = (overrides: Partial<ContactProfile> = {}): EligibilityContext => ({
  contact: makeContact(overrides),
})

// Reference date for all tests
const REF_DATE = new Date('2026-02-10')

describe('step1A_AgeCheck', () => {
  it('should return null (continue chain) when child is under 18', () => {
    const ctx = makeCtx({ dateOfBirth: new Date('2010-06-15') })
    const result = step1A_AgeCheck.evaluate(ctx, REF_DATE)
    expect(result).toBeNull()
  })

  it('should return null when child turns 18 in current month (still eligible through end of birth month)', () => {
    // Born Feb 2008, ref date Feb 2026->eligible through end of Feb 2026
    const ctx = makeCtx({ dateOfBirth: new Date('2008-02-10') })
    const result = step1A_AgeCheck.evaluate(ctx, REF_DATE)
    expect(result).toBeNull()
  })

  it('should route to step 10 when child is over 18 and status is not over_18', () => {
    // Born Jan 2008->turned 18 in Jan 2026->eligible through Jan 31, 2026->over 18 by Feb 2026
    const ctx = makeCtx({
      dateOfBirth: new Date('2008-01-10'),
      csaStatus: CSA_STATUS.ELIGIBLE,
    })
    const result = step1A_AgeCheck.evaluate(ctx, REF_DATE)
    expect(result).not.toBeNull()
    expect(result!.step).toBe(10)
    expect(result!.newStatus).toBe(CSA_STATUS.OVER_18)
  })

  it('should return null (no change) when already over_18', () => {
    const ctx = makeCtx({
      dateOfBirth: new Date('2008-01-10'),
      csaStatus: CSA_STATUS.OVER_18,
    })
    const result = step1A_AgeCheck.evaluate(ctx, REF_DATE)
    expect(result).toBeNull()
  })

  it('should return null when dateOfBirth is null', () => {
    const ctx = makeCtx({ dateOfBirth: null })
    const result = step1A_AgeCheck.evaluate(ctx, REF_DATE)
    expect(result).toBeNull()
  })

  it('should handle child born on last day of month correctly', () => {
    // Born Jan 31, 2008->eligible through Jan 31, 2026
    const ctx = makeCtx({
      dateOfBirth: new Date('2008-01-31'),
      csaStatus: CSA_STATUS.ELIGIBLE,
    })
    const result = step1A_AgeCheck.evaluate(ctx, REF_DATE)
    expect(result).not.toBeNull()
    expect(result!.step).toBe(10)
  })
})
