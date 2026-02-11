import { describe, expect, it } from 'vitest'
import { ContactProfile } from '../../eligibility.types'
import { EligibilityContext } from '../rule.interface'
import { step4_FetchAgreementContract } from './step4-fetch-agreement-contract'

const makeContact = (overrides: Partial<ContactProfile> = {}): ContactProfile => ({
  personIdIcm: 'ICM-1',
  personIdMis: 'MIS-1',
  firstName: 'John',
  lastName: 'Doe',
  middleName: '',
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
  enrollForCsa: 'Yes',
  legalExpiryDate: null,
  effectiveLegalStatus: null,
  legalAuthorityCode: null,
  effectiveDate: null,
  birthCity: null,
  birthProvince: null,
  birthCountry: null,
  akaFirstName: null,
  akaLastName: null,
  isInEligible: false,
  placements: [],
  orders: [],
  agreements: [],
  ...overrides,
})

describe('step4_FetchAgreementContract', () => {
  it('should extract contract numbers from eligible placements and continue chain', () => {
    const ctx: EligibilityContext = {
      contact: makeContact(),
      eligiblePlacements: [
        {
          type: 'Placement',
          status: 'Active',
          startDate: null,
          endDate: null,
          contractNumber: 'C-100',
          agreementRowId: 'A-1',
          paidUnpaid: null,
          source: 'ICM',
        },
        {
          type: 'Placement',
          status: 'Interrupted',
          startDate: null,
          endDate: null,
          contractNumber: 'C-200',
          agreementRowId: 'A-2',
          paidUnpaid: null,
          source: 'ICM',
        },
      ],
    }

    const result = step4_FetchAgreementContract.evaluate(ctx)

    expect(result).toBeNull() // always continues to Step 6
    expect(ctx.contractNumbers).toEqual(['C-100', 'C-200'])
  })

  it('should filter out null contract numbers', () => {
    const ctx: EligibilityContext = {
      contact: makeContact(),
      eligiblePlacements: [
        {
          type: 'Placement',
          status: 'Active',
          startDate: null,
          endDate: null,
          contractNumber: null,
          agreementRowId: null,
          paidUnpaid: null,
          source: 'ICM',
        },
        {
          type: 'Placement',
          status: 'Active',
          startDate: null,
          endDate: null,
          contractNumber: 'C-300',
          agreementRowId: null,
          paidUnpaid: null,
          source: 'ICM',
        },
      ],
    }

    const result = step4_FetchAgreementContract.evaluate(ctx)
    expect(result).toBeNull()
    expect(ctx.contractNumbers).toEqual(['C-300'])
  })

  it('should set empty array when no eligible placements in context', () => {
    const ctx: EligibilityContext = {
      contact: makeContact(),
    }

    step4_FetchAgreementContract.evaluate(ctx)
    expect(ctx.contractNumbers).toEqual([])
  })

  it('should deduplicate contract numbers', () => {
    const ctx: EligibilityContext = {
      contact: makeContact(),
      eligiblePlacements: [
        {
          type: 'Placement',
          status: 'Active',
          startDate: null,
          endDate: null,
          contractNumber: 'C-100',
          agreementRowId: null,
          paidUnpaid: null,
          source: 'ICM',
        },
        {
          type: 'Placement',
          status: 'Interrupted',
          startDate: null,
          endDate: null,
          contractNumber: 'C-100',
          agreementRowId: null,
          paidUnpaid: null,
          source: 'MIS',
        },
      ],
    }

    step4_FetchAgreementContract.evaluate(ctx)
    expect(ctx.contractNumbers).toEqual(['C-100'])
  })
})
