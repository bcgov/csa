import APIService from './api-service'

export interface MonitoringJobRow {
  id: number
  jobName: string
  status: string
  triggeredBy: string
  started: string | null
  finished: string | null
  summary: string | null
  warning: string | null
}

export interface JobActivityRow {
  id: number
  jobRunId: number
  when: string
  severity: string
  type: string
  related: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface JobHistoryParams {
  page?: number
  limit?: number
  jobType?: string
  status?: string
  jobId?: number
  triggeredBy?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface ActivityParams {
  page?: number
  limit?: number
  severity?: string
  type?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

/**
 * Get the latest job run per monitored job type (Job List view)
 */
export const getLatestJobs = async (): Promise<MonitoringJobRow[]> => {
  const response = await APIService.getAxiosInstance().get('/jobs/monitoring/latest')
  return response.data
}

/**
 * Get paginated job history for the last month (Job History view)
 */
export const getJobHistory = async (
  params: JobHistoryParams = {},
): Promise<PaginatedResponse<MonitoringJobRow>> => {
  const query: Record<string, string | number> = {}
  if (params.page !== undefined) query.page = params.page
  if (params.limit !== undefined) query.limit = params.limit
  if (params.jobType) query.jobType = params.jobType
  if (params.status) query.status = params.status
  if (params.jobId) query.jobId = params.jobId
  if (params.triggeredBy) query.triggeredBy = params.triggeredBy
  if (params.sortBy) query.sortBy = params.sortBy
  if (params.sortOrder) query.sortOrder = params.sortOrder

  const response = await APIService.getAxiosInstance().get('/jobs/monitoring/history', {
    params: query,
  })
  return response.data
}

/**
 * Get paginated recent monitoring activities (default Activities view)
 */
export const getRecentActivities = async (
  params: ActivityParams = {},
): Promise<PaginatedResponse<JobActivityRow>> => {
  const query: Record<string, string | number> = {}
  if (params.page !== undefined) query.page = params.page
  if (params.limit !== undefined) query.limit = params.limit
  if (params.severity) query.severity = params.severity
  if (params.type) query.type = params.type
  if (params.sortBy) query.sortBy = params.sortBy
  if (params.sortOrder) query.sortOrder = params.sortOrder

  const response = await APIService.getAxiosInstance().get('/jobs/monitoring/activities', {
    params: query,
  })
  return response.data
}

/**
 * Get paginated activities for a specific job run (when a Job History row is selected)
 */
export const getJobActivities = async (
  jobId: number,
  params: ActivityParams = {},
): Promise<PaginatedResponse<JobActivityRow>> => {
  const query: Record<string, string | number> = {}
  if (params.page !== undefined) query.page = params.page
  if (params.limit !== undefined) query.limit = params.limit
  if (params.severity) query.severity = params.severity
  if (params.type) query.type = params.type
  if (params.sortBy) query.sortBy = params.sortBy
  if (params.sortOrder) query.sortOrder = params.sortOrder

  const response = await APIService.getAxiosInstance().get(`/jobs/${jobId}/activities`, {
    params: query,
  })
  return response.data
}
