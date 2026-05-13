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
  CircularProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { db } from '../db';

interface Tag {
  id: number;
  name: string;
}

interface TagManagerProps {
  currentUser: { id: number; username: string };
}

const TagManager: React.FC<TagManagerProps> = ({ currentUser }) => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    try {
      const result = await db.execute({
        sql: "SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC",
        args: [currentUser.id]
      });
      setTags(result.rows as unknown as Tag[]);
    } catch (err) {
      console.error('Error fetching tags:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleAddTag = async () => {
    if (!newTagName.trim()) return;
    setError(null);
    try {
      await db.execute({
        sql: "INSERT INTO tags (user_id, name) VALUES (?, ?)",
        args: [currentUser.id, newTagName.trim()]
      });
      setNewTagName('');
      fetchTags();
    } catch (err: unknown) {
      if (err instanceof Error && err.message?.includes('UNIQUE constraint failed')) {
        setError('This tag already exists.');
      } else {
        console.error('Error adding tag:', err);
        setError('Failed to add tag.');
      }
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    if (!window.confirm('Are you sure you want to delete this tag? It will be removed from all songs and locations.')) return;
    try {
      await db.execute({
        sql: "DELETE FROM tags WHERE id = ?",
        args: [tagId]
      });
      fetchTags();
    } catch (err) {
      console.error('Error deleting tag:', err);
    }
  };

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', mt: 2 }}>
      <Typography variant="h4" gutterBottom align="center" sx={{ fontWeight: 'bold', mb: 4 }}>
        Manage Tags
      </Typography>

      <Typography variant="body2" color="textSecondary" align="center" sx={{ mb: 4 }}>
        Create universal tags to categorize your songs and venues (e.g., "High Energy", "Acoustic", "Jazz Club").
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" gutterBottom>Create New Tag</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
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
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom color="primary">
          Your Tags
        </Typography>
        <Divider sx={{ mb: 2 }} />
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={30} />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {tags.length === 0 ? (
              <Typography variant="body2" color="textSecondary">No tags created yet.</Typography>
            ) : (
              tags.map(tag => (
                <Chip 
                  key={tag.id} 
                  label={tag.name} 
                  onDelete={() => handleDeleteTag(tag.id)}
                  color="primary"
                  variant="outlined"
                />
              ))
            )}
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default TagManager;
