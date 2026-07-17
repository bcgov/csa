import { CSA_STATUS, CsaStatus } from 'src/common/state-machine/constants/csa-status.constants'
import { pacificToday } from 'src/common/utils'
import { EligibilityResult } from '../../eligibility.types'
import { ELIGIBILITY_CONFIG } from '../../eligibility.config'

export function step9_UpdateNotEligible(
  currentStatus: CsaStatus | null,
  cancelReasonCode?: string | null,
  careEndDate?: Date | null,
  referenceDate?: Date,
): EligibilityResult {
  let newStatus: CsaStatus | null = null
  let reasonCode: string | null = null
  let endDate: Date | null = null

  if (
    currentStatus === CSA_STATUS.ELIGIBLE ||
    currentStatus === CSA_STATUS.ELIGIBLE_TBD ||
    currentStatus === null
  ) {
    newStatus = CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY
  } else if (
    currentStatus === CSA_STATUS.IN_PAY ||
    currentStatus === CSA_STATUS.NOT_ELIGIBLE_IP_TBD
  ) {
    newStatus = CSA_STATUS.NOT_ELIGIBLE_IN_PAY
    reasonCode = cancelReasonCode ?? ELIGIBILITY_CONFIG.DEFAULT_CANCEL_REASON_CODE
    endDate = careEndDate ?? referenceDate ?? pacificToday()
  } else if (currentStatus === CSA_STATUS.NOT_ELIGIBLE_IN_PAY) {
    newStatus = currentStatus
    reasonCode = cancelReasonCode ?? null
    endDate = careEndDate ?? null
  } else {
    newStatus = currentStatus
  }

  return { step: 9, newStatus, cancelReasonCode: reasonCode, careEndDate: endDate }
}
