import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  Chip, 
  Paper, 
  Grid, 
  Divider,
  Alert
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { db } from '../db';

interface Tag {
  id: number;
  name: string;
  type: 'song' | 'performance';
}

interface TagManagerProps {
  currentUser: { id: number; username: string };
}

const TagManager: React.FC<TagManagerProps> = ({ currentUser }) => {
  const [songTags, setSongTags] = useState<Tag[]>([]);
  const [performanceTags, setPerformanceTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    try {
      const result = await db.execute({
        sql: "SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC",
        args: [currentUser.id]
      });
      const allTags = result.rows as unknown as Tag[];
      setSongTags(allTags.filter(t => t.type === 'song'));
      setPerformanceTags(allTags.filter(t => t.type === 'performance'));
    } catch (err) {
      console.error('Error fetching tags:', err);
    }
  }, [currentUser.id]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleAddTag = async (type: 'song' | 'performance') => {
    if (!newTagName.trim()) return;
    setError(null);
    try {
      await db.execute({
        sql: "INSERT INTO tags (user_id, name, type) VALUES (?, ?, ?)",
        args: [currentUser.id, newTagName.trim(), type]
      });
      setNewTagName('');
      fetchTags();
    } catch (err: unknown) {
      if (err instanceof Error && err.message?.includes('UNIQUE constraint failed')) {
        setError('This tag already exists for this category.');
      } else {
        console.error('Error adding tag:', err);
        setError('Failed to add tag.');
      }
    }
  };

  const handleDeleteTag = async (tagId: number) => {
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
    <Box sx={{ maxWidth: 800, mx: 'auto', mt: 2 }}>
      <Typography variant="h4" gutterBottom align="center" sx={{ fontWeight: 'bold', mb: 4 }}>
        Manage Tags
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
              if (e.key === 'Enter') handleAddTag('song'); // Default to song if pressed enter
            }}
          />
          <Button 
            variant="contained" 
            startIcon={<AddIcon />} 
            onClick={() => handleAddTag('song')}
          >
            Song Tag
          </Button>
          <Button 
            variant="contained" 
            color="secondary"
            startIcon={<AddIcon />} 
            onClick={() => handleAddTag('performance')}
          >
            Perf Tag
          </Button>
        </Box>
      </Paper>

      <Grid container spacing={4}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h5" gutterBottom color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              SONG TAGS
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Tags to categorize your repertoire (e.g., "High Energy", "Crowd Pleaser", "Practice Needed").
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {songTags.length === 0 ? (
                <Typography variant="body2" color="textSecondary">No song tags created yet.</Typography>
              ) : (
                songTags.map(tag => (
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
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h5" gutterBottom color="secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              PERFORMANCE TAGS
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Tags for specific performance moments (e.g., "Encore", "Duo", "Nailed It", "Voice Tired").
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {performanceTags.length === 0 ? (
                <Typography variant="body2" color="textSecondary">No performance tags created yet.</Typography>
              ) : (
                performanceTags.map(tag => (
                  <Chip 
                    key={tag.id} 
                    label={tag.name} 
                    onDelete={() => handleDeleteTag(tag.id)}
                    color="secondary"
                    variant="outlined"
                  />
                ))
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default TagManager;
