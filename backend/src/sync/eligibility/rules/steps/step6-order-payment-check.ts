import { normalize } from 'src/common/utils'
import { ELIGIBILITY_CONFIG } from '../../eligibility.config'
import { EligibilityResult } from '../../eligibility.types'
import { EligibilityContext, EligibilityRule } from '../rule.interface'
import { step7_UpdateEligible } from './step7-update-eligible'
import { step8_UpdateEligibleTbd } from './step8-update-eligible-tbd'
import { step9_UpdateNotEligible } from './step9-update-not-eligible'

/**
 * STEP 6: Order (ICM) / Payment (MIS) check
 *
 * From orders linked to valid placements via contract number:
 * 1. Filter to previous month orders only
 * 2. Pick the highest amount
 * 3. Check type, status, and amount on that single order
 *
 * All 3 pass -> Step 7 (eligible)
 * Type+status pass, amount fails -> Step 8 (eligible_tbd)
 * No previous-month orders or type/status fail -> Step 8 if hasNonPlacement, Step 9 otherwise
 * No matching orders at all -> Step 8 (eligible_tbd)
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
      return step8_UpdateEligibleTbd(csaStatus)
    }

    // Filter to previous month and pick highest amount
    const prevMonth = getPreviousMonth(referenceDate)
    const previousMonthOrders = matchingOrders.filter((o) =>
      isInMonth(o.effectiveStartDate, prevMonth),
    )

    if (previousMonthOrders.length === 0) {
      return hasNonPlacement
        ? step8_UpdateEligibleTbd(csaStatus)
        : step9_UpdateNotEligible(csaStatus)
    }

    const selectedOrder = previousMonthOrders.reduce((best, current) =>
      current.amount > best.amount ? current : best,
    )

    // Check type and status on the selected order
    const typeMatch = ELIGIBILITY_CONFIG.ELIGIBLE_ORDER_TYPES.includes(
      normalize(selectedOrder.orderType),
    )
    const statusMatch = ELIGIBILITY_CONFIG.ELIGIBLE_ORDER_STATUSES.includes(
      normalize(selectedOrder.orderStatus),
    )
    const amountMatch = selectedOrder.amount >= ELIGIBILITY_CONFIG.MIN_ORDER_AMOUNT

    if (typeMatch && statusMatch && amountMatch) {
      return step7_UpdateEligible(csaStatus)
    }

    if (typeMatch && statusMatch && !amountMatch) {
      return step8_UpdateEligibleTbd(csaStatus)
    }

    // Type or status failed
    return hasNonPlacement ? step8_UpdateEligibleTbd(csaStatus) : step9_UpdateNotEligible(csaStatus)
  },
}

function isInMonth(date: Date | null, month: { year: number; month: number }): boolean {
  if (!date) return false
  return date.getFullYear() === month.year && date.getMonth() === month.month
}

function getPreviousMonth(date: Date): { year: number; month: number } {
  const month = date.getMonth() - 1
  if (month < 0) {
    return { year: date.getFullYear() - 1, month: 11 }
  }
  return { year: date.getFullYear(), month }
}
