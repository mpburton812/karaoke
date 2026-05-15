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
import { fetchLyrics, cleanText } from '../utils/lyricsService';

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

interface MusicalQualities {
  bpm: number | null;
  key: string;
  energy: number | null;
  danceability: number | null;
  happiness: number | null;
  acousticness: number | null;
  instrumentalness: number | null;
  liveness: number | null;
  speechiness: number | null;
  loudness: number | null;
}

const SongLookup: React.FC<SongLookupProps> = ({ currentUser, onSongAdded }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<iTunesSong[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSong, setSelectedSong] = useState<iTunesSong | null>(null);
  const [isKarafunAvailable, setIsKarafunAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [lookupStatus, setLookupStatus] = useState({
    karafun: 'idle' as LookupState,
    lyrics: 'idle' as LookupState,
    musicbrainz: 'idle' as LookupState,
    acousticbrainz: 'idle' as LookupState
  });

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
    setLookupStatus({
      karafun: 'loading',
      lyrics: 'loading',
      musicbrainz: 'idle',
      acousticbrainz: 'idle'
    });
    setIsKarafunAvailable(null);
    setLyrics(null);
    
    // Clean up title for better matching
    const cleanTitle = cleanText(song.trackName);
    const cleanArtist = cleanText(song.artistName);

    try {
      // 1. KaraFun check
      const result = await db.execute({
        sql: `SELECT id FROM karafun_catalog 
              WHERE (title LIKE ? OR ? LIKE '%' || title || '%') 
              AND (artist LIKE ? OR ? LIKE '%' || artist || '%') 
              LIMIT 1`,
        args: [`%${cleanTitle}%`, cleanTitle, `%${cleanArtist}%`, cleanArtist]
      });

      if (result.rows.length > 0) {
        setIsKarafunAvailable(true);
        setLookupStatus(prev => ({ ...prev, karafun: 'success' }));
      } else {
        const searchQuery = `${cleanTitle} ${cleanArtist}`;
        const karafunSearchUrl = `https://www.karafun.com/search.html?query=${encodeURIComponent(searchQuery)}`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(karafunSearchUrl)}`;
        
        const response = await axios.get(proxyUrl);
        const html = response.data.contents || '';
        const hasSongItems = html.includes('song-list__item') || html.includes('karaoke/');
        const isAvailable = hasSongItems || (html.length > 1000 && !html.toLowerCase().includes('no results found'));
        
        setIsKarafunAvailable(isAvailable);
        setLookupStatus(prev => ({ ...prev, karafun: isAvailable ? 'success' : 'error' }));
      }

      // 2. Lyrics check
      const lyricsText = await fetchLyrics(song.artistName, song.trackName);
      if (lyricsText) {
        setLyrics(lyricsText);
        setLookupStatus(prev => ({ ...prev, lyrics: 'success' }));
      } else {
        setLookupStatus(prev => ({ ...prev, lyrics: 'error' }));
      }
      
    } catch (err) {
      console.error('Error checking song details:', err);
      setIsKarafunAvailable(false);
      setLookupStatus(prev => ({ ...prev, karafun: 'error', lyrics: 'error' }));
    }
  };

  const [lyrics, setLyrics] = useState<string | null>(null);

  const fetchMusicalQualities = async (song: iTunesSong): Promise<MusicalQualities> => {
    let qualities: MusicalQualities = {
      bpm: null, key: "DNF", energy: null, danceability: null, happiness: null,
      acousticness: null, instrumentalness: null, liveness: null, speechiness: null, loudness: null
    };

    try {
      setLookupStatus(prev => ({ ...prev, musicbrainz: 'loading' }));
      const mbSearchUrl = `https://musicbrainz.org/ws/2/recording/?query=recording:${encodeURIComponent(song.trackName)} AND artist:${encodeURIComponent(song.artistName)}&fmt=json`;
      const mbRes = await axios.get(mbSearchUrl);
      const mbid = mbRes.data.recordings?.[0]?.id;

      if (mbid) {
        setLookupStatus(prev => ({ ...prev, musicbrainz: 'success', acousticbrainz: 'loading' }));
        try {
          const abUrl = `https://acousticbrainz.org/api/v1/${mbid}/high-level`;
          const abRes = await axios.get(abUrl);
          const data = abRes.data.highlevel;
          
          if (data) {
            qualities = {
              bpm: null,
              key: data.tonal_atonal?.all?.tonal > 0.5 ? (data.key_edma?.all?.key || "DNF") : "DNF",
              energy: data.mood_acoustic?.all?.acoustic !== undefined ? 1 - data.mood_acoustic.all.acoustic : null, 
              danceability: data.danceability?.all?.danceable || null,
              happiness: data.mood_happy?.all?.happy || null,
              acousticness: data.mood_acoustic?.all?.acoustic || null,
              instrumentalness: data.voice_instrumental?.all?.instrumental || null,
              liveness: null,
              speechiness: data.voice_instrumental?.all?.voice || null,
              loudness: null
            };
            setLookupStatus(prev => ({ ...prev, acousticbrainz: 'success' }));
          } else {
            setLookupStatus(prev => ({ ...prev, acousticbrainz: 'error' }));
          }
        } catch {
          setLookupStatus(prev => ({ ...prev, acousticbrainz: 'error' }));
        }
      } else {
        setLookupStatus(prev => ({ ...prev, musicbrainz: 'error', acousticbrainz: 'error' }));
      }
    } catch {
      setLookupStatus(prev => ({ ...prev, musicbrainz: 'error', acousticbrainz: 'error' }));
    }

    return qualities;
  };

  const handleSave = async () => {
    if (!selectedSong) return;
    setSaving(true);
    try {
      const qualities = await fetchMusicalQualities(selectedSong);

      await db.execute({
        sql: `INSERT INTO songs (
          user_id, itunes_id, track_name, artist_name, artwork_url, karafun_available,
          key, bpm, duration_ms, popularity, energy, danceability, happiness,
          acousticness, instrumentalness, liveness, speechiness, loudness,
          release_date, explicit, album, genre, release_year, lyrics
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, itunes_id) DO UPDATE SET
          track_name = excluded.track_name,
          artist_name = excluded.artist_name,
          artwork_url = excluded.artwork_url,
          karafun_available = excluded.karafun_available,
          key = excluded.key,
          bpm = excluded.bpm,
          duration_ms = excluded.duration_ms,
          energy = excluded.energy,
          danceability = excluded.danceability,
          happiness = excluded.happiness,
          acousticness = excluded.acousticness,
          instrumentalness = excluded.instrumentalness,
          liveness = excluded.liveness,
          speechiness = excluded.speechiness,
          loudness = excluded.loudness,
          release_date = excluded.release_date,
          explicit = excluded.explicit,
          album = excluded.album,
          genre = excluded.genre,
          release_year = excluded.release_year,
          lyrics = excluded.lyrics`,
        args: [
          currentUser.id,
          selectedSong.trackId,
          selectedSong.trackName,
          selectedSong.artistName,
          selectedSong.artworkUrl100,
          isKarafunAvailable ? 1 : 0,
          qualities.key,
          qualities.bpm,
          selectedSong.trackTimeMillis,
          null, 
          qualities.energy,
          qualities.danceability,
          qualities.happiness,
          qualities.acousticness,
          qualities.instrumentalness,
          qualities.liveness,
          qualities.speechiness,
          qualities.loudness,
          selectedSong.releaseDate,
          selectedSong.trackExplicitness === 'explicit' ? 1 : 0,
          selectedSong.collectionName,
          selectedSong.primaryGenreName,
          new Date(selectedSong.releaseDate).getFullYear(),
          lyrics
        ]
      });
      
      setSnackbar({ open: true, message: 'Song saved successfully!', severity: 'success' });
      if (onSongAdded) onSongAdded();
      setTimeout(() => {
        setSelectedSong(null);
        setResults([]);
        setQuery('');
      }, 1000); // Give user a moment to see the success checkmarks
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
        <DialogTitle>Song Details</DialogTitle>
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
              
              <Box sx={{ mt: 3, mb: 2, p: 2, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle2" gutterBottom align="left" color="primary">Data Sources</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {[
                    { key: 'karafun', label: 'KaraFun Catalog' },
                    { key: 'lyrics', label: 'Lyrics Database' },
                    { key: 'musicbrainz', label: 'MusicBrainz (MBID)' },
                    { key: 'acousticbrainz', label: 'AcousticBrainz (Features)' }
                  ].map((source) => (
                    <Box key={source.key} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">{source.label}</Typography>
                      <StatusIcon status={lookupStatus[source.key as keyof typeof lookupStatus]} />
                    </Box>
                  ))}
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
