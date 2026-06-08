import APIService from './api-service'

export interface Contact {
  id: number
  firstName: string
  lastName: string
  middleName: string
  akaLastName: string
  akaFirstName: string
  personIdIcm: string
  personIdIms: string
  personIdMis: string
  caseNumber: string
  caseType: string
  caseStatus: string
  caseLoad: string
  sourceOrder: string
  icmIntegrationStatus: boolean
  createdAt: string
  createdBy: string
  lastUpdatedAt: string
  lastUpdatedBy: string
  gender?: string
  dateOfBirth?: string
  age?: number
  legacyFileNumber?: string
  serviceOffice?: string
  assignedTo?: string
  csaStatus?: string
  csaStatusLabel?: string
  csaStatusEffectiveDate?: string
  csaSentDate?: string
  din?: string
  effectiveLegalStatus?: string
  effectiveDate?: string
  expiryDate?: string
  enrollForCsa?: string
  misLegalAuthorityCode?: string
  legalAuthorityCode?: string
  // Birth location fields
  birthCity?: string
  birthProvince?: string
  birthCountry?: string
  // Placement fields
  placementLocation?: string
  locationType?: string
  locationSubType?: string
  placementStatus?: string
  actualStartDate?: string
  actualEndDate?: string
  paidUnpaid?: string
  interruptedPlacement?: string
  sourcePlacement?: string
  // Service provider and agreement fields
  serviceProviderName?: string
  providerId?: string
  placeOfServiceName?: string
  agreementType?: string
  agreementStatus?: string
  agreementStartDate?: string
  agreementEndDate?: string
  terminationDate?: string
  mcfdContract?: string
  // Order fields
  orderNumber?: string
  orderType?: string
  orderStatus?: string
  orderAmount?: string
  orderEffectiveStartDate?: string
  orderEffectiveEndDate?: string
  product?: string
  // Over 18 flag
  isOver18?: boolean
  // Hold fields
  holdBy?: string
  holdReason?: string
  // Review flag for On Hold records with staging data changes
  needsReview?: boolean
}

