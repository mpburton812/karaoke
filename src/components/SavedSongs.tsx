import React, { useEffect, useState, useCallback } from 'react';
import { 
  Box, List, ListItem, ListItemText, ListItemAvatar, ListItemButton,
  Avatar, Typography, Paper, Divider, Button, Grid, Chip, IconButton,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Select, MenuItem, FormControl, InputLabel,
  Autocomplete, Rating
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MicIcon from '@mui/icons-material/Mic';
import NotesIcon from '@mui/icons-material/Notes';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import StarIcon from '@mui/icons-material/Star';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import YouTubeIcon from '@mui/icons-material/YouTube';
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
  genre: string;
  release_year: number;
  personal_key: string;
  vocal_status: string;
  lyrics?: string;
  last_practiced?: string;
}

interface Performance {
  id: number;
  song_id: number;
  date: string;
  location: string;
  notes: string;
  rating: number;
}

interface Tag {
  id: number;
  name: string;
}

interface Location {
  id: number;
  name: string;
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
  
  // Tags & Locations state
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedSongTags, setSelectedSongTags] = useState<Tag[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Performance Dialog State
  const [perfDialogOpen, setPerfDialogOpen] = useState(false);
  const [perfDate, setPerfDate] = useState('');
  const [perfLocation, setPerfLocation] = useState('');
  const [perfNotes, setPerfNotes] = useState('');
  const [perfRating, setPerfRating] = useState<number | null>(3);
  const [selectedPerfTags, setSelectedPerfTags] = useState<number[]>([]);
  const [savingPerf, setSavingPerf] = useState(false);

  // Notes Dialog State
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [activeNotes, setActiveNotes] = useState('');

  // Lyrics Dialog State
  const [lyricsDialogOpen, setLyricsDialogOpen] = useState(false);

  const fetchSongs = useCallback(async () => {
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
  }, [currentUser.id]);

  const fetchTagsAndLocations = useCallback(async () => {
    try {
      const tagsRes = await db.execute({
        sql: "SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC",
        args: [currentUser.id]
      });
      setAvailableTags(tagsRes.rows as unknown as Tag[]);

      const locRes = await db.execute({
        sql: "SELECT * FROM locations WHERE user_id = ? ORDER BY name ASC",
        args: [currentUser.id]
      });
      setLocations(locRes.rows as unknown as Location[]);
    } catch (err) {
      console.error(err);
    }
  }, [currentUser.id]);

  useEffect(() => {
    const loadData = async () => {
      await fetchSongs();
      await fetchTagsAndLocations();
    };
    loadData();
  }, [fetchSongs, fetchTagsAndLocations]);

  const fetchSongTags = useCallback(async (songId: number) => {
    try {
      const result = await db.execute({
        sql: `SELECT t.* FROM tags t 
              JOIN song_tags st ON t.id = st.tag_id 
              WHERE st.song_id = ?`,
        args: [songId]
      });
      setSelectedSongTags(result.rows as unknown as Tag[]);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchPerformances = useCallback(async (songId: number) => {
    try {
      const result = await db.execute({
        sql: "SELECT * FROM performances WHERE song_id = ? AND user_id = ? ORDER BY date DESC",
        args: [songId, currentUser.id]
      });
      setPerformances(result.rows as unknown as Performance[]);
    } catch (err) {
      console.error('Error fetching performances:', err);
    }
  }, [currentUser.id]);

  useEffect(() => {
    if (selectedSong) {
      Promise.resolve().then(() => {
        fetchPerformances(selectedSong.id);
        fetchSongTags(selectedSong.id);
      });
    }
  }, [selectedSong, fetchPerformances, fetchSongTags]);

  const handleUpdateSongProperty = async (songId: number, field: string, value: string | null) => {
    try {
      await db.execute({
        sql: `UPDATE songs SET ${field} = ? WHERE id = ?`,
        args: [value, songId]
      });
      setSongs(prevSongs => prevSongs.map(s => s.id === songId ? { ...s, [field]: value } : s));
      if (selectedSong?.id === songId) {
        setSelectedSong({ ...selectedSong, [field]: value as string });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddSongTag = async (tagId: number) => {
    if (!selectedSong) return;
    try {
      await db.execute({
        sql: "INSERT OR IGNORE INTO song_tags (song_id, tag_id) VALUES (?, ?)",
        args: [selectedSong.id, tagId]
      });
      fetchSongTags(selectedSong.id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveSongTag = async (tagId: number) => {
    if (!selectedSong) return;
    try {
      await db.execute({
        sql: "DELETE FROM song_tags WHERE song_id = ? AND tag_id = ?",
        args: [selectedSong.id, tagId]
      });
      fetchSongTags(selectedSong.id);
    } catch (err) {
      console.error(err);
    }
  };

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
    setPerfLocation('');
    setPerfNotes('');
    setPerfRating(3);
    setSelectedPerfTags([]);
    setPerfDialogOpen(true);
  };

  const handleSavePerformance = async () => {
    if (!selectedSong) return;
    setSavingPerf(true);
    try {
      const result = await db.execute({
        sql: "INSERT INTO performances (song_id, user_id, date, location, notes, rating) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
        args: [selectedSong.id, currentUser.id, perfDate, perfLocation, perfNotes, perfRating]
      });
      
      const perfId = (result.rows[0] as unknown as { id: number }).id;
      
      // Save performance tags
      for (const tagId of selectedPerfTags) {
        await db.execute({
          sql: "INSERT INTO performance_tags (performance_id, tag_id) VALUES (?, ?)",
          args: [perfId, tagId]
        });
      }

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

  const handleDirectPerform = (song: Song) => {
    setSelectedSong(song);
    handleOpenPerfDialog();
  };

  const filteredSongs = songs.filter(song => {
    const matchesSearch = song.track_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         song.artist_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGenre = genreFilter === 'All' || song.genre === genreFilter;
    const matchesStatus = statusFilter === 'All' || song.vocal_status === statusFilter;
    return matchesSearch && matchesGenre && matchesStatus;
  });

  const genres = ['All', ...new Set(songs.map(s => s.genre).filter(Boolean))];

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;

  if (selectedSong) {
    return (
      <Box sx={{ mt: 2 }}>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => setSelectedSong(null)}>RETURN TO LIST</Button>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="contained" color="primary" startIcon={<MicIcon />} onClick={handleOpenPerfDialog}>PERFORM</Button>
            <Button variant="contained" color="error" startIcon={<DeleteIcon />} onClick={() => handleRemove(selectedSong.id)}>REMOVE FROM LIST</Button>
          </Box>
        </Box>

        <Paper elevation={3} sx={{ p: 4, borderRadius: 4, mb: 4 }}>
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Avatar variant="rounded" src={selectedSong.artwork_url.replace('100x100bb', '400x400bb')} sx={{ width: '100%', height: 'auto', aspectRatio: '1/1', boxShadow: 3 }} />
              
              <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button 
                  variant="outlined" 
                  color="error" 
                  fullWidth 
                  startIcon={<YouTubeIcon />}
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(selectedSong.track_name + ' ' + selectedSong.artist_name + ' karaoke')}`}
                  target="_blank"
                >
                  PRACTICE ON YOUTUBE
                </Button>
                <Button 
                  variant="outlined" 
                  sx={{ color: '#1DB954', borderColor: '#1DB954' }} 
                  fullWidth 
                  startIcon={<MusicNoteIcon />}
                  href={`https://open.spotify.com/search/${encodeURIComponent(selectedSong.track_name + ' ' + selectedSong.artist_name)}`}
                  target="_blank"
                >
                  LISTEN ON SPOTIFY
                </Button>
                {selectedSong.lyrics && (
                  <Button 
                    variant="outlined" 
                    color="primary" 
                    fullWidth 
                    startIcon={<NotesIcon />}
                    onClick={() => setLyricsDialogOpen(true)}
                  >
                    LYRICS
                  </Button>
                )}
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <Typography variant="h3" gutterBottom sx={{ fontWeight: 'bold' }}>{selectedSong.track_name}</Typography>
              <Typography variant="h4" color="textSecondary" gutterBottom>{selectedSong.artist_name}</Typography>
              
              <Box sx={{ mt: 2, mb: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip label={selectedSong.genre || 'Unknown Genre'} color="secondary" variant="outlined" />
                <Chip label={selectedSong.release_year || 'Unknown Year'} variant="outlined" />
                <Chip label={selectedSong.karafun_available ? "Karafun Available" : "Not on Karafun"} color={selectedSong.karafun_available ? "success" : "default"} variant="outlined" />
                {selectedSong.explicit && <Chip label="Explicit" color="error" size="small" />}
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>SONG TAGS</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                  {selectedSongTags.map(tag => (
                    <Chip key={tag.id} label={tag.name} onDelete={() => handleRemoveSongTag(tag.id)} color="primary" size="small" />
                  ))}
                </Box>
                
                <Box sx={{ mt: 2 }}>
                  <Autocomplete
                    size="small"
                    options={availableTags.filter(t => !selectedSongTags.find(st => st.id === t.id))}
                    getOptionLabel={(option) => option.name}
                    renderInput={(params) => <TextField {...params} label="Search Tags" sx={{ maxWidth: 200 }} />}
                    onChange={(_, value) => value && handleAddSongTag(value.id)}
                    value={null}
                    blurOnSelect
                    clearOnBlur
                  />
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Personal Key</InputLabel>
                    <Select value={selectedSong.personal_key || '0'} label="Personal Key" onChange={(e) => handleUpdateSongProperty(selectedSong.id, 'personal_key', e.target.value)}>
                      {['-3', '-2', '-1', '0', '1', '2', '3'].map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Status</InputLabel>
                    <Select value={selectedSong.vocal_status || 'Practicing'} label="Status" onChange={(e) => handleUpdateSongProperty(selectedSong.id, 'vocal_status', e.target.value)}>
                      {['Mastered', 'Proficient', 'Practicing'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <Box sx={{ mt: 4 }}>
                <Typography variant="h6" gutterBottom>Musical Qualities</Typography>
                <Grid container spacing={1}>
                  {[
                    { label: 'Energy', value: selectedSong.energy },
                    { label: 'Danceability', value: selectedSong.danceability },
                    { label: 'Happiness', value: selectedSong.happiness },
                    { label: 'Acousticness', value: selectedSong.acousticness },
                    { label: 'Instrumentalness', value: selectedSong.instrumentalness },
                    { label: 'Liveness', value: selectedSong.liveness },
                    { label: 'Speechiness', value: selectedSong.speechiness }
                  ].map((quality) => (
                    <Grid size={{ xs: 6, sm: 4, md: 3 }} key={quality.label}>
                      <Box sx={{ textAlign: 'center', p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                        <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>{quality.label}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          {quality.value !== null ? `${(quality.value * 100).toFixed(0)}%` : "DNF"}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>

                <Box sx={{ mt: 3 }}>
                  <Typography variant="body2" color="textSecondary">
                    <strong>BPM:</strong> {selectedSong.bpm || "DNF"} | <strong>Key:</strong> {selectedSong.key || "DNF"}<br />
                    <strong>Album:</strong> {selectedSong.album}<br />
                    <strong>Duration:</strong> {Math.floor(selectedSong.duration_ms / 60000)}:{( (selectedSong.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}<br />
                    <strong>Popularity:</strong> {selectedSong.popularity ? `${selectedSong.popularity}/100` : "DNF"} | <strong>Loudness:</strong> {selectedSong.loudness !== null ? `${selectedSong.loudness} dB` : "DNF"}<br />
                    <strong>Release Date:</strong> {new Date(selectedSong.release_date).toLocaleDateString()}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Paper>

        {performances.length > 0 && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold' }}>Performance History</Typography>
            <TableContainer component={Paper} elevation={3}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell align="center">Performance</TableCell>
                    <TableCell align="center">Notes</TableCell>
                    <TableCell align="center">Delete</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {performances.map((perf) => (
                    <TableRow key={perf.id}>
                      <TableCell>{new Date(perf.date).toLocaleDateString()}</TableCell>
                      <TableCell>{perf.location || '-'}</TableCell>
                      <TableCell align="center">
                        <Rating value={perf.rating || 0} readOnly size="small" />
                      </TableCell>
                      <TableCell align="center">{perf.notes ? <IconButton onClick={() => handleShowNotes(perf.notes)}><NotesIcon /></IconButton> : '-'}</TableCell>
                      <TableCell align="center"><IconButton color="error" onClick={() => handleDeletePerformance(perf.id)}><CloseIcon /></IconButton></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        <Dialog open={perfDialogOpen} onClose={() => !savingPerf && setPerfDialogOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle>Record Performance</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField label="Date" type="date" value={perfDate} onChange={(e) => setPerfDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
              
              <FormControl fullWidth>
                <Autocomplete
                  freeSolo
                  options={locations.map(l => l.name)}
                  renderInput={(params) => <TextField {...params} label="Location" placeholder="e.g. Blue Note, Home" />}
                  value={perfLocation}
                  onChange={(_, value) => setPerfLocation(value || '')}
                  onInputChange={(_, value) => setPerfLocation(value)}
                />
              </FormControl>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, my: 1 }}>
                <Typography component="legend">Performance</Typography>
                <Rating
                  value={perfRating}
                  onChange={(_, newValue) => {
                    setPerfRating(newValue);
                  }}
                />
              </Box>

              <FormControl fullWidth>
                <Autocomplete
                  multiple
                  options={availableTags}
                  getOptionLabel={(option) => option.name}
                  renderInput={(params) => <TextField {...params} label="Tags" placeholder="Add tags..." />}
                  onChange={(_, value) => setSelectedPerfTags(value.map(v => v.id))}
                />
              </FormControl>

              <TextField label="Notes" placeholder="How did it go?" multiline rows={3} value={perfNotes} onChange={(e) => setPerfNotes(e.target.value)} fullWidth />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPerfDialogOpen(false)} disabled={savingPerf}>Cancel</Button>
            <Button onClick={handleSavePerformance} variant="contained" disabled={savingPerf}>{savingPerf ? <CircularProgress size={24} /> : 'Save'}</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={notesDialogOpen} onClose={() => setNotesDialogOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle>Performance Notes</DialogTitle>
          <DialogContent dividers><Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{activeNotes}</Typography></DialogContent>
          <DialogActions><Button onClick={() => setNotesDialogOpen(false)}>Close</Button></DialogActions>
        </Dialog>

        <Dialog open={lyricsDialogOpen} onClose={() => setLyricsDialogOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Lyrics: {selectedSong.track_name}
            <IconButton onClick={() => setLyricsDialogOpen(false)} size="small"><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent dividers>
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', fontStyle: 'italic', textAlign: 'center', py: 2 }}>
              {selectedSong.lyrics}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setLyricsDialogOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      {/* Repertoire Search & Filter */}
      <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField 
          size="small" 
          placeholder="Search repertoire..." 
          value={searchQuery} 
          onChange={(e) => setSearchQuery(e.target.value)} 
          sx={{ flexGrow: 1 }}
          slotProps={{ input: { startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} /> } }}
        />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Genre</InputLabel>
          <Select value={genreFilter} label="Genre" onChange={(e) => setGenreFilter(e.target.value)}>
            {genres.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
            {['All', 'Mastered', 'Proficient', 'Practicing'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
      </Paper>

      {/* Song List */}
      <Typography variant="h5" gutterBottom align="center">Your Repertoire</Typography>
      {filteredSongs.length === 0 ? (
        <Typography align="center" color="textSecondary" sx={{ mt: 4 }}>No songs found matching your criteria.</Typography>
      ) : (
        <Paper elevation={3}>
          <List>
            {filteredSongs.map((song) => (
              <React.Fragment key={song.id}>
                <ListItem 
                  disablePadding
                  secondaryAction={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <IconButton edge="end" aria-label="perform" sx={{ color: '#1DB954', mr: 1 }} onClick={(e) => { e.stopPropagation(); handleDirectPerform(song); }}><MicIcon /></IconButton>
                      <IconButton edge="end" aria-label="delete" color="error" onClick={(e) => { e.stopPropagation(); handleRemove(song.id); }}><DeleteIcon /></IconButton>
                    </Box>
                  }
                >
                  <ListItemButton onClick={() => setSelectedSong(song)} sx={{ pr: 14 }}>
                    <ListItemAvatar><Avatar variant="rounded" src={song.artwork_url} /></ListItemAvatar>
                    <ListItemText 
                      sx={{ 
                        '& .MuiListItemText-primary': { 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap',
                          pr: 2
                        },
                        '& .MuiListItemText-secondary': {
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap',
                          pr: 2
                        }
                      }}
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
                          <Typography variant="body1" noWrap sx={{ fontWeight: 'medium' }}>
                            {song.track_name}
                          </Typography>
                          {song.vocal_status === 'Mastered' && <StarIcon sx={{ color: '#FFD700', fontSize: 16, flexShrink: 0 }} />}
                        </Box>
                      } 
                      secondary={
                        <Typography variant="body2" color="textSecondary" noWrap>
                          {`${song.artist_name} • ${song.personal_key || 'Standard'}`}
                        </Typography>
                      } 
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
