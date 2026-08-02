import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  Box, List, ListItem, ListItemText, ListItemAvatar, ListItemButton,
  Avatar, Typography, Paper, Divider, Button, ButtonGroup, Grid, Chip, IconButton,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Select, MenuItem, FormControl, InputLabel, Checkbox, Accordion,
  AccordionSummary, AccordionDetails,
  Autocomplete, Rating, SvgIcon, Tooltip, Snackbar
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EmailIcon from '@mui/icons-material/Email';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MicIcon from '@mui/icons-material/Mic';
import NotesIcon from '@mui/icons-material/Notes';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import StarIcon from '@mui/icons-material/Star';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import YouTubeIcon from '@mui/icons-material/YouTube';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SongLookup from './SongLookup';
import SendSongShareDialog, { type ShareSendStatus } from './SendSongShareDialog';
import EmptyState from './EmptyState';
import {
  fetchSongs as loadSongs,
  fetchSong,
  fetchTagsAndLocations as loadTagsAndLocations,
  fetchSongTags as loadSongTags,
  fetchPerformances as loadPerformances,
  patchSong,
  addSongTag,
  createTag,
  removeSongTag,
  deleteSong,
  fetchPerformanceTagIds,
  createPerformance,
  updatePerformance,
  deletePerformance,
} from '../api/repertoire';
import { fetchLyrics } from '../utils/lyricsService';
import {
  KARAOKE_SHARES_REFRESH_EVENT,
  KARAOKE_SONGS_REFRESH_EVENT,
} from '../lib/karaokeEvents';
import { karaokeTokens, spotifySx } from '../theme';
import {
  buildLetterCounts,
  filterRepertoireSongs,
  letterKeysWithCounts,
  sortSongsByTrackName,
} from '../utils/repertoireSort';

interface SavedSongsProps {
  currentUser: { id: number; username: string };
  /** When set (e.g. from Tags explorer), load this song and show detail view. */
  songIdToOpen?: number | null;
  onSongIdOpenConsumed?: () => void;
}

