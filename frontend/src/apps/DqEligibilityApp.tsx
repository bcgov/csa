import {
  AppBar,
  Box,
  Button,
  Snackbar,
  Toolbar,
  Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import '../App.css'
import EligibilityListPage from '../components/eligibility/EligibilityListPage'
import { getRuntimeConfig } from '../config/keycloak.config'
import { useAuth } from '../context/AuthContext'
import logo from '../icons/image.png'
import type { AppEnvironment } from '../types/runtime-config'

const getEnvBackgroundColor = (env?: AppEnvironment): string => {
  switch (env) {
    case 'DEV':
      return '#f5e6c8'
    case 'TEST':
      return '#f8e0e6'
    case 'PRE-PROD':
      return '#d4e5f7'
    case 'PROD':
    default:
      return '#ffffff'
  }
}

export default function DqEligibilityApp() {
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

  const [snackbar, setSnackbar] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error' | 'warning' | 'info'
  }>({
    open: false,
    message: '',
    severity: 'success',
  })

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

  const handleLogout = () => {
    logout()
  }

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
          <Box sx={{ flex: 1, overflow: 'auto', p: 0 }}>
            <EligibilityListPage mode="dq" />
          </Box>
        </Box>
      )}

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

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        message={snackbar.message}
      />
    </Box>
  )
}
