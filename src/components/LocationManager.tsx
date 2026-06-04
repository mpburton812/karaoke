import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  List, 
  ListItem, 
  ListItemText, 
  IconButton, 
  Paper,
  Divider,
  Alert,
  Autocomplete,
  Chip,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';
import PlaceIcon from '@mui/icons-material/Place';
import EmptyState from './EmptyState';
import {
  fetchLocations as apiListLocations,
  fetchTags as apiListTags,
  fetchLocationTags as apiListLocationTags,
  createLocation,
  deleteLocation,
  addLocationTag,
  removeLocationTag,
  fetchLocationStats as apiLocationStats,
  fetchLocationPerformances as apiLocationPerformances,
} from '../api/repertoire';

interface Location {
  id: number;
  name: string;
}

interface Tag {
  id: number;
  name: string;
}

interface LocationStats {
  daysSung: number;
  totalSongs: number;
  avgSongsPerDay: number;
  topSongs: { track_name: string; count: number }[];
}

interface VenueSongRow {
  track_name: string;
  date: string;
}

interface LocationManagerProps {
  currentUser: { id: number; username: string };
}

const LocationManager: React.FC<LocationManagerProps> = ({ currentUser }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [newLocation, setNewLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [locationTagsMap, setLocationTagsMap] = useState<Record<number, Tag[]>>({});
  const [locationStatsMap, setLocationStatsMap] = useState<Record<number, LocationStats>>({});
  const [venueSongsOpen, setVenueSongsOpen] = useState(false);
  const [venueSongsTitle, setVenueSongsTitle] = useState('');
  const [venueSongsRows, setVenueSongsRows] = useState<VenueSongRow[]>([]);
  const [venueSongsLoading, setVenueSongsLoading] = useState(false);

  const fetchLocationStats = useCallback(async (location: Location) => {
    try {
      const raw = await apiLocationStats(location.name);
      const avg =
        raw.daysSung > 0
          ? parseFloat((raw.totalSongs / raw.daysSung).toFixed(1))
          : 0;

      const stats: LocationStats = {
        daysSung: raw.daysSung,
        totalSongs: raw.totalSongs,
        avgSongsPerDay: avg,
        topSongs: raw.topSongs,
      };

      setLocationStatsMap((prev) => ({ ...prev, [location.id]: stats }));
    } catch (err) {
      console.error(`Error fetching stats for ${location.name}:`, err);
    }
  }, [currentUser.id]);

  const fetchLocationTags = useCallback(async (locationId: number) => {
    try {
      const tags = await apiListLocationTags(locationId);
      setLocationTagsMap(prev => ({ ...prev, [locationId]: tags as unknown as Tag[] }));
    } catch (err) {
      console.error(err);
    }
  }, [currentUser.id]);

  const fetchLocations = useCallback(async () => {
    try {
      const fetchedLocations = (await apiListLocations(false)) as unknown as Location[];
      setLocations(fetchedLocations);

      await Promise.all(
        fetchedLocations.flatMap((loc) => [
          fetchLocationTags(loc.id),
          fetchLocationStats(loc),
        ])
      );
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  }, [currentUser.id, fetchLocationTags, fetchLocationStats]);

  const fetchAvailableTags = useCallback(async () => {
    try {
      const tags = await apiListTags(false);
      setAvailableTags(tags as unknown as Tag[]);
    } catch (err) {
      console.error('Error fetching tags:', err);
    }
  }, [currentUser.id]);

  useEffect(() => {
    void Promise.all([fetchLocations(), fetchAvailableTags()]);
  }, [fetchLocations, fetchAvailableTags]);

  const handleAddLocation = async () => {
    if (!newLocation.trim()) return;
    try {
      await createLocation(newLocation.trim());
      setNewLocation('');
      fetchLocations();
    } catch (err) {
      console.error('Error adding location:', err);
      setError('Failed to add location.');
    }
  };

  const handleDeleteLocation = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this location?')) return;
    try {
      await deleteLocation(id);
      fetchLocations();
    } catch (err) {
      console.error('Error deleting location:', err);
    }
  };

  const handleAddTag = async (locationId: number, tagId: number) => {
    console.log(`Adding tag ${tagId} to location ${locationId}`);
    try {
      await addLocationTag(locationId, tagId);
      console.log('Successfully inserted/ignored tag');
      await fetchLocationTags(locationId);
      console.log('Refetched location tags');
    } catch (err) {
      console.error('Error in handleAddTag:', err);
      alert('Failed to add tag. Check console for details.');
    }
  };

  const openVenueSongHistory = async (loc: Location) => {
    setVenueSongsTitle(loc.name);
    setVenueSongsOpen(true);
    setVenueSongsLoading(true);
    setVenueSongsRows([]);
    try {
      const rows = await apiLocationPerformances(loc.name);
      setVenueSongsRows(rows as unknown as VenueSongRow[]);
    } catch (err) {
      console.error('Error loading songs for venue:', err);
    } finally {
      setVenueSongsLoading(false);
    }
  };

  const handleRemoveTag = async (locationId: number, tagId: number) => {
    try {
      await removeLocationTag(locationId, tagId);
      fetchLocationTags(locationId);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom align="center" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
        Favorite locations
      </Typography>
      <Typography variant="body2" color="textSecondary" align="center" sx={{ mb: 3 }}>
        Manage your frequent karaoke spots and tag them for better organization.
      </Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField 
            fullWidth 
            size="small" 
            placeholder="e.g. Blue Note, The Local Pub, Home" 
            value={newLocation} 
            onChange={(e) => setNewLocation(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddLocation()}
          />
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddLocation}>
            Add
          </Button>
        </Box>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {locations.length === 0 ? (
        <EmptyState
          icon={<PlaceIcon />}
          title="No venues yet"
          description="Add a karaoke bar, pub, or practice spot above — then tag it so songs and stats stay organized."
        />
      ) : (
      <Paper elevation={2}>
        <List>
            {locations.map((loc, index) => (
              <React.Fragment key={loc.id}>
                <ListItem
                  alignItems="flex-start"
                  secondaryAction={
                    <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteLocation(loc.id)}>
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <Box sx={{ width: '100%', mr: 4 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{loc.name}</Typography>
                    
                    <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                      {(locationTagsMap[loc.id] || []).map(tag => (
                        <Chip 
                          key={tag.id} 
                          label={tag.name} 
                          size="small" 
                          onDelete={() => handleRemoveTag(loc.id, tag.id)}
                          color="primary"
                          variant="outlined"
                        />
                      ))}
                    </Box>

                    <Box sx={{ mt: 2 }}>
                      <Autocomplete
                        size="small"
                        options={availableTags.filter(t => !(locationTagsMap[loc.id] || []).find(lt => lt.id === t.id))}
                        getOptionLabel={(option) => option.name}
                        renderInput={(params) => <TextField {...params} label="Search tags" sx={{ maxWidth: 200 }} />}
                        onChange={(_, value) => value && handleAddTag(loc.id, value.id)}
                        value={null}
                        blurOnSelect
                        clearOnBlur
                      />
                    </Box>

                    {locationStatsMap[loc.id] && (
                      <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
                        <Grid container spacing={2}>
                          <Grid size={{ xs: 4 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Days sung</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{locationStatsMap[loc.id].daysSung}</Typography>
                          </Grid>
                          <Grid size={{ xs: 4 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Total songs</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{locationStatsMap[loc.id].totalSongs}</Typography>
                          </Grid>
                          <Grid size={{ xs: 4 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Avg songs/day</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{locationStatsMap[loc.id].avgSongsPerDay}</Typography>
                          </Grid>
                        </Grid>
                        
                        {locationStatsMap[loc.id].topSongs.length > 0 && (
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 0.5 }}>Top songs</Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                              {locationStatsMap[loc.id].topSongs.map((song, i) => (
                                <Chip 
                                  key={i} 
                                  label={`${song.track_name} (${song.count})`} 
                                  size="small" 
                                  variant="outlined" 
                                  sx={{ fontSize: '0.7rem', height: 20 }}
                                />
                              ))}
                            </Box>
                          </Box>
                        )}
                      </Box>
                    )}

                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<HistoryIcon />}
                      sx={{ mt: 2 }}
                      onClick={() => void openVenueSongHistory(loc)}
                    >
                      Songs sung here
                    </Button>
                  </Box>
                </ListItem>
                {index < locations.length - 1 && <Divider />}
              </React.Fragment>
            ))}
        </List>
      </Paper>
      )}

      <Dialog open={venueSongsOpen} onClose={() => !venueSongsLoading && setVenueSongsOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Songs at {venueSongsTitle}</DialogTitle>
        <DialogContent dividers>
          {venueSongsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : venueSongsRows.length === 0 ? (
            <Typography color="text.secondary">No performances recorded at this venue yet.</Typography>
          ) : (
            <List dense disablePadding>
              {venueSongsRows.map((row, idx) => (
                <ListItem key={`${row.track_name}-${row.date}-${idx}`} divider={idx < venueSongsRows.length - 1}>
                  <ListItemText
                    primary={row.track_name}
                    secondary={new Date(row.date).toLocaleDateString()}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVenueSongsOpen(false)} disabled={venueSongsLoading}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LocationManager;
