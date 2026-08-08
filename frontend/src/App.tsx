import { Box, Typography } from '@mui/material'
import DqEligibilityApp from './apps/DqEligibilityApp'
import StandardCsaApp from './apps/StandardCsaApp'
import { useAuth } from './context/AuthContext'

export default function App() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <Typography variant="h6" sx={{ color: '#666' }}>
          Loading...
        </Typography>
      </Box>
    )
  }

  if (user?.userProfile === 'DATA_QUALITY_STEWARD') {
    return <DqEligibilityApp />
  }

  return <StandardCsaApp />
}
