import type { InValue } from "@libsql/client";

const USER_SCOPED_TABLES = [
  "songs",
  "performances",
  "tags",
  "locations",
  "spotify_synced_playlists",
  "spotify_playlist_songs",
] as const;

const BLOCKED_PATTERNS = [
  /;\s*drop\s+/i,
  /;\s*delete\s+from\s+users/i,
  /attach\s+/i,
  /pragma\s+/i,
];

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
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

function userScopedMutation(sql: string): boolean {
  const upper = sql.toUpperCase();
  if (!upper.startsWith("DELETE") && !upper.startsWith("UPDATE")) {
    return false;
  }
  return USER_SCOPED_TABLES.some((table) =>
    new RegExp(`\\b${table.toUpperCase()}\\b`).test(upper)
  );
}

/** Reject obviously dangerous SQL and mutations on user data without user_id scope. */
export function assertSqlAllowed(
  sql: string,
  userId: number,
  args: InValue[] = []
): void {
  const normalized = normalizeSql(sql);

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new Error("SQL statement not allowed.");
    }
  }

  if (!isMutation(normalized)) {
    return;
  }

  if (userScopedMutation(normalized)) {
    if (!/\buser_id\s*=\s*\?/i.test(normalized)) {
      throw new Error("UPDATE/DELETE on user data must filter by user_id = ?.");
    }
    if (!args.some((a) => a === userId)) {
      throw new Error("user_id argument must match the authenticated user.");
    }
  }
}
