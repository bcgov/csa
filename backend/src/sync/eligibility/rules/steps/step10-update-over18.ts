import { CSA_STATUS, CsaStatus } from 'src/common/state-machine/constants/csa-status.constants'
import { EligibilityResult } from '../../eligibility.types'

export function step10_UpdateOver18(currentStatus: CsaStatus | null): EligibilityResult {
  let newStatus: CsaStatus | null = null
  if (
    currentStatus === CSA_STATUS.ELIGIBLE ||
    currentStatus === CSA_STATUS.ELIGIBLE_TBD ||
    currentStatus === CSA_STATUS.IN_PAY ||
    currentStatus === CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY ||
    currentStatus === CSA_STATUS.NOT_ELIGIBLE_IN_PAY ||
    currentStatus === CSA_STATUS.NOT_ELIGIBLE_IP_TBD ||
    currentStatus === null
  ) {
    newStatus = CSA_STATUS.OVER_18
  } else {
    newStatus = currentStatus
  }
  return { step: 10, newStatus, cancelReasonCode: null, careEndDate: null }
}
