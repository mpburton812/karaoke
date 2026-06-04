# Changelog

## [2026-05-20]

- **Places:** Songs sung here lists performance star ratings and a View notes link per entry.
- **UI:** Fix horizontal star ratings in performance history; prevent repertoire list text overlapping action icons on mobile.
- **Repertoire:** Songs sorted A–Z by title; letter chips with counts filter by first letter; **Clear filters** resets search, status, and letter.
- **Security (Track 2 Phase 2):** Repertoire REST APIs (`/api/songs`, tags, locations, stats, portability, account wipe); UI uses `src/api/repertoire.ts`; `/api/execute` accepts only `SELECT 1`.
- **Tests:** Expanded coverage for Track 1/2 (repertoire routes, schema migrations, sqlGuard/ownership, JWT/rate limits, admin event log export/clear); Turso integration suite for repertoire + IDOR; Playwright smoke across Chromium/Firefox/WebKit/mobile; `tests/README.md` and `scripts/check-turso-env.mjs`.
- **Security (Track 2 Phase 1):** Hardened `sqlGuard` (scoped SELECTs, INSERT `user_id`, whitelisted song updates, block `event_logs`/`users`); async `sqlOwnership` on junction tables; rate limits on auth and execute; production requires `JWT_SECRET`; client SQL scoped for song/venue tags and performance tags.
- **Shared hosting (Track 1):** One-time `schema_migrations` (KaraFun/genre cleanup, drop setlists/metadata tables, align `personal_key`); `ADMIN_USERNAMES` for admin accounts; README and enrichment copy updated for multi-user use; Track 2 security plan documented.
- **Admin:** Event log export to CSV, clear all logs, automatic 1000-entry cap; `/api/admin/health` requires admin role; lyrics-only provider status in Settings.
- **Songs:** Removed KaraFun catalog sync/API, automated genre on import, genre chips in Tag Manager, and Musical qualities on song detail; server enrichment fetches lyrics only.
- **Stats:** Clickable **Performances** and **Average rating** hero cards open drill-down dialogs; MUI v7 Typography fix for Render builds.
- **Performances:** Edit existing performances from performance history and from the record dialog’s previous-performances list.
- **UI:** Clear buttons on web song search and repertoire search/filter.
- **God mode / ops:** Event log viewer in God Mode tab; structured Turso + JSONL event logging; Settings gear replaces Admin tab; change username with password.

## [2026-05-18]

- Admin: Full-library re-enrichment for all users (sync or background).
- God mode: Last sign-in on registration; latest performance date per user; clearer column labels.
- Fix: Turso startup migration for Spotify playlist foreign-key backfill.
- Perf: Parallel `/api/execute` loads on Stats, Tag Manager, Location Manager, and Songs.
- Places: “Songs sung here” on venues; Record Performance CHECK for past dates and venues.
- UI: Scrollable main tabs on small screens; mobile login shows Create account without clipping.
- Admin: Update History preview (five entries + expand); provider links in `index.html` (since removed when enrichment simplified).

## [2026-05-17]
- Admin: Add protected administrative access layer and GOD MODE tab for admin users.
- Admin: Grant `mpburton` admin access during database initialization.
- Admin: GOD MODE shows user last login, song/tag/venue counts, password reset, account deletion, and performance history.
- UI: Add Admin Health Dashboard cards and fold system/provider health into one panel.
- UI: Add repertoire filter accordion and list/card view toggle.
- UI: Add song detail data-source chips for lyrics, KaraFun, BPM/key, genre, and Spotify playlists.
- UI: Replace key Admin/Songs/Spotify browser confirms with in-app dialogs.
- UI: Trim verbose Admin and Spotify helper copy.
- Enrichment: Prefer Spotify audio features when available, then fall back to GetSongBPM for BPM/key and Last.fm tags for genre/mood when API keys are configured.
- Admin: Add richer System Status and enrichment details, including warnings, timestamps, and progress counters.
- Admin: Remove the visible Spotify diagnostics panel while retaining server-side diagnostics.
- Fix: Add timeouts to backend enrichment lookups so one external provider cannot stall a run.
- Fix: Improve KaraFun sync errors with source, warnings, parsed-line counts, and content previews when downloads are not CSV.
- Fix: Prevent status multi-select label overlap before selection.
- Fix: Move KaraFun catalog sync to the backend and show real sync errors inline instead of a generic browser alert.
- Repertoire: Allow multi-select vocal status filtering; songs match any selected status.
- Admin: Add backend song enrichment jobs with progress counters and an auto-check-all button.
- Spotify: Track song membership across multiple playlists, link duplicates instead of inserting them, and only delete Spotify-created songs after their final playlist link is removed.
- Spotify: Add OAuth/profile error diagnostics and safer Spotify error messages.
- Spotify: Remove synced playlist entries when playlist links are removed.

