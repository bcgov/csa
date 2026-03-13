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
 * Order matching:
 * - MIS orders: all included (already scoped to the contact via person_id_mis at SQL level)
 * - ICM orders: linked via contractNumber or agreementRowId from Step 4
 *
 * Then:
 * 1. Filter to previous month orders only
 * 2. Check ALL orders against the 4 criteria (type, status, date, amount)
 *
 * Any order matches all 4 -> Step 7 (eligible)
 * Best match only fails on amount (or no order found) -> Step 8 (eligible_tbd)
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
        order.source === 'MIS' ||
        (order.contractNumber && contractNumbers.includes(order.contractNumber)) ||
        (order.agreementRowId && agreementRowIds.includes(order.agreementRowId)),
    )

    if (matchingOrders.length === 0) {
      return step8_UpdateEligibleTbd(csaStatus)
    }

    const prevMonth = getPreviousMonth(ctx.referenceDate)
    const previousMonthOrders = matchingOrders.filter((order) =>
      isInMonth(order.effectiveStartDate, prevMonth),
    )

    if (previousMonthOrders.length === 0) {
      return hasNonPlacement
        ? step8_UpdateEligibleTbd(csaStatus)
        : step9_UpdateNotEligible(csaStatus, null, null, ctx.referenceDate)
    }

    let hasTypeStatusMatch = false
    for (const order of previousMonthOrders) {
      const typeMatch = ELIGIBILITY_CONFIG.ELIGIBLE_ORDER_TYPES.includes(normalize(order.orderType))
      const statusMatch = ELIGIBILITY_CONFIG.ELIGIBLE_ORDER_STATUSES.includes(
        normalize(order.orderStatus),
      )
      const amountMatch = order.amount >= ELIGIBILITY_CONFIG.MIN_ORDER_AMOUNT

      if (typeMatch && statusMatch && amountMatch) {
        return step7_UpdateEligible(csaStatus)
      }

      if (typeMatch && statusMatch) {
        hasTypeStatusMatch = true
      }
    }

    if (hasTypeStatusMatch) {
      return step8_UpdateEligibleTbd(csaStatus)
    }

    return hasNonPlacement
      ? step8_UpdateEligibleTbd(csaStatus)
      : step9_UpdateNotEligible(csaStatus, null, null, ctx.referenceDate)
  },
}

function isInMonth(date: Date | null, month: { year: number; month: number }): boolean {
  if (!date) return false
  return date.getUTCFullYear() === month.year && date.getUTCMonth() === month.month
}

function getPreviousMonth(date: Date): { year: number; month: number } {
  const month = date.getUTCMonth() - 1
  if (month < 0) {
    return { year: date.getUTCFullYear() - 1, month: 11 }
  }
  return { year: date.getUTCFullYear(), month }
}
