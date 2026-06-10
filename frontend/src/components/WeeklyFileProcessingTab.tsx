import {
  Alert,
  Box,
  Button,
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

const formatDateDisplay = (value: string | null): string => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  const month = parsed.toLocaleString('en-US', { month: 'short' })
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${parsed.getFullYear()}-${month}-${day}`
}

const valueOrBlank = (value: string | null | undefined): string => value ?? ''

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
      <TableContainer component={Paper} sx={{ boxShadow: 1, mb: 4 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600 }}>Weekly File Date</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>CSA Processing Date</TableCell>
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
            ) : weeklyFiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No weekly files found
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              weeklyFiles.map((file) => (
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

      <Typography variant="h6" sx={{ fontWeight: 500, mb: 2, textAlign: 'left' }}>
        Details{selectedFileName ? ` - ${selectedFileName}` : ''}
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button
          variant="contained"
          onClick={handleConfirmReprocess}
          disabled={!selectedFileId || reprocessing}
        >
          Confirm
        </Button>
      </Box>
      <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600 }} />
              <TableCell sx={{ fontWeight: 600 }}>CSA Match Found?</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Transaction Type</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Transaction Source</TableCell>
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
              <TableCell sx={{ fontWeight: 600 }}>CRA Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Completion Date</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Associated Case #</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Associated Person ID ICM</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Matched By</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loadingRecords ? (
              <TableRow>
                <TableCell colSpan={21} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Loading weekly file details...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : !selectedFileId ? (
              <TableRow>
                <TableCell colSpan={21} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Select a weekly file to view details
                  </Typography>
                </TableCell>
              </TableRow>
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={21} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No records found for this weekly file
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => (
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
                  <TableCell>{record.transactionType}</TableCell>
                  <TableCell>{record.transactionSource}</TableCell>
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
                  <TableCell>{record.craStatus}</TableCell>
                  <TableCell>{valueOrBlank(record.completionDate)}</TableCell>
                  <TableCell>{valueOrBlank(record.associatedCaseNumber)}</TableCell>
                  <TableCell>{valueOrBlank(record.associatedPersonIdIcm)}</TableCell>
                  <TableCell>{valueOrBlank(record.matchedBy)}</TableCell>
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
    </Box>
  )
}
