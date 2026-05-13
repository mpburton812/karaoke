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
  Grid
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { db } from '../db';

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

  const fetchLocationStats = useCallback(async (location: Location) => {
    try {
      // Fetch days and total songs
      const basicStatsRes = await db.execute({
        sql: `SELECT COUNT(DISTINCT date) as days, COUNT(*) as total 
              FROM performances 
              WHERE user_id = ? AND location = ?`,
        args: [currentUser.id, location.name]
      });
      
      const days = Number(basicStatsRes.rows[0].days) || 0;
      const total = Number(basicStatsRes.rows[0].total) || 0;
      const avg = days > 0 ? parseFloat((total / days).toFixed(1)) : 0;

      // Fetch top 3 songs
      const topSongsRes = await db.execute({
        sql: `SELECT s.track_name, COUNT(*) as count 
              FROM performances p 
              JOIN songs s ON p.song_id = s.id 
              WHERE p.user_id = ? AND p.location = ? 
              GROUP BY p.song_id 
              ORDER BY count DESC 
              LIMIT 3`,
        args: [currentUser.id, location.name]
      });

      const stats: LocationStats = {
        daysSung: days,
        totalSongs: total,
        avgSongsPerDay: avg,
        topSongs: topSongsRes.rows as unknown as { track_name: string; count: number }[]
      };

      setLocationStatsMap(prev => ({ ...prev, [location.id]: stats }));
    } catch (err) {
      console.error(`Error fetching stats for ${location.name}:`, err);
    }
  }, [currentUser.id]);

  const fetchLocationTags = useCallback(async (locationId: number) => {
    try {
      const result = await db.execute({
        sql: `SELECT t.* FROM tags t 
              JOIN location_tags lt ON t.id = lt.tag_id 
              WHERE lt.location_id = ?`,
        args: [locationId]
      });
      setLocationTagsMap(prev => ({ ...prev, [locationId]: result.rows as unknown as Tag[] }));
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchLocations = useCallback(async () => {
    try {
      const result = await db.execute({
        sql: "SELECT * FROM locations WHERE user_id = ? ORDER BY name ASC",
        args: [currentUser.id]
      });
      const fetchedLocations = result.rows as unknown as Location[];
      setLocations(fetchedLocations);
      
      // Fetch tags and stats for each location
      for (const loc of fetchedLocations) {
        fetchLocationTags(loc.id);
        fetchLocationStats(loc);
      }
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  }, [currentUser.id, fetchLocationTags, fetchLocationStats]);

  const fetchAvailableTags = useCallback(async () => {
    try {
      const result = await db.execute({
        sql: "SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC",
        args: [currentUser.id]
      });
      setAvailableTags(result.rows as unknown as Tag[]);
    } catch (err) {
      console.error('Error fetching tags:', err);
    }
  }, [currentUser.id]);

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchLocations();
      fetchAvailableTags();
    });
  }, [fetchLocations, fetchAvailableTags]);

  const handleAddLocation = async () => {
    if (!newLocation.trim()) return;
    try {
      await db.execute({
        sql: "INSERT INTO locations (user_id, name) VALUES (?, ?)",
        args: [currentUser.id, newLocation.trim()]
      });
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
      await db.execute({
        sql: "DELETE FROM locations WHERE id = ?",
        args: [id]
      });
      fetchLocations();
    } catch (err) {
      console.error('Error deleting location:', err);
    }
  };

  const handleAddTag = async (locationId: number, tagId: number) => {
    console.log(`Adding tag ${tagId} to location ${locationId}`);
    try {
      await db.execute({
        sql: "INSERT OR IGNORE INTO location_tags (location_id, tag_id) VALUES (?, ?)",
        args: [locationId, tagId]
      });
      console.log('Successfully inserted/ignored tag');
      await fetchLocationTags(locationId);
      console.log('Refetched location tags');
    } catch (err) {
      console.error('Error in handleAddTag:', err);
      alert('Failed to add tag. Check console for details.');
    }
  };

  const handleRemoveTag = async (locationId: number, tagId: number) => {
    try {
      await db.execute({
        sql: "DELETE FROM location_tags WHERE location_id = ? AND tag_id = ?",
        args: [locationId, tagId]
      });
      fetchLocationTags(locationId);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom align="center">Favorite Locations</Typography>
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

      <Paper elevation={2}>
        <List>
          {locations.length === 0 ? (
            <ListItem>
              <ListItemText secondary="No favorite locations added yet." />
            </ListItem>
          ) : (
            locations.map((loc, index) => (
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
                        renderInput={(params) => <TextField {...params} label="Search Tags" sx={{ maxWidth: 200 }} />}
                        onChange={(_, value) => value && handleAddTag(loc.id, value.id)}
                        value={null}
                        blurOnSelect
                        clearOnBlur
                      />
                    </Box>

                    {locationStatsMap[loc.id] && (
                      <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                        <Grid container spacing={2}>
                          <Grid size={{ xs: 4 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Days Sung</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{locationStatsMap[loc.id].daysSung}</Typography>
                          </Grid>
                          <Grid size={{ xs: 4 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Total Songs</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{locationStatsMap[loc.id].totalSongs}</Typography>
                          </Grid>
                          <Grid size={{ xs: 4 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>Avg Songs/Day</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{locationStatsMap[loc.id].avgSongsPerDay}</Typography>
                          </Grid>
                        </Grid>
                        
                        {locationStatsMap[loc.id].topSongs.length > 0 && (
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 0.5 }}>Top Songs</Typography>
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
                  </Box>
                </ListItem>
                {index < locations.length - 1 && <Divider />}
              </React.Fragment>
            ))
          )}
        </List>
      </Paper>
    </Box>
  );
};

export default LocationManager;
