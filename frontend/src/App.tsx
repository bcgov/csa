import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import CloseIcon from '@mui/icons-material/Close'
import EditIcon from '@mui/icons-material/Edit'
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff'
import FilterListIcon from '@mui/icons-material/FilterList'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
  Alert,
  AppBar,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  LinearProgress,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { OnHoldDialog } from './components/OnHoldDialog'
import { getRuntimeConfig } from './config/keycloak.config'
import { useAuth } from './context/AuthContext'
import logo from './icons/image.png'
import {
  addContactsToBatch,
  clearReviewFlag,
  fullTextSearchContacts,
  getAllBatches,
  getAllContacts,
  getBatchContacts,
  getContactAuditTrail,
  getContactBatches,
  getJobRunProgressUpdate,
  getLastSuccessfulRuns,
  getRunningEligibilityJob,
  holdContacts,
  removeContactFromBatch,
  removeContactsFromBatch,
  resumeContacts,
  runAutoBatchWithPolling,
  runEligibilityForAllWithPolling,
  runEligibilityForContact,
  updateEligibilityStatus,
  updateHoldReason,
  updateNotEligibleStatusAlt,
  updateOver18Status,
  waitForEligibilityJobCompletion,
  type Batch,
  type BatchContactDetail,
  type Contact,
  type ContactAuditTrailEntry,
  type ContactBatchDetail,
  type ContactEligibilityResult,
  type JobRun,
  type LastSuccessfulRuns,
} from './service/contacts-service'
import type { AppEnvironment } from './types/runtime-config'

// Environment-based toolbar background colors
const getEnvBackgroundColor = (env?: AppEnvironment): string => {
  switch (env) {
    case 'DEV':
      return '#f5e6c8' // Light yellow/tan
    case 'TEST':
      return '#f8e0e6' // Light pink
    case 'PRE-PROD':
      return '#d4e5f7' // Light blue
    case 'PROD':
    default:
      return '#ffffff' // White (no color)
  }
}

// Valid CSA statuses for Hold/Resume button
// Maps to backend CSA_STATUSES constants
const VALID_CSA_STATUSES = [
  'eligible', // Eligible
  'eligible_tbd', // Eligible - TBD
  'application_refused_cra', // Application Refused - CRA
  'cra_error_application', // CRA Error - Application
  'not_eligible_in_pay', // Not Eligible - In Pay
  'not_eligible_ip_tbd', // Not Eligible - IP - TBD
  'cancellation_refused_cra', // Cancellation Refused - CRA
  'cra_error_cancellation', // CRA Error - Cancellation
  'on_hold', // On Hold
]

const shouldHideEligibilityListContact = (contact: Contact): boolean =>
  contact.placementLocation === '0' &&
  contact.locationType === 'PL' &&
  contact.locationSubType === '54' &&
  contact.placementStatus === 'Active'

// Valid CSA statuses for Add to Batch button
const VALID_BATCH_STATUSES = [
  'eligible', // Eligible
  'eligible_tbd', // Eligible - TBD
  'application_refused_cra', // Application Refused - CRA
  'cra_error_application', // CRA Error - Application
  'not_eligible_in_pay', // Not Eligible - In Pay
  'not_eligible_ip_tbd', // Not Eligible - IP - TBD
  'cancellation_refused_cra', // Cancellation Refused - CRA
  'cra_error_cancellation', // CRA Error - Cancellation
]

// CSA Status options for filter dropdown
const CSA_STATUS_FILTER_OPTIONS = [
  { value: 'not_eligible_out_of_pay', label: 'Not Eligible - Out of Pay' },
  { value: 'eligible', label: 'Eligible' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'eligible_tbd', label: 'Eligible - TBD' },
  { value: 'in_batch_application', label: 'In Batch - Application' },
  { value: 'batch_sent_application', label: 'Batch Sent - Application' },
  { value: 'application_refused_cra', label: 'Application Refused - CRA' },
  { value: 'cra_error_application', label: 'CRA Error - Application' },
  { value: 'in_pay', label: 'In Pay' },
  { value: 'not_eligible_in_pay', label: 'Not Eligible - In Pay' },
  { value: 'not_eligible_ip_tbd', label: 'Not Eligible - IP - TBD' },
  { value: 'in_batch_cancellation', label: 'In Batch - Cancellation' },
  { value: 'batch_sent_cancellation', label: 'Batch Sent - Cancellation' },
  { value: 'cancellation_refused_cra', label: 'Cancellation Refused - CRA' },
  { value: 'cra_error_cancellation', label: 'CRA Error - Cancellation' },
  { value: 'over_18', label: 'Over 18' },
]

