export type CsaUserProfile = 'DATA_QUALITY_STEWARD' | 'CSA_STANDARD'

export interface CsaCapabilities {
  userProfile: CsaUserProfile | null
  /** Restricted profile: eligibility list + audit trail + edit/delete only */
  isDataQualitySteward: boolean
  /** Default CSA caseworker profile: batches, jobs, hold/resume, eligibility runs, etc. */
  isStandardUser: boolean
  /** DQ inline update/delete on the eligibility list (BL-36/37) */
  canEditContactRecords: boolean
  /** Batch Requests tab and batch APIs */
  canAccessBatches: boolean
  /** Weekly File Processing tab and weekly-files APIs */
  canAccessWeeklyFiles: boolean
  /** Job Monitoring tab and jobs list/history APIs */
  canAccessJobMonitoring: boolean
  /** Hold, resume, eligibility runs, add to batch, review-flag, hold-reason edits */
  canManageContacts: boolean
  /** Contact batch history panel and GET /contacts/:id/batches */
  canViewContactBatchHistory: boolean
  /** Header job timestamps and last-successful-run fetches */
  canViewJobRunSummary: boolean
  /** Resume/monitor RUN_ELIGIBILITY and SEND_CRA_FILE jobs on load or before actions */
  canMonitorBackgroundJobs: boolean
}

function buildCapabilities(
  userProfile: CsaUserProfile | null,
  isStandardUser: boolean,
  isDataQualitySteward: boolean,
): CsaCapabilities {
  return {
    userProfile,
    isStandardUser,
    isDataQualitySteward,
    canEditContactRecords: isDataQualitySteward,
    canAccessBatches: isStandardUser,
    canAccessWeeklyFiles: isStandardUser,
    canAccessJobMonitoring: isStandardUser,
    canManageContacts: isStandardUser,
    canViewContactBatchHistory: isStandardUser,
    canViewJobRunSummary: isStandardUser,
    canMonitorBackgroundJobs: isStandardUser,
  }
}

/** Derive UI access from the authenticated user profile (BL-34). */
export function getCsaCapabilities(
  userProfile: CsaUserProfile | null | undefined,
): CsaCapabilities {
  if (userProfile === 'DATA_QUALITY_STEWARD') {
    return buildCapabilities('DATA_QUALITY_STEWARD', false, true)
  }
  if (userProfile === 'CSA_STANDARD') {
    return buildCapabilities('CSA_STANDARD', true, false)
  }
  return buildCapabilities(null, false, false)
}
