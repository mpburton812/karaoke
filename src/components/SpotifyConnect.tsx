import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Typography,
} from "@mui/material";
import InsertLinkIcon from "@mui/icons-material/InsertLink";
import LinkOff from "@mui/icons-material/LinkOff";
import {
  disconnectSpotify,
  fetchSpotifyStatus,
  getSpotifyConnectUrl,
  type SpotifyStatusResponse,
} from "../api/spotify";

const SpotifyConnect: React.FC = () => {
  const [status, setStatus] = useState<SpotifyStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchSpotifyStatus();
      setStatus(s);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Failed to load status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConnect = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const url = await getSpotifyConnectUrl();
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed.");
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Disconnect your Spotify account from Karaoke Companion?")) {
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await disconnectSpotify();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3, textAlign: "left" }}>
      <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: "bold" }}>
        SPOTIFY ACCOUNT
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Connect Spotify to read your playlists (playlist sync can use this
        later). Tokens stay on the server.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!status?.configured && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Spotify OAuth is not configured on this server. Add{" "}
          <code>SPOTIFY_CLIENT_ID</code>, <code>SPOTIFY_CLIENT_SECRET</code>,{" "}
          <code>SPOTIFY_REDIRECT_URI</code>, and <code>PUBLIC_APP_URL</code> to
          the API environment (see README).
        </Alert>
      )}

      {status?.configured && status.linked && (
        <Typography variant="body2" sx={{ mb: 2 }}>
          Connected
          {status.displayName ? ` as ${status.displayName}` : ""}
          {status.spotifyUserId ? ` (${status.spotifyUserId})` : ""}.
        </Typography>
      )}

      {status?.configured && !status.linked && (
        <Typography variant="body2" sx={{ mb: 2 }}>
          Not connected. You will be sent to Spotify to approve read access to
          your playlists.
        </Typography>
      )}

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button
          variant="contained"
          startIcon={<InsertLinkIcon />}
          onClick={handleConnect}
          disabled={!status?.configured || actionLoading || status?.linked}
        >
          {actionLoading && !status?.linked ? "Redirecting…" : "Connect Spotify"}
        </Button>
        <Button
          variant="outlined"
          color="warning"
          startIcon={<LinkOff />}
          onClick={handleDisconnect}
          disabled={!status?.linked || actionLoading}
        >
          Disconnect
        </Button>
      </Box>
    </Paper>
  );
};

export default SpotifyConnect;
