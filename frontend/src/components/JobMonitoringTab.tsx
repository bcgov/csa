import AccessTimeIcon from '@mui/icons-material/AccessTime'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
  Box,
  Pagination,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import { useState } from 'react'

interface JobListRow {
  id: number
  jobName: string
  status: 'Success' | 'Running' | 'Failed'
  triggerBy?: string
  started: string
  finished?: string
  summary: string
  warning?: string
}

interface JobHistoryRow {
  id: number
  jobName: string
  status: 'Success' | 'Failed' | 'Running'
  triggerBy?: string
  started: string
  finished?: string
  summary: string
  warning?: string
}

interface ActivityRow {
  id: number
  when: string
  severity: 'Error' | 'Warning'
  type: string
  related: string
  jobId?: number
  craFileName?: string
  fileType?: string
}

const ITEMS_PER_PAGE = 10

// Mock data for Job List
const mockJobListData: JobListRow[] = [
  {
    id: 1,
    jobName: 'Data fetch',
    status: 'Success',
    triggerBy: 'System',
    started: 'Jul 12, 11:00 PM',
    finished: 'Jul 12, 11:04 PM',
    summary: '500 processed · 12 updated · 2 skipped',
  },
  {
    id: 2,
    jobName: 'Eligibility',
    status: 'Running',
    triggerBy: 'User',
    started: 'Jul 13, 12:01 AM',
    summary: 'In progress',
  },
  {
    id: 3,
    jobName: 'Send CRA file',
    status: 'Failed',
    started: 'Jul 11, 08:00 AM',
    finished: 'Jul 11, 08:02 AM',
    summary: '2140 processed · 31 updated · 6 skipped',
    warning: 'Possible stuck run',
  },
  {
    id: 4,
    jobName: 'Weekly response',
    status: 'Success',
    started: 'Jul 11, 09:00 AM',
    finished: 'Jul 11, 09:03 AM',
    summary: '1902 processed · 25 updated · 3 skipped',
  },
  {
    id: 5,
    jobName: 'Auto Batch',
    status: 'Success',
    started: 'Jul 11, 09:00 AM',
    finished: 'Jul 11, 09:03 AM',
    summary: '1903 processed · 25 updated · 3 skipped',
  },
]

// Mock data for Job History
const mockJobHistoryData: JobHistoryRow[] = [
  {
    id: 1,
    jobName: 'Data Fetch',
    status: 'Success',
    started: 'Jul 08, 08:00 AM',
    finished: 'Jul 08, 08:03 AM',
    summary: '2098 processed · 20 updated · 1 skipped',
  },
  {
    id: 2,
    jobName: 'Eligibility',
    status: 'Success',
    started: 'Jul 09, 08:00 AM',
    finished: 'Jul 09, 08:02 AM',
    summary: '2110 processed · 27 updated · 2 skipped',
  },
  {
    id: 3,
    jobName: 'Auto Batch',
    status: 'Failed',
    started: 'Jul 11, 08:00 AM',
    finished: 'Jul 11, 08:02 AM',
    summary: '2140 processed · 31 updated · 6 skipped',
    warning: 'Possible stuck run',
  },
  {
    id: 4,
    jobName: 'Send CRA file',
    status: 'Running',
    started: 'Jul 12, 08:00 AM',
    summary: 'In progress',
  },
  {
    id: 5,
    jobName: 'Data Fetch',
    status: 'Success',
    started: 'Jul 08, 08:00 AM',
    finished: 'Jul 08, 08:03 AM',
    summary: '2098 processed · 20 updated · 1 skipped',
  },
  {
    id: 6,
    jobName: 'Eligibility',
    status: 'Success',
    started: 'Jul 09, 08:00 AM',
    finished: 'Jul 09, 08:02 AM',
    summary: '2110 processed · 27 updated · 2 skipped',
  },
  {
    id: 7,
    jobName: 'Auto Batch',
    status: 'Failed',
    started: 'Jul 11, 08:00 AM',
    finished: 'Jul 11, 08:02 AM',
    summary: '2140 processed · 31 updated · 6 skipped',
    warning: 'Possible stuck run',
  },
  {
    id: 8,
    jobName: 'Send CRA file',
    status: 'Running',
    started: 'Jul 12, 08:00 AM',
    summary: 'In progress',
  },
  {
    id: 9,
    jobName: 'Data Fetch',
    status: 'Success',
    started: 'Jul 08, 08:00 AM',
    finished: 'Jul 08, 08:03 AM',
    summary: '2098 processed · 20 updated · 1 skipped',
  },
  {
    id: 10,
    jobName: 'Eligibility',
    status: 'Success',
    started: 'Jul 09, 08:00 AM',
    finished: 'Jul 09, 08:02 AM',
    summary: '2110 processed · 27 updated · 2 skipped',
  },
]

