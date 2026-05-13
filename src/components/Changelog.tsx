import React from 'react';
import { 
  Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, Typography, Box 
} from '@mui/material';

const changelogData = [
  { date: '2026-05-13', description: "Feature: Add 'FETCH LYRICS' for repertoire songs and refactor to shared service" },
  { date: '2026-05-13', description: "UI: Stylize Tag/Genre cloud header and rename 'Add New Songs' section" },
  { date: '2026-05-13', description: 'Tags: Add TAG CLOUD for multi-tag repertoire exploration' },
  { date: '2026-05-13', description: 'Feature: Implement 1-5 star Performance Rating and remove Setlists' },
  { date: '2026-05-13', description: 'Admin: Synchronize repository CHANGELOG with Admin Update History' },
  { date: '2026-05-13', description: 'Optimize: Implement manual chunking and React.lazy code splitting' },
  { date: '2026-05-13', description: 'UI: Responsive tabs, mic icon for performance, song layout fixes, and cleanup' },
  { date: '2026-05-12', description: 'Implement Setlist Tab, Practice Mode, and Smart Suggest features' },
  { date: '2026-05-11', description: 'Enhance Admin tools and enrich song detail metadata' },
];

const Changelog: React.FC = () => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" gutterBottom align="center">Update History</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {changelogData.map((row, index) => (
              <TableRow key={index}>
                <TableCell>{row.date}</TableCell>
                <TableCell>{row.description}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default Changelog;
