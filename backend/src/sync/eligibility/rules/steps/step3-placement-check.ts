import { EligibilityResult } from '../../eligibility.types'
import { EligibilityContext, EligibilityRule } from '../rule.interface'
import { step8_UpdateEligibleTbd } from './step8-update-eligible-tbd'

const ACTIVE_STATUSES = ['Active', 'Interrupted']

/**
 * STEP 3: Check Placement / Non-Placement Location
 * Analyzes placements and enriches context for downstream rules.
 *
 * - Active/Interrupted Placement found → Step 4 (continue chain)
 * - Only Non-Placement Location found → Step 8
 * - Both Placement + Non-Placement → Step 4 (flag hasNonPlacement)
 * - No placement found → Step 8
 */
export const step3_PlacementCheck: EligibilityRule = {
  name: 'step3_PlacementCheck',

  evaluate(ctx: EligibilityContext): EligibilityResult | null {
    const { placements } = ctx.contact

    const activePlacements = placements.filter((p) => ACTIVE_STATUSES.includes(p.status))

    const placementRecords = activePlacements.filter((p) => p.type === 'Placement')
    const nonPlacementRecords = activePlacements.filter((p) => p.type === 'Non-Placement Location')

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
