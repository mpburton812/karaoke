import type { Client, InValue } from "@libsql/client";
import { hasTenantScope, normalizeSql } from "./sqlGuard.js";

async function rowOwned(
  db: Client,
  sql: string,
  args: InValue[],
  notFoundMessage: string
): Promise<void> {
  const result = await db.execute({ sql, args });
  if (result.rows.length === 0) {
    throw new Error(notFoundMessage);
  }
}

async function assertSongOwned(
  db: Client,
  userId: number,
  songId: number
): Promise<void> {
  await rowOwned(
    db,
    "SELECT 1 FROM songs WHERE id = ? AND user_id = ? LIMIT 1",
    [songId, userId],
    "Song not found or not owned by you."
  );
}

async function assertTagOwned(
  db: Client,
  userId: number,
  tagId: number
): Promise<void> {
  await rowOwned(
    db,
    "SELECT 1 FROM tags WHERE id = ? AND user_id = ? LIMIT 1",
    [tagId, userId],
    "Tag not found or not owned by you."
  );
}

async function assertLocationOwned(
  db: Client,
  userId: number,
  locationId: number
): Promise<void> {
  await rowOwned(
    db,
    "SELECT 1 FROM locations WHERE id = ? AND user_id = ? LIMIT 1",
    [locationId, userId],
    "Location not found or not owned by you."
  );
}

async function assertPerformanceOwned(
  db: Client,
  userId: number,
  performanceId: number
): Promise<void> {
  await rowOwned(
    db,
    "SELECT 1 FROM performances WHERE id = ? AND user_id = ? LIMIT 1",
    [performanceId, userId],
    "Performance not found or not owned by you."
  );
}

function argAt(columns: string[], name: string, args: InValue[]): number | undefined {
  const idx = columns.indexOf(name);
  if (idx < 0 || idx >= args.length) return undefined;
  const value = args[idx];
  const n = typeof value === "number" ? value : Number(value);
  return Number.isNaN(n) ? undefined : n;
}

function insertColumns(normalized: string): { table: string; columns: string[] } | null {
  const match = normalized.match(
    /\binsert\s+(?:or\s+(?:ignore|replace|rollback|abort|fail)\s+)?into\s+([a-z_][a-z0-9_]*)\s*\(([^)]+)\)/i
  );
  if (!match) return null;
  return {
    table: match[1].toLowerCase(),
    columns: match[2].split(",").map((c) => c.trim().toLowerCase()),
  };
}

/** Async ownership checks for junction tables and inserts without user_id in WHERE. */
export async function assertSqlOwnership(
  db: Client,
  sql: string,
  userId: number,
  args: InValue[] = []
): Promise<void> {
  const normalized = normalizeSql(sql);
  const upper = normalized.toUpperCase();

  const ins = insertColumns(normalized);
  if (ins?.table === "performances") {
    const songId = argAt(ins.columns, "song_id", args);
    if (songId != null) await assertSongOwned(db, userId, songId);
  }

  if (hasTenantScope(normalized)) {
    return;
  }

  if (ins?.table === "song_tags") {
    const songId = argAt(ins.columns, "song_id", args);
    const tagId = argAt(ins.columns, "tag_id", args);
    if (songId != null) await assertSongOwned(db, userId, songId);
    if (tagId != null) await assertTagOwned(db, userId, tagId);
    return;
  }

  if (ins?.table === "performance_tags") {
    const perfId = argAt(ins.columns, "performance_id", args);
    const tagId = argAt(ins.columns, "tag_id", args);
    if (perfId != null) await assertPerformanceOwned(db, userId, perfId);
    if (tagId != null) await assertTagOwned(db, userId, tagId);
    return;
  }

  if (ins?.table === "location_tags") {
    const locId = argAt(ins.columns, "location_id", args);
    const tagId = argAt(ins.columns, "tag_id", args);
    if (locId != null) await assertLocationOwned(db, userId, locId);
    if (tagId != null) await assertTagOwned(db, userId, tagId);
    return;
  }

  if (ins?.table === "song_status_history") {
    const songId = argAt(ins.columns, "song_id", args);
    if (songId != null) await assertSongOwned(db, userId, songId);
    return;
  }

  if (/\bsong_tags\b/i.test(normalized) && upper.startsWith("DELETE")) {
    const songId = Number(args[0]);
    if (!Number.isNaN(songId)) await assertSongOwned(db, userId, songId);
    if (args[1] != null) await assertTagOwned(db, userId, Number(args[1]));
    return;
  }

  if (/\bperformance_tags\b/i.test(normalized)) {
    const perfId = Number(args[0]);
    if (!Number.isNaN(perfId)) await assertPerformanceOwned(db, userId, perfId);
    if (args[1] != null && upper.startsWith("INSERT")) {
      await assertTagOwned(db, userId, Number(args[1]));
    }
    return;
  }

  if (/\blocation_tags\b/i.test(normalized) && upper.startsWith("DELETE")) {
    const locId = Number(args[0]);
    if (!Number.isNaN(locId)) await assertLocationOwned(db, userId, locId);
    if (args[1] != null) await assertTagOwned(db, userId, Number(args[1]));
    return;
  }

  if (/\bsong_status_history\b/i.test(normalized) && /\bsong_id\s*=\s*\?/i.test(normalized)) {
    const songId = Number(args[0]);
    if (!Number.isNaN(songId)) await assertSongOwned(db, userId, songId);
    return;
  }

  if (
    /\bfrom\s+tags\b/i.test(normalized) &&
    /\bsong_tags\b/i.test(normalized) &&
    /\bsong_id\s*=\s*\?/i.test(normalized)
  ) {
    const songId = Number(args[args.length - 1]);
    if (!Number.isNaN(songId)) await assertSongOwned(db, userId, songId);
  }
}
