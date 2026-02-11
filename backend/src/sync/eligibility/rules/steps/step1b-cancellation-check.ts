import { EligibilityResult } from '../../eligibility.types'
import { EligibilityContext, EligibilityRule } from '../rule.interface'
import { step9_UpdateNotEligible } from './step9-update-not-eligible'

/**
 * STEP 1B: Cancellation Check
 * - isInEligible = Y → Step 9
 * - else → continue to Step 2
 *
 * TODO: isInEligible is currently stubbed with random true/false.
 * Will be replaced by Cancellation Determination process in future.
 */
export const step1B_CancellationCheck: EligibilityRule = {
  name: 'step1B_CancellationCheck',

  evaluate(ctx: EligibilityContext): EligibilityResult | null {
    if (ctx.contact.isInEligible) {
      return step9_UpdateNotEligible(ctx.contact.csaStatus)
    }

    return null
  },
}
