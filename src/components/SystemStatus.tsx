import { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Paper,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import { db } from '../db';
import { fetchAdminHealth, type AdminHealthResponse } from '../api/admin';
import { fetchEnrichmentStatus, type EnrichmentStatus } from '../api/enrichment';
import { syncKarafunCatalog } from '../api/karafun';
import { fetchSpotifyStatus, type SpotifyStatusResponse } from '../api/spotify';

const SystemStatus = () => {
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [karafunCount, setKarafunCount] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [health, setHealth] = useState<AdminHealthResponse | null>(null);
  const [enrichment, setEnrichment] = useState<EnrichmentStatus | null>(null);
  const [spotify, setSpotify] = useState<SpotifyStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [confirmSyncOpen, setConfirmSyncOpen] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{
    severity: 'success' | 'warning' | 'error';
    message: string;
    warnings?: string[];
  } | null>(null);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [countRes, metaRes, adminHealth, enrichmentStatus, spotifyStatus] = await Promise.all([
        db.execute("SELECT COUNT(*) as count FROM karafun_catalog"),
        db.execute("SELECT value FROM metadata WHERE key = 'karafun_last_updated'"),
        fetchAdminHealth(),
        fetchEnrichmentStatus(),
        fetchSpotifyStatus().catch(() => null),
      ]);
      setDbConnected(true);
      setKarafunCount(Number(countRes.rows[0].count));
      setLastUpdated(metaRes.rows[0]?.value as string || 'Never');
      setHealth(adminHealth);
      setEnrichment(enrichmentStatus);
      setSpotify(spotifyStatus);
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
    setConfirmSyncOpen(false);
    setSyncing(true);
    setSyncNotice(null);
    try {
      const result = await syncKarafunCatalog();
      setLastUpdated(result.updatedAt);
      setKarafunCount(result.count);
      setSyncNotice({
        severity: result.warnings.length > 0 ? 'warning' : 'success',
        message: `KaraFun catalog synced (${result.count.toLocaleString()} records via ${result.source}).`,
        warnings: result.warnings,
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

  const statusChip = (
    ok: boolean | null | undefined,
    yes = 'OK',
    no = 'Needs setup'
  ) => (
    <Chip
      size="small"
      color={ok ? 'success' : ok === false ? 'warning' : 'default'}
      label={ok ? yes : ok === false ? no : 'Unknown'}
    />
  );

  return (
    <Paper variant="outlined" sx={{ p: 3, mb: 4, textAlign: 'left' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'primary.main' }}>Admin health</Typography>
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
          {syncNotice.warnings && syncNotice.warnings.length > 0 && (
            <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
              {syncNotice.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </Box>
          )}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Cloud DB</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            {dbConnected === null ? <CircularProgress size={20} /> : (
              dbConnected ? <CheckCircleIcon color="success" /> : <ErrorIcon color="error" />
            )}
            <Typography>{dbConnected ? 'Connected' : 'Offline'}</Typography>
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

        <Grid size={{ xs: 12, sm: 4 }}>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Spotify</Typography>
          <Box sx={{ mt: 0.5 }}>
            {statusChip(Boolean(spotify?.configured), spotify?.linked ? 'Linked' : 'Configured')}
          </Box>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>GetSongBPM</Typography>
          <Box sx={{ mt: 0.5 }}>{statusChip(health?.providers.getSongBpm, 'Configured')}</Box>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Last.fm</Typography>
          <Box sx={{ mt: 0.5 }}>{statusChip(health?.providers.lastFm, 'Configured')}</Box>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Enrichment Queue</Typography>
          <Typography variant="h6" sx={{ mt: 0.5 }}>
            {enrichment ? `${enrichment.pending}/${enrichment.totalSongs}` : '—'}
          </Typography>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Deploy</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, fontFamily: 'monospace' }}>
            {(health?.commit || __COMMIT_HASH__).slice(0, 8)}
            {health?.branch ? ` · ${health.branch}` : ''}
          </Typography>
        </Grid>
      </Grid>

      <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<CloudDownloadIcon />} 
          onClick={() => setConfirmSyncOpen(true)}
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

      <Dialog open={confirmSyncOpen} onClose={() => !syncing && setConfirmSyncOpen(false)}>
        <DialogTitle>Sync KaraFun catalog?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This downloads the latest KaraFun catalog and replaces the local catalog table.
            Existing songs stay in your repertoire.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmSyncOpen(false)} disabled={syncing}>Cancel</Button>
          <Button onClick={handleSyncNow} variant="contained" disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync catalog'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default SystemStatus;
