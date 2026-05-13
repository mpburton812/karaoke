import React from 'react';
import { 
  Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, Typography, Box 
} from '@mui/material';

const changelogData = [
  { date: '2026-05-13', description: 'Optimize: Implement manual chunking and React.lazy code splitting' },
  { date: '2026-05-13', description: 'UI: Responsive tabs, mic icon for performance, song layout fixes, and cleanup' },
  { date: '2026-05-12', description: 'Implement Setlist Tab, Practice Mode, and Smart Suggest features' },
  { date: '2026-05-12', description: 'Finalize strict data policy and fix repertoire list layout' },
  { date: '2026-05-12', description: 'Implement strict data policy: mark missing musical qualities as DNF' },
  { date: '2026-05-12', description: 'Eliminate hardcoded placeholders and refine musical quality variety' },
  { date: '2026-05-12', description: 'Implement real musical qualities fetching with MusicBrainz' },
  { date: '2026-05-12', description: 'Admin refactor: remove manual sync, add CSV import/export' },
  { date: '2026-05-11', description: 'Enhance Admin tools and enrich song detail metadata' },
  { date: '2026-05-11', description: 'Fix module resolution and GitHub Action configuration' },
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
