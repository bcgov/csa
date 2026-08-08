import AccessTimeIcon from '@mui/icons-material/AccessTime'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CloseIcon from '@mui/icons-material/Close'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff'
import FilterListIcon from '@mui/icons-material/FilterList'
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
  IconButton,
  InputAdornment,
  LinearProgress,
  Menu,
  MenuItem,
  Pagination,
  Paper,
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
import '../App.css'
import EligibilityListPage from '../components/eligibility/EligibilityListPage'
import JobMonitoringTab from '../components/JobMonitoringTab'
import WeeklyFileProcessingTab from '../components/WeeklyFileProcessingTab'
import { getRuntimeConfig } from '../config/keycloak.config'
import { useAuth } from '../context/AuthContext'
import logo from '../icons/image.png'
import {
  getAllBatches,
  getBatchContacts,
  getJobRunProgressUpdate,
  getLastSuccessfulRuns,
  getRunningEligibilityJob,
  getRunningSendCraFileJob,
  removeContactsFromBatch,
  runSendCraFileWithPolling,
  waitForEligibilityJobCompletion,
  waitForSendCraFileJobCompletion,
  type Batch,
  type BatchContactDetail,
  type JobRun,
  type LastSuccessfulRuns,
} from '../service/contacts-service'
import type { AppEnvironment } from '../types/runtime-config'
import { formatDateTimeYMD, formatDateYMD, parseFormattedDate } from '../utils/date-format'

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
  { value: 'Approved', label: 'Approved' },
  { value: 'Refused', label: 'Refused' },
  { value: 'Error', label: 'Error' },
]

// Initiated By options for filter dropdown (used in Batch Requests)
const INITIATED_BY_FILTER_OPTIONS = [
  { value: 'Ministry', label: 'Ministry' },
  { value: 'CRA', label: 'CRA' },
]

const COLUMN_LABELS: Record<string, string> = {
  batchId: 'Batch ID',
  batchDate: 'Batch Date',
  createdDate: 'Created Date',
  status: 'Status',
  transactionType: 'Transaction Type',
  recordCount: 'Record Count',
  initiatedBy: 'Initiated By',
  lastName: 'Last Name',
  givenName: 'First Name',
  middleName: 'Middle Name(s)',
  caseNumber: 'Case Number',
  cancellationReason: 'Reason for Cancellation',
  systemComments: 'System Comments',
  addedBy: 'Added By',
  effectiveDate: 'Effective Date',
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: '2-digit' }

const latestSystemComment = (comments: string | null | undefined): string => {
  if (!comments) return ''
  return (
    comments
      .split('\n')
      .find((line) => line.trim())
      ?.trim() || ''
  )
}

