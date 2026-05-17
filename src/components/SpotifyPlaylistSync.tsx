import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  type SelectChangeEvent,
  TextField,
  Typography,
} from "@mui/material";
import SyncIcon from "@mui/icons-material/Sync";
import {
  deleteImportedSongsFromPlaylist,
  fetchSpotifyPlaylists,
  fetchSyncedSpotifyPlaylists,
  syncSpotifyPlaylist,
  type SpotifyPlaylistItem,
  type SpotifySyncedPlaylist,
} from "../api/spotify";
import { KARAOKE_SONGS_REFRESH_EVENT } from "../lib/karaokeEvents";
import { runEnrichmentForImportedSongIds } from "../utils/songEnrichment";

export { KARAOKE_SONGS_REFRESH_EVENT };

interface SpotifyPlaylistSyncProps {
  currentUser: { id: number; username: string };
}

const SpotifyPlaylistSync: React.FC<SpotifyPlaylistSyncProps> = ({
  currentUser,
}) => {
  const [playlists, setPlaylists] = useState<SpotifyPlaylistItem[]>([]);
  const [synced, setSynced] = useState<SpotifySyncedPlaylist[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [pasteUrl, setPasteUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pl, sy] = await Promise.all([
        fetchSpotifyPlaylists(),
        fetchSyncedSpotifyPlaylists(),
      ]);
      setPlaylists(pl);
      setSynced(sy);
    } catch (err) {
      setPlaylists([]);
      setSynced([]);
      setError(err instanceof Error ? err.message : "Failed to load playlists.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const handleSelectChange = (e: SelectChangeEvent<string>) => {
    setSelectedId(e.target.value);
    setSuccess(null);
  };

  const handleClearImported = async (spotifyPlaylistId: string, label: string) => {
    if (
      !window.confirm(
        `Remove every song in your library that was imported from “${label}”? This cannot be undone.`
      )
    ) {
      return;
    }
    setClearingId(spotifyPlaylistId);
    setError(null);
    try {
      const { deleted } = await deleteImportedSongsFromPlaylist(spotifyPlaylistId);
      setSuccess(`Removed ${deleted} song(s) from “${label}”.`);
      await load();
      window.dispatchEvent(new Event(KARAOKE_SONGS_REFRESH_EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove songs.");
    } finally {
      setClearingId(null);
    }
  };

  const handleSync = async () => {
    const raw = pasteUrl.trim();
    const body =
      raw.length > 0
        ? { playlistUrl: raw }
        : selectedId
          ? { playlistId: selectedId }
          : null;
    if (!body) {
      setError("Choose a playlist from the list or paste a playlist URL.");
      return;
    }
    if ("playlistId" in body && body.playlistId) {
      const chosen = playlists.find((p) => p.id === body.playlistId);
      if (chosen?.canImportTracks === false) {
        setError(
          "That playlist is follow-only on Spotify; pick one you own, collaborate on, or paste a playlist URL you can open in full."
        );
        return;
      }
    }
    setSyncing(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await syncSpotifyPlaylist(body);
      const parts = [
        r.unchanged
          ? "Playlist unchanged on Spotify."
          : `Added ${r.added}, removed ${r.removed}, already had ${r.skipped}.`,
      ];
      setSuccess(`${r.playlistName}: ${parts.join(" ")}`);
      await load();
      window.dispatchEvent(new Event(KARAOKE_SONGS_REFRESH_EVENT));
      if (r.addedSongIds?.length) {
        void runEnrichmentForImportedSongIds(
          currentUser.id,
          r.addedSongIds
        ).catch((e) => console.warn("[spotify enrichment] batch", e));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
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
    <Box sx={{ mt: 2 }}>
      <Divider sx={{ mb: 2 }} />
      <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: "bold" }}>
        PLAYLIST SYNC
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Pull tracks from a Spotify playlist into your library. Removing a track
        from the playlist on Spotify and syncing again removes it here (only
        for rows created from that playlist).
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <InputLabel id="spotify-pl-label">Your playlist</InputLabel>
        <Select
          labelId="spotify-pl-label"
          label="Your playlist"
          value={selectedId}
          onChange={handleSelectChange}
          disabled={playlists.length === 0}
        >
          <MenuItem value="">
            <em>{playlists.length === 0 ? "No playlists loaded" : "Select…"}</em>
          </MenuItem>
          {playlists.map((p) => (
            <MenuItem
              key={p.id}
              value={p.id}
              disabled={p.canImportTracks === false}
            >
              {p.name} ({p.tracksTotal} tracks)
              {p.canImportTracks === false ? " — follow only, cannot import" : ""}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        fullWidth
        size="small"
        label="Or paste playlist URL / id"
        placeholder="https://open.spotify.com/playlist/…"
        value={pasteUrl}
        onChange={(e) => {
          setPasteUrl(e.target.value);
          setSuccess(null);
        }}
        sx={{ mb: 2 }}
        helperText="If this field is filled, it takes priority over the dropdown. Paste only playlists you own or collaborate on—follow-only lists get “Forbidden” from Spotify."
      />

      <Button
        variant="contained"
        startIcon={syncing ? <CircularProgress size={18} color="inherit" /> : <SyncIcon />}
        onClick={() => void handleSync()}
        disabled={syncing}
      >
        {syncing ? "Syncing…" : "Sync now"}
      </Button>

      {synced.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 0.5 }}
          >
            Recently synced
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 0, listStyle: "none", typography: "body2" }}>
            {synced.slice(0, 12).map((s) => {
              const label = s.playlistName ?? s.spotifyPlaylistId;
              const busy = clearingId === s.spotifyPlaylistId;
              return (
                <Box
                  key={s.spotifyPlaylistId}
                  component="li"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    py: 0.5,
                    borderBottom: 1,
                    borderColor: "divider",
                  }}
                >
                  <span>
                    {label}
                    {s.lastSyncedAt ? ` — ${s.lastSyncedAt}` : ""}
                  </span>
                  <Button
                    size="small"
                    color="warning"
                    variant="outlined"
                    disabled={busy}
                    onClick={() =>
                      void handleClearImported(s.spotifyPlaylistId, label)
                    }
                  >
                    {busy ? "Removing…" : "Remove imported songs"}
                  </Button>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default SpotifyPlaylistSync;
