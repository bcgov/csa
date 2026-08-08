export type CsaUserProfile = 'DATA_QUALITY_STEWARD' | 'CSA_STANDARD'

export interface CsaCapabilities {
  userProfile: CsaUserProfile | null
  /** Restricted profile: eligibility list + audit trail + edit/delete only */
  isDataQualitySteward: boolean
  /** Default CSA caseworker profile: batches, jobs, hold/resume, eligibility runs, etc. */
  isStandardUser: boolean
  /** Eligibility List tab: search, PDQ, details, audit trail */
  canAccessEligibilityList: boolean
  /** DQ inline update/delete on the eligibility list (BL-36/37) */
  canEditContactRecords: boolean
  /** Batch Requests tab and batch APIs */
  canAccessBatches: boolean
  /** Weekly File Processing tab and weekly-files APIs */
  canAccessWeeklyFiles: boolean
  /** Job Monitoring tab and jobs list/history APIs */
  canAccessJobMonitoring: boolean
  /** Caseworker workflow on eligibility list: hold/resume, eligibility runs, batch, status buttons */
  canPerformCsaActions: boolean
  /** Contact batch history panel and GET /contacts/:id/batches */
  canViewContactBatchHistory: boolean
  /** Header job timestamps and last-successful-run fetches */
  canViewJobRunSummary: boolean
  /** Resume/monitor RUN_ELIGIBILITY and SEND_CRA_FILE jobs on load or before actions */
  canMonitorBackgroundJobs: boolean
}

type CapabilityKey = Exclude<
  keyof CsaCapabilities,
  'userProfile' | 'isStandardUser' | 'isDataQualitySteward'
>

/**
 * Which profiles may use each capability — single source of truth.
 */
const CAPABILITY_PROFILES: Record<CapabilityKey, readonly CsaUserProfile[]> = {
  canAccessEligibilityList: ['CSA_STANDARD', 'DATA_QUALITY_STEWARD'],
  canEditContactRecords: ['DATA_QUALITY_STEWARD'],
  canAccessBatches: ['CSA_STANDARD'],
  canAccessWeeklyFiles: ['CSA_STANDARD'],
  canAccessJobMonitoring: ['CSA_STANDARD'],
  canPerformCsaActions: ['CSA_STANDARD'],
  canViewContactBatchHistory: ['CSA_STANDARD'],
  canViewJobRunSummary: ['CSA_STANDARD'],
  canMonitorBackgroundJobs: ['CSA_STANDARD'],
}

function profileHasCapability(
  allowedProfiles: readonly CsaUserProfile[],
  userProfile: CsaUserProfile | null,
): boolean {
  return userProfile !== null && allowedProfiles.includes(userProfile)
}

function buildCapabilities(userProfile: CsaUserProfile | null): CsaCapabilities {
  const capability = (key: CapabilityKey) =>
    profileHasCapability(CAPABILITY_PROFILES[key], userProfile)

  return {
    userProfile,
    isStandardUser: userProfile === 'CSA_STANDARD',
    isDataQualitySteward: userProfile === 'DATA_QUALITY_STEWARD',
    canAccessEligibilityList: capability('canAccessEligibilityList'),
    canEditContactRecords: capability('canEditContactRecords'),
    canAccessBatches: capability('canAccessBatches'),
    canAccessWeeklyFiles: capability('canAccessWeeklyFiles'),
    canAccessJobMonitoring: capability('canAccessJobMonitoring'),
    canPerformCsaActions: capability('canPerformCsaActions'),
    canViewContactBatchHistory: capability('canViewContactBatchHistory'),
    canViewJobRunSummary: capability('canViewJobRunSummary'),
    canMonitorBackgroundJobs: capability('canMonitorBackgroundJobs'),
  }
}

/** Derive UI access from the authenticated user profile (BL-34). */
export function getCsaCapabilities(
  userProfile: CsaUserProfile | null | undefined,
): CsaCapabilities {
  if (userProfile === 'DATA_QUALITY_STEWARD' || userProfile === 'CSA_STANDARD') {
    return buildCapabilities(userProfile)
  }
  return buildCapabilities(null)
}
