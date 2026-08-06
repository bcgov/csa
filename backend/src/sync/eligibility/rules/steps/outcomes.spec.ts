import { describe, it, expect } from 'vitest'
import { CSA_STATUS } from 'src/common/state-machine/constants/csa-status.constants'
import { step7_UpdateEligible } from './step7-update-eligible'
import { step8_UpdateEligibleTbd } from './step8-update-eligible-tbd'
import { step9_UpdateNotEligible } from './step9-update-not-eligible'
import { step10_UpdateOver18 } from './step10-update-over18'

describe('step7_UpdateEligible', () => {
  it('should return eligible when current status is not_eligible_out_of_pay', () => {
    const result = step7_UpdateEligible(CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY)
    expect(result).toEqual({
      step: 7,
      newStatus: CSA_STATUS.ELIGIBLE,
      cancelReasonCode: null,
      careEndDate: null,
    })
  })

  it('should return eligible when current status is blank (null)', () => {
    const result = step7_UpdateEligible(null)
    expect(result).toEqual({
      step: 7,
      newStatus: CSA_STATUS.ELIGIBLE,
      cancelReasonCode: null,
      careEndDate: null,
    })
  })

  it('should return in_pay when current status is not_eligible_in_pay', () => {
    const result = step7_UpdateEligible(CSA_STATUS.NOT_ELIGIBLE_IN_PAY)
    expect(result).toEqual({
      step: 7,
      newStatus: CSA_STATUS.IN_PAY,
      cancelReasonCode: null,
      careEndDate: null,
    })
  })

  it('should return eligible when current status is eligible_tbd', () => {
    const result = step7_UpdateEligible(CSA_STATUS.ELIGIBLE_TBD)
    expect(result.newStatus).toBe(CSA_STATUS.ELIGIBLE)
  })

  it('should return in_pay when current status is not_eligible_ip_tbd', () => {
    const result = step7_UpdateEligible(CSA_STATUS.NOT_ELIGIBLE_IP_TBD)
    expect(result.newStatus).toBe(CSA_STATUS.IN_PAY)
  })

  it('should keep existing status when no transition applies', () => {
    const result = step7_UpdateEligible(CSA_STATUS.ELIGIBLE)
    expect(result.step).toBe(7)
    expect(result.newStatus).toBe(CSA_STATUS.ELIGIBLE)
  })
})

describe('step8_UpdateEligibleTbd', () => {
  it('should return eligible_tbd when current status is not_eligible_out_of_pay', () => {
    const result = step8_UpdateEligibleTbd(CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY)
    expect(result.newStatus).toBe(CSA_STATUS.ELIGIBLE_TBD)
  })

  it('should return eligible_tbd when current status is blank (null)', () => {
    const result = step8_UpdateEligibleTbd(null)
    expect(result.newStatus).toBe(CSA_STATUS.ELIGIBLE_TBD)
  })

  it('should keep existing status when no transition applies', () => {
    const result = step8_UpdateEligibleTbd(CSA_STATUS.ELIGIBLE)
    expect(result.newStatus).toBe(CSA_STATUS.ELIGIBLE)
  })

  it('should return in_pay when current status is not_eligible_in_pay', () => {
    const result = step8_UpdateEligibleTbd(CSA_STATUS.NOT_ELIGIBLE_IN_PAY)
    expect(result).toEqual({
      step: 8,
      newStatus: CSA_STATUS.IN_PAY,
      cancelReasonCode: null,
      careEndDate: null,
    })
  })

  it('should return in_pay when current status is not_eligible_ip_tbd', () => {
    const result = step8_UpdateEligibleTbd(CSA_STATUS.NOT_ELIGIBLE_IP_TBD)
    expect(result.newStatus).toBe(CSA_STATUS.IN_PAY)
  })
})

