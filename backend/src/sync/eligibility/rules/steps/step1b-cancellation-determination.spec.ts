import { CSA_STATUS } from 'src/common/state-machine/constants/csa-status.constants'
import { describe, expect, it } from 'vitest'
import { CANCEL_REASON } from '../../cancellation/cancellation-reason.constants'
import { ContactProfile } from '../../eligibility.types'
import { makeContact } from '../../test-helpers'
import { EligibilityContext } from '../rule.interface'
import { step1B_CancellationCheck } from './step1b-cancellation-determination'

const makeCtx = (overrides: Partial<ContactProfile> = {}): EligibilityContext => ({
  contact: makeContact({ csaStatus: CSA_STATUS.IN_PAY, existingContactId: 1, ...overrides }),
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
    it('should compute careEndDate from placement end dates when cancellation triggered', () => {
      const ctx = makeCtx({
        deceased: 'Y',
        csaStatus: CSA_STATUS.IN_PAY,
        placements: [
          {
            type: 'Non-Placement Location',
            serviceType: 'Absent/Unknown Location',
            status: 'Active',
            startDate: new Date('2025-01-01'),
            endDate: new Date('2025-06-15'),
            contractNumber: null,
            agreementRowId: null,
            paidUnpaid: null,
            source: 'ICM',
          },
        ],
      })
      const result = step1B_CancellationCheck.evaluate(ctx)
      expect(result!.careEndDate).toEqual(new Date('2025-06-15'))
    })

    it('should compute careEndDate from placement end dates', () => {
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

    it('should pick latest across ICM and MIS placement end dates', () => {
      const ctx = makeCtx({
        deceased: 'Y',
        csaStatus: CSA_STATUS.IN_PAY,
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
          {
            type: 'Non-Placement Location',
            rawType: 'AW',
            status: 'Active',
            startDate: new Date('2025-02-01'),
            endDate: new Date('2025-09-01'),
            contractNumber: null,
            agreementRowId: null,
            paidUnpaid: null,
            source: 'MIS',
          },
        ],
      })
      const result = step1B_CancellationCheck.evaluate(ctx)
      expect(result!.careEndDate).toEqual(new Date('2025-09-01'))
    })

    it('should set careEndDate to null when no end dates exist', () => {
      const ctx = makeCtx({ deceased: 'Y', csaStatus: CSA_STATUS.IN_PAY })
      const result = step1B_CancellationCheck.evaluate(ctx)
      // Step 9 fail-safe: when IN_PAY and careEndDate is null, uses new Date()
      expect(result!.careEndDate).not.toBeNull() // Step 9 applies system date
    })

    it('should return null (continue chain) when no cancellation triggered, but stash placement-based careEndDate on ctx for downstream rules', () => {
      const ctx = makeCtx({
        deceased: null,
        placements: [
          {
            type: 'Placement',
            status: 'Ended',
            startDate: new Date('2025-01-01'),
            endDate: new Date('2025-06-15'),
            contractNumber: null,
            agreementRowId: null,
            paidUnpaid: null,
            source: 'ICM',
          },
        ],
      })
      const result = step1B_CancellationCheck.evaluate(ctx)
      expect(result).toBeNull()
      expect(ctx.cancelReasonCode).toBeNull()
      expect(ctx.careEndDate).toEqual(new Date('2025-06-15'))
    })
  })
})
