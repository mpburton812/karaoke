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
  Alert
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { db } from '../db';

interface Location {
  id: number;
  name: string;
}

interface LocationManagerProps {
  currentUser: { id: number; username: string };
}

const LocationManager: React.FC<LocationManagerProps> = ({ currentUser }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [newLocation, setNewLocation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchLocations = useCallback(async () => {
    try {
      const result = await db.execute({
        sql: "SELECT * FROM locations WHERE user_id = ? ORDER BY name ASC",
        args: [currentUser.id]
      });
      setLocations(result.rows as unknown as Location[]);
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  }, [currentUser.id]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

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

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom align="center">Favorite Locations</Typography>
      <Typography variant="body2" color="textSecondary" align="center" sx={{ mb: 3 }}>
        Manage your frequent karaoke spots for quick entry during performances.
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
                  secondaryAction={
                    <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteLocation(loc.id)}>
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText primary={loc.name} />
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