describe('step9_UpdateNotEligible', () => {
  it('should return not_eligible_out_of_pay when current status is eligible', () => {
    const result = step9_UpdateNotEligible(CSA_STATUS.ELIGIBLE)
    expect(result.newStatus).toBe(CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY)
  })

  it('should return not_eligible_in_pay when current status is in_pay', () => {
    const result = step9_UpdateNotEligible(CSA_STATUS.IN_PAY)
    expect(result.newStatus).toBe(CSA_STATUS.NOT_ELIGIBLE_IN_PAY)
    expect(result.cancelReasonCode).toBe('21')
    expect(result.careEndDate).toBeInstanceOf(Date)
  })

  it('should use provided cancel reason code and care end date', () => {
    const careEnd = new Date('2026-03-01')
    const result = step9_UpdateNotEligible(CSA_STATUS.IN_PAY, '15', careEnd)
    expect(result.cancelReasonCode).toBe('15')
    expect(result.careEndDate).toEqual(careEnd)
  })

  it('should return not_eligible_out_of_pay when current status is eligible_tbd', () => {
    const result = step9_UpdateNotEligible(CSA_STATUS.ELIGIBLE_TBD)
    expect(result.newStatus).toBe(CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY)
  })

  it('should return not_eligible_in_pay when current status is not_eligible_ip_tbd', () => {
    const result = step9_UpdateNotEligible(CSA_STATUS.NOT_ELIGIBLE_IP_TBD)
    expect(result.newStatus).toBe(CSA_STATUS.NOT_ELIGIBLE_IN_PAY)
    expect(result.cancelReasonCode).toBe('21')
    expect(result.careEndDate).toBeInstanceOf(Date)
  })

  it('should keep existing status when no transition applies', () => {
    const result = step9_UpdateNotEligible(CSA_STATUS.ON_HOLD)
    expect(result.newStatus).toBe(CSA_STATUS.ON_HOLD)
    expect(result.cancelReasonCode).toBeNull()
    expect(result.careEndDate).toBeNull()
  })

  it('should retain Step 1B cancellation fields when status is already not_eligible_in_pay', () => {
    const careEnd = new Date('2026-02-15')
    const result = step9_UpdateNotEligible(CSA_STATUS.NOT_ELIGIBLE_IN_PAY, '29', careEnd)
    expect(result.newStatus).toBe(CSA_STATUS.NOT_ELIGIBLE_IN_PAY)
    expect(result.cancelReasonCode).toBe('29')
    expect(result.careEndDate).toEqual(careEnd)
  })

  it('should not populate cancellation fields for other unchanged statuses', () => {
    const result = step9_UpdateNotEligible(
      CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY,
      '14',
      new Date('2026-02-15'),
    )
    expect(result.newStatus).toBe(CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY)
    expect(result.cancelReasonCode).toBeNull()
    expect(result.careEndDate).toBeNull()
  })
})

describe('step10_UpdateOver18', () => {
  it('should return over_18 when current status is eligible', () => {
    const result = step10_UpdateOver18(CSA_STATUS.ELIGIBLE)
    expect(result.newStatus).toBe(CSA_STATUS.OVER_18)
  })

  it('should return over_18 when current status is in_pay', () => {
    const result = step10_UpdateOver18(CSA_STATUS.IN_PAY)
    expect(result.newStatus).toBe(CSA_STATUS.OVER_18)
  })

  it('should return over_18 when current status is not_eligible_out_of_pay', () => {
    const result = step10_UpdateOver18(CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY)
    expect(result.newStatus).toBe(CSA_STATUS.OVER_18)
  })

  it('should return over_18 when current status is blank (null)', () => {
    const result = step10_UpdateOver18(null)
    expect(result.newStatus).toBe(CSA_STATUS.OVER_18)
  })

  it('should return over_18 when current status is eligible_tbd', () => {
    const result = step10_UpdateOver18(CSA_STATUS.ELIGIBLE_TBD)
    expect(result.newStatus).toBe(CSA_STATUS.OVER_18)
  })

  it('should return over_18 when current status is not_eligible_in_pay', () => {
    const result = step10_UpdateOver18(CSA_STATUS.NOT_ELIGIBLE_IN_PAY)
    expect(result.newStatus).toBe(CSA_STATUS.OVER_18)
  })

  it('should return over_18 when current status is not_eligible_ip_tbd', () => {
    const result = step10_UpdateOver18(CSA_STATUS.NOT_ELIGIBLE_IP_TBD)
    expect(result.newStatus).toBe(CSA_STATUS.OVER_18)
  })

  it('should keep existing status when no transition applies', () => {
    const result = step10_UpdateOver18(CSA_STATUS.ON_HOLD)
    expect(result.newStatus).toBe(CSA_STATUS.ON_HOLD)
  })
})
