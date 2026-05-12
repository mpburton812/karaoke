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
import axios from 'axios';
import { db } from '../db';

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
}

const SongLookup: React.FC<SongLookupProps> = ({ currentUser }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<iTunesSong[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSong, setSelectedSong] = useState<iTunesSong | null>(null);
  const [checkingKarafun, setCheckingKarafun] = useState(false);
  const [isKarafunAvailable, setIsKarafunAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });

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
    setCheckingKarafun(true);
    setIsKarafunAvailable(null);
    setLyrics(null);
    
    // Clean up title for better matching (remove "(Remastered)", "feat. ...", etc.)
    const cleanTitle = song.trackName.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*-.*$/g, '').trim();
    const cleanArtist = song.artistName.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*-.*$/g, '').trim();

    try {
      // 1. Try checking the local KaraFun catalog table first (Fuzzy Match)
      const result = await db.execute({
        sql: `SELECT id FROM karafun_catalog 
              WHERE (title LIKE ? OR ? LIKE '%' || title || '%') 
              AND (artist LIKE ? OR ? LIKE '%' || artist || '%') 
              LIMIT 1`,
        args: [`%${cleanTitle}%`, cleanTitle, `%${cleanArtist}%`, cleanArtist]
      });

      if (result.rows.length > 0) {
        setIsKarafunAvailable(true);
      } else {
        // 2. Fallback to scraping if not found in local DB (Slow)
        const searchQuery = `${cleanTitle} ${cleanArtist}`;
        const karafunSearchUrl = `https://www.karafun.com/search.html?query=${encodeURIComponent(searchQuery)}`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(karafunSearchUrl)}`;
        
        const response = await axios.get(proxyUrl);
        const html = response.data.contents || '';
        
        // More robust check for results
        const hasSongItems = html.includes('song-list__item') || 
                            html.includes('songList__item') || 
                            html.includes('search-result') ||
                            html.includes('karaoke/');
        
        const hasNoResultsMessage = html.toLowerCase().includes('no results found') || 
                                   html.toLowerCase().includes('no result found');
        
        // If we see song items or DON'T see the "no results" message (and got a real page)
        const isAvailable = hasSongItems || (html.length > 1000 && !hasNoResultsMessage);
        setIsKarafunAvailable(isAvailable);
      }

      // 3. Fetch lyrics (Bonus)
      try {
        const lyricsRes = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(song.artistName)}/${encodeURIComponent(song.trackName)}`);
        if (lyricsRes.data.lyrics) {
          setLyrics(lyricsRes.data.lyrics);
        }
      } catch {
        console.warn('Lyrics not found');
      }
      
    } catch (err) {
      console.error('Error checking song details:', err);
      setIsKarafunAvailable(false);
    } finally {
      setCheckingKarafun(false);
    }
  };

  const [lyrics, setLyrics] = useState<string | null>(null);

  const handleSave = async () => {
    if (!selectedSong) return;
    setSaving(true);
    try {
      await db.execute({
        sql: `INSERT INTO songs (
          user_id, itunes_id, track_name, artist_name, artwork_url, karafun_available,
          key, bpm, duration_ms, popularity, energy, danceability, happiness,
          acousticness, instrumentalness, liveness, speechiness, loudness,
          release_date, explicit, album, genre, release_year, lyrics
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          currentUser.id,
          selectedSong.trackId,
          selectedSong.trackName,
          selectedSong.artistName,
          selectedSong.artworkUrl100,
          isKarafunAvailable ? 1 : 0,
          "C Maj", // Placeholder
          120,      // Placeholder
          selectedSong.trackTimeMillis,
          80,       // Placeholder
          0.7,      // Placeholder
          0.8,      // Placeholder
          0.9,      // Placeholder
          0.1,      // Placeholder
          0.0,      // Placeholder
          0.2,      // Placeholder
          0.05,     // Placeholder
          -5.0,     // Placeholder
          selectedSong.releaseDate,
          selectedSong.trackExplicitness === 'explicit' ? 1 : 0,
          selectedSong.collectionName,
          selectedSong.primaryGenreName,
          new Date(selectedSong.releaseDate).getFullYear(),
          lyrics
        ]
      });
      
      setSnackbar({ open: true, message: 'Song saved successfully!', severity: 'success' });
      setSelectedSong(null);
    } catch (err) {
      console.error('Error saving song:', err);
      setSnackbar({ open: true, message: 'Failed to save song.', severity: 'error' });
    } finally {
      setSaving(false);
    }
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
      <Dialog open={!!selectedSong} onClose={() => setSelectedSong(null)} fullWidth maxWidth="sm">
        <DialogTitle>Song Details</DialogTitle>
        <DialogContent dividers>
          {selectedSong && (
            <Box sx={{ textAlign: 'center' }}>
              <Avatar 
                variant="rounded" 
                src={selectedSong.artworkUrl100.replace('100x100bb', '400x400bb')} 
                sx={{ width: 200, height: 200, mx: 'auto', mb: 2 }}
              />
              <Typography variant="h5" gutterBottom>{selectedSong.trackName}</Typography>
              <Typography variant="h6" color="textSecondary" gutterBottom>{selectedSong.artistName}</Typography>
              
              <Box sx={{ mt: 3, mb: 2 }}>
                {checkingKarafun ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <CircularProgress size={20} />
                    <Typography>Checking Karafun availability...</Typography>
                  </Box>
                ) : (
                  <Alert severity={isKarafunAvailable ? "success" : "warning"}>
                    {isKarafunAvailable 
                      ? "This song is available on Karafun!" 
                      : "This song was not found on Karafun."}
                  </Alert>
                )}
              </Box>

              <Typography variant="body2" color="textSecondary">
                Album: {selectedSong.collectionName}<br />
                Release Date: {new Date(selectedSong.releaseDate).toLocaleDateString()}<br />
                Duration: {Math.floor(selectedSong.trackTimeMillis / 60000)}:{( (selectedSong.trackTimeMillis % 60000) / 1000).toFixed(0).padStart(2, '0')}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedSong(null)} color="inherit">Go Back</Button>
          <Button 
            onClick={handleSave} 
            variant="contained" 
            disabled={saving || checkingKarafun}
          >
            {saving ? <CircularProgress size={24} /> : 'Save Song'}
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
