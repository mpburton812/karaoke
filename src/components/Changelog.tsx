import React from 'react';
import { 
  Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, Typography, Box 
} from '@mui/material';

const changelogData = [
  { date: '2026-05-16', description: 'Admin: Prominent restart-and-update button (SW update check, clear caches, reload)' },
  { date: '2026-05-15', description: 'Admin: Add force reload to fetch the latest app code (clears PWA cache)' },
  { date: '2026-05-15', description: 'Admin: Add change-password form on Admin tab' },
  { date: '2026-05-15', description: 'Security: Move Turso to Express API with JWT and password login' },
  { date: '2026-05-15', description: 'Security: Enforce user_id on deletes/updates and unique songs per user' },
  { date: '2026-05-15', description: 'Fix: Resolve white screen after login (API row normalization)' },
  { date: '2026-05-15', description: 'Reliability: Add React error boundary for graceful crash recovery' },
  { date: '2026-05-15', description: 'Tests: Add Vitest unit tests and optional Turso integration CI' },
  { date: '2026-05-15', description: 'Docs: Add README for dev setup, deploy, and secrets' },
  { date: '2026-05-15', description: 'Mobile: Align Capacitor app id and name with Karaoke Companion' },
  { date: '2026-05-13', description: 'Feature: Implement case-insensitive usernames for login and account creation' },
  { date: '2026-05-13', description: 'Feature: Implement dynamic theme selection (Light, Dark, and Trans modes)' },
  { date: '2026-05-13', description: 'Feature: Implement new STATS tab with performance dashboards' },
  { date: '2026-05-13', description: 'Feature: Add detailed performance statistics for Favorite Locations' },
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
