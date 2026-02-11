import { describe, it, expect } from 'vitest'
import { CSA_STATUS } from 'src/common/state-machine/constants/csa-status.constants'
import { step1B_CancellationCheck } from './step1b-cancellation-check'
import { EligibilityContext } from '../rule.interface'
import { ContactProfile } from '../../eligibility.types'

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
  csaStatus: CSA_STATUS.ELIGIBLE,
  existingContactId: 1,
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
  isInEligible: false,
  placements: [],
  orders: [],
  agreements: [],
  ...overrides,
})

const makeCtx = (overrides: Partial<ContactProfile> = {}): EligibilityContext => ({
  contact: makeContact(overrides),
})

describe('step1B_CancellationCheck', () => {
  it('should route to step 9 when isInEligible is true', () => {
    const ctx = makeCtx({ isInEligible: true, csaStatus: CSA_STATUS.ELIGIBLE })
    const result = step1B_CancellationCheck.evaluate(ctx)
    expect(result).not.toBeNull()
    expect(result!.step).toBe(9)
  })

  it('should return null (continue chain) when isInEligible is false', () => {
    const ctx = makeCtx({ isInEligible: false })
    const result = step1B_CancellationCheck.evaluate(ctx)
    expect(result).toBeNull()
  })
})
