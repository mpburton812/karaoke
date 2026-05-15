import React, { useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';

/** Clear PWA caches/service workers and reload to pick up the latest deployed bundle. */
async function forceAppReload(): Promise<void> {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.unregister()));
  }

  window.location.reload();
}

const AdminAppReload: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleReload = async () => {
    setLoading(true);
    setMessage(null);
    try {
      setMessage('Reloading… fetching latest app code.');
      await forceAppReload();
    } catch (err) {
      console.error(err);
      setMessage('Cache clear failed; performing a standard reload.');
      window.location.reload();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 480, mx: 'auto', mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
        <SystemUpdateAltIcon color="primary" />
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
          App version & reload
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Build <strong>{__COMMIT_HASH__}</strong>
        {typeof __BRANCH_NAME__ !== 'undefined' && __BRANCH_NAME__ !== 'unknown' && (
          <> · branch <strong>{__BRANCH_NAME__}</strong></>
        )}
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        After a new deployment, use force reload to clear cached files and load the newest code.
        You stay logged in unless the reload fails.
      </Typography>

      {message && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}

      <Button
        variant="contained"
        color="primary"
        fullWidth
        size="large"
        startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
        onClick={handleReload}
        disabled={loading}
      >
        FORCE RELOAD APP
      </Button>
    </Paper>
  );
};

export default AdminAppReload;