interface Song {
  id: number;
  itunes_id: number | null;
  spotify_track_id?: string | null;
  spotify_sync_playlist_id?: string | null;
  /** Joined from spotify_synced_playlists when present */
  spotify_source_playlist_name?: string | null;
  track_name: string;
  artist_name: string;
  artwork_url: string;
  duration_ms: number;
  popularity: number | null;
  release_date: string;
  explicit: boolean;
  album: string;
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

function SpotifyGlyphIcon() {
  return (
    <SvgIcon viewBox="0 0 24 24" fontSize="small" sx={{ color: "success.main" }}>
      <path
        fill="currentColor"
        d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.18.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
      />
    </SvgIcon>
  );
}

const SavedSongs: React.FC<SavedSongsProps> = ({
  currentUser,
  songIdToOpen = null,
  onSongIdOpenConsumed,
}) => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  /** After creating a performance dated D, next Record dialog defaults to D+1. */
  const [lastEnteredPerfDate, setLastEnteredPerfDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [performances, setPerformances] = useState<Performance[]>([]);
  
  // Tags & Locations state
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedSongTags, setSelectedSongTags] = useState<Tag[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [letterFilter, setLetterFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');
  const [pendingDeleteSong, setPendingDeleteSong] = useState<Song | null>(null);
  const [songTagsCommaInput, setSongTagsCommaInput] = useState('');
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareSendStatus, setShareSendStatus] = useState<ShareSendStatus | null>(null);

  // Performance Dialog State
  const [perfDialogOpen, setPerfDialogOpen] = useState(false);
  const [editingPerfId, setEditingPerfId] = useState<number | null>(null);
  const [perfDate, setPerfDate] = useState('');
  const [perfLocation, setPerfLocation] = useState('');
  const [perfNotes, setPerfNotes] = useState('');
  const [perfRating, setPerfRating] = useState<number | null>(3);
  const [selectedPerfTags, setSelectedPerfTags] = useState<number[]>([]);
  const [savingPerf, setSavingPerf] = useState(false);
  const [perfHistoryLoading, setPerfHistoryLoading] = useState(false);

  // Notes Dialog State
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [activeNotes, setActiveNotes] = useState('');

  // Lyrics Dialog State
  const [lyricsDialogOpen, setLyricsDialogOpen] = useState(false);
  const [loadingLyrics, setLoadingLyrics] = useState(false);

  const fetchSongs = useCallback(async (skipLoading?: boolean) => {
    if (!skipLoading) setLoading(true);
    try {
      const rows = await loadSongs();
      setSongs(rows as unknown as Song[]);
    } catch (err) {
      console.error('Error fetching songs:', err);
      setError('Failed to load saved songs.');
    } finally {
      if (!skipLoading) setLoading(false);
    }
  }, []);

  const fetchTagsAndLocations = useCallback(async () => {
    try {
      const { tags, locations } = await loadTagsAndLocations();
      setAvailableTags(tags as unknown as Tag[]);
      setLocations(locations as unknown as Location[]);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([fetchSongs(true), fetchTagsAndLocations()]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [fetchSongs, fetchTagsAndLocations]);

  useEffect(() => {
    const onRefresh = () => {
      void fetchSongs();
    };
    window.addEventListener(KARAOKE_SONGS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(KARAOKE_SONGS_REFRESH_EVENT, onRefresh);
  }, [fetchSongs]);

  useEffect(() => {
    if (songIdToOpen == null || songIdToOpen <= 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const row = await fetchSong(songIdToOpen);
        if (cancelled) return;
        if (row) {
          const song = row as unknown as Song;
          setSelectedSong(song);
          setSongs((prev) => {
            if (prev.some((s) => s.id === song.id)) return prev;
            return [song, ...prev];
          });
        }
      } catch (err) {
        console.error("Error opening song from explorer:", err);
      } finally {
        if (!cancelled) onSongIdOpenConsumed?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [songIdToOpen, onSongIdOpenConsumed]);

  const fetchSongTags = useCallback(async (songId: number) => {
    try {
      const tags = await loadSongTags(songId);
      setSelectedSongTags(tags as unknown as Tag[]);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchPerformances = useCallback(async (songId: number) => {
    try {
      const rows = await loadPerformances(songId);
      setPerformances(rows as unknown as Performance[]);
    } catch (err) {
      console.error('Error fetching performances:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedSong) {
      Promise.resolve().then(() => {
        fetchPerformances(selectedSong.id);
        fetchSongTags(selectedSong.id);
      });
    }
  }, [selectedSong, fetchPerformances, fetchSongTags]);

  const ALLOWED_SONG_FIELDS = ['personal_key', 'vocal_status', 'lyrics'] as const;

  const handleUpdateSongProperty = async (songId: number, field: string, value: string | null) => {
    if (!ALLOWED_SONG_FIELDS.includes(field as typeof ALLOWED_SONG_FIELDS[number])) {
      console.error('Blocked update for disallowed field:', field);
      return;
    }
    try {
      if (field === 'personal_key') {
        await patchSong(songId, { personal_key: value ?? '0' });
      } else if (field === 'vocal_status') {
        await patchSong(songId, { vocal_status: value ?? 'Considering' });
      } else if (field === 'lyrics') {
        await patchSong(songId, { lyrics: value ?? undefined });
      }

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
      await addSongTag(selectedSong.id, tagId);
      await fetchSongTags(selectedSong.id);
      window.dispatchEvent(new Event(KARAOKE_SONGS_REFRESH_EVENT));
    } catch (err) {
      console.error('Error in handleAddSongTag:', err);
      alert('Failed to add tag. Check console for details.');
    }
  };

  const resolveTagIdByName = async (name: string): Promise<number | null> => {
    const existing = availableTags.find(
      (t) => t.name.localeCompare(name, undefined, { sensitivity: 'base' }) === 0
    );
    if (existing) return existing.id;
    try {
      await createTag(name);
      const refreshed = await loadTagsAndLocations();
      const tags = (refreshed.tags ?? []) as { id: number; name: string }[];
      setAvailableTags(tags);
      const created = tags.find(
        (t) => t.name.localeCompare(name, undefined, { sensitivity: 'base' }) === 0
      );
      return created?.id ?? null;
    } catch {
      return null;
    }
  };

  const handleAddSongTagsFromInput = async (raw: string) => {
    if (!selectedSong || !raw.trim()) return;
    const names = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    const attached = new Set(selectedSongTags.map((t) => t.id));
    for (const name of names) {
      const tagId = await resolveTagIdByName(name);
      if (tagId && !attached.has(tagId)) {
        await handleAddSongTag(tagId);
        attached.add(tagId);
      }
    }
  };

  const handleRemoveSongTag = async (tagId: number) => {
    if (!selectedSong) return;
    try {
      await removeSongTag(selectedSong.id, tagId);
      await fetchSongTags(selectedSong.id);
      window.dispatchEvent(new Event(KARAOKE_SONGS_REFRESH_EVENT));
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemove = async (id: number) => {
    try {
      await deleteSong(id);
      setSongs(songs.filter(s => s.id !== id));
      setSelectedSong(null);
      setPendingDeleteSong(null);
    } catch (err) {
      console.error('Error deleting song:', err);
      alert('Failed to delete song.');
    }
  };

  const normalizePerfDateInput = (date: string | null | undefined): string => {
    if (!date) return new Date().toISOString().split('T')[0]!;
    if (date.includes('T')) return date.split('T')[0]!;
    return date.slice(0, 10);
  };

  const loadPerformanceTagIds = async (performanceId: number): Promise<number[]> =>
    fetchPerformanceTagIds(performanceId);

  const refreshPerfDialogHistory = async () => {
    if (!selectedSong) return;
    setPerfHistoryLoading(true);
    try {
      await fetchPerformances(selectedSong.id);
    } finally {
      setPerfHistoryLoading(false);
    }
  };

  const defaultPerfDateForNew = (): string => {
    if (lastEnteredPerfDate) {
      const d = new Date(`${lastEnteredPerfDate}T00:00:00.000Z`);
      if (!Number.isNaN(d.getTime())) {
        d.setUTCDate(d.getUTCDate() + 1);
        return d.toISOString().split('T')[0];
      }
    }
    return new Date().toISOString().split('T')[0];
  };

  const handleOpenPerfDialog = () => {
    setEditingPerfId(null);
    setPerfDate(defaultPerfDateForNew());
    setPerfLocation('');
    setPerfNotes('');
    setPerfRating(3);
    setSelectedPerfTags([]);
    setPerfDialogOpen(true);
    void refreshPerfDialogHistory();
  };

  const handleOpenEditPerformance = async (perf: Performance) => {
    setEditingPerfId(perf.id);
    setPerfDate(normalizePerfDateInput(perf.date));
    setPerfLocation(perf.location || '');
    setPerfNotes(perf.notes || '');
    setPerfRating(perf.rating ?? 3);
    try {
      setSelectedPerfTags(await loadPerformanceTagIds(perf.id));
    } catch (err) {
      console.error('Error loading performance tags:', err);
      setSelectedPerfTags([]);
    }
    setPerfDialogOpen(true);
    void refreshPerfDialogHistory();
  };

  const closePerfDialog = () => {
    setPerfDialogOpen(false);
    setEditingPerfId(null);
  };

  const handleSavePerformance = async () => {
    if (!selectedSong) return;
    setSavingPerf(true);
    try {
      const perfPayload = {
        date: perfDate,
        location: perfLocation,
        notes: perfNotes,
        rating: perfRating ?? 3,
        tagIds: selectedPerfTags,
      };

      if (editingPerfId != null) {
        await updatePerformance(editingPerfId, perfPayload);
      } else {
        await createPerformance(selectedSong.id, perfPayload);
        setLastEnteredPerfDate(perfDate);
      }

      closePerfDialog();
      fetchPerformances(selectedSong.id);
    } catch (err) {
      console.error('Error saving performance:', err);
      alert(
        editingPerfId != null
          ? 'Failed to update performance.'
          : 'Failed to save performance.'
      );
    } finally {
      setSavingPerf(false);
    }
  };

  const handleDeletePerformance = async (perfId: number) => {
    if (!window.confirm('Delete this performance record?')) return;
    try {
      await deletePerformance(perfId);
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

  const handleFetchLyrics = async () => {
    if (!selectedSong) return;
    setLoadingLyrics(true);
    try {
      const lyrics = await fetchLyrics(selectedSong.artist_name, selectedSong.track_name);
      if (lyrics) {
        await handleUpdateSongProperty(selectedSong.id, 'lyrics', lyrics);
        alert('Lyrics fetched successfully!');
      } else {
        alert('Could not find lyrics for this song.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to fetch lyrics.');
    } finally {
      setLoadingLyrics(false);
    }
  };

  const sortedSongs = useMemo(() => sortSongsByTrackName(songs), [songs]);
  const letterCounts = useMemo(
    () => buildLetterCounts(sortedSongs, statusFilter),
    [sortedSongs, statusFilter]
  );
  const letterKeys = useMemo(() => letterKeysWithCounts(letterCounts), [letterCounts]);
  const filteredSongs = useMemo(
    () =>
      filterRepertoireSongs(sortedSongs, {
        searchQuery,
        statusFilter,
        letterFilter,
      }),
    [sortedSongs, searchQuery, statusFilter, letterFilter]
  );
  const hasActiveFilters =
    searchQuery.trim() !== '' || statusFilter.length > 0 || letterFilter != null;
  const clearAllFilters = () => {
    setSearchQuery('');
    setStatusFilter([]);
    setLetterFilter(null);
  };
  const handleLetterClick = (letter: string) => {
    setLetterFilter((prev) => (prev === letter ? null : letter));
  };

  const statusOptions = ['Mastered', 'Proficient', 'Practicing', 'Considering'];
  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;

  if (selectedSong) {
    return (
      <Box sx={{ mt: 2 }}>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => setSelectedSong(null)}>Back to list</Button>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button variant="contained" color="primary" startIcon={<MicIcon />} onClick={handleOpenPerfDialog}>Record performance</Button>
            <Button variant="contained" color="error" startIcon={<DeleteIcon />} onClick={() => setPendingDeleteSong(selectedSong)}>Remove from list</Button>
            <Button variant="contained" color="primary" startIcon={<EmailIcon />} onClick={() => setShareDialogOpen(true)} aria-label="Share with someone">Share with someone</Button>
          </Box>
        </Box>

        <Paper elevation={3} sx={{ p: 4, mb: 4 }}>
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Avatar variant="rounded" src={(selectedSong.artwork_url ?? '').replace('100x100bb', '400x400bb')} sx={{ width: '100%', height: 'auto', aspectRatio: '1/1', boxShadow: 3 }} />
              
              <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button 
                  variant="outlined" 
                  color="error" 
                  fullWidth 
                  startIcon={<YouTubeIcon />}
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(selectedSong.track_name + ' ' + selectedSong.artist_name + ' karaoke')}`}
                  target="_blank"
                >
                  Practice on YouTube
                </Button>
                <Button 
                  variant="outlined" 
                  color="success"
                  fullWidth 
                  startIcon={<MusicNoteIcon />}
                  href={`https://open.spotify.com/search/${encodeURIComponent(selectedSong.track_name + ' ' + selectedSong.artist_name)}`}
                  target="_blank"
                >
                  Listen on Spotify
                </Button>
                {selectedSong.lyrics ? (
                  <Button 
                    variant="outlined" 
                    color="primary" 
                    fullWidth 
                    startIcon={<NotesIcon />}
                    onClick={() => setLyricsDialogOpen(true)}
                  >
                    Lyrics
                  </Button>
                ) : (
                  <Button 
                    variant="outlined" 
                    color="info" 
                    fullWidth 
                    startIcon={loadingLyrics ? <CircularProgress size={20} /> : <NotesIcon />}
                    onClick={handleFetchLyrics}
                    disabled={loadingLyrics}
                  >
                    Fetch lyrics
                  </Button>
                )}
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <Typography variant="h3" gutterBottom sx={{ fontWeight: 'bold' }}>{selectedSong.track_name}</Typography>
              <Typography variant="h4" color="textSecondary" gutterBottom>{selectedSong.artist_name}</Typography>
              
              <Box sx={{ mt: 2, mb: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip label={selectedSong.release_year || 'Unknown year'} variant="outlined" />
                {selectedSong.spotify_source_playlist_name && (
                  <Chip
                    icon={<SpotifyGlyphIcon />}
                    label={`Spotify: ${selectedSong.spotify_source_playlist_name}`}
                    variant="outlined"
                    sx={spotifySx}
                  />
                )}
                {selectedSong.explicit && <Chip label="Explicit" color="error" size="small" />}
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>Data sources</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
                  <Chip label={selectedSong.lyrics ? 'Lyrics found' : 'Lyrics missing'} color={selectedSong.lyrics ? 'success' : 'default'} variant="outlined" />
                  {selectedSong.spotify_source_playlist_name && (
                    <Chip
                      icon={<SpotifyGlyphIcon />}
                      label={`Spotify playlists: ${selectedSong.spotify_source_playlist_name}`}
                      variant="outlined"
                      sx={spotifySx}
                    />
                  )}
                </Box>

                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>Song tags</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                  {selectedSongTags.map(tag => (
                    <Chip key={tag.id} label={tag.name} onDelete={() => handleRemoveSongTag(tag.id)} color="primary" size="small" />
                  ))}
                </Box>
                
                <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-start' }}>
                  <Autocomplete
                    size="small"
                    options={availableTags.filter(t => !selectedSongTags.find(st => st.id === t.id))}
                    getOptionLabel={(option) => option.name}
                    renderInput={(params) => <TextField {...params} label="Search tags" sx={{ maxWidth: 200 }} />}
                    onChange={(_, value) => value && void handleAddSongTag(value.id)}
                    value={null}
                    blurOnSelect
                    clearOnBlur
                  />
                  <TextField
                    size="small"
                    label="Add tags (comma-separated)"
                    placeholder="rock, party"
                    value={songTagsCommaInput}
                    onChange={(e) => setSongTagsCommaInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      const raw = songTagsCommaInput;
                      setSongTagsCommaInput('');
                      void handleAddSongTagsFromInput(raw);
                    }}
                    sx={{ minWidth: 200 }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      const raw = songTagsCommaInput;
                      setSongTagsCommaInput('');
                      void handleAddSongTagsFromInput(raw);
                    }}
                    disabled={!songTagsCommaInput.trim()}
                  >
                    Add
                  </Button>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Personal key</InputLabel>
                    <Select value={selectedSong.personal_key || '0'} label="Personal key" onChange={(e) => handleUpdateSongProperty(selectedSong.id, 'personal_key', e.target.value)}>
                      {['-3', '-2', '-1', '0', '1', '2', '3'].map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Status</InputLabel>
                    <Select value={selectedSong.vocal_status || 'Considering'} label="Status" onChange={(e) => handleUpdateSongProperty(selectedSong.id, 'vocal_status', e.target.value)}>
                      {['Mastered', 'Proficient', 'Practicing', 'Considering'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <Box sx={{ mt: 4 }}>
                <Typography variant="h6" gutterBottom>Track details</Typography>
                <Typography variant="body2" color="textSecondary">
                  <strong>Album:</strong> {selectedSong.album || '—'}<br />
                  <strong>Duration:</strong>{' '}
                  {selectedSong.duration_ms
                    ? `${Math.floor(selectedSong.duration_ms / 60000)}:${((selectedSong.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}`
                    : '—'}
                  <br />
                  <strong>Popularity:</strong>{' '}
                  {selectedSong.popularity != null ? `${selectedSong.popularity}/100` : '—'}
                  <br />
                  <strong>Release date:</strong>{' '}
                  {selectedSong.release_date
                    ? new Date(selectedSong.release_date).toLocaleDateString()
                    : '—'}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Paper>

        {performances.length > 0 && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold' }}>Performance history</Typography>
            <TableContainer component={Paper} elevation={3}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell align="center">Performance</TableCell>
                    <TableCell align="center">Notes</TableCell>
                    <TableCell align="center">Edit</TableCell>
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
                      <TableCell align="center">{perf.notes ? <IconButton onClick={() => handleShowNotes(perf.notes)} aria-label="View notes"><NotesIcon /></IconButton> : '-'}</TableCell>
                      <TableCell align="center">
                        <Tooltip title="Edit performance">
                          <IconButton
                            color="primary"
                            aria-label="Edit performance"
                            onClick={() => void handleOpenEditPerformance(perf)}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="center"><IconButton color="error" onClick={() => handleDeletePerformance(perf.id)} aria-label="Delete performance"><CloseIcon /></IconButton></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        <Dialog
          open={perfDialogOpen}
          onClose={() => {
            if (!savingPerf) closePerfDialog();
          }}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle>
            {editingPerfId != null ? 'Edit performance' : 'Record performance'}
          </DialogTitle>
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
                  value={availableTags.filter((t) => selectedPerfTags.includes(t.id))}
                  renderInput={(params) => <TextField {...params} label="Tags" placeholder="Add tags..." />}
                  onChange={(_, value) => setSelectedPerfTags(value.map((v) => v.id))}
                />
              </FormControl>

              <TextField label="Notes" placeholder="How did it go?" multiline rows={3} value={perfNotes} onChange={(e) => setPerfNotes(e.target.value)} fullWidth />

              <Divider />

              <Typography variant="subtitle2" color="text.secondary">
                Previous performances
              </Typography>
              <Box
                sx={{
                  maxHeight: 220,
                  overflow: 'auto',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  px: 1,
                }}
              >
                {perfHistoryLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={22} />
                  </Box>
                ) : performances.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    No performances recorded for this song yet.
                  </Typography>
                ) : (
                  <List dense disablePadding>
                    {performances.map((p) => (
                      <ListItem
                        key={p.id}
                        disablePadding
                        sx={{ py: 0.5 }}
                        secondaryAction={
                          <Tooltip title="Edit this performance">
                            <IconButton
                              edge="end"
                              size="small"
                              aria-label="Edit performance"
                              onClick={() => void handleOpenEditPerformance(p)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        }
                      >
                        <ListItemText
                          primary={new Date(p.date).toLocaleDateString()}
                          secondary={
                            <Box
                              component="span"
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                flexWrap: 'wrap',
                                mt: 0.25,
                              }}
                            >
                              <Typography
                                component="span"
                                variant="body2"
                                color="text.secondary"
                                noWrap
                                sx={{ minWidth: 0, maxWidth: '100%' }}
                              >
                                {p.location?.trim() ? p.location : '—'}
                              </Typography>
                              {p.rating ? (
                                <Rating
                                  value={p.rating}
                                  readOnly
                                  size="small"
                                  sx={{ flexShrink: 0, display: 'inline-flex' }}
                                />
                              ) : null}
                            </Box>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={closePerfDialog} disabled={savingPerf}>Cancel</Button>
            <Button onClick={handleSavePerformance} variant="contained" disabled={savingPerf}>
              {savingPerf ? (
                <CircularProgress size={24} />
              ) : editingPerfId != null ? (
                'Update'
              ) : (
                'Save'
              )}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={notesDialogOpen} onClose={() => setNotesDialogOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle>Performance notes</DialogTitle>
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
        <Dialog open={Boolean(pendingDeleteSong)} onClose={() => setPendingDeleteSong(null)}>
          <DialogTitle>Remove song?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              Remove “{pendingDeleteSong?.track_name}” from your repertoire? This cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPendingDeleteSong(null)}>Cancel</Button>
            <Button
              color="error"
              variant="contained"
              onClick={() => pendingDeleteSong && void handleRemove(pendingDeleteSong.id)}
            >
              Remove
            </Button>
          </DialogActions>
        </Dialog>
        {selectedSong && (
          <SendSongShareDialog
            open={shareDialogOpen}
            songId={selectedSong.id}
            songTitle={selectedSong.track_name}
            onClose={() => setShareDialogOpen(false)}
            onSent={() => window.dispatchEvent(new Event(KARAOKE_SHARES_REFRESH_EVENT))}
            onSendStatus={setShareSendStatus}
          />
        )}
        <Snackbar
          open={shareSendStatus !== null}
          autoHideDuration={shareSendStatus?.severity === 'success' ? 6000 : 8000}
          onClose={() => setShareSendStatus(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            severity={shareSendStatus?.severity ?? 'info'}
            variant="filled"
            onClose={() => setShareSendStatus(null)}
            sx={{ width: '100%', maxWidth: 480 }}
          >
            {shareSendStatus?.message}
          </Alert>
        </Snackbar>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      {/* Search & Add New Songs */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" gutterBottom align="center" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
          Add songs from the web
        </Typography>
        <SongLookup
          currentUser={currentUser}
          onSongAdded={(songId) => {
            void fetchSongs();
            if (typeof songId === 'number' && songId > 0) {
              void (async () => {
                try {
                  const row = await fetchSong(songId);
                  if (row) {
                    setSelectedSong(row as unknown as Song);
                  }
                } catch (err) {
                  console.error('Failed to open imported song:', err);
                }
              })();
            }
          }}
        />
      </Box>

      <Divider sx={{ my: 4 }} />

      {/* Repertoire Search & Filter */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" gutterBottom align="center" sx={{ fontWeight: 'bold' }}>
          Your repertoire
        </Typography>
        <Accordion defaultExpanded sx={{ mb: 3 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ fontWeight: 'bold' }}>Search, filters, and view</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                size="small"
                placeholder="Search repertoire..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                sx={{ flexGrow: 1, minWidth: 220 }}
                slotProps={{ input: { startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} /> } }}
              />
              <Button
                size="small"
                variant="outlined"
                onClick={clearAllFilters}
                disabled={!hasActiveFilters}
              >
                Clear filters
              </Button>
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel shrink>Status</InputLabel>
                <Select
                  multiple
                  value={statusFilter}
                  label="Status"
                  onChange={(e) => {
                    const value = e.target.value;
                    setStatusFilter(typeof value === 'string' ? value.split(',') : value);
                  }}
                  renderValue={(selected) =>
                    selected.length === 0 ? (
                      <Box component="span" sx={{ color: 'text.secondary' }}>
                        All statuses
                      </Box>
                    ) : selected.join(', ')
                  }
                  displayEmpty
                >
                  {statusOptions.map(s => (
                    <MenuItem key={s} value={s}>
                      <Checkbox checked={statusFilter.includes(s)} />
                      <ListItemText primary={s} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <ButtonGroup size="small" variant="outlined">
                <Button
                  variant={viewMode === 'list' ? 'contained' : 'outlined'}
                  onClick={() => setViewMode('list')}
                >
                  List
                </Button>
                <Button
                  variant={viewMode === 'cards' ? 'contained' : 'outlined'}
                  onClick={() => setViewMode('cards')}
                >
                  Cards
                </Button>
              </ButtonGroup>
            </Box>
            {letterKeys.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Browse by title (A–Z)
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {letterKeys.map((letter) => {
                    const count = letterCounts[letter] ?? 0;
                    const selected = letterFilter === letter;
                    return (
                      <Chip
                        key={letter}
                        label={letter === '#' ? `# (${count})` : `${letter} (${count})`}
                        size="small"
                        clickable
                        color={selected ? 'primary' : 'default'}
                        variant={selected ? 'filled' : 'outlined'}
                        onClick={() => handleLetterClick(letter)}
                      />
                    );
                  })}
                </Box>
              </Box>
            )}
            {filteredSongs.length > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Showing {filteredSongs.length} of {songs.length} songs
                {letterFilter != null ? ` · titles starting with “${letterFilter === '#' ? '#' : letterFilter}”` : ''}
              </Typography>
            )}
          </AccordionDetails>
        </Accordion>
      </Box>

      {/* Song List */}
      {filteredSongs.length === 0 ? (
        <EmptyState
          icon={<MusicNoteIcon />}
          title={songs.length === 0 ? 'Your repertoire is empty' : 'No songs match your filters'}
          description={
            songs.length === 0
              ? 'Search above to find a track and add it — your first karaoke pick is one click away.'
              : 'Try Clear filters or pick a different letter, status, or search.'
          }
        />
      ) : viewMode === 'cards' ? (
        <Grid container spacing={2}>
          {filteredSongs.map((song) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={song.id}>
              <Paper
                elevation={3}
                sx={{ p: 2, height: '100%', cursor: 'pointer' }}
                onClick={() => setSelectedSong(song)}
              >
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Avatar variant="rounded" src={song.artwork_url} sx={{ width: 72, height: 72 }} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="subtitle1" noWrap sx={{ fontWeight: 'bold' }}>
                      {song.track_name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {song.artist_name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                      <Chip size="small" label={song.vocal_status || 'Considering'} />
                      {song.spotify_source_playlist_name && (
                        <Chip size="small" icon={<SpotifyGlyphIcon />} label="Spotify" />
                      )}
                      {song.vocal_status === 'Mastered' && (
                        <Chip size="small" icon={<StarIcon />} label="Mastered" />
                      )}
                    </Box>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
                  <IconButton aria-label="perform" color="primary" onClick={(e) => { e.stopPropagation(); handleDirectPerform(song); }}><MicIcon /></IconButton>
                  <IconButton aria-label="delete" color="error" onClick={(e) => { e.stopPropagation(); setPendingDeleteSong(song); }}><DeleteIcon /></IconButton>
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Paper elevation={3}>
          <List>
            {filteredSongs.map((song) => (
              <React.Fragment key={song.id}>
                <ListItem
                  disablePadding
                  sx={{ display: 'flex', alignItems: 'center' }}
                >
                  <ListItemButton
                    onClick={() => setSelectedSong(song)}
                    sx={{ flex: 1, minWidth: 0, py: 1 }}
                  >
                    <ListItemAvatar><Avatar variant="rounded" src={song.artwork_url} /></ListItemAvatar>
                    <ListItemText
                      sx={{
                        minWidth: 0,
                        flex: '1 1 auto',
                        '& .MuiListItemText-primary': {
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        },
                        '& .MuiListItemText-secondary': {
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        },
                      }}
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden', minWidth: 0 }}>
                          {song.spotify_track_id && (
                            <Tooltip
                              title={
                                song.spotify_source_playlist_name
                                  ? `Imported from Spotify playlist: ${song.spotify_source_playlist_name}`
                                  : 'Imported from Spotify'
                              }
                            >
                              <Box component="span" sx={{ display: 'flex', flexShrink: 0 }}>
                                <SpotifyGlyphIcon />
                              </Box>
                            </Tooltip>
                          )}
                          <Typography variant="body1" noWrap sx={{ fontWeight: 'medium' }}>
                            {song.track_name}
                          </Typography>
                          {song.vocal_status === 'Mastered' && <StarIcon sx={{ color: karaokeTokens.starGold, fontSize: 16, flexShrink: 0 }} />}
                        </Box>
                      } 
                      secondary={
                        <Typography variant="body2" color="textSecondary" noWrap>
                          {song.artist_name} • key {song.personal_key || '0'}
                          {song.spotify_track_id && song.spotify_source_playlist_name
                            ? ` • ${song.spotify_source_playlist_name}`
                            : ''}
                        </Typography>
                      }
                    />
                  </ListItemButton>
                  <Box sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', pr: 0.5 }}>
                    <IconButton
                      aria-label="perform"
                      color="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDirectPerform(song);
                      }}
                    >
                      <MicIcon />
                    </IconButton>
                    <IconButton
                      aria-label="delete"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDeleteSong(song);
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </ListItem>
                <Divider variant="inset" component="li" />
              </React.Fragment>
            ))}
          </List>
        </Paper>
      )}
      <Dialog open={Boolean(pendingDeleteSong)} onClose={() => setPendingDeleteSong(null)}>
        <DialogTitle>Remove song?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Remove “{pendingDeleteSong?.track_name}” from your repertoire? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDeleteSong(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => pendingDeleteSong && void handleRemove(pendingDeleteSong.id)}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SavedSongs;
