import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RefreshIcon from '@mui/icons-material/Refresh';
import { fetchAdminHealth, type AdminHealthResponse } from '../api/admin';
import { fetchEnrichmentStatus, type EnrichmentStatus } from '../api/enrichment';
import { fetchSpotifyStatus, type SpotifyStatusResponse } from '../api/spotify';

const SystemStatus = () => {
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [health, setHealth] = useState<AdminHealthResponse | null>(null);
  const [enrichment, setEnrichment] = useState<EnrichmentStatus | null>(null);
  const [spotify, setSpotify] = useState<SpotifyStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const healthUrl = apiBase ? `${apiBase}/api/health` : '/api/health';
      const [, adminHealth, enrichmentStatus, spotifyStatus] = await Promise.all([
        fetch(healthUrl).then((r) => {
          if (!r.ok) throw new Error('health failed');
        }),
        fetchAdminHealth(),
        fetchEnrichmentStatus(),
        fetchSpotifyStatus().catch(() => null),
      ]);
      setDbConnected(true);
      setHealth(adminHealth);
      setEnrichment(enrichmentStatus);
      setSpotify(spotifyStatus);
    } catch (err) {
      console.error('Status check failed:', err);
      setDbConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => checkStatus());
  }, [checkStatus]);

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
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      <Divider sx={{ mb: 3 }} />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Cloud database</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            {dbConnected === null ? <CircularProgress size={20} /> : (
              dbConnected ? <CheckCircleIcon color="success" /> : <ErrorIcon color="error" />
            )}
            <Typography>{dbConnected ? 'Connected' : 'Offline'}</Typography>
          </Box>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Spotify</Typography>
          <Box sx={{ mt: 0.5 }}>
            {statusChip(Boolean(spotify?.configured), spotify?.linked ? 'Linked' : 'Configured')}
          </Box>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Lyrics enrichment</Typography>
          <Box sx={{ mt: 0.5 }}>{statusChip(health?.providers.lyricsEnrichment, 'Active')}</Box>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Enrichment queue</Typography>
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
    </Paper>
  );
};

export default SystemStatus;
