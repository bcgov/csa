import { CSA_STATUS } from 'src/common/state-machine/constants'

export const ALLOWED_FILTER_SORT_FIELDS = [
  'id',
  'lastName',
  'middleName',
  'firstName',
  'dateOfBirth',
  'age',
  'din',
  'csaStatus',
  'csaStatusLabel',
  'csaStatusEffectiveDate',
  'lastEligibilityRunAt',
  'legacyFileNumber',
  'lastUpdatedAt',
  'lastUpdatedBy',
  'caseNumber',
  'caseType',
  'caseStatus',
  'gender',
  'serviceOffice',
  'assignedTo',
  'holdBy',
  'holdReason',
  'needsReview',
  'searchText',
  'personIdIcm',
  'personIdMis',
  'birthCity',
  'birthProvince',
  'birthCountry',
] as const

export const BATCH_STATUSES = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  PROCESSED: 'processed',
  PARTIALLY_PROCESSED: 'partially_processed',
  ERROR: 'error',
  SYSTEM_ERROR: 'system_error',
} as const
export type BatchStatus = (typeof BATCH_STATUSES)[keyof typeof BATCH_STATUSES]

export const CONTACT_BATCH_STATUSES = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  APPROVED: 'approved',
  REFUSED: 'refused',
  ERROR: 'error',
} as const
export type ContactBatchStatus =
  (typeof CONTACT_BATCH_STATUSES)[keyof typeof CONTACT_BATCH_STATUSES]

export const TRANSACTION_TYPES = {
  APPLICATION: 'application',
  CANCELLATION: 'cancellation',
} as const
export type TransactionType = (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES]

export const BULK_OPERATION_SKIP_REASONS = {
  NOT_FOUND: 'not_found',
  ALREADY_IN_BATCH: 'already_in_batch',
  INVALID_TRANSITION: 'invalid_transition',
} as const

/**
 * Protected CSA statuses that prevent edit/delete operations (BL-35)
 * Note: OVER_18 is NOT protected - DQ can still edit/delete those records
 */
export const PROTECTED_CSA_STATUSES = new Set<string>([
  CSA_STATUS.ON_HOLD,
  CSA_STATUS.IN_BATCH_APPLICATION,
  CSA_STATUS.IN_BATCH_CANCELLATION,
  CSA_STATUS.BATCH_SENT_APPLICATION,
  CSA_STATUS.BATCH_SENT_CANCELLATION,
  CSA_STATUS.APPLICATION_REFUSED_CRA,
  CSA_STATUS.CANCELLATION_REFUSED_CRA,
  CSA_STATUS.CRA_ERROR_APPLICATION,
  CSA_STATUS.CRA_ERROR_CANCELLATION,
])

/**
 * Fields that are auditable (tracked in contact_audit_trail)
 */
export const AUDITABLE_FIELDS = {
  DIN: 'din',
  CSA_STATUS: 'csaStatus',
  CSA_STATUS_EFFECTIVE_DATE: 'csaStatusEffectiveDate',
  CSA_SENT_DATE: 'csaSentDate',
} as const

/**
 * Application tables with FK to contacts.id — must be cleared before contact delete (BL-37).
 * Shared entities (batches, transfer_files) are intentionally excluded.
 */
export const CONTACT_DELETE_APPLICATION_TABLES = [
  'wkl_file_records',
  'contact_batch_details',
  'contact_audit_trail',
] as const

/**
 * Staging tables keyed by person_id_icm / person_id_mis — cleared on DQ hard-delete (BL-37).
 * stg_icm_legal_authority_admin is a shared lookup table and is not contact-scoped.
 */
export const CONTACT_DELETE_STAGING_TABLES = [
  'stg_icm_orders',
  'stg_icm_agreement',
  'stg_icm_placements',
  'stg_icm_legal_authority',
  'stg_icm_agreement_line',
  'stg_icm_cases',
  'stg_mis_contracts',
  'stg_mis_payments',
  'stg_mis_placements',
] as const
