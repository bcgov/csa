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
