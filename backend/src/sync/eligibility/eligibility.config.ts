import { CSA_STATUS } from 'src/common/state-machine/constants/csa-status.constants'

/** Statuses that should not be modified by the eligibility process */
export const PROTECTED_STATUSES = [
  CSA_STATUS.ON_HOLD,
  CSA_STATUS.IN_BATCH_APPLICATION,
  CSA_STATUS.BATCH_SENT_APPLICATION,
  CSA_STATUS.IN_BATCH_CANCELLATION,
  CSA_STATUS.BATCH_SENT_CANCELLATION,
  CSA_STATUS.APPLICATION_REFUSED_CRA,
  CSA_STATUS.CANCELLATION_REFUSED_CRA,
  CSA_STATUS.CRA_ERROR_APPLICATION,
  CSA_STATUS.CRA_ERROR_CANCELLATION,
  CSA_STATUS.OVER_18,
] as const

// SQL-safe literal list — values come from CSA_STATUS constants (not user input), safe to interpolate
export const PROTECTED_STATUSES_SQL = PROTECTED_STATUSES.map((s) => `'${s}'`).join(', ')

export const ELIGIBILITY_CONFIG = {
  // Step 1A: Age threshold
  MAX_ELIGIBLE_AGE: 18,

  // Step 2: codes that route to Step 8 (Eligible TBD)
  STEP8_LEGAL_AUTH_CODES: ['OPC', 'OPO', 'OPT'] as readonly string[],

  // Step 6: Order/Payment criteria
  ELIGIBLE_ORDER_TYPES: [
    'MONTHLY FAMILY CARE RATE',
    'ADJ-MONTHLY FAMILY CARE RATE',
    'VARIABLE',
    'ADJ-VARIABLE',
    'MAINTENANCE PAYMENT',
    'FIXED RATE',
    'VARIABLE RATE',
    'VAR RATE',
  ] as readonly string[],
  ELIGIBLE_ORDER_STATUSES: ['CLOSED', 'PROCESSED'] as readonly string[],
  MIN_ORDER_AMOUNT: 1549.2,

  // Step 9: Default values when cancellation fields are blank
  DEFAULT_CANCEL_REASON_CODE: '21',

  // Batch processing
  BATCH_SIZE: 1000,
} as const
