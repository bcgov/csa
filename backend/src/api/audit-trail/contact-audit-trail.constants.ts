export const AUDIT_TRAIL_FIELD = {
  DIN: 'DIN',
  CSA_STATUS: 'CSA Status',
  STATUS_EFFECTIVE_DATE: 'Status Effective Date',
  HOLD_BY: 'Set on Hold By',
  REASON: 'Reason',
} as const

export const AUDIT_TRAIL_OPERATION = {
  NEW: 'new',
  MODIFY: 'modify',
} as const

export const AUDIT_TRAIL_EMPTY_VALUE = '–'
