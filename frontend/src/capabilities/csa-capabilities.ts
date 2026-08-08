export type CsaUserProfile = 'DATA_QUALITY_STEWARD' | 'CSA_STANDARD'

export interface CsaCapabilities {
  userProfile: CsaUserProfile | null
  /** Restricted profile: eligibility list + audit trail + edit/delete only */
  isDataQualitySteward: boolean
  /** Default CSA caseworker profile: batches, jobs, hold/resume, eligibility runs, etc. */
  isStandardUser: boolean
  /** DQ inline update/delete on the eligibility list (BL-36/37) */
  canEditContactRecords: boolean
}

const NO_ACCESS: CsaCapabilities = {
  userProfile: null,
  isDataQualitySteward: false,
  isStandardUser: false,
  canEditContactRecords: false,
}

const STANDARD_CAPABILITIES: CsaCapabilities = {
  userProfile: 'CSA_STANDARD',
  isDataQualitySteward: false,
  isStandardUser: true,
  canEditContactRecords: false,
}

const DQ_CAPABILITIES: CsaCapabilities = {
  userProfile: 'DATA_QUALITY_STEWARD',
  isDataQualitySteward: true,
  isStandardUser: false,
  canEditContactRecords: true,
}

/** Derive UI access from the authenticated user profile (BL-34). */
export function getCsaCapabilities(
  userProfile: CsaUserProfile | null | undefined,
): CsaCapabilities {
  if (userProfile === 'DATA_QUALITY_STEWARD') {
    return DQ_CAPABILITIES
  }
  if (userProfile === 'CSA_STANDARD') {
    return STANDARD_CAPABILITIES
  }
  return NO_ACCESS
}
