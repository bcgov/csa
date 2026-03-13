import { determineCancellationReason } from '../../cancellation/determine-cancellation-reason'
import { determineCareEndDate } from '../../cancellation/determine-care-end-date'
import { EligibilityResult } from '../../eligibility.types'
import { EligibilityContext, EligibilityRule } from '../rule.interface'
import { step9_UpdateNotEligible } from './step9-update-not-eligible'

/**
 * STEP 1B: Cancellation Check
 *
 * 1. Derives cancellation reason code from ICM/MIS staging data:
 *    - Code 14: deceased flag = Y
 *    - Code 22: ICM sub-type 'Absent/Unknown Location' Active OR MIS type 'AW' Active
 *    - Code 29: ICM sub-type 'Adoption Home' Active OR MIS type 'AD' Active
 *
 * 2. If cancellation triggered, computes Care End Date from
 *    order/payment end dates.
 *
 * 3. Routes to Step 9 with cancelReasonCode + careEndDate.
 *    If no cancellation condition → returns null (continue to Step 2).
 */
export const step1B_CancellationCheck: EligibilityRule = {
  name: 'step1B_CancellationCheck',

  evaluate(ctx: EligibilityContext): EligibilityResult | null {
    const { contact } = ctx

    const result = determineCancellationReason({
      deceased: contact.deceased,
      icmPlacements: contact.placements
        .filter((placement) => placement.source === 'ICM')
        .map((placement) => ({
          type: placement.type,
          serviceType: placement.serviceType ?? null,
          status: placement.status,
        })),
      misPlacements: contact.placements
        .filter((placement) => placement.source === 'MIS')
        .map((placement) => ({ type: placement.rawType, status: placement.status })),
    })

    if (result.isIneligible) {
      const careEndDate = determineCareEndDate(contact.orders, contact.placements)
      return step9_UpdateNotEligible(
        contact.csaStatus,
        result.cancelReasonCode,
        careEndDate,
        ctx.referenceDate,
      )
    }

    return null
  },
}
