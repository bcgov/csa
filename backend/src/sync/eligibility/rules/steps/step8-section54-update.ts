import { CSA_STATUS, CsaStatus } from 'src/common/state-machine/constants/csa-status.constants'
import { EligibilityResult } from '../../eligibility.types'

/**
 * Step 8 outcome for Section 54 legal auth codes (OPC, OPO, OPT).
 * Extends the standard Step 8 transitions with in-pay restoration when a record
 * was previously moved to Not Eligible - In Pay / Not Eligible IP-TBD (e.g. CRA cancellation).
 */
export function step8_Section54Update(currentStatus: CsaStatus | null): EligibilityResult {
  let newStatus: CsaStatus | null = null
  if (currentStatus === CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY || currentStatus === null) {
    newStatus = CSA_STATUS.ELIGIBLE_TBD
  } else if (
    currentStatus === CSA_STATUS.NOT_ELIGIBLE_IN_PAY ||
    currentStatus === CSA_STATUS.NOT_ELIGIBLE_IP_TBD
  ) {
    newStatus = CSA_STATUS.IN_PAY
  } else {
    newStatus = currentStatus
  }
  return { step: 8, newStatus, cancelReasonCode: null, careEndDate: null }
}
