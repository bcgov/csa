import { describe, expect, it } from 'vitest'
import { ContactProfile } from '../../eligibility.types'
import { makeContact, makePlacement } from '../../test-helpers'
import { EligibilityContext } from '../rule.interface'
import { step3_PlacementCheck } from './step3-placement-check'

const REF_DATE = new Date('2026-02-10')
const BEFORE_CURRENT_MONTH = new Date('2026-01-15')
const IN_CURRENT_MONTH = new Date('2026-02-05')
const IN_PREV_MONTH = new Date('2026-01-20')
const NOT_IN_PREV_MONTH = new Date('2025-12-15')

const makeCtx = (overrides: Partial<ContactProfile> = {}): EligibilityContext => ({
  contact: makeContact(overrides),
  referenceDate: REF_DATE,
})

describe('step3_PlacementCheck', () => {
  describe('no placements', () => {
    it('should route to step 8 when no placements at all', () => {
      const ctx = makeCtx({ placements: [] })
      const result = step3_PlacementCheck.evaluate(ctx)
      expect(result!.step).toBe(8)
    })
  })

  describe('Active/Interrupted Placement (startDate prior to current month)', () => {
    it('should continue to step 4 when Active Placement found', () => {
      const ctx = makeCtx({
        placements: [
          makePlacement({ type: 'Placement', status: 'Active', startDate: BEFORE_CURRENT_MONTH }),
        ],
      })
      const result = step3_PlacementCheck.evaluate(ctx)
      expect(result).toBeNull()
      expect(ctx.hasPlacement).toBe(true)
      expect(ctx.hasNonPlacement).toBe(false)
    })

    it('should continue to step 4 when Interrupted Placement found', () => {
      const ctx = makeCtx({
        placements: [
          makePlacement({
            type: 'Placement',
            status: 'Interrupted',
            startDate: BEFORE_CURRENT_MONTH,
          }),
        ],
      })
      const result = step3_PlacementCheck.evaluate(ctx)
      expect(result).toBeNull()
      expect(ctx.hasPlacement).toBe(true)
    })

    it('should ignore Active Placement with startDate in current month', () => {
      const ctx = makeCtx({
        placements: [
          makePlacement({ type: 'Placement', status: 'Active', startDate: IN_CURRENT_MONTH }),
        ],
      })
      const result = step3_PlacementCheck.evaluate(ctx)
      expect(result!.step).toBe(8)
    })

    it('should ignore Active Placement with null startDate', () => {
      const ctx = makeCtx({
        placements: [makePlacement({ type: 'Placement', status: 'Active', startDate: null })],
      })
      const result = step3_PlacementCheck.evaluate(ctx)
      expect(result!.step).toBe(8)
    })

    it('should continue to step 4 when both Active & Interrupted Placement exist', () => {
      const ctx = makeCtx({
        placements: [
          makePlacement({ type: 'Placement', status: 'Active', startDate: BEFORE_CURRENT_MONTH }),
          makePlacement({
            type: 'Placement',
            status: 'Interrupted',
            startDate: BEFORE_CURRENT_MONTH,
          }),
        ],
      })
      const result = step3_PlacementCheck.evaluate(ctx)
      expect(result).toBeNull()
      expect(ctx.hasPlacement).toBe(true)
      expect(ctx.eligiblePlacements).toHaveLength(2)
    })
  })

  describe('Ended/Closed Placement fallback (endDate in previous month)', () => {
    it('should continue to step 4 when Ended Placement found with endDate in prev month', () => {
      const ctx = makeCtx({
        placements: [makePlacement({ type: 'Placement', status: 'Ended', endDate: IN_PREV_MONTH })],
      })
      const result = step3_PlacementCheck.evaluate(ctx)
      expect(result).toBeNull()
      expect(ctx.hasPlacement).toBe(true)
      expect(ctx.eligiblePlacements).toHaveLength(1)
    })

    it('should continue to step 4 when Closed (MIS) Placement found with endDate in prev month', () => {
      const ctx = makeCtx({
        placements: [
          makePlacement({
            type: 'Placement',
            status: 'Closed',
            source: 'MIS',
            endDate: IN_PREV_MONTH,
          }),
        ],
      })
      const result = step3_PlacementCheck.evaluate(ctx)
      expect(result).toBeNull()
      expect(ctx.hasPlacement).toBe(true)
    })

    it('should ignore Ended Placement with endDate not in previous month', () => {
      const ctx = makeCtx({
        placements: [
          makePlacement({ type: 'Placement', status: 'Ended', endDate: NOT_IN_PREV_MONTH }),
        ],
      })
      const result = step3_PlacementCheck.evaluate(ctx)
      expect(result!.step).toBe(8)
    })

    it('should prefer Active Placement over Ended Placement', () => {
      const ctx = makeCtx({
        placements: [
          makePlacement({
            type: 'Placement',
            status: 'Active',
            startDate: BEFORE_CURRENT_MONTH,
            placementNumber: 'ACTIVE',
          }),
          makePlacement({
            type: 'Placement',
            status: 'Ended',
            endDate: IN_PREV_MONTH,
            placementNumber: 'ENDED',
          }),
        ],
      })
      const result = step3_PlacementCheck.evaluate(ctx)
      expect(result).toBeNull()
      expect(ctx.eligiblePlacements).toHaveLength(1)
      expect(ctx.eligiblePlacements![0].placementNumber).toBe('ACTIVE')
    })
  })

  describe('Active/Interrupted Non-Placement → Step 8', () => {
    it('should route to step 8 when only Active Non-Placement found', () => {
      const ctx = makeCtx({
        placements: [
          makePlacement({
            type: 'Non-Placement Location',
            status: 'Active',
            startDate: BEFORE_CURRENT_MONTH,
          }),
        ],
      })
      const result = step3_PlacementCheck.evaluate(ctx)
      expect(result!.step).toBe(8)
      expect(ctx.hasNonPlacement).toBe(true)
    })

    it('should route to step 8 when both Active & Interrupted Non-Placement on case', () => {
      const ctx = makeCtx({
        placements: [
          makePlacement({
            type: 'Non-Placement Location',
            status: 'Active',
            startDate: BEFORE_CURRENT_MONTH,
          }),
          makePlacement({
            type: 'Non-Placement Location',
            status: 'Interrupted',
            startDate: BEFORE_CURRENT_MONTH,
          }),
        ],
      })
      const result = step3_PlacementCheck.evaluate(ctx)
      expect(result!.step).toBe(8)
    })
  })

  describe('Ended/Closed Non-Placement fallback → Step 8', () => {
    it('should route to step 8 when Ended Non-Placement found with endDate in prev month', () => {
      const ctx = makeCtx({
        placements: [
          makePlacement({
            type: 'Non-Placement Location',
            status: 'Ended',
            endDate: IN_PREV_MONTH,
          }),
        ],
      })
      const result = step3_PlacementCheck.evaluate(ctx)
      expect(result!.step).toBe(8)
      expect(ctx.hasNonPlacement).toBe(true)
      expect(ctx.eligiblePlacements).toHaveLength(0)
    })

    it('should ignore Ended Non-Placement with endDate not in previous month', () => {
      const ctx = makeCtx({
        placements: [
          makePlacement({
            type: 'Non-Placement Location',
            status: 'Ended',
            endDate: NOT_IN_PREV_MONTH,
          }),
        ],
      })
      const result = step3_PlacementCheck.evaluate(ctx)
      expect(result!.step).toBe(8)
    })
  })

  describe('Placement precedence over Non-Placement', () => {
    it('should continue to step 4 with hasNonPlacement=true when both Placement and Non-Placement found', () => {
      const ctx = makeCtx({
        placements: [
          makePlacement({ type: 'Placement', status: 'Active', startDate: BEFORE_CURRENT_MONTH }),
          makePlacement({
            type: 'Non-Placement Location',
            status: 'Interrupted',
            startDate: BEFORE_CURRENT_MONTH,
          }),
        ],
      })
      const result = step3_PlacementCheck.evaluate(ctx)
      expect(result).toBeNull()
      expect(ctx.hasPlacement).toBe(true)
      expect(ctx.hasNonPlacement).toBe(true)
      expect(ctx.eligiblePlacements).toHaveLength(1)
      expect(ctx.eligiblePlacements![0].type).toBe('Placement')
    })
  })

  describe('case-insensitive matching', () => {
    it('should handle variant casing and whitespace in type and status', () => {
      const ctx = makeCtx({
        placements: [
          makePlacement({
            type: ' placement ',
            status: ' active ',
            startDate: BEFORE_CURRENT_MONTH,
          }),
        ],
      })
      const result = step3_PlacementCheck.evaluate(ctx)
      expect(result).toBeNull()
      expect(ctx.hasPlacement).toBe(true)
    })
  })
})
