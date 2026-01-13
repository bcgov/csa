import FilterListIcon from '@mui/icons-material/FilterList'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import {
  AppBar,
  Box,
  Button,
  Checkbox,
  FormControl,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Select,
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
import { useMemo, useState } from 'react'
import './App.css'
import logo from './icons/image.png'

// Sample data for the eligibility table
const eligibilityData = [
  {
    id: 1,
    childName: 'John Connor',
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
    childName: 'Jane Markus',
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
    childName: 'Merry Markus',
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
    childName: 'Jamie Wilson',
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
    childName: 'Mark S Grey',
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
    childName: 'Jackie Hems',
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
    childName: 'Brian Kevin Jo...',
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

// Sample data for batch requests
const batchRequestsData = [
  {
    id: 1,
    batchId: '1-567',
    batchDate: '',
    status: 'Pending',
    recordCount: 2,
    createdDate: '2025-Nov-18',
    systemComments: 'Placeholder for test',
  },
  {
    id: 2,
    batchId: '1-490',
    batchDate: '2025-Nov-20',
    status: 'In Progress',
    recordCount: 52,
    createdDate: '2025-Nov-14',
    systemComments: 'Placeholder for test',
  },
  {
    id: 3,
    batchId: '1-234',
    batchDate: '2025-Oct-30',
    status: 'CRA Processed',
    recordCount: 78,
    createdDate: '2025-Oct-28',
    systemComments: 'Placeholder for test',
  },
]

// Sample data for batch details - organized by batchId
const batchDetailsData: Record<
  number,
  Array<{
    id: number
    lastName: string
    middleName: string
    givenName: string
    transactionType: string
    status: string
    systemComments: string
  }>
> = {
  1: [
    // Batch 1-567
    {
      id: 1,
      lastName: 'john',
      middleName: 'Kevin',
      givenName: 'Brim',
      transactionType: 'Cancellation',
      status: 'Placeholder for test',
      systemComments: 'Placeholder for test',
    },
    {
      id: 2,
      lastName: 'Oconnor',
      middleName: 'D',
      givenName: 'Jack',
      transactionType: 'Application',
      status: '',
      systemComments: '',
    },
  ],
  2: [
    // Batch 1-490
    {
      id: 3,
      lastName: 'Smith',
      middleName: 'Ann',
      givenName: 'Mary',
      transactionType: 'Application',
      status: 'In Progress',
      systemComments: 'Processing application',
    },
    {
      id: 4,
      lastName: 'Johnson',
      middleName: 'Lee',
      givenName: 'David',
      transactionType: 'Cancellation',
      status: 'In Progress',
      systemComments: 'Pending review',
    },
    {
      id: 5,
      lastName: 'Williams',
      middleName: 'Rose',
      givenName: 'Emily',
      transactionType: 'Application',
      status: 'In Progress',
      systemComments: 'Documents received',
    },
    {
      id: 6,
      lastName: 'Brown',
      middleName: 'James',
      givenName: 'Michael',
      transactionType: 'Modification',
      status: 'In Progress',
      systemComments: 'Awaiting verification',
    },
  ],
  3: [
    // Batch 1-234
    {
      id: 7,
      lastName: 'Davis',
      middleName: 'Marie',
      givenName: 'Sarah',
      transactionType: 'Application',
      status: 'Processed',
      systemComments: 'CRA confirmed',
    },
    {
      id: 8,
      lastName: 'Miller',
      middleName: 'Scott',
      givenName: 'Robert',
      transactionType: 'Cancellation',
      status: 'Processed',
      systemComments: 'CRA confirmed',
    },
    {
      id: 9,
      lastName: 'Wilson',
      middleName: 'Lynn',
      givenName: 'Jennifer',
      transactionType: 'Application',
      status: 'Processed',
      systemComments: 'CRA confirmed',
    },
    {
      id: 10,
      lastName: 'Moore',
      middleName: 'Patrick',
      givenName: 'Christopher',
      transactionType: 'Modification',
      status: 'Processed',
      systemComments: 'CRA confirmed',
    },
    {
      id: 11,
      lastName: 'Taylor',
      middleName: 'Grace',
      givenName: 'Jessica',
      transactionType: 'Application',
      status: 'Processed',
      systemComments: 'CRA confirmed',
    },
  ],
}

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
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    const authToken = localStorage.getItem('authToken')
    return !!authToken
  })
  const [selectedTab, setSelectedTab] = useState(0)
  const [selected, setSelected] = useState<number[]>([])
  const [selectedBatchDetails, setSelectedBatchDetails] = useState<number[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSearchTerm, setFilterSearchTerm] = useState('')
  const [showIdirLogin, setShowIdirLogin] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [selectedChild, setSelectedChild] = useState<number | null>(null)
  const [selectedBatch, setSelectedBatch] = useState<number>(1) // Default to first batch

  // Column filter states
  type FilterAnchor = {
    element: HTMLElement | null
    column: string
  }
  const [filterAnchor, setFilterAnchor] = useState<FilterAnchor>({ element: null, column: '' })
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({
    childName: [],
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

  const handleLoginFlow = () => {
    setIsLoggedIn(true)
  }

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue)
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

  // Get unique values for a column
  const getUniqueValues = (column: keyof (typeof eligibilityData)[0]) => {
    const values = eligibilityData.map((row) => row[column])
    return Array.from(new Set(values)).filter((v) => v !== undefined && v !== '')
  }

  // Apply filters to data
  const filteredData = useMemo(() => {
    return eligibilityData.filter((row) => {
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
  }, [searchTerm, columnFilters])

  // Get batch details for selected batch
  const currentBatchDetails = useMemo(() => {
    return batchDetailsData[selectedBatch] || []
  }, [selectedBatch])

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
        <Toolbar sx={{ padding: '8px 24px', justifyContent: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <img src={logo} alt="BC Logo" style={{ height: '40px' }} />
            <Typography variant="h6" component="div" sx={{ color: '#333', fontWeight: 500 }}>
              Children&apos;s Special Allowance
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      {!isLoggedIn ? (
        <Box
          sx={{
            textAlign: 'center',
            paddingTop: '50px',
            display: 'flex',
            justifyContent: 'center',
            flex: 1,
            alignItems: 'flex-start',
          }}
        >
          {!showIdirLogin ? (
            <Box>
              {/* <h1>Welcome to CSA</h1> */}
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: '20px' }}>
                <Button variant="contained" color="primary" onClick={handleLoginFlow}>
                  LOGIN VIA SSO
                </Button>
                <Button variant="contained" color="primary" onClick={() => setShowIdirLogin(true)}>
                  LOGIN WITH IDIR
                </Button>
              </Box>
            </Box>
          ) : (
            <Box
              sx={{
                width: '400px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                overflow: 'hidden',
                boxShadow: 2,
              }}
            >
              {/* IDIR Login Form Header */}
              <Box
                sx={{
                  backgroundColor: '#3b6ea5',
                  color: 'white',
                  padding: '12px 16px',
                  fontWeight: 500,
                }}
              >
                Log in with IDIR
              </Box>

              {/* Login Form Body */}
              <Box sx={{ padding: '24px' }}>
                <Box sx={{ mb: 3 }}>
                  <Typography sx={{ mb: 1, fontSize: '14px', fontWeight: 500 }}>
                    Username
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Example@bc...."
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    variant="outlined"
                  />
                </Box>

                <Box sx={{ mb: 3 }}>
                  <Typography sx={{ mb: 1, fontSize: '14px', fontWeight: 500 }}>
                    Password
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    type="password"
                    placeholder="************"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    variant="outlined"
                  />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                  <Button
                    variant="outlined"
                    onClick={() => setShowIdirLogin(false)}
                    sx={{ textTransform: 'none' }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleLoginFlow}
                    sx={{
                      textTransform: 'none',
                      backgroundColor: '#3b6ea5',
                      '&:hover': {
                        backgroundColor: '#2d5a8a',
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
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                      <Select defaultValue="pre-defined" displayEmpty>
                        <MenuItem value="pre-defined">Pre-defined</MenuItem>
                        <MenuItem value="custom">Custom</MenuItem>
                      </Select>
                    </FormControl>
                    <Button variant="contained" size="small" sx={{ textTransform: 'none' }}>
                      Add to Batch
                    </Button>
                    <Button variant="outlined" size="small" sx={{ textTransform: 'none' }}>
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
                            Child Name
                            <IconButton
                              size="small"
                              onClick={(e) => handleFilterClick(e, 'childName')}
                              sx={{
                                padding: 0.5,
                                color: columnFilters.childName?.length > 0 ? '#1976d2' : 'inherit',
                              }}
                            >
                              <FilterListIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            Gender
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
                            DOB
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
                            Age
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
                            DIN
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
                            CSA Status
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
                            Status Effective
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
                            Case No.
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
                            Case Status
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
                            Legacy File
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
                            Set on Hold By
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
                            Last Updated
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
                            Last Updated By
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
                          onClick={() => setSelectedChild(row.id)}
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
                          <TableCell>{row.childName}</TableCell>
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
                                  {childData.childName}
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  Birth Name
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {childData.childName}
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
                        <Button
                          variant="contained"
                          size="small"
                          sx={{
                            textTransform: 'none',
                            backgroundColor: '#1976d2',
                            '&:hover': {
                              backgroundColor: '#1565c0',
                            },
                          }}
                        >
                          Remove from Batch
                        </Button>
                      </Box>

                      {/* Batch History Table */}
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                              <TableCell sx={{ fontWeight: 600 }}>Batch ID</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Created Date</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Batch Date</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Transaction Type</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {childBatchHistory.map((row) => (
                              <TableRow
                                key={row.id}
                                hover
                                sx={{ '&:hover': { backgroundColor: '#f9f9f9' } }}
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
                            ))}
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
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <TextField
                      size="small"
                      placeholder="Search"
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
                  </Box>
                </Box>

                {/* Batch Requests Table */}
                <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                        <TableCell>Batch ID</TableCell>
                        <TableCell>Batch Date</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Record Count</TableCell>
                        <TableCell>Created Date</TableCell>
                        <TableCell>System Comments</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {batchRequestsData.map((row) => (
                        <TableRow
                          key={row.id}
                          hover
                          onClick={() => setSelectedBatch(row.id)}
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
                      ))}
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
                        placeholder="Search"
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
                      <Button
                        variant="contained"
                        size="small"
                        sx={{
                          backgroundColor: '#1976d2',
                          '&:hover': { backgroundColor: '#1565c0' },
                        }}
                      >
                        Pre-Defined
                      </Button>
                      <Button
                        variant="contained"
                        size="small"
                        sx={{
                          backgroundColor: '#d32f2f',
                          '&:hover': { backgroundColor: '#c62828' },
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
                                selectedBatchDetails.length < currentBatchDetails.length
                              }
                              checked={
                                currentBatchDetails.length > 0 &&
                                selectedBatchDetails.length === currentBatchDetails.length
                              }
                              onChange={() => {
                                if (selectedBatchDetails.length === currentBatchDetails.length) {
                                  setSelectedBatchDetails([])
                                } else {
                                  setSelectedBatchDetails(currentBatchDetails.map((row) => row.id))
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell>Last Name</TableCell>
                          <TableCell>Middle Name(s)</TableCell>
                          <TableCell>Given Name(s)</TableCell>
                          <TableCell>Transaction Type</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>System Comments</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {currentBatchDetails.map((row) => (
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
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Box>
            )}
          </Box>
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
    </Box>
  )
}

export default App
