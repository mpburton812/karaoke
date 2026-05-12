import React, { useEffect, useState, useCallback } from 'react';
import { 
  Box, List, ListItem, ListItemText, ListItemAvatar, ListItemButton,
  Avatar, Typography, Paper, Divider, Button, Grid, Chip, IconButton,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Select, MenuItem, FormControl, InputLabel, Card, CardContent,
  Autocomplete
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import NotesIcon from '@mui/icons-material/Notes';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import StarIcon from '@mui/icons-material/Star';
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
}

interface Performance {
  id: number;
  song_id: number;
  date: string;
  location: string;
  notes: string;
}

interface Tag {
  id: number;
  name: string;
  type: 'song' | 'performance';
}

interface Location {
  id: number;
  name: string;
}

interface Setlist {
  id: number;
  name: string;
  description: string;
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
  const [availableSongTags, setAvailableSongTags] = useState<Tag[]>([]);
  const [availablePerfTags, setAvailablePerfTags] = useState<Tag[]>([]);
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
  const [selectedPerfTags, setSelectedPerfTags] = useState<number[]>([]);
  const [savingPerf, setSavingPerf] = useState(false);

  // Setlist State
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [activeSetlist, setActiveSetlist] = useState<number | null>(null);
  const [newSetlistName, setNewSetlistName] = useState('');
  const [isCreatingSetlist, setIsCreatingSetlist] = useState(false);

  // Notes Dialog State
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [activeNotes, setActiveNotes] = useState('');

  // Analytics State
  const [topSongs, setTopSongs] = useState<{track_name: string, count: number}[]>([]);
  const [topVenues, setTopVenues] = useState<{location: string, count: number}[]>([]);

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

  const fetchSetlists = useCallback(async () => {
    try {
      const result = await db.execute({
        sql: "SELECT * FROM setlists WHERE user_id = ? ORDER BY created_at DESC",
        args: [currentUser.id]
      });
      setSetlists(result.rows as unknown as Setlist[]);
    } catch (err) {
      console.error(err);
    }
  }, [currentUser.id]);

