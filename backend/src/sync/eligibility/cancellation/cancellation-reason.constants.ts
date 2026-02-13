export const CANCEL_REASON = {
  CHILD_DIED: '14',
  CHILD_LEFT: '21',
  CHILD_MISSING_AWOL: '22',
  ADOPTION: '29',
} as const

export type CancelReasonCode = (typeof CANCEL_REASON)[keyof typeof CANCEL_REASON]

export const CANCEL_REASON_LABELS: Record<CancelReasonCode, string> = {
  '14': 'Child Died',
  '21': 'Child Left',
  '22': 'Child Missing, Ran Away',
  '29': 'Adoption',
}

export const ICM_PLACEMENT = {
  TYPE_NON_PLACEMENT: 'Non-Placement Location',
  SUBTYPE_AWOL: 'Absent/Unknown Location',
  SUBTYPE_ADOPTION: 'Adoption Home',
  STATUS_ACTIVE: 'Active',
} as const

export const MIS_PLACEMENT = {
  TYPE_AWOL: 'AW',
  TYPE_ADOPTION: 'AD',
  STATUS_ACTIVE: 'Active',
} as const
