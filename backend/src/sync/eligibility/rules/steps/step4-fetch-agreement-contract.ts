import { EligibilityResult } from '../../eligibility.types'
import { EligibilityContext, EligibilityRule } from '../rule.interface'

/**
 * STEP 4: Extract link keys (contractNumbers, agreementRowIds) from eligible placements.
 * Used by Step 6 to match ICM orders. MIS orders are matched directly by source in Step 6
 * since they are already scoped to the contact via person_id_mis at the SQL level.
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
