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
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fullTextSearchContacts, type Contact } from '../service/contacts-service'
import {
  associateWeeklyFileRecord,
  dissociateWeeklyFileRecord,
  getWeeklyFileRecords,
  getWeeklyFiles,
  reprocessWeeklyFileRecord,
  type WeeklyFileRecord,
  type WeeklyFileSummary,
} from '../service/weekly-files-service'

const SUMMARY_PAGE_SIZE = 10
const DETAILS_PAGE_SIZE = 10
const SEARCH_PAGE_SIZE = 10
const CHILD_SEARCH_MIN_LENGTH = 3
const MANUAL_REVIEW_WARNING =
  'This weekly response record is not matched to a CSA master contact. Search and select a child record below to associate manually.'
const ASSOCIATED_RECORD_INFO = 'Contact associated, click Confirm to reprocess this record.'

type SortDirection = 'asc' | 'desc'
type WeeklyReportColumn = 'weeklyFileDate' | 'csaProcessingDate'
type WeeklyDetailsColumn =
  | 'csaMatchFound'
  | 'batchNumber'
  | 'transactionType'
  | 'transactionSource'
  | 'craStatus'
  | 'matchedBy'
type ChildSearchColumn =
  | 'din'
  | 'firstName'
  | 'lastName'
  | 'middleName'
  | 'gender'
  | 'dateOfBirth'
  | 'akaLastName'
  | 'akaFirstName'
  | 'personIdIcm'
  | 'personIdMis'
  | 'caseNumber'
  | 'legacyFileNumber'
  | 'birthPlace'

const WEEKLY_REPORT_COLUMNS: WeeklyReportColumn[] = ['weeklyFileDate', 'csaProcessingDate']
const WEEKLY_DETAILS_COLUMNS: WeeklyDetailsColumn[] = [
  'csaMatchFound',
  'matchedBy',
  'batchNumber',
  'transactionType',
  'transactionSource',
  'craStatus',
]
const CHILD_SEARCH_COLUMNS: ChildSearchColumn[] = [
  'din',
  'firstName',
  'lastName',
  'middleName',
  'gender',
  'dateOfBirth',
  'akaLastName',
  'akaFirstName',
  'personIdIcm',
  'personIdMis',
  'caseNumber',
  'legacyFileNumber',
  'birthPlace',
]

const CHILD_SEARCH_COLUMN_LABELS: Record<ChildSearchColumn, string> = {
  din: 'DIN',
  firstName: 'First Name',
  lastName: 'Last Name',
  middleName: 'Middle Name',
  gender: 'Gender',
  dateOfBirth: 'Date of Birth',
  akaLastName: 'AKA Last Name',
  akaFirstName: 'AKA First Name',
  personIdIcm: 'Person ID ICM',
  personIdMis: 'Person ID MIS',
  caseNumber: 'Case Number',
  legacyFileNumber: 'Legacy File Num',
  birthPlace: 'Birth Place',
}

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

