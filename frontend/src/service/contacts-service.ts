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
  csaStatusEffectiveDate?: string
  csaSentDate?: string
  din?: string
  effectiveLegalStatus?: string
  effectiveDate?: string
  expiryDate?: string
  enrollForCsa?: string
  misLegalAuthorityCode?: string
  legalAuthorityCode?: string
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
 */
export const getAllContacts = async (
  page: number = 1,
  limit: number = 10,
  filter?: any,
): Promise<PaginatedContactsResponse> => {
  const params: any = { page, limit }

  if (filter && (Array.isArray(filter) ? filter.length > 0 : true)) {
    params.filter = JSON.stringify(filter)
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
  recordCount: number
  createdAt: string
  systemComments: string | null
}

export interface ContactBatchDetail {
  id: number
  contactId: number
  batchId: number
  transactionType: string
  systemComments: string | null
  createdAt: string
  createdBy: string
  lastUpdatedAt: string
  lastUpdatedBy: string
  status: string | null
  batch: {
    id: number
    batchDate: string
    status: string
  }
}

export interface BatchContactDetail {
  id: number
  contactId: number
  batchId: number
  transactionType: string
  systemComments: string | null
  createdAt: string
  createdBy: string
  lastUpdatedAt: string
  lastUpdatedBy: string
  status: string | null
  contact: {
    id: number
    lastName: string
    firstName: string
    din: string
    csaStatus: string
  }
}

/**
 * Put contacts on hold
 * @param contactIds - Array of contact IDs to put on hold
 */
export const holdContacts = async (contactIds: number[]): Promise<BulkOperationResponse> => {
  const response = await APIService.getAxiosInstance().post('/contacts/hold', {
    contactIds,
  })
  return response.data
}

/**
 * Resume contacts from hold
 * @param contactIds - Array of contact IDs to resume
 */
export const resumeContacts = async (contactIds: number[]): Promise<BulkOperationResponse> => {
  const response = await APIService.getAxiosInstance().post('/contacts/resume', {
    contactIds,
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
 * Update eligibility status for multiple contacts
 * @param contactIds - Array of contact IDs to update
 * @param action - Action to perform (e.g., 'ELIGIBLE')
 */
export const updateEligibilityStatus = async (
  contactIds: number[],
  action: string,
): Promise<BulkOperationResponse> => {
  const response = await APIService.getAxiosInstance().post('/contacts/update_eligibility_status', {
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
 * Eligible-TBD or On Hold → Not Eligible - Out of Pay
 * In Pay → Not Eligible - IP - TBD
 * @param contactIds - Array of contact IDs to update
 * @param action - Action to perform (e.g., 'SET_NOT_ELIGIBLE')
 */
export const updateNotEligibleStatusAlt = async (
  contactIds: number[],
  action: string,
): Promise<BulkOperationResponse> => {
  const response = await APIService.getAxiosInstance().post(
    '/contacts/update_not_eligible_status',
    {
      contactIds,
      action,
    },
  )
  return response.data
}

/**
 * Update to "Over 18" status for multiple contacts
 * Eligible-TBD or Not Eligible-IP-TBD → Over 18
 * @param contactIds - Array of contact IDs to update
 * @param action - Action to perform (e.g., 'AGE_OUT')
 */
export const updateOver18Status = async (
  contactIds: number[],
  action: string,
): Promise<BulkOperationResponse> => {
  const response = await APIService.getAxiosInstance().post('/contacts/update_child_over_18', {
    contactIds,
    action,
  })
  return response.data
}
