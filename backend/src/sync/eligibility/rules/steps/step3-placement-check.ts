import { normalize } from 'src/common/utils'
import { EligibilityResult } from '../../eligibility.types'
import { EligibilityContext, EligibilityRule } from '../rule.interface'
import { step8_UpdateEligibleTbd } from './step8-update-eligible-tbd'

const ACTIVE_STATUSES = ['ACTIVE', 'INTERRUPTED']

/**
 * STEP 3: Check Placement / Non-Placement Location
 * Analyzes placements and enriches context for downstream rules.
 *
 * - Active/Interrupted Placement found->Step 4 (continue chain)
 * - Only Non-Placement Location found->Step 8
 * - Both Placement + Non-Placement->Step 4 (flag hasNonPlacement)
 * - No placement found->Step 8
 */
export const step3_PlacementCheck: EligibilityRule = {
  name: 'step3_PlacementCheck',

  evaluate(ctx: EligibilityContext): EligibilityResult | null {
    const { placements } = ctx.contact

    const activePlacements = placements.filter((placement) =>
      ACTIVE_STATUSES.includes(normalize(placement.status)),
    )

    const placementRecords = activePlacements.filter(
      (placement) => normalize(placement.type) === 'PLACEMENT',
    )
    const nonPlacementRecords = activePlacements.filter(
      (placement) => normalize(placement.type) === 'NON-PLACEMENT LOCATION',
    )

    const hasPlacement = placementRecords.length > 0
    const hasNonPlacement = nonPlacementRecords.length > 0

    // Enrich context for downstream rules
    ctx.hasPlacement = hasPlacement
    ctx.hasNonPlacement = hasNonPlacement
    ctx.eligiblePlacements = placementRecords

    if (hasPlacement) {
      return null
    }

    return step8_UpdateEligibleTbd(ctx.contact.csaStatus)
  },
}