const formatDateTimeDisplay = (value: string | null): string => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  const month = parsed.toLocaleString('en-US', { month: 'short' })
  const day = String(parsed.getDate()).padStart(2, '0')
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  const seconds = String(parsed.getSeconds()).padStart(2, '0')
  return `${parsed.getFullYear()}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

const valueOrBlank = (value: string | null | undefined): string => value ?? ''

const compareStrings = (left: string, right: string): number =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })

const isAbortError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false
  const maybeErr = err as { name?: string; code?: string }
  return maybeErr.name === 'CanceledError' || maybeErr.code === 'ERR_CANCELED'
}

const filterAndSortRows = <T, C extends string>(
  rows: T[],
  columns: C[],
  getValue: (row: T, column: C) => string,
  searchTerm: string,
  columnFilters: Record<C, string[]>,
  sortConfig: SortConfig<C>,
): T[] => {
  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const rowsWithFields = rows.map((row) => {
    const fields = columns.reduce(
      (acc, column) => {
        acc[column] = getValue(row, column)
        return acc
      },
      {} as Record<C, string>,
    )
    return { row, fields }
  })

  const filteredRows = rowsWithFields.filter(({ fields }) => {
    if (
      normalizedSearchTerm &&
      !columns.some((column) => fields[column].toLowerCase().includes(normalizedSearchTerm))
    ) {
      return false
    }

    return columns.every((column) => {
      const filters = columnFilters[column]
      return filters.length === 0 || filters.includes(fields[column])
    })
  })

  if (sortConfig) {
    const { column, direction } = sortConfig
    filteredRows.sort((left, right) => {
      const comparison = compareStrings(left.fields[column], right.fields[column])
      return direction === 'asc' ? comparison : -comparison
    })
  }

  return filteredRows.map(({ row }) => row)
}

const toggleColumnFilterValue = <T extends string>(
  previous: Record<T, string[]>,
  column: T,
  value: string,
): Record<T, string[]> => {
  const current = previous[column] ?? []
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value]
  return { ...previous, [column]: next }
}

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
  const [reprocessConfirmOpen, setReprocessConfirmOpen] = useState(false)

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
    batchNumber: [],
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
  const [detailsSelectionFilterAnchor, setDetailsSelectionFilterAnchor] =
    useState<HTMLElement | null>(null)
  const [detailsShowSelectedOnly, setDetailsShowSelectedOnly] = useState(false)

  const [childSearchColumnFilters, setChildSearchColumnFilters] = useState<
    Record<ChildSearchColumn, string[]>
  >({
    din: [],
    firstName: [],
    lastName: [],
    middleName: [],
    gender: [],
    dateOfBirth: [],
    akaLastName: [],
    akaFirstName: [],
    personIdIcm: [],
    personIdMis: [],
    caseNumber: [],
    legacyFileNumber: [],
    birthPlace: [],
  })
  const [childSearchFilterSearchTerm, setChildSearchFilterSearchTerm] = useState('')
  const [childSearchSortConfig, setChildSearchSortConfig] =
    useState<SortConfig<ChildSearchColumn>>(null)
  const [childSearchSortAnchor, setChildSearchSortAnchor] = useState<{
    element: HTMLElement | null
    column: ChildSearchColumn
  }>({
    element: null,
    column: 'din',
  })
  const [childSearchFilterAnchor, setChildSearchFilterAnchor] = useState<{
    element: HTMLElement | null
    column: ChildSearchColumn
  }>({
    element: null,
    column: 'din',
  })

  const [loadingFiles, setLoadingFiles] = useState(false)
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const childSearchRequestIdRef = useRef(0)

  useEffect(() => {
    const abortController = new AbortController()

    const loadWeeklyFiles = async () => {
      setLoadingFiles(true)
      setError(null)
      try {
        const response = await getWeeklyFiles(
          weeklyFilesPage,
          SUMMARY_PAGE_SIZE,
          abortController.signal,
        )
        setWeeklyFiles(response.data)
        setWeeklyFilesTotalPages(Math.max(response.totalPages, 1))
      } catch (err) {
        if (isAbortError(err)) {
          return
        }
        console.error('Failed to fetch weekly files:', err)
        setError('Failed to load weekly files. Please try again.')
        setWeeklyFiles([])
      } finally {
        setLoadingFiles(false)
      }
    }

    void loadWeeklyFiles()

    return () => {
      abortController.abort()
    }
  }, [weeklyFilesPage])

  useEffect(() => {
    const resetSelection = (nextSelectedFileId: number | null) => {
      const timerId = window.setTimeout(() => {
        setSelectedFileId(nextSelectedFileId)
        setRecordsPage(1)
        setSelectedRecordId(null)
      }, 0)
      return () => window.clearTimeout(timerId)
    }

    if (weeklyFiles.length === 0) {
      if (selectedFileId !== null) {
        return resetSelection(null)
      }
      return
    }

    if (selectedFileId === null) {
      return resetSelection(weeklyFiles[0].id)
    }

    if (!weeklyFiles.some((file) => file.id === selectedFileId)) {
      return resetSelection(weeklyFiles[0].id)
    }
  }, [weeklyFiles, selectedFileId])

  useEffect(() => {
    const abortController = new AbortController()

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
        const response = await getWeeklyFileRecords(
          selectedFileId,
          recordsPage,
          DETAILS_PAGE_SIZE,
          abortController.signal,
        )
        setRecords(response.data)
        setRecordsTotalPages(Math.max(response.totalPages, 1))
        setSelectedRecordId((prev) =>
          prev && !response.data.some((record) => record.id === prev) ? null : prev,
        )
      } catch (err) {
        if (isAbortError(err)) {
          return
        }
        console.error('Failed to fetch weekly file records:', err)
        setError('Failed to load weekly file details. Please try again.')
        setRecords([])
      } finally {
        setLoadingRecords(false)
      }
    }

    void loadRecords()

    return () => {
      abortController.abort()
    }
  }, [selectedFileId, recordsPage])

  useEffect(() => {
    childSearchRequestIdRef.current += 1

    const timerId = window.setTimeout(() => {
      setLoadingChildSearch(false)
      setSelectedSearchContactId(null)
      setSearchedChildren([])
      setChildSearchPage(1)
      setChildSearchTotalPages(1)
      setActionError(null)
      setActionMessage(null)
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [selectedRecordId])

  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedRecordId) ?? null,
    [records, selectedRecordId],
  )

  const selectedRecordMatchStatus = selectedRecord?.matchStatus?.toLowerCase() ?? ''
  const isSelectedRecordUnmatched = selectedRecordMatchStatus === 'unmatched'
  const isSelectedRecordAssociated = selectedRecordMatchStatus === 'associated'
  const hasAssociatedPendingRecords = records.some(
    (record) => record.matchStatus?.toLowerCase() === 'associated' && !record.processedAt,
  )
  const canReprocessSelectedRecord =
    !!selectedFileId &&
    !!selectedRecordId &&
    isSelectedRecordAssociated &&
    !selectedRecord?.processedAt &&
    hasAssociatedPendingRecords

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
      case 'batchNumber':
        return valueOrBlank(record.batchNumber?.toString())
      case 'transactionType':
        return record.transactionType
      case 'transactionSource':
        return record.transactionSource
      case 'craStatus':
        return record.craStatus
      case 'matchedBy':
        return valueOrBlank(record.matchedBy)
      default:
        return ''
    }
  }

  const getBirthPlace = useCallback((contact: Contact): string => {
    return [contact.birthCity, contact.birthProvince, contact.birthCountry]
      .filter((value) => !!value)
      .join(', ')
  }, [])

  const getChildSearchFieldValue = useCallback(
    (child: Contact, column: ChildSearchColumn): string => {
      switch (column) {
        case 'din':
          return valueOrBlank(child.din)
        case 'firstName':
          return valueOrBlank(child.firstName)
        case 'lastName':
          return valueOrBlank(child.lastName)
        case 'middleName':
          return valueOrBlank(child.middleName)
        case 'gender':
          return valueOrBlank(child.gender)
        case 'dateOfBirth':
          return valueOrBlank(child.dateOfBirth)
        case 'akaLastName':
          return valueOrBlank(child.akaLastName)
        case 'akaFirstName':
          return valueOrBlank(child.akaFirstName)
        case 'personIdIcm':
          return valueOrBlank(child.personIdIcm)
        case 'personIdMis':
          return valueOrBlank(child.personIdMis)
        case 'caseNumber':
          return valueOrBlank(child.caseNumber)
        case 'legacyFileNumber':
          return valueOrBlank(child.legacyFileNumber)
        case 'birthPlace':
          return getBirthPlace(child)
        default:
          return ''
      }
    },
    [getBirthPlace],
  )

  const filteredWeeklyFiles = useMemo(() => {
    return filterAndSortRows(
      weeklyFiles,
      WEEKLY_REPORT_COLUMNS,
      getWeeklyReportFieldValue,
      weeklyReportSearchTerm,
      weeklyReportColumnFilters,
      weeklyReportSortConfig,
    )
  }, [weeklyFiles, weeklyReportSearchTerm, weeklyReportColumnFilters, weeklyReportSortConfig])

  const filteredRecords = useMemo(() => {
    const recordsAfterSearchFilterSort = filterAndSortRows(
      records,
      WEEKLY_DETAILS_COLUMNS,
      getDetailsFieldValue,
      detailsSearchTerm,
      detailsColumnFilters,
      detailsSortConfig,
    )

    if (!detailsShowSelectedOnly) {
      return recordsAfterSearchFilterSort
    }

    if (!selectedRecordId) {
      return []
    }

    return recordsAfterSearchFilterSort.filter((record) => record.id === selectedRecordId)
  }, [
    detailsSearchTerm,
    records,
    detailsColumnFilters,
    detailsSortConfig,
    detailsShowSelectedOnly,
    selectedRecordId,
  ])

  const filteredSearchedChildren = useMemo(() => {
    return filterAndSortRows(
      searchedChildren,
      CHILD_SEARCH_COLUMNS,
      getChildSearchFieldValue,
      '',
      childSearchColumnFilters,
      childSearchSortConfig,
    )
  }, [searchedChildren, childSearchColumnFilters, childSearchSortConfig, getChildSearchFieldValue])

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
    setWeeklyReportColumnFilters((prev) => toggleColumnFilterValue(prev, column, value))
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

  const handleDetailsSelectionFilterClose = () => {
    setDetailsSelectionFilterAnchor(null)
  }

  const handleDetailsFilterChange = (column: WeeklyDetailsColumn, value: string) => {
    setDetailsColumnFilters((prev) => toggleColumnFilterValue(prev, column, value))
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

  const handleChildSearchSortClick = (
    event: React.MouseEvent<HTMLElement>,
    column: ChildSearchColumn,
  ) => {
    setChildSearchSortAnchor({ element: event.currentTarget, column })
  }

  const handleChildSearchSortClose = () => {
    setChildSearchSortAnchor({ ...childSearchSortAnchor, element: null })
  }

  const handleChildSearchSort = (column: ChildSearchColumn, direction: SortDirection) => {
    setChildSearchSortConfig({ column, direction })
    handleChildSearchSortClose()
  }

  const handleChildSearchFilterClick = (
    event: React.MouseEvent<HTMLElement>,
    column: ChildSearchColumn,
  ) => {
    setChildSearchFilterAnchor({ element: event.currentTarget, column })
    setChildSearchFilterSearchTerm('')
  }

  const handleChildSearchFilterClose = () => {
    setChildSearchFilterAnchor({ ...childSearchFilterAnchor, element: null })
    setChildSearchFilterSearchTerm('')
  }

  const handleChildSearchFilterChange = (column: ChildSearchColumn, value: string) => {
    setChildSearchColumnFilters((prev) => toggleColumnFilterValue(prev, column, value))
  }

  const clearChildSearchColumnFilter = (column: ChildSearchColumn) => {
    setChildSearchColumnFilters((prev) => ({ ...prev, [column]: [] }))
    setChildSearchFilterSearchTerm('')
  }

  const getChildSearchUniqueValues = (column: ChildSearchColumn): string[] => {
    return Array.from(
      new Set(searchedChildren.map((child) => getChildSearchFieldValue(child, column))),
    )
      .filter((value) => value !== '')
      .sort((a, b) => compareStrings(a, b))
  }

  const runChildSearch = useCallback(
    async (page = 1) => {
      const requestId = ++childSearchRequestIdRef.current
      const trimmedSearchTerm = childSearchTerm.trim()

      if (!trimmedSearchTerm) {
        setSearchedChildren([])
        setChildSearchTotalPages(1)
        return
      }

      if (trimmedSearchTerm.length < CHILD_SEARCH_MIN_LENGTH) {
        setActionError(`Please enter at least ${CHILD_SEARCH_MIN_LENGTH} characters to search.`)
        setSearchedChildren([])
        setChildSearchTotalPages(1)
        return
      }

      setLoadingChildSearch(true)
      setActionError(null)
      try {
        const response = await fullTextSearchContacts(trimmedSearchTerm, page, SEARCH_PAGE_SIZE)
        if (requestId !== childSearchRequestIdRef.current) {
          return
        }
        setSearchedChildren(response.data)
        setChildSearchTotalPages(Math.max(response.totalPages, 1))
      } catch (err) {
        if (requestId !== childSearchRequestIdRef.current) {
          return
        }
        console.error('Failed to search contacts:', err)
        setActionError('Failed to search contacts. Please try again.')
        setSearchedChildren([])
        setChildSearchTotalPages(1)
      } finally {
        if (requestId === childSearchRequestIdRef.current) {
          setLoadingChildSearch(false)
        }
      }
    },
    [childSearchTerm],
  )

  useEffect(() => {
    const trimmedSearchTerm = childSearchTerm.trim()

    if (trimmedSearchTerm.length < CHILD_SEARCH_MIN_LENGTH) {
      childSearchRequestIdRef.current += 1

      const timerId = window.setTimeout(() => {
        setLoadingChildSearch(false)
        setSearchedChildren([])
        setChildSearchPage(1)
        setChildSearchTotalPages(1)
      }, 0)

      return () => window.clearTimeout(timerId)
    }

    const searchTimer = window.setTimeout(() => {
      setChildSearchPage(1)
      void runChildSearch(1)
    }, 400)

    return () => window.clearTimeout(searchTimer)
  }, [childSearchTerm, runChildSearch])

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
    if (!selectedFileId || !selectedRecordId) return

    setReprocessing(true)
    setActionError(null)
    setActionMessage(null)
    try {
      await reprocessWeeklyFileRecord(selectedFileId, selectedRecordId)
      await Promise.all([refreshWeeklyFiles(), refreshSelectedFileRecords()])

      setActionMessage(`Reprocess complete for record ${selectedRecordId}.`)
    } catch (err: any) {
      console.error('Failed to reprocess weekly file:', err)
      setActionError(err?.response?.data?.message || 'Failed to reprocess weekly file record.')
    } finally {
      setReprocessConfirmOpen(false)
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
      setActionMessage('Contact associated, click Confirm to reprocess this record.')
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
                  <TableCell>{formatDateTimeDisplay(file.csaProcessingDate)}</TableCell>
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
          onClick={() => setReprocessConfirmOpen(true)}
          disabled={!canReprocessSelectedRecord || reprocessing}
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
                !detailsShowSelectedOnly &&
                Object.values(detailsColumnFilters).every((arr) => arr.length === 0)
              }
              onClick={() => {
                setDetailsSearchTerm('')
                setDetailsColumnFilters({
                  csaMatchFound: [],
                  batchNumber: [],
                  transactionType: [],
                  transactionSource: [],
                  craStatus: [],
                  matchedBy: [],
                })
                setDetailsSortConfig(null)
                setDetailsShowSelectedOnly(false)
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
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span style={{ fontWeight: 600 }}>Selected</span>
                  <IconButton
                    size="small"
                    onClick={(e) => setDetailsSelectionFilterAnchor(e.currentTarget)}
                    sx={{
                      padding: 0.5,
                      color: detailsShowSelectedOnly ? '#1976d2' : '#666',
                    }}
                  >
                    <FilterListIcon fontSize="small" />
                  </IconButton>
                </Box>
              </TableCell>
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
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span
                    onClick={(e) => handleDetailsSortClick(e, 'batchNumber')}
                    style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600 }}
                  >
                    Batch Req ID
                  </span>
                  <IconButton
                    size="small"
                    onClick={(e) => handleDetailsFilterClick(e, 'batchNumber')}
                    sx={{
                      padding: 0.5,
                      color: detailsColumnFilters.batchNumber.length > 0 ? '#1976d2' : '#666',
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
                  <TableCell>{valueOrBlank(record.matchedBy)}</TableCell>
                  <TableCell>{valueOrBlank(record.batchNumber?.toString())}</TableCell>
                  <TableCell>{record.transactionType}</TableCell>
                  <TableCell>{record.transactionSource}</TableCell>
                  <TableCell>{record.craStatus}</TableCell>
                  <TableCell>{record.din}</TableCell>
                  <TableCell>{record.firstName}</TableCell>
                  <TableCell>{record.lastName}</TableCell>
                  <TableCell>{record.initial}</TableCell>
                  <TableCell>{record.gender}</TableCell>
                  <TableCell>{formatDateDisplay(record.dateOfBirth)}</TableCell>
                  <TableCell>{record.birthCity}</TableCell>
                  <TableCell>{record.birthProvince}</TableCell>
                  <TableCell>{record.birthCountry}</TableCell>
                  <TableCell>{formatDateDisplay(record.careStartDate)}</TableCell>
                  <TableCell>{formatDateDisplay(record.careEndDate)}</TableCell>
                  <TableCell>{record.cancelReasonCode}</TableCell>
                  <TableCell>{formatDateDisplay(record.completionDate)}</TableCell>
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
          <Typography variant="h6" sx={{ fontWeight: 500, mb: 1, textAlign: 'left' }}>
            Child Search
          </Typography>

          {isSelectedRecordUnmatched && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {MANUAL_REVIEW_WARNING}
            </Alert>
          )}
          {isSelectedRecordAssociated && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {ASSOCIATED_RECORD_INFO}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
            <TextField
              size="small"
              placeholder="Search CSA Master (min 3 chars)"
              value={childSearchTerm}
              onChange={(e) => {
                setChildSearchTerm(e.target.value)
                childSearchRequestIdRef.current += 1
                setLoadingChildSearch(false)
                setSelectedSearchContactId(null)
                setSearchedChildren([])
                setChildSearchPage(1)
                setChildSearchTotalPages(1)
              }}
              sx={{ width: 320 }}
            />
            <Button
              variant="outlined"
              onClick={() => {
                setChildSearchPage(1)
                void runChildSearch(1)
              }}
              disabled={
                childSearchTerm.trim().length < CHILD_SEARCH_MIN_LENGTH || loadingChildSearch
              }
            >
              Search
            </Button>
            <Tooltip title="Clear child search filters and sorting" arrow>
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<FilterAltOffIcon />}
                  disabled={
                    !childSearchSortConfig &&
                    Object.values(childSearchColumnFilters).every((arr) => arr.length === 0)
                  }
                  onClick={() => {
                    setChildSearchColumnFilters({
                      din: [],
                      firstName: [],
                      lastName: [],
                      middleName: [],
                      gender: [],
                      dateOfBirth: [],
                      akaLastName: [],
                      akaFirstName: [],
                      personIdIcm: [],
                      personIdMis: [],
                      caseNumber: [],
                      legacyFileNumber: [],
                      birthPlace: [],
                    })
                    setChildSearchSortConfig(null)
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
              onClick={handleAssociate}
              disabled={
                !selectedSearchContactId ||
                savingAssociation ||
                !selectedRecordId ||
                !isSelectedRecordUnmatched
              }
            >
              Associate
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={handleDissociate}
              disabled={savingAssociation || !selectedRecordId || !isSelectedRecordAssociated}
            >
              Dissociate
            </Button>
          </Box>

          <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600 }} />
                  {CHILD_SEARCH_COLUMNS.map((column) => (
                    <TableCell key={column}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <span
                          onClick={(e) => handleChildSearchSortClick(e, column)}
                          style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600 }}
                        >
                          {CHILD_SEARCH_COLUMN_LABELS[column]}
                        </span>
                        {column !== 'dateOfBirth' && (
                          <IconButton
                            size="small"
                            onClick={(e) => handleChildSearchFilterClick(e, column)}
                            sx={{
                              padding: 0.5,
                              color:
                                childSearchColumnFilters[column].length > 0 ? '#1976d2' : '#666',
                            }}
                          >
                            <FilterListIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {loadingChildSearch ? (
                  <TableRow>
                    <TableCell colSpan={14} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        Searching contacts...
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : filteredSearchedChildren.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        {childSearchTerm.trim().length >= CHILD_SEARCH_MIN_LENGTH
                          ? 'No matching child records found for current filters'
                          : 'Search to list child records'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSearchedChildren.map((child) => (
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
                      <TableCell>{getBirthPlace(child)}</TableCell>
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
        anchorEl={childSearchSortAnchor.element}
        open={Boolean(childSearchSortAnchor.element)}
        onClose={handleChildSearchSortClose}
        PaperProps={{
          sx: {
            width: 200,
          },
        }}
      >
        <MenuItem
          onClick={() => handleChildSearchSort(childSearchSortAnchor.column, 'asc')}
          sx={{ gap: 1.5 }}
        >
          <ArrowUpwardIcon fontSize="small" />
          <Typography variant="body2">Sort Ascending</Typography>
        </MenuItem>
        <MenuItem
          onClick={() => handleChildSearchSort(childSearchSortAnchor.column, 'desc')}
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
        anchorEl={detailsSelectionFilterAnchor}
        open={Boolean(detailsSelectionFilterAnchor)}
        onClose={handleDetailsSelectionFilterClose}
        PaperProps={{
          sx: {
            width: 260,
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Filter by Selected
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Checkbox
              size="small"
              checked={detailsShowSelectedOnly}
              onChange={(e) => setDetailsShowSelectedOnly(e.target.checked)}
              disabled={!selectedRecordId}
            />
            <Typography variant="body2">
              Show selected row only
              {!selectedRecordId ? ' (select a row first)' : ''}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
            <Button
              size="small"
              onClick={() => {
                setDetailsShowSelectedOnly(false)
                handleDetailsSelectionFilterClose()
              }}
              sx={{ textTransform: 'none', fontSize: '0.75rem' }}
            >
              Clear
            </Button>
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

      <Menu
        anchorEl={childSearchFilterAnchor.element}
        open={Boolean(childSearchFilterAnchor.element)}
        onClose={handleChildSearchFilterClose}
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
              Filter by {CHILD_SEARCH_COLUMN_LABELS[childSearchFilterAnchor.column]}
            </Typography>
            <Button
              size="small"
              onClick={() => {
                clearChildSearchColumnFilter(childSearchFilterAnchor.column)
                handleChildSearchFilterClose()
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
            value={childSearchFilterSearchTerm}
            onChange={(e) => setChildSearchFilterSearchTerm(e.target.value)}
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
            {getChildSearchUniqueValues(childSearchFilterAnchor.column)
              .filter((value) =>
                value.toLowerCase().includes(childSearchFilterSearchTerm.toLowerCase()),
              )
              .map((value) => (
                <Box key={value} sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
                  <Checkbox
                    size="small"
                    checked={
                      childSearchColumnFilters[childSearchFilterAnchor.column]?.includes(value) ||
                      false
                    }
                    onChange={() =>
                      handleChildSearchFilterChange(childSearchFilterAnchor.column, value)
                    }
                  />
                  <Typography variant="body2">{value}</Typography>
                </Box>
              ))}
          </Box>
        </Box>
      </Menu>

      <Dialog
        open={reprocessConfirmOpen}
        onClose={() => !reprocessing && setReprocessConfirmOpen(false)}
      >
        <DialogTitle>Confirm Reprocess</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Confirm reprocess for record {selectedRecordId}? This action only applies to the
            selected associated record.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReprocessConfirmOpen(false)} disabled={reprocessing}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmReprocess}
            disabled={!canReprocessSelectedRecord || reprocessing}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
