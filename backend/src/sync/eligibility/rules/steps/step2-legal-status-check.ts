import { normalize } from 'src/common/utils'
import { ELIGIBILITY_CONFIG } from '../../eligibility.config'
import { EligibilityResult } from '../../eligibility.types'
import { EligibilityContext, EligibilityRule } from '../rule.interface'
import { step8_UpdateEligibleTbd } from './step8-update-eligible-tbd'
import { step9_UpdateNotEligible } from './step9-update-not-eligible'

/**
 * STEP 2: Check Latest Legal Status
 * - MIS Legal Auth Code = OPC/OPO/OPT->Step 8
 * - Legal Authority Expiry >= today OR null:
 *   - Enroll for CSA = Yes->Step 3 (continue chain)
 *   - Enroll for CSA = TBD->Step 8
 *   - Enroll for CSA = No->Step 9
 * - Expired->Step 9
 */
export const step2_LegalStatusCheck: EligibilityRule = {
  name: 'step2_LegalStatusCheck',

  evaluate(ctx: EligibilityContext): EligibilityResult | null {
    const { csaStatus, misLegalAuthCode, legalExpiryDate, enrollForCsa } = ctx.contact

    if (
      misLegalAuthCode &&
      ELIGIBILITY_CONFIG.STEP8_LEGAL_AUTH_CODES.includes(normalize(misLegalAuthCode)!)
    ) {
      return step8_UpdateEligibleTbd(csaStatus)
    }

    const isNotExpired = legalExpiryDate === null || legalExpiryDate >= ctx.referenceDate

    if (isNotExpired) {
      const normalizedEnroll = normalize(enrollForCsa)
      if (normalizedEnroll === 'YES') return null
      if (normalizedEnroll === 'TBD') return step8_UpdateEligibleTbd(csaStatus)
      if (normalizedEnroll === 'NO')
        return step9_UpdateNotEligible(csaStatus, null, null, ctx.referenceDate)
    }

    return step9_UpdateNotEligible(csaStatus, null, null, ctx.referenceDate)
  },
}
