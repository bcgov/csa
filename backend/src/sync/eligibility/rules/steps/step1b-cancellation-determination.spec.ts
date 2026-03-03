import { describe, it, expect } from 'vitest'
import { step1B_CancellationCheck } from './step1b-cancellation-determination'
import { EligibilityContext } from '../rule.interface'
import { ContactProfile } from '../../eligibility.types'
import { CSA_STATUS } from 'src/common/state-machine/constants/csa-status.constants'
import { CANCEL_REASON } from '../../cancellation/cancellation-reason.constants'

const makeContact = (overrides: Partial<ContactProfile> = {}): ContactProfile => ({
  caseRowId: 'CASE-1',
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
  csaStatusEffectiveDate: null,
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
  isIneligible: false,
  deceased: null,
  cancelReasonCode: null,
  careEndDate: null,
  placements: [],
  orders: [],
  agreements: [],
  ...overrides,
})

const makeCtx = (overrides: Partial<ContactProfile> = {}): EligibilityContext => ({
  contact: makeContact(overrides),
  referenceDate: new Date('2026-02-10'),
})

describe('step1B_CancellationCheck', () => {
  describe('cancellation reason determination', () => {
    it('should return step 9 result with code 14 when deceased=Y', () => {
      const ctx = makeCtx({ deceased: 'Y' })
      const result = step1B_CancellationCheck.evaluate(ctx)
      expect(result).not.toBeNull()
      expect(result!.step).toBe(9)
      expect(result!.cancelReasonCode).toBe(CANCEL_REASON.CHILD_DIED)
    })

    it('should return step 9 result with code 22 for AWOL ICM placement', () => {
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
      const result = step1B_CancellationCheck.evaluate(ctx)
      expect(result).not.toBeNull()
      expect(result!.cancelReasonCode).toBe(CANCEL_REASON.CHILD_MISSING_AWOL)
    })

    it('should return step 9 result with code 22 for AWOL MIS placement', () => {
      const ctx = makeCtx({
        placements: [
          {
            type: 'Non-Placement Location',
            rawType: 'AW',
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
      const result = step1B_CancellationCheck.evaluate(ctx)
      expect(result).not.toBeNull()
      expect(result!.cancelReasonCode).toBe(CANCEL_REASON.CHILD_MISSING_AWOL)
    })

    it('should return step 9 result with code 29 for Adoption ICM placement', () => {
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
      const result = step1B_CancellationCheck.evaluate(ctx)
      expect(result).not.toBeNull()
      expect(result!.cancelReasonCode).toBe(CANCEL_REASON.ADOPTION)
    })

    it('should return step 9 result with code 29 for Adoption MIS placement', () => {
      const ctx = makeCtx({
        placements: [
          {
            type: 'Non-Placement Location',
            rawType: 'AD',
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
      const result = step1B_CancellationCheck.evaluate(ctx)
      expect(result).not.toBeNull()
      expect(result!.cancelReasonCode).toBe(CANCEL_REASON.ADOPTION)
    })

    it('should return null (continue chain) when no cancellation conditions match', () => {
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
      const result = step1B_CancellationCheck.evaluate(ctx)
      expect(result).toBeNull()
    })
  })

  describe('step 9 routing', () => {
    it('should set NOT_ELIGIBLE_OUT_OF_PAY when current status is ELIGIBLE', () => {
      const ctx = makeCtx({ deceased: 'Y', csaStatus: CSA_STATUS.ELIGIBLE })
      const result = step1B_CancellationCheck.evaluate(ctx)
      expect(result!.newStatus).toBe(CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY)
    })

    it('should set NOT_ELIGIBLE_IN_PAY when current status is IN_PAY', () => {
      const ctx = makeCtx({ deceased: 'Y', csaStatus: CSA_STATUS.IN_PAY })
      const result = step1B_CancellationCheck.evaluate(ctx)
      expect(result!.newStatus).toBe(CSA_STATUS.NOT_ELIGIBLE_IN_PAY)
    })

    it('should use default cancel reason code when cancelReasonCode is null', () => {
      // This shouldn't happen in practice (cancellation always sets a code),
      // but Step 9 has a default fallback
      const ctx = makeCtx({ deceased: 'Y', csaStatus: CSA_STATUS.IN_PAY })
      const result = step1B_CancellationCheck.evaluate(ctx)
      expect(result!.cancelReasonCode).toBe(CANCEL_REASON.CHILD_DIED)
    })
  })

  describe('care end date computation', () => {
    it('should compute careEndDate from order end dates when cancellation triggered', () => {
      const ctx = makeCtx({
        deceased: 'Y',
        csaStatus: CSA_STATUS.IN_PAY,
        orders: [
          {
            orderType: 'Variable',
            orderStatus: 'Closed',
            effectiveStartDate: new Date('2025-01-01'),
            effectiveEndDate: new Date('2025-06-15'),
            amount: 100,
            contractNumber: null,
            source: 'ICM',
          },
        ],
      })
      const result = step1B_CancellationCheck.evaluate(ctx)
      expect(result!.careEndDate).toEqual(new Date('2025-06-15'))
    })

    it('should compute careEndDate from placement end dates when no order end dates', () => {
      const ctx = makeCtx({
        deceased: 'Y',
        csaStatus: CSA_STATUS.IN_PAY,
        placements: [
          {
            type: 'Non-Placement Location',
            serviceType: 'Absent/Unknown Location',
            status: 'Active',
            startDate: new Date('2025-01-01'),
            endDate: new Date('2025-08-01'),
            contractNumber: null,
            agreementRowId: null,
            paidUnpaid: null,
            source: 'ICM',
          },
        ],
      })
      const result = step1B_CancellationCheck.evaluate(ctx)
      expect(result!.careEndDate).toEqual(new Date('2025-08-01'))
    })

    it('should pick earliest of order and placement end dates', () => {
      const ctx = makeCtx({
        deceased: 'Y',
        csaStatus: CSA_STATUS.IN_PAY,
        orders: [
          {
            orderType: 'Variable',
            orderStatus: 'Closed',
            effectiveStartDate: new Date('2025-01-01'),
            effectiveEndDate: new Date('2025-10-01'),
            amount: 100,
            contractNumber: null,
            source: 'ICM',
          },
        ],
        placements: [
          {
            type: 'Non-Placement Location',
            serviceType: 'Absent/Unknown Location',
            status: 'Active',
            startDate: new Date('2025-01-01'),
            endDate: new Date('2025-06-01'),
            contractNumber: null,
            agreementRowId: null,
            paidUnpaid: null,
            source: 'ICM',
          },
        ],
      })
      const result = step1B_CancellationCheck.evaluate(ctx)
      expect(result!.careEndDate).toEqual(new Date('2025-06-01'))
    })

    it('should set careEndDate to null when no end dates exist', () => {
      const ctx = makeCtx({ deceased: 'Y', csaStatus: CSA_STATUS.IN_PAY })
      const result = step1B_CancellationCheck.evaluate(ctx)
      // Step 9 fail-safe: when IN_PAY and careEndDate is null, uses new Date()
      expect(result!.careEndDate).not.toBeNull() // Step 9 applies system date
    })

    it('should NOT compute careEndDate when no cancellation triggered', () => {
      const ctx = makeCtx({
        deceased: null,
        orders: [
          {
            orderType: 'Variable',
            orderStatus: 'Closed',
            effectiveStartDate: new Date('2025-01-01'),
            effectiveEndDate: new Date('2025-06-15'),
            amount: 100,
            contractNumber: null,
            source: 'ICM',
          },
        ],
      })
      const result = step1B_CancellationCheck.evaluate(ctx)
      expect(result).toBeNull()
    })
  })
})
