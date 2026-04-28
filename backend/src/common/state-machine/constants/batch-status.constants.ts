export const BATCH_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  PROCESSED: 'processed',
  PARTIALLY_PROCESSED: 'partially_processed',
  ERROR: 'error',
  SYSTEM_ERROR: 'system_error',
} as const

export type BatchStatus = (typeof BATCH_STATUS)[keyof typeof BATCH_STATUS]

export const BATCH_STATUS_LABELS: Record<string, string> = {
  [BATCH_STATUS.PENDING]: 'Pending',
  [BATCH_STATUS.IN_PROGRESS]: 'In Progress',
  [BATCH_STATUS.PROCESSED]: 'Processed',
  [BATCH_STATUS.PARTIALLY_PROCESSED]: 'Partially Processed',
  [BATCH_STATUS.ERROR]: 'Error',
  [BATCH_STATUS.SYSTEM_ERROR]: 'System Error',
}

export const BATCH_EVENT = {
  SEND_TO_CRA: 'SEND_TO_CRA',
  SEND_FAILED: 'SEND_FAILED',
  CRA_ALL_REJECTED: 'CRA_ALL_REJECTED',
  CRA_ALL_PROCESSED: 'CRA_ALL_PROCESSED',
  CRA_PARTIALLY_PROCESSED: 'CRA_PARTIALLY_PROCESSED',
} as const

export type BatchEvent = (typeof BATCH_EVENT)[keyof typeof BATCH_EVENT]

// All batch events are system events
export const SYSTEM_BATCH_EVENTS = new Set<string>(Object.values(BATCH_EVENT))
