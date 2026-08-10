import { describe, expect, it } from 'vitest'
import { makeContact, makePlacement } from '../../test-helpers'
import { EligibilityContext } from '../rule.interface'
import { step4_FetchAgreementContract } from './step4-fetch-agreement-contract'

describe('step4_FetchAgreementContract', () => {
  it('should extract contract numbers and agreement row IDs from eligible placements', () => {
    const ctx: EligibilityContext = {
      contact: makeContact(),
      referenceDate: new Date('2026-02-10'),
      eligiblePlacements: [
        makePlacement({ contractNumber: 'C-100', agreementRowId: 'A-1', status: 'Active' }),
        makePlacement({ contractNumber: 'C-200', agreementRowId: 'A-2', status: 'Interrupted' }),
      ],
    }

    const result = step4_FetchAgreementContract.evaluate(ctx)

    expect(result).toBeNull()
    expect(ctx.contractNumbers).toEqual(['C-100', 'C-200'])
    expect(ctx.agreementRowIds).toEqual(['A-1', 'A-2'])
  })

  it('should filter out null contract numbers and agreement row IDs', () => {
    const ctx: EligibilityContext = {
      contact: makeContact(),
      referenceDate: new Date('2026-02-10'),
      eligiblePlacements: [
        makePlacement({ contractNumber: null, agreementRowId: null }),
        makePlacement({ contractNumber: 'C-300', agreementRowId: null }),
      ],
    }

    const result = step4_FetchAgreementContract.evaluate(ctx)
    expect(result).toBeNull()
    expect(ctx.contractNumbers).toEqual(['C-300'])
    expect(ctx.agreementRowIds).toEqual([])
  })

  it('should set empty arrays when no eligible placements in context', () => {
    const ctx: EligibilityContext = {
      contact: makeContact(),
      referenceDate: new Date('2026-02-10'),
    }

    step4_FetchAgreementContract.evaluate(ctx)
    expect(ctx.contractNumbers).toEqual([])
    expect(ctx.agreementRowIds).toEqual([])
  })

  it('should deduplicate contract numbers', () => {
    const ctx: EligibilityContext = {
      contact: makeContact(),
      referenceDate: new Date('2026-02-10'),
      eligiblePlacements: [
        makePlacement({ contractNumber: 'C-100', source: 'ICM', status: 'Active' }),
        makePlacement({ contractNumber: 'C-100', source: 'MIS', status: 'Interrupted' }),
      ],
    }

    step4_FetchAgreementContract.evaluate(ctx)
    expect(ctx.contractNumbers).toEqual(['C-100'])
  })
})
