import { ELIGIBILITY_CONFIG } from '../../eligibility.config'
import { EligibilityResult, OrderRecord } from '../../eligibility.types'
import { EligibilityContext, EligibilityRule } from '../rule.interface'
import { step7_UpdateEligible } from './step7-update-eligible'
import { step8_UpdateEligibleTbd } from './step8-update-eligible-tbd'
import { step9_UpdateNotEligible } from './step9-update-not-eligible'

interface OrderCriteriaResult {
  typeMatch: boolean
  statusMatch: boolean
  dateMatch: boolean
  amountMatch: boolean
}

/**
 * STEP 6: Fetch Order (ICM) / Payment (MIS) details
 * Checks 4 criteria on orders linked to placements via contract number.
 *
 * All 4 met->Step 7
 * Only amount fails (or no order found)->Step 8
 * More than one fails + hasNonPlacement->Step 8
 * More than one fails, no non-placement->Step 9
 */
export const step6_OrderPaymentCheck: EligibilityRule & {
  evaluate(ctx: EligibilityContext, referenceDate?: Date): EligibilityResult | null
} = {
  name: 'step6_OrderPaymentCheck',

  evaluate(ctx: EligibilityContext, referenceDate: Date = new Date()): EligibilityResult | null {
    const { csaStatus, orders } = ctx.contact
    const contractNumbers = ctx.contractNumbers ?? []
    const hasNonPlacement = ctx.hasNonPlacement ?? false

    // Filter orders to those matching placement contract numbers
    const matchingOrders = orders.filter(
      (o) => o.contractNumber && contractNumbers.includes(o.contractNumber),
    )

    if (matchingOrders.length === 0) {
      // No orders found->same as "only amount fails"
      return step8_UpdateEligibleTbd(csaStatus)
    }

    // Check each matching order against 4 criteria, find best match
    const prevMonth = getPreviousMonth(referenceDate)

    for (const order of matchingOrders) {
      const criteria = evaluateOrderCriteria(order, prevMonth)
      const failCount = countFailures(criteria)

      if (failCount === 0) {
        return step7_UpdateEligible(csaStatus)
      }
    }

    // No order passed all 4 criteria. Find the "best" match (fewest failures)
    const bestResult = findBestOrderResult(matchingOrders, prevMonth)

    if (bestResult.onlyAmountFailed) {
      return step8_UpdateEligibleTbd(csaStatus)
    }

    // More than one criterion failed
    if (hasNonPlacement) {
      return step8_UpdateEligibleTbd(csaStatus)
    }

    return step9_UpdateNotEligible(csaStatus)
  },
}

function evaluateOrderCriteria(
  order: OrderRecord,
  prevMonth: { year: number; month: number },
): OrderCriteriaResult {
  const typeMatch = ELIGIBILITY_CONFIG.ELIGIBLE_ORDER_TYPES.includes(order.orderType)
  const statusMatch = ELIGIBILITY_CONFIG.ELIGIBLE_ORDER_STATUSES.includes(order.orderStatus)

  let dateMatch = false
  if (order.effectiveStartDate) {
    const d = order.effectiveStartDate
    dateMatch = d.getFullYear() === prevMonth.year && d.getMonth() === prevMonth.month
  }

  const amountMatch = order.amount >= ELIGIBILITY_CONFIG.MIN_ORDER_AMOUNT

  return { typeMatch, statusMatch, dateMatch, amountMatch }
}

function countFailures(criteria: OrderCriteriaResult): number {
  return [
    criteria.typeMatch,
    criteria.statusMatch,
    criteria.dateMatch,
    criteria.amountMatch,
  ].filter((v) => !v).length
}

function findBestOrderResult(
  orders: OrderRecord[],
  prevMonth: { year: number; month: number },
): { onlyAmountFailed: boolean } {
  let minFailures = 4
  let bestCriteria: OrderCriteriaResult | null = null

  for (const order of orders) {
    const criteria = evaluateOrderCriteria(order, prevMonth)
    const failures = countFailures(criteria)
    if (failures < minFailures) {
      minFailures = failures
      bestCriteria = criteria
    }
  }

  // "Only amount fails" = type, status, and date all pass, only amount fails
  const onlyAmountFailed =
    bestCriteria !== null &&
    minFailures === 1 &&
    bestCriteria.typeMatch &&
    bestCriteria.statusMatch &&
    bestCriteria.dateMatch &&
    !bestCriteria.amountMatch

  return { onlyAmountFailed }
}

function getPreviousMonth(date: Date): { year: number; month: number } {
  const month = date.getMonth() - 1
  if (month < 0) {
    return { year: date.getFullYear() - 1, month: 11 }
  }
  return { year: date.getFullYear(), month }
}
