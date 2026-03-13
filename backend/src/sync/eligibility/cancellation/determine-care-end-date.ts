import { normalize } from 'src/common/utils'
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
      (order) =>
        order.effectiveEndDate != null &&
        ((order.source === 'ICM' && normalize(order.orderStatus) === 'CLOSED') ||
          (order.source === 'MIS' && normalize(order.orderStatus) === 'PROCESSED')),
    )
    .map((order) => order.effectiveEndDate!.getTime())

  const calculatedOrderDate = orderDates.length > 0 ? new Date(Math.max(...orderDates)) : null

  // latest placement end date
  const placementDates = placements
    .filter((placement) => placement.endDate != null)
    .map((placement) => placement.endDate!.getTime())

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
