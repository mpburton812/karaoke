import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  Chip, 
  Paper, 
  Divider,
  Alert,
  CircularProgress,
  Grid,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ListItemButton
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FilterListIcon from '@mui/icons-material/FilterList';
import {
  fetchTags,
  fetchLocations,
  searchSongsByTags,
  createTag,
  deleteTag,
} from '../api/repertoire';
import EmptyState from './EmptyState';
import {
  KARAOKE_OPEN_SONG_EVENT,
  KARAOKE_SONGS_REFRESH_EVENT,
  type KaraokeOpenSongDetail,
} from '../lib/karaokeEvents';
import {
  getTagCloudChipMetrics,
  normalizeTagCount,
  tagCountBounds,
} from '../utils/tagCloudScale';

interface Tag {
  id: number;
  name: string;
  count?: number;
}

interface Song {
  id: number;
  track_name: string;
  artist_name: string;
  artwork_url: string;
  genre: string;
}

interface Location {
  id: number;
  name: string;
  tagIds: number[];
}

interface TagManagerProps {
  currentUser: { id: number; username: string };
}

const TagManager: React.FC<TagManagerProps> = ({ currentUser }) => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter State
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<number | string>('');
  const [filterLogic, setFilterLogic] = useState<'OR' | 'AND'>('AND');
  const [filteredSongs, setFilteredSongs] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tagsRows, locsRows] = await Promise.all([
        fetchTags(true),
        fetchLocations(true),
      ]);

      setTags(tagsRows as unknown as Tag[]);

      const locsWithTags: Location[] = (locsRows as unknown as { id: number; name: string; tag_ids: string | null }[]).map(
        (row) => ({
          id: row.id,
          name: row.name,
          tagIds: row.tag_ids
            ? row.tag_ids.split(",").map((id) => Number(id)).filter((n) => !Number.isNaN(n))
            : [],
        })
      );
      setLocations(locsWithTags);
    } catch (err) {
      console.error('Error fetching tags data:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    Promise.resolve().then(() => fetchData());
  }, [fetchData]);

  useEffect(() => {
    const onRefresh = () => {
      void fetchData();
    };
    window.addEventListener(KARAOKE_SONGS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(KARAOKE_SONGS_REFRESH_EVENT, onRefresh);
  }, [fetchData]);

  const tagCountRange = useMemo(() => {
    const counts = tags.map((t) => normalizeTagCount(t.count));
    return tagCountBounds(counts);
  }, [tags]);

  const tagsForCloud = useMemo(() => {
    return [...tags].sort((a, b) => {
      const ca = normalizeTagCount(a.count);
      const cb = normalizeTagCount(b.count);
      if (cb !== ca) return cb - ca;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [tags]);

  const fetchFilteredSongs = useCallback(async () => {
    if (selectedTagIds.length === 0) {
      setFilteredSongs([]);
      return;
    }

    setSearching(true);
    try {
      const songs = await searchSongsByTags(selectedTagIds, filterLogic);
      setFilteredSongs(songs as unknown as Song[]);
    } catch (err) {
      console.error('Error searching songs by tags:', err);
    } finally {
      setSearching(false);
    }
  }, [selectedTagIds, currentUser.id, filterLogic]);

  useEffect(() => {
    Promise.resolve().then(() => fetchFilteredSongs());
  }, [fetchFilteredSongs]);

  const handleAddTag = async () => {
    if (!newTagName.trim()) return;
    setError(null);
    try {
      await createTag(newTagName.trim());
      setNewTagName('');
      fetchData();
    } catch (err: unknown) {
      console.error('Error adding tag:', err);
      if (err instanceof Error && err.message?.includes('UNIQUE constraint failed')) {
        setError('This tag already exists.');
      } else {
        const errorMsg = err instanceof Error ? err.message : 'Failed to add tag.';
        setError(`Failed to add tag: ${errorMsg}`);
      }
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    if (!window.confirm('Are you sure you want to delete this tag? It will be removed from all songs and locations.')) return;
    try {
      await deleteTag(tagId);
      fetchData();
      // Remove from selection if deleted
      setSelectedTagIds(prev => prev.filter(id => id !== tagId));
    } catch (err) {
      console.error('Error deleting tag:', err);
    }
  };

  const toggleTagSelection = (tagId: number) => {
    setSelectedTagIds(prev => 
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  const handleVenueChange = (venueId: number | string) => {
    setSelectedVenueId(venueId);
    if (venueId === '') {
      setSelectedTagIds([]);
      return;
    }

    const venue = locations.find(l => l.id === venueId);
    if (venue) {
      // When a venue is selected, we REPLACE current selection with its tags
      setSelectedTagIds(venue.tagIds || []);
    }
  };

  const clearFilters = () => {
    setSelectedTagIds([]);
    setSelectedVenueId('');
    setFilterLogic('AND');
  };

  const openSongOnSongsTab = (songId: number) => {
    window.dispatchEvent(
      new CustomEvent<KaraokeOpenSongDetail>(KARAOKE_OPEN_SONG_EVENT, {
        detail: { songId },
      })
    );
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', mt: 2 }}>
      <Typography variant="h4" gutterBottom align="center" sx={{ fontWeight: 'bold', mb: 4 }}>
        Repertoire Explorer
      </Typography>

      <Grid container spacing={4}>
        {/* Left Side: Tag Management */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3, mb: 4 }}>
            <Typography variant="h6" gutterBottom>Create new tag</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField 
                fullWidth 
                size="small" 
                label="Tag name" 
                value={newTagName} 
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') handleAddTag();
                }}
              />
              <Button 
                variant="contained" 
                startIcon={<AddIcon />} 
                onClick={handleAddTag}
              >
                Create
              </Button>
            </Box>
            
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Divider sx={{ my: 2 }} />
            
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>All tags</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {tags.length === 0 ? (
                <Typography variant="body2" color="textSecondary">No tags yet.</Typography>
              ) : (
                tags.map(tag => (
                  <Chip 
                    key={tag.id} 
                    label={`${tag.name} (${tag.count || 0})`} 
                    size="small"
                    onDelete={() => handleDeleteTag(tag.id)}
                    color="default"
                    variant="outlined"
                  />
                ))
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Right Side: Tag Cloud & Filter */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h5" color="primary" sx={{ fontWeight: 'bold' }}>Tag cloud</Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Box sx={{ display: 'flex', border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
                  <Button 
                    size="small" 
                    variant={filterLogic === 'OR' ? 'contained' : 'text'} 
                    onClick={() => setFilterLogic('OR')}
                    sx={{ minWidth: 40, borderRadius: 0 }}
                  >
                    +
                  </Button>
                  <Button 
                    size="small" 
                    variant={filterLogic === 'AND' ? 'contained' : 'text'} 
                    onClick={() => setFilterLogic('AND')}
                    sx={{ minWidth: 40, borderRadius: 0 }}
                  >
                    -
                  </Button>
                </Box>
                <Button size="small" onClick={clearFilters}>Clear</Button>
              </Box>
            </Box>
            
            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
              {filterLogic === 'OR' 
                ? 'Select any tags (+) for a broad search.' 
                : 'Select specific tags (−) for a narrow search (matches all).'}
              {selectedTagIds.length > 0 ? ` Showing matches.` : ` Select options below.`}
            </Typography>

            {/* Venue Shortcut */}
            <Box sx={{ mb: 4 }}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
                Venue shortcut
              </Typography>
              <FormControl fullWidth size="small">
                <InputLabel>Select venue (apply venue tags)</InputLabel>
                <Select
                  value={selectedVenueId}
                  label="Select venue (apply venue tags)"
                  onChange={(e) => handleVenueChange(e.target.value as number)}
                >
                  <MenuItem value=""><em>None (Clear Venue Tags)</em></MenuItem>
                  {locations.map(loc => (
                    <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5, display: 'block' }}>
                Selecting a venue automatically selects all tags associated with that location.
              </Typography>
            </Box>

            <Divider sx={{ mb: 3 }} />

            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
              <Box component="span" sx={{ color: 'success.main' }}>Tags</Box>
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 3, alignItems: 'center' }}>
              {tagsForCloud.map(tag => {
                const count = normalizeTagCount(tag.count);
                const metrics = getTagCloudChipMetrics(
                  count,
                  tagCountRange.min,
                  tagCountRange.max
                );
                const selected = selectedTagIds.includes(tag.id);
                return (
                  <Chip
                    key={`tag-${tag.id}`}
                    label={`${tag.name} (${count})`}
                    onClick={() => toggleTagSelection(tag.id)}
                    aria-label={`${tag.name}, ${count} songs`}
                    color={selected ? 'primary' : 'default'}
                    variant={selected ? 'filled' : 'outlined'}
                    sx={{
                      fontSize: `${metrics.fontSizeRem}rem`,
                      height: 'auto',
                      padding: `${metrics.chipPaddingY}px 0`,
                      '& .MuiChip-label': { px: metrics.labelPaddingX },
                    }}
                  />
                );
              })}
            </Box>
          </Paper>

          {/* Results */}
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Matches ({filteredSongs.length})
              {searching && <CircularProgress size={20} sx={{ ml: 2 }} />}
            </Typography>
            <Divider sx={{ mb: 2 }} />

            {filteredSongs.length === 0 ? (
              <EmptyState
                icon={<FilterListIcon />}
                title={
                  selectedTagIds.length === 0
                    ? 'Start exploring'
                    : 'No matching songs'
                }
                description={
                  selectedTagIds.length === 0
                    ? 'Select tags in the cloud above to find songs in your repertoire.'
                    : 'No songs match this combination — try fewer tags or switch between + and − filter modes.'
                }
              />
            ) : (
              <List>
                {filteredSongs.map((song) => (
                  <React.Fragment key={song.id}>
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => openSongOnSongsTab(song.id)}>
                        <ListItemAvatar>
                          <Avatar variant="rounded" src={song.artwork_url} />
                        </ListItemAvatar>
                        <ListItemText 
                          primary={song.track_name} 
                          secondary={song.artist_name} 
                        />
                      </ListItemButton>
                    </ListItem>
                    <Divider variant="inset" component="li" />
                  </React.Fragment>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default TagManager;
