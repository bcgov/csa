export const BATCH_DETAIL_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  APPROVED: 'approved',
  REFUSED: 'refused',
  ERROR: 'error',
} as const

export type BatchDetailStatus = (typeof BATCH_DETAIL_STATUS)[keyof typeof BATCH_DETAIL_STATUS]

export const BATCH_DETAIL_STATUS_LABELS: Record<string, string> = {
  [BATCH_DETAIL_STATUS.PENDING]: 'Pending',
  [BATCH_DETAIL_STATUS.IN_PROGRESS]: 'In Progress',
  [BATCH_DETAIL_STATUS.APPROVED]: 'Approved',
  [BATCH_DETAIL_STATUS.REFUSED]: 'Refused',
  [BATCH_DETAIL_STATUS.ERROR]: 'Error',
}

export const BATCH_DETAIL_EVENT = {
  SEND_TO_CRA: 'SEND_TO_CRA',
  CRA_RSP_REJECTED: 'CRA_RSP_REJECTED',
  CRA_FILE_REJECTED: 'CRA_FILE_REJECTED',
  CRA_WKL_APPROVED: 'CRA_WKL_APPROVED',
  CRA_WKL_REFUSED: 'CRA_WKL_REFUSED',
} as const

export type BatchDetailEvent = (typeof BATCH_DETAIL_EVENT)[keyof typeof BATCH_DETAIL_EVENT]

// All batch detail events are system events
export const SYSTEM_BATCH_DETAIL_EVENTS = new Set<string>(Object.values(BATCH_DETAIL_EVENT))
