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
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import NotesIcon from '@mui/icons-material/Notes';
import CloseIcon from '@mui/icons-material/Close';
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

interface Performance {
  id: number;
  song_id: number;
  date: string;
  time: string;
  location: string;
  notes: string;
}

interface SavedSongsProps {
  currentUser: { id: number; username: string };
}

const SavedSongs: React.FC<SavedSongsProps> = ({ currentUser }) => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [performances, setPerformances] = useState<Performance[]>([]);
  
  // Performance Dialog State
  const [perfDialogOpen, setPerfDialogOpen] = useState(false);
  const [perfDate, setPerfDate] = useState('');
  const [perfTime, setPerfTime] = useState('');
  const [perfLocation, setPerfLocation] = useState('');
  const [perfNotes, setPerfNotes] = useState('');
  const [savingPerf, setSavingPerf] = useState(false);

  // Notes Dialog State
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [activeNotes, setActiveNotes] = useState('');

  const fetchSongs = async () => {
    setLoading(true);
    try {
      const result = await db.execute({
        sql: "SELECT * FROM songs WHERE user_id = ? ORDER BY id DESC",
        args: [currentUser.id]
      });
      setSongs(result.rows as unknown as Song[]);
    } catch (err) {
      console.error('Error fetching songs:', err);
      setError('Failed to load saved songs.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPerformances = async (songId: number) => {
    try {
      const result = await db.execute({
        sql: "SELECT * FROM performances WHERE song_id = ? AND user_id = ? ORDER BY date DESC, time DESC",
        args: [songId, currentUser.id]
      });
      setPerformances(result.rows as unknown as Performance[]);
    } catch (err) {
      console.error('Error fetching performances:', err);
    }
  };

  useEffect(() => {
    fetchSongs();
  }, []);

  useEffect(() => {
    if (selectedSong) {
      fetchPerformances(selectedSong.id);
    }
  }, [selectedSong]);

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

  const handleOpenPerfDialog = () => {
    const now = new Date();
    setPerfDate(now.toISOString().split('T')[0]);
    setPerfTime(now.toTimeString().split(' ')[0].substring(0, 5));
    setPerfLocation('');
    setPerfNotes('');
    setPerfDialogOpen(true);
  };

  const handleSavePerformance = async () => {
    if (!selectedSong) return;
    setSavingPerf(true);
    try {
      await db.execute({
        sql: "INSERT INTO performances (song_id, user_id, date, time, location, notes) VALUES (?, ?, ?, ?, ?, ?)",
        args: [selectedSong.id, currentUser.id, perfDate, perfTime, perfLocation, perfNotes]
      });
      setPerfDialogOpen(false);
      fetchPerformances(selectedSong.id);
    } catch (err) {
      console.error('Error saving performance:', err);
      alert('Failed to save performance.');
    } finally {
      setSavingPerf(false);
    }
  };

  const handleDeletePerformance = async (perfId: number) => {
    if (!window.confirm('Delete this performance record?')) return;
    try {
      await db.execute({
        sql: "DELETE FROM performances WHERE id = ?",
        args: [perfId]
      });
      setPerformances(performances.filter(p => p.id !== perfId));
    } catch (err) {
      console.error('Error deleting performance:', err);
    }
  };

  const handleShowNotes = (notes: string) => {
    setActiveNotes(notes);
    setNotesDialogOpen(true);
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;

  if (selectedSong) {
    return (
      <Box sx={{ mt: 2 }}>
        {/* Detail Navigation Buttons */}
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={() => setSelectedSong(null)}
          >
            RETURN TO LIST
          </Button>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button 
              variant="contained" 
              color="primary" 
              startIcon={<PlayArrowIcon />} 
              onClick={handleOpenPerfDialog}
            >
              PERFORM
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
        </Box>

        {/* Song Info Section */}
        <Paper elevation={3} sx={{ p: 4, borderRadius: 4, mb: 4 }}>
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

        {/* Performance History Section */}
        {performances.length > 0 && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold' }}>Performance History</Typography>
            <TableContainer component={Paper} elevation={3}>
              <Table aria-label="performance history table">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Time</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell align="center">Notes</TableCell>
                    <TableCell align="center">Delete</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {performances.map((perf) => (
                    <TableRow key={perf.id}>
                      <TableCell>{new Date(perf.date).toLocaleDateString()}</TableCell>
                      <TableCell>{perf.time}</TableCell>
                      <TableCell>{perf.location || '-'}</TableCell>
                      <TableCell align="center">
                        {perf.notes ? (
                          <IconButton onClick={() => handleShowNotes(perf.notes)}>
                            <NotesIcon />
                          </IconButton>
                        ) : '-'}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton color="error" onClick={() => handleDeletePerformance(perf.id)}>
                          <CloseIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Perform Dialog */}
        <Dialog open={perfDialogOpen} onClose={() => !savingPerf && setPerfDialogOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle>Record Performance</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="Date"
                type="date"
                value={perfDate}
                onChange={(e) => setPerfDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
              <TextField
                label="Time"
                type="time"
                value={perfTime}
                onChange={(e) => setPerfTime(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
              <TextField
                label="Location"
                placeholder="e.g. Blue Note, Home"
                value={perfLocation}
                onChange={(e) => setPerfLocation(e.target.value)}
                fullWidth
              />
              <TextField
                label="Notes"
                placeholder="How did it go?"
                multiline
                rows={3}
                value={perfNotes}
                onChange={(e) => setPerfNotes(e.target.value)}
                fullWidth
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPerfDialogOpen(false)} disabled={savingPerf}>Cancel</Button>
            <Button onClick={handleSavePerformance} variant="contained" disabled={savingPerf}>
              {savingPerf ? <CircularProgress size={24} /> : 'Save'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Notes View Dialog */}
        <Dialog open={notesDialogOpen} onClose={() => setNotesDialogOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle>Performance Notes</DialogTitle>
          <DialogContent dividers>
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
              {activeNotes}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNotesDialogOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom align="center">Your Song List</Typography>
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
