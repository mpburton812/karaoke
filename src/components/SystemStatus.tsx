import { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Grid, 
  Button, 
  CircularProgress,
  Divider,
  Chip,
  Alert
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import { db } from '../db';
import { syncKarafunCatalog } from '../api/karafun';

const SystemStatus = () => {
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [karafunCount, setKarafunCount] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{
    severity: 'success' | 'error';
    message: string;
  } | null>(null);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Check DB Connectivity & Get Metadata
      const [countRes, metaRes] = await Promise.all([
        db.execute("SELECT COUNT(*) as count FROM karafun_catalog"),
        db.execute("SELECT value FROM metadata WHERE key = 'karafun_last_updated'")
      ]);
      setDbConnected(true);
      setKarafunCount(Number(countRes.rows[0].count));
      setLastUpdated(metaRes.rows[0]?.value as string || 'Never');
    } catch (err) {
      console.error("Status check failed:", err);
      setDbConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Use a promise to defer execution and avoid synchronous setState in effect
    Promise.resolve().then(() => checkStatus());
  }, [checkStatus]);

  const handleSyncNow = async () => {
    if (!window.confirm("This will download the entire KaraFun catalog (~5MB) and update your database. Continue?")) return;
    
    setSyncing(true);
    setSyncNotice(null);
    try {
      const result = await syncKarafunCatalog();
      setLastUpdated(result.updatedAt);
      setKarafunCount(result.count);
      setSyncNotice({
        severity: 'success',
        message: `KaraFun catalog synced (${result.count.toLocaleString()} records).`,
      });
    } catch (err) {
      console.error("Sync failed:", err);
      setSyncNotice({
        severity: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'KaraFun catalog sync failed.',
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Paper sx={{ p: 3, mb: 4, bgcolor: 'background.paper', borderRadius: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>System Status</Typography>
        <Button 
          startIcon={<RefreshIcon />} 
          size="small" 
          onClick={checkStatus} 
          disabled={loading || syncing}
        >
          Refresh
        </Button>
      </Box>
      
      <Divider sx={{ mb: 3 }} />

      {syncNotice && (
        <Alert
          severity={syncNotice.severity}
          sx={{ mb: 2 }}
          onClose={() => setSyncNotice(null)}
        >
          {syncNotice.message}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Cloud DB</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
            {dbConnected === null ? <CircularProgress size={20} /> : (
              dbConnected ? <CheckCircleIcon color="success" /> : <ErrorIcon color="error" />
            )}
            <Typography sx={{ ml: 1 }}>{dbConnected ? 'Connected' : 'Offline'}</Typography>
          </Box>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>KaraFun Records</Typography>
          <Typography variant="h6" sx={{ mt: 0.5 }}>
            {karafunCount.toLocaleString()}
            {karafunCount === 0 && <Chip label="Empty" size="small" color="error" sx={{ ml: 1 }} />}
          </Typography>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Last KaraFun Catalog Update</Typography>
          <Typography variant="body1" sx={{ mt: 0.5, fontWeight: 'medium' }}>
            {lastUpdated === 'Never' ? lastUpdated : new Date(lastUpdated!).toLocaleDateString() + ' ' + new Date(lastUpdated!).toLocaleTimeString()}
          </Typography>
        </Grid>
      </Grid>

      <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<CloudDownloadIcon />} 
          onClick={handleSyncNow}
          disabled={syncing}
          fullWidth
          sx={{ maxWidth: 300 }}
        >
          {syncing ? 'Syncing…' : 'Sync KaraFun Catalog'}
        </Button>
        <Typography variant="caption" color="textSecondary" sx={{ mt: 1 }}>
          Automatically fetches the latest library from KaraFun.com
        </Typography>
      </Box>
    </Paper>
  );
};

export default SystemStatus;
