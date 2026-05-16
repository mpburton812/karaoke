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
import SpotifyPlaylistSync from "./SpotifyPlaylistSync";

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

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  useEffect(() => {
    const onOAuthReturn = () => void load();
    window.addEventListener("karaoke-spotify-oauth-return", onOAuthReturn);
    return () =>
      window.removeEventListener("karaoke-spotify-oauth-return", onOAuthReturn);
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
        Connect Spotify to sync playlists into your library. Tokens stay on the
        server.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!status?.configured && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" component="div" gutterBottom>
            Spotify OAuth is not fully configured. Add the missing variables to
            the API <code>.env</code>, then restart <code>npm run dev</code>{" "}
            (see README).
          </Typography>
          <Box component="ul" sx={{ pl: 2, m: 0, typography: "body2" }}>
            {!status?.env.clientId && (
              <li>
                <code>SPOTIFY_CLIENT_ID</code> — from{" "}
                <a
                  href="https://developer.spotify.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Spotify Developer Dashboard
                </a>
              </li>
            )}
            {!status?.env.clientSecret && (
              <li>
                <code>SPOTIFY_CLIENT_SECRET</code> — same app settings
              </li>
            )}
            {!status?.env.redirectUri && (
              <li>
                <code>SPOTIFY_REDIRECT_URI</code> — e.g.{" "}
                <code>
                  http://127.0.0.1:3001/api/spotify/callback
                </code>{" "}
                (must match the Redirect URI in your Spotify app exactly)
              </li>
            )}
            {!status?.env.publicAppUrl && (
              <li>
                <code>PUBLIC_APP_URL</code> — where the React app runs, e.g.{" "}
                <code>http://127.0.0.1:5173</code> (used after Spotify sends you
                back)
              </li>
            )}
          </Box>
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

      {status?.configured && status.linked && <SpotifyPlaylistSync />}
    </Paper>
  );
};

export default SpotifyConnect;
