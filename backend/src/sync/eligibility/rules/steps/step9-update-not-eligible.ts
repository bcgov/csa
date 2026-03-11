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

  if (currentStatus === CSA_STATUS.ELIGIBLE || currentStatus === null) {
    newStatus = CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY
  } else if (currentStatus === CSA_STATUS.IN_PAY) {
    newStatus = CSA_STATUS.NOT_ELIGIBLE_IN_PAY
    reasonCode = cancelReasonCode ?? ELIGIBILITY_CONFIG.DEFAULT_CANCEL_REASON_CODE
    endDate = careEndDate ?? referenceDate ?? pacificToday()
  } else {
    newStatus = currentStatus
  }

  return { step: 9, newStatus, cancelReasonCode: reasonCode, careEndDate: endDate }
}
