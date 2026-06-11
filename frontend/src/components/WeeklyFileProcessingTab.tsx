import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import CloseIcon from '@mui/icons-material/Close'
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff'
import FilterListIcon from '@mui/icons-material/FilterList'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Pagination,
  Paper,
  Radio,
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
import { useEffect, useMemo, useState } from 'react'
import { fullTextSearchContacts, type Contact } from '../service/contacts-service'
import {
  associateWeeklyFileRecord,
  dissociateWeeklyFileRecord,
  getWeeklyFileRecords,
  getWeeklyFiles,
  reprocessWeeklyFile,
  type WeeklyFileRecord,
  type WeeklyFileSummary,
} from '../service/weekly-files-service'

const SUMMARY_PAGE_SIZE = 10
const DETAILS_PAGE_SIZE = 20
const SEARCH_PAGE_SIZE = 10
const MANUAL_REVIEW_WARNING =
  'This weekly response record is not matched to a CSA master contact. Search and select a child record below to associate manually.'

type SortDirection = 'asc' | 'desc'
type WeeklyReportColumn = 'weeklyFileDate' | 'csaProcessingDate'
type WeeklyDetailsColumn =
  | 'csaMatchFound'
  | 'batchId'
  | 'transactionType'
  | 'transactionSource'
  | 'craStatus'
  | 'matchedBy'

type SortConfig<T> = {
  column: T
  direction: SortDirection
} | null

