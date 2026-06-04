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
import GroupsIcon from "@mui/icons-material/Groups";
import {
  fetchEnrichmentStatus,
  startAdminRebuildAllEnrichment,
  startEnrichmentRun,
  type EnrichmentStatus,
} from "../api/enrichment";
import { KARAOKE_SONGS_REFRESH_EVENT } from "../lib/karaokeEvents";
import { panelTitleSx } from "../theme";

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
  const [adminRebuildLoading, setAdminRebuildLoading] = useState(false);
  const [adminRebuildInfo, setAdminRebuildInfo] = useState<string | null>(null);

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
  const lastUpdated = status.updatedAt
    ? new Date(status.updatedAt).toLocaleString()
    : "Never";
  const started = status.startedAt
    ? new Date(status.startedAt).toLocaleString()
    : "Not started";
  const completed = status.completedAt
    ? new Date(status.completedAt).toLocaleString()
    : "Not completed";

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3, textAlign: "left" }}>
      <Typography variant="subtitle2" gutterBottom sx={{ ...panelTitleSx, color: "primary.main" }}>
        Song enrichment
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Backend enrichment fetches lyrics for songs that have not finished yet
        (sets enriched_at when complete). Use this to backfill lyrics across your
        library.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {adminRebuildInfo && (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          onClose={() => setAdminRebuildInfo(null)}
        >
          {adminRebuildInfo}
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
        sx={{ mb: 1 }}
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

      <Box
        sx={{
          border: 1,
          borderColor: "divider",
          p: 1,
          mb: 2,
          typography: "caption",
          color: "text.secondary",
        }}
      >
        <Typography variant="caption" component="div">
          Total: {status.totalSongs} | Pending: {status.pending} | Requested:
          {" "}{status.requested} | Processed: {status.processed}
        </Typography>
        <Typography variant="caption" component="div">
          Succeeded: {status.succeeded} | Failed: {status.failed} | Skipped:
          {" "}{status.skipped}
        </Typography>
        <Typography variant="caption" component="div">
          Started: {started}
        </Typography>
        <Typography variant="caption" component="div">
          Updated: {lastUpdated}
        </Typography>
        <Typography variant="caption" component="div">
          Completed: {completed}
        </Typography>
      </Box>

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

      <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: "divider" }}>
        <Typography variant="subtitle2" gutterBottom sx={{ ...panelTitleSx, color: "secondary.main" }}>
          All users
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Re-run enrichment for every song in every user&apos;s library so new
          provider data (for example GetSongBPM and Last.fm) is written to the
          database. Runs one user at a time on the server. Prefer{" "}
          <strong>background</strong> on hosted environments so the request does
          not time out.
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<GroupsIcon />}
            disabled={adminRebuildLoading}
            onClick={async () => {
              setAdminRebuildLoading(true);
              setAdminRebuildInfo(null);
              setError(null);
              try {
                const res = await startAdminRebuildAllEnrichment({ async: true });
                if (res.ok && res.async && res.started) {
                  setAdminRebuildInfo(res.message);
                }
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Failed to start full-library re-enrichment."
                );
              } finally {
                setAdminRebuildLoading(false);
              }
            }}
          >
            {adminRebuildLoading ? "Starting…" : "Re-enrich all users (background)"}
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            disabled={adminRebuildLoading}
            onClick={async () => {
              if (
                !window.confirm(
                  "Run full re-enrichment for every user now? This can take a very long time and may time out behind a proxy. Prefer the background option unless the library is small."
                )
              ) {
                return;
              }
              setAdminRebuildLoading(true);
              setAdminRebuildInfo(null);
              setError(null);
              try {
                const res = await startAdminRebuildAllEnrichment({ async: false });
                if (res.ok && !res.async) {
                  setAdminRebuildInfo(
                    `Done: ${res.usersProcessed} user(s), ${res.totalSongsRequested} song(s) processed (${res.usersInLibrary} user(s) with libraries).`
                  );
                  window.dispatchEvent(new Event(KARAOKE_SONGS_REFRESH_EVENT));
                }
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Failed to run full-library re-enrichment."
                );
              } finally {
                setAdminRebuildLoading(false);
              }
            }}
          >
            Re-enrich all users (wait for completion)
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};

export default EnrichmentAdmin;
