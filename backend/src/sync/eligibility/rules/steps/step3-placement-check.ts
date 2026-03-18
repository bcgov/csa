import { normalize } from 'src/common/utils'
import { EligibilityResult } from '../../eligibility.types'
import { EligibilityContext, EligibilityRule } from '../rule.interface'
import { step8_UpdateEligibleTbd } from './step8-update-eligible-tbd'

const ACTIVE_STATUSES = ['ACTIVE', 'INTERRUPTED']
const ENDED_STATUSES = ['ENDED', 'CLOSED']

/**
 * STEP 3: Check Placement / Non-Placement Location details
 *
 * Checks placements in the previous month (current month - 1):
 *
 * 1. Active/Interrupted Placement (startDate prior to current month) -> Step 4
 * 2. Fallback: Ended/Closed Placement (endDate in previous month) -> Step 4
 * 3. Active/Interrupted Non-Placement (startDate prior to current month) -> Step 8
 * 4. Fallback: Ended/Closed Non-Placement (endDate in previous month) -> Step 4
 * 5. Both Placement + Non-Placement -> Step 4 (placement precedence)
 * 6. Nothing found -> Step 8
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
    const endedPlacements = endedRecords.filter((p) => normalize(p.type) === 'PLACEMENT')
    const endedNonPlacements = endedRecords.filter(
      (p) => normalize(p.type) === 'NON-PLACEMENT LOCATION',
    )

    const hasActivePlacement = activePlacements.length > 0
    const hasActiveNonPlacement = activeNonPlacements.length > 0
    const hasEndedPlacement = endedPlacements.length > 0
    const hasEndedNonPlacement = endedNonPlacements.length > 0

    if (hasActivePlacement) {
      ctx.hasPlacement = true
      ctx.hasNonPlacement = hasActiveNonPlacement
      ctx.eligiblePlacements = activePlacements
      return null
    }

    if (hasEndedPlacement) {
      ctx.hasPlacement = true
      ctx.hasNonPlacement = hasActiveNonPlacement || hasEndedNonPlacement
      ctx.eligiblePlacements = endedPlacements
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
      ctx.eligiblePlacements = endedNonPlacements
      return null
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

function getPreviousMonth(date: Date): { year: number; month: number } {
  const month = date.getUTCMonth() - 1
  if (month < 0) {
    return { year: date.getUTCFullYear() - 1, month: 11 }
  }
  return { year: date.getUTCFullYear(), month }
}

function isBeforeDate(date: Date | null, threshold: Date): boolean {
  if (!date) return false
  return date < threshold
}

function isInMonth(date: Date | null, month: { year: number; month: number }): boolean {
  if (!date) return false
  return date.getUTCFullYear() === month.year && date.getUTCMonth() === month.month
}
