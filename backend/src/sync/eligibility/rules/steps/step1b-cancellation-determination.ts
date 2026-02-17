import { determineCancellationReason } from '../../cancellation/determine-cancellation-reason'
import { EligibilityResult } from '../../eligibility.types'
import { EligibilityContext, EligibilityRule } from '../rule.interface'

/**
 * STEP 1B (pre): Cancellation Reason Determination
 *
 * Derives cancellation reason code from ICM/MIS staging data already loaded
 * in the contact profile:
 *   - Code 14: deceased flag = Y
 *   - Code 22: ICM sub-type 'Absent/Unknown Location' Active OR MIS type 'AW' Active
 *   - Code 29: ICM sub-type 'Adoption Home' Active OR MIS type 'AD' Active
 *
 * Enriches ctx.contact in-memory (isInEligible + cancelReasonCode) so that
 * the next step (Step 1B cancellation check) can route to Step 9 with the
 * correct code.
 *
 * Always returns null (never short-circuits) — this is a context-enrichment step.
 */
export const step1B_CancellationDetermination: EligibilityRule = {
  name: 'step1B_CancellationDetermination',

  evaluate(ctx: EligibilityContext): EligibilityResult | null {
    const { contact } = ctx

    const result = determineCancellationReason({
      deceased: contact.deceased,
      icmPlacements: contact.placements
        .filter((p) => p.source === 'ICM')
        .map((p) => ({ type: p.type, serviceType: p.serviceType ?? null, status: p.status })),
      misPlacements: contact.placements
        .filter((p) => p.source === 'MIS')
        .map((p) => ({ type: p.type, status: p.status })),
    })

    if (result.isInEligible) {
      contact.isInEligible = true
      contact.cancelReasonCode = result.cancelReasonCode
    }

    return null
  },
}