export interface PaginatedContactsResponse {
  data: Contact[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface SearchFilter {
  key: string
  operation: 'like' | 'eq' | 'gt' | 'lt' | 'gte' | 'lte'
  value: string | number
}

export interface SortOption {
  [key: string]: 'ASC' | 'DESC'
}

/**
 * Get all contacts with pagination
 * @param page - Page number (default: 1)
 * @param limit - Items per page (default: 10, max: 200)
 * @param filter - Optional filter array, can include SearchFilter objects or objects with OR logic
 * @param sort - Optional sort array, e.g., [{"lastName": "asc"}]
 */
export const getAllContacts = async (
  page: number = 1,
  limit: number = 10,
  filter?: any,
  sort?: Array<{ [key: string]: 'asc' | 'desc' }>,
): Promise<PaginatedContactsResponse> => {
  const params: any = { page, limit }

  if (filter && (Array.isArray(filter) ? filter.length > 0 : true)) {
    params.filter = JSON.stringify(filter)
  }

  if (sort && sort.length > 0) {
    params.sort = JSON.stringify(sort)
  }

  const response = await APIService.getAxiosInstance().get('/contacts', {
    params,
  })
  return response.data
}

/**
 * Get a single contact by ID
 * @param id - Contact ID
 */
export const getContactById = async (id: number): Promise<Contact> => {
  const response = await APIService.getAxiosInstance().get(`/contacts/${id}`)
  return response.data
}

/**
 * Search contacts with filters and sorting
 * @param page - Page number
 * @param limit - Items per page
 * @param sort - Sort options, e.g., { lastName: 'ASC' }
 * @param filter - Array of filters, e.g., [{ key: 'lastName', operation: 'like', value: 'Smith' }]
 */
export const searchContacts = async (
  page: number = 1,
  limit: number = 10,
  sort?: SortOption,
  filter?: SearchFilter[],
): Promise<PaginatedContactsResponse> => {
  const params: any = { page, limit }

  if (sort) {
    params.sort = JSON.stringify(sort)
  }

  if (filter && filter.length > 0) {
    params.filter = JSON.stringify(filter)
  }

  const response = await APIService.getAxiosInstance().get('/contacts/search', {
    params,
  })
  return response.data
}

/**
 * Full-text search contacts
 * @param searchQuery - Search query string (minimum 2 characters)
 * @param page - Page number (default: 1)
 * @param limit - Items per page (default: 10, max: 200)
 */
export const fullTextSearchContacts = async (
  searchQuery: string,
  page: number = 1,
  limit: number = 10,
): Promise<PaginatedContactsResponse> => {
  const params: any = {
    q: searchQuery,
    page,
    limit,
  }

  const response = await APIService.getAxiosInstance().get('/contacts/search', {
    params,
  })
  return response.data
}

export interface BulkOperationResponse {
  success: number[]
  skipped: Array<{ id: number; reason: string }>
}

export interface Batch {
  id: number
  batchDate: string | null
  status: string
  statusLabel: string
  recordCount: number
  initiatedBy: string
  createdAt: string
  systemComments: string | null
}

export interface ContactBatchDetail {
  id: number
  contactId: number
  batchId: number
  transactionType: string
  effectiveDate: string | null
  systemComments: string | null
  createdAt: string
  createdBy: string
  lastUpdatedAt: string
  lastUpdatedBy: string
  status: string | null
  statusLabel: string | null
  batch: {
    id: number
    batchDate: string
    status: string
    statusLabel: string
  }
}

export interface ContactAuditTrailEntry {
  id: number
  contactId: number
  date: string
  actionedBy: string
  operation: string
  field: string
  oldValue: string
  newValue: string
}

export interface PaginatedContactAuditTrailResponse {
  data: ContactAuditTrailEntry[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface BatchContactDetail {
  id: number
  contactId: number
  batchId: number
  transactionType: string
  effectiveDate: string | null
  caseNumber: string | null
  cancelReasonCode: string | null
  cancelReasonLabel: string | null
  systemComments: string | null
  createdAt: string
  createdBy: string
  lastUpdatedAt: string
  lastUpdatedBy: string
  status: string | null
  statusLabel: string
  contact: {
    id: number
    lastName: string
    firstName: string
    middleName: string | null
    din: string
    csaStatus: string
  }
}

/**
 * Put contacts on hold
 * @param contactIds - Array of contact IDs to put on hold
 * @param reason - Required reason for putting contacts on hold
 */
export const holdContacts = async (
  contactIds: number[],
  reason: string,
): Promise<BulkOperationResponse> => {
  const response = await APIService.getAxiosInstance().post('/contacts/hold', {
    contactIds,
    reason,
  })
  return response.data
}

/**
 * Resume contacts from hold
 * @param contactIds - Array of contact IDs to resume
 * @param reason - Optional reason for resuming (overwrites previous reason)
 */
export const resumeContacts = async (
  contactIds: number[],
  reason?: string,
): Promise<BulkOperationResponse> => {
  const response = await APIService.getAxiosInstance().post('/contacts/resume', {
    contactIds,
    reason,
  })
  return response.data
}

/**
 * Update or clear hold reason for a contact
 * @param contactId - Contact ID
 * @param reason - New hold reason (required when ON_HOLD, optional/empty to clear when not ON_HOLD)
 */
export const updateHoldReason = async (
  contactId: number,
  reason?: string,
): Promise<{ success: boolean; contact?: { id: number; holdReason: string } }> => {
  const response = await APIService.getAxiosInstance().patch(`/contacts/${contactId}/hold-reason`, {
    reason,
  })
  return response.data
}

/**
 * Get batch history for a specific contact
 * @param contactId - Contact ID
 */
export const getContactBatches = async (contactId: number): Promise<ContactBatchDetail[]> => {
  const response = await APIService.getAxiosInstance().get(`/contacts/${contactId}/batches`)
  return response.data
}

/**
 * Get audit trail entries for a specific contact
 * @param contactId - Contact ID
 * @param page - Page number (default: 1)
 * @param limit - Items per page (default: 200)
 */
export const getContactAuditTrail = async (
  contactId: number,
  page: number = 1,
  limit: number = 200,
): Promise<PaginatedContactAuditTrailResponse> => {
  const response = await APIService.getAxiosInstance().get(`/contacts/${contactId}/audit-trail`, {
    params: { page, limit },
  })
  return response.data
}

/**
 * Get all batches
 */
export const getAllBatches = async (): Promise<Batch[]> => {
  const response = await APIService.getAxiosInstance().get('/batches')
  return response.data
}

/**
 * Get contacts in a specific batch
 * @param batchId - Batch ID
 */
export const getBatchContacts = async (batchId: number): Promise<BatchContactDetail[]> => {
  const response = await APIService.getAxiosInstance().get(`/batches/${batchId}/contacts`)
  return response.data
}

/**
 * Add contacts to pending batch
 * @param contactIds - Array of contact IDs to add to the pending batch
 */
export const addContactsToBatch = async (contactIds: number[]): Promise<BulkOperationResponse> => {
  const response = await APIService.getAxiosInstance().post('/batches/pending/contacts', {
    contactIds,
  })
  return response.data
}

/**
 * Remove contact from pending batch
 * @param contactId - Contact ID to remove
 */
export const removeContactFromBatch = async (
  contactId: number,
): Promise<{ batchId: number; recordCount: number; message: string }> => {
  const response = await APIService.getAxiosInstance().delete(
    `/batches/pending/contacts/${contactId}`,
  )
  return response.data
}

/**
 * Remove multiple contacts from pending batch
 * @param contactIds - Array of contact IDs to remove
 */
export const removeContactsFromBatch = async (
  contactIds: number[],
): Promise<BulkOperationResponse & { batch: { recordCount: number } }> => {
  const response = await APIService.getAxiosInstance().post('/batches/pending/contacts/remove', {
    contactIds,
  })
  return response.data
}

/**
 * Update eligibility status for multiple contacts
 * @param contactIds - Array of contact IDs to update
 * @param action - Action to perform (e.g., 'ELIGIBLE')
 */
export const updateEligibilityStatus = async (
  contactIds: number[],
  action: string,
): Promise<BulkOperationResponse> => {
  const response = await APIService.getAxiosInstance().post('/contacts/set-eligible', {
    contactIds,
    action,
  })
  return response.data
}

/**
 * Update to not eligible status for multiple contacts
 * @param contactIds - Array of contact IDs to update
 * @param updatedBy - User who performed the update
 */
export const updateNotEligibleStatus = async (
  contactIds: number[],
  updatedBy?: string,
): Promise<{
  success: Array<{ contactId: number; oldStatus: string; newStatus: string }>
  failed: Array<{ contactId: number; reason: string }>
  totalProcessed: number
  successCount: number
  failedCount: number
}> => {
  const response = await APIService.getAxiosInstance().post('/status-update/not-eligible', {
    contactIds,
    updatedBy,
  })
  return response.data
}

/**
 * Update to not eligible status with alternative transitions
 * Eligible-TBD or On Hold->Not Eligible - Out of Pay
 * In Pay->Not Eligible - IP - TBD
 * @param contactIds - Array of contact IDs to update
 * @param action - Action to perform (e.g., 'SET_NOT_ELIGIBLE')
 */
export const updateNotEligibleStatusAlt = async (
  contactIds: number[],
  action: string,
): Promise<BulkOperationResponse> => {
  const response = await APIService.getAxiosInstance().post('/contacts/set-not-eligible', {
    contactIds,
    action,
  })
  return response.data
}

/**
 * Update to "Over 18" status for multiple contacts
 * Eligible-TBD or Not Eligible-IP-TBD->Over 18
 * @param contactIds - Array of contact IDs to update
 * @param action - Action to perform (e.g., 'AGE_OUT')
 */
export const updateOver18Status = async (
  contactIds: number[],
  action: string,
): Promise<BulkOperationResponse> => {
  const response = await APIService.getAxiosInstance().post('/contacts/age-out', {
    contactIds,
    action,
  })
  return response.data
}

/**
 * Clear the review flag for a contact
 * @param contactId - Contact ID to clear review flag for
 */
export const clearReviewFlag = async (contactId: number): Promise<{ success: boolean }> => {
  const response = await APIService.getAxiosInstance().patch(`/contacts/${contactId}/review-flag`)
  return response.data
}

/**
 * Eligibility run result
 */
export interface EligibilityRunResult {
  processed: number
  statusChanges: number
  newContacts: number
  skipped: number
  stepCounts: {
    step7: number
    step8: number
    step9: number
    step10: number
    noChange: number
  }
}

/**
 * Result from running eligibility for a single contact
 */
export interface ContactEligibilityResult {
  previousStatus: string | null
  newStatus: string
}

/**
 * Run eligibility query for a specific contact
 * @param contactId - Contact ID to run eligibility for
 */
export const runEligibilityForContact = async (
  contactId: number,
): Promise<ContactEligibilityResult> => {
  const response = await APIService.getAxiosInstance().post(
    `/contacts/${contactId}/run-eligibility`,
  )
  return response.data
}

/**
 * Run eligibility query for all contacts (via jobs API)
 * Returns the job run ID for tracking
 */
export const startEligibilityJob = async (): Promise<{ jobRunId: number }> => {
  const response = await APIService.getAxiosInstance().post('/jobs/run-eligibility')
  return response.data
}

/**
 * Get job status by ID
 */
export const getJobStatus = async (jobId: number): Promise<JobRun> => {
  const response = await APIService.getAxiosInstance().get<JobRun>(`/jobs/${jobId}`)
  return response.data
}

/**
 * Run eligibility query for all contacts and poll until complete
 * @param onProgress - Optional callback for progress updates
 */
export const runEligibilityForAllWithPolling = async (
  onProgress?: (job: JobRun) => void,
): Promise<JobRun> => {
  // Start the job
  const { jobRunId } = await startEligibilityJob()

  // Poll for completion
  const pollInterval = 10000 // 10 seconds
  const maxAttempts = 60 // 10 minutes max

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const job = await getJobStatus(jobRunId)

    if (onProgress) {
      onProgress(job)
    }

    if (job.status === 'SUCCESS' || job.status === 'FAILED') {
      return job
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  throw new Error('Eligibility job timed out')
}

/**
 * Job run details
 */
export interface JobRun {
  id: number
  jobType: string
  status: string
  jobTrigger: string
  retryCount: number | null
  error: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  /** Plain-language notice when a running job may be stuck (from GET /jobs). */
  warning?: string
}

export type JobRunProgressUpdate = {
  message: string
  severity: 'info' | 'warning'
}

export const getJobRunProgressUpdate = (
  job: JobRun,
  runningMessage: string,
): JobRunProgressUpdate => ({
  message: job.warning ?? runningMessage,
  severity: job.warning ? 'warning' : 'info',
})

export interface JobsResponse {
  data: JobRun[]
  total: number
  page: number
  limit: number
}

/**
 * Get last successful job run for a specific job type
 */
export const getLastSuccessfulJob = async (jobType: string): Promise<JobRun | null> => {
  const response = await APIService.getAxiosInstance().get<JobsResponse>('/jobs', {
    params: {
      jobType,
      status: 'SUCCESS',
      limit: 1,
    },
  })
  return response.data.data.length > 0 ? response.data.data[0] : null
}

/**
 * Get last successful runs for data ingestion and eligibility
 */
export interface LastSuccessfulRuns {
  lastDataIngestion: Date | null
  lastEligibilityRun: Date | null
}

export const getLastSuccessfulRuns = async (): Promise<LastSuccessfulRuns> => {
  const [dataIngestionJob, eligibilityJob] = await Promise.all([
    getLastSuccessfulJob('INGEST_DATA'),
    getLastSuccessfulJob('RUN_ELIGIBILITY'),
  ])

  return {
    lastDataIngestion: dataIngestionJob?.completedAt
      ? new Date(dataIngestionJob.completedAt)
      : null,
    lastEligibilityRun: eligibilityJob?.completedAt ? new Date(eligibilityJob.completedAt) : null,
  }
}

/**
 * Check if there's a running eligibility job
 * Returns the running job if found, null otherwise
 */
export const getRunningEligibilityJob = async (): Promise<JobRun | null> => {
  const response = await APIService.getAxiosInstance().get<JobsResponse>('/jobs', {
    params: {
      jobType: 'RUN_ELIGIBILITY',
      status: 'RUNNING',
      limit: 1,
    },
  })
  return response.data.data.length > 0 ? response.data.data[0] : null
}

/**
 * Wait for a running eligibility job to complete
 * @param jobId - The job ID to monitor
 * @param onProgress - Optional callback for progress updates
 */
export const waitForEligibilityJobCompletion = async (
  jobId: number,
  onProgress?: (job: JobRun) => void,
): Promise<JobRun> => {
  const pollInterval = 10000 // 10 seconds
  const maxAttempts = 60 // 10 minutes max

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const job = await getJobStatus(jobId)

    if (onProgress) {
      onProgress(job)
    }

    if (job.status === 'SUCCESS' || job.status === 'FAILED') {
      return job
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  throw new Error('Eligibility job timed out')
}

/**
 * Wait for a running auto-batch job to complete
 * @param jobId - The job ID to monitor
 * @param onProgress - Optional callback for progress updates
 */
export const waitForAutoBatchJobCompletion = async (
  jobId: number,
  onProgress?: (job: JobRun) => void,
): Promise<JobRun> => {
  const pollInterval = 5000 // 5 seconds
  const maxAttempts = 60 // 5 minutes max

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const job = await getJobStatus(jobId)

    if (onProgress) {
      onProgress(job)
    }

    if (job.status === 'SUCCESS' || job.status === 'FAILED') {
      return job
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  throw new Error('Auto-batch job timed out')
}

/**
 * Start auto-batch job for all eligible contacts
 * Returns the job run ID for tracking
 */
export const startAutoBatchJob = async (): Promise<{ jobRunId: number }> => {
  const response = await APIService.getAxiosInstance().post('/jobs/auto-batch')
  return response.data
}

/**
 * Check if there's a running auto-batch job
 * Returns the running job if found, null otherwise
 */
export const getRunningAutoBatchJob = async (): Promise<JobRun | null> => {
  const response = await APIService.getAxiosInstance().get<JobsResponse>('/jobs', {
    params: {
      jobType: 'AUTO_BATCH',
      status: 'RUNNING',
      limit: 1,
    },
  })
  return response.data.data.length > 0 ? response.data.data[0] : null
}

/**
 * Run auto-batch job for all eligible contacts and poll until complete
 * @param onProgress - Optional callback for progress updates
 */
export const runAutoBatchWithPolling = async (
  onProgress?: (job: JobRun) => void,
): Promise<JobRun> => {
  // Start the job
  const { jobRunId } = await startAutoBatchJob()

  // Poll for completion
  const pollInterval = 5000 // 5 seconds
  const maxAttempts = 60 // 5 minutes max

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const job = await getJobStatus(jobRunId)

    if (onProgress) {
      onProgress(job)
    }

    if (job.status === 'SUCCESS' || job.status === 'FAILED') {
      return job
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  throw new Error('Auto-batch job timed out')
}
