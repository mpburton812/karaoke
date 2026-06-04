# Tests

## Unit tests (`npm test`)

| Area | Files | Covers |
|------|--------|--------|
| **Track 1** | `server/schemaMigrations.test.ts`, `server/adminConfig.test.ts` | One-time migrations, `ADMIN_USERNAMES` |
| **Track 2 Phase 1** | `server/sqlGuard.test.ts`, `server/sqlOwnership.test.ts`, `server/authJwt.test.ts`, `server/rateLimit.test.ts` | SQL lockdown, ownership, production JWT, rate limits |
| **Track 2 Phase 2** | `server/repertoire.test.ts`, `server/repertoireRoutes.test.ts` | Repertoire service + REST routes, IDOR, `/api/execute` lockdown |
| **Shared** | `server/app.test.ts`, `server/auth.test.ts`, `server/eventLog.test.ts` | Auth, admin, enrichment, event log cap/export/clear |

## Integration tests (`npm run test:integration`)

Requires Turso credentials and `JWT_SECRET` in the environment (see `.env.example`).

| File | Covers |
|------|--------|
| `tests/integration/api.integration.test.ts` | Health, login, repertoire list, execute lockdown |
| `tests/integration/repertoire.integration.test.ts` | Full song/tag/performance/stats flow + cross-user IDOR |
| `tests/integration/turso.integration.test.ts` | Direct Turso connectivity |

Integration suites are skipped automatically when credentials are missing.
