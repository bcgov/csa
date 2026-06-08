import { normalize } from 'src/common/utils'
import { getPreviousMonth, isInMonth } from '../../eligibility-month'
import { ACTIVE_STATUSES, ENDED_STATUSES, EligibilityResult } from '../../eligibility.types'
import { EligibilityContext, EligibilityRule } from '../rule.interface'
import { step8_UpdateEligibleTbd } from './step8-update-eligible-tbd'

/**
 * STEP 3: Check Placement / Non-Placement Location details
 *
 * Checks placements in the previous month (current month - 1):
 *
 * 1. Active/Interrupted Placement (startDate prior to current month) -> Step 4
 * 2. Ended/Closed Placement (endDate in previous month) -> Step 4
 * 3. BOTH Active AND Ended placements -> ALL go to Step 4 (US-39154)
 * 4. Active/Interrupted Non-Placement (startDate prior to current month) -> Step 8
 * 5. Ended/Closed Non-Placement (endDate in previous month) -> Step 8
 * 6. Both Placement + Non-Placement -> Step 4 (placement precedence)
 * 7. Nothing found -> Step 8
 */
export const step3_PlacementCheck: EligibilityRule = {
  name: 'step3_PlacementCheck',

  evaluate(ctx: EligibilityContext): EligibilityResult | null {
    const { placements } = ctx.contact
    const currentMonthStart = getFirstDayOfMonth(ctx.referenceDate)
    const prevMonth = getPreviousMonth(ctx.referenceDate)

    const activeRecords = placements.filter(
      (placement) =>
        ACTIVE_STATUSES.includes(normalize(placement.status)) &&
        isBeforeDate(placement.startDate, currentMonthStart),
    )

    const endedRecords = placements.filter(
      (placement) =>
        ENDED_STATUSES.includes(normalize(placement.status)) &&
        isInMonth(placement.endDate, prevMonth),
    )

    const activePlacements = activeRecords.filter(
      (placement) => normalize(placement.type) === 'PLACEMENT',
    )
    const activeNonPlacements = activeRecords.filter(
      (placement) => normalize(placement.type) === 'NON-PLACEMENT LOCATION',
    )
    const endedPlacements = endedRecords.filter((record) => normalize(record.type) === 'PLACEMENT')
    const endedNonPlacements = endedRecords.filter(
      (record) => normalize(record.type) === 'NON-PLACEMENT LOCATION',
    )

    const hasActivePlacement = activePlacements.length > 0
    const hasActiveNonPlacement = activeNonPlacements.length > 0
    const hasEndedPlacement = endedPlacements.length > 0
    const hasEndedNonPlacement = endedNonPlacements.length > 0

    // US-39154: Include BOTH Active/Interrupted AND Ended/Closed placements when present
    if (hasActivePlacement || hasEndedPlacement) {
      ctx.hasPlacement = true
      ctx.hasNonPlacement = hasActiveNonPlacement || hasEndedNonPlacement
      // Combine all placements from previous month (both active and ended)
      ctx.eligiblePlacements = [...activePlacements, ...endedPlacements]
      return null
    }

    if (hasActiveNonPlacement) {
      ctx.hasPlacement = false
      ctx.hasNonPlacement = true
      ctx.eligiblePlacements = []
      return step8_UpdateEligibleTbd(ctx.contact.csaStatus)
    }

    if (hasEndedNonPlacement) {
      ctx.hasPlacement = false
      ctx.hasNonPlacement = true
      ctx.eligiblePlacements = []
      return step8_UpdateEligibleTbd(ctx.contact.csaStatus)
    }

    ctx.hasPlacement = false
    ctx.hasNonPlacement = false
    ctx.eligiblePlacements = []
    return step8_UpdateEligibleTbd(ctx.contact.csaStatus)
  },
}

function getFirstDayOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function isBeforeDate(date: Date | null, threshold: Date): boolean {
  if (!date) return false
  return date < threshold
}
