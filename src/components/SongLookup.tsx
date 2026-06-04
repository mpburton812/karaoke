import React, { useState } from 'react';
import { 
  TextField, 
  Button, 
  List, 
  ListItem, 
  ListItemText, 
  ListItemAvatar, 
  ListItemButton,
  Avatar, 
  CircularProgress, 
  Box, 
  Typography, 
  Paper,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import axios from 'axios';
import { db } from '../db';
import { KARAOKE_SONGS_REFRESH_EVENT } from '../lib/karaokeEvents';
import { fetchLyrics } from '../utils/lyricsService';
import { runEnrichmentForImportedSongIds } from '../utils/songEnrichment';

interface iTunesSong {
  trackId: number;
  trackName: string;
  artistName: string;
  artworkUrl100: string;
  collectionName: string;
  releaseDate: string;
  trackExplicitness: string;
  trackTimeMillis: number;
  primaryGenreName: string;
}

interface SongLookupProps {
  currentUser: { id: number; username: string };
  onSongAdded?: () => void;
}

type LookupState = 'idle' | 'loading' | 'success' | 'error';

const SongLookup: React.FC<SongLookupProps> = ({ currentUser, onSongAdded }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<iTunesSong[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSong, setSelectedSong] = useState<iTunesSong | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [lookupStatus, setLookupStatus] = useState({
    lyrics: 'idle' as LookupState,
  });

  const [lyrics, setLyrics] = useState<string | null>(null);

  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });

  const handleClearSearch = () => {
    setQuery('');
    setResults([]);
    setError(null);
  };

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=20`);
      setResults(response.data.results);
    } catch (err) {
      setError('Failed to fetch songs from iTunes.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSong = async (song: iTunesSong) => {
    setSelectedSong(song);
    setLookupStatus({ lyrics: 'loading' });
    setLyrics(null);

    try {
      const lyricsText = await fetchLyrics(song.artistName, song.trackName);
      if (lyricsText) {
        setLyrics(lyricsText);
        setLookupStatus(prev => ({ ...prev, lyrics: 'success' }));
      } else {
        setLookupStatus(prev => ({ ...prev, lyrics: 'error' }));
      }
      
    } catch (err) {
      console.error('Error checking song details:', err);
      setLookupStatus(prev => ({ ...prev, lyrics: 'error' }));
    }
  };

  const handleSave = async () => {
    if (!selectedSong) return;
    setSaving(true);
    try {
      const duplicate = await db.execute({
        sql: `SELECT id, track_name, artist_name FROM songs
              WHERE user_id = ?
                AND (
                  itunes_id = ?
                  OR (
                    lower(trim(track_name)) = lower(trim(?))
                    AND lower(trim(artist_name)) = lower(trim(?))
                  )
                )
              LIMIT 1`,
        args: [
          currentUser.id,
          selectedSong.trackId,
          selectedSong.trackName,
          selectedSong.artistName,
        ],
      });
      const existing = duplicate.rows[0] as
        | { id?: number; track_name?: string; artist_name?: string }
        | undefined;
      if (existing?.id) {
        void runEnrichmentForImportedSongIds(currentUser.id, [existing.id]).catch(
          (e) => console.warn("[song lookup enrichment]", e)
        );
        setSnackbar({
          open: true,
          message: `"${existing.track_name ?? selectedSong.trackName}" is already in your song list. No duplicate was added.`,
          severity: "success",
        });
        if (onSongAdded) onSongAdded();
        setSaving(false);
        return;
      }

      const result = await db.execute({
        sql: `INSERT INTO songs (
          user_id, itunes_id, track_name, artist_name, artwork_url,
          duration_ms, release_date, explicit, album, release_year, lyrics,
          personal_key, vocal_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '0', 'Practicing')
        ON CONFLICT(user_id, itunes_id) DO UPDATE SET
          track_name = excluded.track_name,
          artist_name = excluded.artist_name,
          artwork_url = excluded.artwork_url,
          duration_ms = excluded.duration_ms,
          release_date = excluded.release_date,
          explicit = excluded.explicit,
          album = excluded.album,
          release_year = excluded.release_year,
          lyrics = excluded.lyrics
        RETURNING id`,
        args: [
          currentUser.id,
          selectedSong.trackId,
          selectedSong.trackName,
          selectedSong.artistName,
          selectedSong.artworkUrl100,
          selectedSong.trackTimeMillis,
          selectedSong.releaseDate,
          selectedSong.trackExplicitness === 'explicit' ? 1 : 0,
          selectedSong.collectionName,
          new Date(selectedSong.releaseDate).getFullYear(),
          lyrics,
        ],
      });

      const songId = (result.rows[0] as unknown as { id?: number })?.id;
      if (typeof songId !== "number") {
        setSnackbar({
          open: true,
          message: "That song is already in your song list. No duplicate was added.",
          severity: "success",
        });
        if (onSongAdded) onSongAdded();
        setSaving(false);
        return;
      }

      // Record initial status in history
      const historyCheck = await db.execute({
        sql: "SELECT COUNT(*) as count FROM song_status_history WHERE song_id = ?",
        args: [songId]
      });

      if (Number(historyCheck.rows[0].count) === 0) {
        await db.execute({
          sql: "INSERT INTO song_status_history (song_id, status) VALUES (?, 'Practicing')",
          args: [songId]
        });
      }

      void runEnrichmentForImportedSongIds(currentUser.id, [songId]).catch(
        (e) => console.warn("[song lookup enrichment]", e)
      );

      setSnackbar({
        open: true,
        message: "Song saved. Lyrics lookup continues in the background if needed.",
        severity: "success",
      });

      if (onSongAdded) onSongAdded();
      window.dispatchEvent(new Event(KARAOKE_SONGS_REFRESH_EVENT));
      setTimeout(() => {
        setSelectedSong(null);
        setResults([]);
        setQuery('');
      }, 1000);
    } catch (err) {
      console.error('Error saving song:', err);
      setSnackbar({ open: true, message: 'Failed to save song.', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const StatusIcon = ({ status }: { status: LookupState }) => {
    if (status === 'loading') return <CircularProgress size={16} sx={{ ml: 1 }} />;
    if (status === 'success') return <CheckCircleIcon sx={{ fontSize: 18, ml: 1, color: 'success.main' }} />;
    if (status === 'error') return <CancelIcon sx={{ fontSize: 18, ml: 1, color: 'error.main' }} />;
    return null;
  };

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search for a song..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        />
        <Button
          variant="outlined"
          onClick={handleClearSearch}
          disabled={loading || (!query && results.length === 0)}
        >
          Clear
        </Button>
        <Button 
          variant="contained" 
          startIcon={<SearchIcon />} 
          onClick={handleSearch}
          disabled={loading}
        >
          Search
        </Button>
      </Box>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper elevation={3}>
        <List>
          {results.map((song) => (
            <React.Fragment key={song.trackId}>
              <ListItem disablePadding>
                <ListItemButton 
                  onClick={() => handleSelectSong(song)}
                >
                  <ListItemAvatar>
                    <Avatar variant="rounded" src={song.artworkUrl100} alt={song.trackName} />
                  </ListItemAvatar>
                  <ListItemText 
                    primary={song.trackName} 
                    secondary={`${song.artistName} • ${song.collectionName}`} 
                  />
                </ListItemButton>
              </ListItem>
              <Divider variant="inset" component="li" />
            </React.Fragment>
          ))}
        </List>
      </Paper>

      {/* Detail Dialog */}
      <Dialog open={!!selectedSong} onClose={() => !saving && setSelectedSong(null)} fullWidth maxWidth="xs">
        <DialogTitle>Song details</DialogTitle>
        <DialogContent dividers>
          {selectedSong && (
            <Box sx={{ textAlign: 'center' }}>
              <Avatar 
                variant="rounded" 
                src={selectedSong.artworkUrl100.replace('100x100bb', '400x400bb')} 
                sx={{ width: 160, height: 160, mx: 'auto', mb: 2 }}
              />
              <Typography variant="h6" gutterBottom>{selectedSong.trackName}</Typography>
              <Typography variant="body1" color="textSecondary" gutterBottom>{selectedSong.artistName}</Typography>
              
              <Box sx={{ mt: 3, mb: 2, p: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle2" gutterBottom align="left" color="primary">Data sources</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2">Lyrics database</Typography>
                    <StatusIcon status={lookupStatus.lyrics} />
                  </Box>
                </Box>
              </Box>

              <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
                Album: {selectedSong.collectionName}<br />
                Duration: {Math.floor(selectedSong.trackTimeMillis / 60000)}:{( (selectedSong.trackTimeMillis % 60000) / 1000).toFixed(0).padStart(2, '0')}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedSong(null)} color="inherit" disabled={saving}>Cancel</Button>
          <Button 
            onClick={handleSave} 
            variant="contained" 
            disabled={saving}
          >
            {saving ? <CircularProgress size={24} color="inherit" /> : 'Save Song'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={4000} 
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default SongLookup;
