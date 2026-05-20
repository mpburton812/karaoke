# Application event log

Events are stored in Turso (`event_logs`) and mirrored here as **JSON Lines** for review in GitHub.

## Levels

| Code | Severity | When to use |
|------|----------|-------------|
| **C** | Critical | Unhandled failures, process instability, or errors that break core app behavior |
| **W** | Warning | Handled errors, degraded features, or unavailable external APIs |
| **I** | Informational | Normal audit trail (sign-in, data changes, performances) |

## JSONL format

Each line in `application-events.jsonl` is one JSON object:

```json
{"at":"2026-05-20T12:00:00.000Z","level":"I","user":"singer","message":"User signed in","category":"auth"}
```

The server appends to this file on every logged event (when the filesystem is writable). Production hosts may only persist to the database; export from **God Mode → Event log** in the app or query Turso directly.