// Case Status options for filter dropdown
const CASE_STATUS_FILTER_OPTIONS = [
  { value: 'Open', label: 'Open' },
  { value: 'Closed', label: 'Closed' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Admin Re-open', label: 'Admin Re-open' },
]

// Batch Status options for filter dropdown (used in Batch History and Batch Requests)
// Values must match statusLabel display values used in filteredBatchRequests/filteredBatchHistory
const BATCH_STATUS_FILTER_OPTIONS = [
  { value: 'Pending', label: 'Pending' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'System Error', label: 'System Error' },
  { value: 'Processed with Errors', label: 'Processed with Errors' },
  { value: 'Processed', label: 'Processed' },
  { value: 'Error', label: 'Error' },
]

// Batch Details Status options for filter dropdown
const BATCH_DETAILS_STATUS_FILTER_OPTIONS = [
  { value: 'Pending', label: 'Pending' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Error', label: 'Error' },
  { value: 'Processed', label: 'Processed' },
]

// Initiated By options for filter dropdown (used in Batch Requests)
const INITIATED_BY_FILTER_OPTIONS = [
  { value: 'Ministry', label: 'Ministry' },
  { value: 'CRA', label: 'CRA' },
]

// Review flag options for filter dropdown (used in Eligibility List)
const REVIEW_FILTER_OPTIONS = [
  { value: 'true', label: 'Needs Review' },
  { value: 'false', label: 'No Review Needed' },
]

// Column field to display label mapping for filter menu
const COLUMN_LABELS: Record<string, string> = {
  lastName: 'Last Name',
  firstName: 'First Name',
  middleName: 'Middle Name(s)',
  givenName: 'First Name',
  dob: 'Date Of Birth',
  din: 'DIN',
  csaStatus: 'CSA Status',
  statusEffective: 'Status Effective Date',
  caseNumber: 'Case Number',
  caseStatus: 'Case Status',
  legacyFile: 'Legacy File No.',
  cgwrks3: 'Set on Hold By',
  holdReason: 'Reason',
  lastUpdated: 'Last Updated',
  lastUpdatedBy: 'Last Updated By',
  needsReview: 'Review',
  // Batch table columns
  batchId: 'Batch ID',
  batchDate: 'Batch Date',
  createdDate: 'Created Date',
  status: 'Status',
  transactionType: 'Transaction Type',
  recordCount: 'Record Count',
  initiatedBy: 'Initiated By',
  createdBy: 'Created By',
  contactId: 'Contact ID',
  icmNumber: 'ICM Number',
  // Batch Details columns
  cancellationReason: 'Reason for Cancellation',
  systemComments: 'System Comments',
  addedBy: 'Added By',
  effectiveDate: 'Effective Date',
  // Batch History columns
  batchRequestStatus: 'Batch Request Status',
  batchDetailStatus: 'Batch Detail Status',
  // Audit Trail columns
  actionedBy: 'Actioned By',
  operation: 'Operation',
  field: 'Field',
  oldValue: 'Old Value',
  newValue: 'New Value',
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: '2-digit' }
const HOLD_REASON_PREVIEW_LENGTH = 150

const toYMD = (date: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', { ...DATE_FORMAT, timeZone }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

const formatDateYMD = (dateString: string): string => {
  return toYMD(new Date(dateString + 'T00:00:00Z'), 'UTC')
}

const formatDateTimeYMD = (dateString: string): string => {
  return toYMD(new Date(dateString), 'America/Vancouver')
}

const formatDateTimeYMDHMS = (dateString: string): string => {
  const date = new Date(dateString)
  const parts = new Intl.DateTimeFormat('en-US', {
    ...DATE_FORMAT,
    timeZone: 'America/Vancouver',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

// Parse formatted date string (YYYY-MMM-DD or YYYY-MMM-DD HH:MM:SS) back to Date for sorting
const parseFormattedDate = (dateStr: string): Date | null => {
  if (!dateStr) return null
  const months: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  }
  // Handle both "YYYY-MMM-DD" and "YYYY-MMM-DD HH:MM:SS" formats
  const match = dateStr.match(/^(\d{4})-(\w{3})-(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/)
  if (!match) return null
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match
  const monthNum = months[month]
  if (monthNum === undefined) return null
  return new Date(
    parseInt(year),
    monthNum,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second),
  )
}

const getHoldReasonPreview = (reason: string): string => {
  if (reason.length <= HOLD_REASON_PREVIEW_LENGTH) {
    return reason
  }
  return `${reason.slice(0, HOLD_REASON_PREVIEW_LENGTH)}...`
}

// Capitalize first letter of a string
const capitalize = (str: string): string => {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

function App() {
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

  // User is authenticated when Keycloak auth is complete and has CSA access
  const isAuthenticated = !isLoading && keycloakAuthenticated && hasCSAAccess === true

  const [selectedTab, setSelectedTab] = useState(0)
  const [selected, setSelected] = useState<number[]>([])
  // Cache of selected records' csaStatusRaw and isOver18 values for cross-page validation
  const [selectedRecordsCache, setSelectedRecordsCache] = useState<
    Map<number, { csaStatusRaw: string; isOver18: boolean }>
  >(new Map())
  const [selectedBatchDetails, setSelectedBatchDetails] = useState<number[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSearchTerm, setFilterSearchTerm] = useState('')
  const [isColumnFilterActive, setIsColumnFilterActive] = useState(false)
  // Store multiple active column filters: column name -> query value
  const [activeColumnFilters, setActiveColumnFilters] = useState<Record<string, string>>({})
  const [selectedChild, setSelectedChild] = useState<number | null>(null)
  const [rememberedChildId, setRememberedChildId] = useState<number | null>(null)
  const restoreBatchHistoryRequestId = useRef(0)
  const [selectedBatch, setSelectedBatch] = useState<number | null>(null) // No batch selected initially
  const [isBatchHistoryExpanded, setIsBatchHistoryExpanded] = useState(false)
  const [isAuditTrailExpanded, setIsAuditTrailExpanded] = useState(false)

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

  // Run Eligibility Query dropdown menu state
  const [eligibilityMenuAnchor, setEligibilityMenuAnchor] = useState<null | HTMLElement>(null)
  const eligibilityMenuOpen = Boolean(eligibilityMenuAnchor)
  const [isRunningEligibilityAll, setIsRunningEligibilityAll] = useState(false)
  const [runningEligibilityContactId, setRunningEligibilityContactId] = useState<number | null>(
    null,
  )
  const [confirmRunAllDialogOpen, setConfirmRunAllDialogOpen] = useState(false)

  // Add to Batch dropdown menu state
  const [addToBatchMenuAnchor, setAddToBatchMenuAnchor] = useState<null | HTMLElement>(null)
  const addToBatchMenuOpen = Boolean(addToBatchMenuAnchor)
  const [isRunningAutoBatch, setIsRunningAutoBatch] = useState(false)
  const [confirmAutoBatchDialogOpen, setConfirmAutoBatchDialogOpen] = useState(false)

  // On Hold dialog state
  const [onHoldDialogOpen, setOnHoldDialogOpen] = useState(false)
  const [onHoldDialogMode, setOnHoldDialogMode] = useState<'hold' | 'resume' | 'edit'>('hold')
  const [pendingHoldIds, setPendingHoldIds] = useState<number[]>([])
  const [pendingResumeIds, setPendingResumeIds] = useState<number[]>([])
  const [editingContactId, setEditingContactId] = useState<number | null>(null)
  const [editingContactReason, setEditingContactReason] = useState<string>('')

  // Last successful job runs state
  const [lastSuccessfulRuns, setLastSuccessfulRuns] = useState<LastSuccessfulRuns>({
    lastDataIngestion: null,
    lastEligibilityRun: null,
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

  // Fetch last successful job runs on mount
  useEffect(() => {
    if (isAuthenticated) {
      getLastSuccessfulRuns()
        .then(setLastSuccessfulRuns)
        .catch((err) => console.error('Failed to fetch last successful runs:', err))
    }
  }, [isAuthenticated])

  // Check for running eligibility job on page load and resume monitoring
  useEffect(() => {
    if (!isAuthenticated) return

    const checkAndResumeRunningJob = async () => {
      try {
        const runningJob = await getRunningEligibilityJob()
        if (runningJob) {
          // Found a running job - lock the UI and wait for completion
          setIsRunningEligibilityAll(true)
          const initialProgress = getJobRunProgressUpdate(
            runningJob,
            'Eligibility query is running in the background...',
          )
          setSnackbar({
            open: true,
            message: initialProgress.message,
            severity: initialProgress.severity,
          })

          // Wait for the job to complete
          const completedJob = await waitForEligibilityJobCompletion(runningJob.id, (job) => {
            if (job.status === 'RUNNING') {
              const progress = getJobRunProgressUpdate(job, 'Eligibility query is still running...')
              setSnackbar({
                open: true,
                message: progress.message,
                severity: progress.severity,
              })
            }
          })

          // Handle completion
          if (completedJob.status === 'SUCCESS') {
            const metadata = completedJob.metadata as {
              processed?: number
              statusChanges?: number
              skipped?: number
            } | null
            const processed = metadata?.processed ?? 0
            const statusChanges = metadata?.statusChanges ?? 0
            const skipped = metadata?.skipped ?? 0

            setSnackbar({
              open: true,
              message: `Eligibility complete: ${processed} processed, ${statusChanges} updated, ${skipped} skipped`,
              severity: statusChanges > 0 ? 'success' : 'info',
            })

            // Refresh the page to get updated data if there were changes
            if (statusChanges > 0) {
              window.location.reload()
            }
          } else {
            setSnackbar({
              open: true,
              message: completedJob.error || 'Eligibility query failed',
              severity: 'error',
            })
          }

          setIsRunningEligibilityAll(false)
          // Refresh timestamps
          getLastSuccessfulRuns()
            .then(setLastSuccessfulRuns)
            .catch((err) => console.error('Failed to refresh last successful runs:', err))
        }
      } catch (err) {
        console.error('Failed to check for running eligibility job:', err)
      }
    }

    checkAndResumeRunningJob()
  }, [isAuthenticated])

  // Helper function to check for running eligibility job before data modifications
  // Returns true if a job is running (action should be blocked), false otherwise
  const checkAndHandleRunningEligibilityJob = async (): Promise<boolean> => {
    try {
      const runningJob = await getRunningEligibilityJob()
      if (runningJob) {
        // Found a running job - lock the UI and wait for completion
        setIsRunningEligibilityAll(true)
        setSnackbar({
          open: true,
          message: 'An eligibility query is currently running. Please wait...',
          severity: 'info',
        })

        // Wait for the job to complete
        const completedJob = await waitForEligibilityJobCompletion(runningJob.id, (job) => {
          if (job.status === 'RUNNING') {
            const progress = getJobRunProgressUpdate(job, 'Eligibility query is still running...')
            setSnackbar({
              open: true,
              message: progress.message,
              severity: progress.severity,
            })
          }
        })

        // Handle completion
        if (completedJob.status === 'SUCCESS') {
          const metadata = completedJob.metadata as {
            processed?: number
            statusChanges?: number
            skipped?: number
          } | null
          const statusChanges = metadata?.statusChanges ?? 0

          setSnackbar({
            open: true,
            message: 'Eligibility query completed. Please try your action again.',
            severity: 'success',
          })

          // Refresh the page to get updated data if there were changes
          if (statusChanges > 0) {
            window.location.reload()
          }
        } else {
          setSnackbar({
            open: true,
            message: completedJob.error || 'Eligibility query failed',
            severity: 'error',
          })
        }

        setIsRunningEligibilityAll(false)
        // Refresh timestamps
        getLastSuccessfulRuns()
          .then(setLastSuccessfulRuns)
          .catch((err) => console.error('Failed to refresh last successful runs:', err))

        return true // Job was running, action should be blocked
      }
      return false // No job running, can proceed
    } catch (err) {
      console.error('Failed to check for running eligibility job:', err)
      return false // On error, allow the action to proceed
    }
  }

  // Helper function to format date for display (matches table date format)
  const formatJobTimestamp = (date: Date | null): string => {
    if (!date) return '--'
    const parts = new Intl.DateTimeFormat('en-US', {
      ...DATE_FORMAT,
      timeZone: 'America/Vancouver',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date)
    const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
  }

  // Batch history state for selected contact
  const [contactBatchHistory, setContactBatchHistory] = useState<ContactBatchDetail[]>([])
  const [loadingBatchHistory, setLoadingBatchHistory] = useState(false)

  // Audit trail state for selected contact
  const [contactAuditTrail, setContactAuditTrail] = useState<ContactAuditTrailEntry[]>([])
  const [loadingAuditTrail, setLoadingAuditTrail] = useState(false)

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
      cgwrks3: 'holdBy',
      holdReason: 'holdReason',
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

  // Batch History search, filter, and sort states
  const [batchHistorySearchTerm, setBatchHistorySearchTerm] = useState('')
  const [batchHistoryColumnFilters, setBatchHistoryColumnFilters] = useState<
    Record<string, string[]>
  >({
    batchId: [],
    batchDate: [],
    batchRequestStatus: [],
    transactionType: [],
    batchDetailStatus: [],
    systemComments: [],
  })
  const [batchHistoryFilterAnchor, setBatchHistoryFilterAnchor] = useState<FilterAnchor>({
    element: null,
    column: '',
  })
  const [batchHistoryFilterSearchTerm, setBatchHistoryFilterSearchTerm] = useState('')
  const [selectedBatchHistoryId, setSelectedBatchHistoryId] = useState<number | null>(null)
  const [batchHistorySortAnchor, setBatchHistorySortAnchor] = useState<SortAnchor>({
    element: null,
    column: '',
  })
  const [batchHistorySortConfig, setBatchHistorySortConfig] = useState<{
    column: string
    direction: 'asc' | 'desc'
  } | null>(null)

  // Audit Trail search, filter, and sort states
  const [auditTrailSearchTerm, setAuditTrailSearchTerm] = useState('')
  const [auditTrailColumnFilters, setAuditTrailColumnFilters] = useState<Record<string, string[]>>({
    date: [],
    actionedBy: [],
    operation: [],
    field: [],
    oldValue: [],
    newValue: [],
  })
  const [auditTrailFilterAnchor, setAuditTrailFilterAnchor] = useState<FilterAnchor>({
    element: null,
    column: '',
  })
  const [auditTrailFilterSearchTerm, setAuditTrailFilterSearchTerm] = useState('')
  const [auditTrailSortAnchor, setAuditTrailSortAnchor] = useState<SortAnchor>({
    element: null,
    column: '',
  })
  const [auditTrailSortConfig, setAuditTrailSortConfig] = useState<{
    column: string
    direction: 'asc' | 'desc'
  } | null>(null)

  // Batch Requests search, filter, and sort states
  const [batchRequestsSearchTerm, setBatchRequestsSearchTerm] = useState('')
  const [batchRequestsColumnFilters, setBatchRequestsColumnFilters] = useState<
    Record<string, string[]>
  >({
    batchId: [],
    batchDate: [],
    status: [],
    recordCount: [],
    initiatedBy: [],
    createdDate: [],
    systemComments: [],
  })
  const [batchRequestsFilterAnchor, setBatchRequestsFilterAnchor] = useState<FilterAnchor>({
    element: null,
    column: '',
  })
  const [batchRequestsFilterSearchTerm, setBatchRequestsFilterSearchTerm] = useState('')
  const [batchRequestsSortAnchor, setBatchRequestsSortAnchor] = useState<SortAnchor>({
    element: null,
    column: '',
  })
  const [batchRequestsSortConfig, setBatchRequestsSortConfig] = useState<{
    column: string
    direction: 'asc' | 'desc'
  } | null>(null)

  // Batch Details search, filter, and sort states
  const [batchDetailsSearchTerm, setBatchDetailsSearchTerm] = useState('')
  const [batchDetailsColumnFilters, setBatchDetailsColumnFilters] = useState<
    Record<string, string[]>
  >({
    lastName: [],
    middleName: [],
    givenName: [],
    caseNumber: [],
    transactionType: [],
    cancellationReason: [],
    status: [],
    systemComments: [],
    addedBy: [],
  })
  const [batchDetailsFilterAnchor, setBatchDetailsFilterAnchor] = useState<FilterAnchor>({
    element: null,
    column: '',
  })
  const [batchDetailsFilterSearchTerm, setBatchDetailsFilterSearchTerm] = useState('')
  const [batchDetailsSortAnchor, setBatchDetailsSortAnchor] = useState<SortAnchor>({
    element: null,
    column: '',
  })
  const [batchDetailsSortConfig, setBatchDetailsSortConfig] = useState<{
    column: string
    direction: 'asc' | 'desc'
  } | null>(null)

  // Pagination states for batch tables
  const [batchRequestsPage, setBatchRequestsPage] = useState(1)
  const [batchDetailsPage, setBatchDetailsPage] = useState(1)
  const [batchHistoryPage, setBatchHistoryPage] = useState(1)
  const [auditTrailPage, setAuditTrailPage] = useState(1)
  const BATCH_PAGE_SIZE = 10

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
    holdReason: [],
    lastUpdated: [],
    lastUpdatedBy: [],
    needsReview: [],
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
            { key: 'csaStatus', op: 'eq', value: 'cra_error_application' },
            { key: 'csaStatus', op: 'eq', value: 'cra_error_cancellation' },
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
          // csaStatus = 'on_hold' OR 'eligible_tbd' OR 'not_eligible_ip_tbd' OR 'eligible' OR 'not_eligible_in_pay' OR 'cra_error_application' OR 'cra_error_cancellation'
          filter = [
            {
              OR: [
                { key: 'csaStatus', op: 'eq', value: 'on_hold' },
                { key: 'csaStatus', op: 'eq', value: 'eligible_tbd' },
                { key: 'csaStatus', op: 'eq', value: 'not_eligible_ip_tbd' },
                { key: 'csaStatus', op: 'eq', value: 'eligible' },
                { key: 'csaStatus', op: 'eq', value: 'not_eligible_in_pay' },
                { key: 'csaStatus', op: 'eq', value: 'cra_error_application' },
                { key: 'csaStatus', op: 'eq', value: 'cra_error_cancellation' },
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
  // Build filters from all active column filters and perform search
  const performColumnFiltersSearch = useCallback(
    async (filters: Record<string, string>, page: number) => {
      setIsColumnFilterActive(true)
      setLoadingContacts(true)
      setContactsError(null)
      try {
        const numericColumns = ['age']
        // Dropdown columns should use exact matching (eq), not partial matching (like)
        const exactMatchColumns = ['csaStatus', 'caseStatus']
        const columnFilters: Array<{ key: string; op: string; value: string | number }> = []

        // Build filter conditions for all active column filters
        for (const [column, query] of Object.entries(filters)) {
          const backendField = columnToFieldMapping[column]
          if (!backendField) {
            console.error('Unknown column:', column)
            continue
          }

          const isNumericColumn = numericColumns.includes(column)
          const isExactMatchColumn = exactMatchColumns.includes(column)
          // Use 'eq' for numeric and dropdown columns, 'like' for text search columns
          const op = isNumericColumn || isExactMatchColumn ? 'eq' : 'like'

          let value: string | number = query
          if (isNumericColumn) {
            const parsedValue = parseInt(query, 10)
            if (isNaN(parsedValue)) {
              continue // Skip invalid numeric input
            }
            value = parsedValue
          }

          columnFilters.push({ key: backendField, op, value })
        }

        if (columnFilters.length === 0) {
          setLoadingContacts(false)
          return
        }

        // Combine with existing pre-defined filter if needed
        let combinedFilter = columnFilters

        // If there's a pre-defined filter other than "All Records", combine them
        if (preDefinedFilter !== 'All Records') {
          const baseFilter = getPreDefinedFilterConfig(preDefinedFilter)
          if (baseFilter) {
            combinedFilter = [...baseFilter, ...columnFilters]
          }
        }

        // Build sort parameter if sortConfig is set
        let sort: Array<{ [key: string]: 'asc' | 'desc' }> | undefined
        if (sortConfig) {
          const backendField = columnToFieldMapping[sortConfig.column]
          if (backendField) {
            sort = [{ [backendField]: sortConfig.direction }]
          }
        }

        const response = await getAllContacts(page, recordsPerPage, combinedFilter, sort)
        setContacts(response.data)
        setTotalPages(response.totalPages)
        setTotalRecords(response.total)
      } catch (error) {
        console.error('Failed to search column:', error)
        setContactsError('Failed to search. Please try again.')
        setContacts([])
      } finally {
        setLoadingContacts(false)
      }
    },
    [preDefinedFilter, recordsPerPage, columnToFieldMapping, getPreDefinedFilterConfig, sortConfig],
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

    // If column filter is active, re-apply all column filters on page change
    if (isColumnFilterActive && Object.keys(activeColumnFilters).length > 0) {
      performColumnFiltersSearch(activeColumnFilters, currentPage)
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
    activeColumnFilters,
    fetchContacts,
    performColumnFiltersSearch,
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
      } else if (searchTerm.trim().length === 0) {
        // Search is cleared - check if column filters should be re-applied
        setIsSearchActive(false)
        if (isColumnFilterActive && Object.keys(activeColumnFilters).length > 0) {
          // Re-apply the column filters that were active before global search
          performColumnFiltersSearch(activeColumnFilters, currentPage)
        } else {
          // No column filters active, go back to regular filter
          fetchContacts(currentPage)
        }
      }
    }, 500)

    return () => clearTimeout(searchTimer)
  }, [
    searchTerm,
    currentPage,
    preDefinedFilter,
    isAuthenticated,
    isColumnFilterActive,
    activeColumnFilters,
    fetchContacts,
    performFullTextSearch,
    performColumnFiltersSearch,
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

    const column = filterAnchor.column

    // Only trigger column filter search for API-based filters and when a column is selected
    if (!apiFilters.includes(preDefinedFilter) || !isAuthenticated || !column) {
      return
    }

    // Numeric columns only need 1 character, text columns need 3
    const numericColumns = ['age']
    const minChars = numericColumns.includes(column) ? 1 : 3

    // Skip debounce search for csaStatus and caseStatus since they use dropdown selection, not text search
    if (column === 'csaStatus' || column === 'caseStatus') {
      return
    }

    // Debounce column search - wait 500ms after user stops typing
    const columnSearchTimer = setTimeout(() => {
      if (filterSearchTerm.trim().length >= minChars) {
        // Skip if the filter value is the same as the already active filter for this column
        if (activeColumnFilters[column] === filterSearchTerm.trim()) {
          return
        }
        // Add/update this column filter while preserving other active filters
        const newFilters = { ...activeColumnFilters, [column]: filterSearchTerm.trim() }
        setActiveColumnFilters(newFilters)
        performColumnFiltersSearch(newFilters, currentPage)
      } else if (filterSearchTerm.trim().length === 0 && activeColumnFilters[column]) {
        // Remove this column filter when text is cleared
        const newFilters = { ...activeColumnFilters }
        delete newFilters[column]
        setActiveColumnFilters(newFilters)

        if (Object.keys(newFilters).length === 0) {
          // No more active filters, fetch regular contacts
          setIsColumnFilterActive(false)
          fetchContacts(currentPage)
        } else {
          // Still have other filters active, re-apply them
          performColumnFiltersSearch(newFilters, currentPage)
        }
      }
    }, 500)

    return () => clearTimeout(columnSearchTimer)
    // Note: currentPage is intentionally excluded - page changes are handled by the pagination effect above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filterSearchTerm,
    filterAnchor,
    preDefinedFilter,
    isAuthenticated,
    isColumnFilterActive,
    activeColumnFilters,
    fetchContacts,
    performColumnFiltersSearch,
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

  const clearSelectedChildContext = (forgetRememberedSelection: boolean = false) => {
    setSelectedChild(null)
    setContactBatchHistory([])
    setSelectedBatchHistoryId(null)
    setLoadingBatchHistory(false)
    if (forgetRememberedSelection) {
      setRememberedChildId(null)
    }
  }

  // Handle page change
  const handlePageChange = (_event: React.ChangeEvent<unknown>, page: number) => {
    clearSelectedChildContext()
    setCurrentPage(page)
  }

  // Handle pre-defined filter change
  const handlePreDefinedFilterChange = (value: string) => {
    setPreDefinedFilter(value)
    setCurrentPage(1) // Reset to first page when filter changes
    setSearchTerm('') // Clear search when changing filters
    setIsSearchActive(false) // Deactivate search mode
    // Clear all column filters when changing PDQ filter
    setIsColumnFilterActive(false)
    setActiveColumnFilters({})
    setFilterSearchTerm('')
    // Clear selected records when changing PDQ filter
    setSelected([])
    setSelectedRecordsCache(new Map())
  }

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue)
  }

  // Logout handler
  const handleLogout = () => {
    logout()
  }

  // Hold/Resume handler - now shows dialog first
  const handleHoldResume = async () => {
    if (selected.length === 0) return

    // Check if eligibility job is running
    if (await checkAndHandleRunningEligibilityJob()) return

    // Separate selected contacts into hold and resume groups
    const toHold: number[] = []
    const toResume: number[] = []

    selected.forEach((id) => {
      const contact = contacts.find((c) => c.id === id)
      if (contact) {
        if (contact.csaStatus === 'on_hold') {
          toResume.push(id)
        } else {
          toHold.push(id)
        }
      }
    })

    // Store pending IDs and show appropriate dialog
    setPendingHoldIds(toHold)
    setPendingResumeIds(toResume)

    if (toHold.length > 0) {
      // Show hold dialog first (reason is required)
      setOnHoldDialogMode('hold')
      setOnHoldDialogOpen(true)
    } else if (toResume.length > 0) {
      // Only resume contacts selected, show resume dialog (reason is optional)
      setOnHoldDialogMode('resume')
      setOnHoldDialogOpen(true)
    }
  }

  // Handle On Hold dialog close
  const handleOnHoldDialogClose = () => {
    setOnHoldDialogOpen(false)
    setPendingHoldIds([])
    setPendingResumeIds([])
    setEditingContactId(null)
    setEditingContactReason('')
  }

  // Handle edit hold reason icon click
  const handleEditHoldReason = (contactId: number, currentReason: string) => {
    setEditingContactId(contactId)
    setEditingContactReason(currentReason)
    setOnHoldDialogMode('edit')
    setOnHoldDialogOpen(true)
  }

  // Handle clear hold reason icon click (for non-on-hold contacts)
  const handleClearHoldReason = async (contactId: number, event: React.MouseEvent) => {
    event.stopPropagation()

    try {
      const response = await updateHoldReason(contactId, '')
      if (response.success) {
        setSnackbar({
          open: true,
          message: 'Hold reason cleared successfully',
          severity: 'success',
        })

        // Reload contacts to reflect the changes, respecting active filters
        if (isSearchActive && searchTerm.trim().length >= 3) {
          await performFullTextSearch(searchTerm.trim(), currentPage)
        } else if (isColumnFilterActive && Object.keys(activeColumnFilters).length > 0) {
          await performColumnFiltersSearch(activeColumnFilters, currentPage)
        } else {
          await fetchContacts(currentPage)
        }
      }
    } catch (error) {
      console.error('Clear hold reason error:', error)
      setSnackbar({
        open: true,
        message: 'Failed to clear hold reason. Please try again.',
        severity: 'error',
      })
    }
  }

  // Handle On Hold dialog confirm
  const handleOnHoldDialogConfirm = async (reason: string) => {
    setOnHoldDialogOpen(false)

    try {
      let totalSuccess = 0
      let totalSkipped = 0
      const skippedReasons: string[] = []

      // Handle edit mode
      if (onHoldDialogMode === 'edit' && editingContactId !== null) {
        const response = await updateHoldReason(editingContactId, reason)
        if (response.success) {
          setSnackbar({
            open: true,
            message: 'Hold reason updated successfully',
            severity: 'success',
          })

          // Reload contacts to reflect the changes, respecting active filters
          if (isSearchActive && searchTerm.trim().length >= 3) {
            await performFullTextSearch(searchTerm.trim(), currentPage)
          } else if (isColumnFilterActive && Object.keys(activeColumnFilters).length > 0) {
            await performColumnFiltersSearch(activeColumnFilters, currentPage)
          } else {
            await fetchContacts(currentPage)
          }
        } else {
          setSnackbar({
            open: true,
            message: 'Failed to update hold reason',
            severity: 'error',
          })
        }

        setEditingContactId(null)
        setEditingContactReason('')
        return
      }

      if (onHoldDialogMode === 'hold' && pendingHoldIds.length > 0) {
        // Process hold requests with reason
        const holdResponse = await holdContacts(pendingHoldIds, reason)
        totalSuccess += holdResponse.success.length
        totalSkipped += holdResponse.skipped.length

        holdResponse.skipped.forEach((skip) => {
          const reasonText = skip.reason.replace(/_/g, ' ')
          skippedReasons.push(`ID ${skip.id}: ${reasonText}`)
        })

        // If there are also resume contacts, show resume dialog next
        if (pendingResumeIds.length > 0) {
          setOnHoldDialogMode('resume')
          setOnHoldDialogOpen(true)
          // Don't clear pendingResumeIds yet, keep for next dialog
          setPendingHoldIds([])

          // Show intermediate success message
          if (totalSuccess > 0) {
            setSnackbar({
              open: true,
              message: `${totalSuccess} contact(s) put on hold. Now processing resume...`,
              severity: 'info',
            })
          }
          return
        }
      } else if (onHoldDialogMode === 'resume' && pendingResumeIds.length > 0) {
        // Process resume requests with optional reason
        const resumeResponse = await resumeContacts(pendingResumeIds, reason || undefined)
        totalSuccess += resumeResponse.success.length
        totalSkipped += resumeResponse.skipped.length

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

      // Clear selection and pending IDs
      setSelected([])
      setSelectedRecordsCache(new Map())
      setPendingHoldIds([])
      setPendingResumeIds([])

      // Reload contacts to reflect the changes if at least one record was updated
      if (totalSuccess > 0) {
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
          } else if (isColumnFilterActive && Object.keys(activeColumnFilters).length > 0) {
            await performColumnFiltersSearch(activeColumnFilters, currentPage)
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
      setPendingHoldIds([])
      setPendingResumeIds([])
    }
  }

  // CSA Eligible handler
  const handleCSAEligible = async () => {
    if (selected.length === 0) return

    // Check if eligibility job is running
    if (await checkAndHandleRunningEligibilityJob()) return

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
      setSelectedRecordsCache(new Map())

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

    // Check if eligibility job is running
    if (await checkAndHandleRunningEligibilityJob()) return

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
      setSelectedRecordsCache(new Map())

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

    // Check if eligibility job is running
    if (await checkAndHandleRunningEligibilityJob()) return

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
      setSelectedRecordsCache(new Map())

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

  // Run Eligibility Query menu handlers
  const handleEligibilityMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setEligibilityMenuAnchor(event.currentTarget)
  }

  const handleEligibilityMenuClose = () => {
    setEligibilityMenuAnchor(null)
  }

  const handleRunEligibilityForAllClick = () => {
    handleEligibilityMenuClose()
    setConfirmRunAllDialogOpen(true)
  }

  const handleConfirmRunAllDialogClose = () => {
    setConfirmRunAllDialogOpen(false)
  }

  const handleRunEligibilityForAll = async () => {
    setConfirmRunAllDialogOpen(false)
    setIsRunningEligibilityAll(true)
    try {
      setSnackbar({
        open: true,
        message: 'Starting eligibility query job...',
        severity: 'info',
      })

      const job: JobRun = await runEligibilityForAllWithPolling((pollJob) => {
        if (pollJob.status === 'RUNNING') {
          const progress = getJobRunProgressUpdate(pollJob, 'Eligibility query is running...')
          setSnackbar({
            open: true,
            message: progress.message,
            severity: progress.severity,
          })
        }
      })

      if (job.status === 'SUCCESS') {
        const metadata = job.metadata as {
          processed?: number
          statusChanges?: number
          skipped?: number
        } | null
        const processed = metadata?.processed ?? 0
        const statusChanges = metadata?.statusChanges ?? 0
        const skipped = metadata?.skipped ?? 0

        const message = `Eligibility complete: ${processed} processed, ${statusChanges} updated, ${skipped} skipped`
        setSnackbar({
          open: true,
          message,
          severity: statusChanges > 0 ? 'success' : 'info',
        })

        // Always refresh the list after eligibility completes to pick up review flag changes
        // (on_hold contacts may have needs_review set without status changes)
        // Preserve current filters/search state when refreshing
        if (isColumnFilterActive && Object.keys(activeColumnFilters).length > 0) {
          await performColumnFiltersSearch(activeColumnFilters, currentPage)
        } else if (isSearchActive && searchTerm.trim().length >= 3) {
          await performFullTextSearch(searchTerm.trim(), currentPage)
        } else {
          await fetchContacts(currentPage)
        }
      } else {
        // Job failed
        const errorMessage = job.error || 'Eligibility query failed'
        throw new Error(errorMessage)
      }
    } catch (error: any) {
      console.error('Run eligibility for all error:', error)
      let rawMessage =
        error?.response?.data?.message || error?.message || 'Failed to run eligibility query'

      // Handle 409 Conflict (job already running)
      if (error?.response?.status === 409) {
        rawMessage = 'An eligibility query is already running. Please wait for it to complete.'
      }

      // Make staging validation errors more user-friendly
      let errorMessage = rawMessage
      if (rawMessage.includes('Staging validation failed: empty tables')) {
        const tableMatch = rawMessage.match(/\[([^\]]+)\]/)
        const tables = tableMatch ? tableMatch[1] : 'some required tables'
        errorMessage = `Cannot run eligibility query: staging data is incomplete. Missing data in: ${tables}. Please ensure all data sources have been synced before running the eligibility query.`
      }

      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error',
      })
    } finally {
      setIsRunningEligibilityAll(false)
      // Refresh the last successful runs timestamps
      getLastSuccessfulRuns()
        .then(setLastSuccessfulRuns)
        .catch((err) => console.error('Failed to refresh last successful runs:', err))
    }
  }

  const handleRunEligibilityForSelected = async () => {
    handleEligibilityMenuClose()
    if (selected.length !== 1) return

    const contactId = selected[0]
    setRunningEligibilityContactId(contactId)
    try {
      setSnackbar({
        open: true,
        message: 'Running eligibility query on selected contact...',
        severity: 'info',
      })

      const result: ContactEligibilityResult = await runEligibilityForContact(contactId)

      const statusChanged = result.previousStatus !== result.newStatus
      const message = statusChanged
        ? `Eligibility updated for contact ${contactId}: ${result.previousStatus || 'none'} → ${result.newStatus}`
        : `No eligibility changes for contact ${contactId}`
      setSnackbar({
        open: true,
        message,
        severity: statusChanged ? 'success' : 'info',
      })

      // Refresh the list if there were changes
      if (statusChanged) {
        if (isSearchActive && searchTerm.trim().length >= 3) {
          await performFullTextSearch(searchTerm.trim(), currentPage)
        } else {
          await fetchContacts(currentPage)
        }
      }
    } catch (error: any) {
      console.error('Run eligibility for contact error:', error)
      const rawMessage =
        error?.response?.data?.message || error?.message || 'Failed to run eligibility query'

      // Make staging validation errors more user-friendly
      let errorMessage = rawMessage
      if (rawMessage.includes('Staging validation failed: empty tables')) {
        const tableMatch = rawMessage.match(/\[([^\]]+)\]/)
        const tables = tableMatch ? tableMatch[1] : 'some required tables'
        errorMessage = `Cannot run eligibility query: staging data is incomplete. Missing data in: ${tables}. Please ensure all data sources have been synced before running the eligibility query.`
      }

      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error',
      })
    } finally {
      setRunningEligibilityContactId(null)
      // Refresh the last successful runs timestamps
      getLastSuccessfulRuns()
        .then(setLastSuccessfulRuns)
        .catch((err) => console.error('Failed to refresh last successful runs:', err))
    }
  }

  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false })
  }

  // Handle Add to Batch button click
  const handleAddToBatch = async () => {
    if (selected.length === 0) return

    // Check if eligibility job is running
    if (await checkAndHandleRunningEligibilityJob()) return

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
      setSelectedRecordsCache(new Map())

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

        // Refresh Batch Requests table
        const updatedBatches = await getAllBatches()
        setBatches(updatedBatches)

        // Refresh Batch Details table for the currently selected batch
        if (selectedBatch) {
          const updatedDetails = await getBatchContacts(selectedBatch)
          setBatchDetails(updatedDetails)
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

  // Add to Batch dropdown menu handlers
  const handleAddToBatchMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAddToBatchMenuAnchor(event.currentTarget)
  }

  const handleAddToBatchMenuClose = () => {
    setAddToBatchMenuAnchor(null)
  }

  const handleAddSelectedToBatch = () => {
    handleAddToBatchMenuClose()
    handleAddToBatch()
  }

  const handleAutoBatchAllClick = () => {
    handleAddToBatchMenuClose()
    setConfirmAutoBatchDialogOpen(true)
  }

  const handleConfirmAutoBatchDialogClose = () => {
    setConfirmAutoBatchDialogOpen(false)
  }

  const handleAutoBatchAll = async () => {
    setConfirmAutoBatchDialogOpen(false)
    setIsRunningAutoBatch(true)
    try {
      setSnackbar({
        open: true,
        message: 'Starting auto-batch job...',
        severity: 'info',
      })

      const job: JobRun = await runAutoBatchWithPolling((pollJob) => {
        if (pollJob.status === 'RUNNING') {
          const progress = getJobRunProgressUpdate(pollJob, 'Auto-batch job is running...')
          setSnackbar({
            open: true,
            message: progress.message,
            severity: progress.severity,
          })
        }
      })

      if (job.status === 'SUCCESS') {
        const metadata = job.metadata as {
          application?: number
          cancellation?: number
          batchId?: number
        } | null
        const application = metadata?.application ?? 0
        const cancellation = metadata?.cancellation ?? 0
        const total = application + cancellation

        const message =
          total > 0
            ? `Auto-batch complete: ${application} application, ${cancellation} cancellation contacts added to batch`
            : 'Auto-batch complete: No eligible contacts found to batch'
        setSnackbar({
          open: true,
          message,
          severity: total > 0 ? 'success' : 'info',
        })

        // Refresh the contacts list and batch tables
        if (total > 0) {
          if (isSearchActive && searchTerm.trim().length >= 3) {
            await performFullTextSearch(searchTerm.trim(), currentPage)
          } else {
            await fetchContacts(currentPage)
          }

          // Refresh Batch Requests table
          const updatedBatches = await getAllBatches()
          setBatches(updatedBatches)

          // Refresh Batch Details table for the currently selected batch
          if (selectedBatch) {
            const updatedDetails = await getBatchContacts(selectedBatch)
            setBatchDetails(updatedDetails)
          }
        }
      } else {
        // Job failed
        const errorMessage = job.error || 'Auto-batch job failed'
        throw new Error(errorMessage)
      }
    } catch (error: any) {
      console.error('Auto-batch error:', error)
      let rawMessage =
        error?.response?.data?.message || error?.message || 'Failed to run auto-batch job'

      // Handle 409 Conflict (job already running)
      if (error?.response?.status === 409) {
        rawMessage = 'An auto-batch job is already running. Please wait for it to complete.'
      }

      setSnackbar({
        open: true,
        message: rawMessage,
        severity: 'error',
      })
    } finally {
      setIsRunningAutoBatch(false)
    }
  }

  // Fetch batch history for selected contact
  const handleContactClick = async (contactId: number) => {
    setSelectedChild(contactId)
    setIsBatchHistoryExpanded(false)
    setIsAuditTrailExpanded(false)
    setRememberedChildId(contactId)
    setLoadingBatchHistory(true)
    setLoadingAuditTrail(true)
    setSelectedBatchHistoryId(null) // Clear batch history selection when changing contacts

    try {
      const [batchHistory, auditTrailResponse] = await Promise.all([
        getContactBatches(contactId),
        getContactAuditTrail(contactId),
      ])
      setContactBatchHistory(batchHistory)
      setContactAuditTrail(auditTrailResponse.data)
    } catch (error) {
      console.error('Failed to fetch contact history data:', error)
      setContactBatchHistory([])
      setContactAuditTrail([])
    } finally {
      setLoadingBatchHistory(false)
      setLoadingAuditTrail(false)
    }
  }

  // Handle clearing the review flag for a contact
  const handleClearReviewFlag = async (contactId: number, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row click

    try {
      await clearReviewFlag(contactId)

      setSnackbar({
        open: true,
        message: 'Review flag cleared successfully',
        severity: 'success',
      })

      // Refresh the contacts list to reflect the change
      if (isSearchActive && searchTerm.trim().length >= 3) {
        await performFullTextSearch(searchTerm.trim(), currentPage)
      } else {
        await fetchContacts(currentPage)
      }
    } catch (error) {
      console.error('Failed to clear review flag:', error)
      setSnackbar({
        open: true,
        message: 'Failed to clear review flag. Please try again.',
        severity: 'error',
      })
    }
  }

  // Handle batch history row click
  const handleBatchHistoryRowClick = (batchHistoryId: number) => {
    setSelectedBatchHistoryId(batchHistoryId)
  }

  // Handle Remove from Batch button click
  const handleRemoveFromBatch = async () => {
    if (!selectedBatchHistoryId || !selectedChild) return

    // Check if eligibility job is running
    if (await checkAndHandleRunningEligibilityJob()) return

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
        if (isColumnFilterActive && Object.keys(activeColumnFilters).length > 0) {
          await performColumnFiltersSearch(activeColumnFilters, currentPage)
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

    // Check if eligibility job is running
    if (await checkAndHandleRunningEligibilityJob()) return

    try {
      // Map selected batch_contact IDs to their corresponding contact IDs
      const contactIds = selectedBatchDetails
        .map((batchContactId) => {
          const detail = batchDetails.find((d) => d.id === batchContactId)
          return detail?.contactId
        })
        .filter((id): id is number => id !== undefined)

      const result = await removeContactsFromBatch(contactIds)

      const updatedRecordCount = result.batch?.recordCount ?? 0
      const removedCount = result.success.length
      const skippedCount = result.skipped.length

      const message =
        skippedCount > 0
          ? `Removed ${removedCount} contact${removedCount !== 1 ? 's' : ''} from batch (${skippedCount} skipped). Record count: ${updatedRecordCount}`
          : `Successfully removed ${removedCount} contact${removedCount !== 1 ? 's' : ''} from batch. Record count: ${updatedRecordCount}`

      setSnackbar({
        open: true,
        message,
        severity: skippedCount > 0 ? 'warning' : 'success',
      })

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
        if (isColumnFilterActive && Object.keys(activeColumnFilters).length > 0) {
          await performColumnFiltersSearch(activeColumnFilters, currentPage)
        } else if (isSearchActive && searchTerm.trim().length >= 3) {
          await performFullTextSearch(searchTerm.trim(), currentPage)
        } else {
          await fetchContacts(currentPage)
        }
      }

      // Refresh Batch Requests table
      const updatedBatches = await getAllBatches()
      setBatches(updatedBatches)

      // Refresh batch details for the selected batch
      if (selectedBatch) {
        const updatedDetails = await getBatchContacts(selectedBatch)
        setBatchDetails(updatedDetails)
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
    // For csaStatus and caseStatus, always start with empty search term since selected item is highlighted
    // For other columns, preserve the search term if this column has an active filter
    if (column === 'csaStatus' || column === 'caseStatus') {
      setFilterSearchTerm('')
    } else if (activeColumnFilters[column]) {
      setFilterSearchTerm(activeColumnFilters[column])
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
    // Remove only this column from active filters
    const newFilters = { ...activeColumnFilters }
    delete newFilters[column]
    setActiveColumnFilters(newFilters)
    setFilterSearchTerm('')

    if (Object.keys(newFilters).length === 0) {
      // No more active filters, fetch regular contacts
      setIsColumnFilterActive(false)
      fetchContacts(currentPage)
    } else {
      // Still have other filters, re-apply them
      performColumnFiltersSearch(newFilters, currentPage)
    }
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
      batchDate: item.batch.batchDate ? formatDateYMD(item.batch.batchDate) : '',
      batchRequestStatus: item.batch.statusLabel || item.batch.status || '',
      transactionType: capitalize(item.transactionType) || '',
      batchDetailStatus: item.statusLabel || item.status || '',
      systemComments: item.systemComments || '',
    }))
    const values = transformedData.map((row) => row[column as keyof typeof row])
    return Array.from(new Set(values)).filter((v) => v !== undefined && v !== '')
  }

  // Audit Trail filter handling functions
  const handleAuditTrailFilterClick = (event: React.MouseEvent<HTMLElement>, column: string) => {
    setAuditTrailFilterAnchor({ element: event.currentTarget, column })
    setAuditTrailFilterSearchTerm('')
  }

  const handleAuditTrailFilterClose = () => {
    setAuditTrailFilterAnchor({ element: null, column: '' })
    setAuditTrailFilterSearchTerm('')
  }

  const handleAuditTrailFilterChange = (column: string, value: string) => {
    setAuditTrailColumnFilters((prev) => {
      const currentFilters = prev[column] || []
      const newFilters = currentFilters.includes(value)
        ? currentFilters.filter((v) => v !== value)
        : [...currentFilters, value]
      return { ...prev, [column]: newFilters }
    })
  }

  const clearAuditTrailColumnFilter = (column: string) => {
    setAuditTrailColumnFilters((prev) => ({ ...prev, [column]: [] }))
  }

  const getAuditTrailUniqueValues = (column: string) => {
    const values = contactAuditTrail.map((row) => row[column as keyof ContactAuditTrailEntry])
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
    // Clear batch selection and details when column filters are applied
    setSelectedBatch(null)
    setBatchDetails([])
    setSelectedBatchDetails([])
  }

  const clearBatchRequestsColumnFilter = (column: string) => {
    setBatchRequestsColumnFilters((prev) => ({ ...prev, [column]: [] }))
    // Clear batch selection and details when column filter is cleared
    setSelectedBatch(null)
    setBatchDetails([])
    setSelectedBatchDetails([])
  }

  const getBatchRequestsUniqueValues = (column: string) => {
    const values = batches.map((batch) => {
      // Map API fields to display fields - must match filteredBatchRequests transformation
      switch (column) {
        case 'batchId':
          return String(batch.id)
        case 'batchDate':
          return batch.batchDate ? formatDateYMD(batch.batchDate) : ''
        case 'status':
          return batch.statusLabel || batch.status
        case 'recordCount':
          return String(batch.recordCount)
        case 'createdDate':
          return formatDateTimeYMD(batch.createdAt)
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

  // Batch History sort handling functions
  const handleBatchHistorySortClick = (event: React.MouseEvent<HTMLElement>, column: string) => {
    setBatchHistorySortAnchor({ element: event.currentTarget, column })
  }

  const handleBatchHistorySortClose = () => {
    setBatchHistorySortAnchor({ element: null, column: '' })
  }

  const handleBatchHistorySort = (column: string, direction: 'asc' | 'desc') => {
    setBatchHistorySortConfig({ column, direction })
    handleBatchHistorySortClose()
  }

  // Audit Trail sort handling functions
  const handleAuditTrailSortClick = (event: React.MouseEvent<HTMLElement>, column: string) => {
    setAuditTrailSortAnchor({ element: event.currentTarget, column })
  }

  const handleAuditTrailSortClose = () => {
    setAuditTrailSortAnchor({ element: null, column: '' })
  }

  const handleAuditTrailSort = (column: string, direction: 'asc' | 'desc') => {
    setAuditTrailSortConfig({ column, direction })
    handleAuditTrailSortClose()
  }

  // Batch Requests sort handling functions
  const handleBatchRequestsSortClick = (event: React.MouseEvent<HTMLElement>, column: string) => {
    setBatchRequestsSortAnchor({ element: event.currentTarget, column })
  }

  const handleBatchRequestsSortClose = () => {
    setBatchRequestsSortAnchor({ element: null, column: '' })
  }

  const handleBatchRequestsSort = (column: string, direction: 'asc' | 'desc') => {
    setBatchRequestsSortConfig({ column, direction })
    handleBatchRequestsSortClose()
  }

  // Batch Details sort handling functions
  const handleBatchDetailsSortClick = (event: React.MouseEvent<HTMLElement>, column: string) => {
    setBatchDetailsSortAnchor({ element: event.currentTarget, column })
  }

  const handleBatchDetailsSortClose = () => {
    setBatchDetailsSortAnchor({ element: null, column: '' })
  }

  const handleBatchDetailsSort = (column: string, direction: 'asc' | 'desc') => {
    setBatchDetailsSortConfig({ column, direction })
    handleBatchDetailsSortClose()
  }

  // Apply filters and sorting to data - always use API data
  // Note: Sorting is now handled by the backend API, so we just transform the data here
  const filteredData = useMemo(() => {
    const data = contacts
      .filter((contact) => !shouldHideEligibilityListContact(contact))
      .map((contact) => ({
        id: contact.id,
        firstName: contact.firstName || '',
        middleName: contact.middleName || '',
        lastName: contact.lastName || '',
        akaLastName: contact.akaLastName || '',
        akaFirstName: contact.akaFirstName || '',
        personIdIcm: contact.personIdIcm || '',
        personIdMis: contact.personIdMis || '',
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
        effectiveDate: contact.effectiveDate ? formatDateYMD(contact.effectiveDate) : '',
        expiryDate: contact.expiryDate ? formatDateYMD(contact.expiryDate) : '',
        // Birth location
        birthCity: contact.birthCity || '',
        birthProvince: contact.birthProvince || '',
        birthCountry: contact.birthCountry || '',
        // Placement fields
        placementLocation: contact.placementLocation || '',
        locationType: contact.locationType || '',
        locationSubType: contact.locationSubType || '',
        placementStatus: contact.placementStatus || '',
        actualStartDate: contact.actualStartDate ? formatDateYMD(contact.actualStartDate) : '',
        actualEndDate: contact.actualEndDate ? formatDateYMD(contact.actualEndDate) : '',
        paidUnpaid: contact.paidUnpaid || '',
        sourcePlacement: contact.sourcePlacement || '',
        // Service provider and agreement fields
        serviceProviderName: contact.serviceProviderName || '',
        providerId: contact.providerId || '',
        placeOfServiceName: contact.placeOfServiceName || '',
        agreementType: contact.agreementType || '',
        agreementStatus: contact.agreementStatus || '',
        agreementStartDate: contact.agreementStartDate
          ? formatDateYMD(contact.agreementStartDate)
          : '',
        agreementEndDate: contact.agreementEndDate ? formatDateYMD(contact.agreementEndDate) : '',
        terminationDate: contact.terminationDate ? formatDateYMD(contact.terminationDate) : '',
        mcfdContract: contact.mcfdContract || '',
        product: contact.product || '',
        isOver18: contact.isOver18 || false,
        cgwrks3: contact.holdBy || '',
        holdReason: contact.holdReason || '',
        lastUpdated: contact.lastUpdatedAt ? formatDateTimeYMDHMS(contact.lastUpdatedAt) : '',
        lastUpdatedBy: contact.lastUpdatedBy || '',
        needsReview: contact.needsReview || false,
      }))

    return data
  }, [contacts])

  useEffect(() => {
    if (selectedChild === null) return

    const stillVisible = filteredData.some((child) => child.id === selectedChild)
    if (!stillVisible) {
      clearSelectedChildContext()
    }
  }, [selectedChild, filteredData])

  useEffect(() => {
    if (selectedChild !== null || rememberedChildId === null) return

    const shouldRestore = filteredData.some((child) => child.id === rememberedChildId)
    if (!shouldRestore) return

    const restoreSelectedChildContext = async () => {
      const requestId = ++restoreBatchHistoryRequestId.current
      setSelectedChild(rememberedChildId)
      setLoadingBatchHistory(true)
      setSelectedBatchHistoryId(null)

      try {
        const batchHistory = await getContactBatches(rememberedChildId)
        if (requestId === restoreBatchHistoryRequestId.current) {
          setContactBatchHistory(batchHistory)
        }
      } catch (error) {
        console.error('Failed to restore batch history:', error)
        if (requestId === restoreBatchHistoryRequestId.current) {
          setContactBatchHistory([])
        }
      } finally {
        if (requestId === restoreBatchHistoryRequestId.current) {
          setLoadingBatchHistory(false)
        }
      }
    }

    restoreSelectedChildContext()
  }, [selectedChild, rememberedChildId, filteredData])

  // Check if all selected records have valid CSA status for Hold/Resume
  const canHoldResume = useMemo(() => {
    if (selected.length === 0) return false

    return selected.every((id) => {
      const cached = selectedRecordsCache.get(id)
      return cached && VALID_CSA_STATUSES.includes(cached.csaStatusRaw)
    })
  }, [selected, selectedRecordsCache])

  // Check if all selected records have valid CSA status for Add to Batch
  const canAddToBatch = useMemo(() => {
    if (selected.length === 0) return false

    return selected.every((id) => {
      const cached = selectedRecordsCache.get(id)
      return cached && VALID_BATCH_STATUSES.includes(cached.csaStatusRaw)
    })
  }, [selected, selectedRecordsCache])

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
      const cached = selectedRecordsCache.get(id)
      return (
        cached &&
        (cached.csaStatusRaw === 'not_eligible_out_of_pay' ||
          cached.csaStatusRaw === 'not_eligible_ip_tbd')
      )
    })
  }, [selected, selectedRecordsCache])

  // Check if CSA Not Eligible button should be enabled
  const canUpdateNotEligible = useMemo(() => {
    if (selected.length === 0) return false

    // Only enable if all selected records have eligible statuses
    return selected.every((id) => {
      const cached = selectedRecordsCache.get(id)
      return (
        cached &&
        (cached.csaStatusRaw === 'eligible_tbd' ||
          cached.csaStatusRaw === 'in_pay' ||
          cached.csaStatusRaw === 'on_hold')
      )
    })
  }, [selected, selectedRecordsCache])

  // Check if Child Over 18 button should be enabled
  const canUpdateOver18 = useMemo(() => {
    if (selected.length === 0) return false

    // Only enable if all selected records have isOver18 flag set to true
    // AND have eligible_tbd or not_eligible_ip_tbd status
    return selected.every((id) => {
      const cached = selectedRecordsCache.get(id)
      return (
        cached &&
        cached.isOver18 === true &&
        (cached.csaStatusRaw === 'eligible_tbd' || cached.csaStatusRaw === 'not_eligible_ip_tbd')
      )
    })
  }, [selected, selectedRecordsCache])

  // Filter batch history data (frontend-only filtering)
  const filteredBatchHistory = useMemo(() => {
    // Map API data to match the expected table structure
    let data = contactBatchHistory.map((item) => ({
      id: item.id,
      batchId: String(item.batch.id),
      batchDate: item.batch.batchDate ? formatDateYMD(item.batch.batchDate) : '',
      batchRequestStatus: item.batch.statusLabel || item.batch.status || '',
      transactionType: capitalize(item.transactionType) || '',
      effectiveDate: item.effectiveDate ? formatDateYMD(item.effectiveDate) : '',
      batchDetailStatus: item.statusLabel || item.status || '',
      systemComments: item.systemComments || '',
    }))

    // Apply global search across all columns
    if (batchHistorySearchTerm) {
      const searchLower = batchHistorySearchTerm.toLowerCase()
      data = data.filter((row) => {
        return (
          row.batchId.toLowerCase().includes(searchLower) ||
          row.batchDate.toLowerCase().includes(searchLower) ||
          row.batchRequestStatus.toLowerCase().includes(searchLower) ||
          row.transactionType.toLowerCase().includes(searchLower) ||
          row.effectiveDate.toLowerCase().includes(searchLower) ||
          row.batchDetailStatus.toLowerCase().includes(searchLower) ||
          row.systemComments.toLowerCase().includes(searchLower)
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

    // Apply sorting
    if (batchHistorySortConfig) {
      const { column, direction } = batchHistorySortConfig
      const dateColumns = ['batchDate', 'effectiveDate']
      data.sort((a, b) => {
        const aValue = String(a[column as keyof typeof a] || '')
        const bValue = String(b[column as keyof typeof b] || '')

        // Use date parsing for date columns
        if (dateColumns.includes(column)) {
          const aDate = parseFormattedDate(aValue)
          const bDate = parseFormattedDate(bValue)
          if (aDate && bDate) {
            const comparison = aDate.getTime() - bDate.getTime()
            return direction === 'asc' ? comparison : -comparison
          }
          // If one or both dates are invalid, fall back to string comparison
          if (aDate && !bDate) return direction === 'asc' ? 1 : -1
          if (!aDate && bDate) return direction === 'asc' ? -1 : 1
        }

        const comparison = aValue.localeCompare(bValue, undefined, { numeric: true })
        return direction === 'asc' ? comparison : -comparison
      })
    }

    return data
  }, [
    contactBatchHistory,
    batchHistorySearchTerm,
    batchHistoryColumnFilters,
    batchHistorySortConfig,
  ])

  // Paginated batch history
  const paginatedBatchHistory = useMemo(() => {
    const startIndex = (batchHistoryPage - 1) * BATCH_PAGE_SIZE
    return filteredBatchHistory.slice(startIndex, startIndex + BATCH_PAGE_SIZE)
  }, [filteredBatchHistory, batchHistoryPage])

  const batchHistoryTotalPages = useMemo(() => {
    return Math.ceil(filteredBatchHistory.length / BATCH_PAGE_SIZE)
  }, [filteredBatchHistory.length])

  // Filter audit trail data (frontend-only filtering)
  const filteredAuditTrail = useMemo(() => {
    let data = [...contactAuditTrail]

    // Apply global search across all columns
    if (auditTrailSearchTerm) {
      const searchLower = auditTrailSearchTerm.toLowerCase()
      data = data.filter((row) => {
        return (
          row.date.toLowerCase().includes(searchLower) ||
          row.actionedBy.toLowerCase().includes(searchLower) ||
          row.operation.toLowerCase().includes(searchLower) ||
          row.field.toLowerCase().includes(searchLower) ||
          row.oldValue.toLowerCase().includes(searchLower) ||
          row.newValue.toLowerCase().includes(searchLower)
        )
      })
    }

    // Apply column-specific filters
    for (const [column, filters] of Object.entries(auditTrailColumnFilters)) {
      if (filters.length > 0) {
        data = data.filter((row) => {
          const columnValue = String(row[column as keyof ContactAuditTrailEntry])
          return filters.includes(columnValue)
        })
      }
    }

    // Apply sorting
    if (auditTrailSortConfig) {
      const { column, direction } = auditTrailSortConfig
      const dateColumns = ['date']
      data.sort((a, b) => {
        const aValue = String(a[column as keyof ContactAuditTrailEntry] || '')
        const bValue = String(b[column as keyof ContactAuditTrailEntry] || '')

        if (dateColumns.includes(column)) {
          const aDate = parseFormattedDate(aValue)
          const bDate = parseFormattedDate(bValue)
          if (aDate && bDate) {
            const comparison = aDate.getTime() - bDate.getTime()
            return direction === 'asc' ? comparison : -comparison
          }
          if (aDate && !bDate) return direction === 'asc' ? 1 : -1
          if (!aDate && bDate) return direction === 'asc' ? -1 : 1
        }

        const comparison = aValue.localeCompare(bValue, undefined, { numeric: true })
        return direction === 'asc' ? comparison : -comparison
      })
    }

    return data
  }, [contactAuditTrail, auditTrailSearchTerm, auditTrailColumnFilters, auditTrailSortConfig])

  // Paginated audit trail
  const paginatedAuditTrail = useMemo(() => {
    const startIndex = (auditTrailPage - 1) * BATCH_PAGE_SIZE
    return filteredAuditTrail.slice(startIndex, startIndex + BATCH_PAGE_SIZE)
  }, [filteredAuditTrail, auditTrailPage])

  const auditTrailTotalPages = useMemo(() => {
    return Math.ceil(filteredAuditTrail.length / BATCH_PAGE_SIZE)
  }, [filteredAuditTrail.length])

  // Filter batch requests data
  const filteredBatchRequests = useMemo(() => {
    // Transform API data to match table structure
    let data = batches.map((batch) => ({
      id: batch.id,
      batchId: String(batch.id),
      batchDate: batch.batchDate ? formatDateYMD(batch.batchDate) : '',
      status: batch.statusLabel || batch.status,
      recordCount: batch.recordCount,
      initiatedBy: batch.initiatedBy || '',
      createdDate: formatDateTimeYMD(batch.createdAt),
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
          row.initiatedBy.toLowerCase().includes(searchLower) ||
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

    // Apply sorting
    if (batchRequestsSortConfig) {
      const { column, direction } = batchRequestsSortConfig
      const dateColumns = ['batchDate', 'createdDate']
      data.sort((a, b) => {
        const aValue = String(a[column as keyof typeof a] || '')
        const bValue = String(b[column as keyof typeof b] || '')

        // Use date parsing for date columns
        if (dateColumns.includes(column)) {
          const aDate = parseFormattedDate(aValue)
          const bDate = parseFormattedDate(bValue)
          if (aDate && bDate) {
            const comparison = aDate.getTime() - bDate.getTime()
            return direction === 'asc' ? comparison : -comparison
          }
          // If one or both dates are invalid, fall back to string comparison
          if (aDate && !bDate) return direction === 'asc' ? 1 : -1
          if (!aDate && bDate) return direction === 'asc' ? -1 : 1
        }

        const comparison = aValue.localeCompare(bValue, undefined, { numeric: true })
        return direction === 'asc' ? comparison : -comparison
      })
    }

    return data
  }, [batches, batchRequestsSearchTerm, batchRequestsColumnFilters, batchRequestsSortConfig])

  // Get batch details for selected batch
  const currentBatchDetails = useMemo(() => {
    // Transform API data to match table structure
    return batchDetails.map((detail) => ({
      id: detail.id,
      contactId: detail.contactId,
      lastName: detail.contact.lastName,
      givenName: detail.contact.firstName,
      middleName: detail.contact.middleName || '',
      caseNumber: detail.caseNumber || '',
      transactionType: capitalize(detail.transactionType),
      effectiveDate: detail.effectiveDate ? formatDateYMD(detail.effectiveDate) : '',
      cancellationReason:
        detail.cancelReasonCode && detail.cancelReasonLabel
          ? `${detail.cancelReasonCode} - ${detail.cancelReasonLabel}`
          : detail.cancelReasonCode || '',
      status: detail.statusLabel || detail.status || '',
      systemComments: detail.systemComments || '',
      addedBy: detail.createdBy || '',
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
          row.givenName.toLowerCase().includes(searchLower) ||
          row.middleName.toLowerCase().includes(searchLower) ||
          row.caseNumber.toLowerCase().includes(searchLower) ||
          row.transactionType.toLowerCase().includes(searchLower) ||
          row.effectiveDate.toLowerCase().includes(searchLower) ||
          row.cancellationReason.toLowerCase().includes(searchLower) ||
          row.status.toLowerCase().includes(searchLower) ||
          row.systemComments.toLowerCase().includes(searchLower) ||
          row.addedBy.toLowerCase().includes(searchLower)
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

    // Apply sorting
    if (batchDetailsSortConfig) {
      const { column, direction } = batchDetailsSortConfig
      const dateColumns = ['effectiveDate']
      data.sort((a, b) => {
        const aValue = String(a[column as keyof typeof a] || '')
        const bValue = String(b[column as keyof typeof b] || '')

        // Use date parsing for date columns
        if (dateColumns.includes(column)) {
          const aDate = parseFormattedDate(aValue)
          const bDate = parseFormattedDate(bValue)
          if (aDate && bDate) {
            const comparison = aDate.getTime() - bDate.getTime()
            return direction === 'asc' ? comparison : -comparison
          }
          // If one or both dates are invalid, fall back to string comparison
          if (aDate && !bDate) return direction === 'asc' ? 1 : -1
          if (!aDate && bDate) return direction === 'asc' ? -1 : 1
        }

        const comparison = aValue.localeCompare(bValue, undefined, { numeric: true })
        return direction === 'asc' ? comparison : -comparison
      })
    }

    return data
  }, [
    currentBatchDetails,
    batchDetailsSearchTerm,
    batchDetailsColumnFilters,
    batchDetailsSortConfig,
  ])

  // Paginated batch requests
  const paginatedBatchRequests = useMemo(() => {
    const startIndex = (batchRequestsPage - 1) * BATCH_PAGE_SIZE
    return filteredBatchRequests.slice(startIndex, startIndex + BATCH_PAGE_SIZE)
  }, [filteredBatchRequests, batchRequestsPage])

  const batchRequestsTotalPages = useMemo(() => {
    return Math.ceil(filteredBatchRequests.length / BATCH_PAGE_SIZE)
  }, [filteredBatchRequests.length])

  // Paginated batch details
  const paginatedBatchDetails = useMemo(() => {
    const startIndex = (batchDetailsPage - 1) * BATCH_PAGE_SIZE
    return filteredBatchDetails.slice(startIndex, startIndex + BATCH_PAGE_SIZE)
  }, [filteredBatchDetails, batchDetailsPage])

  const batchDetailsTotalPages = useMemo(() => {
    return Math.ceil(filteredBatchDetails.length / BATCH_PAGE_SIZE)
  }, [filteredBatchDetails.length])

  // Reset pagination when filters/search change
  useEffect(() => {
    setBatchRequestsPage(1)
  }, [batchRequestsSearchTerm, batchRequestsColumnFilters])

  useEffect(() => {
    setBatchDetailsPage(1)
  }, [batchDetailsSearchTerm, batchDetailsColumnFilters, selectedBatch])

  useEffect(() => {
    setBatchHistoryPage(1)
  }, [batchHistorySearchTerm, batchHistoryColumnFilters, selectedChild])

  useEffect(() => {
    setAuditTrailPage(1)
  }, [auditTrailSearchTerm, auditTrailColumnFilters, selectedChild])

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
          backgroundColor: getEnvBackgroundColor(getRuntimeConfig()?.VITE_APP_ENV),
          boxShadow: 'none',
          borderBottom: '1px solid #e0e0e0',
          flexShrink: 0,
        }}
      >
        <Toolbar sx={{ padding: '8px 24px', justifyContent: 'center', position: 'relative' }}>
          {getRuntimeConfig()?.VITE_APP_ENV && getRuntimeConfig()?.VITE_APP_ENV !== 'PROD' && (
            <Typography
              variant="body2"
              sx={{
                position: 'absolute',
                left: 24,
                color: '#666',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              {getRuntimeConfig()?.VITE_APP_ENV}
            </Typography>
          )}
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
                {user?.idirUsername || user?.email || user?.name || 'User'}
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
            </Box>
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
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
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

            {/* Last Successful Runs Info */}
            <Box
              sx={{
                padding: '6px 12px',
                mr: 2,
                textAlign: 'left',
                border: '1px solid #666',
                borderRadius: '4px',
              }}
            >
              <Typography variant="body2" sx={{ color: '#333', fontSize: '0.75rem' }}>
                Last Data Fetch: {formatJobTimestamp(lastSuccessfulRuns.lastDataIngestion)}
              </Typography>
              <Typography variant="body2" sx={{ color: '#333', fontSize: '0.75rem' }}>
                Last Eligibility Run: {formatJobTimestamp(lastSuccessfulRuns.lastEligibilityRun)}
              </Typography>
            </Box>
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
                    <Tooltip title="Clear all column filters and sorting" arrow>
                      <span>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<FilterAltOffIcon />}
                          disabled={
                            !isColumnFilterActive &&
                            !sortConfig &&
                            Object.keys(activeColumnFilters).length === 0
                          }
                          onClick={() => {
                            // Clear all column filters and sorting
                            // Note: Don't call fetchContacts explicitly - the useEffect
                            // watching these state variables will trigger the fetch
                            setActiveColumnFilters({})
                            setIsColumnFilterActive(false)
                            setSortConfig(null)
                            setCurrentPage(1)
                          }}
                          sx={{
                            textTransform: 'none',
                            minWidth: 'auto',
                            '&.Mui-disabled': {
                              opacity: 0.5,
                            },
                          }}
                        >
                          Clear Filters
                        </Button>
                      </span>
                    </Tooltip>
                    <FormControl size="small" sx={{ minWidth: 250 }}>
                      <Select
                        value={preDefinedFilter}
                        onChange={(e) => handlePreDefinedFilterChange(e.target.value)}
                        displayEmpty
                      >
                        <MenuItem value="All Records">All Children in CSA Master</MenuItem>
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
                      variant="outlined"
                      size="small"
                      onClick={handleEligibilityMenuOpen}
                      disabled={isRunningEligibilityAll}
                      sx={{
                        textTransform: 'none',
                      }}
                    >
                      {isRunningEligibilityAll ? 'Running Eligibility...' : 'Run Eligibility Query'}
                      <Tooltip
                        title="Run eligibility rules against staging data to update contact CSA status"
                        arrow
                      >
                        <InfoOutlinedIcon
                          fontSize="small"
                          sx={{ ml: 0.5, fontSize: '16px', color: 'inherit' }}
                        />
                      </Tooltip>
                      <Box component="span" sx={{ ml: 0.5 }}>
                        ▾
                      </Box>
                    </Button>
                    <Menu
                      anchorEl={eligibilityMenuAnchor}
                      open={eligibilityMenuOpen}
                      onClose={handleEligibilityMenuClose}
                    >
                      <MenuItem
                        onClick={handleRunEligibilityForAllClick}
                        disabled={isRunningEligibilityAll}
                        sx={{ fontSize: '0.85rem' }}
                      >
                        Run query on all contacts
                      </MenuItem>
                      {selected.length === 1 && (
                        <MenuItem
                          onClick={handleRunEligibilityForSelected}
                          disabled={isRunningEligibilityAll}
                          sx={{ fontSize: '0.85rem' }}
                        >
                          Run query on selected contact
                        </MenuItem>
                      )}
                    </Menu>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleAddToBatchMenuOpen}
                      disabled={isRunningEligibilityAll || isRunningAutoBatch}
                      sx={{
                        textTransform: 'none',
                        '&.Mui-disabled': {
                          opacity: 0.5,
                          cursor: 'not-allowed',
                        },
                      }}
                    >
                      {isRunningAutoBatch ? 'Running Auto-batch...' : 'Add to Batch'}
                      <Box component="span" sx={{ ml: 0.5 }}>
                        ▾
                      </Box>
                    </Button>
                    <Menu
                      anchorEl={addToBatchMenuAnchor}
                      open={addToBatchMenuOpen}
                      onClose={handleAddToBatchMenuClose}
                    >
                      <MenuItem
                        onClick={handleAddSelectedToBatch}
                        disabled={!canAddToBatch || isRunningEligibilityAll || isRunningAutoBatch}
                        sx={{ fontSize: '0.85rem' }}
                      >
                        Add selected items to batch
                      </MenuItem>
                      <MenuItem
                        onClick={handleAutoBatchAllClick}
                        disabled={isRunningEligibilityAll || isRunningAutoBatch}
                        sx={{ fontSize: '0.85rem' }}
                      >
                        Add System determined Eligible/NE kids to Batch
                      </MenuItem>
                    </Menu>
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={!canHoldResume || isRunningEligibilityAll || isRunningAutoBatch}
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
                      disabled={
                        !canUpdateEligibility || isRunningEligibilityAll || isRunningAutoBatch
                      }
                      onClick={handleCSAEligible}
                      sx={{
                        textTransform: 'none',
                        backgroundColor:
                          canUpdateEligibility && !isRunningEligibilityAll && !isRunningAutoBatch
                            ? '#1976d2'
                            : undefined,
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
                      disabled={
                        !canUpdateNotEligible || isRunningEligibilityAll || isRunningAutoBatch
                      }
                      onClick={handleCSANotEligible}
                      sx={{
                        textTransform: 'none',
                        backgroundColor:
                          canUpdateNotEligible && !isRunningEligibilityAll && !isRunningAutoBatch
                            ? '#d32f2f'
                            : undefined,
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
                      disabled={!canUpdateOver18 || isRunningEligibilityAll || isRunningAutoBatch}
                      onClick={handleChildOver18}
                      sx={{
                        textTransform: 'none',
                        backgroundColor:
                          canUpdateOver18 && !isRunningEligibilityAll && !isRunningAutoBatch
                            ? '#ff9800'
                            : undefined,
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

                {/* Eligibility running banner */}
                {isRunningEligibilityAll && (
                  <Box sx={{ mb: 2 }}>
                    <Alert severity="info" sx={{ mb: 1 }}>
                      Eligibility Query is running. Please do not make any manual CSA transitions
                      while the job is in progress. This banner will disappear once the job is
                      complete.
                    </Alert>
                    <LinearProgress />
                  </Box>
                )}

                {/* Auto-batch running banner */}
                {isRunningAutoBatch && (
                  <Box sx={{ mb: 2 }}>
                    <Alert severity="info" sx={{ mb: 1 }}>
                      Children are being added to a &apos;Pending&apos; batch. Please do not make
                      any manual CSA transitions while the job is in progress. This banner will
                      disappear once the job is complete.
                    </Alert>
                    <LinearProgress />
                  </Box>
                )}

                {/* Table */}
                <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                        <TableCell padding="checkbox">
                          <Tooltip
                            title={
                              selected.length > 0
                                ? `Clear all ${selected.length} selected record(s) across all pages`
                                : 'Select all records on this page'
                            }
                            arrow
                          >
                            <Checkbox
                              disabled={isRunningEligibilityAll || isRunningAutoBatch}
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
                                  // Update cache with current page records
                                  setSelectedRecordsCache((prev) => {
                                    const newCache = new Map(prev)
                                    filteredData.forEach((row) => {
                                      newCache.set(row.id, {
                                        csaStatusRaw: row.csaStatusRaw,
                                        isOver18: row.isOver18,
                                      })
                                    })
                                    return newCache
                                  })
                                } else {
                                  // Clear ALL selections across ALL pages
                                  setSelected([])
                                  setSelectedRecordsCache(new Map())
                                }
                              }}
                            />
                          </Tooltip>
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
                                  activeColumnFilters['lastName'] ||
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
                                  activeColumnFilters['firstName'] ||
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
                              Middle Name(s)
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'middleName')}
                              sx={{
                                padding: 0.5,
                                color:
                                  activeColumnFilters['middleName'] ||
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
                                  activeColumnFilters['din'] || columnFilters.din?.length > 0
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
                                  activeColumnFilters['csaStatus'] ||
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
                                  activeColumnFilters['caseNumber'] ||
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
                                  activeColumnFilters['caseStatus'] ||
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
                                  activeColumnFilters['legacyFile'] ||
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
                                  activeColumnFilters['cgwrks3'] ||
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
                              onClick={(e) => handleSortClick(e, 'holdReason')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Reason
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'holdReason')}
                              sx={{
                                padding: 0.5,
                                color:
                                  activeColumnFilters['holdReason'] ||
                                  columnFilters.holdReason?.length > 0
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
                              onClick={(e) => handleSortClick(e, 'needsReview')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Review
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'needsReview')}
                              sx={{
                                padding: 0.5,
                                color:
                                  activeColumnFilters['needsReview'] ||
                                  columnFilters.needsReview?.length > 0
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
                              Last Updated Date
                            </span>
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
                                  activeColumnFilters['lastUpdatedBy'] ||
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
                            cursor: runningEligibilityContactId === row.id ? 'wait' : 'pointer',
                            backgroundColor:
                              runningEligibilityContactId === row.id
                                ? '#fff3e0'
                                : selectedChild === row.id
                                  ? '#e0e0e0'
                                  : 'inherit',
                            opacity: runningEligibilityContactId === row.id ? 0.7 : 1,
                          }}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              disabled={
                                isRunningEligibilityAll ||
                                isRunningAutoBatch ||
                                runningEligibilityContactId === row.id
                              }
                              checked={selected.includes(row.id)}
                              onChange={(e) => {
                                e.stopPropagation()
                                if (selected.includes(row.id)) {
                                  setSelected((prev) => prev.filter((id) => id !== row.id))
                                  setSelectedRecordsCache((prev) => {
                                    const newCache = new Map(prev)
                                    newCache.delete(row.id)
                                    return newCache
                                  })
                                } else {
                                  setSelected((prev) => [...prev, row.id])
                                  setSelectedRecordsCache((prev) => {
                                    const newCache = new Map(prev)
                                    newCache.set(row.id, {
                                      csaStatusRaw: row.csaStatusRaw,
                                      isOver18: row.isOver18,
                                    })
                                    return newCache
                                  })
                                }
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
                          <TableCell
                            sx={
                              row.holdReason && row.holdReason.length > HOLD_REASON_PREVIEW_LENGTH
                                ? { minWidth: 390, maxWidth: 450 }
                                : undefined
                            }
                          >
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                              {row.holdReason ? (
                                row.holdReason.length > HOLD_REASON_PREVIEW_LENGTH ? (
                                  <Tooltip title={row.holdReason} arrow>
                                    <Typography
                                      component="span"
                                      sx={{
                                        maxWidth: 430,
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        fontSize: 'inherit',
                                        display: 'inline-block',
                                      }}
                                    >
                                      {getHoldReasonPreview(row.holdReason)}
                                    </Typography>
                                  </Tooltip>
                                ) : (
                                  <Typography
                                    component="span"
                                    sx={{
                                      whiteSpace: 'normal',
                                      wordBreak: 'break-word',
                                      fontSize: 'inherit',
                                    }}
                                  >
                                    {row.holdReason}
                                  </Typography>
                                )
                              ) : (
                                <Typography component="span" />
                              )}
                              {row.csaStatusRaw === 'on_hold' && (
                                <Tooltip title="Edit hold reason">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleEditHoldReason(row.id, row.holdReason || '')
                                    }}
                                    sx={{
                                      padding: 0.25,
                                      color: '#1976d2',
                                      '&:hover': {
                                        backgroundColor: '#e3f2fd',
                                      },
                                    }}
                                  >
                                    <EditIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                              {row.csaStatusRaw !== 'on_hold' && row.holdReason && (
                                <Tooltip title="Clear hold reason">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => handleClearHoldReason(row.id, e)}
                                    sx={{
                                      padding: 0.25,
                                      color: '#9e9e9e',
                                      '&:hover': {
                                        backgroundColor: '#f5f5f5',
                                        color: '#d32f2f',
                                      },
                                    }}
                                  >
                                    <CloseIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell align="center">
                            {row.needsReview && (
                              <Tooltip title="Click to clear review flag">
                                <IconButton
                                  size="small"
                                  onClick={(e) => handleClearReviewFlag(row.id, e)}
                                  sx={{
                                    padding: 0.5,
                                    color: '#ff9800',
                                    '&:hover': {
                                      backgroundColor: '#fff3e0',
                                    },
                                  }}
                                >
                                  <WarningAmberIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </TableCell>
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
                        Filter by {COLUMN_LABELS[filterAnchor.column] || filterAnchor.column}
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
                    {filterAnchor.column === 'csaStatus' ? (
                      <>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="Search status..."
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
                        <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
                          {CSA_STATUS_FILTER_OPTIONS.filter((option) =>
                            option.label.toLowerCase().includes(filterSearchTerm.toLowerCase()),
                          ).map((option) => (
                            <MenuItem
                              key={option.value}
                              onClick={() => {
                                const newFilters = {
                                  ...activeColumnFilters,
                                  csaStatus: option.value,
                                }
                                setActiveColumnFilters(newFilters)
                                performColumnFiltersSearch(newFilters, 1)
                                setCurrentPage(1)
                                setIsColumnFilterActive(true)
                                handleFilterClose()
                              }}
                              sx={{
                                fontSize: '0.875rem',
                                py: 0.75,
                                backgroundColor:
                                  activeColumnFilters['csaStatus'] === option.value
                                    ? 'rgba(25, 118, 210, 0.08)'
                                    : 'transparent',
                              }}
                            >
                              {option.label}
                            </MenuItem>
                          ))}
                        </Box>
                      </>
                    ) : filterAnchor.column === 'caseStatus' ? (
                      <>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="Search status..."
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
                        <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
                          {CASE_STATUS_FILTER_OPTIONS.filter((option) =>
                            option.label.toLowerCase().includes(filterSearchTerm.toLowerCase()),
                          ).map((option) => (
                            <MenuItem
                              key={option.value}
                              onClick={() => {
                                const newFilters = {
                                  ...activeColumnFilters,
                                  caseStatus: option.value,
                                }
                                setActiveColumnFilters(newFilters)
                                performColumnFiltersSearch(newFilters, 1)
                                setCurrentPage(1)
                                setIsColumnFilterActive(true)
                                handleFilterClose()
                              }}
                              sx={{
                                fontSize: '0.875rem',
                                py: 0.75,
                                backgroundColor:
                                  activeColumnFilters['caseStatus'] === option.value
                                    ? 'rgba(25, 118, 210, 0.08)'
                                    : 'transparent',
                              }}
                            >
                              {option.label}
                            </MenuItem>
                          ))}
                        </Box>
                      </>
                    ) : filterAnchor.column === 'holdReason' ? (
                      <>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="Type reason to filter..."
                          value={filterSearchTerm}
                          onChange={(e) => setFilterSearchTerm(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && filterSearchTerm.trim()) {
                              const newFilters = {
                                ...activeColumnFilters,
                                holdReason: filterSearchTerm.trim(),
                              }
                              setActiveColumnFilters(newFilters)
                              performColumnFiltersSearch(newFilters, 1)
                              setCurrentPage(1)
                              setIsColumnFilterActive(true)
                              handleFilterClose()
                            }
                          }}
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
                        <Button
                          variant="contained"
                          size="small"
                          fullWidth
                          disabled={!filterSearchTerm.trim()}
                          onClick={() => {
                            const newFilters = {
                              ...activeColumnFilters,
                              holdReason: filterSearchTerm.trim(),
                            }
                            setActiveColumnFilters(newFilters)
                            performColumnFiltersSearch(newFilters, 1)
                            setCurrentPage(1)
                            setIsColumnFilterActive(true)
                            handleFilterClose()
                          }}
                        >
                          Apply Filter
                        </Button>
                      </>
                    ) : filterAnchor.column === 'needsReview' ? (
                      <>
                        <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
                          {REVIEW_FILTER_OPTIONS.map((option) => (
                            <MenuItem
                              key={option.value}
                              onClick={() => {
                                const newFilters = {
                                  ...activeColumnFilters,
                                  needsReview: option.value,
                                }
                                setActiveColumnFilters(newFilters)
                                performColumnFiltersSearch(newFilters, 1)
                                setCurrentPage(1)
                                setIsColumnFilterActive(true)
                                handleFilterClose()
                              }}
                              sx={{
                                fontSize: '0.875rem',
                                py: 0.75,
                                backgroundColor:
                                  activeColumnFilters['needsReview'] === option.value
                                    ? 'rgba(25, 118, 210, 0.08)'
                                    : 'transparent',
                              }}
                            >
                              {option.label}
                            </MenuItem>
                          ))}
                        </Box>
                      </>
                    ) : (
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
                    )}
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

                {/* Batch History Sort Menu */}
                <Menu
                  anchorEl={batchHistorySortAnchor.element}
                  open={Boolean(batchHistorySortAnchor.element)}
                  onClose={handleBatchHistorySortClose}
                  PaperProps={{
                    sx: {
                      width: 200,
                    },
                  }}
                >
                  <MenuItem
                    onClick={() => handleBatchHistorySort(batchHistorySortAnchor.column, 'asc')}
                    sx={{ gap: 1.5 }}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                    <Typography variant="body2">Sort Ascending</Typography>
                  </MenuItem>
                  <MenuItem
                    onClick={() => handleBatchHistorySort(batchHistorySortAnchor.column, 'desc')}
                    sx={{ gap: 1.5 }}
                  >
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
                        Filter by{' '}
                        {COLUMN_LABELS[batchHistoryFilterAnchor.column] ||
                          batchHistoryFilterAnchor.column}
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
                    {batchHistoryFilterAnchor.column === 'status' ? (
                      <>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="Search status..."
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
                        <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
                          {BATCH_STATUS_FILTER_OPTIONS.filter((option) =>
                            option.label
                              .toLowerCase()
                              .includes(batchHistoryFilterSearchTerm.toLowerCase()),
                          ).map((option) => (
                            <Box
                              key={option.value}
                              sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}
                            >
                              <Checkbox
                                size="small"
                                checked={
                                  batchHistoryColumnFilters['status']?.includes(option.value) ||
                                  false
                                }
                                onChange={() =>
                                  handleBatchHistoryFilterChange('status', option.value)
                                }
                              />
                              <Typography variant="body2">{option.label}</Typography>
                            </Box>
                          ))}
                        </Box>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
                  </Box>
                </Menu>

                {/* Audit Trail Sort Menu */}
                <Menu
                  anchorEl={auditTrailSortAnchor.element}
                  open={Boolean(auditTrailSortAnchor.element)}
                  onClose={handleAuditTrailSortClose}
                  PaperProps={{
                    sx: {
                      width: 200,
                    },
                  }}
                >
                  <MenuItem
                    onClick={() => handleAuditTrailSort(auditTrailSortAnchor.column, 'asc')}
                    sx={{ gap: 1.5 }}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                    <Typography variant="body2">Sort Ascending</Typography>
                  </MenuItem>
                  <MenuItem
                    onClick={() => handleAuditTrailSort(auditTrailSortAnchor.column, 'desc')}
                    sx={{ gap: 1.5 }}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                    <Typography variant="body2">Sort Descending</Typography>
                  </MenuItem>
                </Menu>

                {/* Audit Trail Filter Menu */}
                <Menu
                  anchorEl={auditTrailFilterAnchor.element}
                  open={Boolean(auditTrailFilterAnchor.element)}
                  onClose={handleAuditTrailFilterClose}
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
                        Filter by{' '}
                        {COLUMN_LABELS[auditTrailFilterAnchor.column] ||
                          auditTrailFilterAnchor.column}
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => {
                          clearAuditTrailColumnFilter(auditTrailFilterAnchor.column)
                          handleAuditTrailFilterClose()
                        }}
                        sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                      >
                        Clear
                      </Button>
                    </Box>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Search"
                      value={auditTrailFilterSearchTerm}
                      onChange={(e) => setAuditTrailFilterSearchTerm(e.target.value)}
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
                      {auditTrailFilterAnchor.column &&
                        getAuditTrailUniqueValues(auditTrailFilterAnchor.column)
                          .sort()
                          .filter((value) =>
                            String(value)
                              .toLowerCase()
                              .includes(auditTrailFilterSearchTerm.toLowerCase()),
                          )
                          .map((value) => (
                            <Box
                              key={String(value)}
                              sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}
                            >
                              <Checkbox
                                size="small"
                                checked={
                                  auditTrailColumnFilters[auditTrailFilterAnchor.column]?.includes(
                                    String(value),
                                  ) || false
                                }
                                onChange={() =>
                                  handleAuditTrailFilterChange(
                                    auditTrailFilterAnchor.column,
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
                          onClick={() => clearSelectedChildContext(true)}
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
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Child/Youth Name
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {[childData.firstName, childData.middleName, childData.lastName]
                                      .filter(Boolean)
                                      .join(' ') || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Gender
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.gender || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Person ID ICM
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.personIdIcm || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Person ID MIS
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.personIdMis || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    DIN
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.din || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    AKA Last Name
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.akaLastName || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    AKA First Name
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.akaFirstName || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Birth Place
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
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
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Age
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.age ?? '-'}
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
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Case Status
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.caseStatus || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Case Number
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.caseNumber || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Case Type
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.caseType || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Caseload
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.caseLoad || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Legacy File No.
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.legacyFile || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Service Office
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.serviceOffice || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Assigned to
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.assignedTo || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Effective Legal Status
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.effectiveLegalStatus || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Effective Date
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.effectiveDate || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Expiry Date
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
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
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Placement/Location No.
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.placementLocation || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Type
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.locationType || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Sub-type
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.locationSubType || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Status
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.placementStatus || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Actual Start Date
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.actualStartDate || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Actual End Date
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.actualEndDate || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Paid/Unpaid
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.paidUnpaid || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Source
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
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
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Provider Name
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.serviceProviderName || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Provider ID
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.providerId || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Place of Service
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.placeOfServiceName || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Source
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
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

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Agreement Type
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.agreementType || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Agreement Status
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.agreementStatus || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Start Date
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.agreementStartDate || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    End Date
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.agreementEndDate || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Termination Date
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.terminationDate || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    MCFD Contract No.
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {childData.mcfdContract || '-'}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 2,
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ color: '#666', minWidth: '140px', flexShrink: 0 }}
                                  >
                                    Product
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      textAlign: 'left',
                                      wordBreak: 'break-word',
                                    }}
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
                    <Paper sx={{ p: 0, overflow: 'hidden' }}>
                      <Box
                        onClick={() => setIsBatchHistoryExpanded((prev) => !prev)}
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          px: 3,
                          py: 2,
                          backgroundColor: '#f5f5f5',
                          borderBottom: isBatchHistoryExpanded ? '1px solid #e0e0e0' : 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography
                            variant="h6"
                            sx={{
                              fontWeight: 500,
                              ...(contactBatchHistory.length === 0 && {
                                fontStyle: 'italic',
                                color: '#999',
                              }),
                            }}
                          >
                            Batch History ({contactBatchHistory.length})
                          </Typography>
                          <Tooltip
                            title="Complete history of all batch submissions for the selected child, including batch status and transaction types."
                            arrow
                          >
                            <IconButton
                              size="small"
                              sx={{ padding: 0.5 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <InfoOutlinedIcon fontSize="small" sx={{ color: '#666' }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#666' }}>
                          <Typography variant="body2">
                            {isBatchHistoryExpanded ? 'Collapse' : 'Expand'}
                          </Typography>
                          {isBatchHistoryExpanded ? (
                            <ArrowUpwardIcon fontSize="small" />
                          ) : (
                            <ArrowDownwardIcon fontSize="small" />
                          )}
                        </Box>
                      </Box>

                      {isBatchHistoryExpanded && (
                        <Box sx={{ p: 3 }}>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'flex-end',
                              alignItems: 'center',
                              mb: 3,
                              borderBottom: '1px solid #e0e0e0',
                              pb: 2,
                            }}
                          >
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
                              <Tooltip title="Clear all filters and sorting" arrow>
                                <span>
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<FilterAltOffIcon />}
                                    disabled={
                                      !batchHistorySearchTerm &&
                                      !batchHistorySortConfig &&
                                      Object.values(batchHistoryColumnFilters).every(
                                        (arr) => arr.length === 0,
                                      )
                                    }
                                    onClick={() => {
                                      setBatchHistorySearchTerm('')
                                      setBatchHistoryColumnFilters({
                                        batchId: [],
                                        batchDate: [],
                                        batchRequestStatus: [],
                                        transactionType: [],
                                        batchDetailStatus: [],
                                        systemComments: [],
                                      })
                                      setBatchHistorySortConfig(null)
                                      setBatchHistoryPage(1)
                                    }}
                                    sx={{
                                      textTransform: 'none',
                                      minWidth: 'auto',
                                      '&.Mui-disabled': {
                                        opacity: 0.5,
                                      },
                                    }}
                                  >
                                    Clear Filters
                                  </Button>
                                </span>
                              </Tooltip>
                              <Button
                                variant="contained"
                                size="small"
                                disabled={!canRemoveFromBatch || isRunningEligibilityAll}
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
                                      <span
                                        onClick={(e) => handleBatchHistorySortClick(e, 'batchId')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        Batch ID
                                      </span>
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
                                      <span
                                        onClick={(e) => handleBatchHistorySortClick(e, 'batchDate')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        Batch Date
                                      </span>
                                    </Box>
                                  </TableCell>
                                  <TableCell sx={{ fontWeight: 600 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <span
                                        onClick={(e) =>
                                          handleBatchHistorySortClick(e, 'batchRequestStatus')
                                        }
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        Batch Request Status
                                      </span>
                                      <IconButton
                                        size="small"
                                        onClick={(e) =>
                                          handleBatchHistoryFilterClick(e, 'batchRequestStatus')
                                        }
                                        sx={{
                                          padding: 0.5,
                                          color:
                                            batchHistoryColumnFilters.batchRequestStatus?.length > 0
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
                                      <span
                                        onClick={(e) =>
                                          handleBatchHistorySortClick(e, 'transactionType')
                                        }
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        Transaction Type
                                      </span>
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
                                  <TableCell sx={{ fontWeight: 600 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <span
                                        onClick={(e) =>
                                          handleBatchHistorySortClick(e, 'effectiveDate')
                                        }
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        Effective Date
                                      </span>
                                    </Box>
                                  </TableCell>
                                  <TableCell sx={{ fontWeight: 600 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <span
                                        onClick={(e) =>
                                          handleBatchHistorySortClick(e, 'batchDetailStatus')
                                        }
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        Batch Detail Status
                                      </span>
                                      <IconButton
                                        size="small"
                                        onClick={(e) =>
                                          handleBatchHistoryFilterClick(e, 'batchDetailStatus')
                                        }
                                        sx={{
                                          padding: 0.5,
                                          color:
                                            batchHistoryColumnFilters.batchDetailStatus?.length > 0
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
                                      <span
                                        onClick={(e) =>
                                          handleBatchHistorySortClick(e, 'systemComments')
                                        }
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        System Comments
                                      </span>
                                      <IconButton
                                        size="small"
                                        onClick={(e) =>
                                          handleBatchHistoryFilterClick(e, 'systemComments')
                                        }
                                        sx={{
                                          padding: 0.5,
                                          color:
                                            batchHistoryColumnFilters.systemComments?.length > 0
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
                                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                      <Typography variant="body2" color="text.secondary">
                                        Loading batch history...
                                      </Typography>
                                    </TableCell>
                                  </TableRow>
                                ) : filteredBatchHistory.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                      <Typography variant="body2" color="text.secondary">
                                        {selectedChild
                                          ? 'No batch history found for this contact'
                                          : 'Select a contact to view batch history'}
                                      </Typography>
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  paginatedBatchHistory.map((row) => (
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
                                      <TableCell>{row.batchDate}</TableCell>
                                      <TableCell>
                                        {row.batchRequestStatus === 'Pending' && (
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
                                        {row.batchRequestStatus !== 'Pending' &&
                                          row.batchRequestStatus}
                                      </TableCell>
                                      <TableCell>{row.transactionType}</TableCell>
                                      <TableCell>{row.effectiveDate}</TableCell>
                                      <TableCell>{row.batchDetailStatus}</TableCell>
                                      <TableCell>{row.systemComments}</TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </TableContainer>
                          {/* Batch History Pagination */}
                          {filteredBatchHistory.length > 0 && (
                            <Box
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                mt: 2,
                                px: 2,
                                pb: 2,
                              }}
                            >
                              <Typography variant="body2" color="text.secondary">
                                Showing {paginatedBatchHistory.length} of{' '}
                                {filteredBatchHistory.length} records
                              </Typography>
                              <Pagination
                                count={batchHistoryTotalPages}
                                page={batchHistoryPage}
                                onChange={(_, page) => setBatchHistoryPage(page)}
                                color="primary"
                                showFirstButton
                                showLastButton
                              />
                            </Box>
                          )}
                        </Box>
                      )}
                    </Paper>
                  </Box>
                )}

                {/* Audit Trail Section */}
                {selectedChild !== null && (
                  <Box sx={{ mt: 3 }}>
                    <Paper sx={{ p: 0, overflow: 'hidden' }}>
                      <Box
                        onClick={() => setIsAuditTrailExpanded((prev) => !prev)}
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          px: 3,
                          py: 2,
                          backgroundColor: '#f5f5f5',
                          borderBottom: isAuditTrailExpanded ? '1px solid #e0e0e0' : 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography
                            variant="h6"
                            sx={{
                              fontWeight: 500,
                              ...(contactAuditTrail.length === 0 && {
                                fontStyle: 'italic',
                                color: '#999',
                              }),
                            }}
                          >
                            CSA Audit Trail ({contactAuditTrail.length})
                          </Typography>
                          <Tooltip
                            title="Audit entries for selected fields on this contact. Most recent updates appear first."
                            arrow
                          >
                            <IconButton
                              size="small"
                              sx={{ padding: 0.5 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <InfoOutlinedIcon fontSize="small" sx={{ color: '#666' }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#666' }}>
                          <Typography variant="body2">
                            {isAuditTrailExpanded ? 'Collapse' : 'Expand'}
                          </Typography>
                          {isAuditTrailExpanded ? (
                            <ArrowUpwardIcon fontSize="small" />
                          ) : (
                            <ArrowDownwardIcon fontSize="small" />
                          )}
                        </Box>
                      </Box>

                      {isAuditTrailExpanded && (
                        <Box sx={{ p: 3 }}>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'flex-end',
                              alignItems: 'center',
                              mb: 3,
                              borderBottom: '1px solid #e0e0e0',
                              pb: 2,
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <TextField
                                size="small"
                                placeholder="Search audit trail..."
                                value={auditTrailSearchTerm}
                                onChange={(e) => setAuditTrailSearchTerm(e.target.value)}
                                InputProps={{
                                  startAdornment: (
                                    <InputAdornment position="start">
                                      <Box component="span" sx={{ fontSize: '18px' }}>
                                        🔍
                                      </Box>
                                    </InputAdornment>
                                  ),
                                  endAdornment: auditTrailSearchTerm && (
                                    <InputAdornment position="end">
                                      <IconButton
                                        size="small"
                                        onClick={() => setAuditTrailSearchTerm('')}
                                        edge="end"
                                      >
                                        <CloseIcon fontSize="small" />
                                      </IconButton>
                                    </InputAdornment>
                                  ),
                                }}
                                sx={{ width: '300px' }}
                              />
                              <Tooltip title="Clear all filters and sorting" arrow>
                                <span>
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<FilterAltOffIcon />}
                                    disabled={
                                      !auditTrailSearchTerm &&
                                      !auditTrailSortConfig &&
                                      Object.values(auditTrailColumnFilters).every(
                                        (arr) => arr.length === 0,
                                      )
                                    }
                                    onClick={() => {
                                      setAuditTrailSearchTerm('')
                                      setAuditTrailColumnFilters({
                                        date: [],
                                        actionedBy: [],
                                        operation: [],
                                        field: [],
                                        oldValue: [],
                                        newValue: [],
                                      })
                                      setAuditTrailSortConfig(null)
                                      setAuditTrailPage(1)
                                    }}
                                    sx={{
                                      textTransform: 'none',
                                      minWidth: 'auto',
                                      '&.Mui-disabled': {
                                        opacity: 0.5,
                                      },
                                    }}
                                  >
                                    Clear Filters
                                  </Button>
                                </span>
                              </Tooltip>
                            </Box>
                          </Box>

                          {/* Audit Trail Table */}
                          <TableContainer>
                            <Table size="small">
                              <TableHead>
                                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                                  <TableCell sx={{ fontWeight: 600 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <span
                                        onClick={(e) => handleAuditTrailSortClick(e, 'date')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        Date
                                      </span>
                                      <IconButton
                                        size="small"
                                        onClick={(e) => handleAuditTrailFilterClick(e, 'date')}
                                        sx={{
                                          padding: 0.5,
                                          color:
                                            auditTrailColumnFilters.date?.length > 0
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
                                      <span
                                        onClick={(e) => handleAuditTrailSortClick(e, 'actionedBy')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        Actioned By
                                      </span>
                                      <IconButton
                                        size="small"
                                        onClick={(e) =>
                                          handleAuditTrailFilterClick(e, 'actionedBy')
                                        }
                                        sx={{
                                          padding: 0.5,
                                          color:
                                            auditTrailColumnFilters.actionedBy?.length > 0
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
                                      <span
                                        onClick={(e) => handleAuditTrailSortClick(e, 'operation')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        Operation
                                      </span>
                                      <IconButton
                                        size="small"
                                        onClick={(e) => handleAuditTrailFilterClick(e, 'operation')}
                                        sx={{
                                          padding: 0.5,
                                          color:
                                            auditTrailColumnFilters.operation?.length > 0
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
                                      <span
                                        onClick={(e) => handleAuditTrailSortClick(e, 'field')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        Field
                                      </span>
                                      <IconButton
                                        size="small"
                                        onClick={(e) => handleAuditTrailFilterClick(e, 'field')}
                                        sx={{
                                          padding: 0.5,
                                          color:
                                            auditTrailColumnFilters.field?.length > 0
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
                                      <span
                                        onClick={(e) => handleAuditTrailSortClick(e, 'oldValue')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        Old Value
                                      </span>
                                      <IconButton
                                        size="small"
                                        onClick={(e) => handleAuditTrailFilterClick(e, 'oldValue')}
                                        sx={{
                                          padding: 0.5,
                                          color:
                                            auditTrailColumnFilters.oldValue?.length > 0
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
                                      <span
                                        onClick={(e) => handleAuditTrailSortClick(e, 'newValue')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                      >
                                        New Value
                                      </span>
                                      <IconButton
                                        size="small"
                                        onClick={(e) => handleAuditTrailFilterClick(e, 'newValue')}
                                        sx={{
                                          padding: 0.5,
                                          color:
                                            auditTrailColumnFilters.newValue?.length > 0
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
                                {loadingAuditTrail ? (
                                  <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                      <Typography variant="body2" color="text.secondary">
                                        Loading audit trail...
                                      </Typography>
                                    </TableCell>
                                  </TableRow>
                                ) : filteredAuditTrail.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                      <Typography variant="body2" color="text.secondary">
                                        {selectedChild
                                          ? 'No audit trail found for this contact'
                                          : 'Select a contact to view audit trail'}
                                      </Typography>
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  paginatedAuditTrail.map((row) => (
                                    <TableRow
                                      key={row.id}
                                      hover
                                      sx={{ '&:hover': { backgroundColor: '#f9f9f9' } }}
                                    >
                                      <TableCell>{row.date}</TableCell>
                                      <TableCell>{row.actionedBy}</TableCell>
                                      <TableCell>{row.operation}</TableCell>
                                      <TableCell>{row.field}</TableCell>
                                      <TableCell>{row.oldValue}</TableCell>
                                      <TableCell>{row.newValue}</TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </TableContainer>

                          {/* Audit Trail Pagination */}
                          {filteredAuditTrail.length > 0 && (
                            <Box
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                mt: 2,
                                px: 2,
                                pb: 2,
                              }}
                            >
                              <Typography variant="body2" color="text.secondary">
                                Showing {paginatedAuditTrail.length} of {filteredAuditTrail.length}{' '}
                                records
                              </Typography>
                              <Pagination
                                count={auditTrailTotalPages}
                                page={auditTrailPage}
                                onChange={(_, page) => setAuditTrailPage(page)}
                                color="primary"
                                showFirstButton
                                showLastButton
                              />
                            </Box>
                          )}
                        </Box>
                      )}
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
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
                    <Tooltip title="Clear all filters and sorting" arrow>
                      <span>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<FilterAltOffIcon />}
                          disabled={
                            !batchRequestsSearchTerm &&
                            !batchRequestsSortConfig &&
                            Object.values(batchRequestsColumnFilters).every(
                              (arr) => arr.length === 0,
                            )
                          }
                          onClick={() => {
                            setBatchRequestsSearchTerm('')
                            setBatchRequestsColumnFilters({
                              batchId: [],
                              batchDate: [],
                              status: [],
                              recordCount: [],
                              initiatedBy: [],
                              createdDate: [],
                              systemComments: [],
                            })
                            setBatchRequestsSortConfig(null)
                            setBatchRequestsPage(1)
                          }}
                          sx={{
                            textTransform: 'none',
                            minWidth: 'auto',
                            '&.Mui-disabled': {
                              opacity: 0.5,
                            },
                          }}
                        >
                          Clear Filters
                        </Button>
                      </span>
                    </Tooltip>
                  </Box>
                </Box>

                {/* Batch Requests Table */}
                <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleBatchRequestsSortClick(e, 'batchId')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Batch ID
                            </span>
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
                            <span
                              onClick={(e) => handleBatchRequestsSortClick(e, 'batchDate')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Batch Date
                            </span>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleBatchRequestsSortClick(e, 'status')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Batch Status
                            </span>
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
                            <span
                              onClick={(e) => handleBatchRequestsSortClick(e, 'recordCount')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Record Count
                            </span>
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
                            <span
                              onClick={(e) => handleBatchRequestsSortClick(e, 'initiatedBy')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Initiated By
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => handleBatchRequestsFilterClick(e, 'initiatedBy')}
                              sx={{
                                padding: 0.5,
                                color:
                                  batchRequestsColumnFilters.initiatedBy?.length > 0
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
                            <span
                              onClick={(e) => handleBatchRequestsSortClick(e, 'createdDate')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              Created Date
                            </span>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span
                              onClick={(e) => handleBatchRequestsSortClick(e, 'systemComments')}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                            >
                              System Comments
                            </span>
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
                          <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                            <Typography variant="body2" color="text.secondary">
                              Loading batch requests...
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : filteredBatchRequests.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                            <Typography variant="body2" color="text.secondary">
                              No batch requests found
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedBatchRequests.map((row) => (
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
                            <TableCell>{row.initiatedBy}</TableCell>
                            <TableCell>{row.createdDate}</TableCell>
                            <TableCell>{row.systemComments}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Batch Requests Pagination */}
                {filteredBatchRequests.length > 0 && (
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
                      Showing {paginatedBatchRequests.length} of {filteredBatchRequests.length}{' '}
                      records
                    </Typography>
                    <Pagination
                      count={batchRequestsTotalPages}
                      page={batchRequestsPage}
                      onChange={(_, page) => setBatchRequestsPage(page)}
                      color="primary"
                      showFirstButton
                      showLastButton
                    />
                  </Box>
                )}

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
                      <Tooltip title="Clear all filters and sorting" arrow>
                        <span>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<FilterAltOffIcon />}
                            disabled={
                              !batchDetailsSearchTerm &&
                              !batchDetailsSortConfig &&
                              Object.values(batchDetailsColumnFilters).every(
                                (arr) => arr.length === 0,
                              )
                            }
                            onClick={() => {
                              setBatchDetailsSearchTerm('')
                              setBatchDetailsColumnFilters({
                                lastName: [],
                                middleName: [],
                                givenName: [],
                                caseNumber: [],
                                transactionType: [],
                                cancellationReason: [],
                                status: [],
                                systemComments: [],
                                addedBy: [],
                              })
                              setBatchDetailsSortConfig(null)
                              setBatchDetailsPage(1)
                            }}
                            sx={{
                              textTransform: 'none',
                              minWidth: 'auto',
                              '&.Mui-disabled': {
                                opacity: 0.5,
                              },
                            }}
                          >
                            Clear Filters
                          </Button>
                        </span>
                      </Tooltip>
                      <Button
                        variant="contained"
                        size="small"
                        disabled={!canRemoveFromBatchDetails || isRunningEligibilityAll}
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
                              disabled={isRunningEligibilityAll || isRunningAutoBatch}
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
                              <span
                                onClick={(e) => handleBatchDetailsSortClick(e, 'lastName')}
                                style={{ cursor: 'pointer', userSelect: 'none' }}
                              >
                                Last Name
                              </span>
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
                              <span
                                onClick={(e) => handleBatchDetailsSortClick(e, 'givenName')}
                                style={{ cursor: 'pointer', userSelect: 'none' }}
                              >
                                First Name
                              </span>
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
                              <span
                                onClick={(e) => handleBatchDetailsSortClick(e, 'middleName')}
                                style={{ cursor: 'pointer', userSelect: 'none' }}
                              >
                                Middle Name(s)
                              </span>
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
                              <span
                                onClick={(e) => handleBatchDetailsSortClick(e, 'caseNumber')}
                                style={{ cursor: 'pointer', userSelect: 'none' }}
                              >
                                Case Number
                              </span>
                              <IconButton
                                size="small"
                                onClick={(e) => handleBatchDetailsFilterClick(e, 'caseNumber')}
                                sx={{
                                  padding: 0.5,
                                  color:
                                    batchDetailsColumnFilters.caseNumber?.length > 0
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
                              <span
                                onClick={(e) => handleBatchDetailsSortClick(e, 'transactionType')}
                                style={{ cursor: 'pointer', userSelect: 'none' }}
                              >
                                Transaction Type
                              </span>
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
                              <span
                                onClick={(e) => handleBatchDetailsSortClick(e, 'effectiveDate')}
                                style={{ cursor: 'pointer', userSelect: 'none' }}
                              >
                                Effective Date
                              </span>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <span
                                onClick={(e) =>
                                  handleBatchDetailsSortClick(e, 'cancellationReason')
                                }
                                style={{ cursor: 'pointer', userSelect: 'none' }}
                              >
                                Reason for Cancellation
                              </span>
                              <IconButton
                                size="small"
                                onClick={(e) =>
                                  handleBatchDetailsFilterClick(e, 'cancellationReason')
                                }
                                sx={{
                                  padding: 0.5,
                                  color:
                                    batchDetailsColumnFilters.cancellationReason?.length > 0
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
                              <span
                                onClick={(e) => handleBatchDetailsSortClick(e, 'status')}
                                style={{ cursor: 'pointer', userSelect: 'none' }}
                              >
                                Record Status
                              </span>
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
                              <span
                                onClick={(e) => handleBatchDetailsSortClick(e, 'systemComments')}
                                style={{ cursor: 'pointer', userSelect: 'none' }}
                              >
                                System Comments
                              </span>
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
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <span
                                onClick={(e) => handleBatchDetailsSortClick(e, 'addedBy')}
                                style={{ cursor: 'pointer', userSelect: 'none' }}
                              >
                                Added By
                              </span>
                              <IconButton
                                size="small"
                                onClick={(e) => handleBatchDetailsFilterClick(e, 'addedBy')}
                                sx={{
                                  padding: 0.5,
                                  color:
                                    batchDetailsColumnFilters.addedBy?.length > 0
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
                            <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
                              <Typography variant="body2" color="text.secondary">
                                Loading batch details...
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ) : filteredBatchDetails.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
                              <Typography variant="body2" color="text.secondary">
                                {selectedBatch
                                  ? 'No contacts found in this batch'
                                  : 'Select a batch to view details'}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedBatchDetails.map((row) => (
                            <TableRow
                              key={row.id}
                              hover
                              sx={{ '&:hover': { backgroundColor: '#f9f9f9' } }}
                            >
                              <TableCell padding="checkbox">
                                <Checkbox
                                  disabled={isRunningEligibilityAll || isRunningAutoBatch}
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
                              <TableCell>{row.givenName}</TableCell>
                              <TableCell>{row.middleName}</TableCell>
                              <TableCell>{row.caseNumber}</TableCell>
                              <TableCell>{row.transactionType}</TableCell>
                              <TableCell>{row.effectiveDate}</TableCell>
                              <TableCell>{row.cancellationReason}</TableCell>
                              <TableCell>{row.status}</TableCell>
                              <TableCell>{row.systemComments}</TableCell>
                              <TableCell>{row.addedBy}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  {/* Batch Details Pagination */}
                  {filteredBatchDetails.length > 0 && (
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
                        Showing {paginatedBatchDetails.length} of {filteredBatchDetails.length}{' '}
                        records
                      </Typography>
                      <Pagination
                        count={batchDetailsTotalPages}
                        page={batchDetailsPage}
                        onChange={(_, page) => setBatchDetailsPage(page)}
                        color="primary"
                        showFirstButton
                        showLastButton
                      />
                    </Box>
                  )}
                </Box>
              </Box>
            )}
          </Box>

          {/* Sort and Filter Menus - Outside tabs so they're always available */}

          {/* Batch Requests Sort Menu */}
          <Menu
            anchorEl={batchRequestsSortAnchor.element}
            open={Boolean(batchRequestsSortAnchor.element)}
            onClose={handleBatchRequestsSortClose}
            PaperProps={{
              sx: {
                width: 200,
              },
            }}
          >
            <MenuItem
              onClick={() => handleBatchRequestsSort(batchRequestsSortAnchor.column, 'asc')}
              sx={{ gap: 1.5 }}
            >
              <ArrowUpwardIcon fontSize="small" />
              <Typography variant="body2">Sort Ascending</Typography>
            </MenuItem>
            <MenuItem
              onClick={() => handleBatchRequestsSort(batchRequestsSortAnchor.column, 'desc')}
              sx={{ gap: 1.5 }}
            >
              <ArrowDownwardIcon fontSize="small" />
              <Typography variant="body2">Sort Descending</Typography>
            </MenuItem>
          </Menu>

          {/* Batch Details Sort Menu */}
          <Menu
            anchorEl={batchDetailsSortAnchor.element}
            open={Boolean(batchDetailsSortAnchor.element)}
            onClose={handleBatchDetailsSortClose}
            PaperProps={{
              sx: {
                width: 200,
              },
            }}
          >
            <MenuItem
              onClick={() => handleBatchDetailsSort(batchDetailsSortAnchor.column, 'asc')}
              sx={{ gap: 1.5 }}
            >
              <ArrowUpwardIcon fontSize="small" />
              <Typography variant="body2">Sort Ascending</Typography>
            </MenuItem>
            <MenuItem
              onClick={() => handleBatchDetailsSort(batchDetailsSortAnchor.column, 'desc')}
              sx={{ gap: 1.5 }}
            >
              <ArrowDownwardIcon fontSize="small" />
              <Typography variant="body2">Sort Descending</Typography>
            </MenuItem>
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
                  Filter by{' '}
                  {COLUMN_LABELS[batchRequestsFilterAnchor.column] ||
                    batchRequestsFilterAnchor.column}
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
              {batchRequestsFilterAnchor.column === 'status' ? (
                <>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Search status..."
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
                  <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
                    {BATCH_STATUS_FILTER_OPTIONS.filter((option) =>
                      option.label
                        .toLowerCase()
                        .includes(batchRequestsFilterSearchTerm.toLowerCase()),
                    ).map((option) => (
                      <Box
                        key={option.value}
                        sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}
                      >
                        <Checkbox
                          size="small"
                          checked={
                            batchRequestsColumnFilters['status']?.includes(option.value) || false
                          }
                          onChange={() => handleBatchRequestsFilterChange('status', option.value)}
                        />
                        <Typography variant="body2">{option.label}</Typography>
                      </Box>
                    ))}
                  </Box>
                </>
              ) : batchRequestsFilterAnchor.column === 'initiatedBy' ? (
                <>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Search initiated by..."
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
                  <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
                    {INITIATED_BY_FILTER_OPTIONS.filter((option) =>
                      option.label
                        .toLowerCase()
                        .includes(batchRequestsFilterSearchTerm.toLowerCase()),
                    ).map((option) => (
                      <Box
                        key={option.value}
                        sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}
                      >
                        <Checkbox
                          size="small"
                          checked={
                            batchRequestsColumnFilters['initiatedBy']?.includes(option.value) ||
                            false
                          }
                          onChange={() =>
                            handleBatchRequestsFilterChange('initiatedBy', option.value)
                          }
                        />
                        <Typography variant="body2">{option.label}</Typography>
                      </Box>
                    ))}
                  </Box>
                </>
              ) : (
                <>
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
                                batchRequestsColumnFilters[
                                  batchRequestsFilterAnchor.column
                                ]?.includes(String(value)) || false
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
                </>
              )}
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
                  Filter by{' '}
                  {COLUMN_LABELS[batchDetailsFilterAnchor.column] ||
                    batchDetailsFilterAnchor.column}
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
              {batchDetailsFilterAnchor.column === 'status' ? (
                <>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Search status..."
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
                  <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
                    {BATCH_DETAILS_STATUS_FILTER_OPTIONS.filter((option) =>
                      option.label
                        .toLowerCase()
                        .includes(batchDetailsFilterSearchTerm.toLowerCase()),
                    ).map((option) => (
                      <Box
                        key={option.value}
                        sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}
                      >
                        <Checkbox
                          size="small"
                          checked={
                            batchDetailsColumnFilters['status']?.includes(option.value) || false
                          }
                          onChange={() => handleBatchDetailsFilterChange('status', option.value)}
                        />
                        <Typography variant="body2">{option.label}</Typography>
                      </Box>
                    ))}
                  </Box>
                </>
              ) : (
                <>
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
                                  batchDetailsColumnFilters[
                                    batchDetailsFilterAnchor.column
                                  ]?.includes(String(value)) || false
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
                </>
              )}
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

      {/* Confirmation Dialog for Run Eligibility on All Contacts */}
      <Dialog
        open={confirmRunAllDialogOpen}
        onClose={handleConfirmRunAllDialogClose}
        aria-labelledby="confirm-run-all-dialog-title"
        aria-describedby="confirm-run-all-dialog-description"
      >
        <DialogTitle id="confirm-run-all-dialog-title">Confirm Eligibility Query</DialogTitle>
        <DialogContent>
          <DialogContentText id="confirm-run-all-dialog-description">
            CSA Eligibility Query will be run for all children. Do you wish to proceed?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleConfirmRunAllDialogClose} color="inherit">
            No
          </Button>
          <Button onClick={handleRunEligibilityForAll} variant="contained" autoFocus>
            Yes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog for Auto-batch All Contacts */}
      <Dialog
        open={confirmAutoBatchDialogOpen}
        onClose={handleConfirmAutoBatchDialogClose}
        aria-labelledby="confirm-auto-batch-dialog-title"
        aria-describedby="confirm-auto-batch-dialog-description"
      >
        <DialogTitle id="confirm-auto-batch-dialog-title">
          Add System determined Eligible/NE kids to Batch
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="confirm-auto-batch-dialog-description">
            All children with CSA Status &apos;Eligible&apos; or &apos;Not Eligible - In Pay&apos;
            will get added to a &apos;Pending&apos; batch request. Do you wish to proceed?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleConfirmAutoBatchDialogClose} color="inherit">
            No
          </Button>
          <Button onClick={handleAutoBatchAll} variant="contained" autoFocus>
            Yes
          </Button>
        </DialogActions>
      </Dialog>

      {/* On Hold Dialog for entering reason */}
      <OnHoldDialog
        open={onHoldDialogOpen}
        onClose={handleOnHoldDialogClose}
        onConfirm={handleOnHoldDialogConfirm}
        mode={onHoldDialogMode}
        initialReason={onHoldDialogMode === 'edit' ? editingContactReason : ''}
      />

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
