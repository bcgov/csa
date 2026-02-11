import { CSA_STATUS, CsaStatus } from 'src/common/state-machine/constants/csa-status.constants'
import { EligibilityResult } from '../../eligibility.types'

export function step7_UpdateEligible(currentStatus: CsaStatus | null): EligibilityResult {
  let newStatus: CsaStatus | null = null
  if (currentStatus === CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY || currentStatus === null) {
    newStatus = CSA_STATUS.ELIGIBLE
  } else if (currentStatus === CSA_STATUS.NOT_ELIGIBLE_IN_PAY) {
    newStatus = CSA_STATUS.IN_PAY
  }
  return { step: 7, newStatus, cancelReasonCode: null, careEndDate: null }
}
