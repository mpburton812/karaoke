# Changelog

## [2026-05-13]
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
