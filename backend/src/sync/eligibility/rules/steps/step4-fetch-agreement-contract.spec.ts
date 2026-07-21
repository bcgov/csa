import { describe, expect, it } from 'vitest'
import { makeContact, makePlacement } from '../../test-helpers'
import { EligibilityContext } from '../rule.interface'
import { step4_FetchAgreementContract } from './step4-fetch-agreement-contract'

describe('step4_FetchAgreementContract', () => {
  it('should route to step 7 when step 3 has already identified eligible placements', () => {
    const ctx: EligibilityContext = {
      contact: makeContact(),
      referenceDate: new Date('2026-02-10'),
      eligiblePlacements: [
        makePlacement({ contractNumber: 'C-100', agreementRowId: 'A-1', status: 'Active' }),
        makePlacement({ contractNumber: 'C-200', agreementRowId: 'A-2', status: 'Interrupted' }),
      ],
    }

    const result = step4_FetchAgreementContract.evaluate(ctx)

    expect(result).toEqual({
      step: 7,
      newStatus: 'eligible',
      cancelReasonCode: null,
      careEndDate: null,
    })
  })

  it('should preserve current status when already in eligible state', () => {
    const ctx: EligibilityContext = {
      contact: makeContact({ csaStatus: 'eligible' }),
      referenceDate: new Date('2026-02-10'),
      eligiblePlacements: [makePlacement({ contractNumber: 'C-300', agreementRowId: null })],
    }

    const result = step4_FetchAgreementContract.evaluate(ctx)
    expect(result).toEqual({
      step: 7,
      newStatus: 'eligible',
      cancelReasonCode: null,
      careEndDate: null,
    })
  })

  it('should map in-pay states through step 7 transition rules', () => {
    const ctx: EligibilityContext = {
      contact: makeContact({ csaStatus: 'not_eligible_in_pay' }),
      referenceDate: new Date('2026-02-10'),
      eligiblePlacements: [makePlacement({ contractNumber: 'C-100', status: 'Active' })],
    }

    const result = step4_FetchAgreementContract.evaluate(ctx)
    expect(result).toEqual({
      step: 7,
      newStatus: 'in_pay',
      cancelReasonCode: null,
      careEndDate: null,
    })
  })
})
