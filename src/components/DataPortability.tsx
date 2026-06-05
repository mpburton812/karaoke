import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Alert,
  CircularProgress,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import {
  exportUserBackup,
  importUserBackup,
  type UserBackupPayload,
} from '../api/repertoire';

interface DataPortabilityProps {
  currentUser: { id: number; username: string };
  onDataChange?: () => void;
}

const DataPortability: React.FC<DataPortabilityProps> = ({ onDataChange }) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  const exportAll = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const backup = await exportUserBackup();
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().split('T')[0];

      link.setAttribute('href', url);
      link.setAttribute('download', `karaoke-backup_${date}.json`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const counts = backup.data;
      const total =
        counts.songs.length +
        counts.performances.length +
        counts.tags.length +
        counts.locations.length;
      setMessage({
        text: `Backup saved (${total} primary records plus tags, history, and Spotify links).`,
        type: 'success',
      });
    } catch (err) {
      console.error(err);
      setMessage({
        text: err instanceof Error ? err.message : 'Failed to export backup.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const importAll = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      const confirmed = window.confirm(
        'Importing a backup replaces all of your current songs, performances, tags, venues, and related data. This cannot be undone. Continue?'
      );
      if (!confirmed) return;

      setLoading(true);
      setMessage(null);

      try {
        const text = await file.text();
        let backup: UserBackupPayload;
        try {
          backup = JSON.parse(text) as UserBackupPayload;
        } catch {
          setMessage({ text: 'File is not valid JSON.', type: 'error' });
          setLoading(false);
          return;
        }

        const result = await importUserBackup(backup);
        const total = Object.values(result.imported).reduce((a, b) => a + b, 0);
        setMessage({
          text: `Backup restored (${total} rows imported).`,
          type: 'success',
        });
        if (onDataChange) onDataChange();
        window.dispatchEvent(new Event('karaoke-songs-refresh'));
        window.dispatchEvent(new Event('karaoke-shares-refresh'));
      } catch (err) {
        console.error(err);
        setMessage({
          text:
            err instanceof Error
              ? err.message
              : 'Failed to import backup. Use a file exported from this app.',
          type: 'error',
        });
      } finally {
        setLoading(false);
      }
    };
    input.click();
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom align="center">
        Data portability
      </Typography>
      <Typography variant="body2" color="textSecondary" align="center" sx={{ mb: 3 }}>
        Export or import your full repertoire in one JSON file (songs, performances,
        tags, venues, status history, and Spotify playlist links).
      </Typography>

      {message && (
        <Alert severity={message.type} sx={{ mb: 3 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <CircularProgress size={24} />
          <Typography sx={{ ml: 2 }}>Processing...</Typography>
        </Box>
      )}

      <Paper sx={{ p: 3, maxWidth: 420, mx: 'auto' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={() => void exportAll()}
            disabled={loading}
            fullWidth
          >
            Export all my data
          </Button>
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={importAll}
            disabled={loading}
            fullWidth
          >
            Import backup (replaces current data)
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default DataPortability;
