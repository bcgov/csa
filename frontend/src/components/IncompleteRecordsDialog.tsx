import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

export interface IncompleteRecord {
  id: number
  missingFields: string[]
}

interface IncompleteRecordsDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  incompletRecords: IncompleteRecord[]
  isLoading?: boolean
  variant?: 'manual' | 'autoBatch'
}

export function IncompleteRecordsDialog({
  open,
  onClose,
  onConfirm,
  incompletRecords,
  isLoading = false,
  variant = 'manual',
}: IncompleteRecordsDialogProps) {
  const isAutoBatch = variant === 'autoBatch'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="incomplete-records-dialog-title"
      aria-describedby="incomplete-records-dialog-description"
      maxWidth="md"
      fullWidth
    >
      <DialogTitle
        id="incomplete-records-dialog-title"
        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
      >
        <WarningAmberIcon sx={{ color: 'warning.main' }} />
        {isAutoBatch ? 'Records Placed On Hold' : 'Missing Required CRA Fields'}
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="incomplete-records-dialog-description" sx={{ mb: 2 }}>
          {isAutoBatch ? (
            <>
              The following {incompletRecords.length} record
              {incompletRecords.length !== 1 ? 's were' : ' was'} excluded from the batch and placed
              on hold due to missing required CRA field
              {incompletRecords.length !== 1 ? 's' : ''}:
            </>
          ) : (
            <>
              The following {incompletRecords.length} record
              {incompletRecords.length !== 1 ? 's' : ''} have missing required CRA field
              {incompletRecords.length !== 1 ? 's' : ''} and cannot be added to the batch:
            </>
          )}
        </DialogContentText>
        <TableContainer component={Paper} sx={{ mb: 2, maxHeight: '400px', overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 'bold' }}>Contact ID</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Missing Fields</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {incompletRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{record.id}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {record.missingFields.map((field, idx) => (
                        <Box
                          key={idx}
                          sx={{
                            backgroundColor: '#ffebee',
                            color: '#c62828',
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                            fontSize: '0.85rem',
                          }}
                        >
                          {field}
                        </Box>
                      ))}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ backgroundColor: '#e3f2fd', p: 2, borderRadius: 1, mb: 2 }}>
          <Typography variant="body2" sx={{ color: '#1565c0' }}>
            {isAutoBatch ? (
              <>
                <strong>What happens next:</strong> These records were automatically placed on hold.
                Update the missing data in ICM, wait for the next data fetch, then resume from hold
                and add to batch again.
              </>
            ) : (
              <>
                <strong>What happens next:</strong> If you click OK, these records will be placed on
                hold with the reason &quot;Missing: [field names]&quot; so you can update them
                later. Successfully added records (if any) will remain in the batch.
              </>
            )}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        {!isAutoBatch && (
          <Button onClick={onClose} color="inherit" disabled={isLoading}>
            Cancel
          </Button>
        )}
        <Button
          onClick={isAutoBatch ? onClose : onConfirm}
          variant="contained"
          color={isAutoBatch ? 'primary' : 'warning'}
          disabled={isLoading}
        >
          {isAutoBatch ? 'OK' : 'OK, Put on Hold'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default IncompleteRecordsDialog
