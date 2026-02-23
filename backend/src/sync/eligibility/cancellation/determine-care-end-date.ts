import type { OrderRecord, PlacementRecord } from '../eligibility.types'

/**
 * Determines the Care End Date for CRA cancellation transactions.
 *
 * Calculated Order Date:
 *   Latest effectiveEndDate from ICM orders (status=Closed) and MIS payments (status=Processed)
 *
 * Calculated Placement Date:
 *   Latest endDate from all ICM and MIS placements
 *
 * Care End Date = Earliest Order Date and Placement Date
 *   - If one is null, use the other
 *   - If both null, return null (Step 9 fail-safe uses system date)
 */
export function determineCareEndDate(
  orders: OrderRecord[],
  placements: PlacementRecord[],
): Date | null {
  // latest order/payment end date
  const orderDates = orders
    .filter(
      (o) =>
        o.effectiveEndDate != null &&
        ((o.source === 'ICM' && o.orderStatus === 'Closed') ||
          (o.source === 'MIS' && o.orderStatus === 'Processed')),
    )
    .map((o) => o.effectiveEndDate!.getTime())

  const calculatedOrderDate = orderDates.length > 0 ? new Date(Math.max(...orderDates)) : null

  // latest placement end date
  const placementDates = placements
    .filter((p) => p.endDate != null)
    .map((p) => p.endDate!.getTime())

  const calculatedPlacementDate =
    placementDates.length > 0 ? new Date(Math.max(...placementDates)) : null

  // Care End Date = earliest of the two signals
  if (calculatedOrderDate && calculatedPlacementDate) {
    return calculatedOrderDate <= calculatedPlacementDate
      ? calculatedOrderDate
      : calculatedPlacementDate
  }

  return calculatedOrderDate ?? calculatedPlacementDate
}
