import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  List, 
  ListItem, 
  ListItemText, 
  ListItemAvatar, 
  Avatar, 
  IconButton, 
  Divider,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Autocomplete,
  CircularProgress
} from '@mui/material';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import AddIcon from '@mui/icons-material/Add';
import { db } from '../db';

interface Song {
  id: number;
  track_name: string;
  artist_name: string;
  artwork_url: string;
  duration_ms: number;
  personal_key: string;
}

interface Setlist {
  id: number;
  name: string;
  description: string;
}

interface SetlistManagerTabProps {
  currentUser: { id: number; username: string };
}

const SortableSongItem = ({ song, onRemove }: { song: Song, onRemove: (id: number) => void }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: song.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    marginBottom: '8px'
  };

  return (
    <ListItem
      ref={setNodeRef}
      style={style}
      component={Paper}
      elevation={1}
      secondaryAction={
        <IconButton edge="end" color="error" onClick={() => onRemove(song.id)}>
          <DeleteIcon />
        </IconButton>
      }
      sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
    >
      <Box {...attributes} {...listeners} sx={{ display: 'flex', alignItems: 'center', mr: 2, cursor: 'grab' }}>
        <DragIndicatorIcon color="action" />
      </Box>
      <ListItemAvatar>
        <Avatar variant="rounded" src={song.artwork_url} />
      </ListItemAvatar>
      <ListItemText 
        primary={song.track_name} 
        secondary={`${song.artist_name} • ${song.personal_key || 'Standard'}`} 
      />
      <Typography variant="caption" color="textSecondary" sx={{ mr: 2 }}>
        {Math.floor(song.duration_ms / 60000)}:{( (song.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}
      </Typography>
    </ListItem>
  );
};

const SetlistTab: React.FC<SetlistManagerTabProps> = ({ currentUser }) => {
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [selectedSetlist, setSelectedSetlist] = useState<Setlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [allUserSongs, setAllUserSongs] = useState<Song[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  const fetchSetlistSongs = useCallback(async (setlistId: number) => {
    setLoading(true);
    try {
      const result = await db.execute({
        sql: `SELECT s.* FROM songs s 
              JOIN setlist_songs ss ON s.id = ss.song_id 
              WHERE ss.setlist_id = ? 
              ORDER BY ss.display_order ASC`,
        args: [setlistId]
      });
      setSongs(result.rows as unknown as Song[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAllUserSongs = useCallback(async () => {
    try {
      const result = await db.execute({
        sql: "SELECT id, track_name, artist_name, artwork_url, duration_ms, personal_key FROM songs WHERE user_id = ?",
        args: [currentUser.id]
      });
      setAllUserSongs(result.rows as unknown as Song[]);
    } catch (err) {
      console.error(err);
    }
  }, [currentUser.id]);

  useEffect(() => {
    fetchSetlists();
    fetchAllUserSongs();
  }, [fetchSetlists, fetchAllUserSongs]);

  useEffect(() => {
    if (selectedSetlist) {
      fetchSetlistSongs(selectedSetlist.id);
    } else {
      setSongs([]);
    }
  }, [selectedSetlist, fetchSetlistSongs]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id && selectedSetlist) {
      const oldIndex = songs.findIndex((s) => s.id === active.id);
      const newIndex = songs.findIndex((s) => s.id === over?.id);
      const newSongs = arrayMove(songs, oldIndex, newIndex);
      setSongs(newSongs);

      // Update display_order in database
      try {
        const batch = newSongs.map((song, index) => ({
          sql: "UPDATE setlist_songs SET display_order = ? WHERE setlist_id = ? AND song_id = ?",
          args: [index, selectedSetlist.id, song.id]
        }));
        await db.batch(batch);
      } catch (err) {
        console.error('Failed to update setlist order:', err);
      }
    }
  };

  const handleRemoveSong = async (songId: number) => {
    if (!selectedSetlist) return;
    try {
      await db.execute({
        sql: "DELETE FROM setlist_songs WHERE setlist_id = ? AND song_id = ?",
        args: [selectedSetlist.id, songId]
      });
      setSongs(songs.filter(s => s.id !== songId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddSong = async (song: Song | null) => {
    if (!selectedSetlist || !song) return;
    try {
      await db.execute({
        sql: "INSERT OR IGNORE INTO setlist_songs (setlist_id, song_id, display_order) VALUES (?, ?, ?)",
        args: [selectedSetlist.id, song.id, songs.length]
      });
      fetchSetlistSongs(selectedSetlist.id);
      setAddDialogOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const totalRuntime = songs.reduce((acc, s) => acc + (s.duration_ms || 0), 0);
  const runtimeDisplay = `${Math.floor(totalRuntime / 60000)}m ${Math.floor((totalRuntime % 60000) / 1000)}s`;

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', mt: 2 }}>
      <Typography variant="h4" gutterBottom align="center" sx={{ fontWeight: 'bold' }}>
        Setlist Manager
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        {setlists.length === 0 ? (
          <Typography variant="body2" color="textSecondary">No setlists found. Create one in Admin.</Typography>
        ) : (
          setlists.map(sl => (
            <Chip 
              key={sl.id} 
              label={sl.name} 
              onClick={() => setSelectedSetlist(sl)}
              color={selectedSetlist?.id === sl.id ? "primary" : "default"}
              sx={{ px: 1 }}
            />
          ))
        )}
      </Box>

      {selectedSetlist && (
        <Paper elevation={3} sx={{ p: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 'bold' }}>{selectedSetlist.name}</Typography>
              <Typography variant="body2" color="textSecondary">{selectedSetlist.description}</Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="h6" color="primary">{runtimeDisplay}</Typography>
              <Typography variant="caption" color="textSecondary">{songs.length} songs</Typography>
            </Box>
          </Box>

          <Divider sx={{ mb: 3 }} />

          {loading ? (
            <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
          ) : (
            <>
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={songs.map(s => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <List>
                    {songs.length === 0 ? (
                      <Typography align="center" color="textSecondary" sx={{ py: 4 }}>
                        This setlist is empty.
                      </Typography>
                    ) : (
                      songs.map((song) => (
                        <SortableSongItem key={song.id} song={song} onRemove={handleRemoveSong} />
                      ))
                    )}
                  </List>
                </SortableContext>
              </DndContext>

              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Button 
                  variant="outlined" 
                  startIcon={<AddIcon />} 
                  onClick={() => setAddDialogOpen(true)}
                >
                  Add Song to Setlist
                </Button>
              </Box>
            </>
          )}
        </Paper>
      )}

      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add to {selectedSetlist?.name}</DialogTitle>
        <DialogContent>
          <Autocomplete
            options={allUserSongs.filter(s => !songs.find(ss => ss.id === s.id))}
            getOptionLabel={(option) => `${option.track_name} - ${option.artist_name}`}
            renderInput={(params) => <TextField {...params} label="Select Song" margin="dense" />}
            onChange={(_, value) => handleAddSong(value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SetlistTab;
