import { describe, expect, it } from 'vitest'
import { ContactProfile } from '../../eligibility.types'
import { EligibilityContext } from '../rule.interface'
import { step2_LegalStatusCheck } from './step2-legal-status-check'

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
  effectiveLegalStatus: 'Active',
  legalAuthorityCode: null,
  effectiveDate: null,
  birthCity: null,
  birthProvince: null,
  birthCountry: null,
  akaFirstName: null,
  akaLastName: null,
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

const REF_DATE = new Date('2026-02-10')

describe('step2_LegalStatusCheck', () => {
  it('should route to step 8 when MIS Legal Auth Code is OPC', () => {
    const ctx = makeCtx({ misLegalAuthCode: 'OPC' })
    const result = step2_LegalStatusCheck.evaluate(ctx, REF_DATE)
    expect(result!.step).toBe(8)
  })

  it('should route to step 8 when MIS Legal Auth Code is OPO', () => {
    const ctx = makeCtx({ misLegalAuthCode: 'OPO' })
    const result = step2_LegalStatusCheck.evaluate(ctx, REF_DATE)
    expect(result!.step).toBe(8)
  })

  it('should route to step 8 when MIS Legal Auth Code is OPT', () => {
    const ctx = makeCtx({ misLegalAuthCode: 'OPT' })
    const result = step2_LegalStatusCheck.evaluate(ctx, REF_DATE)
    expect(result!.step).toBe(8)
  })

  it('should handle variant casing and whitespace in legal auth code', () => {
    const ctx = makeCtx({ misLegalAuthCode: ' opc ' })
    const result = step2_LegalStatusCheck.evaluate(ctx, REF_DATE)
    expect(result!.step).toBe(8)
  })

  it('should handle variant casing and whitespace in enrollForCsa', () => {
    const ctx = makeCtx({ enrollForCsa: ' yes ', legalExpiryDate: null })
    const result = step2_LegalStatusCheck.evaluate(ctx, REF_DATE)
    expect(result).toBeNull()
  })

  describe('when legal authority not expired (expiry >= today or null)', () => {
    it('should return null (continue to step 3) when enrollForCsa is Yes', () => {
      const ctx = makeCtx({ enrollForCsa: 'Yes', legalExpiryDate: null })
      const result = step2_LegalStatusCheck.evaluate(ctx, REF_DATE)
      expect(result).toBeNull()
    })

    it('should route to step 8 when enrollForCsa is TBD', () => {
      const ctx = makeCtx({ enrollForCsa: 'TBD', legalExpiryDate: null })
      const result = step2_LegalStatusCheck.evaluate(ctx, REF_DATE)
      expect(result!.step).toBe(8)
    })

    it('should route to step 9 when enrollForCsa is No', () => {
      const ctx = makeCtx({ enrollForCsa: 'No', legalExpiryDate: null })
      const result = step2_LegalStatusCheck.evaluate(ctx, REF_DATE)
      expect(result!.step).toBe(9)
    })

    it('should treat future expiry date as not expired', () => {
      const ctx = makeCtx({
        enrollForCsa: 'Yes',
        legalExpiryDate: new Date('2027-01-01'),
      })
      const result = step2_LegalStatusCheck.evaluate(ctx, REF_DATE)
      expect(result).toBeNull()
    })
  })

  describe('when legal authority is expired', () => {
    it('should route to step 9 when expiry date is in the past', () => {
      const ctx = makeCtx({
        enrollForCsa: 'Yes',
        legalExpiryDate: new Date('2025-12-31'),
      })
      const result = step2_LegalStatusCheck.evaluate(ctx, REF_DATE)
      expect(result!.step).toBe(9)
    })
  })
})
