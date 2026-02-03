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

// Sample data for the eligibility table
const eligibilityData = [
  {
    id: 1,
    firstName: 'John',
    middleName: '',
    lastName: 'Connor',
    gender: 'Man/Boy',
    dob: '2022-Jan-18',
    age: 4,
    din: '',
    csaStatus: 'Eligible',
    statusEffective: '2025-Jan-12',
    caseNumber: '1-135',
    caseStatus: 'Open',
    legacyFile: 'GA128182',
    lastUpdated: 'yyy-mmm-dd',
    lastUpdatedBy: 'SYSTEM',
  },
  {
    id: 2,
    firstName: 'Jane',
    middleName: '',
    lastName: 'Markus',
    gender: 'Woman/Girl',
    dob: '2018-May-15',
    age: 8,
    din: '12345',
    csaStatus: 'In Pay',
    statusEffective: '2024-Aug-05',
    caseNumber: '1-147',
    caseStatus: 'Open',
    legacyFile: 'GA61821',
    lastUpdated: 'yyy-mmm-dd',
    lastUpdatedBy: 'User IDIR',
  },
  {
    id: 3,
    firstName: 'Merry',
    middleName: '',
    lastName: 'Markus',
    gender: 'Woman/Girl',
    dob: '2018-May-15',
    age: 8,
    din: '14566',
    csaStatus: 'In Pay - Cancel...',
    statusEffective: '2024-May-11',
    caseNumber: '1-166',
    caseStatus: 'Open',
    legacyFile: 'GA798379',
    lastUpdated: 'yyy-mmm-dd',
    lastUpdatedBy: 'SYSTEM',
  },
  {
    id: 4,
    firstName: 'Jamie',
    middleName: '',
    lastName: 'Wilson',
    gender: 'Non Binary',
    dob: '2023-Sept-14',
    age: 2,
    din: '13131',
    csaStatus: 'Out of Pay',
    statusEffective: '2024-Dec-15',
    caseNumber: '1-139',
    caseStatus: 'Admin Reopen',
    legacyFile: 'GA73894',
    lastUpdated: 'yyy-mmm-dd',
    lastUpdatedBy: 'SYSTEM',
  },
  {
    id: 5,
    firstName: 'Mark',
    middleName: 'S',
    lastName: 'Grey',
    gender: 'Man/Boy',
    dob: '2022-Jan-13',
    age: 4,
    din: '44112',
    csaStatus: 'Batch Sent - A...',
    statusEffective: '2023-Feb-12',
    caseNumber: '1-118',
    caseStatus: 'Closed',
    legacyFile: 'GA686843',
    lastUpdated: 'yyy-mmm-dd',
    lastUpdatedBy: 'User IDIR',
  },
  {
    id: 6,
    firstName: 'Jackie',
    middleName: '',
    lastName: 'Hems',
    gender: 'Woman/Girl',
    dob: '2012-Nov-25',
    age: 13,
    din: '31123',
    csaStatus: 'On Hold',
    statusEffective: '2022-Dec-13',
    caseNumber: '1-118',
    caseStatus: 'Open',
    legacyFile: 'GA236816',
    cgwrks3: 'CGWRKS3',
    lastUpdated: 'yyy-mmm-dd',
    lastUpdatedBy: 'SYSTEM',
  },
  {
    id: 7,
    firstName: 'Brian',
    middleName: 'Kevin',
    lastName: 'Jo...',
    gender: 'Unknown',
    dob: '2012-Nov-25',
    age: 13,
    din: '81190',
    csaStatus: 'In Batch - Canc...',
    statusEffective: '2025-Oct-31',
    caseNumber: '1-183',
    caseStatus: 'Open',
    legacyFile: 'Placeholder fo...',
    lastUpdated: 'yyy-mmm-dd',
    lastUpdatedBy: 'SYSTEM',
  },
]

