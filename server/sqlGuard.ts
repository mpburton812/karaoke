import type { InValue } from "@libsql/client";

/** Tables that hold per-user rows or are always joined through them. */
export const TENANT_TABLES = [
  "songs",
  "performances",
  "tags",
  "locations",
  "song_tags",
  "performance_tags",
  "location_tags",
  "song_status_history",
  "spotify_synced_playlists",
  "spotify_playlist_songs",
] as const;

const USER_OWNED_TABLES = [
  "songs",
  "performances",
  "tags",
  "locations",
] as const;

const JUNCTION_TABLES = [
  "song_tags",
  "performance_tags",
  "location_tags",
  "song_status_history",
] as const;

const PORTABILITY_TABLES = new Set(["songs", "tags", "locations"]);

const SONG_UPDATE_COLUMNS = new Set(["personal_key", "vocal_status", "lyrics"]);

const BLOCKED_PATTERNS = [
  /;\s*(?:drop|delete|update|insert|create|alter|attach|pragma)\b/i,
  /attach\s+/i,
  /pragma\s+/i,
  /\binto\s+users\b/i,
  /\bfrom\s+users\b/i,
  /\bupdate\s+users\b/i,
  /\bdelete\s+from\s+users\b/i,
  /\bevent_logs\b/i,
  /\bschema_migrations\b/i,
];

export function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function referencesTable(sql: string, table: string): boolean {
  return new RegExp(`\\b${table}\\b`, "i").test(sql);
}

function referencesTenantTable(sql: string): boolean {
  return TENANT_TABLES.some((table) => referencesTable(sql, table));
}

function isMutation(sql: string): boolean {
  const upper = sql.trim().toUpperCase();
  return (
    upper.startsWith("INSERT") ||
    upper.startsWith("UPDATE") ||
    upper.startsWith("DELETE") ||
    upper.startsWith("ALTER") ||
    upper.startsWith("DROP") ||
    upper.startsWith("CREATE")
  );
}

/** True when SQL filters rows to the authenticated user (directly or via subquery). */
export function hasTenantScope(sql: string): boolean {
  if (/\buser_id\s*=\s*\?/i.test(sql)) return true;
  if (/\b[a-z]\.user_id\s*=\s*\?/i.test(sql)) return true;
  if (
    /\bsong_id\s+in\s*\(\s*select\s+id\s+from\s+songs\s+where\s+user_id\s*=\s*\?/i.test(
      sql
    )
  ) {
    return true;
  }
  if (
    /\bperformance_id\s+in\s*\(\s*select\s+id\s+from\s+performances\s+where\s+user_id\s*=\s*\?/i.test(
      sql
    )
  ) {
    return true;
  }
  return false;
}

function userScopedMutation(sql: string): boolean {
  const upper = sql.toUpperCase();
  if (!upper.startsWith("DELETE") && !upper.startsWith("UPDATE")) {
    return false;
  }
  return USER_OWNED_TABLES.some((table) =>
    new RegExp(`\\b${table.toUpperCase()}\\b`).test(upper)
  );
}

function junctionMutation(sql: string): boolean {
  const upper = sql.toUpperCase();
  if (!upper.startsWith("DELETE") && !upper.startsWith("UPDATE")) {
    return false;
  }
  return JUNCTION_TABLES.some((table) =>
    new RegExp(`\\b${table.toUpperCase()}\\b`).test(upper)
  );
}

function assertNoBlockedPatterns(normalized: string): void {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new Error("SQL statement not allowed.");
    }
  }
}

function assertSingleStatement(normalized: string): void {
  const semicolon = normalized.indexOf(";");
  if (semicolon >= 0 && semicolon < normalized.length - 1) {
    throw new Error("SQL statement not allowed.");
  }
}

const KNOWN_INSERT_TABLES = new Set([
  ...USER_OWNED_TABLES,
  ...JUNCTION_TABLES,
  "spotify_synced_playlists",
  "spotify_playlist_songs",
]);

function assertDynamicTableAllowed(normalized: string): void {
  const exportMatch = normalized.match(
    /\bselect\s+\*\s+from\s+([a-z_][a-z0-9_]*)\s+where/i
  );
  if (exportMatch && !PORTABILITY_TABLES.has(exportMatch[1].toLowerCase())) {
    throw new Error("SQL statement not allowed.");
  }

  const insertMatch = normalized.match(
    /\binsert\s+(?:or\s+(?:ignore|replace|rollback|abort|fail)\s+)?into\s+([a-z_][a-z0-9_]*)\s*\(/i
  );
  if (insertMatch && !KNOWN_INSERT_TABLES.has(insertMatch[1].toLowerCase())) {
    throw new Error("SQL statement not allowed.");
  }
}

function assertInsertUserOwned(normalized: string, userId: number, args: InValue[]): void {
  const match = normalized.match(
    /\binsert\s+(?:or\s+(?:ignore|replace|rollback|abort|fail)\s+)?into\s+([a-z_][a-z0-9_]*)\s*\(([^)]+)\)/i
  );
  if (!match) return;

  const table = match[1].toLowerCase();
  if (!USER_OWNED_TABLES.includes(table as (typeof USER_OWNED_TABLES)[number])) {
    return;
  }

  const columns = match[2].split(",").map((c) => c.trim().toLowerCase());
  const userIdx = columns.indexOf("user_id");
  if (userIdx < 0) {
    throw new Error("INSERT into user-owned tables must include user_id.");
  }
  if (args[userIdx] !== userId) {
    throw new Error("user_id argument must match the authenticated user.");
  }
}

function assertSongsUpdateWhitelist(normalized: string): void {
  const match = normalized.match(/\bupdate\s+songs\s+set\s+([a-z_][a-z0-9_]*)\s*=/i);
  if (!match) return;
  const column = match[1].toLowerCase();
  if (!SONG_UPDATE_COLUMNS.has(column)) {
    throw new Error("UPDATE songs only allows personal_key, vocal_status, or lyrics.");
  }
}

function assertUserIdArgPresent(userId: number, args: InValue[]): void {
  if (!args.some((a) => a === userId)) {
    throw new Error("user_id argument must match the authenticated user.");
  }
}

/** Reject dangerous SQL and enforce tenant scoping on client-executed statements. */
export function assertSqlAllowed(
  sql: string,
  userId: number,
  args: InValue[] = []
): void {
  const normalized = normalizeSql(sql);

  assertNoBlockedPatterns(normalized);
  assertSingleStatement(normalized);
  assertDynamicTableAllowed(normalized);

  const upper = normalized.toUpperCase();

  if (upper === "SELECT 1" || upper.startsWith("SELECT 1 ")) {
    return;
  }

  if (referencesTenantTable(normalized)) {
    throw new Error(
      "Use the repertoire API instead of raw SQL for songs, tags, locations, and performances."
    );
  }

  if (!isMutation(normalized)) {
    return;
  }

  assertSongsUpdateWhitelist(normalized);
  assertInsertUserOwned(normalized, userId, args);

  if (userScopedMutation(normalized)) {
    if (!/\buser_id\s*=\s*\?/i.test(normalized)) {
      throw new Error("UPDATE/DELETE on user data must filter by user_id = ?.");
    }
    assertUserIdArgPresent(userId, args);
  }

  if (junctionMutation(normalized) && !hasTenantScope(normalized)) {
    // Ownership verified asynchronously in assertSqlOwnership.
    return;
  }
}