// Mock data for Activities/Audit Log
const mockActivitiesData: ActivityRow[] = [
  {
    id: 1,
    when: 'Jul 11, 08:01 AM',
    severity: 'Error',
    type: 'CRA',
    related: 'Send CRA file run @ Jul 11 08:00',
    jobId: 5,
    craFileName: 'CSA_Response_20250711_120045.xml',
    fileType: 'Response',
  },
  {
    id: 2,
    when: 'Jul 11, 08:01 AM',
    severity: 'Warning',
    type: 'Data quality',
    related: 'Send CRA file run @ Jul 11 08:00',
    jobId: 3,
    craFileName: 'CSA_Weekly_20250711_090030.xml',
    fileType: 'Weekly file',
  },
  {
    id: 3,
    when: 'Jul 11, 08:02 AM',
    severity: 'Error',
    type: 'Job',
    related: 'Send CRA file run @ Jul 11 08:00',
    craFileName: 'CSA_Response_20250711_150000.xml',
    fileType: 'Response',
  },
  {
    id: 4,
    when: 'Jul 10, 09:15 AM',
    severity: 'Warning',
    type: 'File Processing',
    related: 'Weekly response run @ Jul 10 09:00',
    jobId: 4,
    craFileName: 'CSA_Weekly_20250710_085500.xml',
    fileType: 'Weekly file',
  },
  {
    id: 5,
    when: 'Jul 09, 08:30 AM',
    severity: 'Error',
    type: 'Data quality',
    related: 'Auto Batch run @ Jul 09 08:00',
    jobId: 7,
    craFileName: 'CSA_Auto_Batch_20250709_080000.xml',
    fileType: 'Batch',
  },
  {
    id: 6,
    when: 'Jul 08, 10:45 AM',
    severity: 'Warning',
    type: 'CRA',
    related: 'Data Fetch run @ Jul 08 08:00',
    jobId: 1,
    craFileName: 'CSA_DataFetch_20250708_082000.xml',
    fileType: 'Response',
  },
  {
    id: 7,
    when: 'Jul 12, 01:00 AM',
    severity: 'Error',
    type: 'Job',
    related: 'Eligibility run @ Jul 13 12:00',
    jobId: 2,
    craFileName: 'CSA_Eligibility_20250712_235900.xml',
    fileType: 'Response',
  },
  {
    id: 8,
    when: 'Jul 11, 09:10 AM',
    severity: 'Warning',
    type: 'Data quality',
    related: 'Weekly response run @ Jul 11 09:00',
    jobId: 4,
    craFileName: 'CSA_Weekly_20250711_091000.xml',
    fileType: 'Weekly file',
  },
  {
    id: 9,
    when: 'Jul 07, 02:20 PM',
    severity: 'Error',
    type: 'File Processing',
    related: 'Data Fetch run @ Jul 07 14:00',
    jobId: 1,
    craFileName: 'CSA_DataFetch_20250707_145500.xml',
    fileType: 'Response',
  },
  {
    id: 10,
    when: 'Jul 06, 11:40 AM',
    severity: 'Warning',
    type: 'CRA',
    related: 'Send CRA file run @ Jul 06 11:00',
    jobId: 3,
    craFileName: 'CSA_Response_20250706_110230.xml',
    fileType: 'Response',
  },
]

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'Success':
      return <CheckCircleIcon sx={{ fontSize: '1.2rem', color: '#4caf50' }} />
    case 'Failed':
      return <ErrorOutlineIcon sx={{ fontSize: '1.2rem', color: '#f44336' }} />
    case 'Running':
      return <AccessTimeIcon sx={{ fontSize: '1.2rem', color: '#ff9800' }} />
    default:
      return null
  }
}

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'Error':
      return <ErrorOutlineIcon sx={{ fontSize: '1rem', color: '#f44336' }} />
    case 'Warning':
      return <WarningAmberIcon sx={{ fontSize: '1rem', color: '#ff9800' }} />
    default:
      return null
  }
}