const formatDateDisplay = (value: string | null): string => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  const month = parsed.toLocaleString('en-US', { month: 'short' })
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${parsed.getFullYear()}-${month}-${day}`
}

const valueOrBlank = (value: string | null | undefined): string => value ?? ''

const compareStrings = (left: string, right: string): number =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })

export default function WeeklyFileProcessingTab() {
  const [weeklyFiles, setWeeklyFiles] = useState<WeeklyFileSummary[]>([])
  const [weeklyFilesPage, setWeeklyFilesPage] = useState(1)
  const [weeklyFilesTotalPages, setWeeklyFilesTotalPages] = useState(1)
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null)

  const [records, setRecords] = useState<WeeklyFileRecord[]>([])
  const [recordsPage, setRecordsPage] = useState(1)
  const [recordsTotalPages, setRecordsTotalPages] = useState(1)
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null)

  const [childSearchTerm, setChildSearchTerm] = useState('')
  const [searchedChildren, setSearchedChildren] = useState<Contact[]>([])
  const [childSearchPage, setChildSearchPage] = useState(1)
  const [childSearchTotalPages, setChildSearchTotalPages] = useState(1)
  const [loadingChildSearch, setLoadingChildSearch] = useState(false)
  const [selectedSearchContactId, setSelectedSearchContactId] = useState<number | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [savingAssociation, setSavingAssociation] = useState(false)
  const [reprocessing, setReprocessing] = useState(false)

  const [weeklyReportSearchTerm, setWeeklyReportSearchTerm] = useState('')
  const [weeklyReportColumnFilters, setWeeklyReportColumnFilters] = useState<
    Record<WeeklyReportColumn, string[]>
  >({
    weeklyFileDate: [],
    csaProcessingDate: [],
  })
  const [weeklyReportFilterSearchTerm, setWeeklyReportFilterSearchTerm] = useState('')
  const [weeklyReportSortConfig, setWeeklyReportSortConfig] =
    useState<SortConfig<WeeklyReportColumn>>(null)
  const [weeklyReportSortAnchor, setWeeklyReportSortAnchor] = useState<{
    element: HTMLElement | null
    column: WeeklyReportColumn
  }>({
    element: null,
    column: 'weeklyFileDate',
  })
  const [weeklyReportFilterAnchor, setWeeklyReportFilterAnchor] = useState<{
    element: HTMLElement | null
    column: WeeklyReportColumn
  }>({
    element: null,
    column: 'weeklyFileDate',
  })

  const [detailsSearchTerm, setDetailsSearchTerm] = useState('')
  const [detailsColumnFilters, setDetailsColumnFilters] = useState<
    Record<WeeklyDetailsColumn, string[]>
  >({
    csaMatchFound: [],
    batchId: [],
    transactionType: [],
    transactionSource: [],
    craStatus: [],
    matchedBy: [],
  })
  const [detailsFilterSearchTerm, setDetailsFilterSearchTerm] = useState('')
  const [detailsSortConfig, setDetailsSortConfig] = useState<SortConfig<WeeklyDetailsColumn>>(null)
  const [detailsSortAnchor, setDetailsSortAnchor] = useState<{
    element: HTMLElement | null
    column: WeeklyDetailsColumn
  }>({
    element: null,
    column: 'csaMatchFound',
  })
  const [detailsFilterAnchor, setDetailsFilterAnchor] = useState<{
    element: HTMLElement | null
    column: WeeklyDetailsColumn
  }>({
    element: null,
    column: 'csaMatchFound',
  })

  const [loadingFiles, setLoadingFiles] = useState(false)
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadWeeklyFiles = async () => {
      setLoadingFiles(true)
      setError(null)
      try {
        const response = await getWeeklyFiles(weeklyFilesPage, SUMMARY_PAGE_SIZE)
        setWeeklyFiles(response.data)
        setWeeklyFilesTotalPages(Math.max(response.totalPages, 1))

        if (!selectedFileId && response.data.length > 0) {
          setSelectedFileId(response.data[0].id)
          setRecordsPage(1)
          setSelectedRecordId(null)
        }

        if (selectedFileId && !response.data.some((file) => file.id === selectedFileId)) {
          setSelectedFileId(response.data[0]?.id ?? null)
          setRecordsPage(1)
          setSelectedRecordId(null)
        }
      } catch (err) {
        console.error('Failed to fetch weekly files:', err)
        setError('Failed to load weekly files. Please try again.')
        setWeeklyFiles([])
      } finally {
        setLoadingFiles(false)
      }
    }

    void loadWeeklyFiles()
  }, [weeklyFilesPage, selectedFileId])

  useEffect(() => {
    const loadRecords = async () => {
      if (!selectedFileId) {
        setRecords([])
        setRecordsTotalPages(1)
        setSelectedRecordId(null)
        return
      }

      setLoadingRecords(true)
      setError(null)
      try {
        const response = await getWeeklyFileRecords(selectedFileId, recordsPage, DETAILS_PAGE_SIZE)
        setRecords(response.data)
        setRecordsTotalPages(Math.max(response.totalPages, 1))
        if (selectedRecordId && !response.data.some((record) => record.id === selectedRecordId)) {
          setSelectedRecordId(null)
        }
      } catch (err) {
        console.error('Failed to fetch weekly file records:', err)
        setError('Failed to load weekly file details. Please try again.')
        setRecords([])
      } finally {
        setLoadingRecords(false)
      }
    }

    void loadRecords()
  }, [selectedFileId, recordsPage, selectedRecordId])

  useEffect(() => {
    setSelectedSearchContactId(null)
    setSearchedChildren([])
    setChildSearchPage(1)
    setActionError(null)
    setActionMessage(null)
  }, [selectedRecordId])

  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedRecordId) ?? null,
    [records, selectedRecordId],
  )

  const getWeeklyReportFieldValue = (
    file: WeeklyFileSummary,
    column: WeeklyReportColumn,
  ): string => {
    if (column === 'weeklyFileDate') {
      return formatDateDisplay(file.weeklyFileDate)
    }
    return formatDateDisplay(file.csaProcessingDate)
  }

  const getDetailsFieldValue = (record: WeeklyFileRecord, column: WeeklyDetailsColumn): string => {
    switch (column) {
      case 'csaMatchFound':
        return record.csaMatchFound
      case 'batchId':
        return valueOrBlank(record.batchId?.toString())
      case 'transactionType':
        return record.transactionType
      case 'transactionSource':
        return record.transactionSource
      case 'craStatus':
        return record.craStatus
      case 'matchedBy':
        return valueOrBlank(record.matchedBy)
    }
  }

  const filteredWeeklyFiles = useMemo(() => {
    const search = weeklyReportSearchTerm.trim().toLowerCase()
    const rows = [...weeklyFiles].filter((file) => {
      if (!search) return true

      const searchableFields = [
        getWeeklyReportFieldValue(file, 'weeklyFileDate'),
        getWeeklyReportFieldValue(file, 'csaProcessingDate'),
      ]

      return searchableFields.some((field) => field.toLowerCase().includes(search))
    })

    for (const [column, filters] of Object.entries(weeklyReportColumnFilters) as Array<
      [WeeklyReportColumn, string[]]
    >) {
      if (filters.length > 0) {
        rows.splice(
          0,
          rows.length,
          ...rows.filter((file) => filters.includes(getWeeklyReportFieldValue(file, column))),
        )
      }
    }

    if (weeklyReportSortConfig) {
      const { column, direction } = weeklyReportSortConfig
      rows.sort((left, right) => {
        const leftValue = getWeeklyReportFieldValue(left, column)
        const rightValue = getWeeklyReportFieldValue(right, column)
        const comparison = compareStrings(leftValue, rightValue)
        return direction === 'asc' ? comparison : -comparison
      })
    }

    return rows
  }, [weeklyFiles, weeklyReportSearchTerm, weeklyReportColumnFilters, weeklyReportSortConfig])

  const filteredRecords = useMemo(() => {
    const search = detailsSearchTerm.trim().toLowerCase()
    const rows = [...records].filter((record) => {
      if (!search) return true

      const searchableFields = [
        getDetailsFieldValue(record, 'csaMatchFound'),
        getDetailsFieldValue(record, 'batchId'),
        getDetailsFieldValue(record, 'transactionType'),
        getDetailsFieldValue(record, 'transactionSource'),
        getDetailsFieldValue(record, 'craStatus'),
        getDetailsFieldValue(record, 'matchedBy'),
      ]

      return searchableFields.some((field) => field.toLowerCase().includes(search))
    })

    for (const [column, filters] of Object.entries(detailsColumnFilters) as Array<
      [WeeklyDetailsColumn, string[]]
    >) {
      if (filters.length > 0) {
        rows.splice(
          0,
          rows.length,
          ...rows.filter((record) => filters.includes(getDetailsFieldValue(record, column))),
        )
      }
    }

    if (detailsSortConfig) {
      const { column, direction } = detailsSortConfig
      rows.sort((left, right) => {
        const comparison = compareStrings(
          getDetailsFieldValue(left, column),
          getDetailsFieldValue(right, column),
        )
        return direction === 'asc' ? comparison : -comparison
      })
    }

    return rows
  }, [detailsSearchTerm, records, detailsColumnFilters, detailsSortConfig])

  const handleWeeklyReportSortClick = (
    event: React.MouseEvent<HTMLElement>,
    column: WeeklyReportColumn,
  ) => {
    setWeeklyReportSortAnchor({ element: event.currentTarget, column })
  }

  const handleWeeklyReportSortClose = () => {
    setWeeklyReportSortAnchor({ ...weeklyReportSortAnchor, element: null })
  }

  const handleWeeklyReportSort = (column: WeeklyReportColumn, direction: SortDirection) => {
    setWeeklyReportSortConfig({ column, direction })
    handleWeeklyReportSortClose()
  }

  const handleWeeklyReportFilterClick = (
    event: React.MouseEvent<HTMLElement>,
    column: WeeklyReportColumn,
  ) => {
    setWeeklyReportFilterAnchor({ element: event.currentTarget, column })
    setWeeklyReportFilterSearchTerm('')
  }

  const handleWeeklyReportFilterClose = () => {
    setWeeklyReportFilterAnchor({ ...weeklyReportFilterAnchor, element: null })
    setWeeklyReportFilterSearchTerm('')
  }

  const handleWeeklyReportFilterChange = (column: WeeklyReportColumn, value: string) => {
    setWeeklyReportColumnFilters((prev) => {
      const current = prev[column] ?? []
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
      return { ...prev, [column]: next }
    })
  }

  const clearWeeklyReportColumnFilter = (column: WeeklyReportColumn) => {
    setWeeklyReportColumnFilters((prev) => ({ ...prev, [column]: [] }))
    setWeeklyReportFilterSearchTerm('')
  }

  const getWeeklyReportUniqueValues = (column: WeeklyReportColumn): string[] => {
    return Array.from(new Set(weeklyFiles.map((file) => getWeeklyReportFieldValue(file, column))))
      .filter((value) => value !== '')
      .sort((a, b) => compareStrings(a, b))
  }

  const handleDetailsSortClick = (
    event: React.MouseEvent<HTMLElement>,
    column: WeeklyDetailsColumn,
  ) => {
    setDetailsSortAnchor({ element: event.currentTarget, column })
  }

  const handleDetailsSortClose = () => {
    setDetailsSortAnchor({ ...detailsSortAnchor, element: null })
  }

  const handleDetailsSort = (column: WeeklyDetailsColumn, direction: SortDirection) => {
    setDetailsSortConfig({ column, direction })
    handleDetailsSortClose()
  }

  const handleDetailsFilterClick = (
    event: React.MouseEvent<HTMLElement>,
    column: WeeklyDetailsColumn,
  ) => {
    setDetailsFilterAnchor({ element: event.currentTarget, column })
    setDetailsFilterSearchTerm('')
  }

  const handleDetailsFilterClose = () => {
    setDetailsFilterAnchor({ ...detailsFilterAnchor, element: null })
    setDetailsFilterSearchTerm('')
  }

  const handleDetailsFilterChange = (column: WeeklyDetailsColumn, value: string) => {
    setDetailsColumnFilters((prev) => {
      const current = prev[column] ?? []
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
      return { ...prev, [column]: next }
    })
  }

  const clearDetailsColumnFilter = (column: WeeklyDetailsColumn) => {
    setDetailsColumnFilters((prev) => ({ ...prev, [column]: [] }))
    setDetailsFilterSearchTerm('')
  }

  const getDetailsUniqueValues = (column: WeeklyDetailsColumn): string[] => {
    return Array.from(new Set(records.map((record) => getDetailsFieldValue(record, column))))
      .filter((value) => value !== '')
      .sort((a, b) => compareStrings(a, b))
  }

  const runChildSearch = async (page = 1) => {
    if (!childSearchTerm.trim()) {
      setSearchedChildren([])
      setChildSearchTotalPages(1)
      return
    }

    setLoadingChildSearch(true)
    setActionError(null)
    try {
      const response = await fullTextSearchContacts(childSearchTerm.trim(), page, SEARCH_PAGE_SIZE)
      setSearchedChildren(response.data)
      setChildSearchTotalPages(Math.max(response.totalPages, 1))
    } catch (err) {
      console.error('Failed to search contacts:', err)
      setActionError('Failed to search contacts. Please try again.')
      setSearchedChildren([])
      setChildSearchTotalPages(1)
    } finally {
      setLoadingChildSearch(false)
    }
  }

  const refreshSelectedFileRecords = async () => {
    if (!selectedFileId) return
    const response = await getWeeklyFileRecords(selectedFileId, recordsPage, DETAILS_PAGE_SIZE)
    setRecords(response.data)
    setRecordsTotalPages(Math.max(response.totalPages, 1))
  }

  const refreshWeeklyFiles = async () => {
    const response = await getWeeklyFiles(weeklyFilesPage, SUMMARY_PAGE_SIZE)
    setWeeklyFiles(response.data)
    setWeeklyFilesTotalPages(Math.max(response.totalPages, 1))
  }

  const handleConfirmReprocess = async () => {
    if (!selectedFileId) return

    setReprocessing(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const result = await reprocessWeeklyFile(selectedFileId)
      await Promise.all([refreshWeeklyFiles(), refreshSelectedFileRecords()])

      setActionMessage(
        `Reprocess complete: ${result.processedRecordIds.length} processed, ${result.skippedRecords.length} skipped.`,
      )
    } catch (err: any) {
      console.error('Failed to reprocess weekly file:', err)
      setActionError(err?.response?.data?.message || 'Failed to reprocess weekly file.')
    } finally {
      setReprocessing(false)
    }
  }

  const handleAssociate = async () => {
    if (!selectedFileId || !selectedRecordId || !selectedSearchContactId) return

    setSavingAssociation(true)
    setActionError(null)
    setActionMessage(null)
    try {
      await associateWeeklyFileRecord(selectedFileId, selectedRecordId, selectedSearchContactId)
      await refreshSelectedFileRecords()
      setActionMessage('Record associated successfully.')
    } catch (err: any) {
      console.error('Failed to associate weekly file record:', err)
      setActionError(err?.response?.data?.message || 'Failed to associate record.')
    } finally {
      setSavingAssociation(false)
    }
  }

  const handleDissociate = async () => {
    if (!selectedFileId || !selectedRecordId) return

    setSavingAssociation(true)
    setActionError(null)
    setActionMessage(null)
    try {
      await dissociateWeeklyFileRecord(selectedFileId, selectedRecordId)
      await refreshSelectedFileRecords()
      setActionMessage('Record dissociated successfully.')
    } catch (err: any) {
      console.error('Failed to dissociate weekly file record:', err)
      setActionError(err?.response?.data?.message || 'Failed to dissociate record.')
    } finally {
      setSavingAssociation(false)
    }
  }

  const selectedFileName = useMemo(
    () => weeklyFiles.find((file) => file.id === selectedFileId)?.fileName ?? null,
    [weeklyFiles, selectedFileId],
  )

  return (
    <Box>
      {error && (
        <Typography variant="body2" color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      {actionMessage && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {actionMessage}
        </Alert>
      )}
      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      )}

      <Typography variant="h6" sx={{ fontWeight: 500, mb: 2, textAlign: 'left' }}>
        Weekly Report
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search weekly report..."
          value={weeklyReportSearchTerm}
          onChange={(e) => setWeeklyReportSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Box component="span" sx={{ fontSize: '18px' }}>
                  🔍
                </Box>
              </InputAdornment>
            ),
            endAdornment: weeklyReportSearchTerm && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setWeeklyReportSearchTerm('')} edge="end">
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
                !weeklyReportSearchTerm &&
                !weeklyReportSortConfig &&
                Object.values(weeklyReportColumnFilters).every((arr) => arr.length === 0)
              }
              onClick={() => {
                setWeeklyReportSearchTerm('')
                setWeeklyReportColumnFilters({
                  weeklyFileDate: [],
                  csaProcessingDate: [],
                })
                setWeeklyReportSortConfig(null)
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
      <TableContainer component={Paper} sx={{ boxShadow: 1, mb: 4 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span
                    onClick={(e) => handleWeeklyReportSortClick(e, 'weeklyFileDate')}
                    style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600 }}
                  >
                    Weekly File Date
                  </span>
                  <IconButton
                    size="small"
                    onClick={(e) => handleWeeklyReportFilterClick(e, 'weeklyFileDate')}
                    sx={{
                      padding: 0.5,
                      color:
                        weeklyReportColumnFilters.weeklyFileDate.length > 0 ? '#1976d2' : '#666',
                    }}
                  >
                    <FilterListIcon fontSize="small" />
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span
                    onClick={(e) => handleWeeklyReportSortClick(e, 'csaProcessingDate')}
                    style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600 }}
                  >
                    CSA Processing Date
                  </span>
                  <IconButton
                    size="small"
                    onClick={(e) => handleWeeklyReportFilterClick(e, 'csaProcessingDate')}
                    sx={{
                      padding: 0.5,
                      color:
                        weeklyReportColumnFilters.csaProcessingDate.length > 0 ? '#1976d2' : '#666',
                    }}
                  >
                    <FilterListIcon fontSize="small" />
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Total records count</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>&apos;E&apos; records count</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Matched count</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loadingFiles ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Loading weekly files...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : filteredWeeklyFiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    {weeklyReportSearchTerm.trim()
                      ? 'No weekly files match the current search'
                      : 'No weekly files found'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredWeeklyFiles.map((file) => (
                <TableRow
                  key={file.id}
                  hover
                  onClick={() => {
                    setSelectedFileId(file.id)
                    setRecordsPage(1)
                  }}
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { backgroundColor: '#f9f9f9' },
                    backgroundColor: selectedFileId === file.id ? '#e3f2fd' : 'inherit',
                  }}
                >
                  <TableCell>{formatDateDisplay(file.weeklyFileDate)}</TableCell>
                  <TableCell>{formatDateDisplay(file.csaProcessingDate)}</TableCell>
                  <TableCell>{file.totalCount}</TableCell>
                  <TableCell>{file.eCount}</TableCell>
                  <TableCell>{file.matchedCount}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {weeklyFiles.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 4 }}>
          <Pagination
            count={weeklyFilesTotalPages}
            page={weeklyFilesPage}
            onChange={(_, page) => setWeeklyFilesPage(page)}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 500, textAlign: 'left' }}>
          Details{selectedFileName ? ` - ${selectedFileName}` : ''}
        </Typography>
        <Button
          variant="contained"
          onClick={handleConfirmReprocess}
          disabled={!selectedFileId || reprocessing}
        >
          Confirm
        </Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search details..."
          value={detailsSearchTerm}
          onChange={(e) => setDetailsSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Box component="span" sx={{ fontSize: '18px' }}>
                  🔍
                </Box>
              </InputAdornment>
            ),
            endAdornment: detailsSearchTerm && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setDetailsSearchTerm('')} edge="end">
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
                !detailsSearchTerm &&
                !detailsSortConfig &&
                Object.values(detailsColumnFilters).every((arr) => arr.length === 0)
              }
              onClick={() => {
                setDetailsSearchTerm('')
                setDetailsColumnFilters({
                  csaMatchFound: [],
                  batchId: [],
                  transactionType: [],
                  transactionSource: [],
                  craStatus: [],
                  matchedBy: [],
                })
                setDetailsSortConfig(null)
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
      <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600 }} />
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span
                    onClick={(e) => handleDetailsSortClick(e, 'csaMatchFound')}
                    style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600 }}
                  >
                    CSA Match Found?
                  </span>
                  <IconButton
                    size="small"
                    onClick={(e) => handleDetailsFilterClick(e, 'csaMatchFound')}
                    sx={{
                      padding: 0.5,
                      color: detailsColumnFilters.csaMatchFound.length > 0 ? '#1976d2' : '#666',
                    }}
                  >
                    <FilterListIcon fontSize="small" />
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span
                    onClick={(e) => handleDetailsSortClick(e, 'batchId')}
                    style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600 }}
                  >
                    Batch ID
                  </span>
                  <IconButton
                    size="small"
                    onClick={(e) => handleDetailsFilterClick(e, 'batchId')}
                    sx={{
                      padding: 0.5,
                      color: detailsColumnFilters.batchId.length > 0 ? '#1976d2' : '#666',
                    }}
                  >
                    <FilterListIcon fontSize="small" />
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span
                    onClick={(e) => handleDetailsSortClick(e, 'transactionType')}
                    style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600 }}
                  >
                    Transaction Type
                  </span>
                  <IconButton
                    size="small"
                    onClick={(e) => handleDetailsFilterClick(e, 'transactionType')}
                    sx={{
                      padding: 0.5,
                      color: detailsColumnFilters.transactionType.length > 0 ? '#1976d2' : '#666',
                    }}
                  >
                    <FilterListIcon fontSize="small" />
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span
                    onClick={(e) => handleDetailsSortClick(e, 'transactionSource')}
                    style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600 }}
                  >
                    Transaction Source
                  </span>
                  <IconButton
                    size="small"
                    onClick={(e) => handleDetailsFilterClick(e, 'transactionSource')}
                    sx={{
                      padding: 0.5,
                      color: detailsColumnFilters.transactionSource.length > 0 ? '#1976d2' : '#666',
                    }}
                  >
                    <FilterListIcon fontSize="small" />
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span
                    onClick={(e) => handleDetailsSortClick(e, 'craStatus')}
                    style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600 }}
                  >
                    CRA Status
                  </span>
                  <IconButton
                    size="small"
                    onClick={(e) => handleDetailsFilterClick(e, 'craStatus')}
                    sx={{
                      padding: 0.5,
                      color: detailsColumnFilters.craStatus.length > 0 ? '#1976d2' : '#666',
                    }}
                  >
                    <FilterListIcon fontSize="small" />
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span
                    onClick={(e) => handleDetailsSortClick(e, 'matchedBy')}
                    style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600 }}
                  >
                    Matched By
                  </span>
                  <IconButton
                    size="small"
                    onClick={(e) => handleDetailsFilterClick(e, 'matchedBy')}
                    sx={{
                      padding: 0.5,
                      color: detailsColumnFilters.matchedBy.length > 0 ? '#1976d2' : '#666',
                    }}
                  >
                    <FilterListIcon fontSize="small" />
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>DIN</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>First Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Last Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Initial</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Gender</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Date of Birth</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Birth City</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Birth Province</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Birth Country</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Care Start Date</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Care End Date</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Cancel Reason Code</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Completion Date</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Associated Case #</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Associated Person ID ICM</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loadingRecords ? (
              <TableRow>
                <TableCell colSpan={22} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Loading weekly file details...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : !selectedFileId ? (
              <TableRow>
                <TableCell colSpan={22} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Select a weekly file to view details
                  </Typography>
                </TableCell>
              </TableRow>
            ) : filteredRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={22} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    {detailsSearchTerm.trim()
                      ? 'No records match the current search'
                      : 'No records found for this weekly file'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredRecords.map((record) => (
                <TableRow
                  key={record.id}
                  hover
                  onClick={() => setSelectedRecordId(record.id)}
                  sx={{
                    '&:hover': { backgroundColor: '#f9f9f9' },
                    cursor: 'pointer',
                    backgroundColor: selectedRecordId === record.id ? '#e3f2fd' : 'inherit',
                  }}
                >
                  <TableCell padding="checkbox">
                    <Radio checked={selectedRecordId === record.id} />
                  </TableCell>
                  <TableCell>{record.csaMatchFound}</TableCell>
                  <TableCell>{valueOrBlank(record.batchId?.toString())}</TableCell>
                  <TableCell>{record.transactionType}</TableCell>
                  <TableCell>{record.transactionSource}</TableCell>
                  <TableCell>{record.craStatus}</TableCell>
                  <TableCell>{valueOrBlank(record.matchedBy)}</TableCell>
                  <TableCell>{record.din}</TableCell>
                  <TableCell>{record.firstName}</TableCell>
                  <TableCell>{record.lastName}</TableCell>
                  <TableCell>{record.initial}</TableCell>
                  <TableCell>{record.gender}</TableCell>
                  <TableCell>{valueOrBlank(record.dateOfBirth)}</TableCell>
                  <TableCell>{record.birthCity}</TableCell>
                  <TableCell>{record.birthProvince}</TableCell>
                  <TableCell>{record.birthCountry}</TableCell>
                  <TableCell>{valueOrBlank(record.careStartDate)}</TableCell>
                  <TableCell>{valueOrBlank(record.careEndDate)}</TableCell>
                  <TableCell>{record.cancelReasonCode}</TableCell>
                  <TableCell>{valueOrBlank(record.completionDate)}</TableCell>
                  <TableCell>{valueOrBlank(record.associatedCaseNumber)}</TableCell>
                  <TableCell>{valueOrBlank(record.associatedPersonIdIcm)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {selectedFileId && records.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Pagination
            count={recordsTotalPages}
            page={recordsPage}
            onChange={(_, page) => setRecordsPage(page)}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      )}

      {selectedRecord && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            Child Search
          </Typography>

          {selectedRecord.csaMatchFound !== 'Yes' && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {MANUAL_REVIEW_WARNING}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
            <TextField
              size="small"
              placeholder="Search CSA Master"
              value={childSearchTerm}
              onChange={(e) => setChildSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setChildSearchPage(1)
                  void runChildSearch(1)
                }
              }}
              sx={{ width: 320 }}
            />
            <Button
              variant="outlined"
              onClick={() => {
                setChildSearchPage(1)
                void runChildSearch(1)
              }}
              disabled={!childSearchTerm.trim() || loadingChildSearch}
            >
              Search
            </Button>
            <Button
              variant="contained"
              onClick={handleAssociate}
              disabled={!selectedSearchContactId || savingAssociation || !selectedRecordId}
            >
              Associate
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={handleDissociate}
              disabled={savingAssociation || !selectedRecordId}
            >
              Dissociate
            </Button>
          </Box>

          <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600 }} />
                  <TableCell sx={{ fontWeight: 600 }}>DIN</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>First Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Last Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Middle Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Gender</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Date of Birth</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>AKA Last Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>AKA First Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Person ID ICM</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Person ID MIS</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Case Number</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Legacy File Num</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loadingChildSearch ? (
                  <TableRow>
                    <TableCell colSpan={13} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        Searching contacts...
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : searchedChildren.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        {childSearchTerm.trim()
                          ? 'No matching child records found'
                          : 'Search to list child records'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  searchedChildren.map((child) => (
                    <TableRow
                      key={child.id}
                      hover
                      onClick={() => setSelectedSearchContactId(child.id)}
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { backgroundColor: '#f9f9f9' },
                        backgroundColor:
                          selectedSearchContactId === child.id ? '#e3f2fd' : 'inherit',
                      }}
                    >
                      <TableCell padding="checkbox">
                        <Radio checked={selectedSearchContactId === child.id} />
                      </TableCell>
                      <TableCell>{valueOrBlank(child.din)}</TableCell>
                      <TableCell>{valueOrBlank(child.firstName)}</TableCell>
                      <TableCell>{valueOrBlank(child.lastName)}</TableCell>
                      <TableCell>{valueOrBlank(child.middleName)}</TableCell>
                      <TableCell>{valueOrBlank(child.gender)}</TableCell>
                      <TableCell>{valueOrBlank(child.dateOfBirth)}</TableCell>
                      <TableCell>{valueOrBlank(child.akaLastName)}</TableCell>
                      <TableCell>{valueOrBlank(child.akaFirstName)}</TableCell>
                      <TableCell>{valueOrBlank(child.personIdIcm)}</TableCell>
                      <TableCell>{valueOrBlank(child.personIdMis)}</TableCell>
                      <TableCell>{valueOrBlank(child.caseNumber)}</TableCell>
                      <TableCell>{valueOrBlank(child.legacyFileNumber)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {searchedChildren.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Pagination
                count={childSearchTotalPages}
                page={childSearchPage}
                onChange={(_, page) => {
                  setChildSearchPage(page)
                  void runChildSearch(page)
                }}
                color="primary"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
        </Box>
      )}

      <Menu
        anchorEl={weeklyReportSortAnchor.element}
        open={Boolean(weeklyReportSortAnchor.element)}
        onClose={handleWeeklyReportSortClose}
        PaperProps={{
          sx: {
            width: 200,
          },
        }}
      >
        <MenuItem
          onClick={() => handleWeeklyReportSort(weeklyReportSortAnchor.column, 'asc')}
          sx={{ gap: 1.5 }}
        >
          <ArrowUpwardIcon fontSize="small" />
          <Typography variant="body2">Sort Ascending</Typography>
        </MenuItem>
        <MenuItem
          onClick={() => handleWeeklyReportSort(weeklyReportSortAnchor.column, 'desc')}
          sx={{ gap: 1.5 }}
        >
          <ArrowDownwardIcon fontSize="small" />
          <Typography variant="body2">Sort Descending</Typography>
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={detailsSortAnchor.element}
        open={Boolean(detailsSortAnchor.element)}
        onClose={handleDetailsSortClose}
        PaperProps={{
          sx: {
            width: 200,
          },
        }}
      >
        <MenuItem
          onClick={() => handleDetailsSort(detailsSortAnchor.column, 'asc')}
          sx={{ gap: 1.5 }}
        >
          <ArrowUpwardIcon fontSize="small" />
          <Typography variant="body2">Sort Ascending</Typography>
        </MenuItem>
        <MenuItem
          onClick={() => handleDetailsSort(detailsSortAnchor.column, 'desc')}
          sx={{ gap: 1.5 }}
        >
          <ArrowDownwardIcon fontSize="small" />
          <Typography variant="body2">Sort Descending</Typography>
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={weeklyReportFilterAnchor.element}
        open={Boolean(weeklyReportFilterAnchor.element)}
        onClose={handleWeeklyReportFilterClose}
        PaperProps={{
          sx: {
            maxHeight: 400,
            width: 250,
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Filter by{' '}
              {weeklyReportFilterAnchor.column === 'weeklyFileDate'
                ? 'Weekly File Date'
                : 'CSA Processing Date'}
            </Typography>
            <Button
              size="small"
              onClick={() => {
                clearWeeklyReportColumnFilter(weeklyReportFilterAnchor.column)
                handleWeeklyReportFilterClose()
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
            value={weeklyReportFilterSearchTerm}
            onChange={(e) => setWeeklyReportFilterSearchTerm(e.target.value)}
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
            {getWeeklyReportUniqueValues(weeklyReportFilterAnchor.column)
              .filter((value) =>
                value.toLowerCase().includes(weeklyReportFilterSearchTerm.toLowerCase()),
              )
              .map((value) => (
                <Box key={value} sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
                  <Checkbox
                    size="small"
                    checked={
                      weeklyReportColumnFilters[weeklyReportFilterAnchor.column]?.includes(value) ||
                      false
                    }
                    onChange={() =>
                      handleWeeklyReportFilterChange(weeklyReportFilterAnchor.column, value)
                    }
                  />
                  <Typography variant="body2">{value}</Typography>
                </Box>
              ))}
          </Box>
        </Box>
      </Menu>

      <Menu
        anchorEl={detailsFilterAnchor.element}
        open={Boolean(detailsFilterAnchor.element)}
        onClose={handleDetailsFilterClose}
        PaperProps={{
          sx: {
            maxHeight: 400,
            width: 250,
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Filter by {detailsFilterAnchor.column}
            </Typography>
            <Button
              size="small"
              onClick={() => {
                clearDetailsColumnFilter(detailsFilterAnchor.column)
                handleDetailsFilterClose()
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
            value={detailsFilterSearchTerm}
            onChange={(e) => setDetailsFilterSearchTerm(e.target.value)}
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
            {getDetailsUniqueValues(detailsFilterAnchor.column)
              .filter((value) =>
                value.toLowerCase().includes(detailsFilterSearchTerm.toLowerCase()),
              )
              .map((value) => (
                <Box key={value} sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
                  <Checkbox
                    size="small"
                    checked={
                      detailsColumnFilters[detailsFilterAnchor.column]?.includes(value) || false
                    }
                    onChange={() => handleDetailsFilterChange(detailsFilterAnchor.column, value)}
                  />
                  <Typography variant="body2">{value}</Typography>
                </Box>
              ))}
          </Box>
        </Box>
      </Menu>
    </Box>
  )
}
