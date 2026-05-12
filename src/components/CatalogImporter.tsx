import React, { useState } from 'react';
import { 
  Button, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Typography, 
  LinearProgress, 
  Box,
  Alert
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { db } from '../db';

const CatalogImporter = () => {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setProgress(0);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        // KaraFun CSV uses ";" as separator and has headers
        // Structure usually: ID;Title;Artist;Duration;Styles
        const lines = text.split('\n').filter(line => line.trim() !== '');
        
        // Remove header
        lines.shift();

        const total = lines.length;
        const batchSize = 100;
        
        // Clear existing catalog
        await db.execute("DELETE FROM karafun_catalog");

        for (let i = 0; i < lines.length; i += batchSize) {
          const batch = lines.slice(i, i + batchSize);
          const statements = batch.map(line => {
            // Use a regex to split by ";" but handle possible quotes (though rare in their CSV)
            const parts = line.split(';');
            if (parts.length < 3) return null;
            
            return {
              sql: "INSERT INTO karafun_catalog (id, title, artist, duration, styles) VALUES (?, ?, ?, ?, ?)",
              args: [
                parseInt(parts[0]) || i, 
                parts[1]?.replace(/^"|"$/g, '') || '', 
                parts[2]?.replace(/^"|"$/g, '') || '', 
                parseInt(parts[3]) || 0, 
                parts[4]?.replace(/^"|"$/g, '') || ''
              ]
            };
          }).filter(s => s !== null) as { sql: string; args: any[] }[];

          await db.batch(statements);
          setProgress(Math.round(((i + batch.length) / total) * 100));
        }

        alert('Catalog imported successfully!');
        setOpen(false);
      } catch (err) {
        console.error('Import error:', err);
        setError('Failed to import catalog. Ensure the CSV format is correct (ID;Title;Artist;Duration;Styles).');
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file, "Windows-1252"); // KaraFun uses this encoding
  };

  return (
    <>
      <Button 
        variant="outlined" 
        size="small" 
        startIcon={<CloudUploadIcon />} 
        onClick={() => setOpen(true)}
        sx={{ ml: 2 }}
      >
        Sync KaraFun
      </Button>

      <Dialog open={open} onClose={() => !importing && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Update KaraFun Catalog</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            Download the <strong>Entire catalog (CSV)</strong> from KaraFun's website and upload it here to enable instant availability checks.
          </Typography>
          
          {importing && (
            <Box sx={{ width: '100%', mt: 2 }}>
              <LinearProgress variant="determinate" value={progress} />
              <Typography variant="caption" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
                Importing... {progress}%
              </Typography>
            </Box>
          )}

          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={importing}>Cancel</Button>
          <Button
            variant="contained"
            component="label"
            disabled={importing}
            startIcon={<CloudUploadIcon />}
          >
            Select CSV
            <input
              type="file"
              hidden
              accept=".csv"
              onChange={handleFileChange}
            />
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default CatalogImporter;
