import { useEffect, useState } from 'react'
import { 
  Button, 
  Tabs, 
  Tab, 
  Box, 
  Typography, 
  AppBar, 
  Toolbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  TextField,
  InputAdornment,
  IconButton,
  Select,
  MenuItem,
  FormControl
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import logo from './icons/image.png'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showIdirLogin, setShowIdirLogin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Sample data for the table
  const eligibilityData = [
    { id: 1, childName: 'John Connor', gender: 'Man/Boy', dob: '2022-Jan-18', age: 4, din: '', csaStatus: 'Eligible', statusEffective: '2025-Jan-12', caseNumber: '1-135', caseStatus: 'Open', legacyFile: 'GA128182', lastUpdated: 'yyy-mmm-dd', lastUpdatedBy: 'SYSTEM' },
    { id: 2, childName: 'Jane Markus', gender: 'Woman/Girl', dob: '2018-May-15', age: 8, din: '12345', csaStatus: 'In Pay', statusEffective: '2024-Aug-05', caseNumber: '1-147', caseStatus: 'Open', legacyFile: 'GA61821', lastUpdated: 'yyy-mmm-dd', lastUpdatedBy: 'User IDIR' },
    { id: 3, childName: 'Merry Markus', gender: 'Woman/Girl', dob: '2018-May-15', age: 8, din: '14566', csaStatus: 'In Pay - Cancel...', statusEffective: '2024-May-11', caseNumber: '1-166', caseStatus: 'Open', legacyFile: 'GA798379', lastUpdated: 'yyy-mmm-dd', lastUpdatedBy: 'SYSTEM' },
    { id: 4, childName: 'Jamie Wilson', gender: 'Non Binary', dob: '2023-Sept-14', age: 2, din: '13131', csaStatus: 'Out of Pay', statusEffective: '2024-Dec-15', caseNumber: '1-139', caseStatus: 'Admin Reopen', legacyFile: 'GA73894', lastUpdated: 'yyy-mmm-dd', lastUpdatedBy: 'SYSTEM' },
    { id: 5, childName: 'Mark S Grey', gender: 'Man/Boy', dob: '2022-Jan-13', age: 4, din: '44112', csaStatus: 'Batch Sent - A...', statusEffective: '2023-Feb-12', caseNumber: '1-118', caseStatus: 'Closed', legacyFile: 'GA686843', lastUpdated: 'yyy-mmm-dd', lastUpdatedBy: 'User IDIR' },
    { id: 6, childName: 'Jackie Hems', gender: 'Woman/Girl', dob: '2012-Nov-25', age: 13, din: '31123', csaStatus: 'On Hold', statusEffective: '2022-Dec-13', caseNumber: '1-118', caseStatus: 'Open', legacyFile: 'GA236816', cgwrks3: 'CGWRKS3', lastUpdated: 'yyy-mmm-dd', lastUpdatedBy: 'SYSTEM' },
    { id: 7, childName: 'Brian Kevin Jo...', gender: 'Unknown', dob: '2012-Nov-25', age: 13, din: '81190', csaStatus: 'In Batch - Canc...', statusEffective: '2025-Oct-31', caseNumber: '1-183', caseStatus: 'Open', legacyFile: 'Placeholder fo...', lastUpdated: 'yyy-mmm-dd', lastUpdatedBy: 'SYSTEM' },
  ];

  // Sample data for batch requests
  const batchRequestsData = [
    { id: 1, batchId: '1-567', batchDate: '', status: 'Pending', recordCount: 2, createdDate: '2025-Nov-18', systemComments: 'Placeholder for test' },
    { id: 2, batchId: '1-490', batchDate: '2025-Nov-20', status: 'In Progress', recordCount: 52, createdDate: '2025-Nov-14', systemComments: 'Placeholder for test' },
    { id: 3, batchId: '1-234', batchDate: '2025-Oct-30', status: 'CRA Processed', recordCount: 78, createdDate: '2025-Oct-28', systemComments: 'Placeholder for test' },
  ];

  useEffect(()=>{
    const authToken = localStorage.getItem('authToken');
    if (authToken) {
      setIsLoggedIn(true);
    } else {
      setIsLoggedIn(false);
    }
  }, [])

  const handleLoginFlow = () => {
    setIsLoggedIn(true)
  }

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue);
  }

  return (
    <Box sx={{ 
      width: '100%', 
      height: '100vh',
      margin: 0, 
      padding: 0,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Toolbar Section - Always visible */}
      <AppBar position="static" sx={{ backgroundColor: '#ffffff', boxShadow: 'none', borderBottom: '1px solid #e0e0e0', flexShrink: 0 }}>
        <Toolbar sx={{ padding: '8px 24px', justifyContent: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <img src={logo} alt="BC Logo" style={{ height: '40px' }} />
            <Typography variant="h6" component="div" sx={{ color: '#333', fontWeight: 500 }}>
              Children's Special Allowance
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

    {!isLoggedIn ? (
      <Box sx={{ 
        textAlign: 'center', 
        paddingTop: '50px', 
        display: 'flex', 
        justifyContent: 'center',
        flex: 1,
        alignItems: 'flex-start'
      }}>
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
          <Box sx={{ 
            width: '400px', 
            border: '1px solid #ccc',
            borderRadius: '4px',
            overflow: 'hidden',
            boxShadow: 2
          }}>
            {/* IDIR Login Form Header */}
            <Box sx={{ 
              backgroundColor: '#3b6ea5', 
              color: 'white', 
              padding: '12px 16px',
              fontWeight: 500
            }}>
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
                      backgroundColor: '#2d5a8a'
                    }
                  }}
                >
                  Continue
                </Button>
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    ):(
      <Box sx={{ 
        width: '100%', 
        flex: 1,
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header Section */}
        <Box sx={{ 
          width: '100%',
          backgroundColor: '#f5f5f5', 
          padding: '6px',
          borderBottom: '1px solid #e0e0e0',
          boxSizing: 'border-box'
        }}>
          {/* <Typography variant="h5" component="h1" sx={{ 
            color: '#333',
            fontWeight: 500,
            textAlign: 'center',
            marginBottom: '24px'
          }}>
            Children's Special Allowance
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
                color: '#666'
              },
              '& .Mui-selected': {
                color: '#1976d2'
              }
            }}
          >
            <Tab label="Eligibility List" />
            <Tab label="Batch Requests" />
          </Tabs>
        </Box>
        
        {/* Content Section */}
        <Box sx={{ 
          padding: '24px 48px',
          backgroundColor: '#ffffff',
          flex: 1,
          overflow: 'auto'
        }}>
          {selectedTab === 0 && (
            <Box>
              {/* Eligibility List Header */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 500 }}>
                  Eligibility List
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <TextField
                    size="small"
                    placeholder="Search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Box component="span" sx={{ fontSize: '18px' }}>🔍</Box>
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
                      <TableCell>Child/Yo...</TableCell>
                      <TableCell>Gender</TableCell>
                      <TableCell>DOB</TableCell>
                      <TableCell>A...</TableCell>
                      <TableCell>DIN</TableCell>
                      <TableCell>CSA Stat...</TableCell>
                      <TableCell>Status Ef...</TableCell>
                      <TableCell>Cas...</TableCell>
                      <TableCell>Case Sta...</TableCell>
                      <TableCell>Legacy F...</TableCell>
                      <TableCell>Set on H...</TableCell>
                      <TableCell>Last Upd...</TableCell>
                      <TableCell>Last Upd...</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {eligibilityData.map((row) => (
                      <TableRow 
                        key={row.id}
                        hover
                        sx={{ '&:hover': { backgroundColor: '#f9f9f9' } }}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={selected.includes(row.id)}
                            onChange={() => {
                              setSelected(prev => 
                                prev.includes(row.id) 
                                  ? prev.filter(id => id !== row.id)
                                  : [...prev, row.id]
                              );
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ color: '#1976d2', cursor: 'pointer' }}>{row.childName}</TableCell>
                        <TableCell>{row.gender}</TableCell>
                        <TableCell>{row.dob}</TableCell>
                        <TableCell>{row.age}</TableCell>
                        <TableCell>{row.din}</TableCell>
                        <TableCell>{row.csaStatus}</TableCell>
                        <TableCell>{row.statusEffective}</TableCell>
                        <TableCell sx={{ color: '#1976d2' }}>{row.caseNumber}</TableCell>
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
            </Box>
          )}
          {selectedTab === 1 && (
            <Box>
              {/* Batch Requests Header */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
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
                          <Box component="span" sx={{ fontSize: '18px' }}>🔍</Box>
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
                        sx={{ '&:hover': { backgroundColor: '#f9f9f9' } }}
                      >
                        <TableCell sx={{ color: '#1976d2', cursor: 'pointer' }}>{row.batchId}</TableCell>
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
            </Box>
          )}
        </Box>
      </Box>
    )}
      
      {/* Footer - Always visible */}
      <Box sx={{ 
        width: '100%',
        backgroundColor: '#f5f5f5',
        borderTop: '1px solid #e0e0e0',
        padding: '16px 24px',
        textAlign: 'center',
        flexShrink: 0
      }}>
        <Typography variant="body2" sx={{ color: '#666', fontSize: '12px' }}>
          © 2025 Government of British Columbia.
        </Typography>
      </Box>
    </Box>
  )
}

export default App
