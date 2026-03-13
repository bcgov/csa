import { describe, expect, it } from 'vitest'
import { ContactProfile } from '../../eligibility.types'
import { makeContact, makePlacement } from '../../test-helpers'
import { EligibilityContext } from '../rule.interface'
import { step3_PlacementCheck } from './step3-placement-check'

const makeCtx = (overrides: Partial<ContactProfile> = {}): EligibilityContext => ({
  contact: makeContact(overrides),
  referenceDate: new Date('2026-02-10'),
})

describe('step3_PlacementCheck', () => {
  it('should route to step 8 when no placements at all', () => {
    const ctx = makeCtx({ placements: [] })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should return null (continue to step 4) when only Active Placement found', () => {
    const ctx = makeCtx({
      placements: [makePlacement({ type: 'Placement', status: 'Active' })],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result).toBeNull()
    expect(ctx.hasPlacement).toBe(true)
    expect(ctx.hasNonPlacement).toBe(false)
  })

  it('should return null (continue to step 4) when only Interrupted Placement found', () => {
    const ctx = makeCtx({
      placements: [makePlacement({ type: 'Placement', status: 'Interrupted' })],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result).toBeNull()
    expect(ctx.hasPlacement).toBe(true)
  })

  it('should route to step 8 when only Active Non-Placement Location found', () => {
    const ctx = makeCtx({
      placements: [makePlacement({ type: 'Non-Placement Location', status: 'Active' })],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should route to step 8 when only Interrupted Non-Placement Location found', () => {
    const ctx = makeCtx({
      placements: [makePlacement({ type: 'Non-Placement Location', status: 'Interrupted' })],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should return null when both Active and Interrupted Placement on case', () => {
    const ctx = makeCtx({
      placements: [
        makePlacement({ type: 'Placement', status: 'Active' }),
        makePlacement({ type: 'Placement', status: 'Interrupted' }),
      ],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result).toBeNull()
    expect(ctx.hasPlacement).toBe(true)
    expect(ctx.eligiblePlacements).toHaveLength(2)
  })

  it('should route to step 8 when both Active and Interrupted Non-Placement on case', () => {
    const ctx = makeCtx({
      placements: [
        makePlacement({ type: 'Non-Placement Location', status: 'Active' }),
        makePlacement({ type: 'Non-Placement Location', status: 'Interrupted' }),
      ],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should return null with hasNonPlacement=true when both Placement and Non-Placement found', () => {
    const ctx = makeCtx({
      placements: [
        makePlacement({ type: 'Placement', status: 'Active' }),
        makePlacement({ type: 'Non-Placement Location', status: 'Interrupted' }),
      ],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result).toBeNull()
    expect(ctx.hasPlacement).toBe(true)
    expect(ctx.hasNonPlacement).toBe(true)
    // Only placements (not non-placements) in eligiblePlacements
    expect(ctx.eligiblePlacements).toHaveLength(1)
    expect(ctx.eligiblePlacements![0].type).toBe('Placement')
  })

  it('should handle variant casing and whitespace in type and status', () => {
    const ctx = makeCtx({
      placements: [makePlacement({ type: ' placement ', status: ' active ' })],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result).toBeNull()
    expect(ctx.hasPlacement).toBe(true)
  })

  it('should only consider Active/Interrupted placements, ignoring other statuses', () => {
    const ctx = makeCtx({
      placements: [makePlacement({ type: 'Placement', status: 'Ended' })],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result!.step).toBe(8) // no active/interrupted->step 8
  })
})
