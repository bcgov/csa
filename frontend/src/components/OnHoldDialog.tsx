import ClearIcon from '@mui/icons-material/Clear'
import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  TextField,
} from '@mui/material'
import { useState } from 'react'

// Preset values for On Hold Reason
export const ON_HOLD_REASON_PRESETS = [
  'Pending additional documentation',
  'Awaiting verification',
  'Under investigation',
  'Placement status unclear',
  'Legal status pending',
  'Case under review',
  'Eligibility determination in progress',
  'Other',
] as const

interface OnHoldDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
  mode: 'hold' | 'resume'
  initialReason?: string
}

export function OnHoldDialog({
  open,
  onClose,
  onConfirm,
  mode,
  initialReason = '',
}: OnHoldDialogProps) {
  const [reason, setReason] = useState(initialReason)
  const [error, setError] = useState('')

  // Handle dialog open/close transitions
  const handleDialogEnter = () => {
    setReason(initialReason)
    setError('')
  }

  const handleConfirm = () => {
    if (mode === 'hold' && !reason.trim()) {
      setError("'Reason' cannot be blank when the CSA Status is 'On Hold'.")
      return
    }
    onConfirm(reason.trim())
  }

  const handleClear = () => {
    setReason('')
    setError('')
  }

  const isHoldMode = mode === 'hold'
  const title = isHoldMode ? 'On Hold Reason' : 'Resume - Update Reason (Optional)'
  const description = isHoldMode
    ? 'Please enter a reason for putting the selected contact(s) on hold. This field is required.'
    : 'You may optionally update the reason. Leave blank to keep the existing reason, or enter a new reason to overwrite it.'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="on-hold-dialog-title"
      aria-describedby="on-hold-dialog-description"
      maxWidth="sm"
      fullWidth
      TransitionProps={{
        onEnter: handleDialogEnter,
      }}
    >
      <DialogTitle id="on-hold-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id="on-hold-dialog-description" sx={{ mb: 2 }}>
          {description}
        </DialogContentText>
        <Autocomplete
          freeSolo
          options={[...ON_HOLD_REASON_PRESETS]}
          value={reason}
          onChange={(_, newValue) => {
            setReason(newValue || '')
            setError('')
          }}
          onInputChange={(_, newInputValue) => {
            setReason(newInputValue)
            if (error && newInputValue.trim()) {
              setError('')
            }
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Reason"
              placeholder="Select or type a reason"
              fullWidth
              required={isHoldMode}
              error={!!error}
              helperText={error || `${reason.length}/255 characters`}
              inputProps={{
                ...params.inputProps,
                maxLength: 255,
              }}
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {reason && (
                      <IconButton
                        size="small"
                        onClick={handleClear}
                        sx={{ mr: -1 }}
                        aria-label="Clear reason"
                      >
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    )}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button onClick={handleConfirm} variant="contained" autoFocus>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default OnHoldDialog
