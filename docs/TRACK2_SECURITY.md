# Track 2 — Security sprint (shared hosting)

Track 1 (cleanup) is done. Before wide public signup, complete this track.

## Goals

- Remove reliance on generic `/api/execute` for tenant mutations.
- Prevent cross-user reads/writes even if a client crafts SQL.

## Status (2026-05-20)

**Phase 1 implemented:** expanded `sqlGuard`, async `sqlOwnership`, rate limits on auth/execute, production `JWT_SECRET` check, client query scoping fixes.

**Still open:** REST APIs to replace client `db.execute`, full integration IDOR suite.

## Recommended order

1. **sqlGuard Phase 1** ✅
   - Require `user_id = ?` on SELECT from `songs`, `performances`, `tags`, `locations`, junction tables.
   - Validate INSERT `performances` / `song_tags` against owning `songs.user_id`.
   - Block unscoped `DELETE FROM event_logs` for non-admin (or admin-only route only).

2. **REST layer**
   - `GET/PATCH /api/songs`, `POST/PUT/DELETE /api/songs/:id/performances`, tags, locations.
   - Deprecate client `db.execute` for those tables.

3. **Tests**
   - IDOR cases in `server/sqlGuard.test.ts` and route integration tests.

4. **Ops**
   - Rate-limit auth and execute endpoints.
   - Audit log for admin actions (already partially via `event_logs`).
