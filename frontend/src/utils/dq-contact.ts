/** Protected statuses for DQ update/delete (BL-35; excludes over_18). */
export const DQ_PROTECTED_STATUSES = new Set([
  'on_hold',
  'in_batch_application',
  'batch_sent_application',
  'in_batch_cancellation',
  'batch_sent_cancellation',
  'application_refused_cra',
  'cancellation_refused_cra',
  'cra_error_application',
  'cra_error_cancellation',
])

export const DQ_INVALID_DIN_MESSAGE = 'Invalid DIN. Please enter a valid CSA DIN.'

export const DQ_DELETE_CONFIRM_MESSAGE =
  'This action will permanently delete the child record and all associated CSA data. This action cannot be undone. Do you wish to continue?'

export const DQ_DELETE_SUCCESS_FALLBACK_MESSAGE =
  'The child record and all associated CSA data have been permanently deleted successfully.'

export type DqEditableField = 'din' | 'csaStatusRaw' | 'statusEffective'

export const DQ_FIELD_TO_DTO_KEY: Record<DqEditableField, string> = {
  din: 'din',
  csaStatusRaw: 'csaStatus',
  statusEffective: 'csaStatusEffectiveDate',
}

export function isDqProtectedStatus(csaStatusRaw: string | undefined | null): boolean {
  return csaStatusRaw != null && DQ_PROTECTED_STATUSES.has(csaStatusRaw)
}

/** DQ update/delete requires steward role, exactly one selection, and a non-protected status. */
export function canDqModifyRecord(
  isDataQualitySteward: boolean,
  selectedCount: number,
  csaStatusRaw: string | undefined,
): boolean {
  if (!isDataQualitySteward || selectedCount !== 1 || csaStatusRaw === undefined) {
    return false
  }
  return !isDqProtectedStatus(csaStatusRaw)
}

/** DIN format is validated only when the steward edited the field. */
export function isDqDinValid(originalDin: string, editedDin: string): boolean {
  const dinChanged = editedDin !== originalDin
  return !dinChanged || /^\d{9}$/.test(editedDin)
}

export function getDqDinHelperText(originalDin: string, editedDin: string): string {
  if (editedDin.length === 0 || isDqDinValid(originalDin, editedDin)) {
    return ''
  }
  return DQ_INVALID_DIN_MESSAGE
}

export function buildDqUpdatePayload(
  original: Record<DqEditableField, string>,
  edited: Record<DqEditableField, string>,
): Record<string, string> {
  const payload: Record<string, string> = {}
  for (const field of Object.keys(DQ_FIELD_TO_DTO_KEY) as DqEditableField[]) {
    if (edited[field] !== original[field]) {
      payload[DQ_FIELD_TO_DTO_KEY[field]] = edited[field]
    }
  }
  return payload
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data
    ?.message
  if (typeof message === 'string') return message
  if (Array.isArray(message) && message.length > 0) return message.join(', ')
  if (error instanceof Error && error.message) return error.message
  return fallback
}
