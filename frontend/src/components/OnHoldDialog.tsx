import ClearIcon from '@mui/icons-material/Clear'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
  TextField,
} from '@mui/material'
import { useState } from 'react'

interface OnHoldDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
  mode: 'hold' | 'resume' | 'edit'
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
    // Both hold and edit modes require a reason
    if ((mode === 'hold' || mode === 'edit') && !reason.trim()) {
      setError("'Reason' cannot be blank when the CSA Status is 'On Hold'.")
      return
    }
    onConfirm(reason.trim())
  }

  const handleClear = () => {
    setReason('')
    setError('')
  }

  const isReasonRequired = mode === 'hold' || mode === 'edit'

  // Set title and description based on mode
  let title: string
  let description: string

  if (mode === 'hold') {
    title = 'On Hold Reason'
    description =
      'Please enter a reason for putting the selected contact(s) on hold. This field is required.'
  } else if (mode === 'edit') {
    title = 'Edit On Hold Reason'
    description =
      'Update the reason for holding this contact. This field is required while the contact is On Hold.'
  } else {
    title = 'Resume - Update Reason (Optional)'
    description =
      'You may optionally update the reason. Leave blank to keep the existing reason, or enter a new reason to overwrite it.'
  }

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
        <TextField
          label="Reason"
          placeholder="Enter a reason"
          fullWidth
          multiline
          minRows={3}
          maxRows={6}
          required={isReasonRequired}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value)
            if (error && e.target.value.trim()) {
              setError('')
            }
          }}
          error={!!error}
          helperText={error || `${reason.length}/255 characters`}
          inputProps={{
            maxLength: 255,
          }}
          InputProps={{
            endAdornment: reason ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleClear} aria-label="Clear reason">
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
          autoFocus
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
