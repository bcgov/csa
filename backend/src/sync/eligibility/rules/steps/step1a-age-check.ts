import { CSA_STATUS } from 'src/common/state-machine/constants/csa-status.constants'
import { isEligibleAge } from 'src/common/utils'
import { EligibilityResult } from '../../eligibility.types'
import { EligibilityContext, EligibilityRule } from '../rule.interface'
import { step10_UpdateOver18 } from './step10-update-over18'

/**
 * STEP 1A: Age Check
 * - age <= 18 (through end of birth month) → continue to Step 1B
 * - age > 18 AND csa_status != over_18 → Step 10
 * - already over_18 → no change (null)
 */
export const step1A_AgeCheck: EligibilityRule & {
  evaluate(ctx: EligibilityContext, referenceDate?: Date): EligibilityResult | null
} = {
  name: 'step1A_AgeCheck',

  evaluate(ctx: EligibilityContext, referenceDate: Date = new Date()): EligibilityResult | null {
    const { dateOfBirth, csaStatus } = ctx.contact

    if (!dateOfBirth) return null
    if (isEligibleAge(dateOfBirth, referenceDate)) {
      return null
    }

    if (csaStatus === CSA_STATUS.OVER_18) {
      return null
    }

    return step10_UpdateOver18(csaStatus)
  },
}
