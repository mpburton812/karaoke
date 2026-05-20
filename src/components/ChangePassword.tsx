import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
  CircularProgress,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { changePassword, persistSession, type AuthUser } from '../api/auth';

interface ChangePasswordProps {
  onUserUpdated?: (user: AuthUser, token: string) => void;
}

const ChangePassword: React.FC<ChangePasswordProps> = ({ onUserUpdated }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleSubmit = async () => {
    setMessage(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ text: 'All fields are required.', type: 'error' });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ text: 'New password must be at least 8 characters.', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ text: 'New passwords do not match.', type: 'error' });
      return;
    }
    if (newPassword === currentPassword) {
      setMessage({ text: 'New password must be different from the current password.', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const { user, token } = await changePassword(currentPassword, newPassword);
      persistSession(user, token);
      onUserUpdated?.(user, token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ text: 'Password updated successfully.', type: 'success' });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Failed to change password.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 420, mx: 'auto', textAlign: 'left' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, justifyContent: 'center' }}>
        <LockIcon color="primary" />
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
          Change password
        </Typography>
      </Box>

      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          fullWidth
          type="password"
          label="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          disabled={loading}
          autoComplete="current-password"
        />
        <TextField
          fullWidth
          type="password"
          label="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={loading}
          autoComplete="new-password"
          helperText="At least 8 characters"
        />
        <TextField
          fullWidth
          type="password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={loading}
          autoComplete="new-password"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
        />
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
          fullWidth
        >
          {loading ? <CircularProgress size={24} /> : 'Update password'}
        </Button>
      </Box>
    </Paper>
  );
};

export default ChangePassword;