  const fetchTagsAndLocations = useCallback(async () => {
    try {
      const tagsRes = await db.execute({
        sql: "SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC",
        args: [currentUser.id]
      });
      const allTags = tagsRes.rows as unknown as Tag[];
      setAvailableSongTags(allTags.filter(t => t.type === 'song'));
      setAvailablePerfTags(allTags.filter(t => t.type === 'performance'));

      const locRes = await db.execute({
        sql: "SELECT * FROM locations WHERE user_id = ? ORDER BY name ASC",
        args: [currentUser.id]
      });
      setLocations(locRes.rows as unknown as Location[]);
    } catch (err) {
      console.error(err);
    }
  }, [currentUser.id]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const songsRes = await db.execute({
        sql: `SELECT s.track_name, COUNT(p.id) as count 
              FROM songs s JOIN performances p ON s.id = p.song_id 
              WHERE s.user_id = ? GROUP BY s.id ORDER BY count DESC LIMIT 5`,
        args: [currentUser.id]
      });
      setTopSongs(songsRes.rows as unknown as {track_name: string, count: number}[]);

      const venuesRes = await db.execute({
        sql: `SELECT location, COUNT(id) as count 
              FROM performances WHERE user_id = ? AND location != '' 
              GROUP BY location ORDER BY count DESC LIMIT 5`,
        args: [currentUser.id]
      });
      setTopVenues(venuesRes.rows as unknown as {location: string, count: number}[]);
    } catch (err) {
      console.error(err);
    }
  }, [currentUser.id]);

  useEffect(() => {
    const loadData = async () => {
      await fetchSongs();
      await fetchSetlists();
      await fetchTagsAndLocations();
      await fetchAnalytics();
    };
    loadData();
  }, [fetchSongs, fetchSetlists, fetchTagsAndLocations, fetchAnalytics]);

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
      fetchPerformances(selectedSong.id);
      fetchSongTags(selectedSong.id);
    }
  }, [selectedSong, fetchPerformances, fetchSongTags]);

  const handleUpdateSongProperty = async (songId: number, field: string, value: string) => {
    try {
      await db.execute({
        sql: `UPDATE songs SET ${field} = ? WHERE id = ?`,
        args: [value, songId]
      });
      setSongs(songs.map(s => s.id === songId ? { ...s, [field]: value } : s));
      if (selectedSong?.id === songId) {
        setSelectedSong({ ...selectedSong, [field]: value });
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

  const handleCreateSetlist = async () => {
    if (!newSetlistName) return;
    try {
      await db.execute({
        sql: "INSERT INTO setlists (user_id, name) VALUES (?, ?)",
        args: [currentUser.id, newSetlistName]
      });
      setNewSetlistName('');
      setIsCreatingSetlist(false);
      fetchSetlists();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddToSetlist = async (songId: number, setlistId: number) => {
    try {
      await db.execute({
        sql: "INSERT OR IGNORE INTO setlist_songs (setlist_id, song_id) VALUES (?, ?)",
        args: [setlistId, songId]
      });
      alert('Added to setlist!');
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
    setSelectedPerfTags([]);
    setPerfDialogOpen(true);
  };

  const handleSavePerformance = async () => {
    if (!selectedSong) return;
    setSavingPerf(true);
    try {
      const result = await db.execute({
        sql: "INSERT INTO performances (song_id, user_id, date, location, notes) VALUES (?, ?, ?, ?, ?) RETURNING id",
        args: [selectedSong.id, currentUser.id, perfDate, perfLocation, perfNotes]
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
      fetchAnalytics();
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
      fetchAnalytics();
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
            <Button variant="contained" color="primary" startIcon={<PlayArrowIcon />} onClick={handleOpenPerfDialog}>PERFORM</Button>
            <Button variant="contained" color="error" startIcon={<DeleteIcon />} onClick={() => handleRemove(selectedSong.id)}>REMOVE FROM LIST</Button>
          </Box>
        </Box>

        <Paper elevation={3} sx={{ p: 4, borderRadius: 4, mb: 4 }}>
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Avatar variant="rounded" src={selectedSong.artwork_url.replace('100x100bb', '400x400bb')} sx={{ width: '100%', height: 'auto', aspectRatio: '1/1', boxShadow: 3 }} />
              
              {selectedSong.lyrics && (
                <Box sx={{ mt: 4 }}>
                  <Typography variant="h6" gutterBottom>Lyrics Sneak Peek</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontStyle: 'italic', color: 'textSecondary' }}>
                    {selectedSong.lyrics.length > 500 ? selectedSong.lyrics.substring(0, 500) + '...' : selectedSong.lyrics}
                  </Typography>
                </Box>
              )}
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
                <Typography variant="subtitle2" gutterBottom>SONG TAGS</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                  {selectedSongTags.map(tag => (
                    <Chip key={tag.id} label={tag.name} onDelete={() => handleRemoveSongTag(tag.id)} color="primary" size="small" />
                  ))}
                </Box>
                <Autocomplete
                  size="small"
                  options={availableSongTags.filter(t => !selectedSongTags.find(st => st.id === t.id))}
                  getOptionLabel={(option) => option.name}
                  renderInput={(params) => <TextField {...params} label="Add Tag" sx={{ maxWidth: 200 }} />}
                  onChange={(_, value) => value && handleAddSongTag(value.id)}
                  value={null}
                />
              </Box>

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Personal Key</InputLabel>
                    <Select value={selectedSong.personal_key || 'Standard'} label="Personal Key" onChange={(e) => handleUpdateSongProperty(selectedSong.id, 'personal_key', e.target.value)}>
                      {['Standard', '-5', '-4', '-3', '-2', '-1', '+1', '+2', '+3', '+4', '+5'].map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Vocal Status</InputLabel>
                    <Select value={selectedSong.vocal_status || 'Practicing'} label="Vocal Status" onChange={(e) => handleUpdateSongProperty(selectedSong.id, 'vocal_status', e.target.value)}>
                      {['Mastered', 'Practicing', 'Project'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth>
                    <Autocomplete
                      options={setlists}
                      getOptionLabel={(option) => option.name}
                      renderInput={(params) => <TextField {...params} label="Add to Setlist" />}
                      onChange={(_, value) => value && handleAddToSetlist(selectedSong.id, value.id)}
                    />
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
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{(quality.value * 100).toFixed(0)}%</Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>

                <Box sx={{ mt: 3 }}>
                  <Typography variant="body2" color="textSecondary">
                    <strong>BPM:</strong> {selectedSong.bpm} | <strong>Key:</strong> {selectedSong.key}<br />
                    <strong>Album:</strong> {selectedSong.album}<br />
                    <strong>Duration:</strong> {Math.floor(selectedSong.duration_ms / 60000)}:{( (selectedSong.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}<br />
                    <strong>Popularity:</strong> {selectedSong.popularity}/100 | <strong>Loudness:</strong> {selectedSong.loudness} dB<br />
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
                    <TableCell align="center">Notes</TableCell>
                    <TableCell align="center">Delete</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {performances.map((perf) => (
                    <TableRow key={perf.id}>
                      <TableCell>{new Date(perf.date).toLocaleDateString()}</TableCell>
                      <TableCell>{perf.location || '-'}</TableCell>
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

              <FormControl fullWidth>
                <Autocomplete
                  multiple
                  options={availablePerfTags}
                  getOptionLabel={(option) => option.name}
                  renderInput={(params) => <TextField {...params} label="Perf Tags" placeholder="Add tags..." />}
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
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      {/* Analytics Section */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography color="textSecondary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><StarIcon color="primary" /> Top Hits</Typography>
              {topSongs.length > 0 ? topSongs.map(s => <Typography key={s.track_name} variant="body2">{s.track_name} ({s.count} times)</Typography>) : <Typography variant="caption">No performances yet.</Typography>}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography color="textSecondary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><SearchIcon color="primary" /> Favorite Venues</Typography>
              {topVenues.length > 0 ? topVenues.map(v => <Typography key={v.location} variant="body2">{v.location} ({v.count} times)</Typography>) : <Typography variant="caption">No venues recorded.</Typography>}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

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
            {['All', 'Mastered', 'Practicing', 'Project'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
      </Paper>

      {/* Setlists Section */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Setlists</Typography>
          <Button startIcon={<AddIcon />} size="small" onClick={() => setIsCreatingSetlist(true)}>New Setlist</Button>
        </Box>
        {isCreatingSetlist && (
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField size="small" placeholder="Setlist Name" value={newSetlistName} onChange={(e) => setNewSetlistName(e.target.value)} />
            <Button variant="contained" onClick={handleCreateSetlist}>Create</Button>
            <Button onClick={() => setIsCreatingSetlist(false)}>Cancel</Button>
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip label="All Songs" onClick={() => setActiveSetlist(null)} color={activeSetlist === null ? "primary" : "default"} />
          {setlists.map(sl => (
            <Chip key={sl.id} label={sl.name} onClick={() => setActiveSetlist(sl.id)} color={activeSetlist === sl.id ? "primary" : "default"} />
          ))}
        </Box>
      </Box>

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
                    <Box>
                      <IconButton edge="end" aria-label="perform" sx={{ color: '#1DB954', mr: 1 }} onClick={(e) => { e.stopPropagation(); handleDirectPerform(song); }}><PlayArrowIcon /></IconButton>
                      <IconButton edge="end" aria-label="delete" color="error" onClick={(e) => { e.stopPropagation(); handleRemove(song.id); }}><DeleteIcon /></IconButton>
                    </Box>
                  }
                >
                  <ListItemButton onClick={() => setSelectedSong(song)}>
                    <ListItemAvatar><Avatar variant="rounded" src={song.artwork_url} /></ListItemAvatar>
                    <ListItemText 
                      primary={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{song.track_name} {song.vocal_status === 'Mastered' && <StarIcon sx={{ color: '#FFD700', fontSize: 16 }} />}</Box>} 
                      secondary={`${song.artist_name} • ${song.personal_key || 'Standard'}`} 
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
