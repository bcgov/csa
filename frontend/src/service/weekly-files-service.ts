import APIService from './api-service'

export interface WeeklyFileSummary {
  id: number
  fileName: string
  weeklyFileDate: string | null
  csaProcessingDate: string | null
  totalCount: number
  eCount: number
  matchedCount: number
  unmatchedCount: number
  associatedCount: number
  isProcessed: boolean
}

export interface WeeklyFileRecord {
  id: number
  batchNumber: number | null
  recordIndex: number
  csaMatchFound: 'Yes' | 'No' | 'N/A'
  matchStatus: string
  transactionType: string
  transactionSource: string
  din: string
  firstName: string
  lastName: string
  initial: string
  gender: string
  dateOfBirth: string | null
  birthCity: string
  birthProvince: string
  birthCountry: string
  careStartDate: string | null
  careEndDate: string | null
  cancelReasonCode: string
  craStatus: string
  completionDate: string | null
  associatedCaseNumber: string | null
  associatedPersonIdIcm: string | null
  matchedBy: string | null
  processedAt: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface ReprocessWeeklyFileResult {
  processedRecordIds: number[]
  skippedRecords: Array<{ recordId: number; reason: string }>
}

export const getWeeklyFiles = async (
  page: number = 1,
  limit: number = 10,
  signal?: AbortSignal,
): Promise<PaginatedResponse<WeeklyFileSummary>> => {
  const response = await APIService.getAxiosInstance().get('/weekly-files', {
    params: { page, limit },
    signal,
  })
  return response.data
}

export interface WeeklyFileRecordFilters {
  /** Semantic filter: "Yes" or "No" (maps to match_status groups). */
  csaMatchFound?: string[]
  /** Stored transaction_type codes: A, C, U. */
  transactionType?: string[]
  /** Stored cra_status values: completed, in-progress, abandoned, updated. */
  craStatus?: string[]
  matchedBy?: string
  batchNumber?: string
  transactionSource?: string
}

/** Filter dropdown options: value is sent to the API; label matches table display. */
export const WEEKLY_FILE_TRANSACTION_TYPE_FILTER_OPTIONS = [
  { value: 'A', label: 'Application' },
  { value: 'C', label: 'Cancellation' },
  { value: 'U', label: 'CRA Update' },
] as const

export const WEEKLY_FILE_CRA_STATUS_FILTER_OPTIONS = [
  { value: 'completed', label: 'COMPLETED' },
  { value: 'abandoned', label: 'ABANDONED' },
  { value: 'in-progress', label: 'IN PROGRESS' },
  { value: 'updated', label: 'UPDATED' },
] as const

export const WEEKLY_FILE_CSA_MATCH_FOUND_FILTER_OPTIONS = [
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
] as const

export const getWeeklyFileRecords = async (
  fileId: number,
  page: number = 1,
  limit: number = 10,
  signal?: AbortSignal,
  filters?: WeeklyFileRecordFilters,
): Promise<PaginatedResponse<WeeklyFileRecord>> => {
  const params: Record<string, string | number> = { page, limit }
  if (filters?.csaMatchFound?.length) {
    params.csaMatchFound = filters.csaMatchFound.join(',')
  }
  if (filters?.transactionType?.length) {
    params.transactionType = filters.transactionType.join(',')
  }
  if (filters?.craStatus?.length) {
    params.craStatus = filters.craStatus.join(',')
  }
  if (filters?.matchedBy?.trim()) {
    params.matchedBy = filters.matchedBy.trim()
  }
  if (filters?.batchNumber?.trim()) {
    params.batchNumber = filters.batchNumber.trim()
  }
  if (filters?.transactionSource?.trim()) {
    params.transactionSource = filters.transactionSource.trim()
  }
  const response = await APIService.getAxiosInstance().get(`/weekly-files/${fileId}/records`, {
    params,
    signal,
  })
  return response.data
}

export const associateWeeklyFileRecord = async (
  fileId: number,
  recordId: number,
  contactId: number,
): Promise<WeeklyFileRecord> => {
  const response = await APIService.getAxiosInstance().post(
    `/weekly-files/${fileId}/records/${recordId}/associate`,
    { contactId },
  )
  return response.data
}

export const dissociateWeeklyFileRecord = async (
  fileId: number,
  recordId: number,
): Promise<WeeklyFileRecord> => {
  const response = await APIService.getAxiosInstance().post(
    `/weekly-files/${fileId}/records/${recordId}/dissociate`,
  )
  return response.data
}

export const reprocessWeeklyFile = async (fileId: number): Promise<ReprocessWeeklyFileResult> => {
  const response = await APIService.getAxiosInstance().post(`/weekly-files/${fileId}/reprocess`)
  return response.data
}

export const reprocessWeeklyFileRecord = async (
  fileId: number,
  recordId: number,
): Promise<WeeklyFileRecord> => {
  const response = await APIService.getAxiosInstance().post(
    `/weekly-files/${fileId}/records/${recordId}/reprocess`,
  )
  return response.data
}