// Sample data for batch history (child-specific)
const childBatchHistory = [
  {
    id: 1,
    batchId: '1-567',
    createdDate: '2025-Nov-18',
    batchDate: '',
    status: 'Pending',
    transactionType: 'Cancellation',
  },
  {
    id: 2,
    batchId: '1-134',
    createdDate: '2025-Sept-17',
    batchDate: '2025-Sep-30',
    status: 'CRA Processed',
    transactionType: 'Application',
  },
  {
    id: 3,
    batchId: '1-156',
    createdDate: '2025-Mar-15',
    batchDate: '2025-Mar-16',
    status: 'CRA Processed',
    transactionType: 'Cancellation',
  },
  {
    id: 4,
    batchId: '1-165',
    createdDate: '2024-Apr-15',
    batchDate: '2024-Apr-21',
    status: 'Placeholder for text',
    transactionType: 'Application',
  },
]

function App() {
  // Use Keycloak authentication
  const { isAuthenticated: keycloakAuthenticated, isLoading, user, login, logout } = useAuth()

  // Log Keycloak authentication token (for testing in deployed version)
  console.log('=== KEYCLOAK AUTH TOKEN ===')
  console.log('Auth Token from localStorage:', localStorage.getItem('authToken'))
  console.log('Keycloak Authenticated:', keycloakAuthenticated)
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

  // User is authenticated if either Keycloak or mock login is active
  const isAuthenticated = keycloakAuthenticated || isLoggedIn

  const [selectedTab, setSelectedTab] = useState(0)
  const [selected, setSelected] = useState<number[]>([])
  const [selectedBatchDetails, setSelectedBatchDetails] = useState<number[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSearchTerm, setFilterSearchTerm] = useState('')
  const [isColumnFilterActive, setIsColumnFilterActive] = useState(false)
  const [selectedChild, setSelectedChild] = useState<number | null>(null)
  const [selectedBatch, setSelectedBatch] = useState<number>(1) // Default to first batch

  // Pre-defined filter state
  const [preDefinedFilter, setPreDefinedFilter] = useState('All Records')

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
      csaStatus: 'csaStatus',
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
  const getPreDefinedFilterConfig = useCallback((filterName: string): any => {
    if (filterName === 'Pending User review/action') {
      return [
        {
          OR: [
            { key: 'csaStatus', op: 'eq', value: 'On Hold' },
            { key: 'csaStatus', op: 'eq', value: 'Eligible - TBD' },
            { key: 'csaStatus', op: 'eq', value: 'Not Eligible - IP - TBD' },
            { key: 'csaStatus', op: 'eq', value: 'Eligible' },
            { key: 'csaStatus', op: 'eq', value: 'Not Eligible - In Pay' },
          ],
        },
      ]
    } else if (filterName === 'All children On Hold from CSA') {
      return [{ key: 'csaStatus', op: 'eq', value: 'on hold' }]
    } else if (filterName === 'Children In Pay') {
      return [{ key: 'csaStatus', op: 'eq', value: 'In Pay' }]
    } else if (filterName === 'Children Out of Pay') {
      return [
        {
          OR: [
            { key: 'csaStatus', op: 'eq', value: 'Not Eligible' },
            { key: 'csaStatus', op: 'eq', value: 'Out of Pay' },
          ],
        },
        { key: 'din', op: 'notblank', value: '' },
      ]
    } else if (filterName === 'CRA Refused CSA List') {
      return [
        {
          OR: [
            { key: 'csaStatus', op: 'eq', value: 'Application Refused - CRA' },
            { key: 'csaStatus', op: 'eq', value: 'Cancellation Refused - CRA' },
          ],
        },
      ]
    } else if (filterName === 'Children within a batch') {
      return [
        {
          OR: [
            { key: 'csaStatus', op: 'eq', value: 'In Batch - Application' },
            { key: 'csaStatus', op: 'eq', value: 'Batch Sent - Application' },
            { key: 'csaStatus', op: 'eq', value: 'In Batch - Cancellation' },
            { key: 'csaStatus', op: 'eq', value: 'Batch Sent - Cancellation' },
          ],
        },
      ]
    } else if (filterName === 'Children over 18 years (never eligible)') {
      return [{ key: 'csaStatus', op: 'eq', value: 'Over 18' }]
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
        if (preDefinedFilter === 'Pending User review/action') {
          // csaStatus = 'On Hold' OR 'Eligible - TBD' OR 'Not Eligible - IP - TBD' OR 'Eligible' OR 'Not Eligible - In Pay'
          filter = [
            {
              OR: [
                { key: 'csaStatus', op: 'eq', value: 'On Hold' },
                { key: 'csaStatus', op: 'eq', value: 'Eligible - TBD' },
                { key: 'csaStatus', op: 'eq', value: 'Not Eligible - IP - TBD' },
                { key: 'csaStatus', op: 'eq', value: 'Eligible' },
                { key: 'csaStatus', op: 'eq', value: 'Not Eligible - In Pay' },
              ],
            },
          ]
        } else if (preDefinedFilter === 'All children On Hold from CSA') {
          filter = [{ key: 'csaStatus', op: 'eq', value: 'on hold' }]
        } else if (preDefinedFilter === 'Children In Pay') {
          filter = [{ key: 'csaStatus', op: 'eq', value: 'In Pay' }]
        } else if (preDefinedFilter === 'Children Out of Pay') {
          // (csaStatus = 'Not Eligible' OR csaStatus = 'Out of Pay') AND din is not blank
          filter = [
            {
              OR: [
                { key: 'csaStatus', op: 'eq', value: 'Not Eligible' },
                { key: 'csaStatus', op: 'eq', value: 'Out of Pay' },
              ],
            },
            { key: 'din', op: 'notblank', value: '' },
          ]
        } else if (preDefinedFilter === 'CRA Refused CSA List') {
          // csaStatus = 'Application Refused - CRA' OR csaStatus = 'Cancellation Refused - CRA'
          filter = [
            {
              OR: [
                { key: 'csaStatus', op: 'eq', value: 'Application Refused - CRA' },
                { key: 'csaStatus', op: 'eq', value: 'Cancellation Refused - CRA' },
              ],
            },
          ]
        } else if (preDefinedFilter === 'Children within a batch') {
          // csaStatus = 'In Batch - Application' OR 'Batch Sent - Application' OR 'In Batch - Cancellation' OR 'Batch Sent - Cancellation'
          filter = [
            {
              OR: [
                { key: 'csaStatus', op: 'eq', value: 'In Batch - Application' },
                { key: 'csaStatus', op: 'eq', value: 'Batch Sent - Application' },
                { key: 'csaStatus', op: 'eq', value: 'In Batch - Cancellation' },
                { key: 'csaStatus', op: 'eq', value: 'Batch Sent - Cancellation' },
              ],
            },
          ]
        } else if (preDefinedFilter === 'Children over 18 years (never eligible)') {
          // csaStatus = 'Over 18'
          filter = [{ key: 'csaStatus', op: 'eq', value: 'Over 18' }]
        }

        const response = await getAllContacts(page, recordsPerPage, filter)
        setContacts(response.data)
        setTotalPages(response.totalPages)
        setTotalRecords(response.total)
        console.log('Fetched contacts:', response.data)
        console.log('Total records:', response.total)
        console.log('Applied filter:', filter)
      } catch (error) {
        console.error('Failed to fetch contacts:', error)
        setContactsError('Failed to load contacts. Please try again.')
        setContacts([])
      } finally {
        setLoadingContacts(false)
      }
    },
    [preDefinedFilter, recordsPerPage],
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
        // Use like operator for text search (Prisma 'contains' doesn't need % wildcards)
        const columnFilter = [{ key: backendField, op: 'like', value: query }]

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
    if (apiFilters.includes(preDefinedFilter) && isAuthenticated && !isSearchActive) {
      fetchContacts(currentPage)
    }
  }, [preDefinedFilter, currentPage, isAuthenticated, isSearchActive, fetchContacts])

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
      } else if (searchTerm.trim().length === 0) {
        // If search is cleared, go back to regular filter
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
    fetchContacts,
    performFullTextSearch,
  ])

  // Column filter search effect - triggers when filterSearchTerm has 3+ characters
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

    // Debounce column search - wait 500ms after user stops typing
    const columnSearchTimer = setTimeout(() => {
      if (filterSearchTerm.trim().length >= 3) {
        performColumnFilterSearch(filterAnchor.column, filterSearchTerm.trim(), currentPage)
      } else if (filterSearchTerm.trim().length === 0 && isColumnFilterActive) {
        // If column search is cleared, go back to regular filter
        setIsColumnFilterActive(false)
        fetchContacts(currentPage)
      }
    }, 500)

    return () => clearTimeout(columnSearchTimer)
  }, [
    filterSearchTerm,
    filterAnchor.column,
    currentPage,
    preDefinedFilter,
    isAuthenticated,
    isColumnFilterActive,
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
  }

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue)
  }

  // Mock IDIR login handler
  const handleIdirLogin = () => {
    // Simple validation - just check if fields are not empty
    // if (username.trim() && password.trim()) {
    setIsLoggedIn(true)
    localStorage.setItem('isLoggedIn', 'true')
    const mockToken = `mock-token-${Date.now()}`
    localStorage.setItem('authToken', mockToken)
    localStorage.setItem('username', username)
    console.log('=== MOCK LOGIN - AUTH TOKEN SET ===')
    console.log('Mock Token:', mockToken)
    console.log('===================================')
    setShowIdirLogin(false)
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
        // For non-API filters (client-side filtering), the data will update automatically
        // from the eligibilityData array
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
      // Remove each selected contact from the batch
      const removePromises = selectedBatchDetails.map((contactId) =>
        removeContactFromBatch(contactId),
      )

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
  }

  const handleFilterClose = () => {
    setFilterAnchor({ element: null, column: '' })
    setFilterSearchTerm('')
  }

  const handleFilterChange = (column: string, value: string) => {
    setColumnFilters((prev) => {
      const currentFilters = prev[column] || []
      const newFilters = currentFilters.includes(value)
        ? currentFilters.filter((v) => v !== value)
        : [...currentFilters, value]
      return { ...prev, [column]: newFilters }
    })
  }

  const clearColumnFilter = (column: string) => {
    setColumnFilters((prev) => ({ ...prev, [column]: [] }))
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

  const getBatchHistoryUniqueValues = (column: keyof (typeof childBatchHistory)[0]) => {
    const values = childBatchHistory.map((row) => row[column])
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

  // Get unique values for a column
  const getUniqueValues = (column: keyof (typeof eligibilityData)[0]) => {
    const values = eligibilityData.map((row) => row[column])
    return Array.from(new Set(values)).filter((v) => v !== undefined && v !== '')
  }

  // Apply filters and sorting to data
  const filteredData = useMemo(() => {
    // Use contacts from API when API-based filters are selected
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
    let data = apiFilters.includes(preDefinedFilter)
      ? contacts.map((contact) => ({
          id: contact.id,
          firstName: contact.firstName || '',
          middleName: contact.middleName || '',
          lastName: contact.lastName || '',
          gender: contact.gender || '',
          dob: contact.dateOfBirth ? new Date(contact.dateOfBirth).toLocaleDateString() : '',
          age: contact.age || 0,
          din: contact.din || '',
          csaStatus: contact.csaStatus || '',
          statusEffective: contact.csaStatusEffectiveDate
            ? new Date(contact.csaStatusEffectiveDate).toLocaleDateString()
            : '',
          caseNumber: contact.caseNumber || '',
          caseStatus: contact.caseStatus || '',
          legacyFile: contact.legacyFileNumber || '',
          cgwrks3: '',
          lastUpdated: contact.lastUpdatedAt
            ? new Date(contact.lastUpdatedAt).toLocaleString()
            : '',
          lastUpdatedBy: contact.lastUpdatedBy || '',
        }))
      : eligibilityData.filter((row) => {
          // Apply global search
          if (searchTerm) {
            const searchLower = searchTerm.toLowerCase()
            const matchesSearch = Object.values(row).some((value) =>
              String(value).toLowerCase().includes(searchLower),
            )
            if (!matchesSearch) return false
          }

          // Apply column filters
          for (const [column, filters] of Object.entries(columnFilters)) {
            if (filters.length > 0) {
              const columnValue = String(row[column as keyof typeof row])
              if (!filters.includes(columnValue)) {
                return false
              }
            }
          }

          return true
        })

    // Apply sorting (only for non-API data)
    if (sortConfig && preDefinedFilter !== 'All Records') {
      data = [...data].sort((a, b) => {
        const aValue = a[sortConfig.column as keyof typeof a]
        const bValue = b[sortConfig.column as keyof typeof b]

        // Handle different data types
        if (aValue === undefined || aValue === '') return 1
        if (bValue === undefined || bValue === '') return -1

        // Numeric comparison
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue
        }

        // String comparison
        const aString = String(aValue).toLowerCase()
        const bString = String(bValue).toLowerCase()

        if (sortConfig.direction === 'asc') {
          return aString.localeCompare(bString)
        } else {
          return bString.localeCompare(aString)
        }
      })
    }

    return data
  }, [searchTerm, columnFilters, sortConfig, contacts, preDefinedFilter])

  // Check if all selected records have valid CSA status for Hold/Resume
  const canHoldResume = useMemo(() => {
    if (selected.length === 0) return false

    return selected.every((id) => {
      const record = filteredData.find((row) => row.id === id)
      return record && VALID_CSA_STATUSES.includes(record.csaStatus)
    })
  }, [selected, filteredData])

  // Check if all selected records have valid CSA status for Add to Batch
  const canAddToBatch = useMemo(() => {
    if (selected.length === 0) return false

    return selected.every((id) => {
      const record = filteredData.find((row) => row.id === id)
      return record && VALID_BATCH_STATUSES.includes(record.csaStatus)
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
      lastName: detail.contact.lastName,
      middleName: '', // API doesn't return middleName from contact
      givenName: detail.contact.firstName,
      transactionType: detail.transactionType,
      status: detail.status || '',
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
                {user?.username || user?.name || username || 'User'}
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
                        <MenuItem value="All eligible records">All eligible records</MenuItem>
                        <MenuItem value="All records in progress">All records in progress</MenuItem>
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
                  </Box>
                </Box>

                {/* Table */}
                <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                        <TableCell padding="checkbox">
                          <Checkbox />
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
                                color: columnFilters.firstName?.length > 0 ? '#1976d2' : 'inherit',
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
                                color: columnFilters.middleName?.length > 0 ? '#1976d2' : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
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
                                color: columnFilters.lastName?.length > 0 ? '#1976d2' : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleSortClick(e, 'gender')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Gender
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'gender')}
                              sx={{
                                padding: 0.5,
                                color: columnFilters.gender?.length > 0 ? '#1976d2' : 'inherit',
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
                              DOB
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'dob')}
                              sx={{
                                padding: 0.5,
                                color: columnFilters.dob?.length > 0 ? '#1976d2' : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleSortClick(e, 'age')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Age
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'age')}
                              sx={{
                                padding: 0.5,
                                color: columnFilters.age?.length > 0 ? '#1976d2' : 'inherit',
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
                                color: columnFilters.din?.length > 0 ? '#1976d2' : 'inherit',
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
                                color: columnFilters.csaStatus?.length > 0 ? '#1976d2' : 'inherit',
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
                              Status Effective
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'statusEffective')}
                              sx={{
                                padding: 0.5,
                                color:
                                  columnFilters.statusEffective?.length > 0 ? '#1976d2' : 'inherit',
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
                              Case No.
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'caseNumber')}
                              sx={{
                                padding: 0.5,
                                color: columnFilters.caseNumber?.length > 0 ? '#1976d2' : 'inherit',
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
                                color: columnFilters.caseStatus?.length > 0 ? '#1976d2' : 'inherit',
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
                              Legacy File
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'legacyFile')}
                              sx={{
                                padding: 0.5,
                                color: columnFilters.legacyFile?.length > 0 ? '#1976d2' : 'inherit',
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
                                color: columnFilters.cgwrks3?.length > 0 ? '#1976d2' : 'inherit',
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
                                  columnFilters.lastUpdated?.length > 0 ? '#1976d2' : 'inherit',
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
                                  columnFilters.lastUpdatedBy?.length > 0 ? '#1976d2' : 'inherit',
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
                          <TableCell>{row.firstName}</TableCell>
                          <TableCell>{row.middleName}</TableCell>
                          <TableCell>{row.lastName}</TableCell>
                          <TableCell>{row.gender}</TableCell>
                          <TableCell>{row.dob}</TableCell>
                          <TableCell>{row.age}</TableCell>
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
                    <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                      {filterAnchor.column &&
                        getUniqueValues(filterAnchor.column as keyof (typeof eligibilityData)[0])
                          .sort()
                          .filter((value) =>
                            String(value).toLowerCase().includes(filterSearchTerm.toLowerCase()),
                          )
                          .map((value) => (
                            <Box
                              key={String(value)}
                              sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}
                            >
                              <Checkbox
                                size="small"
                                checked={
                                  columnFilters[filterAnchor.column]?.includes(String(value)) ||
                                  false
                                }
                                onChange={() =>
                                  handleFilterChange(filterAnchor.column, String(value))
                                }
                              />
                              <Typography variant="body2">{String(value)}</Typography>
                            </Box>
                          ))}
                    </Box>
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
                        getBatchHistoryUniqueValues(
                          batchHistoryFilterAnchor.column as keyof (typeof childBatchHistory)[0],
                        )
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
                        const childData = eligibilityData.find(
                          (child) => child.id === selectedChild,
                        )
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
                                  display: 'grid',
                                  gridTemplateColumns: 'auto 1fr',
                                  gap: 1,
                                  rowGap: 1.5,
                                  backgroundColor: '#f9f9f9',
                                  p: 2,
                                  borderRadius: 1,
                                }}
                              >
                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Person Name
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {`${childData.firstName} ${childData.middleName} ${childData.lastName}`.trim()}
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Birth Name
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {`${childData.firstName} ${childData.middleName} ${childData.lastName}`.trim()}
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  AKA Last Name
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  John
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Birth Place
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  Victoria, BC, CA
                                </Typography>
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
                                  display: 'grid',
                                  gridTemplateColumns: 'auto 1fr',
                                  gap: 1,
                                  rowGap: 1.5,
                                  backgroundColor: '#f9f9f9',
                                  p: 2,
                                  borderRadius: 1,
                                }}
                              >
                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Service Office
                                </Typography>
                                <Typography
                                  variant="body2"
                                  sx={{ fontWeight: 500, color: '#1976d2', cursor: 'pointer' }}
                                >
                                  Open Case
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Case No.
                                </Typography>
                                <Typography
                                  variant="body2"
                                  sx={{ fontWeight: 500, color: '#1976d2', cursor: 'pointer' }}
                                >
                                  {childData.caseNumber}
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Assigned to
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  IEIC: CONNECT
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Case Type
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  Child Services
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Case Status
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {childData.caseStatus}
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Legal Status Code
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  C88: GCD
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Legacy File No.
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {childData.legacyFile}
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Effective Date
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  2025-03-12
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Expiry Date
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  2025-11-16
                                </Typography>
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
                                  display: 'grid',
                                  gridTemplateColumns: 'auto 1fr',
                                  gap: 1,
                                  rowGap: 1.5,
                                  backgroundColor: '#f9f9f9',
                                  p: 2,
                                  borderRadius: 1,
                                }}
                              >
                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Actual Resource
                                </Typography>
                                <Typography
                                  variant="body2"
                                  sx={{ fontWeight: 500, color: '#1976d2', cursor: 'pointer' }}
                                >
                                  Actual Placement
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Placement/Location No.
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  1-14732
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Actual Start Date
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  2025-11-16
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Type
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  Placement
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Actual End Date
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  NA
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Sub-type
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  Emergency
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Paid/Unpaid
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  NA
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Source
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
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
                                    ICM
                                  </Typography>
                                </Typography>
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
                                  display: 'grid',
                                  gridTemplateColumns: 'auto 1fr',
                                  gap: 1,
                                  rowGap: 1.5,
                                  backgroundColor: '#f9f9f9',
                                  p: 2,
                                  borderRadius: 1,
                                }}
                              >
                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Actual Agreement
                                </Typography>
                                <Typography
                                  variant="body2"
                                  sx={{ fontWeight: 500, color: '#1976d2', cursor: 'pointer' }}
                                >
                                  Actual Agreement
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Start Date
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  2025-07-01
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Provider
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  2925 POP 1 SP-1
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  End Date
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  2026-08-30
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Provider ID
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  1-17284
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Termination Date
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  NA
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Place of Service
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  NA
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Agreement Type
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  2925 PDS
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  SIEMS PDS 1
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  01040334SP
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Product Type
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  Variable
                                </Typography>
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
                              Middle Name(s)
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
                              Given Name(s)
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
                  getBatchHistoryUniqueValues(
                    batchHistoryFilterAnchor.column as keyof (typeof childBatchHistory)[0],
                  )
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
