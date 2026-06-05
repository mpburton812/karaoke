import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Typography,
} from "@mui/material";
import GroupsIcon from "@mui/icons-material/Groups";
import { startAdminRebuildAllEnrichment } from "../api/enrichment";
import { KARAOKE_SONGS_REFRESH_EVENT } from "../lib/karaokeEvents";
import { panelTitleSx } from "../theme";

const AllUsersSongEnrichment: React.FC = () => {
  const [adminRebuildLoading, setAdminRebuildLoading] = useState(false);
  const [adminRebuildInfo, setAdminRebuildInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3, textAlign: "left" }}>
      <Typography
        variant="subtitle2"
        gutterBottom
        sx={{ ...panelTitleSx, color: "secondary.main" }}
      >
        All users song enrichment
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Re-run enrichment for every song in every user&apos;s library so new
        provider data (for example GetSongBPM and Last.fm) is written to the
        database. Runs one user at a time on the server. Prefer{" "}
        <strong>background</strong> on hosted environments so the request does
        not time out.
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
    </Paper>
  );
};

export default AllUsersSongEnrichment;
