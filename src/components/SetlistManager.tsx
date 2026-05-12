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

interface Setlist {
  id: number;
  name: string;
  description: string;
}

interface SetlistManagerProps {
  currentUser: { id: number; username: string };
}

const SetlistManager: React.FC<SetlistManagerProps> = ({ currentUser }) => {
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchSetlists = useCallback(async () => {
    try {
      const result = await db.execute({
        sql: "SELECT * FROM setlists WHERE user_id = ? ORDER BY created_at DESC",
        args: [currentUser.id]
      });
      setSetlists(result.rows as unknown as Setlist[]);
    } catch (err) {
      console.error('Error fetching setlists:', err);
    }
  }, [currentUser.id]);

  useEffect(() => {
    fetchSetlists();
  }, [fetchSetlists]);

  const handleAddSetlist = async () => {
    if (!newName.trim()) return;
    try {
      await db.execute({
        sql: "INSERT INTO setlists (user_id, name, description) VALUES (?, ?, ?)",
        args: [currentUser.id, newName.trim(), newDescription.trim()]
      });
      setNewName('');
      setNewDescription('');
      fetchSetlists();
    } catch (err) {
      console.error('Error adding setlist:', err);
      setError('Failed to add setlist.');
    }
  };

  const handleDeleteSetlist = async (id: number) => {
    if (!window.confirm('Are you sure? This will remove the setlist but not the songs within your repertoire.')) return;
    try {
      await db.execute({
        sql: "DELETE FROM setlists WHERE id = ?",
        args: [id]
      });
      fetchSetlists();
    } catch (err) {
      console.error('Error deleting setlist:', err);
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom align="center">Setlist Management</Typography>
      <Typography variant="body2" color="textSecondary" align="center" sx={{ mb: 3 }}>
        Create and manage setlists to organize your performances.
      </Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField 
            fullWidth 
            size="small" 
            label="Setlist Name"
            placeholder="e.g. 80s Night, Ballads, Friday Gig" 
            value={newName} 
            onChange={(e) => setNewName(e.target.value)}
          />
          <TextField 
            fullWidth 
            size="small" 
            label="Description (Optional)"
            placeholder="Notes about this setlist..." 
            value={newDescription} 
            onChange={(e) => setNewDescription(e.target.value)}
          />
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddSetlist}>
            Create Setlist
          </Button>
        </Box>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper elevation={2}>
        <List>
          {setlists.length === 0 ? (
            <ListItem>
              <ListItemText secondary="No setlists created yet." />
            </ListItem>
          ) : (
            setlists.map((sl, index) => (
              <React.Fragment key={sl.id}>
                <ListItem
                  secondaryAction={
                    <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteSetlist(sl.id)}>
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText 
                    primary={sl.name} 
                    secondary={sl.description}
                  />
                </ListItem>
                {index < setlists.length - 1 && <Divider />}
              </React.Fragment>
            ))
          )}
        </List>
      </Paper>
    </Box>
  );
};

export default SetlistManager;
