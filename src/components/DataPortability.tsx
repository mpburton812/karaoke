import React, { useState } from 'react';
import { 
  Box, 
  Typography, 
  Button, 
  Paper, 
  Grid, 
  Alert,
  CircularProgress,
  ButtonGroup
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import Papa from 'papaparse';
import type { InValue } from '@libsql/client';
import { db } from '../db';

interface DataPortabilityProps {
  currentUser: { id: number; username: string };
  onDataChange?: () => void;
}

const DataPortability: React.FC<DataPortabilityProps> = ({ currentUser, onDataChange }) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const exportData = async (table: string) => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await db.execute({
        sql: `SELECT * FROM ${table} WHERE user_id = ?`,
        args: [currentUser.id]
      });

      const csv = Papa.unparse(result.rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `${table}_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setMessage({ text: `Successfully exported ${table}.`, type: 'success' });
    } catch (err) {
      console.error(err);
      setMessage({ text: `Failed to export ${table}.`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const importData = (table: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      setLoading(true);
      setMessage(null);

      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            const data = results.data as Record<string, InValue>[];
            if (data.length === 0) {
              setMessage({ text: 'CSV is empty.', type: 'error' });
              setLoading(false);
              return;
            }

            // Map data to insert statements, ensuring user_id is set to current user
            const columns = Object.keys(data[0]).filter(col => col !== 'id' && col !== 'user_id');
            const placeholders = columns.map(() => '?').join(', ');
            const sql = `INSERT OR IGNORE INTO ${table} (user_id, ${columns.join(', ')}) VALUES (?, ${placeholders})`;

            const statements: { sql: string; args: InValue[] }[] = data.map(row => ({
              sql,
              args: [currentUser.id, ...columns.map(col => row[col])]
            }));

            await db.batch(statements);
            setMessage({ text: `Successfully imported ${data.length} records into ${table}.`, type: 'success' });
            if (onDataChange) onDataChange();
          } catch (err) {
            console.error(err);
            setMessage({ text: `Failed to import ${table}. Ensure CSV format matches export.`, type: 'error' });
          } finally {
            setLoading(false);
          }
        },
        error: (err) => {
          console.error(err);
          setMessage({ text: 'Error parsing CSV.', type: 'error' });
          setLoading(false);
        }
      });
    };
    input.click();
  };

  const tables = [
    { name: 'songs', label: 'Songs' },
    { name: 'locations', label: 'Locations' },
    { name: 'tags', label: 'Tags' }
  ];

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom align="center">Data Portability</Typography>
      <Typography variant="body2" color="textSecondary" align="center" sx={{ mb: 3 }}>
        Export your data to CSV or import from a previous backup.
      </Typography>

      {message && (
        <Alert severity={message.type} sx={{ mb: 3 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <CircularProgress size={24} />
          <Typography sx={{ ml: 2 }}>Processing...</Typography>
        </Box>
      )}

      <Grid container spacing={2}>
        {tables.map((table) => (
          <Grid size={{ xs: 12, sm: 6 }} key={table.name}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                {table.label}
              </Typography>
              <ButtonGroup variant="outlined" fullWidth size="small">
                <Button 
                  startIcon={<DownloadIcon />} 
                  onClick={() => exportData(table.name)}
                  disabled={loading}
                >
                  Export
                </Button>
                <Button 
                  startIcon={<UploadIcon />} 
                  onClick={() => importData(table.name)}
                  disabled={loading}
                >
                  Import
                </Button>
              </ButtonGroup>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default DataPortability;
