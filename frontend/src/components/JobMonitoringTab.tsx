import AccessTimeIcon from '@mui/icons-material/AccessTime'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ClearIcon from '@mui/icons-material/Clear'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    MenuItem,
    Pagination,
    Paper,
    Select,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import {
    type ActivityParams,
    type JobActivityRow,
    type JobHistoryParams,
    type MonitoringJobRow,
    getJobActivities,
    getJobHistory,
    getLatestJobs,
    getRecentActivities,
} from '../service/jobs-service'

const ITEMS_PER_PAGE = 10

// Map display job names to backend JobType enum values for server-side filtering
const JOB_NAME_TO_TYPE: Record<string, string> = {
  'Data Fetch': 'INGEST_DATA',
  Eligibility: 'RUN_ELIGIBILITY',
  'Auto Batch': 'AUTO_BATCH',
  'Send CRA File': 'SEND_CRA_FILE',
  'Weekly Response': 'POLL_CRA_RESPONSE',
}

const MONITORED_JOB_NAMES = Object.keys(JOB_NAME_TO_TYPE)
const STATUSES = ['SUCCESS', 'RUNNING', 'FAILED']
const TRIGGER_OPTIONS = ['SYSTEM', 'USER']
const ACTIVITY_SEVERITIES = ['ERROR', 'WARNING', 'INFO']
const ACTIVITY_TYPES = [
  'STARTED',
  'RECORD_PROCESSED',
  'BATCH_CREATED',
  'FILE_SENT',
  'FILE_RECEIVED',
  'COMPLETED',
  'FAILED',
  'WARNING',
]

/** Format a date string to PT timezone: yyyy-Mmm-dd HH:mm:ss */
const formatDatePT = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—'
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '—'
    const tz = 'America/Vancouver'
    const year = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(date)
    const month = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short' }).format(date)
    const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, day: '2-digit' }).format(date)
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date)
    return `${year}-${month}-${day} ${time}`
  } catch {
    return '—'
  }
}

const normalizeStatus = (status: string): string => {
  const map: Record<string, string> = { SUCCESS: 'Success', FAILED: 'Failed', RUNNING: 'Running' }
  return map[status] ?? status
}

const normalizeSeverity = (severity: string): string => {
  const map: Record<string, string> = { ERROR: 'Error', WARNING: 'Warning', INFO: 'Info' }
  return map[severity] ?? severity
}

const getStatusIcon = (status: string) => {
  const s = status.toUpperCase()
  if (s === 'SUCCESS') return <CheckCircleIcon sx={{ fontSize: '1.2rem', color: '#4caf50' }} />
  if (s === 'FAILED') return <ErrorOutlineIcon sx={{ fontSize: '1.2rem', color: '#f44336' }} />
  if (s === 'RUNNING') return <AccessTimeIcon sx={{ fontSize: '1.2rem', color: '#ff9800' }} />
  return null
}

const getSeverityIcon = (severity: string) => {
  const s = severity.toUpperCase()
  if (s === 'ERROR') return <ErrorOutlineIcon sx={{ fontSize: '1rem', color: '#f44336' }} />
  if (s === 'WARNING') return <WarningAmberIcon sx={{ fontSize: '1rem', color: '#ff9800' }} />
  return null
}

const warningChip = (text: string) => (
  <Tooltip title={text}>
    <span
      style={{
        padding: '2px 8px',
        backgroundColor: '#fff3cd',
        borderRadius: '4px',
        fontSize: '0.75rem',
        color: '#856404',
      }}
    >
      {text}
    </span>
  </Tooltip>
)

interface SortableHeaderCellProps {
  label: string
  field: string
  currentSortField: string
  currentSortOrder: 'asc' | 'desc'
  onSort: (field: string) => void
  sortable?: boolean
}

