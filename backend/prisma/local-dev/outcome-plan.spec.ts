import { describe, expect, it } from 'vitest'
import { buildOutcomePlan, formatOutcomeSummary } from './outcome-plan'

describe('buildOutcomePlan', () => {
  it('uses a single outcome for all records', () => {
    const plan = buildOutcomePlan(
      3,
      'accepted',
      'accepted',
      ['accepted', 'rejected'],
      ['accepted', 'rejected'],
    )

    expect(plan.outcomes).toEqual(['accepted', 'accepted', 'accepted'])
    expect(formatOutcomeSummary(plan)).toBe('accepted')
  })

  it('cycles mixed outcomes deterministically', () => {
    const plan = buildOutcomePlan(
      5,
      'mixed',
      'accepted',
      ['accepted', 'rejected', 'recycled'],
      ['accepted', 'rejected', 'recycled'],
    )

    expect(plan.outcomes).toEqual(['accepted', 'rejected', 'recycled', 'accepted', 'rejected'])
    expect(formatOutcomeSummary(plan)).toBe('mixed (2 accepted, 2 rejected, 1 recycled)')
  })

  it('supports explicit comma-separated outcomes', () => {
    const plan = buildOutcomePlan(
      4,
      'approved,refused',
      'approved',
      ['approved', 'refused'],
      ['approved', 'refused'],
    )

    expect(plan.outcomes).toEqual(['approved', 'refused', 'approved', 'refused'])
    expect(formatOutcomeSummary(plan)).toBe('mixed (2 approved, 2 refused)')
  })
})
