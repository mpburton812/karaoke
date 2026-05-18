import React, { useState } from 'react';
import { 
  Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, Typography, Box, Link
} from '@mui/material';

const changelogData = [
  { date: '2026-05-18', description: 'God Mode: last sign-in on registration; list latest performance date; clearer column labels' },
  { date: '2026-05-18', description: 'Fix: Turso startup migration for Spotify playlist rows (foreign key backfill before backfill insert)' },
  { date: '2026-05-18', description: 'Perf: parallel /api/execute loads (Stats, TagManager, LocationManager, Songs tab); remove Tag Manager location N+1' },
  { date: '2026-05-18', description: 'Places: “Songs sung here” lists performances at that venue; Record Performance dialog adds CHECK for past dates and venues' },
  { date: '2026-05-18', description: 'UI: scrollable main tabs on small screens; mobile login shows CREATE ACCOUNT without clipping' },
  { date: '2026-05-18', description: 'Admin: Update History shows five entries with link to expand; static GetSongBPM/Last.fm links in index.html for provider verification' },
  { date: '2026-05-17', description: 'Admin: Add protected GOD MODE access layer for admin users' },
  { date: '2026-05-17', description: 'Admin: GOD MODE user metrics, password reset, account deletion, and performance history' },
  { date: '2026-05-17', description: 'Admin: Grant mpburton administrative access during database initialization' },
  { date: '2026-05-17', description: 'UI: Add Admin Health Dashboard cards and consolidate system/provider health' },
  { date: '2026-05-17', description: 'UI: Add repertoire filter accordion and list/card view toggle' },
  { date: '2026-05-17', description: 'UI: Add song detail data-source chips for lyrics, KaraFun, BPM/key, genre, and Spotify playlists' },
  { date: '2026-05-17', description: 'UI: Replace key Admin/Songs/Spotify browser confirms with in-app dialogs' },
  { date: '2026-05-17', description: 'UI: Trim verbose Admin and Spotify helper copy' },
  { date: '2026-05-17', description: 'Enrichment: Prefer Spotify audio features when available; add GetSongBPM and Last.fm fallbacks when configured' },
  { date: '2026-05-17', description: 'Admin: Richer System Status and enrichment details with warnings, timestamps, and counters' },
  { date: '2026-05-17', description: 'Admin: Remove visible Spotify diagnostics panel while keeping server-side diagnostics' },
  { date: '2026-05-17', description: 'Fix: Add timeouts to backend enrichment lookups to prevent stuck runs' },
  { date: '2026-05-17', description: 'Fix: Improve KaraFun sync errors with source, warnings, parsed-line counts, and content previews' },
  { date: '2026-05-17', description: 'Fix: Prevent status multi-select label overlap before selection' },
  { date: '2026-05-17', description: 'Fix: Backend KaraFun catalog sync with inline success/error messages' },
  { date: '2026-05-17', description: 'Repertoire: Multi-select vocal status filter includes songs matching any selected status' },
  { date: '2026-05-17', description: 'Admin: Backend song enrichment jobs with progress counter and auto-check button' },
  { date: '2026-05-17', description: 'Spotify: Track song membership across multiple playlists and link duplicates instead of inserting them' },
  { date: '2026-05-17', description: 'Spotify: Only delete Spotify-created songs after their final playlist link is removed' },
  { date: '2026-05-17', description: 'Spotify: Add diagnostics panel and clearer OAuth/profile errors' },
  { date: '2026-05-16', description: 'Admin: Prominent restart-and-update button (SW update check, clear caches, reload)' },
  { date: '2026-05-16', description: 'Perf: Manual iTunes import saves immediately; MB/AB enrichment runs in background' },
  { date: '2026-05-16', description: 'Feature: Shared post-import song enrichment (KaraFun, lyrics, MB, AB) and list refresh event' },
  { date: '2026-05-16', description: 'Feature: Spotify playlist import enriches new songs in the background after save' },
  { date: '2026-05-16', description: 'Repertoire: Show Spotify source playlist name on synced-import tracks' },
  { date: '2026-05-16', description: 'Admin/API: POST delete-imported-songs to clear repertoire rows for a synced playlist' },
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

const PREVIEW_COUNT = 5;

const Changelog: React.FC = () => {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? changelogData : changelogData.slice(0, PREVIEW_COUNT);
  const hasMore = changelogData.length > PREVIEW_COUNT;

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
            {rows.map((row, index) => (
              <TableRow key={`${row.date}-${index}-${row.description.slice(0, 24)}`}>
                <TableCell>{row.date}</TableCell>
                <TableCell>{row.description}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {hasMore && (
        <Box sx={{ mt: 1.5, textAlign: 'center' }}>
          {!showAll ? (
            <Link
              component="button"
              type="button"
              variant="body2"
              onClick={() => setShowAll(true)}
              sx={{ cursor: 'pointer', fontWeight: 'medium' }}
            >
              Show all {changelogData.length} updates
            </Link>
          ) : (
            <Link
              component="button"
              type="button"
              variant="body2"
              onClick={() => setShowAll(false)}
              sx={{ cursor: 'pointer', fontWeight: 'medium' }}
            >
              Show last {PREVIEW_COUNT} updates only
            </Link>
          )}
        </Box>
      )}
    </Box>
  );
};

export default Changelog;
