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

export function getCancelReasonLabel(code: string | null, transactionType: string): string | null {
  if (!code || transactionType !== 'cancellation') return null
  return CANCEL_REASON_LABELS[code as CancelReasonCode] || null
}

export const ICM_PLACEMENT = {
  TYPE_NON_PLACEMENT: 'NON-PLACEMENT LOCATION',
  SUBTYPE_AWOL: 'ABSENT/UNKNOWN LOCATION',
  SUBTYPE_ADOPTION: 'ADOPTION HOME',
  STATUS_ACTIVE: 'ACTIVE',
} as const

export const MIS_PLACEMENT = {
  TYPE_AWOL: 'AW',
  TYPE_ADOPTION: 'AD',
  STATUS_ACTIVE: 'ACTIVE',
} as const