function SortableHeaderCell({
  label,
  field,
  currentSortField,
  currentSortOrder,
  onSort,
  sortable = true,
}: SortableHeaderCellProps) {
  const isActive = currentSortField === field
  return (
    <TableCell
      sx={{
        fontWeight: 600,
        fontSize: '0.875rem',
        cursor: sortable ? 'pointer' : 'default',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        backgroundColor: '#f5f5f5',
      }}
      onClick={sortable ? () => onSort(field) : undefined}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {label}
        {sortable &&
          (isActive ? (
            currentSortOrder === 'asc' ? (
              <ArrowUpwardIcon sx={{ fontSize: '0.875rem' }} />
            ) : (
              <ArrowDownwardIcon sx={{ fontSize: '0.875rem' }} />
            )
          ) : (
            <UnfoldMoreIcon sx={{ fontSize: '0.875rem', opacity: 0.4 }} />
          ))}
      </Box>
    </TableCell>
  )
}

const cellSx = { fontSize: '0.875rem' }
const filterCellSx = { py: 0.5, px: 1, backgroundColor: '#fafafa' }
const nonSortHeaderSx = { fontWeight: 600, fontSize: '0.875rem', backgroundColor: '#f5f5f5' }

export default function JobMonitoringTab() {
  // ── Job List ────────────────────────────────────────────────────────────
  const [jobListData, setJobListData] = useState<MonitoringJobRow[]>([])
  const [jobListLoading, setJobListLoading] = useState(true)
  const [jobListError, setJobListError] = useState<string | null>(null)
  // Job List: client-side filter state
  const [jlFilterId, setJlFilterId] = useState('')
  const [jlFilterName, setJlFilterName] = useState('')
  const [jlFilterStatus, setJlFilterStatus] = useState('')
  const [jlFilterTrigger, setJlFilterTrigger] = useState('')
  const [jlSortField, setJlSortField] = useState('id')
  const [jlSortOrder, setJlSortOrder] = useState<'asc' | 'desc'>('asc')

  // ── Job History ─────────────────────────────────────────────────────────
  const [jobHistoryData, setJobHistoryData] = useState<MonitoringJobRow[]>([])
  const [jobHistoryTotal, setJobHistoryTotal] = useState(0)
  const [jobHistoryPage, setJobHistoryPage] = useState(1)
  const [jobHistoryLoading, setJobHistoryLoading] = useState(true)
  const [jobHistoryError, setJobHistoryError] = useState<string | null>(null)
  // Job History: server-side filter state (text inputs apply on Enter)
  const [jhFilterId, setJhFilterId] = useState('')
  const [jhAppliedFilterId, setJhAppliedFilterId] = useState('')
  const [jhFilterJobName, setJhFilterJobName] = useState('')
  const [jhFilterStatus, setJhFilterStatus] = useState('')
  const [jhFilterTrigger, setJhFilterTrigger] = useState('')
  const [jhSortField, setJhSortField] = useState('createdAt')
  const [jhSortOrder, setJhSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedJobHistoryId, setSelectedJobHistoryId] = useState<number | null>(null)

  // ── Activities ──────────────────────────────────────────────────────────
  const [activitiesData, setActivitiesData] = useState<JobActivityRow[]>([])
  const [activitiesTotal, setActivitiesTotal] = useState(0)
  const [activitiesPage, setActivitiesPage] = useState(1)
  const [activitiesLoading, setActivitiesLoading] = useState(true)
  const [activitiesError, setActivitiesError] = useState<string | null>(null)
  // Activities: server-side filter state (Job ID applies on Enter)
  const [actFilterSeverity, setActFilterSeverity] = useState('')
  const [actFilterType, setActFilterType] = useState('')
  const [actFilterJobId, setActFilterJobId] = useState('')
  const [actAppliedFilterJobId, setActAppliedFilterJobId] = useState('')
  const [actSortField, setActSortField] = useState('when')
  const [actSortOrder, setActSortOrder] = useState<'asc' | 'desc'>('desc')

  // ── Data fetching ───────────────────────────────────────────────────────
  const fetchJobList = useCallback(async () => {
    setJobListLoading(true)
    setJobListError(null)
    try {
      const data = await getLatestJobs()
      setJobListData(data)
    } catch {
      setJobListError('Failed to load job list. Please try again.')
    } finally {
      setJobListLoading(false)
    }
  }, [])

  const fetchJobHistory = useCallback(async () => {
    setJobHistoryLoading(true)
    setJobHistoryError(null)
    try {
      const params: JobHistoryParams = {
        page: jobHistoryPage,
        limit: ITEMS_PER_PAGE,
        sortBy: jhSortField,
        sortOrder: jhSortOrder,
      }
      if (jhAppliedFilterId) params.jobId = Number(jhAppliedFilterId)
      if (jhFilterJobName) params.jobType = JOB_NAME_TO_TYPE[jhFilterJobName]
      if (jhFilterStatus) params.status = jhFilterStatus
      if (jhFilterTrigger) params.triggeredBy = jhFilterTrigger
      const result = await getJobHistory(params)
      setJobHistoryData(result.data)
      setJobHistoryTotal(result.total)
    } catch {
      setJobHistoryError('Failed to load job history. Please try again.')
    } finally {
      setJobHistoryLoading(false)
    }
  }, [
    jobHistoryPage,
    jhAppliedFilterId,
    jhFilterJobName,
    jhFilterStatus,
    jhFilterTrigger,
    jhSortField,
    jhSortOrder,
  ])

  const fetchActivities = useCallback(async () => {
    setActivitiesLoading(true)
    setActivitiesError(null)
    try {
      const params: ActivityParams = {
        page: activitiesPage,
        limit: ITEMS_PER_PAGE,
        sortBy: actSortField,
        sortOrder: actSortOrder,
      }
      if (actFilterSeverity) params.severity = actFilterSeverity
      if (actFilterType) params.type = actFilterType

      // When a Job History row is selected, show activities for that specific job.
      // When a Job ID filter is manually entered, show activities for that job.
      // Otherwise show recent monitoring activities.
      let result
      if (selectedJobHistoryId) {
        result = await getJobActivities(selectedJobHistoryId, params)
      } else if (actAppliedFilterJobId) {
        result = await getJobActivities(Number(actAppliedFilterJobId), params)
      } else {
        result = await getRecentActivities(params)
      }

      setActivitiesData(result.data)
      setActivitiesTotal(result.total)
    } catch {
      setActivitiesError('Failed to load activities. Please try again.')
    } finally {
      setActivitiesLoading(false)
    }
  }, [
    activitiesPage,
    selectedJobHistoryId,
    actAppliedFilterJobId,
    actFilterSeverity,
    actFilterType,
    actSortField,
    actSortOrder,
  ])

  useEffect(() => {
    fetchJobList()
  }, [fetchJobList])

  useEffect(() => {
    fetchJobHistory()
  }, [fetchJobHistory])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  // ── Sort handlers ────────────────────────────────────────────────────────
  const handleJlSort = (field: string) => {
    if (jlSortField === field) {
      setJlSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setJlSortField(field)
      setJlSortOrder('asc')
    }
  }

  const handleJhSort = (field: string) => {
    setJobHistoryPage(1)
    if (jhSortField === field) {
      setJhSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setJhSortField(field)
      setJhSortOrder('asc')
    }
  }

  const handleActSort = (field: string) => {
    setActivitiesPage(1)
    if (actSortField === field) {
      setActSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setActSortField(field)
      setActSortOrder('asc')
    }
  }

  // ── Job History row selection ─────────────────────────────────────────────
  const handleJobHistoryRowClick = (jobId: number) => {
    setSelectedJobHistoryId((prev) => (prev === jobId ? null : jobId))
    setActivitiesPage(1)
  }

  // ── Clear all filters ─────────────────────────────────────────────────────
  const clearJobListFilters = () => {
    setJlFilterId('')
    setJlFilterName('')
    setJlFilterStatus('')
    setJlFilterTrigger('')
    setJlSortField('id')
    setJlSortOrder('asc')
  }

  const clearJobHistoryFilters = () => {
    setJhFilterId('')
    setJhAppliedFilterId('')
    setJhFilterJobName('')
    setJhFilterStatus('')
    setJhFilterTrigger('')
    setJhSortField('createdAt')
    setJhSortOrder('desc')
    setJobHistoryPage(1)
    setSelectedJobHistoryId(null)
  }

  const clearActivitiesFilters = () => {
    setActFilterSeverity('')
    setActFilterType('')
    setActFilterJobId('')
    setActAppliedFilterJobId('')
    setActSortField('when')
    setActSortOrder('desc')
    setActivitiesPage(1)
    setSelectedJobHistoryId(null)
  }

  // ── Job List: client-side filter + sort ──────────────────────────────────
  const filteredJobList = jobListData
    .filter((row) => {
      if (jlFilterId && !String(row.id).includes(jlFilterId)) return false
      if (jlFilterName && !row.jobName.toLowerCase().includes(jlFilterName.toLowerCase()))
        return false
      if (jlFilterStatus && row.status !== jlFilterStatus) return false
      if (jlFilterTrigger && row.triggeredBy !== jlFilterTrigger) return false
      return true
    })
    .sort((a, b) => {
      const valA = String((a as Record<string, unknown>)[jlSortField] ?? '')
      const valB = String((b as Record<string, unknown>)[jlSortField] ?? '')
      const cmp = valA.localeCompare(valB)
      return jlSortOrder === 'asc' ? cmp : -cmp
    })

  const jhTotalPages = Math.ceil(jobHistoryTotal / ITEMS_PER_PAGE)
  const actTotalPages = Math.ceil(activitiesTotal / ITEMS_PER_PAGE)

  const filterTextFieldProps = {
    size: 'small' as const,
    placeholder: 'Filter...',
    inputProps: { style: { fontSize: '0.75rem', padding: '2px 6px' } },
  }

  const filterSelectSx = { fontSize: '0.75rem', minWidth: 110 }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* ── Job List ── */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 500 }}>
            Job List
          </Typography>
          <Button
            size="small"
            startIcon={<ClearIcon />}
            onClick={clearJobListFilters}
            variant="outlined"
            color="inherit"
          >
            Clear Filters &amp; Sort
          </Button>
        </Box>

        {jobListError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {jobListError}
          </Alert>
        )}

        <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <SortableHeaderCell
                  label="Job ID"
                  field="id"
                  currentSortField={jlSortField}
                  currentSortOrder={jlSortOrder}
                  onSort={handleJlSort}
                />
                <SortableHeaderCell
                  label="Job Name"
                  field="jobName"
                  currentSortField={jlSortField}
                  currentSortOrder={jlSortOrder}
                  onSort={handleJlSort}
                />
                <SortableHeaderCell
                  label="Status"
                  field="status"
                  currentSortField={jlSortField}
                  currentSortOrder={jlSortOrder}
                  onSort={handleJlSort}
                />
                <SortableHeaderCell
                  label="Trigger By"
                  field="triggeredBy"
                  currentSortField={jlSortField}
                  currentSortOrder={jlSortOrder}
                  onSort={handleJlSort}
                />
                <SortableHeaderCell
                  label="Started (PT)"
                  field="started"
                  currentSortField={jlSortField}
                  currentSortOrder={jlSortOrder}
                  onSort={handleJlSort}
                />
                <SortableHeaderCell
                  label="Finished (PT)"
                  field="finished"
                  currentSortField={jlSortField}
                  currentSortOrder={jlSortOrder}
                  onSort={handleJlSort}
                />
                <TableCell sx={nonSortHeaderSx}>Summary</TableCell>
                <TableCell sx={nonSortHeaderSx}>Warning</TableCell>
              </TableRow>
              {/* Filter row */}
              <TableRow>
                <TableCell sx={filterCellSx}>
                  <TextField
                    {...filterTextFieldProps}
                    value={jlFilterId}
                    onChange={(e) => setJlFilterId(e.target.value)}
                  />
                </TableCell>
                <TableCell sx={filterCellSx}>
                  <TextField
                    {...filterTextFieldProps}
                    value={jlFilterName}
                    onChange={(e) => setJlFilterName(e.target.value)}
                  />
                </TableCell>
                <TableCell sx={filterCellSx}>
                  <Select
                    size="small"
                    displayEmpty
                    value={jlFilterStatus}
                    onChange={(e) => setJlFilterStatus(e.target.value)}
                    sx={filterSelectSx}
                  >
                    <MenuItem value="">
                      <em>All</em>
                    </MenuItem>
                    {STATUSES.map((s) => (
                      <MenuItem key={s} value={s} sx={{ fontSize: '0.75rem' }}>
                        {normalizeStatus(s)}
                      </MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell sx={filterCellSx}>
                  <Select
                    size="small"
                    displayEmpty
                    value={jlFilterTrigger}
                    onChange={(e) => setJlFilterTrigger(e.target.value)}
                    sx={filterSelectSx}
                  >
                    <MenuItem value="">
                      <em>All</em>
                    </MenuItem>
                    {TRIGGER_OPTIONS.map((t) => (
                      <MenuItem key={t} value={t} sx={{ fontSize: '0.75rem' }}>
                        {t}
                      </MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell sx={filterCellSx} colSpan={4} />
              </TableRow>
            </TableHead>
            <TableBody>
              {jobListLoading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : filteredJobList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No jobs found
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobList.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={cellSx}>{row.id}</TableCell>
                    <TableCell sx={cellSx}>{row.jobName}</TableCell>
                    <TableCell sx={cellSx}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getStatusIcon(row.status)}
                        <span>{normalizeStatus(row.status)}</span>
                      </Box>
                    </TableCell>
                    <TableCell sx={cellSx}>{row.triggeredBy || '—'}</TableCell>
                    <TableCell sx={cellSx}>{formatDatePT(row.started)}</TableCell>
                    <TableCell sx={cellSx}>{formatDatePT(row.finished)}</TableCell>
                    <TableCell sx={cellSx}>{row.summary || '—'}</TableCell>
                    <TableCell sx={cellSx}>
                      {row.warning ? warningChip(row.warning) : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* ── Job History ── */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 500 }}>
            Job History
          </Typography>
          <Button
            size="small"
            startIcon={<ClearIcon />}
            onClick={clearJobHistoryFilters}
            variant="outlined"
            color="inherit"
          >
            Clear Filters &amp; Sort
          </Button>
        </Box>

        {jobHistoryError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {jobHistoryError}
          </Alert>
        )}

        <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <SortableHeaderCell
                  label="Job ID"
                  field="id"
                  currentSortField={jhSortField}
                  currentSortOrder={jhSortOrder}
                  onSort={handleJhSort}
                />
                <SortableHeaderCell
                  label="Job Name"
                  field="jobType"
                  currentSortField={jhSortField}
                  currentSortOrder={jhSortOrder}
                  onSort={handleJhSort}
                />
                <SortableHeaderCell
                  label="Status"
                  field="status"
                  currentSortField={jhSortField}
                  currentSortOrder={jhSortOrder}
                  onSort={handleJhSort}
                />
                <SortableHeaderCell
                  label="Trigger By"
                  field="jobTrigger"
                  currentSortField={jhSortField}
                  currentSortOrder={jhSortOrder}
                  onSort={handleJhSort}
                />
                <SortableHeaderCell
                  label="Started (PT)"
                  field="startedAt"
                  currentSortField={jhSortField}
                  currentSortOrder={jhSortOrder}
                  onSort={handleJhSort}
                />
                <SortableHeaderCell
                  label="Finished (PT)"
                  field="completedAt"
                  currentSortField={jhSortField}
                  currentSortOrder={jhSortOrder}
                  onSort={handleJhSort}
                />
                <TableCell sx={nonSortHeaderSx}>Summary</TableCell>
                <TableCell sx={nonSortHeaderSx}>Warning</TableCell>
              </TableRow>
              {/* Filter row — Job ID and Job Name filter on Enter; dropdowns apply immediately */}
              <TableRow>
                <TableCell sx={filterCellSx}>
                  <TextField
                    {...filterTextFieldProps}
                    value={jhFilterId}
                    onChange={(e) => setJhFilterId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setJhAppliedFilterId(jhFilterId)
                        setJobHistoryPage(1)
                      }
                    }}
                  />
                </TableCell>
                <TableCell sx={filterCellSx}>
                  <Select
                    size="small"
                    displayEmpty
                    value={jhFilterJobName}
                    onChange={(e) => {
                      setJhFilterJobName(e.target.value)
                      setJobHistoryPage(1)
                    }}
                    sx={{ ...filterSelectSx, minWidth: 140 }}
                  >
                    <MenuItem value="">
                      <em>All</em>
                    </MenuItem>
                    {MONITORED_JOB_NAMES.map((n) => (
                      <MenuItem key={n} value={n} sx={{ fontSize: '0.75rem' }}>
                        {n}
                      </MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell sx={filterCellSx}>
                  <Select
                    size="small"
                    displayEmpty
                    value={jhFilterStatus}
                    onChange={(e) => {
                      setJhFilterStatus(e.target.value)
                      setJobHistoryPage(1)
                    }}
                    sx={filterSelectSx}
                  >
                    <MenuItem value="">
                      <em>All</em>
                    </MenuItem>
                    {STATUSES.map((s) => (
                      <MenuItem key={s} value={s} sx={{ fontSize: '0.75rem' }}>
                        {normalizeStatus(s)}
                      </MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell sx={filterCellSx}>
                  <Select
                    size="small"
                    displayEmpty
                    value={jhFilterTrigger}
                    onChange={(e) => {
                      setJhFilterTrigger(e.target.value)
                      setJobHistoryPage(1)
                    }}
                    sx={filterSelectSx}
                  >
                    <MenuItem value="">
                      <em>All</em>
                    </MenuItem>
                    {TRIGGER_OPTIONS.map((t) => (
                      <MenuItem key={t} value={t} sx={{ fontSize: '0.75rem' }}>
                        {t}
                      </MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell sx={filterCellSx} colSpan={4} />
              </TableRow>
            </TableHead>
            <TableBody>
              {jobHistoryLoading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : jobHistoryData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No history found
                  </TableCell>
                </TableRow>
              ) : (
                jobHistoryData.map((row) => (
                  <TableRow
                    key={row.id}
                    hover
                    selected={selectedJobHistoryId === row.id}
                    onClick={() => handleJobHistoryRowClick(row.id)}
                    sx={{
                      cursor: 'pointer',
                      '&.Mui-selected': { backgroundColor: 'rgba(25, 118, 210, 0.08)' },
                      '&.Mui-selected:hover': { backgroundColor: 'rgba(25, 118, 210, 0.12)' },
                    }}
                  >
                    <TableCell sx={cellSx}>{row.id}</TableCell>
                    <TableCell sx={cellSx}>{row.jobName}</TableCell>
                    <TableCell sx={cellSx}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getStatusIcon(row.status)}
                        <span>{normalizeStatus(row.status)}</span>
                      </Box>
                    </TableCell>
                    <TableCell sx={cellSx}>{row.triggeredBy || '—'}</TableCell>
                    <TableCell sx={cellSx}>{formatDatePT(row.started)}</TableCell>
                    <TableCell sx={cellSx}>{formatDatePT(row.finished)}</TableCell>
                    <TableCell sx={cellSx}>{row.summary || '—'}</TableCell>
                    <TableCell sx={cellSx}>
                      {row.warning ? warningChip(row.warning) : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mt: 2,
            mb: 4,
            px: 2,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Showing {jobHistoryData.length} of {jobHistoryTotal} records
          </Typography>
          {jhTotalPages > 1 && (
            <Pagination
              count={jhTotalPages}
              page={jobHistoryPage}
              onChange={(_, p) => setJobHistoryPage(p)}
              color="primary"
              showFirstButton
              showLastButton
            />
          )}
        </Box>
      </Box>

      {/* ── Activities ── */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 500 }}>
            Activities
            {selectedJobHistoryId && (
              <Typography component="span" variant="body2" color="primary" sx={{ ml: 1 }}>
                — Filtered by Job #{selectedJobHistoryId}
              </Typography>
            )}
          </Typography>
          <Button
            size="small"
            startIcon={<ClearIcon />}
            onClick={clearActivitiesFilters}
            variant="outlined"
            color="inherit"
          >
            Clear Filters &amp; Sort
          </Button>
        </Box>

        {activitiesError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {activitiesError}
          </Alert>
        )}

        <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <SortableHeaderCell
                  label="When (PT)"
                  field="when"
                  currentSortField={actSortField}
                  currentSortOrder={actSortOrder}
                  onSort={handleActSort}
                />
                <SortableHeaderCell
                  label="Severity"
                  field="severity"
                  currentSortField={actSortField}
                  currentSortOrder={actSortOrder}
                  onSort={handleActSort}
                />
                <SortableHeaderCell
                  label="Type"
                  field="type"
                  currentSortField={actSortField}
                  currentSortOrder={actSortOrder}
                  onSort={handleActSort}
                />
                {/* Related is not sortable per FDD */}
                <TableCell sx={nonSortHeaderSx}>Related</TableCell>
                <SortableHeaderCell
                  label="Job ID"
                  field="jobRunId"
                  currentSortField={actSortField}
                  currentSortOrder={actSortOrder}
                  onSort={handleActSort}
                />
              </TableRow>
              {/* Filter row */}
              <TableRow>
                <TableCell sx={filterCellSx} />
                <TableCell sx={filterCellSx}>
                  <Select
                    size="small"
                    displayEmpty
                    value={actFilterSeverity}
                    onChange={(e) => {
                      setActFilterSeverity(e.target.value)
                      setActivitiesPage(1)
                    }}
                    sx={filterSelectSx}
                  >
                    <MenuItem value="">
                      <em>All</em>
                    </MenuItem>
                    {ACTIVITY_SEVERITIES.map((s) => (
                      <MenuItem key={s} value={s} sx={{ fontSize: '0.75rem' }}>
                        {normalizeSeverity(s)}
                      </MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell sx={filterCellSx}>
                  <Select
                    size="small"
                    displayEmpty
                    value={actFilterType}
                    onChange={(e) => {
                      setActFilterType(e.target.value)
                      setActivitiesPage(1)
                    }}
                    sx={{ ...filterSelectSx, minWidth: 150 }}
                  >
                    <MenuItem value="">
                      <em>All</em>
                    </MenuItem>
                    {ACTIVITY_TYPES.map((t) => (
                      <MenuItem key={t} value={t} sx={{ fontSize: '0.75rem' }}>
                        {t}
                      </MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell sx={filterCellSx} />
                <TableCell sx={filterCellSx}>
                  <TextField
                    {...filterTextFieldProps}
                    value={actFilterJobId}
                    onChange={(e) => setActFilterJobId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setActAppliedFilterJobId(actFilterJobId)
                        setActivitiesPage(1)
                      }
                    }}
                  />
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {activitiesLoading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : activitiesData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No activities found
                  </TableCell>
                </TableRow>
              ) : (
                activitiesData.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={cellSx}>{formatDatePT(row.when)}</TableCell>
                    <TableCell sx={cellSx}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getSeverityIcon(row.severity)}
                        <span>{normalizeSeverity(row.severity)}</span>
                      </Box>
                    </TableCell>
                    <TableCell sx={cellSx}>{row.type}</TableCell>
                    <TableCell sx={cellSx}>
                      {row.related ? (
                        <Tooltip title={row.related}>
                          <span>{row.related}</span>
                        </Tooltip>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell sx={cellSx}>{row.jobRunId}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mt: 2,
            mb: 4,
            px: 2,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Showing {activitiesData.length} of {activitiesTotal} records
          </Typography>
          {actTotalPages > 1 && (
            <Pagination
              count={actTotalPages}
              page={activitiesPage}
              onChange={(_, p) => setActivitiesPage(p)}
              color="primary"
              showFirstButton
              showLastButton
            />
          )}
        </Box>
      </Box>
    </Box>
  )
}
