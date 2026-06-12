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

export const getWeeklyFileRecords = async (
  fileId: number,
  page: number = 1,
  limit: number = 10,
  signal?: AbortSignal,
): Promise<PaginatedResponse<WeeklyFileRecord>> => {
  const response = await APIService.getAxiosInstance().get(`/weekly-files/${fileId}/records`, {
    params: { page, limit },
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
