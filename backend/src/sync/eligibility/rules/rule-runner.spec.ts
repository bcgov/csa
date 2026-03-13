import { describe, it, expect } from 'vitest'
import { runEligibility } from './rule-runner'
import { EligibilityRule, EligibilityContext } from './rule.interface'
import { EligibilityResult } from '../eligibility.types'
import { makeContact, makePlacement, makeOrder } from '../test-helpers'
import { step3_PlacementCheck } from './steps/step3-placement-check'
import { step4_FetchAgreementContract } from './steps/step4-fetch-agreement-contract'
import { step6_OrderPaymentCheck } from './steps/step6-order-payment-check'

const REF_DATE = new Date('2026-02-10')

describe('runEligibility', () => {
  it('should return null when no rules match (all return null)', () => {
    const passThrough: EligibilityRule = {
      name: 'pass',
      evaluate: () => null,
    }

    const result = runEligibility(makeContact(), [passThrough], REF_DATE)
    expect(result).toBeNull()
  })

  it('should return result from first matching rule', () => {
    const expected: EligibilityResult = {
      step: 8,
      newStatus: 'eligible_tbd',
      cancelReasonCode: null,
      careEndDate: null,
    }

    const rule1: EligibilityRule = { name: 'skip', evaluate: () => null }
    const rule2: EligibilityRule = { name: 'match', evaluate: () => expected }
    const rule3: EligibilityRule = {
      name: 'never-reached',
      evaluate: () => {
        throw new Error('Should not be called')
      },
    }

    const result = runEligibility(makeContact(), [rule1, rule2, rule3], REF_DATE)
    expect(result).toEqual(expected)
  })

  it('should pass shared context between rules', () => {
    const enricher: EligibilityRule = {
      name: 'enricher',
      evaluate: (ctx: EligibilityContext) => {
        ctx.hasPlacement = true
        ctx.contractNumbers = ['C-100']
        return null
      },
    }

    const reader: EligibilityRule = {
      name: 'reader',
      evaluate: (ctx: EligibilityContext) => {
        expect(ctx.hasPlacement).toBe(true)
        expect(ctx.contractNumbers).toEqual(['C-100'])
        return { step: 7, newStatus: 'eligible', cancelReasonCode: null, careEndDate: null }
      },
    }

    runEligibility(makeContact(), [enricher, reader], REF_DATE)
  })
})

describe('runEligibility integration: step3 → step4 → step6', () => {
  const RULES = [step3_PlacementCheck, step4_FetchAgreementContract, step6_OrderPaymentCheck]

  it('MIS-to-ICM migration: ended MIS placement + active ICM placement → eligible (step 7)', () => {
    // Reference date: April 15. March payment should match previous month.
    const refDate = new Date('2026-04-15')

    const contact = makeContact({
      csaStatus: 'in_pay',
      placements: [
        makePlacement({
          source: 'ICM',
          status: 'Active',
          type: 'Placement',
          startDate: new Date('2026-04-01'),
          agreementRowId: 'A-ICM-NEW',
        }),
        makePlacement({
          source: 'MIS',
          status: 'Ended',
          type: 'Placement',
          startDate: new Date('2025-01-01'),
          endDate: new Date('2026-03-31'),
          contractNumber: 'C-MIS-OLD',
        }),
      ],
      orders: [
        makeOrder({
          source: 'MIS',
          contractNumber: 'C-MIS-OLD',
          effectiveStartDate: new Date('2026-03-01'),
          amount: 2000,
        }),
      ],
    })

    const result = runEligibility(contact, RULES, refDate)

    expect(result).toEqual({
      step: 7,
      newStatus: 'in_pay',
      cancelReasonCode: null,
      careEndDate: null,
    })
  })

  it('no active placement → step 8 (eligible_tbd), skips step 4 and 6', () => {
    const contact = makeContact({
      csaStatus: null,
      placements: [makePlacement({ status: 'Ended', type: 'Placement' })],
    })

    const result = runEligibility(contact, RULES, new Date('2026-04-15'))

    expect(result).toEqual({
      step: 8,
      newStatus: 'eligible_tbd',
      cancelReasonCode: null,
      careEndDate: null,
    })
  })

  it('active placement with matching previous-month order → eligible (step 7)', () => {
    const refDate = new Date('2026-04-15')

    const contact = makeContact({
      csaStatus: null,
      placements: [
        makePlacement({
          status: 'Active',
          contractNumber: 'C-100',
        }),
      ],
      orders: [
        makeOrder({
          contractNumber: 'C-100',
          effectiveStartDate: new Date('2026-03-15'),
          amount: 2000,
        }),
      ],
    })

    const result = runEligibility(contact, RULES, refDate)

    expect(result).toEqual({
      step: 7,
      newStatus: 'eligible',
      cancelReasonCode: null,
      careEndDate: null,
    })
  })
})
