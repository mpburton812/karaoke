import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Autocomplete,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  createSongShare,
  fetchUserDirectory,
  type DirectoryUser,
} from '../api/songShares';

const MAX_LEN = 255;

export type ShareSendStatus = {
  severity: 'success' | 'error';
  message: string;
};

interface SendSongShareDialogProps {
  open: boolean;
  songId: number;
  songTitle: string;
  onClose: () => void;
  onSent?: () => void;
  /** Notifies the parent after send completes (success or failure). */
  onSendStatus?: (status: ShareSendStatus) => void;
}

const SendSongShareDialog: React.FC<SendSongShareDialogProps> = ({
  open,
  songId,
  songTitle,
  onClose,
  onSent,
  onSendStatus,
}) => {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [recipient, setRecipient] = useState<DirectoryUser | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingUsers(true);
    setError(null);
    setSuccessMessage(null);
    setRecipient(null);
    setMessage('');
    void fetchUserDirectory()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load users.'))
      .finally(() => setLoadingUsers(false));
  }, [open]);

  const reportStatus = (status: ShareSendStatus) => {
    onSendStatus?.(status);
    if (status.severity === 'error') {
      setError(status.message);
      setSuccessMessage(null);
    } else {
      setSuccessMessage(status.message);
      setError(null);
    }
  };

  const handleSend = async () => {
    if (!recipient) {
      reportStatus({
        severity: 'error',
        message: 'Select a recipient before sending.',
      });
      return;
    }
    setSending(true);
    setError(null);
    setSuccessMessage(null);
    const recipientName = recipient.username;
    try {
      await createSongShare({
        recipientUserId: recipient.id,
        songId,
        message: message.trim(),
      });
      reportStatus({
        severity: 'success',
        message: `"${songTitle}" was sent to ${recipientName}. They can open it from their inbox or app notifications.`,
      });
      onSent?.();
      window.setTimeout(() => {
        onClose();
      }, 1200);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'The song could not be sent. Please try again.';
      reportStatus({ severity: 'error', message: msg });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={sending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Share song</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          Sending <strong>{songTitle}</strong> to another user&apos;s inbox.
        </Alert>
        {successMessage && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {successMessage}
          </Alert>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loadingUsers ? (
          <CircularProgress size={24} />
        ) : (
          <Autocomplete
            options={users}
            getOptionLabel={(u) => u.username}
            value={recipient}
            onChange={(_e, v) => setRecipient(v)}
            renderInput={(params) => (
              <TextField {...params} label="Recipient" margin="normal" fullWidth />
            )}
            sx={{ mb: 2 }}
          />
        )}
        <TextField
          label="Message (optional)"
          fullWidth
          multiline
          minRows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_LEN))}
          helperText={`${message.length}/${MAX_LEN}`}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={sending}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => void handleSend()}
          disabled={sending || !recipient || Boolean(successMessage)}
        >
          {sending ? <CircularProgress size={22} color="inherit" /> : 'Send'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SendSongShareDialog;
