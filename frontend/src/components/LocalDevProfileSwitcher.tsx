import { FormControl, MenuItem, Select } from '@mui/material'
import {
  getStoredLocalDevProfile,
  isLocalDev,
  LOCAL_DEV_PROFILE_LABELS,
  LOCAL_DEV_PROFILES,
  setStoredLocalDevProfile,
  type LocalDevProfile,
} from '../config/local-dev.config'

export function LocalDevProfileSwitcher() {
  if (!isLocalDev()) {
    return null
  }

  const profile = getStoredLocalDevProfile()

  return (
    <FormControl size="small" sx={{ minWidth: 150 }}>
      <Select
        value={profile}
        aria-label="Local dev profile"
        onChange={(event) => {
          setStoredLocalDevProfile(event.target.value as LocalDevProfile)
          window.location.reload()
        }}
        sx={{
          backgroundColor: '#fff',
          fontSize: '0.875rem',
          '& .MuiSelect-select': { py: 0.75 },
        }}
      >
        {LOCAL_DEV_PROFILES.map((option) => (
          <MenuItem key={option} value={option}>
            {LOCAL_DEV_PROFILE_LABELS[option]}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
