import { EligibilityResult } from '../../eligibility.types'
import { EligibilityContext, EligibilityRule } from '../rule.interface'
import { step9_UpdateNotEligible } from './step9-update-not-eligible'

/**
 * STEP 1C: Cancellation Check
 * - isInEligible = Y → Step 9
 * - else → continue to Step 2
 */
export const step1C_CancellationCheck: EligibilityRule = {
  name: 'step1C_CancellationCheck',

  evaluate(ctx: EligibilityContext): EligibilityResult | null {
    if (ctx.contact.isInEligible) {
      return step9_UpdateNotEligible(ctx.contact.csaStatus, ctx.contact.cancelReasonCode)
    }

    return null
  },
}
