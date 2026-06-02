import { normalize } from 'src/common/utils'
import { getPreviousMonth, isInMonth } from '../../eligibility-month'
import { ELIGIBILITY_CONFIG } from '../../eligibility.config'
import { EligibilityResult } from '../../eligibility.types'
import { EligibilityContext, EligibilityRule } from '../rule.interface'
import { step7_UpdateEligible } from './step7-update-eligible'
import { step8_UpdateEligibleTbd } from './step8-update-eligible-tbd'
import { step9_UpdateNotEligible } from './step9-update-not-eligible'

/**
 * STEP 6: Order (ICM) / Payment (MIS) check
 *
 * ICM takes precedence over MIS (per FDD):
 * 1. Link orders to eligible placements via contractNumber or agreementRowId
 * 2. Check ICM orders for previous month first
 * 3. Only fall back to MIS payments if no ICM orders found in previous month
 * 4. Evaluate against 4 criteria (type, status, date, amount)
 *
 * Any order matches all 4 -> Step 7 (eligible)
 * Best match only fails on amount -> Step 8 (eligible_tbd)
 * More than one criterion fails -> Step 8 if hasNonPlacement, Step 9 otherwise
 * No matching orders at all -> Step 8 (eligible_tbd)
 */
export const step6_OrderPaymentCheck: EligibilityRule = {
  name: 'step6_OrderPaymentCheck',

  evaluate(ctx: EligibilityContext): EligibilityResult | null {
    const { csaStatus, orders } = ctx.contact
    const contractNumbers = ctx.contractNumbers ?? []
    const agreementRowIds = ctx.agreementRowIds ?? []
    const hasNonPlacement = ctx.hasNonPlacement ?? false

    const matchingOrders = orders.filter(
      (order) =>
        (order.contractNumber && contractNumbers.includes(order.contractNumber)) ||
        (order.agreementRowId && agreementRowIds.includes(order.agreementRowId)),
    )

    if (matchingOrders.length === 0) {
      return step8_UpdateEligibleTbd(csaStatus)
    }

    const prevMonth = getPreviousMonth(ctx.referenceDate)

    // ICM first: check ICM orders in previous month
    const icmOrders = matchingOrders.filter((order) => order.source === 'ICM')
    const icmPrevMonth = icmOrders.filter((order) => isInMonth(order.effectiveStartDate, prevMonth))

    // Fall back to MIS only if no ICM orders in previous month
    const previousMonthOrders =
      icmPrevMonth.length > 0
        ? icmPrevMonth
        : matchingOrders
            .filter((order) => order.source === 'MIS')
            .filter((order) => isInMonth(order.effectiveStartDate, prevMonth))

    if (previousMonthOrders.length === 0) {
      return hasNonPlacement
        ? step8_UpdateEligibleTbd(csaStatus)
        : step9_UpdateNotEligible(
            csaStatus,
            ctx.cancelReasonCode,
            ctx.careEndDate,
            ctx.referenceDate,
          )
    }

    // Filter orders that match type AND status criteria
    const validOrders = previousMonthOrders.filter((order) => {
      const typeMatch = ELIGIBILITY_CONFIG.ELIGIBLE_ORDER_TYPES.includes(normalize(order.orderType))
      const statusMatch = ELIGIBILITY_CONFIG.ELIGIBLE_ORDER_STATUSES.includes(
        normalize(order.orderStatus),
      )
      return typeMatch && statusMatch
    })

    // Calculate total amount from all valid orders (handles multiple/split orders in same month)
    const totalAmount = validOrders.reduce((sum, order) => sum + order.amount, 0)

    // Check if total meets minimum threshold
    if (validOrders.length > 0 && totalAmount >= ELIGIBILITY_CONFIG.MIN_ORDER_AMOUNT) {
      return step7_UpdateEligible(csaStatus)
    }

    // Valid orders exist but total amount insufficient
    if (validOrders.length > 0) {
      return step8_UpdateEligibleTbd(csaStatus)
    }

    // No valid orders found
    return hasNonPlacement
      ? step8_UpdateEligibleTbd(csaStatus)
      : step9_UpdateNotEligible(csaStatus, ctx.cancelReasonCode, ctx.careEndDate, ctx.referenceDate)
  },
}