export default function JobMonitoringTab() {
  const [jobHistoryPage, setJobHistoryPage] = useState(1)
  const [activitiesPage, setActivitiesPage] = useState(1)

  // Pagination calculations
  const jobHistoryTotalPages = Math.ceil(mockJobHistoryData.length / ITEMS_PER_PAGE)
  const activitiesTotalPages = Math.ceil(mockActivitiesData.length / ITEMS_PER_PAGE)

  const jobHistoryPaginatedData = mockJobHistoryData.slice(
    (jobHistoryPage - 1) * ITEMS_PER_PAGE,
    jobHistoryPage * ITEMS_PER_PAGE,
  )

  const activitiesPaginatedData = mockActivitiesData.slice(
    (activitiesPage - 1) * ITEMS_PER_PAGE,
    activitiesPage * ITEMS_PER_PAGE,
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Job List Table */}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 500, mb: 2, textAlign: 'left' }}>
          Job List
        </Typography>
        <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Job ID</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Job Name</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Trigger By</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Started</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Finished</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Summary</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Warning</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mockJobListData.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.id}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.jobName}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {getStatusIcon(row.status)}
                      <span>{row.status}</span>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.triggerBy || '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.started}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.finished || '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.summary}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>
                    {row.warning ? (
                      <Tooltip title={row.warning}>
                        <span
                          style={{
                            padding: '2px 8px',
                            backgroundColor: '#fff3cd',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            color: '#856404',
                          }}
                        >
                          {row.warning}
                        </span>
                      </Tooltip>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Job History Table */}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 500, mb: 2, textAlign: 'left' }}>
          Job History
        </Typography>
        <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Job ID</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Job Name</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Trigger By</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Started (PT)</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Finished (PT)</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Summary</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Warning</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {jobHistoryPaginatedData.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.id}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.jobName}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {getStatusIcon(row.status)}
                      <span>{row.status}</span>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.triggerBy || '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.started}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.finished || '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.summary}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>
                    {row.warning ? (
                      <Tooltip title={row.warning}>
                        <span
                          style={{
                            padding: '2px 8px',
                            backgroundColor: '#fff3cd',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            color: '#856404',
                          }}
                        >
                          {row.warning}
                        </span>
                      </Tooltip>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
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
            Showing {jobHistoryPaginatedData.length} of {mockJobHistoryData.length} records
          </Typography>
          {jobHistoryTotalPages > 1 && (
            <Pagination
              count={jobHistoryTotalPages}
              page={jobHistoryPage}
              onChange={(_, page) => setJobHistoryPage(page)}
              color="primary"
              showFirstButton
              showLastButton
            />
          )}
        </Box>
      </Box>

      {/* Activities/Audit Log Table */}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 500, mb: 2, textAlign: 'left' }}>
          Activities
        </Typography>
        <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Header</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>When (PT)</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Severity</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Related</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Job ID</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>CRA File Name</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>File Type</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {activitiesPaginatedData.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.id}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.when}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {getSeverityIcon(row.severity)}
                      <span>{row.severity}</span>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.type}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>
                    <Tooltip title={row.related}>
                      <span>{row.related}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.jobId || '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>
                    {row.craFileName ? (
                      <Tooltip title={row.craFileName}>
                        <span
                          style={{
                            color: '#1976d2',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          {row.craFileName.length > 30
                            ? `${row.craFileName.substring(0, 27)}...`
                            : row.craFileName}
                        </span>
                      </Tooltip>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.875rem' }}>{row.fileType || '—'}</TableCell>
                </TableRow>
              ))}
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
            Showing {activitiesPaginatedData.length} of {mockActivitiesData.length} records
          </Typography>
          {activitiesTotalPages > 1 && (
            <Pagination
              count={activitiesTotalPages}
              page={activitiesPage}
              onChange={(_, page) => setActivitiesPage(page)}
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
