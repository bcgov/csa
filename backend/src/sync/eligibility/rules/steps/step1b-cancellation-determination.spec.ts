import { describe, it, expect } from 'vitest'
import { step1B_CancellationDetermination } from './step1b-cancellation-determination'
import { EligibilityContext } from '../rule.interface'
import { ContactProfile } from '../../eligibility.types'
import { CSA_STATUS } from 'src/common/state-machine/constants/csa-status.constants'
import { CANCEL_REASON } from '../../cancellation/cancellation-reason.constants'

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
  csaStatus: CSA_STATUS.IN_PAY,
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
  deceased: null,
  placements: [],
  orders: [],
  agreements: [],
  ...overrides,
})

const makeCtx = (overrides: Partial<ContactProfile> = {}): EligibilityContext => ({
  contact: makeContact(overrides),
})

describe('step1B_CancellationDetermination', () => {
  it('should always return null (never short-circuits the chain)', () => {
    const ctx = makeCtx({ deceased: 'Y' })
    const result = step1B_CancellationDetermination.evaluate(ctx)
    expect(result).toBeNull()
  })

  it('should set isInEligible=true and cancelReasonCode=14 when deceased=Y', () => {
    const ctx = makeCtx({ deceased: 'Y' })
    step1B_CancellationDetermination.evaluate(ctx)
    expect(ctx.contact.isInEligible).toBe(true)
    expect(ctx.contact.cancelReasonCode).toBe(CANCEL_REASON.CHILD_DIED)
  })

  it('should set isInEligible=true and cancelReasonCode=22 for AWOL ICM placement', () => {
    const ctx = makeCtx({
      placements: [
        {
          type: 'Non-Placement Location',
          serviceType: 'Absent/Unknown Location',
          status: 'Active',
          startDate: null,
          endDate: null,
          contractNumber: null,
          agreementRowId: null,
          paidUnpaid: null,
          source: 'ICM',
        },
      ],
    })
    step1B_CancellationDetermination.evaluate(ctx)
    expect(ctx.contact.isInEligible).toBe(true)
    expect(ctx.contact.cancelReasonCode).toBe(CANCEL_REASON.CHILD_MISSING_AWOL)
  })

  it('should set isInEligible=true and cancelReasonCode=22 for AWOL MIS placement', () => {
    const ctx = makeCtx({
      placements: [
        {
          type: 'AW',
          status: 'Active',
          startDate: null,
          endDate: null,
          contractNumber: null,
          agreementRowId: null,
          paidUnpaid: null,
          source: 'MIS',
        },
      ],
    })
    step1B_CancellationDetermination.evaluate(ctx)
    expect(ctx.contact.isInEligible).toBe(true)
    expect(ctx.contact.cancelReasonCode).toBe(CANCEL_REASON.CHILD_MISSING_AWOL)
  })

  it('should set isInEligible=true and cancelReasonCode=29 for Adoption ICM placement', () => {
    const ctx = makeCtx({
      placements: [
        {
          type: 'Non-Placement Location',
          serviceType: 'Adoption Home',
          status: 'Active',
          startDate: null,
          endDate: null,
          contractNumber: null,
          agreementRowId: null,
          paidUnpaid: null,
          source: 'ICM',
        },
      ],
    })
    step1B_CancellationDetermination.evaluate(ctx)
    expect(ctx.contact.isInEligible).toBe(true)
    expect(ctx.contact.cancelReasonCode).toBe(CANCEL_REASON.ADOPTION)
  })

  it('should set isInEligible=true and cancelReasonCode=29 for Adoption MIS placement', () => {
    const ctx = makeCtx({
      placements: [
        {
          type: 'AD',
          status: 'Active',
          startDate: null,
          endDate: null,
          contractNumber: null,
          agreementRowId: null,
          paidUnpaid: null,
          source: 'MIS',
        },
      ],
    })
    step1B_CancellationDetermination.evaluate(ctx)
    expect(ctx.contact.isInEligible).toBe(true)
    expect(ctx.contact.cancelReasonCode).toBe(CANCEL_REASON.ADOPTION)
  })

  it('should NOT modify contact when no cancellation conditions match', () => {
    const ctx = makeCtx({
      deceased: null,
      placements: [
        {
          type: 'Placement',
          serviceType: 'FCH Level 1',
          status: 'Active',
          startDate: null,
          endDate: null,
          contractNumber: null,
          agreementRowId: null,
          paidUnpaid: null,
          source: 'ICM',
        },
      ],
    })
    step1B_CancellationDetermination.evaluate(ctx)
    expect(ctx.contact.isInEligible).toBe(false)
    expect(ctx.contact.cancelReasonCode).toBeUndefined()
  })
})