const capitalize = (str: string): string => {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

type FilterAnchor = {
  element: HTMLElement | null
  column: string
}

type SortAnchor = {
  element: HTMLElement | null
  column: string
}

function StandardCsaApp() {
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

  const isAuthenticated = !isLoading && keycloakAuthenticated && hasCSAAccess === true
  const [selectedTab, setSelectedTab] = useState(0)
  const [selectedBatchDetails, setSelectedBatchDetails] = useState<number[]>([])
  const [contactsRefreshToken, setContactsRefreshToken] = useState(0)
  const [selectedBatch, setSelectedBatch] = useState<number | null>(null)

  const [snackbar, setSnackbar] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error' | 'warning' | 'info'
  }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const [isRunningEligibilityAll, setIsRunningEligibilityAll] = useState(false)

  const [isRunningSendCraFile, setIsRunningSendCraFile] = useState(false)
  const [runningSendCraBatchId, setRunningSendCraBatchId] = useState<number | null>(null)
  const [confirmSendCraDialogOpen, setConfirmSendCraDialogOpen] = useState(false)
  const [sendCraFileJobState, setSendCraFileJobState] = useState<
    'idle' | 'running' | 'success' | 'failed'
  >('idle')

  const [lastSuccessfulRuns, setLastSuccessfulRuns] = useState<LastSuccessfulRuns>({
    lastDataIngestion: null,
    lastEligibilityRun: null,
  })

  // Effect to show CSA access alert from auth context
  useEffect(() => {
    if (csaAccessAlert) {
      const alertMessage = csaAccessAlert
      const timerId = window.setTimeout(() => {
        setSnackbar({
          open: true,
          message: alertMessage,
          severity: 'error',
        })
        clearCsaAccessAlert()
      }, 0)

      return () => window.clearTimeout(timerId)
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

  const getSendCraFileJobBatchId = (
    job: { metadata?: unknown } | null | undefined,
  ): number | null => {
    const metadata = job?.metadata as
      | {
          batch_id?: number
          batchId?: number
        }
      | null
      | undefined

    return metadata?.batch_id ?? metadata?.batchId ?? null
  }

  const [batches, setBatches] = useState<Batch[]>([])
  const [loadingBatches, setLoadingBatches] = useState(false)

  const getBatchNumberLabel = useCallback(
    (batchId: number | null | undefined, batchList: Batch[] = batches): string | null => {
      if (batchId == null) return null
      const batch = batchList.find((entry) => entry.id === batchId)
      return batch != null ? String(batch.batchNumber) : null
    },
    [batches],
  )

  const [batchDetails, setBatchDetails] = useState<BatchContactDetail[]>([])
  const [loadingBatchDetails, setLoadingBatchDetails] = useState(false)

  const refreshBatchRequestsAfterSendCra = useCallback(async (): Promise<Batch[]> => {
    const updatedBatches = await getAllBatches()
    setBatches(updatedBatches)

    if (selectedBatch) {
      const updatedDetails = await getBatchContacts(selectedBatch)
      setBatchDetails(updatedDetails)
    }

    return updatedBatches
  }, [selectedBatch])

  useEffect(() => {
    if (!isAuthenticated) return

    const checkAndResumeRunningSendCraFileJob = async () => {
      try {
        const runningJob = await getRunningSendCraFileJob()
        if (!runningJob) return

        setRunningSendCraBatchId(getSendCraFileJobBatchId(runningJob))
        setIsRunningSendCraFile(true)
        setSendCraFileJobState('running')
        const initialProgress = getJobRunProgressUpdate(
          runningJob,
          'Send CRA file job is running in the background...',
        )
        setSnackbar({
          open: true,
          message: initialProgress.message,
          severity: initialProgress.severity,
        })

        const completedJob = await waitForSendCraFileJobCompletion(runningJob.id, (job) => {
          if (job.status === 'RUNNING') {
            const progress = getJobRunProgressUpdate(job, 'Send CRA file job is still running...')
            setSnackbar({
              open: true,
              message: progress.message,
              severity: progress.severity,
            })
          }
        })

        if (completedJob.status === 'SUCCESS') {
          const metadata = completedJob.metadata as {
            batch_id?: number
            batchId?: number
            file_path?: string
            filePath?: string
            record_count?: number
            recordCount?: number
            contacts_count?: number
            contactsCount?: number
          } | null
          const updatedBatches = await getAllBatches()
          setBatches(updatedBatches)
          const batchId = metadata?.batch_id ?? metadata?.batchId
          const batchNumber = getBatchNumberLabel(batchId, updatedBatches)

          setSendCraFileJobState('success')
          setSnackbar({
            open: true,
            message: batchNumber
              ? `Send CRA file job completed for batch ${batchNumber}.`
              : 'Send CRA file job completed successfully.',
            severity: 'success',
          })
        } else {
          await refreshBatchRequestsAfterSendCra()
          setSendCraFileJobState('failed')
          setSnackbar({
            open: true,
            message: completedJob.error || 'Send CRA file job failed',
            severity: 'error',
          })
        }

        setIsRunningSendCraFile(false)
        setRunningSendCraBatchId(null)
      } catch (err) {
        console.error('Failed to check for running SEND_CRA_FILE job:', err)
        setIsRunningSendCraFile(false)
        setRunningSendCraBatchId(null)
        setSendCraFileJobState('idle')
      }
    }

    checkAndResumeRunningSendCraFileJob()
  }, [isAuthenticated, getBatchNumberLabel, refreshBatchRequestsAfterSendCra])

  const checkAndHandleRunningSendCraFileJob = async (): Promise<boolean> => {
    try {
      const runningJob = await getRunningSendCraFileJob()
      if (runningJob) {
        setRunningSendCraBatchId(getSendCraFileJobBatchId(runningJob))
        setIsRunningSendCraFile(true)
        setSendCraFileJobState('running')
        setSnackbar({
          open: true,
          message: 'A Send CRA file job is currently running. Please wait...',
          severity: 'info',
        })

        const completedJob = await waitForSendCraFileJobCompletion(runningJob.id, (job) => {
          if (job.status === 'RUNNING') {
            const progress = getJobRunProgressUpdate(job, 'Send CRA file job is still running...')
            setSnackbar({
              open: true,
              message: progress.message,
              severity: progress.severity,
            })
          }
        })

        if (completedJob.status === 'SUCCESS') {
          const metadata = completedJob.metadata as {
            batch_id?: number
            batchId?: number
          } | null
          const updatedBatches = await getAllBatches()
          setBatches(updatedBatches)
          const batchId = metadata?.batch_id ?? metadata?.batchId
          const batchNumber = getBatchNumberLabel(batchId, updatedBatches)

          setSendCraFileJobState('success')
          setSnackbar({
            open: true,
            message: batchNumber
              ? `Send CRA file job completed for batch ${batchNumber}. Please try your action again.`
              : 'Send CRA file job completed successfully. Please try your action again.',
            severity: 'success',
          })
        } else {
          await refreshBatchRequestsAfterSendCra()
          setSendCraFileJobState('failed')
          setSnackbar({
            open: true,
            message: completedJob.error || 'Send CRA file job failed',
            severity: 'error',
          })
        }

        setIsRunningSendCraFile(false)
        setRunningSendCraBatchId(null)
        return true
      }
      return false
    } catch (err) {
      console.error('Failed to check for running Send CRA file job:', err)
      setIsRunningSendCraFile(false)
      setRunningSendCraBatchId(null)
      setSendCraFileJobState('idle')
      return false
    }
  }

  const handleConfirmSendCraDialogClose = () => {
    setConfirmSendCraDialogOpen(false)
  }

  const handleSendToCraClick = () => {
    setConfirmSendCraDialogOpen(true)
  }

  const handleConfirmSendCra = async () => {
    setConfirmSendCraDialogOpen(false)

    if (!selectedBatch) return

    if (await checkAndHandleRunningSendCraFileJob()) return

    setRunningSendCraBatchId(selectedBatch)
    setIsRunningSendCraFile(true)
    setSendCraFileJobState('running')

    try {
      setSnackbar({
        open: true,
        message: 'Starting Send CRA file job...',
        severity: 'info',
      })

      const runningJob = await getRunningSendCraFileJob()
      const job: JobRun = runningJob
        ? await waitForSendCraFileJobCompletion(runningJob.id, (pollJob) => {
            if (pollJob.status === 'RUNNING') {
              const progress = getJobRunProgressUpdate(pollJob, 'Send CRA file job is running...')
              setSnackbar({
                open: true,
                message: progress.message,
                severity: progress.severity,
              })
            }
          })
        : await runSendCraFileWithPolling((pollJob) => {
            if (pollJob.status === 'RUNNING') {
              const progress = getJobRunProgressUpdate(pollJob, 'Send CRA file job is running...')
              setSnackbar({
                open: true,
                message: progress.message,
                severity: progress.severity,
              })
            }
          })

      if (job.status === 'SUCCESS') {
        const metadata = job.metadata as {
          batch_id?: number
          batchId?: number
          file_path?: string
          filePath?: string
          record_count?: number
          recordCount?: number
          contacts_count?: number
          contactsCount?: number
        } | null
        const batchId = metadata?.batch_id ?? metadata?.batchId ?? selectedBatch
        const recordCount = metadata?.record_count ?? metadata?.recordCount ?? 0
        const contactsCount = metadata?.contacts_count ?? metadata?.contactsCount ?? 0

        const updatedBatches = await refreshBatchRequestsAfterSendCra()
        const batchNumber = getBatchNumberLabel(batchId, updatedBatches)

        setSendCraFileJobState('success')
        setSnackbar({
          open: true,
          message:
            recordCount > 0 || contactsCount > 0
              ? batchNumber
                ? `Send CRA file complete for batch ${batchNumber}: ${recordCount || contactsCount} record${(recordCount || contactsCount) === 1 ? '' : 's'} sent.`
                : `Send CRA file complete: ${recordCount || contactsCount} record${(recordCount || contactsCount) === 1 ? '' : 's'} sent.`
              : batchNumber
                ? `Send CRA file complete for batch ${batchNumber}.`
                : 'Send CRA file complete.',
          severity: 'success',
        })
      } else {
        setSendCraFileJobState('failed')
        throw new Error(job.error || 'Send CRA file job failed')
      }
    } catch (error: any) {
      console.error('Send CRA file error:', error)
      await refreshBatchRequestsAfterSendCra()
      const errorMessage =
        error?.response?.data?.message || error?.message || 'Failed to send CRA file'
      setSendCraFileJobState('failed')
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error',
      })
    } finally {
      setIsRunningSendCraFile(false)
      setRunningSendCraBatchId(null)
    }
  }

  const BATCH_PAGE_SIZE = 10

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

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue)
  }

  const handleLogout = () => {
    logout()
  }

  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false })
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
    const selectedBatchRecord = batches.find((batch) => batch.id === selectedBatch) ?? null
    const isSelectedBatchLocked =
      isRunningSendCraFile &&
      runningSendCraBatchId !== null &&
      selectedBatchRecord?.id === runningSendCraBatchId

    if (isSelectedBatchLocked) {
      const runningBatchNumber = getBatchNumberLabel(runningSendCraBatchId)
      setSnackbar({
        open: true,
        message: runningBatchNumber
          ? `Batch ${runningBatchNumber} is currently being sent to CRA. Please wait for it to complete before removing records.`
          : 'The batch is currently being sent to CRA. Please wait for it to complete before removing records.',
        severity: 'info',
      })
      return
    }

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

      setContactsRefreshToken((token) => token + 1)

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
          return String(batch.batchNumber)
        case 'batchDate':
          return batch.batchDate ? formatDateYMD(batch.batchDate) : ''
        case 'status':
          return batch.statusLabel || batch.status
        case 'recordCount':
          return String(batch.recordCount)
        case 'createdDate':
          return formatDateTimeYMD(batch.createdAt)
        case 'systemComments':
          return latestSystemComment(batch.systemComments)
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

  const selectedBatchData = useMemo(
    () => batches.find((batch) => batch.id === selectedBatch) ?? null,
    [batches, selectedBatch],
  )

  const isSelectedBatchLockedForSendCra = useMemo(
    () =>
      isRunningSendCraFile &&
      runningSendCraBatchId !== null &&
      selectedBatchData?.id === runningSendCraBatchId,
    [isRunningSendCraFile, runningSendCraBatchId, selectedBatchData],
  )

  const runningSendCraBatchNumber = getBatchNumberLabel(runningSendCraBatchId)

  const canRemoveFromBatchDetails = useMemo(() => {
    if (selectedBatchDetails.length === 0) return false

    return selectedBatchData?.status?.toLowerCase() === 'pending'
  }, [selectedBatchDetails, selectedBatchData])

  const canSendToCra = useMemo(() => {
    return (
      selectedBatchData !== null &&
      selectedBatchData.status?.toLowerCase() === 'pending' &&
      selectedBatchData.recordCount > 0
    )
  }, [selectedBatchData])

  // Filter batch requests data
  const filteredBatchRequests = useMemo(() => {
    // Transform API data to match table structure
    let data = batches.map((batch) => ({
      id: batch.id,
      batchId: String(batch.batchNumber),
      batchDate: batch.batchDate ? formatDateYMD(batch.batchDate) : '',
      status: batch.statusLabel || batch.status,
      recordCount: batch.recordCount,
      initiatedBy: batch.initiatedBy || '',
      createdDate: formatDateTimeYMD(batch.createdAt),
      systemComments: latestSystemComment(batch.systemComments),
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

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setBatchRequestsPage(1)
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [batchRequestsSearchTerm, batchRequestsColumnFilters])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setBatchDetailsPage(1)
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [batchDetailsSearchTerm, batchDetailsColumnFilters, selectedBatch])

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
              <Tab label="Weekly File Processing" />
              <Tab label="Job Monitoring" />
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
              <EligibilityListPage
                mode="standard"
                contactsRefreshToken={contactsRefreshToken}
                onBatchesChanged={async () => {
                  const updatedBatches = await getAllBatches()
                  setBatches(updatedBatches)
                  if (selectedBatch) {
                    const updatedDetails = await getBatchContacts(selectedBatch)
                    setBatchDetails(updatedDetails)
                  }
                }}
              />
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Button
                        variant="contained"
                        size="small"
                        disabled={!canSendToCra || isRunningSendCraFile}
                        onClick={handleSendToCraClick}
                        sx={{
                          textTransform: 'none',
                          minWidth: 'auto',
                          '&.Mui-disabled': {
                            opacity: 0.5,
                          },
                        }}
                      >
                        {isRunningSendCraFile ? 'Sending to CRA...' : 'Send to CRA'}
                      </Button>
                      {sendCraFileJobState === 'running' && (
                        <Tooltip title="Send CRA file job is running" arrow>
                          <AccessTimeIcon fontSize="small" color="info" />
                        </Tooltip>
                      )}
                      {sendCraFileJobState === 'success' && (
                        <Tooltip title="Send CRA file job completed successfully" arrow>
                          <CheckCircleIcon fontSize="small" color="success" />
                        </Tooltip>
                      )}
                      {sendCraFileJobState === 'failed' && (
                        <Tooltip title="Send CRA file job failed" arrow>
                          <ErrorOutlineIcon fontSize="small" color="error" />
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                </Box>

                {/* Send CRA file running banner — hidden once the job fails or finishes */}
                {isRunningSendCraFile && sendCraFileJobState === 'running' && (
                  <Box sx={{ mb: 2 }}>
                    <Alert severity="info" sx={{ mb: 1 }}>
                      {runningSendCraBatchNumber
                        ? `Send CRA file job is running for batch ${runningSendCraBatchNumber}. Changes to that batch are temporarily disabled until the job completes.`
                        : 'Send CRA file job is running. Changes to the batch being sent are temporarily disabled until the job completes.'}
                    </Alert>
                    <LinearProgress />
                  </Box>
                )}

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
                        disabled={
                          !canRemoveFromBatchDetails ||
                          isRunningEligibilityAll ||
                          isSelectedBatchLockedForSendCra
                        }
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
                              disabled={isRunningEligibilityAll}
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
                                  disabled={isRunningEligibilityAll}
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

            {selectedTab === 2 && <WeeklyFileProcessingTab />}
            {selectedTab === 3 && <JobMonitoringTab />}
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

      {/* Confirmation Dialog for Send to CRA */}
      <Dialog
        open={confirmSendCraDialogOpen}
        onClose={handleConfirmSendCraDialogClose}
        aria-labelledby="confirm-send-cra-dialog-title"
        aria-describedby="confirm-send-cra-dialog-description"
      >
        <DialogTitle id="confirm-send-cra-dialog-title">Send CRA File</DialogTitle>
        <DialogContent>
          <DialogContentText id="confirm-send-cra-dialog-description">
            This will generate the CRA file and send it to CRA. You won&apos;t be able to make
            further modifications to this batch. Do you want to proceed?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleConfirmSendCraDialogClose} color="inherit">
            No
          </Button>
          <Button onClick={handleConfirmSendCra} variant="contained" autoFocus>
            Yes
          </Button>
        </DialogActions>
      </Dialog>

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

export default StandardCsaApp
