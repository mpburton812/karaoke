import React, { useState, useEffect, useCallback } from 'react';
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
import { db } from '../db';
import { KARAOKE_OPEN_SONG_EVENT, type KaraokeOpenSongDetail } from '../lib/karaokeEvents';

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
  const [genres, setGenres] = useState<string[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter State
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<number | string>('');
  const [filterLogic, setFilterLogic] = useState<'OR' | 'AND'>('AND');
  const [filteredSongs, setFilteredSongs] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const uid = currentUser.id;
    try {
      const [tagsRes, genresRes, locsRes] = await Promise.all([
        db.execute({
          sql: `
          SELECT t.id, t.name, COUNT(st.song_id) as count 
          FROM tags t 
          LEFT JOIN song_tags st ON t.id = st.tag_id 
          WHERE t.user_id = ? 
          GROUP BY t.id 
          ORDER BY t.name ASC
        `,
          args: [uid],
        }),
        db.execute({
          sql: "SELECT DISTINCT genre FROM songs WHERE user_id = ? AND genre IS NOT NULL ORDER BY genre ASC",
          args: [uid],
        }),
        db.execute({
          sql: `SELECT l.id, l.name, group_concat(lt.tag_id) AS tag_ids
              FROM locations l
              LEFT JOIN location_tags lt ON lt.location_id = l.id
              WHERE l.user_id = ?
              GROUP BY l.id, l.name
              ORDER BY l.name ASC`,
          args: [uid],
        }),
      ]);

      setTags(tagsRes.rows as unknown as Tag[]);
      setGenres(genresRes.rows.map((r) => r.genre as string));

      const locsWithTags: Location[] = (locsRes.rows as unknown as { id: number; name: string; tag_ids: string | null }[]).map(
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

  const fetchFilteredSongs = useCallback(async () => {
    if (selectedTagIds.length === 0 && selectedGenres.length === 0) {
      setFilteredSongs([]);
      return;
    }

    setSearching(true);
    try {
      // Build query
      let sql = `SELECT DISTINCT s.id, s.track_name, s.artist_name, s.artwork_url, s.genre FROM songs s`;
      const args: (string | number)[] = [];
      const conditions: string[] = [`s.user_id = ?`];
      args.push(currentUser.id);

      if (selectedGenres.length > 0) {
        conditions.push(`s.genre IN (${selectedGenres.map(() => '?').join(',')})`);
        args.push(...selectedGenres);
      }

      if (selectedTagIds.length > 0) {
        if (filterLogic === 'OR') {
          // ANY of the tags
          sql += ` JOIN song_tags st ON s.id = st.song_id`;
          conditions.push(`st.tag_id IN (${selectedTagIds.map(() => '?').join(',')})`);
          args.push(...selectedTagIds);
        } else {
          // ALL of the tags
          // We need a song to have EVERY tag_id in selectedTagIds
          for (let i = 0; i < selectedTagIds.length; i++) {
            sql += ` JOIN song_tags st${i} ON s.id = st${i}.song_id`;
            conditions.push(`st${i}.tag_id = ?`);
            args.push(selectedTagIds[i]);
          }
        }
      }

      sql += ` WHERE ` + conditions.join(' AND ');
      sql += ` ORDER BY s.track_name ASC`;

      const result = await db.execute({ sql, args });
      setFilteredSongs(result.rows as unknown as Song[]);
    } catch (err) {
      console.error('Error searching songs by tags:', err);
    } finally {
      setSearching(false);
    }
  }, [selectedTagIds, selectedGenres, currentUser.id, filterLogic]);

  useEffect(() => {
    Promise.resolve().then(() => fetchFilteredSongs());
  }, [fetchFilteredSongs]);

  const handleAddTag = async () => {
    if (!newTagName.trim()) return;
    setError(null);
    try {
      await db.execute({
        sql: "INSERT INTO tags (user_id, name) VALUES (?, ?)",
        args: [currentUser.id, newTagName.trim()]
      });
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
      await db.execute({
        sql: "DELETE FROM tags WHERE id = ? AND user_id = ?",
        args: [tagId, currentUser.id]
      });
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

  const toggleGenreSelection = (genre: string) => {
    setSelectedGenres(prev => 
      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
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
    setSelectedGenres([]);
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
            <Typography variant="h6" gutterBottom>Create New Tag</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField 
                fullWidth 
                size="small" 
                label="Tag Name" 
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
            
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>All Universal Tags</Typography>
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
                ? 'Select any tags (+) to broad search.' 
                : 'Select specific tags (-) to narrow search (matches ALL).'}
              {selectedTagIds.length > 0 || selectedGenres.length > 0 ? ` Showing matches.` : ` Select options below.`}
            </Typography>

            {/* Venue Shortcut */}
            <Box sx={{ mb: 4 }}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
                Venue Shortcut
              </Typography>
              <FormControl fullWidth size="small">
                <InputLabel>Select Venue (Apply Venue Tags)</InputLabel>
                <Select
                  value={selectedVenueId}
                  label="Select Venue (Apply Venue Tags)"
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
              <Box component="span" sx={{ color: 'success.main' }}>Tags</Box> and <Box component="span" sx={{ color: 'info.main' }}>Genres</Box>
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 3, alignItems: 'center' }}>
              {/* Combine Tags and Genres into the cloud if they want, but separate sections are often cleaner. 
                  The user asked to "optionally genres from songs in the list". 
                  I'll keep them as distinct but styled identically for a cohesive "Cloud" feel. */}
              {tags.map(tag => (
                <Chip 
                  key={`tag-${tag.id}`} 
                  label={tag.name} 
                  onClick={() => toggleTagSelection(tag.id)}
                  color={selectedTagIds.includes(tag.id) ? "primary" : "default"}
                  variant={selectedTagIds.includes(tag.id) ? "filled" : "outlined"}
                  sx={{ 
                    fontSize: '1rem',
                    height: 'auto',
                    padding: '4px 0',
                    '& .MuiChip-label': { px: 2 }
                  }}
                />
              ))}
              
              {genres.map(genre => (
                <Chip 
                  key={`genre-${genre}`} 
                  label={genre} 
                  onClick={() => toggleGenreSelection(genre)}
                  color={selectedGenres.includes(genre) ? "info" : "default"}
                  variant={selectedGenres.includes(genre) ? "filled" : "outlined"}
                  sx={{ 
                    fontSize: '1rem',
                    height: 'auto',
                    padding: '4px 0',
                    fontStyle: 'italic',
                    '& .MuiChip-label': { px: 2 },
                  }}
                />
              ))}
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
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography color="textSecondary">
                  {selectedTagIds.length === 0 && selectedGenres.length === 0 
                    ? "Select some tags or genres above to start exploring." 
                    : "No songs match your criteria."}
                </Typography>
              </Box>
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
                          secondary={`${song.artist_name} • ${song.genre}`} 
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
