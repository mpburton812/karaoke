import React, { useEffect, useState } from 'react';
import { 
  Box, 
  List, 
  ListItem, 
  ListItemText, 
  ListItemAvatar, 
  ListItemButton,
  Avatar, 
  Typography, 
  Paper, 
  Divider, 
  Button, 
  Grid,
  Chip,
  IconButton,
  CircularProgress,
  Alert
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { db } from '../db';

interface Song {
  id: number;
  itunes_id: number;
  track_name: string;
  artist_name: string;
  artwork_url: string;
  karafun_available: boolean;
  key: string;
  bpm: number;
  duration_ms: number;
  popularity: number;
  energy: number;
  danceability: number;
  happiness: number;
  acousticness: number;
  instrumentalness: number;
  liveness: number;
  speechiness: number;
  loudness: number;
  release_date: string;
  explicit: boolean;
  album: string;
}

const SavedSongs = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSongs = async () => {
    setLoading(true);
    try {
      const result = await db.execute("SELECT * FROM songs ORDER BY id DESC");
      setSongs(result.rows as unknown as Song[]);
    } catch (err) {
      console.error('Error fetching songs:', err);
      setError('Failed to load saved songs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSongs();
  }, []);

  const handleRemove = async (id: number) => {
    if (!window.confirm('Are you sure you want to remove this song?')) return;
    try {
      await db.execute({
        sql: "DELETE FROM songs WHERE id = ?",
        args: [id]
      });
      setSongs(songs.filter(s => s.id !== id));
      setSelectedSong(null);
    } catch (err) {
      console.error('Error deleting song:', err);
      alert('Failed to delete song.');
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;

  if (selectedSong) {
    return (
      <Box sx={{ mt: 2 }}>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={() => setSelectedSong(null)}
          >
            RETURN TO LIST
          </Button>
          <Button 
            variant="contained" 
            color="error" 
            startIcon={<DeleteIcon />} 
            onClick={() => handleRemove(selectedSong.id)}
          >
            REMOVE FROM LIST
          </Button>
        </Box>

        <Paper elevation={3} sx={{ p: 4, borderRadius: 4 }}>
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Avatar 
                variant="rounded" 
                src={selectedSong.artwork_url.replace('100x100bb', '400x400bb')} 
                sx={{ width: '100%', height: 'auto', aspectRatio: '1/1', boxShadow: 3 }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <Typography variant="h3" gutterBottom sx={{ fontWeight: 'bold' }}>{selectedSong.track_name}</Typography>
              <Typography variant="h4" color="textSecondary" gutterBottom>{selectedSong.artist_name}</Typography>
              <Typography variant="h6" color="textSecondary" gutterBottom>Album: {selectedSong.album}</Typography>
              
              <Box sx={{ mt: 2, mb: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip 
                  label={selectedSong.karafun_available ? "Karafun Available" : "Not on Karafun"} 
                  color={selectedSong.karafun_available ? "success" : "default"} 
                  variant="outlined"
                />
                {selectedSong.explicit && <Chip label="Explicit" color="error" size="small" />}
                <Chip label={`BPM: ${selectedSong.bpm}`} variant="outlined" />
                <Chip label={`Key: ${selectedSong.key}`} variant="outlined" />
              </Box>

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={2}>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="overline" color="textSecondary">Energy</Typography>
                  <Typography variant="body1">{(selectedSong.energy * 100).toFixed(0)}%</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="overline" color="textSecondary">Danceability</Typography>
                  <Typography variant="body1">{(selectedSong.danceability * 100).toFixed(0)}%</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="overline" color="textSecondary">Happiness</Typography>
                  <Typography variant="body1">{(selectedSong.happiness * 100).toFixed(0)}%</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="overline" color="textSecondary">Acousticness</Typography>
                  <Typography variant="body1">{(selectedSong.acousticness * 100).toFixed(0)}%</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="overline" color="textSecondary">Popularity</Typography>
                  <Typography variant="body1">{selectedSong.popularity}%</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="overline" color="textSecondary">Loudness</Typography>
                  <Typography variant="body1">{selectedSong.loudness} dB</Typography>
                </Grid>
              </Grid>

              <Box sx={{ mt: 4 }}>
                <Typography variant="body2" color="textSecondary">
                  Release Date: {new Date(selectedSong.release_date).toLocaleDateString()}<br />
                  Duration: {Math.floor(selectedSong.duration_ms / 60000)}:{( (selectedSong.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom align="center">Your Saved Songs</Typography>
      {songs.length === 0 ? (
        <Typography align="center" color="textSecondary" sx={{ mt: 4 }}>No songs saved yet. Go to Song Lookup to find some!</Typography>
      ) : (
        <Paper elevation={3}>
          <List>
            {songs.map((song) => (
              <React.Fragment key={song.id}>
                <ListItem 
                  disablePadding
                  secondaryAction={
                    <IconButton edge="end" aria-label="delete" onClick={(e) => { e.stopPropagation(); handleRemove(song.id); }}>
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemButton 
                    onClick={() => setSelectedSong(song)}
                  >
                    <ListItemAvatar>
                      <Avatar variant="rounded" src={song.artwork_url} />
                    </ListItemAvatar>
                    <ListItemText 
                      primary={song.track_name} 
                      secondary={`${song.artist_name} • ${song.album}`} 
                    />
                  </ListItemButton>
                </ListItem>
                <Divider variant="inset" component="li" />
              </React.Fragment>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
};

export default SavedSongs;
