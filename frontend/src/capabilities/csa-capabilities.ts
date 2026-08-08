export type CsaUserProfile = 'DATA_QUALITY_STEWARD' | 'CSA_STANDARD'

export interface CsaCapabilities {
  userProfile: CsaUserProfile | null
  isDataQualitySteward: boolean
  isStandardUser: boolean
  /** Batch Requests tab and batch APIs */
  canAccessBatches: boolean
  /** Weekly File Processing tab and weekly-files APIs */
  canAccessWeeklyFiles: boolean
  /** Job Monitoring tab and jobs list/history APIs */
  canAccessJobMonitoring: boolean
  /** Hold, resume, eligibility runs, add to batch, review-flag, hold-reason edits */
  canManageContacts: boolean
  /** DQ inline update/delete on the eligibility list */
  canEditContacts: boolean
  /** Contact batch history panel and GET /contacts/:id/batches */
  canViewContactBatchHistory: boolean
  /** Header job timestamps and last-successful-run fetches */
  canViewJobRunSummary: boolean
  /** Resume/monitor RUN_ELIGIBILITY and SEND_CRA_FILE jobs on load or before actions */
  canMonitorBackgroundJobs: boolean
}

const NO_ACCESS: CsaCapabilities = {
  userProfile: null,
  isDataQualitySteward: false,
  isStandardUser: false,
  canAccessBatches: false,
  canAccessWeeklyFiles: false,
  canAccessJobMonitoring: false,
  canManageContacts: false,
  canEditContacts: false,
  canViewContactBatchHistory: false,
  canViewJobRunSummary: false,
  canMonitorBackgroundJobs: false,
}

const STANDARD_CAPABILITIES: CsaCapabilities = {
  userProfile: 'CSA_STANDARD',
  isDataQualitySteward: false,
  isStandardUser: true,
  canAccessBatches: true,
  canAccessWeeklyFiles: true,
  canAccessJobMonitoring: true,
  canManageContacts: true,
  canEditContacts: false,
  canViewContactBatchHistory: true,
  canViewJobRunSummary: true,
  canMonitorBackgroundJobs: true,
}

const DQ_CAPABILITIES: CsaCapabilities = {
  userProfile: 'DATA_QUALITY_STEWARD',
  isDataQualitySteward: true,
  isStandardUser: false,
  canAccessBatches: false,
  canAccessWeeklyFiles: false,
  canAccessJobMonitoring: false,
  canManageContacts: false,
  canEditContacts: true,
  canViewContactBatchHistory: false,
  canViewJobRunSummary: false,
  canMonitorBackgroundJobs: false,
}

/** Derive UI/API capabilities from the authenticated user profile (BL-34). */
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
