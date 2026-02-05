export const ALLOWED_FILTER_SORT_FIELDS = [
  'id',
  'lastName',
  'middleName',
  'firstName',
  'dateOfBirth',
  'age',
  'din',
  'csaStatus',
  'csaStatusEffectiveDate',
  'legacyFileNumber',
  'lastUpdatedAt',
  'lastUpdatedBy',
  'caseNumber',
  'caseType',
  'caseStatus',
  'gender',
  'serviceOffice',
  'assignedTo',
] as const

export const CSA_STATUSES = {
  ON_HOLD: 'on_hold',
  NOT_ELIGIBLE_OUT_OF_PAY: 'not_eligible_out_of_pay',
  ELIGIBLE: 'eligible',
  ELIGIBLE_TBD: 'eligible_tbd',
  IN_BATCH_APPLICATION: 'in_batch_application',
  APPLICATION_REFUSED: 'application_refused',
  BATCH_SENT_APPLICATION: 'batch_sent_application',
  IN_PAY: 'in_pay',
  AGE_OUT: 'age_out',
  NOT_ELIGIBLE_IN_PAY: 'not_eligible_in_pay',
  NOT_ELIGIBLE_IP_TBD: 'not_eligible_ip_tbd',
  IN_BATCH_CANCELLATION: 'in_batch_cancellation',
  CANCELLATION_REFUSED_CRA: 'cancellation_refused_cra',
  BATCH_SENT_CANCELLATION: 'batch_sent_cancellation',
} as const

export type CsaStatus = (typeof CSA_STATUSES)[keyof typeof CSA_STATUSES]

export const BATCH_STATUSES = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  PROCESSED_WITH_ERRORS: 'processed_with_errors',
  ERROR: 'error',
} as const
export type BatchStatus = (typeof BATCH_STATUSES)[keyof typeof BATCH_STATUSES]

export const CONTACT_BATCH_STATUSES = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  PROCESSED: 'processed',
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
