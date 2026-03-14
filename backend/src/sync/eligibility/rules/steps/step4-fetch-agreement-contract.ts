import { EligibilityResult } from '../../eligibility.types'
import { EligibilityContext, EligibilityRule } from '../rule.interface'

/**
 * STEP 4: Fetch Agreement/Contract# from Active and/or Interrupted Placement
 * Extracts contract numbers and enriches context for Step 6.
 * Always continues to the next rule (Step 6).
 */
export const step4_FetchAgreementContract: EligibilityRule = {
  name: 'step4_FetchAgreementContract',

  evaluate(ctx: EligibilityContext): EligibilityResult | null {
    const placements = ctx.eligiblePlacements ?? []

    const contractNumbers = [
      ...new Set(
        placements
          .map((placement) => placement.contractNumber)
          .filter((val): val is string => val !== null && val !== undefined),
      ),
    ]

    const agreementRowIds = [
      ...new Set(
        placements
          .map((placement) => placement.agreementRowId)
          .filter((val): val is string => val !== null && val !== undefined),
      ),
    ]

    ctx.contractNumbers = contractNumbers
    ctx.agreementRowIds = agreementRowIds

    return null
  },
}
