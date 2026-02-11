import { CSA_STATUS, CsaStatus } from 'src/common/state-machine/constants/csa-status.constants'
import { EligibilityResult } from '../../eligibility.types'

export function step8_UpdateEligibleTbd(currentStatus: CsaStatus | null): EligibilityResult {
  let newStatus: CsaStatus | null = null
  if (currentStatus === CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY || currentStatus === null) {
    newStatus = CSA_STATUS.ELIGIBLE_TBD
  }
  return { step: 8, newStatus, cancelReasonCode: null, careEndDate: null }
}
