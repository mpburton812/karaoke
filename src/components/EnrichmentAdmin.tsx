import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Paper,
  Typography,
} from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  fetchEnrichmentStatus,
  startEnrichmentRun,
  type EnrichmentStatus,
} from "../api/enrichment";
import { KARAOKE_SONGS_REFRESH_EVENT } from "../lib/karaokeEvents";

const emptyStatus: EnrichmentStatus = {
  running: false,
  requested: 0,
  processed: 0,
  succeeded: 0,
  failed: 0,
  skipped: 0,
  pending: 0,
  totalSongs: 0,
  currentSong: null,
  startedAt: null,
  updatedAt: null,
  completedAt: null,
  message: null,
  errors: [],
};

const EnrichmentAdmin: React.FC = () => {
  const [status, setStatus] = useState<EnrichmentStatus>(emptyStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await fetchEnrichmentStatus());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load enrichment status."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  useEffect(() => {
    if (!status.running) return;
    const id = window.setInterval(async () => {
      try {
        const next = await fetchEnrichmentStatus();
        setStatus(next);
        if (!next.running) {
          window.dispatchEvent(new Event(KARAOKE_SONGS_REFRESH_EVENT));
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to refresh enrichment status."
        );
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [status.running]);

  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await startEnrichmentRun());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start enrichment.");
    } finally {
      setLoading(false);
    }
  };

  const enriched = Math.max(0, status.totalSongs - status.pending);
  const progress = status.running
    ? status.requested > 0
      ? Math.round((status.processed / status.requested) * 100)
      : 0
    : status.totalSongs > 0
      ? Math.round((enriched / status.totalSongs) * 100)
      : 100;
  const detailText =
    status.currentSong ??
    (status.running
      ? status.message
      : status.pending > 0
        ? `${enriched} enriched, ${status.pending} remaining.`
        : status.message) ??
    "Idle";

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3, textAlign: "left" }}>
      <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: "bold" }}>
        SONG ENRICHMENT
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Backend enrichment checks Karaoke availability, lyrics, MusicBrainz, and
        AcousticBrainz. Use this to scan every song that has not finished
        enrichment yet.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Typography variant="body2" sx={{ mb: 1 }}>
        {status.running
          ? `Processing ${status.processed} of ${status.requested}`
          : `${status.pending} of ${status.totalSongs} song(s) need enrichment`}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{ mb: 1, borderRadius: 1 }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        {detailText}
        {status.failed > 0 ? ` (${status.failed} failed)` : ""}
      </Typography>

      {status.errors.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {status.errors.slice(0, 3).join(" | ")}
        </Alert>
      )}

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button
          variant="contained"
          startIcon={<AutoFixHighIcon />}
          onClick={start}
          disabled={loading || status.running || status.pending === 0}
        >
          {status.running ? "Enriching..." : "Auto-check all songs"}
        </Button>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={load}
          disabled={loading}
        >
          Refresh status
        </Button>
      </Box>
    </Paper>
  );
};

export default EnrichmentAdmin;