## [2026-05-16]
- Admin: Prominent restart-and-update button (service worker check, clear caches, reload)
- Perf: Manual iTunes song import saves immediately; MusicBrainz and AcousticBrainz run in background via shared enrichment
- Feature: Centralize post-import enrichment (KaraFun, lyrics, MusicBrainz, AcousticBrainz) in `songEnrichment` with a shared `karaoke-songs-refresh` event
- Feature: Spotify playlist import persists rows first, then enriches new song IDs in the background
- Repertoire: Show Spotify source playlist name on tracks imported from a synced playlist
- Admin/API: `POST /api/spotify/delete-imported-songs` removes user songs tied to a synced Spotify playlist

## [2026-05-15]
- Admin: Add force reload to fetch the latest app code (clears PWA cache)
- Admin: Add change-password form on Admin tab
- Security: Move Turso to Express API with JWT and password login
- Security: Enforce user_id on deletes/updates and unique songs per user
- Fix: Resolve white screen after login (API row normalization)
- Reliability: Add React error boundary for graceful crash recovery
- Tests: Add Vitest unit tests and optional Turso integration CI
- Docs: Add README for dev setup, deploy, and secrets
- Mobile: Align Capacitor app id and name with Karaoke Companion

## [2026-05-13]
- Feature: Implement case-insensitive usernames for login and account creation
- Feature: Implement dynamic theme selection (Light, Dark, and Trans Pride modes)
- Feature: Implement new STATS tab with performance dashboards (Top Tracks, Artist Trends, Genre DNA, Venue Power Rankings)
- Feature: Add detailed performance statistics for Favorite Locations (Days Sung, Total Songs, Avg Songs/Day, Top 3 Songs)
- Feature: Add 'FETCH LYRICS' for existing songs missing lyrics in Repertoire
- Refactor: Centralize lyrics fetching and text cleaning into shared 'lyricsService'
- UI: Stylize Tag/Genre cloud header and rename 'Add New Songs' to 'Add New Songs from Internet'
- Tags: Implement visual TAG CLOUD with multi-tag selection and song count scaling
- Feature: Implement 1-5 star Performance Rating and remove Setlists
- Admin: Synchronize repository CHANGELOG with Admin Update History
- Optimize: Implement manual chunking and React.lazy code splitting
- UI: Responsive tabs, mic icon for performance, song layout fixes, and cleanup

## [2026-05-12]
- Implement Setlist Tab, Practice Mode with external links, and Smart Suggest features
- Finalize strict data policy and fix repertoire list layout
- Implement strict data policy: mark missing musical qualities as DNF
- Eliminate all remaining hardcoded placeholders and refine musical quality variety
- Implement real musical qualities fetching with MusicBrainz and pseudo-random fallback
- Admin refactor: remove manual sync, add CSV import/export for repertoire data

## [2026-05-11]
- Enhance Admin tools and enrich song detail metadata
- Fix module resolution and GitHub Action configuration for catalog update
- Automate daily KaraFun catalog updates via GitHub Actions
- Fix MUI build errors and update tagging system
- Implement advanced repertoire features: key tracking, setlists, analytics, and enhanced search

## [Earlier]
- Remove time from performance tracking
- Add green play arrow and red delete icon to song list
- Implement authentication and multi-user support
- Add ADMIN tab and move SYNC KARAFUN functionality there
- Update branding to Karaoke Companion and rename sync button to Sync KaraFun
- Fix MUI v6 TextField props and cleanup
- Implement performance tracking and history in Song List
- Rename Saved Songs to Song List across the application
- Optimize KaraFun check with local catalog indexing and importer
