import { EligibilityResult } from '../../eligibility.types'
import { EligibilityContext, EligibilityRule } from '../rule.interface'
import { step7_UpdateEligible } from './step7-update-eligible'

/**
 * STEP 4: Placement-based terminal eligibility decision.
 *
 * Payment/order validation has been removed from eligibility decisioning.
 * When Step 3 finds an eligible placement, route directly to Step 7.
 */
export const step4_FetchAgreementContract: EligibilityRule = {
  name: 'step4_FetchAgreementContract',

  evaluate(ctx: EligibilityContext): EligibilityResult | null {
    return step7_UpdateEligible(ctx.contact.csaStatus)
  },
}
