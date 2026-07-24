import type { PlacementRecord } from '../eligibility.types'

/**
 * Determines the Care End Date for CRA cancellation transactions.
 *
 * Calculated Placement Date:
 *   Latest endDate from all ICM and MIS placements
 *
 * Care End Date = Latest Placement Date
 *   - If both null, return null (Step 9 fail-safe uses system date)
 */
export function determineCareEndDate(placements: PlacementRecord[]): Date | null {
  // latest placement end date across ICM + MIS
  const placementDates = placements
    .filter((placement) => placement.endDate != null)
    .map((placement) => placement.endDate!.getTime())

  return placementDates.length > 0 ? new Date(Math.max(...placementDates)) : null
}
