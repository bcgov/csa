import { normalize } from 'src/common/utils'
import {
  CANCEL_REASON,
  CancelReasonCode,
  ICM_PLACEMENT,
  MIS_PLACEMENT,
} from './cancellation-reason.constants'

export interface IcmPlacementInput {
  type: string | null
  serviceType: string | null
  status: string | null
}

export interface MisPlacementInput {
  type: string | null
  status: string | null
}

export interface CancellationInput {
  deceased: string | null
  icmPlacements: IcmPlacementInput[]
  misPlacements: MisPlacementInput[]
}

export interface CancellationResult {
  isIneligible: boolean
  cancelReasonCode: CancelReasonCode | null
}

/**
 * Determines the CRA cancellation reason code based on ICM/MIS staging data.
 *
 * Priority order (first match wins):
 *   1. Code 14 - Child Died (deceased flag = Y)
 *   2. Code 22 - Child Missing/AWOL (ICM sub-type 'Absent/Unknown Location' Active, OR MIS type 'AW' Active)
 *   3. Code 29 - Adoption (ICM sub-type 'Adoption Home' Active, OR MIS type 'AD' Active)
 *
 * Code 21 (default) is NOT set here. It's applied by Step 9 when no specific code is present.
 * Returns isIneligible=false when no cancellation conditions are met.
 */
export function determineCancellationReason(input: CancellationInput): CancellationResult {
  // Code 14: Child Died
  if (normalize(input.deceased) === 'Y') {
    return { isIneligible: true, cancelReasonCode: CANCEL_REASON.CHILD_DIED }
  }

  // Code 22: Child Missing / AWOL
  const hasIcmAwol = input.icmPlacements.some(
    (placement) =>
      normalize(placement.type) === ICM_PLACEMENT.TYPE_NON_PLACEMENT &&
      normalize(placement.serviceType) === ICM_PLACEMENT.SUBTYPE_AWOL &&
      normalize(placement.status) === ICM_PLACEMENT.STATUS_ACTIVE,
  )
  const hasMisAwol = input.misPlacements.some(
    (placement) =>
      normalize(placement.type) === MIS_PLACEMENT.TYPE_AWOL &&
      normalize(placement.status) === MIS_PLACEMENT.STATUS_ACTIVE,
  )
  if (hasIcmAwol || hasMisAwol) {
    return { isIneligible: true, cancelReasonCode: CANCEL_REASON.CHILD_MISSING_AWOL }
  }

  // Code 29: Adoption
  const hasIcmAdoption = input.icmPlacements.some(
    (placement) =>
      normalize(placement.type) === ICM_PLACEMENT.TYPE_NON_PLACEMENT &&
      normalize(placement.serviceType) === ICM_PLACEMENT.SUBTYPE_ADOPTION &&
      normalize(placement.status) === ICM_PLACEMENT.STATUS_ACTIVE,
  )
  const hasMisAdoption = input.misPlacements.some(
    (placement) =>
      normalize(placement.type) === MIS_PLACEMENT.TYPE_ADOPTION &&
      normalize(placement.status) === MIS_PLACEMENT.STATUS_ACTIVE,
  )
  if (hasIcmAdoption || hasMisAdoption) {
    return { isIneligible: true, cancelReasonCode: CANCEL_REASON.ADOPTION }
  }

  // No cancellation condition met
  return { isIneligible: false, cancelReasonCode: null }
}
