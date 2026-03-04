import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import CloseIcon from '@mui/icons-material/Close'
import FilterListIcon from '@mui/icons-material/FilterList'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import {
  Alert,
  AppBar,
  Box,
  Button,
  Checkbox,
  FormControl,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Snackbar,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { useAuth } from './context/AuthContext'
import logo from './icons/image.png'
import { verifyCSAAccess } from './service/admin-service'
import {
  addContactsToBatch,
  fullTextSearchContacts,
  getAllBatches,
  getAllContacts,
  getBatchContacts,
  getContactBatches,
  holdContacts,
  removeContactFromBatch,
  resumeContacts,
  updateEligibilityStatus,
  updateNotEligibleStatusAlt,
  updateOver18Status,
  type Batch,
  type BatchContactDetail,
  type Contact,
  type ContactBatchDetail,
} from './service/contacts-service'

// Valid CSA statuses for Hold/Resume button
// Maps to backend CSA_STATUSES constants
const VALID_CSA_STATUSES = [
  'eligible_tbd', // Eligible - TBD
  'application_refused', // Application Refused - CRA (note: no _cra suffix in backend)
  'not_eligible_ip_tbd', // Not Eligible - IP - TBD
  'cancellation_refused_cra', // Cancellation Refused - CRA
  'on_hold', // On Hold
]

// Valid CSA statuses for Add to Batch button
const VALID_BATCH_STATUSES = [
  'eligible', // Eligible
  'eligible_tbd', // Eligible - TBD
  'application_refused_cra', // Application Refused - CRA
  'not_eligible_in_pay', // Not Eligible - In Pay
  'not_eligible_ip_tbd', // Not Eligible - IP - TBD
  'cancellation_refused_cra', // Cancellation Refused - CRA
]

// Date formatting helpers
const formatDateYMD = (dateString: string): string => {
  const date = new Date(dateString)
  const year = date.getFullYear()
  const month = date.toLocaleString('en-US', { month: 'short' })
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatDateTimeYMDHMS = (dateString: string): string => {
  const date = new Date(dateString)
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

function App() {
  // Use Keycloak authentication
  const {
    isAuthenticated: keycloakAuthenticated,
    isLoading,
    hasCSAAccess,
    user,
    login,
    logout,
    csaAccessAlert,
    clearCsaAccessAlert,
  } = useAuth()

  // Log Keycloak authentication token (for testing in deployed version)
  console.log('=== KEYCLOAK AUTH TOKEN ===')
  console.log('Auth Token from localStorage:', localStorage.getItem('authToken'))
  console.log('Keycloak Authenticated:', keycloakAuthenticated)
  console.log('Has CSA Access:', hasCSAAccess)
  console.log('User Info:', user)
  console.log('==========================')

  // Local authentication state for IDIR mock login
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    const saved = localStorage.getItem('isLoggedIn')
    return saved === 'true'
  })
  const [showIdirLogin, setShowIdirLogin] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  // Sync isLoggedIn state with localStorage (for when AuthContext clears it)
  useEffect(() => {
    const checkLoginState = () => {
      const saved = localStorage.getItem('isLoggedIn')
      const shouldBeLoggedIn = saved === 'true'
      if (isLoggedIn !== shouldBeLoggedIn) {
        setIsLoggedIn(shouldBeLoggedIn)
      }
    }

    // Check immediately when loading state changes (Keycloak auth completed)
    if (!isLoading) {
      checkLoginState()
    }

    // Also listen for storage changes
    window.addEventListener('storage', checkLoginState)
    return () => window.removeEventListener('storage', checkLoginState)
  }, [isLoading, isLoggedIn])

  // User is authenticated only if:
  // 1. Loading is complete (isLoading is false) AND
  // 2. Either:
  //    a. Keycloak is authenticated AND has CSA access (hasCSAAccess === true), OR
  //    b. Mock login is active (isLoggedIn is true - mock login already verifies CSA access)
  // Note: hasCSAAccess is null during loading, false when denied, true when granted
  // IMPORTANT: We must wait for isLoading to be false before trusting isLoggedIn,
  // because AuthContext may clear isLoggedIn during Keycloak SSO flow
  const isAuthenticated =
    !isLoading && ((keycloakAuthenticated && hasCSAAccess === true) || isLoggedIn)

  const [selectedTab, setSelectedTab] = useState(0)
  const [selected, setSelected] = useState<number[]>([])
  const [selectedBatchDetails, setSelectedBatchDetails] = useState<number[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSearchTerm, setFilterSearchTerm] = useState('')
  const [isColumnFilterActive, setIsColumnFilterActive] = useState(false)
  const [activeColumnFilter, setActiveColumnFilter] = useState<{
    column: string
    query: string
  } | null>(null)
  const [selectedChild, setSelectedChild] = useState<number | null>(null)
  const [selectedBatch, setSelectedBatch] = useState<number>(1) // Default to first batch

  // Pre-defined filter state
  const [preDefinedFilter, setPreDefinedFilter] = useState('Pending User review/action')

  // Contacts API state
  const [contacts, setContacts] = useState<Contact[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [contactsError, setContactsError] = useState<string | null>(null)

  // Snackbar state for hold/resume feedback
  const [snackbar, setSnackbar] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error' | 'warning' | 'info'
  }>({
    open: false,
    message: '',
    severity: 'success',
  })

  // Effect to show CSA access alert from auth context
  useEffect(() => {
    if (csaAccessAlert) {
      setSnackbar({
        open: true,
        message: csaAccessAlert,
        severity: 'error',
      })
      clearCsaAccessAlert()
    }
  }, [csaAccessAlert, clearCsaAccessAlert])

  // Effect to re-verify CSA access on page load/refresh for IDIR login sessions
  useEffect(() => {
    const verifyExistingLogin = async () => {
      const savedLoginState = localStorage.getItem('isLoggedIn')
      const savedToken = localStorage.getItem('authToken')

      // Only verify if there's an existing login session with a token (IDIR login - not Keycloak SSO)
      // Keycloak SSO is handled by AuthContext
      if (savedLoginState === 'true' && savedToken) {
        console.log('Re-verifying CSA access for existing login session...')

        try {
          const csaAccessResponse = await verifyCSAAccess()

          // Check if token is expired
          if (csaAccessResponse.tokenExpired) {
            console.warn('Token expired during re-verification')
            localStorage.removeItem('authToken')
            localStorage.removeItem('isLoggedIn')
            localStorage.removeItem('username')
            setIsLoggedIn(false)
            setSnackbar({
              open: true,
              message: 'Your session has expired. Please login again.',
              severity: 'error',
            })
            return
          }

          // Only keep access if BOTH hasAccess is true AND message is exactly 'User has CSA access'
          const hasValidAccess =
            csaAccessResponse.hasAccess === true &&
            csaAccessResponse.message === 'User has CSA access'

          if (!hasValidAccess) {
            console.warn('CSA access denied during re-verification:', csaAccessResponse)
            localStorage.removeItem('authToken')
            localStorage.removeItem('isLoggedIn')
            localStorage.removeItem('username')
            setIsLoggedIn(false)
            setSnackbar({
              open: true,
              message: 'User not authorised to access CSA',
              severity: 'error',
            })
          } else {
            console.log('CSA access verified successfully')
          }
        } catch (error) {
          console.error('Failed to re-verify CSA access:', error)
          localStorage.removeItem('authToken')
          localStorage.removeItem('isLoggedIn')
          localStorage.removeItem('username')
          setIsLoggedIn(false)
          setSnackbar({
            open: true,
            message: 'User not authorised to access CSA',
            severity: 'error',
          })
        }
      }
    }

    // Run verification on component mount (page load/refresh)
    verifyExistingLogin()
  }, []) // Empty dependency array - runs only once on mount

  // Batch history state for selected contact
  const [contactBatchHistory, setContactBatchHistory] = useState<ContactBatchDetail[]>([])
  const [loadingBatchHistory, setLoadingBatchHistory] = useState(false)

  // Batch requests state
  const [batches, setBatches] = useState<Batch[]>([])
  const [loadingBatches, setLoadingBatches] = useState(false)

  // Batch details state
  const [batchDetails, setBatchDetails] = useState<BatchContactDetail[]>([])
  const [loadingBatchDetails, setLoadingBatchDetails] = useState(false)

  const recordsPerPage = 10
  const [isSearchActive, setIsSearchActive] = useState(false)

  // Map frontend column names to backend field names
  const columnToFieldMapping: Record<string, string> = useMemo(
    () => ({
      firstName: 'firstName',
      middleName: 'middleName',
      lastName: 'lastName',
      gender: 'gender',
      dob: 'dateOfBirth',
      age: 'age',
      din: 'din',
      csaStatus: 'csaStatusLabel',
      statusEffective: 'csaStatusEffectiveDate',
      caseNumber: 'caseNumber',
      caseStatus: 'caseStatus',
      legacyFile: 'legacyFileNumber',
      lastUpdated: 'lastUpdatedAt',
      lastUpdatedBy: 'lastUpdatedBy',
    }),
    [],
  )

  // Column filter states
  type FilterAnchor = {
    element: HTMLElement | null
    column: string
  }
  const [filterAnchor, setFilterAnchor] = useState<FilterAnchor>({ element: null, column: '' })

  // Sort states
  type SortAnchor = {
    element: HTMLElement | null
    column: string
  }
  const [sortAnchor, setSortAnchor] = useState<SortAnchor>({ element: null, column: '' })
  const [sortConfig, setSortConfig] = useState<{
    column: string
    direction: 'asc' | 'desc'
  } | null>(null)

  // Batch History search and filter states
  const [batchHistorySearchTerm, setBatchHistorySearchTerm] = useState('')
  const [batchHistoryColumnFilters, setBatchHistoryColumnFilters] = useState<
    Record<string, string[]>
  >({
    batchId: [],
    createdDate: [],
    batchDate: [],
    status: [],
    transactionType: [],
  })
  const [batchHistoryFilterAnchor, setBatchHistoryFilterAnchor] = useState<FilterAnchor>({
    element: null,
    column: '',
  })
  const [batchHistoryFilterSearchTerm, setBatchHistoryFilterSearchTerm] = useState('')
  const [selectedBatchHistoryId, setSelectedBatchHistoryId] = useState<number | null>(null)

  // Batch Requests search and filter states
  const [batchRequestsSearchTerm, setBatchRequestsSearchTerm] = useState('')
  const [batchRequestsColumnFilters, setBatchRequestsColumnFilters] = useState<
    Record<string, string[]>
  >({
    batchId: [],
    batchDate: [],
    status: [],
    recordCount: [],
    createdDate: [],
    systemComments: [],
  })
  const [batchRequestsFilterAnchor, setBatchRequestsFilterAnchor] = useState<FilterAnchor>({
    element: null,
    column: '',
  })
  const [batchRequestsFilterSearchTerm, setBatchRequestsFilterSearchTerm] = useState('')

  // Batch Details search and filter states
  const [batchDetailsSearchTerm, setBatchDetailsSearchTerm] = useState('')
  const [batchDetailsColumnFilters, setBatchDetailsColumnFilters] = useState<
    Record<string, string[]>
  >({
    lastName: [],
    middleName: [],
    givenName: [],
    transactionType: [],
    status: [],
    systemComments: [],
  })
  const [batchDetailsFilterAnchor, setBatchDetailsFilterAnchor] = useState<FilterAnchor>({
    element: null,
    column: '',
  })
  const [batchDetailsFilterSearchTerm, setBatchDetailsFilterSearchTerm] = useState('')

  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({
    firstName: [],
    middleName: [],
    lastName: [],
    gender: [],
    dob: [],
    age: [],
    din: [],
    csaStatus: [],
    statusEffective: [],
    caseNumber: [],
    caseStatus: [],
    legacyFile: [],
    cgwrks3: [],
    lastUpdated: [],
    lastUpdatedBy: [],
  })

  // Helper function to get pre-defined filter configuration
  // Note: csaStatus values must match database format (snake_case)
  const getPreDefinedFilterConfig = useCallback((filterName: string): any => {
    if (filterName === 'Pending User review/action') {
      return [
        {
          OR: [
            { key: 'csaStatus', op: 'eq', value: 'on_hold' },
            { key: 'csaStatus', op: 'eq', value: 'eligible_tbd' },
            { key: 'csaStatus', op: 'eq', value: 'not_eligible_ip_tbd' },
            { key: 'csaStatus', op: 'eq', value: 'eligible' },
            { key: 'csaStatus', op: 'eq', value: 'not_eligible_in_pay' },
          ],
        },
      ]
    } else if (filterName === 'All children On Hold from CSA') {
      return [{ key: 'csaStatus', op: 'eq', value: 'on_hold' }]
    } else if (filterName === 'Children In Pay') {
      return [{ key: 'csaStatus', op: 'eq', value: 'in_pay' }]
    } else if (filterName === 'Children Out of Pay') {
      return [
        {
          OR: [{ key: 'csaStatus', op: 'eq', value: 'not_eligible_out_of_pay' }],
        },
        { key: 'din', op: 'notblank', value: '' },
      ]
    } else if (filterName === 'CRA Refused CSA List') {
      return [
        {
          OR: [
            { key: 'csaStatus', op: 'eq', value: 'application_refused_cra' },
            { key: 'csaStatus', op: 'eq', value: 'cancellation_refused_cra' },
          ],
        },
      ]
    } else if (filterName === 'Children within a batch') {
      return [
        {
          OR: [
            { key: 'csaStatus', op: 'eq', value: 'in_batch_application' },
            { key: 'csaStatus', op: 'eq', value: 'batch_sent_application' },
            { key: 'csaStatus', op: 'eq', value: 'in_batch_cancellation' },
            { key: 'csaStatus', op: 'eq', value: 'batch_sent_cancellation' },
          ],
        },
      ]
    } else if (filterName === 'Children over 18 years (never eligible)') {
      return [{ key: 'csaStatus', op: 'eq', value: 'over_18' }]
    }
    return undefined
  }, [])

  // Function to fetch contacts from backend
  const fetchContacts = useCallback(
    async (page: number) => {
      setLoadingContacts(true)
      setContactsError(null)
      setIsSearchActive(false)
      try {
        let filter: any = undefined

        // Apply filter based on selected pre-defined filter
        // Note: csaStatus values must match database format (snake_case)
        if (preDefinedFilter === 'Pending User review/action') {
          // csaStatus = 'on_hold' OR 'eligible_tbd' OR 'not_eligible_ip_tbd' OR 'eligible' OR 'not_eligible_in_pay'
          filter = [
            {
              OR: [
                { key: 'csaStatus', op: 'eq', value: 'on_hold' },
                { key: 'csaStatus', op: 'eq', value: 'eligible_tbd' },
                { key: 'csaStatus', op: 'eq', value: 'not_eligible_ip_tbd' },
                { key: 'csaStatus', op: 'eq', value: 'eligible' },
                { key: 'csaStatus', op: 'eq', value: 'not_eligible_in_pay' },
              ],
            },
          ]
        } else if (preDefinedFilter === 'All children On Hold from CSA') {
          filter = [{ key: 'csaStatus', op: 'eq', value: 'on_hold' }]
        } else if (preDefinedFilter === 'Children In Pay') {
          filter = [{ key: 'csaStatus', op: 'eq', value: 'in_pay' }]
        } else if (preDefinedFilter === 'Children Out of Pay') {
          // csaStatus = 'not_eligible_out_of_pay' AND din is not blank
          filter = [
            {
              OR: [{ key: 'csaStatus', op: 'eq', value: 'not_eligible_out_of_pay' }],
            },
            { key: 'din', op: 'notblank', value: '' },
          ]
        } else if (preDefinedFilter === 'CRA Refused CSA List') {
          // csaStatus = 'application_refused_cra' OR 'cancellation_refused_cra'
          filter = [
            {
              OR: [
                { key: 'csaStatus', op: 'eq', value: 'application_refused_cra' },
                { key: 'csaStatus', op: 'eq', value: 'cancellation_refused_cra' },
              ],
            },
          ]
        } else if (preDefinedFilter === 'Children within a batch') {
          // csaStatus = 'in_batch_application' OR 'batch_sent_application' OR 'in_batch_cancellation' OR 'batch_sent_cancellation'
          filter = [
            {
              OR: [
                { key: 'csaStatus', op: 'eq', value: 'in_batch_application' },
                { key: 'csaStatus', op: 'eq', value: 'batch_sent_application' },
                { key: 'csaStatus', op: 'eq', value: 'in_batch_cancellation' },
                { key: 'csaStatus', op: 'eq', value: 'batch_sent_cancellation' },
              ],
            },
          ]
        } else if (preDefinedFilter === 'Children over 18 years (never eligible)') {
          // csaStatus = 'over_18'
          filter = [{ key: 'csaStatus', op: 'eq', value: 'over_18' }]
        }

        // Build sort parameter if sortConfig is set
        let sort: Array<{ [key: string]: 'asc' | 'desc' }> | undefined
        if (sortConfig) {
          const backendField = columnToFieldMapping[sortConfig.column]
          if (backendField) {
            sort = [{ [backendField]: sortConfig.direction }]
          }
        }

        const response = await getAllContacts(page, recordsPerPage, filter, sort)
        setContacts(response.data)
        setTotalPages(response.totalPages)
        setTotalRecords(response.total)
        console.log('Fetched contacts:', response.data)
        console.log('Total records:', response.total)
        console.log('Applied filter:', filter)
        console.log('Applied sort:', sort)
      } catch (error) {
        console.error('Failed to fetch contacts:', error)
        setContactsError('Failed to load contacts. Please try again.')
        setContacts([])
      } finally {
        setLoadingContacts(false)
      }
    },
    [preDefinedFilter, recordsPerPage, sortConfig, columnToFieldMapping],
  )

  // Function to perform column-specific filter search
  const performColumnFilterSearch = useCallback(
    async (column: string, query: string, page: number) => {
      setIsColumnFilterActive(true)
      setLoadingContacts(true)
      setContactsError(null)
      try {
        const backendField = columnToFieldMapping[column]
        if (!backendField) {
          console.error('Unknown column:', column)
          return
        }

        // Build filter for column-specific search
        // Use 'eq' for numeric fields, 'like' for text fields
        const numericColumns = ['age']
        const isNumericColumn = numericColumns.includes(column)
        const op = isNumericColumn ? 'eq' : 'like'

        // For numeric columns, parse as integer and validate
        let value: string | number = query
        if (isNumericColumn) {
          const parsedValue = parseInt(query, 10)
          if (isNaN(parsedValue)) {
            setLoadingContacts(false)
            return // Don't make API call for invalid numeric input
          }
          value = parsedValue
        }

        const columnFilter = [{ key: backendField, op, value }]

        // Combine with existing pre-defined filter if needed
        let combinedFilter = columnFilter

        // If there's a pre-defined filter other than "All Records", combine them
        if (preDefinedFilter !== 'All Records') {
          const baseFilter = getPreDefinedFilterConfig(preDefinedFilter)
          if (baseFilter) {
            combinedFilter = [...baseFilter, ...columnFilter]
          }
        }

        const response = await getAllContacts(page, recordsPerPage, combinedFilter)
        setContacts(response.data)
        setTotalPages(response.totalPages)
        setTotalRecords(response.total)
        console.log('Column filter search results:', response.data)
        console.log('Total column filter records:', response.total)
        console.log('Column:', column, 'Query:', query)
        console.log('Applied filter:', combinedFilter)
      } catch (error) {
        console.error('Failed to search column:', error)
        setContactsError('Failed to search. Please try again.')
        setContacts([])
      } finally {
        setLoadingContacts(false)
      }
    },
    [preDefinedFilter, recordsPerPage, columnToFieldMapping, getPreDefinedFilterConfig],
  )

  // Function to perform full-text search
  const performFullTextSearch = useCallback(
    async (query: string, page: number) => {
      setIsSearchActive(true)
      setLoadingContacts(true)
      setContactsError(null)
      try {
        const response = await fullTextSearchContacts(query, page, recordsPerPage)
        setContacts(response.data)
        setTotalPages(response.totalPages)
        setTotalRecords(response.total)
        console.log('Search results:', response.data)
        console.log('Total search records:', response.total)
        console.log('Search query:', query)
      } catch (error) {
        console.error('Failed to search contacts:', error)
        setContactsError('Failed to search contacts. Please try again.')
        setContacts([])
      } finally {
        setLoadingContacts(false)
      }
    },
    [recordsPerPage],
  )

  // Fetch contacts from backend when pre-defined filter is 'All Records' or filter-based options
  useEffect(() => {
    const apiFilters = [
      'All Records',
      'Pending User review/action',
      'All children On Hold from CSA',
      'Children In Pay',
      'Children Out of Pay',
      'CRA Refused CSA List',
      'Children within a batch',
      'Children over 18 years (never eligible)',
    ]

    if (!apiFilters.includes(preDefinedFilter) || !isAuthenticated) {
      return
    }

    // If column filter is active, re-apply the column filter on page change
    if (isColumnFilterActive && activeColumnFilter) {
      performColumnFilterSearch(activeColumnFilter.column, activeColumnFilter.query, currentPage)
    } else if (!isSearchActive) {
      // Only fetch regular contacts when no column filter or search is active
      fetchContacts(currentPage)
    }
  }, [
    preDefinedFilter,
    currentPage,
    isAuthenticated,
    isSearchActive,
    isColumnFilterActive,
    activeColumnFilter,
    fetchContacts,
    performColumnFilterSearch,
  ])

  // Full-text search effect - triggers when searchTerm has 3+ characters
  useEffect(() => {
    const apiFilters = [
      'All Records',
      'Pending User review/action',
      'All children On Hold from CSA',
      'Children In Pay',
      'Children Out of Pay',
      'CRA Refused CSA List',
      'Children within a batch',
      'Children over 18 years (never eligible)',
    ]

    // Only trigger search for API-based filters
    if (!apiFilters.includes(preDefinedFilter) || !isAuthenticated) {
      return
    }

    // Debounce search - wait 500ms after user stops typing
    const searchTimer = setTimeout(() => {
      if (searchTerm.trim().length >= 3) {
        performFullTextSearch(searchTerm.trim(), currentPage)
      } else if (searchTerm.trim().length === 0 && !isColumnFilterActive) {
        // If search is cleared and no column filter is active, go back to regular filter
        setIsSearchActive(false)
        fetchContacts(currentPage)
      }
    }, 500)

    return () => clearTimeout(searchTimer)
  }, [
    searchTerm,
    currentPage,
    preDefinedFilter,
    isAuthenticated,
    isColumnFilterActive,
    fetchContacts,
    performFullTextSearch,
  ])

  // Column filter search effect - triggers when filterSearchTerm has enough characters
  useEffect(() => {
    const apiFilters = [
      'All Records',
      'Pending User review/action',
      'All children On Hold from CSA',
      'Children In Pay',
      'Children Out of Pay',
      'CRA Refused CSA List',
      'Children within a batch',
      'Children over 18 years (never eligible)',
    ]

    // Only trigger column filter search for API-based filters and when a column is selected
    if (!apiFilters.includes(preDefinedFilter) || !isAuthenticated || !filterAnchor.column) {
      return
    }

    // Numeric columns only need 1 character, text columns need 3
    const numericColumns = ['age']
    const minChars = numericColumns.includes(filterAnchor.column) ? 1 : 3

    // Debounce column search - wait 500ms after user stops typing
    const columnSearchTimer = setTimeout(() => {
      if (filterSearchTerm.trim().length >= minChars) {
        // Store the active column filter for pagination
        setActiveColumnFilter({ column: filterAnchor.column, query: filterSearchTerm.trim() })
        performColumnFilterSearch(filterAnchor.column, filterSearchTerm.trim(), currentPage)
      } else if (
        filterSearchTerm.trim().length === 0 &&
        isColumnFilterActive &&
        activeColumnFilter &&
        activeColumnFilter.column === filterAnchor.column
      ) {
        // Only clear filter if searching in the same column that has the active filter
        setIsColumnFilterActive(false)
        setActiveColumnFilter(null)
        fetchContacts(currentPage)
      }
    }, 500)

    return () => clearTimeout(columnSearchTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filterSearchTerm,
    filterAnchor.column,
    preDefinedFilter,
    isAuthenticated,
    isColumnFilterActive,
    activeColumnFilter,
    fetchContacts,
    performColumnFilterSearch,
  ])

  // Fetch batches when component mounts
  useEffect(() => {
    const fetchBatches = async () => {
      if (!isAuthenticated) return

      setLoadingBatches(true)
      try {
        const batchesData = await getAllBatches()
        setBatches(batchesData)

        // Automatically select and load the first batch if available
        if (batchesData.length > 0) {
          const firstBatchId = batchesData[0].id
          setSelectedBatch(firstBatchId)

          // Fetch details for the first batch
          setLoadingBatchDetails(true)
          try {
            const details = await getBatchContacts(firstBatchId)
            setBatchDetails(details)
          } catch (detailError) {
            console.error('Failed to fetch first batch details:', detailError)
            setBatchDetails([])
          } finally {
            setLoadingBatchDetails(false)
          }
        }
      } catch (error) {
        console.error('Error fetching batches:', error)
        setSnackbar({
          open: true,
          message: 'Failed to load batch requests',
          severity: 'error',
        })
      } finally {
        setLoadingBatches(false)
      }
    }

    fetchBatches()
  }, [isAuthenticated])

  // Handle page change
  const handlePageChange = (_event: React.ChangeEvent<unknown>, page: number) => {
    setCurrentPage(page)
  }

  // Handle pre-defined filter change
  const handlePreDefinedFilterChange = (value: string) => {
    setPreDefinedFilter(value)
    setCurrentPage(1) // Reset to first page when filter changes
    setSearchTerm('') // Clear search when changing filters
    setIsSearchActive(false) // Deactivate search mode
    // Clear column filter when changing PDQ filter
    setIsColumnFilterActive(false)
    setActiveColumnFilter(null)
    setFilterSearchTerm('')
    // Clear selected records when changing PDQ filter
    setSelected([])
  }

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue)
  }

  // Mock IDIR login handler
  const handleIdirLogin = async () => {
    // Simple validation - just check if fields are not empty
    // if (username.trim() && password.trim()) {
    const mockToken = `mock-token-${Date.now()}`
    localStorage.setItem('authToken', mockToken)
    localStorage.setItem('username', username)
    console.log('=== MOCK LOGIN - AUTH TOKEN SET ===')
    console.log('Mock Token:', mockToken)
    console.log('===================================')

    // Verify CSA access before granting login
    try {
      const csaAccessResponse = await verifyCSAAccess()

      // Check if token is expired
      if (csaAccessResponse.tokenExpired) {
        console.warn('Token expired')
        localStorage.removeItem('authToken')
        localStorage.removeItem('isLoggedIn')
        localStorage.removeItem('username')
        setSnackbar({
          open: true,
          message: 'Your session has expired. Please login again.',
          severity: 'error',
        })
        setShowIdirLogin(false)
        return
      }

      // Only grant access if BOTH hasAccess is true AND message is exactly 'User has CSA access'
      const hasValidAccess =
        csaAccessResponse.hasAccess === true && csaAccessResponse.message === 'User has CSA access'

      if (hasValidAccess) {
        setIsLoggedIn(true)
        localStorage.setItem('isLoggedIn', 'true')
        setShowIdirLogin(false)
      } else {
        // User is not authorized to access CSA
        console.warn('CSA access denied:', csaAccessResponse)
        localStorage.removeItem('authToken')
        localStorage.removeItem('isLoggedIn')
        localStorage.removeItem('username')
        setSnackbar({
          open: true,
          message: 'User not authorised to access CSA',
          severity: 'error',
        })
        setShowIdirLogin(false)
      }
    } catch (error) {
      console.error('Failed to verify CSA access:', error)
      localStorage.removeItem('authToken')
      localStorage.removeItem('isLoggedIn')
      localStorage.removeItem('username')
      setSnackbar({
        open: true,
        message: 'User not authorised to access CSA',
        severity: 'error',
      })
      setShowIdirLogin(false)
    }
    // }
  }

  // Mock logout handler
  const handleLogout = () => {
    console.log('=== LOGOUT - CLEARING AUTH TOKEN ===')
    console.log('Token before logout:', localStorage.getItem('authToken'))
    console.log('====================================')

    if (keycloakAuthenticated) {
      // Logout from Keycloak
      logout()
    } else {
      // Logout from mock session
      setIsLoggedIn(false)
      localStorage.removeItem('isLoggedIn')
      localStorage.removeItem('authToken')
      localStorage.removeItem('username')
      setUsername('')
      setPassword('')
    }
  }

  // Hold/Resume handler
  const handleHoldResume = async () => {
    if (selected.length === 0) return

    try {
      // Separate selected contacts into hold and resume groups
      const toHold: number[] = []
      const toResume: number[] = []

      selected.forEach((id) => {
        // Check in contacts array from API
        const contact = contacts.find((c) => c.id === id)
        if (contact) {
          if (contact.csaStatus === 'on_hold') {
            toResume.push(id)
          } else {
            toHold.push(id)
          }
        }
      })

      let totalSuccess = 0
      let totalSkipped = 0
      const skippedReasons: string[] = []

      // Process hold requests
      if (toHold.length > 0) {
        const holdResponse = await holdContacts(toHold)
        totalSuccess += holdResponse.success.length
        totalSkipped += holdResponse.skipped.length

        // Collect skip reasons
        holdResponse.skipped.forEach((skip) => {
          const reasonText = skip.reason.replace(/_/g, ' ')
          skippedReasons.push(`ID ${skip.id}: ${reasonText}`)
        })
      }

      // Process resume requests
      if (toResume.length > 0) {
        const resumeResponse = await resumeContacts(toResume)
        totalSuccess += resumeResponse.success.length
        totalSkipped += resumeResponse.skipped.length

        // Collect skip reasons
        resumeResponse.skipped.forEach((skip) => {
          const reasonText = skip.reason.replace(/_/g, ' ')
          skippedReasons.push(`ID ${skip.id}: ${reasonText}`)
        })
      }

      // Show success message
      let message = `Successfully processed ${totalSuccess} contact(s)`
      if (totalSkipped > 0) {
        message += `. ${totalSkipped} skipped`
        if (skippedReasons.length > 0 && skippedReasons.length <= 3) {
          message += `: ${skippedReasons.join(', ')}`
        }
      }

      setSnackbar({
        open: true,
        message,
        severity: totalSuccess > 0 ? 'success' : 'warning',
      })

      // Clear selection
      setSelected([])

      // Reload contacts to reflect the changes if at least one record was updated
      if (totalSuccess > 0) {
        // Check if we're using API-based filters
        const apiFilters = [
          'All Records',
          'Pending User review/action',
          'All children On Hold from CSA',
          'Children In Pay',
          'Children Out of Pay',
          'CRA Refused CSA List',
          'Children within a batch',
          'Children over 18 years (never eligible)',
        ]

        if (apiFilters.includes(preDefinedFilter)) {
          // Reload based on whether search is active
          if (isSearchActive && searchTerm.trim().length >= 3) {
            await performFullTextSearch(searchTerm.trim(), currentPage)
          } else {
            await fetchContacts(currentPage)
          }
        }
      }
    } catch (error) {
      console.error('Hold/Resume error:', error)
      setSnackbar({
        open: true,
        message: 'Failed to process hold/resume request. Please try again.',
        severity: 'error',
      })
    }
  }

  // CSA Eligible handler
  const handleCSAEligible = async () => {
    if (selected.length === 0) return

    try {
      const response = await updateEligibilityStatus(selected, 'ELIGIBLE')

      // Show results
      let message = `Successfully updated ${response.success.length} contact(s)`
      if (response.skipped.length > 0) {
        message += `. ${response.skipped.length} skipped`
        if (response.skipped.length <= 3) {
          const reasons = response.skipped
            .map((skip) => {
              const reasonText = skip.reason.replace(/_/g, ' ')
              return `ID ${skip.id}: ${reasonText}`
            })
            .join(', ')
          message += `: ${reasons}`
        }
      }

      setSnackbar({
        open: true,
        message,
        severity: response.success.length > 0 ? 'success' : 'error',
      })

      // Clear selection
      setSelected([])

      // Reload contacts to reflect the changes
      if (response.success.length > 0) {
        const apiFilters = [
          'All Records',
          'Pending User review/action',
          'All children On Hold from CSA',
          'Children In Pay',
          'Children Out of Pay',
          'CRA Refused CSA List',
          'Children within a batch',
          'Children over 18 years (never eligible)',
        ]

        if (apiFilters.includes(preDefinedFilter)) {
          if (isSearchActive && searchTerm.trim().length >= 3) {
            await performFullTextSearch(searchTerm.trim(), currentPage)
          } else {
            await fetchContacts(currentPage)
          }
        }
      }
    } catch (error: any) {
      console.error('CSA Eligible error:', error)
      const errorMessage =
        error?.response?.data?.message || error?.message || 'Failed to update eligibility status'
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error',
      })
    }
  }

  // CSA Not Eligible handler
  const handleCSANotEligible = async () => {
    if (selected.length === 0) return

    try {
      const response = await updateNotEligibleStatusAlt(selected, 'SET_NOT_ELIGIBLE')

      // Show results
      let message = `Successfully updated ${response.success.length} contact(s) to not eligible`
      if (response.skipped.length > 0) {
        message += `. ${response.skipped.length} skipped`
        if (response.skipped.length <= 3) {
          const reasons = response.skipped
            .map((skip) => {
              const reasonText = skip.reason.replace(/_/g, ' ')
              return `ID ${skip.id}: ${reasonText}`
            })
            .join(', ')
          message += `: ${reasons}`
        }
      }

      setSnackbar({
        open: true,
        message,
        severity: response.success.length > 0 ? 'success' : 'error',
      })

      // Clear selection
      setSelected([])

      // Reload contacts to reflect the changes
      if (response.success.length > 0) {
        const apiFilters = [
          'All Records',
          'Pending User review/action',
          'All children On Hold from CSA',
          'Children In Pay',
          'Children Out of Pay',
          'CRA Refused CSA List',
          'Children within a batch',
          'Children over 18 years (never eligible)',
        ]

        if (apiFilters.includes(preDefinedFilter)) {
          if (isSearchActive && searchTerm.trim().length >= 3) {
            await performFullTextSearch(searchTerm.trim(), currentPage)
          } else {
            await fetchContacts(currentPage)
          }
        }
      }
    } catch (error: any) {
      console.error('CSA Not Eligible error:', error)
      const errorMessage =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to update to not eligible status'
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error',
      })
    }
  }

  // Child Over 18 handler
  const handleChildOver18 = async () => {
    if (selected.length === 0) return

    try {
      const response = await updateOver18Status(selected, 'AGE_OUT')

      // Show results
      let message = `Successfully updated ${response.success.length} contact(s) to Over 18`
      if (response.skipped.length > 0) {
        message += `. ${response.skipped.length} skipped`
        if (response.skipped.length <= 3) {
          const reasons = response.skipped
            .map((skip) => {
              const reasonText = skip.reason.replace(/_/g, ' ')
              return `ID ${skip.id}: ${reasonText}`
            })
            .join(', ')
          message += `: ${reasons}`
        }
      }

      setSnackbar({
        open: true,
        message,
        severity: response.success.length > 0 ? 'success' : 'error',
      })

      // Clear selection
      setSelected([])

      // Reload contacts to reflect the changes
      if (response.success.length > 0) {
        const apiFilters = [
          'All Records',
          'Pending User review/action',
          'All children On Hold from CSA',
          'Children In Pay',
          'Children Out of Pay',
          'CRA Refused CSA List',
          'Children within a batch',
          'Children over 18 years (never eligible)',
        ]

        if (apiFilters.includes(preDefinedFilter)) {
          if (isSearchActive && searchTerm.trim().length >= 3) {
            await performFullTextSearch(searchTerm.trim(), currentPage)
          } else {
            await fetchContacts(currentPage)
          }
        }
      }
    } catch (error: any) {
      console.error('Child Over 18 error:', error)
      const errorMessage =
        error?.response?.data?.message || error?.message || 'Failed to update to Over 18 status'
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error',
      })
    }
  }

  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false })
  }

  // Handle Add to Batch button click
  const handleAddToBatch = async () => {
    if (selected.length === 0) return

    try {
      const response = await addContactsToBatch(selected)

      // Show success/warning message based on results
      const successCount = response.success.length
      const skippedCount = response.skipped.length

      if (successCount > 0 && skippedCount === 0) {
        setSnackbar({
          open: true,
          message: `Successfully added ${successCount} contact${successCount > 1 ? 's' : ''} to batch`,
          severity: 'success',
        })
      } else if (successCount > 0 && skippedCount > 0) {
        setSnackbar({
          open: true,
          message: `Added ${successCount} contact${successCount > 1 ? 's' : ''} to batch. ${skippedCount} skipped (already in batch or not found)`,
          severity: 'warning',
        })
      } else {
        setSnackbar({
          open: true,
          message: 'No contacts were added. All contacts were skipped.',
          severity: 'warning',
        })
      }

      // Clear selection after successful operation
      setSelected([])

      // Reload contacts to reflect the updated CSA status
      if (successCount > 0) {
        const apiFilters = [
          'All Records',
          'Pending User review/action',
          'All children On Hold from CSA',
          'Children In Pay',
          'Children Out of Pay',
          'CRA Refused CSA List',
          'Children within a batch',
          'Children over 18 years (never eligible)',
        ]

        if (apiFilters.includes(preDefinedFilter)) {
          if (isSearchActive && searchTerm.trim().length >= 3) {
            await performFullTextSearch(searchTerm.trim(), currentPage)
          } else {
            await fetchContacts(currentPage)
          }
        }
      }
    } catch (error) {
      console.error('Add to batch error:', error)
      setSnackbar({
        open: true,
        message: 'Failed to add contacts to batch. Please try again.',
        severity: 'error',
      })
    }
  }

  // Fetch batch history for selected contact
  const handleContactClick = async (contactId: number) => {
    setSelectedChild(contactId)
    setLoadingBatchHistory(true)
    setSelectedBatchHistoryId(null) // Clear batch history selection when changing contacts

    try {
      const batchHistory = await getContactBatches(contactId)
      setContactBatchHistory(batchHistory)
    } catch (error) {
      console.error('Failed to fetch batch history:', error)
      setContactBatchHistory([])
    } finally {
      setLoadingBatchHistory(false)
    }
  }

  // Handle batch history row click
  const handleBatchHistoryRowClick = (batchHistoryId: number) => {
    setSelectedBatchHistoryId(batchHistoryId)
  }

  // Handle Remove from Batch button click
  const handleRemoveFromBatch = async () => {
    if (!selectedBatchHistoryId || !selectedChild) return

    try {
      const result = await removeContactFromBatch(selectedChild)

      setSnackbar({
        open: true,
        message: `Successfully removed contact from batch. New record count: ${result.recordCount}`,
        severity: 'success',
      })

      // Refresh batch history for the selected contact
      await handleContactClick(selectedChild)

      // Refresh the eligibility list to reflect updated CSA status
      const apiFilters = [
        'All Records',
        'Pending User review/action',
        'All children On Hold from CSA',
        'Children In Pay',
        'Children Out of Pay',
        'CRA Refused CSA List',
        'Children within a batch',
        'Children over 18 years (never eligible)',
      ]

      if (apiFilters.includes(preDefinedFilter)) {
        // Reload based on active filter/search
        if (isColumnFilterActive && activeColumnFilter) {
          await performColumnFilterSearch(
            activeColumnFilter.column,
            activeColumnFilter.query,
            currentPage,
          )
        } else if (isSearchActive && searchTerm.trim().length >= 3) {
          await performFullTextSearch(searchTerm.trim(), currentPage)
        } else {
          await fetchContacts(currentPage)
        }
      }

      // Refresh Batch Requests table
      const updatedBatches = await getAllBatches()
      setBatches(updatedBatches)

      // Refresh Batch Details table for the currently selected batch
      if (selectedBatch) {
        const updatedDetails = await getBatchContacts(selectedBatch)
        setBatchDetails(updatedDetails)
      }

      // Clear selection
      setSelectedBatchHistoryId(null)
    } catch (error: any) {
      console.error('Remove from batch error:', error)
      // Extract error message from API response
      const errorMessage =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to remove contact from batch. Please try again.'
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error',
      })
    }
  }

  // Fetch batch details for selected batch
  const handleBatchClick = async (batchId: number) => {
    setSelectedBatch(batchId)
    setLoadingBatchDetails(true)

    try {
      const details = await getBatchContacts(batchId)
      setBatchDetails(details)
    } catch (error) {
      console.error('Failed to fetch batch details:', error)
      setSnackbar({
        open: true,
        message: 'Failed to load batch details',
        severity: 'error',
      })
      setBatchDetails([])
    } finally {
      setLoadingBatchDetails(false)
    }
  }

  // Handle Remove from Batch button click in Batch Details table
  const handleRemoveFromBatchDetails = async () => {
    if (selectedBatchDetails.length === 0) return

    try {
      // Map selected batch_contact IDs to their corresponding contact IDs
      const contactIds = selectedBatchDetails
        .map((batchContactId) => {
          const detail = batchDetails.find((d) => d.id === batchContactId)
          return detail?.contactId
        })
        .filter((id): id is number => id !== undefined)

      // Remove each selected contact from the batch
      const removePromises = contactIds.map((contactId) => removeContactFromBatch(contactId))

      const results = await Promise.all(removePromises)

      // Get the updated record count from the first result
      const updatedRecordCount = results[0]?.recordCount ?? 0

      setSnackbar({
        open: true,
        message: `Successfully removed ${selectedBatchDetails.length} contact${selectedBatchDetails.length > 1 ? 's' : ''} from batch. New record count: ${updatedRecordCount}`,
        severity: 'success',
      })

      // Refresh batch details for the selected batch
      if (selectedBatch) {
        await handleBatchClick(selectedBatch)
      }

      // Clear selection
      setSelectedBatchDetails([])
    } catch (error: any) {
      console.error('Remove from batch details error:', error)
      // Extract error message from API response
      const errorMessage =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to remove contacts from batch. Please try again.'
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error',
      })
    }
  }

  // Filter handling functions
  const handleFilterClick = (event: React.MouseEvent<HTMLElement>, column: string) => {
    setFilterAnchor({ element: event.currentTarget, column })
    // If clicking on the same column that has an active filter, preserve the search term
    if (activeColumnFilter && activeColumnFilter.column === column) {
      setFilterSearchTerm(activeColumnFilter.query)
    } else {
      setFilterSearchTerm('')
    }
    // Do not reset column filter active state - filter should only be cleared explicitly
  }

  const handleFilterClose = () => {
    setFilterAnchor({ element: null, column: '' })
    setFilterSearchTerm('')
  }

  const clearColumnFilter = (column: string) => {
    setColumnFilters((prev) => ({ ...prev, [column]: [] }))
    // Reset column filter active state and refetch data
    setIsColumnFilterActive(false)
    setActiveColumnFilter(null)
    setFilterSearchTerm('')
    fetchContacts(currentPage)
  }

  // Batch History filter handling functions
  const handleBatchHistoryFilterClick = (event: React.MouseEvent<HTMLElement>, column: string) => {
    setBatchHistoryFilterAnchor({ element: event.currentTarget, column })
    setBatchHistoryFilterSearchTerm('')
  }

  const handleBatchHistoryFilterClose = () => {
    setBatchHistoryFilterAnchor({ element: null, column: '' })
    setBatchHistoryFilterSearchTerm('')
  }

  const handleBatchHistoryFilterChange = (column: string, value: string) => {
    setBatchHistoryColumnFilters((prev) => {
      const currentFilters = prev[column] || []
      const newFilters = currentFilters.includes(value)
        ? currentFilters.filter((v) => v !== value)
        : [...currentFilters, value]
      return { ...prev, [column]: newFilters }
    })
  }

  const clearBatchHistoryColumnFilter = (column: string) => {
    setBatchHistoryColumnFilters((prev) => ({ ...prev, [column]: [] }))
  }

  const getBatchHistoryUniqueValues = (column: string) => {
    // Transform API data to match the table structure, then get unique values
    const transformedData = contactBatchHistory.map((item) => ({
      batchId: String(item.batch.id),
      createdDate: new Date(item.createdAt).toLocaleDateString(),
      batchDate: item.batch.batchDate ? new Date(item.batch.batchDate).toLocaleDateString() : '',
      status: item.batch.status || '',
      transactionType: item.transactionType || '',
    }))
    const values = transformedData.map((row) => row[column as keyof typeof row])
    return Array.from(new Set(values)).filter((v) => v !== undefined && v !== '')
  }

  // Batch Requests filter handling functions
  const handleBatchRequestsFilterClick = (event: React.MouseEvent<HTMLElement>, column: string) => {
    setBatchRequestsFilterAnchor({ element: event.currentTarget, column })
    setBatchRequestsFilterSearchTerm('')
  }

  const handleBatchRequestsFilterClose = () => {
    setBatchRequestsFilterAnchor({ element: null, column: '' })
    setBatchRequestsFilterSearchTerm('')
  }

  const handleBatchRequestsFilterChange = (column: string, value: string) => {
    setBatchRequestsColumnFilters((prev) => {
      const currentFilters = prev[column] || []
      const newFilters = currentFilters.includes(value)
        ? currentFilters.filter((v) => v !== value)
        : [...currentFilters, value]
      return { ...prev, [column]: newFilters }
    })
  }

  const clearBatchRequestsColumnFilter = (column: string) => {
    setBatchRequestsColumnFilters((prev) => ({ ...prev, [column]: [] }))
  }

  const getBatchRequestsUniqueValues = (column: string) => {
    const values = batches.map((batch) => {
      // Map API fields to display fields
      switch (column) {
        case 'batchId':
          return `1-${batch.id}`
        case 'batchDate':
          return batch.batchDate
            ? new Date(batch.batchDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: '2-digit',
              })
            : ''
        case 'status':
          return batch.status
        case 'recordCount':
          return String(batch.recordCount)
        case 'createdDate':
          return new Date(batch.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
          })
        case 'systemComments':
          return batch.systemComments || ''
        default:
          return ''
      }
    })
    return Array.from(new Set(values)).filter((v) => v !== undefined && v !== '')
  }

  // Batch Details filter handling functions
  const handleBatchDetailsFilterClick = (event: React.MouseEvent<HTMLElement>, column: string) => {
    setBatchDetailsFilterAnchor({ element: event.currentTarget, column })
    setBatchDetailsFilterSearchTerm('')
  }

  const handleBatchDetailsFilterClose = () => {
    setBatchDetailsFilterAnchor({ element: null, column: '' })
    setBatchDetailsFilterSearchTerm('')
  }

  const handleBatchDetailsFilterChange = (column: string, value: string) => {
    setBatchDetailsColumnFilters((prev) => {
      const currentFilters = prev[column] || []
      const newFilters = currentFilters.includes(value)
        ? currentFilters.filter((v) => v !== value)
        : [...currentFilters, value]
      return { ...prev, [column]: newFilters }
    })
  }

  const clearBatchDetailsColumnFilter = (column: string) => {
    setBatchDetailsColumnFilters((prev) => ({ ...prev, [column]: [] }))
  }

  // Sort handling functions
  const handleSortClick = (event: React.MouseEvent<HTMLElement>, column: string) => {
    setSortAnchor({ element: event.currentTarget, column })
  }

  const handleSortClose = () => {
    setSortAnchor({ element: null, column: '' })
  }

  const handleSort = (column: string, direction: 'asc' | 'desc') => {
    setSortConfig({ column, direction })
    handleSortClose()
  }

  // Apply filters and sorting to data - always use API data
  // Note: Sorting is now handled by the backend API, so we just transform the data here
  const filteredData = useMemo(() => {
    const data = contacts.map((contact) => ({
      id: contact.id,
      firstName: contact.firstName || '',
      middleName: contact.middleName || '',
      lastName: contact.lastName || '',
      akaLastName: contact.akaLastName || '',
      akaFirstName: contact.akaFirstName || '',
      personIdIcm: contact.personIdIcm || '',
      personIdMis: contact.personIdIms || '',
      gender: contact.gender || '',
      dob: contact.dateOfBirth ? formatDateYMD(contact.dateOfBirth) : '',
      age: contact.age || 0,
      din: contact.din || '',
      csaStatus: contact.csaStatusLabel || contact.csaStatus || '', // Display label
      csaStatusRaw: contact.csaStatus || '', // Raw value for validation logic
      statusEffective: contact.csaStatusEffectiveDate
        ? formatDateTimeYMDHMS(contact.csaStatusEffectiveDate)
        : '',
      caseNumber: contact.caseNumber || '',
      caseType: contact.caseType || '',
      caseStatus: contact.caseStatus || '',
      caseLoad: contact.caseLoad || '',
      legacyFile: contact.legacyFileNumber || '',
      serviceOffice: contact.serviceOffice || '',
      assignedTo: contact.assignedTo || '',
      effectiveLegalStatus: contact.effectiveLegalStatus || '',
      effectiveDate: contact.effectiveDate
        ? new Date(contact.effectiveDate).toLocaleDateString()
        : '',
      expiryDate: contact.expiryDate ? new Date(contact.expiryDate).toLocaleDateString() : '',
      // Birth location
      birthCity: contact.birthCity || '',
      birthProvince: contact.birthProvince || '',
      birthCountry: contact.birthCountry || '',
      // Placement fields
      placementLocation: contact.placementLocation || '',
      locationType: contact.locationType || '',
      locationSubType: contact.locationSubType || '',
      placementStatus: contact.placementStatus || '',
      actualStartDate: contact.actualStartDate
        ? new Date(contact.actualStartDate).toLocaleDateString()
        : '',
      actualEndDate: contact.actualEndDate
        ? new Date(contact.actualEndDate).toLocaleDateString()
        : '',
      paidUnpaid: contact.paidUnpaid || '',
      sourcePlacement: contact.sourcePlacement || '',
      // Service provider and agreement fields
      serviceProviderName: contact.serviceProviderName || '',
      providerId: contact.providerId || '',
      placeOfServiceName: contact.placeOfServiceName || '',
      sourceAgreement: '', // Placeholder - backend field not yet available
      agreementType: contact.agreementType || '',
      agreementStatus: contact.agreementStatus || '',
      agreementStartDate: contact.agreementStartDate
        ? new Date(contact.agreementStartDate).toLocaleDateString()
        : '',
      agreementEndDate: contact.agreementEndDate
        ? new Date(contact.agreementEndDate).toLocaleDateString()
        : '',
      terminationDate: contact.terminationDate
        ? new Date(contact.terminationDate).toLocaleDateString()
        : '',
      mcfdContract: contact.mcfdContract || '',
      product: contact.product || '',
      isOver18: contact.isOver18 || false,
      cgwrks3: '',
      lastUpdated: contact.lastUpdatedAt ? formatDateTimeYMDHMS(contact.lastUpdatedAt) : '',
      lastUpdatedBy: contact.lastUpdatedBy || '',
    }))

    return data
  }, [contacts])

  // Check if all selected records have valid CSA status for Hold/Resume
  const canHoldResume = useMemo(() => {
    if (selected.length === 0) return false

    return selected.every((id) => {
      const record = filteredData.find((row) => row.id === id)
      return record && VALID_CSA_STATUSES.includes(record.csaStatusRaw)
    })
  }, [selected, filteredData])

  // Check if all selected records have valid CSA status for Add to Batch
  const canAddToBatch = useMemo(() => {
    if (selected.length === 0) return false

    return selected.every((id) => {
      const record = filteredData.find((row) => row.id === id)
      return record && VALID_BATCH_STATUSES.includes(record.csaStatusRaw)
    })
  }, [selected, filteredData])

  // Check if Remove from Batch button should be enabled
  const canRemoveFromBatch = useMemo(() => {
    if (!selectedBatchHistoryId) return false

    const selectedBatch = contactBatchHistory.find((item) => item.id === selectedBatchHistoryId)
    return selectedBatch?.batch.status === 'pending'
  }, [selectedBatchHistoryId, contactBatchHistory])

  // Check if Remove from Batch button in Batch Details should be enabled
  const canRemoveFromBatchDetails = useMemo(() => {
    if (selectedBatchDetails.length === 0) return false

    const currentBatch = batches.find((batch) => batch.id === selectedBatch)
    return currentBatch?.status === 'pending'
  }, [selectedBatchDetails, batches, selectedBatch])

  // Check if CSA Eligible button should be enabled
  const canUpdateEligibility = useMemo(() => {
    if (selected.length === 0) return false

    // Only enable if all selected records have eligible statuses
    return selected.every((id) => {
      const record = filteredData.find((row) => row.id === id)
      return (
        record &&
        (record.csaStatusRaw === 'not_eligible_out_of_pay' ||
          record.csaStatusRaw === 'not_eligible_ip_tbd')
      )
    })
  }, [selected, filteredData])

  // Check if CSA Not Eligible button should be enabled
  const canUpdateNotEligible = useMemo(() => {
    if (selected.length === 0) return false

    // Only enable if all selected records have eligible statuses
    return selected.every((id) => {
      const record = filteredData.find((row) => row.id === id)
      return (
        record &&
        (record.csaStatusRaw === 'eligible_tbd' ||
          record.csaStatusRaw === 'in_pay' ||
          record.csaStatusRaw === 'on_hold')
      )
    })
  }, [selected, filteredData])

  // Check if Child Over 18 button should be enabled
  const canUpdateOver18 = useMemo(() => {
    if (selected.length === 0) return false

    // Only enable if all selected records have isOver18 flag set to true
    // AND have eligible_tbd or not_eligible_ip_tbd status
    return selected.every((id) => {
      const record = filteredData.find((row) => row.id === id)
      return (
        record &&
        record.isOver18 === true &&
        (record.csaStatusRaw === 'eligible_tbd' || record.csaStatusRaw === 'not_eligible_ip_tbd')
      )
    })
  }, [selected, filteredData])

  // Filter batch history data (frontend-only filtering)
  const filteredBatchHistory = useMemo(() => {
    // Map API data to match the expected table structure
    let data = contactBatchHistory.map((item) => ({
      id: item.id,
      batchId: String(item.batch.id),
      createdDate: new Date(item.createdAt).toLocaleDateString(),
      batchDate: item.batch.batchDate ? new Date(item.batch.batchDate).toLocaleDateString() : '',
      status: item.batch.status || '',
      transactionType: item.transactionType || '',
    }))

    // Apply global search across all columns
    if (batchHistorySearchTerm) {
      const searchLower = batchHistorySearchTerm.toLowerCase()
      data = data.filter((row) => {
        return (
          row.batchId.toLowerCase().includes(searchLower) ||
          row.createdDate.toLowerCase().includes(searchLower) ||
          row.batchDate.toLowerCase().includes(searchLower) ||
          row.status.toLowerCase().includes(searchLower) ||
          row.transactionType.toLowerCase().includes(searchLower)
        )
      })
    }

    // Apply column-specific filters
    for (const [column, filters] of Object.entries(batchHistoryColumnFilters)) {
      if (filters.length > 0) {
        data = data.filter((row) => {
          const columnValue = String(row[column as keyof typeof row])
          return filters.includes(columnValue)
        })
      }
    }

    return data
  }, [contactBatchHistory, batchHistorySearchTerm, batchHistoryColumnFilters])

  // Filter batch requests data
  const filteredBatchRequests = useMemo(() => {
    // Transform API data to match table structure
    let data = batches.map((batch) => ({
      id: batch.id,
      batchId: `1-${batch.id}`, // Format as "1-{id}"
      batchDate: batch.batchDate
        ? new Date(batch.batchDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
          })
        : '',
      status: batch.status,
      recordCount: batch.recordCount,
      createdDate: new Date(batch.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      }),
      systemComments: batch.systemComments || '',
    }))

    // Apply global search across all columns
    if (batchRequestsSearchTerm) {
      const searchLower = batchRequestsSearchTerm.toLowerCase()
      data = data.filter((row) => {
        return (
          row.batchId.toLowerCase().includes(searchLower) ||
          row.batchDate.toLowerCase().includes(searchLower) ||
          row.status.toLowerCase().includes(searchLower) ||
          String(row.recordCount).toLowerCase().includes(searchLower) ||
          row.createdDate.toLowerCase().includes(searchLower) ||
          row.systemComments.toLowerCase().includes(searchLower)
        )
      })
    }

    // Apply column-specific filters
    for (const [column, filters] of Object.entries(batchRequestsColumnFilters)) {
      if (filters.length > 0) {
        data = data.filter((row) => {
          const columnValue = String(row[column as keyof typeof row])
          return filters.includes(columnValue)
        })
      }
    }

    return data
  }, [batches, batchRequestsSearchTerm, batchRequestsColumnFilters])

  // Get batch details for selected batch
  const currentBatchDetails = useMemo(() => {
    // Transform API data to match table structure
    return batchDetails.map((detail) => ({
      id: detail.id,
      contactId: detail.contactId,
      lastName: detail.contact.lastName,
      middleName: detail.contact.middleName || '',
      givenName: detail.contact.firstName,
      transactionType: detail.transactionType,
      status: detail.statusLabel || detail.status || '',
      systemComments: detail.systemComments || '',
    }))
  }, [batchDetails])

  // Filter batch details data (frontend-only filtering)
  const filteredBatchDetails = useMemo(() => {
    let data = [...currentBatchDetails]

    // Apply global search across all columns
    if (batchDetailsSearchTerm) {
      const searchLower = batchDetailsSearchTerm.toLowerCase()
      data = data.filter((row) => {
        return (
          row.lastName.toLowerCase().includes(searchLower) ||
          row.middleName.toLowerCase().includes(searchLower) ||
          row.givenName.toLowerCase().includes(searchLower) ||
          row.transactionType.toLowerCase().includes(searchLower) ||
          row.status.toLowerCase().includes(searchLower) ||
          row.systemComments.toLowerCase().includes(searchLower)
        )
      })
    }

    // Apply column-specific filters
    for (const [column, filters] of Object.entries(batchDetailsColumnFilters)) {
      if (filters.length > 0) {
        data = data.filter((row) => {
          const columnValue = String(row[column as keyof typeof row])
          return filters.includes(columnValue)
        })
      }
    }

    return data
  }, [currentBatchDetails, batchDetailsSearchTerm, batchDetailsColumnFilters])

  return (
    <Box
      sx={{
        width: '100%',
        height: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar Section - Always visible */}
      <AppBar
        position="static"
        sx={{
          backgroundColor: '#ffffff',
          boxShadow: 'none',
          borderBottom: '1px solid #e0e0e0',
          flexShrink: 0,
        }}
      >
        <Toolbar sx={{ padding: '8px 24px', justifyContent: 'center', position: 'relative' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <img src={logo} alt="BC Logo" style={{ height: '40px' }} />
            <Typography variant="h6" component="div" sx={{ color: '#333', fontWeight: 500 }}>
              Children&apos;s Special Allowance
            </Typography>
          </Box>
          {isAuthenticated && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                position: 'absolute',
                right: 24,
              }}
            >
              <Typography variant="body2" sx={{ color: '#666' }}>
                {user?.idirUsername || user?.email || user?.name || username || 'User'}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={handleLogout}
                sx={{
                  textTransform: 'none',
                  borderColor: '#3b6ea5',
                  color: '#3b6ea5',
                  '&:hover': {
                    borderColor: '#2d5a8a',
                    backgroundColor: '#f0f4f8',
                  },
                }}
              >
                Logout
              </Button>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      {isLoading ? (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flex: 1,
            height: '100vh',
          }}
        >
          <Typography variant="h6" sx={{ color: '#666' }}>
            Loading...
          </Typography>
        </Box>
      ) : !isAuthenticated ? (
        <Box
          sx={{
            textAlign: 'center',
            paddingTop: '50px',
            display: 'flex',
            justifyContent: 'center',
            flex: 1,
            alignItems: 'flex-start',
            width: '100%',
          }}
        >
          <Box sx={{ width: '100%', maxWidth: '800px' }}>
            {!showIdirLogin ? (
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: '20px' }}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={login}
                  size="large"
                  sx={{
                    textTransform: 'uppercase',
                    backgroundColor: '#1976d2',
                    '&:hover': {
                      backgroundColor: '#1565c0',
                    },
                  }}
                >
                  Login via SSO
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => setShowIdirLogin(true)}
                  size="large"
                  sx={{
                    textTransform: 'uppercase',
                    backgroundColor: '#1976d2',
                    '&:hover': {
                      backgroundColor: '#1565c0',
                    },
                  }}
                >
                  Login with IDIR
                </Button>
              </Box>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  maxWidth: '400px',
                  margin: '0 auto',
                  marginTop: '40px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                {/* Header */}
                <Box
                  sx={{
                    backgroundColor: '#5b7f95',
                    color: '#ffffff',
                    padding: '16px',
                    textAlign: 'center',
                  }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 500 }}>
                    Log in with IDIR
                  </Typography>
                </Box>

                {/* Form Content */}
                <Box sx={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  <Box>
                    <Typography
                      variant="body2"
                      sx={{ mb: 1, color: '#333', fontWeight: 500, textAlign: 'center' }}
                    >
                      Username
                    </Typography>
                    <TextField
                      placeholder="Example@bc..."
                      variant="outlined"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      fullWidth
                      size="small"
                    />
                  </Box>

                  <Box>
                    <Typography
                      variant="body2"
                      sx={{ mb: 1, color: '#333', fontWeight: 500, textAlign: 'center' }}
                    >
                      Password
                    </Typography>
                    <TextField
                      placeholder="************"
                      type="password"
                      variant="outlined"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      fullWidth
                      size="small"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleIdirLogin()
                        }
                      }}
                    />
                  </Box>

                  <Box
                    sx={{
                      display: 'flex',
                      gap: 2,
                      justifyContent: 'flex-end',
                      marginTop: '10px',
                    }}
                  >
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setShowIdirLogin(false)
                        setUsername('')
                        setPassword('')
                      }}
                      sx={{
                        textTransform: 'none',
                        borderColor: '#1976d2',
                        color: '#1976d2',
                        '&:hover': {
                          borderColor: '#1565c0',
                          backgroundColor: '#f0f4f8',
                        },
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleIdirLogin}
                      sx={{
                        textTransform: 'none',
                        backgroundColor: '#1976d2',
                        '&:hover': {
                          backgroundColor: '#1565c0',
                        },
                      }}
                    >
                      Continue
                    </Button>
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      ) : (
        <Box
          sx={{
            width: '100%',
            flex: 1,
            backgroundColor: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header Section */}
          <Box
            sx={{
              width: '100%',
              backgroundColor: '#f5f5f5',
              padding: '6px',
              borderBottom: '1px solid #e0e0e0',
              boxSizing: 'border-box',
            }}
          >
            {/* <Typography variant="h5" component="h1" sx={{
            color: '#333',
            fontWeight: 500,
            textAlign: 'center',
            marginBottom: '24px'
          }}>
            Children&apos;s Special Allowance
          </Typography> */}

            {/* Tabs Section */}
            <Tabs
              value={selectedTab}
              onChange={handleTabChange}
              sx={{
                '& .MuiTab-root': {
                  textTransform: 'none',
                  fontSize: '0.95rem',
                  fontWeight: 500,
                  minWidth: '10%',
                  color: '#666',
                },
                '& .Mui-selected': {
                  color: '#1976d2',
                },
              }}
            >
              <Tab label="Eligibility List" />
              <Tab label="Batch Requests" />
            </Tabs>
          </Box>

          {/* Content Section */}
          <Box
            sx={{
              padding: '24px 48px',
              backgroundColor: '#ffffff',
              flex: 1,
              overflow: 'auto',
            }}
          >
            {selectedTab === 0 && (
              <Box>
                {/* Eligibility List Header */}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 3,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 500 }}>
                      Eligibility List
                    </Typography>
                    <Tooltip
                      title="This list shows the master list of records from ICM. You can filter, search, and add children to batches from this view. Please click on the individual rows of the table for more details"
                      arrow
                    >
                      <IconButton size="small" sx={{ padding: 0.5 }}>
                        <InfoOutlinedIcon fontSize="small" sx={{ color: '#666' }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <TextField
                      size="small"
                      placeholder="Search"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Box component="span" sx={{ fontSize: '18px' }}>
                              🔍
                            </Box>
                          </InputAdornment>
                        ),
                      }}
                      sx={{ width: '200px' }}
                    />
                    <FormControl size="small" sx={{ minWidth: 250 }}>
                      <Select
                        value={preDefinedFilter}
                        onChange={(e) => handlePreDefinedFilterChange(e.target.value)}
                        displayEmpty
                      >
                        <MenuItem value="All Records">All Records</MenuItem>
                        <MenuItem value="Pending User review/action">
                          Pending User review/action
                        </MenuItem>
                        <MenuItem value="All children On Hold from CSA">
                          All children On Hold from CSA
                        </MenuItem>
                        <MenuItem value="Children In Pay">Children In Pay</MenuItem>
                        <MenuItem value="Children Out of Pay">Children Out of Pay</MenuItem>
                        <MenuItem value="CRA Refused CSA List">CRA Refused CSA List</MenuItem>
                        <MenuItem value="Children within a batch">Children within a batch</MenuItem>
                        <MenuItem value="Children over 18 years (never eligible)">
                          Children over 18 years (never eligible)
                        </MenuItem>
                      </Select>
                    </FormControl>
                    <Button
                      variant="contained"
                      size="small"
                      disabled={!canAddToBatch}
                      onClick={handleAddToBatch}
                      sx={{
                        textTransform: 'none',
                        '&.Mui-disabled': {
                          opacity: 0.5,
                          cursor: 'not-allowed',
                        },
                      }}
                    >
                      Add to Batch
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={!canHoldResume}
                      onClick={handleHoldResume}
                      sx={{
                        textTransform: 'none',
                        '&.Mui-disabled': {
                          opacity: 0.5,
                          cursor: 'not-allowed',
                        },
                      }}
                    >
                      Hold/Resume
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      disabled={!canUpdateEligibility}
                      onClick={handleCSAEligible}
                      sx={{
                        textTransform: 'none',
                        backgroundColor: canUpdateEligibility ? '#1976d2' : undefined,
                        '&.Mui-disabled': {
                          opacity: 0.5,
                          cursor: 'not-allowed',
                        },
                      }}
                    >
                      CSA Eligible
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      disabled={!canUpdateNotEligible}
                      onClick={handleCSANotEligible}
                      sx={{
                        textTransform: 'none',
                        backgroundColor: canUpdateNotEligible ? '#d32f2f' : undefined,
                        '&.Mui-disabled': {
                          opacity: 0.5,
                          cursor: 'not-allowed',
                        },
                      }}
                    >
                      CSA Not Eligible
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      disabled={!canUpdateOver18}
                      onClick={handleChildOver18}
                      sx={{
                        textTransform: 'none',
                        backgroundColor: canUpdateOver18 ? '#ff9800' : undefined,
                        '&.Mui-disabled': {
                          opacity: 0.5,
                          cursor: 'not-allowed',
                        },
                      }}
                    >
                      Child Over 18
                    </Button>
                  </Box>
                </Box>

                {/* Table */}
                <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            indeterminate={
                              selected.length > 0 &&
                              selected.length < filteredData.length &&
                              filteredData.some((row) => selected.includes(row.id))
                            }
                            checked={
                              filteredData.length > 0 &&
                              filteredData.every((row) => selected.includes(row.id))
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                // Select all rows on current page
                                setSelected((prev) => {
                                  const currentPageIds = filteredData.map((row) => row.id)
                                  const newSelected = [...prev]
                                  currentPageIds.forEach((id) => {
                                    if (!newSelected.includes(id)) {
                                      newSelected.push(id)
                                    }
                                  })
                                  return newSelected
                                })
                              } else {
                                // Deselect all rows on current page
                                setSelected((prev) => {
                                  const currentPageIds = filteredData.map((row) => row.id)
                                  return prev.filter((id) => !currentPageIds.includes(id))
                                })
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleSortClick(e, 'lastName')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Last Name
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'lastName')}
                              sx={{
                                padding: 0.5,
                                color:
                                  activeColumnFilter?.column === 'lastName' ||
                                  columnFilters.lastName?.length > 0
                                    ? '#1976d2'
                                    : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleSortClick(e, 'firstName')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              First Name
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'firstName')}
                              sx={{
                                padding: 0.5,
                                color:
                                  activeColumnFilter?.column === 'firstName' ||
                                  columnFilters.firstName?.length > 0
                                    ? '#1976d2'
                                    : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleSortClick(e, 'middleName')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Middle Name
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'middleName')}
                              sx={{
                                padding: 0.5,
                                color:
                                  activeColumnFilter?.column === 'middleName' ||
                                  columnFilters.middleName?.length > 0
                                    ? '#1976d2'
                                    : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleSortClick(e, 'dob')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Date Of Birth
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'dob')}
                              sx={{
                                padding: 0.5,
                                color:
                                  activeColumnFilter?.column === 'dob' ||
                                  columnFilters.dob?.length > 0
                                    ? '#1976d2'
                                    : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleSortClick(e, 'din')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              DIN
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'din')}
                              sx={{
                                padding: 0.5,
                                color:
                                  activeColumnFilter?.column === 'din' ||
                                  columnFilters.din?.length > 0
                                    ? '#1976d2'
                                    : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleSortClick(e, 'csaStatus')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              CSA Status
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'csaStatus')}
                              sx={{
                                padding: 0.5,
                                color:
                                  activeColumnFilter?.column === 'csaStatus' ||
                                  columnFilters.csaStatus?.length > 0
                                    ? '#1976d2'
                                    : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleSortClick(e, 'statusEffective')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Status Effective Date
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'statusEffective')}
                              sx={{
                                padding: 0.5,
                                color:
                                  activeColumnFilter?.column === 'statusEffective' ||
                                  columnFilters.statusEffective?.length > 0
                                    ? '#1976d2'
                                    : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleSortClick(e, 'caseNumber')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Case Number
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'caseNumber')}
                              sx={{
                                padding: 0.5,
                                color:
                                  activeColumnFilter?.column === 'caseNumber' ||
                                  columnFilters.caseNumber?.length > 0
                                    ? '#1976d2'
                                    : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleSortClick(e, 'caseStatus')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Case Status
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'caseStatus')}
                              sx={{
                                padding: 0.5,
                                color:
                                  activeColumnFilter?.column === 'caseStatus' ||
                                  columnFilters.caseStatus?.length > 0
                                    ? '#1976d2'
                                    : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleSortClick(e, 'legacyFile')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Legacy File No.
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'legacyFile')}
                              sx={{
                                padding: 0.5,
                                color:
                                  activeColumnFilter?.column === 'legacyFile' ||
                                  columnFilters.legacyFile?.length > 0
                                    ? '#1976d2'
                                    : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleSortClick(e, 'cgwrks3')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Set on Hold By
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'cgwrks3')}
                              sx={{
                                padding: 0.5,
                                color:
                                  activeColumnFilter?.column === 'cgwrks3' ||
                                  columnFilters.cgwrks3?.length > 0
                                    ? '#1976d2'
                                    : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleSortClick(e, 'lastUpdated')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Last Updated
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'lastUpdated')}
                              sx={{
                                padding: 0.5,
                                color:
                                  activeColumnFilter?.column === 'lastUpdated' ||
                                  columnFilters.lastUpdated?.length > 0
                                    ? '#1976d2'
                                    : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleSortClick(e, 'lastUpdatedBy')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Last Updated By
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'lastUpdatedBy')}
                              sx={{
                                padding: 0.5,
                                color:
                                  activeColumnFilter?.column === 'lastUpdatedBy' ||
                                  columnFilters.lastUpdatedBy?.length > 0
                                    ? '#1976d2'
                                    : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredData.map((row) => (
                        <TableRow
                          key={row.id}
                          hover
                          onClick={() => handleContactClick(row.id)}
                          sx={{
                            '&:hover': { backgroundColor: '#f9f9f9' },
                            cursor: 'pointer',
                            backgroundColor: selectedChild === row.id ? '#e0e0e0' : 'inherit',
                          }}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={selected.includes(row.id)}
                              onChange={(e) => {
                                e.stopPropagation()
                                setSelected((prev) =>
                                  prev.includes(row.id)
                                    ? prev.filter((id) => id !== row.id)
                                    : [...prev, row.id],
                                )
                              }}
                            />
                          </TableCell>
                          <TableCell>{row.lastName}</TableCell>
                          <TableCell>{row.firstName}</TableCell>
                          <TableCell>{row.middleName}</TableCell>
                          <TableCell>{row.dob}</TableCell>
                          <TableCell>{row.din}</TableCell>
                          <TableCell>{row.csaStatus}</TableCell>
                          <TableCell>{row.statusEffective}</TableCell>
                          <TableCell>{row.caseNumber}</TableCell>
                          <TableCell>{row.caseStatus}</TableCell>
                          <TableCell>{row.legacyFile}</TableCell>
                          <TableCell>{row.cgwrks3 || ''}</TableCell>
                          <TableCell>{row.lastUpdated}</TableCell>
                          <TableCell>{row.lastUpdatedBy}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Pagination - Show when API-based filters are selected */}
                {[
                  'All Records',
                  'Pending User review/action',
                  'All children On Hold from CSA',
                  'Children In Pay',
                  'Children Out of Pay',
                  'CRA Refused CSA List',
                  'Children within a batch',
                  'Children over 18 years (never eligible)',
                ].includes(preDefinedFilter) && (
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mt: 2,
                      px: 2,
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      {loadingContacts
                        ? 'Loading...'
                        : `Showing ${contacts.length} of ${totalRecords} records`}
                    </Typography>
                    <Pagination
                      count={totalPages}
                      page={currentPage}
                      onChange={handlePageChange}
                      color="primary"
                      showFirstButton
                      showLastButton
                    />
                  </Box>
                )}

                {/* Error message */}
                {contactsError && preDefinedFilter === 'All Records' && (
                  <Box sx={{ mt: 2, p: 2, backgroundColor: '#ffebee', borderRadius: 1 }}>
                    <Typography variant="body2" color="error">
                      {contactsError}
                    </Typography>
                  </Box>
                )}

                {/* Filter Menu */}
                <Menu
                  anchorEl={filterAnchor.element}
                  open={Boolean(filterAnchor.element)}
                  onClose={handleFilterClose}
                  PaperProps={{
                    sx: {
                      maxHeight: 400,
                      width: 250,
                    },
                  }}
                >
                  <Box sx={{ p: 2 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 1,
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Filter by {filterAnchor.column}
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => {
                          clearColumnFilter(filterAnchor.column)
                          handleFilterClose()
                        }}
                        sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                      >
                        Clear
                      </Button>
                    </Box>
                    {/* Search bar for filtering items */}
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Search"
                      value={filterSearchTerm}
                      onChange={(e) => setFilterSearchTerm(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Box component="span" sx={{ fontSize: '18px' }}>
                              🔍
                            </Box>
                          </InputAdornment>
                        ),
                      }}
                      sx={{ mb: 1 }}
                    />
                  </Box>
                </Menu>

                {/* Sort Menu */}
                <Menu
                  anchorEl={sortAnchor.element}
                  open={Boolean(sortAnchor.element)}
                  onClose={handleSortClose}
                  PaperProps={{
                    sx: {
                      width: 200,
                    },
                  }}
                >
                  <MenuItem onClick={() => handleSort(sortAnchor.column, 'asc')} sx={{ gap: 1.5 }}>
                    <ArrowUpwardIcon fontSize="small" />
                    <Typography variant="body2">Sort Ascending</Typography>
                  </MenuItem>
                  <MenuItem onClick={() => handleSort(sortAnchor.column, 'desc')} sx={{ gap: 1.5 }}>
                    <ArrowDownwardIcon fontSize="small" />
                    <Typography variant="body2">Sort Descending</Typography>
                  </MenuItem>
                </Menu>

                {/* Batch History Filter Menu */}
                <Menu
                  anchorEl={batchHistoryFilterAnchor.element}
                  open={Boolean(batchHistoryFilterAnchor.element)}
                  onClose={handleBatchHistoryFilterClose}
                  PaperProps={{
                    sx: {
                      maxHeight: 400,
                      width: 250,
                    },
                  }}
                >
                  <Box sx={{ p: 2 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 1,
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Filter by {batchHistoryFilterAnchor.column}
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => {
                          clearBatchHistoryColumnFilter(batchHistoryFilterAnchor.column)
                          handleBatchHistoryFilterClose()
                        }}
                        sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                      >
                        Clear
                      </Button>
                    </Box>
                    {/* Search bar for filtering items */}
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Search"
                      value={batchHistoryFilterSearchTerm}
                      onChange={(e) => setBatchHistoryFilterSearchTerm(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Box component="span" sx={{ fontSize: '18px' }}>
                              🔍
                            </Box>
                          </InputAdornment>
                        ),
                      }}
                      sx={{ mb: 1 }}
                    />
                    <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                      {batchHistoryFilterAnchor.column &&
                        getBatchHistoryUniqueValues(batchHistoryFilterAnchor.column)
                          .sort()
                          .filter((value) =>
                            String(value)
                              .toLowerCase()
                              .includes(batchHistoryFilterSearchTerm.toLowerCase()),
                          )
                          .map((value) => (
                            <Box
                              key={String(value)}
                              sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}
                            >
                              <Checkbox
                                size="small"
                                checked={
                                  batchHistoryColumnFilters[
                                    batchHistoryFilterAnchor.column
                                  ]?.includes(String(value)) || false
                                }
                                onChange={() =>
                                  handleBatchHistoryFilterChange(
                                    batchHistoryFilterAnchor.column,
                                    String(value),
                                  )
                                }
                              />
                              <Typography variant="body2">{String(value)}</Typography>
                            </Box>
                          ))}
                    </Box>
                  </Box>
                </Menu>

                {/* Details Section */}
                {selectedChild !== null && (
                  <Box sx={{ mt: 3 }}>
                    <Paper sx={{ p: 3 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          mb: 3,
                          borderBottom: '1px solid #e0e0e0',
                          pb: 2,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="h6" sx={{ fontWeight: 500 }}>
                            Details
                          </Typography>
                          <Tooltip
                            title="Detailed information about the selected child including basic info, case details, placement information, and service provider details."
                            arrow
                          >
                            <IconButton size="small" sx={{ padding: 0.5 }}>
                              <InfoOutlinedIcon fontSize="small" sx={{ color: '#666' }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                        <Button
                          variant="text"
                          size="small"
                          onClick={() => setSelectedChild(null)}
                          sx={{ textTransform: 'none', color: '#666' }}
                        >
                          Close
                        </Button>
                      </Box>

                      {(() => {
                        const childData = filteredData.find((child) => child.id === selectedChild)
                        if (!childData) return null

                        return (
                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(4, 1fr)',
                              gap: 3,
                            }}
                          >
                            {/* Child Basic Info Section */}
                            <Box>
                              <Typography
                                variant="subtitle2"
                                sx={{ fontWeight: 600, mb: 2, color: '#333' }}
                              >
                                Child Basic Info
                              </Typography>
                              <Box
                                sx={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 1.5,
                                  backgroundColor: '#f9f9f9',
                                  p: 2,
                                  borderRadius: 1,
                                }}
                              >
                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Child/Youth Name
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {[childData.firstName, childData.middleName, childData.lastName]
                                      .filter(Boolean)
                                      .join(' ') || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Gender
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.gender || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Person ID ICM
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.personIdIcm || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Person ID MIS
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.personIdMis || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    DIN
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.din || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    AKA Last Name
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.akaLastName || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    AKA First Name
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.akaFirstName || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Birth Place
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {[
                                      childData.birthCity,
                                      childData.birthProvince,
                                      childData.birthCountry,
                                    ]
                                      .filter(Boolean)
                                      .join(', ') || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Age
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.age || '-'}
                                  </Typography>
                                </Box>
                              </Box>
                            </Box>

                            {/* Case Details Section */}
                            <Box>
                              <Typography
                                variant="subtitle2"
                                sx={{ fontWeight: 600, mb: 2, color: '#333' }}
                              >
                                Case Details
                              </Typography>
                              <Box
                                sx={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 1.5,
                                  backgroundColor: '#f9f9f9',
                                  p: 2,
                                  borderRadius: 1,
                                }}
                              >
                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Case Status
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.caseStatus || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Case No.
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      color: '#1976d2',
                                      cursor: 'pointer',
                                      textAlign: 'right',
                                    }}
                                  >
                                    {childData.caseNumber || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Case Type
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.caseType || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Caseload
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.caseLoad || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Legacy File No.
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.legacyFile || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Service Office
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      color: '#1976d2',
                                      cursor: 'pointer',
                                      textAlign: 'right',
                                    }}
                                  >
                                    {childData.serviceOffice || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Assigned to
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.assignedTo || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Legal Status Code
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.effectiveLegalStatus || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Effective Date
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.effectiveDate || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Expiry Date
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.expiryDate || '-'}
                                  </Typography>
                                </Box>
                              </Box>
                            </Box>

                            {/* Placement/Service Info Section */}
                            <Box>
                              <Typography
                                variant="subtitle2"
                                sx={{ fontWeight: 600, mb: 2, color: '#333' }}
                              >
                                Placement/Service Info
                              </Typography>
                              <Box
                                sx={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 1.5,
                                  backgroundColor: '#f9f9f9',
                                  p: 2,
                                  borderRadius: 1,
                                }}
                              >
                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Placement/Location No.
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.placementLocation || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Type
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.locationType || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Sub-type
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.locationSubType || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Status
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.placementStatus || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Actual Start Date
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.actualStartDate || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Actual End Date
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.actualEndDate || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Paid/Unpaid
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.paidUnpaid || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Source
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.sourcePlacement ? (
                                      <Typography
                                        component="span"
                                        sx={{
                                          backgroundColor: '#e3f2fd',
                                          color: '#1976d2',
                                          px: 1,
                                          py: 0.5,
                                          borderRadius: 1,
                                          fontSize: '0.75rem',
                                        }}
                                      >
                                        {childData.sourcePlacement}
                                      </Typography>
                                    ) : (
                                      '-'
                                    )}
                                  </Typography>
                                </Box>
                              </Box>
                            </Box>

                            {/* Service Provider and Agreement Details Section */}
                            <Box>
                              <Typography
                                variant="subtitle2"
                                sx={{ fontWeight: 600, mb: 2, color: '#333' }}
                              >
                                Service Provider and Agreement Details
                              </Typography>
                              <Box
                                sx={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 1.5,
                                  backgroundColor: '#f9f9f9',
                                  p: 2,
                                  borderRadius: 1,
                                }}
                              >
                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Agreement Status
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.agreementStatus || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Provider Name
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.serviceProviderName || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Provider ID
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.providerId || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Place of Service
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.placeOfServiceName || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Source
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.sourceAgreement || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Agreement Type
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.agreementType || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Start Date
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.agreementStartDate || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    End Date
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.agreementEndDate || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Termination Date
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.terminationDate || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    MCFD Contract No.
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.mcfdContract || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', flexShrink: 0 }}
                                  >
                                    Product
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textAlign: 'right' }}
                                  >
                                    {childData.product || '-'}
                                  </Typography>
                                </Box>
                              </Box>
                            </Box>
                          </Box>
                        )
                      })()}
                    </Paper>
                  </Box>
                )}

                {/* Batch History Section */}
                {selectedChild !== null && (
                  <Box sx={{ mt: 3 }}>
                    <Paper sx={{ p: 3 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          mb: 3,
                          borderBottom: '1px solid #e0e0e0',
                          pb: 2,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="h6" sx={{ fontWeight: 500 }}>
                            Batch History
                          </Typography>
                          <Tooltip
                            title="Complete history of all batch submissions for the selected child, including batch status and transaction types."
                            arrow
                          >
                            <IconButton size="small" sx={{ padding: 0.5 }}>
                              <InfoOutlinedIcon fontSize="small" sx={{ color: '#666' }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <TextField
                            size="small"
                            placeholder="Search batch history..."
                            value={batchHistorySearchTerm}
                            onChange={(e) => setBatchHistorySearchTerm(e.target.value)}
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <Box component="span" sx={{ fontSize: '18px' }}>
                                    🔍
                                  </Box>
                                </InputAdornment>
                              ),
                              endAdornment: batchHistorySearchTerm && (
                                <InputAdornment position="end">
                                  <IconButton
                                    size="small"
                                    onClick={() => setBatchHistorySearchTerm('')}
                                    edge="end"
                                  >
                                    <CloseIcon fontSize="small" />
                                  </IconButton>
                                </InputAdornment>
                              ),
                            }}
                            sx={{ width: '300px' }}
                          />
                          <Button
                            variant="contained"
                            size="small"
                            disabled={!canRemoveFromBatch}
                            onClick={handleRemoveFromBatch}
                            sx={{
                              textTransform: 'none',
                              backgroundColor: '#1976d2',
                              '&:hover': {
                                backgroundColor: '#1565c0',
                              },
                              '&.Mui-disabled': {
                                backgroundColor: '#e0e0e0',
                                color: '#9e9e9e',
                              },
                            }}
                          >
                            Remove from Batch
                          </Button>
                        </Box>
                      </Box>

                      {/* Batch History Table */}
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                              <TableCell sx={{ fontWeight: 600 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  Batch ID
                                  <IconButton
                                    size="small"
                                    onClick={(e) => handleBatchHistoryFilterClick(e, 'batchId')}
                                    sx={{
                                      padding: 0.5,
                                      color:
                                        batchHistoryColumnFilters.batchId?.length > 0
                                          ? '#1976d2'
                                          : '#666',
                                    }}
                                  >
                                    <FilterListIcon fontSize="small" />
                                  </IconButton>
                                </Box>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  Created Date
                                  <IconButton
                                    size="small"
                                    onClick={(e) => handleBatchHistoryFilterClick(e, 'createdDate')}
                                    sx={{
                                      padding: 0.5,
                                      color:
                                        batchHistoryColumnFilters.createdDate?.length > 0
                                          ? '#1976d2'
                                          : '#666',
                                    }}
                                  >
                                    <FilterListIcon fontSize="small" />
                                  </IconButton>
                                </Box>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  Batch Date
                                  <IconButton
                                    size="small"
                                    onClick={(e) => handleBatchHistoryFilterClick(e, 'batchDate')}
                                    sx={{
                                      padding: 0.5,
                                      color:
                                        batchHistoryColumnFilters.batchDate?.length > 0
                                          ? '#1976d2'
                                          : '#666',
                                    }}
                                  >
                                    <FilterListIcon fontSize="small" />
                                  </IconButton>
                                </Box>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  Status
                                  <IconButton
                                    size="small"
                                    onClick={(e) => handleBatchHistoryFilterClick(e, 'status')}
                                    sx={{
                                      padding: 0.5,
                                      color:
                                        batchHistoryColumnFilters.status?.length > 0
                                          ? '#1976d2'
                                          : '#666',
                                    }}
                                  >
                                    <FilterListIcon fontSize="small" />
                                  </IconButton>
                                </Box>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  Transaction Type
                                  <IconButton
                                    size="small"
                                    onClick={(e) =>
                                      handleBatchHistoryFilterClick(e, 'transactionType')
                                    }
                                    sx={{
                                      padding: 0.5,
                                      color:
                                        batchHistoryColumnFilters.transactionType?.length > 0
                                          ? '#1976d2'
                                          : '#666',
                                    }}
                                  >
                                    <FilterListIcon fontSize="small" />
                                  </IconButton>
                                </Box>
                              </TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {loadingBatchHistory ? (
                              <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                  <Typography variant="body2" color="text.secondary">
                                    Loading batch history...
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ) : filteredBatchHistory.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                  <Typography variant="body2" color="text.secondary">
                                    {selectedChild
                                      ? 'No batch history found for this contact'
                                      : 'Select a contact to view batch history'}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ) : (
                              filteredBatchHistory.map((row) => (
                                <TableRow
                                  key={row.id}
                                  hover
                                  onClick={() => handleBatchHistoryRowClick(row.id)}
                                  selected={selectedBatchHistoryId === row.id}
                                  sx={{
                                    '&:hover': { backgroundColor: '#f9f9f9' },
                                    cursor: 'pointer',
                                    '&.Mui-selected': {
                                      backgroundColor: '#e3f2fd !important',
                                    },
                                    '&.Mui-selected:hover': {
                                      backgroundColor: '#bbdefb !important',
                                    },
                                  }}
                                >
                                  <TableCell sx={{ color: '#1976d2', cursor: 'pointer' }}>
                                    {row.batchId}
                                  </TableCell>
                                  <TableCell>{row.createdDate}</TableCell>
                                  <TableCell>{row.batchDate}</TableCell>
                                  <TableCell>
                                    {row.status === 'Pending' && (
                                      <Box
                                        component="span"
                                        sx={{
                                          backgroundColor: '#fce4ec',
                                          color: '#c2185b',
                                          px: 1.5,
                                          py: 0.5,
                                          borderRadius: 1,
                                          fontSize: '0.75rem',
                                          fontWeight: 500,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}
                                      >
                                        Pending
                                      </Box>
                                    )}
                                    {row.status !== 'Pending' && row.status}
                                  </TableCell>
                                  <TableCell>{row.transactionType}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Paper>
                  </Box>
                )}
              </Box>
            )}
            {selectedTab === 1 && (
              <Box>
                {/* Batch Requests Header */}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 3,
                  }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 500 }}>
                    Batch Requests
                  </Typography>
                  <TextField
                    size="small"
                    placeholder="Search batch requests..."
                    value={batchRequestsSearchTerm}
                    onChange={(e) => setBatchRequestsSearchTerm(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Box component="span" sx={{ fontSize: '18px' }}>
                            🔍
                          </Box>
                        </InputAdornment>
                      ),
                      endAdornment: batchRequestsSearchTerm && (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            onClick={() => setBatchRequestsSearchTerm('')}
                            edge="end"
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                    sx={{ width: '300px' }}
                  />
                </Box>

                {/* Batch Requests Table */}
                <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            Batch ID
                            <IconButton
                              size="small"
                              onClick={(e) => handleBatchRequestsFilterClick(e, 'batchId')}
                              sx={{
                                padding: 0.5,
                                color:
                                  batchRequestsColumnFilters.batchId?.length > 0
                                    ? '#1976d2'
                                    : '#666',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            Batch Date
                            <IconButton
                              size="small"
                              onClick={(e) => handleBatchRequestsFilterClick(e, 'batchDate')}
                              sx={{
                                padding: 0.5,
                                color:
                                  batchRequestsColumnFilters.batchDate?.length > 0
                                    ? '#1976d2'
                                    : '#666',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            Status
                            <IconButton
                              size="small"
                              onClick={(e) => handleBatchRequestsFilterClick(e, 'status')}
                              sx={{
                                padding: 0.5,
                                color:
                                  batchRequestsColumnFilters.status?.length > 0
                                    ? '#1976d2'
                                    : '#666',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            Record Count
                            <IconButton
                              size="small"
                              onClick={(e) => handleBatchRequestsFilterClick(e, 'recordCount')}
                              sx={{
                                padding: 0.5,
                                color:
                                  batchRequestsColumnFilters.recordCount?.length > 0
                                    ? '#1976d2'
                                    : '#666',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            Created Date
                            <IconButton
                              size="small"
                              onClick={(e) => handleBatchRequestsFilterClick(e, 'createdDate')}
                              sx={{
                                padding: 0.5,
                                color:
                                  batchRequestsColumnFilters.createdDate?.length > 0
                                    ? '#1976d2'
                                    : '#666',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            System Comments
                            <IconButton
                              size="small"
                              onClick={(e) => handleBatchRequestsFilterClick(e, 'systemComments')}
                              sx={{
                                padding: 0.5,
                                color:
                                  batchRequestsColumnFilters.systemComments?.length > 0
                                    ? '#1976d2'
                                    : '#666',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {loadingBatches ? (
                        <TableRow>
                          <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                            <Typography variant="body2" color="text.secondary">
                              Loading batch requests...
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : filteredBatchRequests.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                            <Typography variant="body2" color="text.secondary">
                              No batch requests found
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredBatchRequests.map((row) => (
                          <TableRow
                            key={row.id}
                            hover
                            onClick={() => handleBatchClick(row.id)}
                            sx={{
                              '&:hover': { backgroundColor: '#f9f9f9' },
                              cursor: 'pointer',
                              backgroundColor: selectedBatch === row.id ? '#e3f2fd' : 'inherit',
                            }}
                          >
                            <TableCell sx={{ color: '#1976d2', cursor: 'pointer' }}>
                              {row.batchId}
                            </TableCell>
                            <TableCell>{row.batchDate}</TableCell>
                            <TableCell>{row.status}</TableCell>
                            <TableCell>{row.recordCount}</TableCell>
                            <TableCell>{row.createdDate}</TableCell>
                            <TableCell>{row.systemComments}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Batch Details Section */}
                <Box sx={{ mt: 4 }}>
                  {/* Batch Details Header */}
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 3,
                    }}
                  >
                    <Typography variant="h6" sx={{ fontWeight: 500 }}>
                      Batch Details
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <TextField
                        size="small"
                        placeholder="Search batch details..."
                        value={batchDetailsSearchTerm}
                        onChange={(e) => setBatchDetailsSearchTerm(e.target.value)}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <Box component="span" sx={{ fontSize: '18px' }}>
                                🔍
                              </Box>
                            </InputAdornment>
                          ),
                          endAdornment: batchDetailsSearchTerm && (
                            <InputAdornment position="end">
                              <IconButton
                                size="small"
                                onClick={() => setBatchDetailsSearchTerm('')}
                                edge="end"
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                        sx={{ width: '300px' }}
                      />
                      <Button
                        variant="contained"
                        size="small"
                        disabled={!canRemoveFromBatchDetails}
                        onClick={handleRemoveFromBatchDetails}
                        sx={{
                          backgroundColor: '#d32f2f',
                          '&:hover': { backgroundColor: '#c62828' },
                          '&.Mui-disabled': {
                            backgroundColor: '#e0e0e0',
                            color: '#9e9e9e',
                          },
                        }}
                      >
                        Remove from Batch
                      </Button>
                    </Box>
                  </Box>

                  {/* Batch Details Table */}
                  <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                          <TableCell padding="checkbox">
                            <Checkbox
                              indeterminate={
                                selectedBatchDetails.length > 0 &&
                                selectedBatchDetails.length < filteredBatchDetails.length
                              }
                              checked={
                                filteredBatchDetails.length > 0 &&
                                selectedBatchDetails.length === filteredBatchDetails.length
                              }
                              onChange={() => {
                                if (selectedBatchDetails.length === filteredBatchDetails.length) {
                                  setSelectedBatchDetails([])
                                } else {
                                  setSelectedBatchDetails(filteredBatchDetails.map((row) => row.id))
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              Last Name
                              <IconButton
                                size="small"
                                onClick={(e) => handleBatchDetailsFilterClick(e, 'lastName')}
                                sx={{
                                  padding: 0.5,
                                  color:
                                    batchDetailsColumnFilters.lastName?.length > 0
                                      ? '#1976d2'
                                      : '#666',
                                }}
                              >
                                <FilterListIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              Middle Name
                              <IconButton
                                size="small"
                                onClick={(e) => handleBatchDetailsFilterClick(e, 'middleName')}
                                sx={{
                                  padding: 0.5,
                                  color:
                                    batchDetailsColumnFilters.middleName?.length > 0
                                      ? '#1976d2'
                                      : '#666',
                                }}
                              >
                                <FilterListIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              Given Name
                              <IconButton
                                size="small"
                                onClick={(e) => handleBatchDetailsFilterClick(e, 'givenName')}
                                sx={{
                                  padding: 0.5,
                                  color:
                                    batchDetailsColumnFilters.givenName?.length > 0
                                      ? '#1976d2'
                                      : '#666',
                                }}
                              >
                                <FilterListIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              Transaction Type
                              <IconButton
                                size="small"
                                onClick={(e) => handleBatchDetailsFilterClick(e, 'transactionType')}
                                sx={{
                                  padding: 0.5,
                                  color:
                                    batchDetailsColumnFilters.transactionType?.length > 0
                                      ? '#1976d2'
                                      : '#666',
                                }}
                              >
                                <FilterListIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              Status
                              <IconButton
                                size="small"
                                onClick={(e) => handleBatchDetailsFilterClick(e, 'status')}
                                sx={{
                                  padding: 0.5,
                                  color:
                                    batchDetailsColumnFilters.status?.length > 0
                                      ? '#1976d2'
                                      : '#666',
                                }}
                              >
                                <FilterListIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              System Comments
                              <IconButton
                                size="small"
                                onClick={(e) => handleBatchDetailsFilterClick(e, 'systemComments')}
                                sx={{
                                  padding: 0.5,
                                  color:
                                    batchDetailsColumnFilters.systemComments?.length > 0
                                      ? '#1976d2'
                                      : '#666',
                                }}
                              >
                                <FilterListIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {loadingBatchDetails ? (
                          <TableRow>
                            <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                              <Typography variant="body2" color="text.secondary">
                                Loading batch details...
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ) : filteredBatchDetails.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                              <Typography variant="body2" color="text.secondary">
                                {selectedBatch
                                  ? 'No contacts found in this batch'
                                  : 'Select a batch to view details'}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredBatchDetails.map((row) => (
                            <TableRow
                              key={row.id}
                              hover
                              sx={{ '&:hover': { backgroundColor: '#f9f9f9' } }}
                            >
                              <TableCell padding="checkbox">
                                <Checkbox
                                  checked={selectedBatchDetails.includes(row.id)}
                                  onChange={() => {
                                    setSelectedBatchDetails((prev) =>
                                      prev.includes(row.id)
                                        ? prev.filter((id) => id !== row.id)
                                        : [...prev, row.id],
                                    )
                                  }}
                                />
                              </TableCell>
                              <TableCell>{row.lastName}</TableCell>
                              <TableCell>{row.middleName}</TableCell>
                              <TableCell>{row.givenName}</TableCell>
                              <TableCell>{row.transactionType}</TableCell>
                              <TableCell>{row.status}</TableCell>
                              <TableCell>{row.systemComments}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Box>
            )}
          </Box>

          {/* Filter Menus - Outside tabs so they're always available */}
          {/* Batch History Filter Menu */}
          <Menu
            anchorEl={batchHistoryFilterAnchor.element}
            open={Boolean(batchHistoryFilterAnchor.element)}
            onClose={handleBatchHistoryFilterClose}
            PaperProps={{
              sx: {
                maxHeight: 400,
                width: 250,
              },
            }}
          >
            <Box sx={{ p: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 1,
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Filter by {batchHistoryFilterAnchor.column}
                </Typography>
                <Button
                  size="small"
                  onClick={() => {
                    clearBatchHistoryColumnFilter(batchHistoryFilterAnchor.column)
                    handleBatchHistoryFilterClose()
                  }}
                  sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                >
                  Clear
                </Button>
              </Box>
              {/* Search bar for filtering items */}
              <TextField
                size="small"
                fullWidth
                placeholder="Search"
                value={batchHistoryFilterSearchTerm}
                onChange={(e) => setBatchHistoryFilterSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Box component="span" sx={{ fontSize: '18px' }}>
                        🔍
                      </Box>
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 1 }}
              />
              <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                {batchHistoryFilterAnchor.column &&
                  getBatchHistoryUniqueValues(batchHistoryFilterAnchor.column)
                    .sort()
                    .filter((value) =>
                      String(value)
                        .toLowerCase()
                        .includes(batchHistoryFilterSearchTerm.toLowerCase()),
                    )
                    .map((value) => (
                      <Box
                        key={String(value)}
                        sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}
                      >
                        <Checkbox
                          size="small"
                          checked={
                            batchHistoryColumnFilters[batchHistoryFilterAnchor.column]?.includes(
                              String(value),
                            ) || false
                          }
                          onChange={() =>
                            handleBatchHistoryFilterChange(
                              batchHistoryFilterAnchor.column,
                              String(value),
                            )
                          }
                        />
                        <Typography variant="body2">{String(value)}</Typography>
                      </Box>
                    ))}
              </Box>
            </Box>
          </Menu>

          {/* Batch Requests Filter Menu */}
          <Menu
            anchorEl={batchRequestsFilterAnchor.element}
            open={Boolean(batchRequestsFilterAnchor.element)}
            onClose={handleBatchRequestsFilterClose}
            PaperProps={{
              sx: {
                maxHeight: 400,
                width: 250,
              },
            }}
          >
            <Box sx={{ p: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 1,
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Filter by {batchRequestsFilterAnchor.column}
                </Typography>
                <Button
                  size="small"
                  onClick={() => {
                    clearBatchRequestsColumnFilter(batchRequestsFilterAnchor.column)
                    handleBatchRequestsFilterClose()
                  }}
                  sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                >
                  Clear
                </Button>
              </Box>
              {/* Search bar for filtering items */}
              <TextField
                size="small"
                fullWidth
                placeholder="Search"
                value={batchRequestsFilterSearchTerm}
                onChange={(e) => setBatchRequestsFilterSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Box component="span" sx={{ fontSize: '18px' }}>
                        🔍
                      </Box>
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 1 }}
              />
              <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                {batchRequestsFilterAnchor.column &&
                  getBatchRequestsUniqueValues(batchRequestsFilterAnchor.column)
                    .sort()
                    .filter((value) =>
                      String(value)
                        .toLowerCase()
                        .includes(batchRequestsFilterSearchTerm.toLowerCase()),
                    )
                    .map((value) => (
                      <Box
                        key={String(value)}
                        sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}
                      >
                        <Checkbox
                          size="small"
                          checked={
                            batchRequestsColumnFilters[batchRequestsFilterAnchor.column]?.includes(
                              String(value),
                            ) || false
                          }
                          onChange={() =>
                            handleBatchRequestsFilterChange(
                              batchRequestsFilterAnchor.column,
                              String(value),
                            )
                          }
                        />
                        <Typography variant="body2">{String(value)}</Typography>
                      </Box>
                    ))}
              </Box>
            </Box>
          </Menu>

          {/* Batch Details Filter Menu */}
          <Menu
            anchorEl={batchDetailsFilterAnchor.element}
            open={Boolean(batchDetailsFilterAnchor.element)}
            onClose={handleBatchDetailsFilterClose}
            PaperProps={{
              sx: {
                maxHeight: 400,
                width: 250,
              },
            }}
          >
            <Box sx={{ p: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 1,
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Filter by {batchDetailsFilterAnchor.column}
                </Typography>
                <Button
                  size="small"
                  onClick={() => {
                    clearBatchDetailsColumnFilter(batchDetailsFilterAnchor.column)
                    handleBatchDetailsFilterClose()
                  }}
                  sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                >
                  Clear
                </Button>
              </Box>
              {/* Search bar for filtering items */}
              <TextField
                size="small"
                fullWidth
                placeholder="Search"
                value={batchDetailsFilterSearchTerm}
                onChange={(e) => setBatchDetailsFilterSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Box component="span" sx={{ fontSize: '18px' }}>
                        🔍
                      </Box>
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 1 }}
              />
              <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                {batchDetailsFilterAnchor.column &&
                  (() => {
                    // Get unique values only from currently selected batch
                    const values = currentBatchDetails.map(
                      (row) => row[batchDetailsFilterAnchor.column as keyof typeof row],
                    )
                    return Array.from(new Set(values))
                      .filter((v) => v !== undefined && v !== '')
                      .sort()
                      .filter((value) =>
                        String(value)
                          .toLowerCase()
                          .includes(batchDetailsFilterSearchTerm.toLowerCase()),
                      )
                      .map((value) => (
                        <Box
                          key={String(value)}
                          sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}
                        >
                          <Checkbox
                            size="small"
                            checked={
                              batchDetailsColumnFilters[batchDetailsFilterAnchor.column]?.includes(
                                String(value),
                              ) || false
                            }
                            onChange={() =>
                              handleBatchDetailsFilterChange(
                                batchDetailsFilterAnchor.column,
                                String(value),
                              )
                            }
                          />
                          <Typography variant="body2">{String(value)}</Typography>
                        </Box>
                      ))
                  })()}
              </Box>
            </Box>
          </Menu>
        </Box>
      )}

      {/* Footer - Always visible */}
      <Box
        sx={{
          width: '100%',
          backgroundColor: '#f5f5f5',
          borderTop: '1px solid #e0e0e0',
          padding: '16px 24px',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        <Typography variant="body2" sx={{ color: '#666', fontSize: '12px' }}>
          © 2026 Government of British Columbia.
        </Typography>
      </Box>

      {/* Snackbar for hold/resume feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default App
