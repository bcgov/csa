import { describe, it, expect } from 'vitest'
import { determineCancellationReason, CancellationInput } from './determine-cancellation-reason'
import { CANCEL_REASON } from './cancellation-reason.constants'

const makeInput = (overrides: Partial<CancellationInput> = {}): CancellationInput => ({
  deceased: null,
  icmPlacements: [],
  misPlacements: [],
  ...overrides,
})

describe('determineCancellationReason', () => {
  describe('Code 14 - Child Died', () => {
    it('should return code 14 when deceased flag is Y', () => {
      const result = determineCancellationReason(makeInput({ deceased: 'Y' }))
      expect(result).toEqual({ isInEligible: true, cancelReasonCode: CANCEL_REASON.CHILD_DIED })
    })

    it('should return code 14 when deceased flag is y (case-insensitive)', () => {
      const result = determineCancellationReason(makeInput({ deceased: 'y' }))
      expect(result).toEqual({ isInEligible: true, cancelReasonCode: CANCEL_REASON.CHILD_DIED })
    })

    it('should not return code 14 when deceased flag is N', () => {
      const result = determineCancellationReason(makeInput({ deceased: 'N' }))
      expect(result).toEqual({ isInEligible: false, cancelReasonCode: null })
    })

    it('should not return code 14 when deceased flag is null', () => {
      const result = determineCancellationReason(makeInput({ deceased: null }))
      expect(result).toEqual({ isInEligible: false, cancelReasonCode: null })
    })
  })

  describe('Code 22 - Child Missing/AWOL', () => {
    it('should return code 22 when ICM placement sub-type is Absent/Unknown Location and Active', () => {
      const result = determineCancellationReason(
        makeInput({
          icmPlacements: [
            {
              type: 'Non-Placement Location',
              serviceType: 'Absent/Unknown Location',
              status: 'Active',
            },
          ],
        }),
      )
      expect(result).toEqual({
        isInEligible: true,
        cancelReasonCode: CANCEL_REASON.CHILD_MISSING_AWOL,
      })
    })

    it('should return code 22 when MIS placement type is AW and Active', () => {
      const result = determineCancellationReason(
        makeInput({
          misPlacements: [{ type: 'AW', status: 'Active' }],
        }),
      )
      expect(result).toEqual({
        isInEligible: true,
        cancelReasonCode: CANCEL_REASON.CHILD_MISSING_AWOL,
      })
    })

    it('should handle variant casing and whitespace in placement fields', () => {
      const result = determineCancellationReason(
        makeInput({
          icmPlacements: [
            {
              type: ' non-placement location ',
              serviceType: ' absent/unknown location ',
              status: ' active ',
            },
          ],
        }),
      )
      expect(result).toEqual({
        isInEligible: true,
        cancelReasonCode: CANCEL_REASON.CHILD_MISSING_AWOL,
      })
    })

    it('should NOT return code 22 when ICM placement sub-type matches but status is not Active', () => {
      const result = determineCancellationReason(
        makeInput({
          icmPlacements: [
            {
              type: 'Non-Placement Location',
              serviceType: 'Absent/Unknown Location',
              status: 'Interrupted',
            },
          ],
        }),
      )
      expect(result).toEqual({ isInEligible: false, cancelReasonCode: null })
    })

    it('should NOT return code 22 when MIS type is AW but status is not Active', () => {
      const result = determineCancellationReason(
        makeInput({
          misPlacements: [{ type: 'AW', status: 'Ended' }],
        }),
      )
      expect(result).toEqual({ isInEligible: false, cancelReasonCode: null })
    })
  })

  describe('Code 29 - Adoption', () => {
    it('should return code 29 when ICM placement sub-type is Adoption Home and Active', () => {
      const result = determineCancellationReason(
        makeInput({
          icmPlacements: [
            {
              type: 'Non-Placement Location',
              serviceType: 'Adoption Home',
              status: 'Active',
            },
          ],
        }),
      )
      expect(result).toEqual({ isInEligible: true, cancelReasonCode: CANCEL_REASON.ADOPTION })
    })

    it('should return code 29 when MIS placement type is AD and Active', () => {
      const result = determineCancellationReason(
        makeInput({
          misPlacements: [{ type: 'AD', status: 'Active' }],
        }),
      )
      expect(result).toEqual({ isInEligible: true, cancelReasonCode: CANCEL_REASON.ADOPTION })
    })

    it('should NOT return code 29 when ICM placement sub-type matches but status is not Active', () => {
      const result = determineCancellationReason(
        makeInput({
          icmPlacements: [
            {
              type: 'Non-Placement Location',
              serviceType: 'Adoption Home',
              status: 'Ended',
            },
          ],
        }),
      )
      expect(result).toEqual({ isInEligible: false, cancelReasonCode: null })
    })
  })

  describe('Priority order', () => {
    it('should prioritize code 14 (deceased) over code 22 (AWOL)', () => {
      const result = determineCancellationReason(
        makeInput({
          deceased: 'Y',
          icmPlacements: [
            {
              type: 'Non-Placement Location',
              serviceType: 'Absent/Unknown Location',
              status: 'Active',
            },
          ],
        }),
      )
      expect(result.cancelReasonCode).toBe(CANCEL_REASON.CHILD_DIED)
    })

    it('should prioritize code 22 (AWOL) over code 29 (Adoption)', () => {
      const result = determineCancellationReason(
        makeInput({
          icmPlacements: [
            {
              type: 'Non-Placement Location',
              serviceType: 'Absent/Unknown Location',
              status: 'Active',
            },
            { type: 'Non-Placement Location', serviceType: 'Adoption Home', status: 'Active' },
          ],
        }),
      )
      expect(result.cancelReasonCode).toBe(CANCEL_REASON.CHILD_MISSING_AWOL)
    })
  })

  describe('Default - no match', () => {
    it('should return isInEligible false and null code when no conditions match', () => {
      const result = determineCancellationReason(
        makeInput({
          deceased: 'N',
          icmPlacements: [{ type: 'Placement', serviceType: 'FCH Level 1', status: 'Active' }],
          misPlacements: [{ type: 'Consulting', status: 'Active' }],
        }),
      )
      expect(result).toEqual({ isInEligible: false, cancelReasonCode: null })
    })

    it('should return isInEligible false when inputs are all empty/null', () => {
      const result = determineCancellationReason(makeInput())
      expect(result).toEqual({ isInEligible: false, cancelReasonCode: null })
    })
  })
})
