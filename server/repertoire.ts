import { db } from "./db.js";

const REPERTOIRE_SONG_SELECT = `
  SELECT s.*, sp.spotify_source_playlist_name
  FROM songs s
  LEFT JOIN (
    SELECT ps.user_id, ps.song_id, group_concat(p.playlist_name, ', ') AS spotify_source_playlist_name
    FROM spotify_playlist_songs ps
    JOIN spotify_synced_playlists p
      ON p.user_id = ps.user_id
     AND p.spotify_playlist_id = ps.spotify_playlist_id
    GROUP BY ps.user_id, ps.song_id
  ) sp
    ON s.user_id = sp.user_id AND s.id = sp.song_id
`;

const PORTABILITY_TABLES = new Set(["songs", "tags", "locations"]);

export type PortabilityTable = "songs" | "tags" | "locations";

export class RepertoireError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "RepertoireError";
  }
}

async function assertSongOwned(userId: number, songId: number): Promise<void> {
  const r = await db.execute({
    sql: "SELECT 1 FROM songs WHERE id = ? AND user_id = ? LIMIT 1",
    args: [songId, userId],
  });
  if (r.rows.length === 0) {
    throw new RepertoireError("Song not found.", 404);
  }
}

async function assertTagOwned(userId: number, tagId: number): Promise<void> {
  const r = await db.execute({
    sql: "SELECT 1 FROM tags WHERE id = ? AND user_id = ? LIMIT 1",
    args: [tagId, userId],
  });
  if (r.rows.length === 0) {
    throw new RepertoireError("Tag not found.", 404);
  }
}

async function assertLocationOwned(
  userId: number,
  locationId: number
): Promise<void> {
  const r = await db.execute({
    sql: "SELECT 1 FROM locations WHERE id = ? AND user_id = ? LIMIT 1",
    args: [locationId, userId],
  });
  if (r.rows.length === 0) {
    throw new RepertoireError("Location not found.", 404);
  }
}

async function assertPerformanceOwned(
  userId: number,
  performanceId: number
): Promise<void> {
  const r = await db.execute({
    sql: "SELECT 1 FROM performances WHERE id = ? AND user_id = ? LIMIT 1",
    args: [performanceId, userId],
  });
  if (r.rows.length === 0) {
    throw new RepertoireError("Performance not found.", 404);
  }
}

export async function listSongs(userId: number): Promise<unknown[]> {
  const result = await db.execute({
    sql: `${REPERTOIRE_SONG_SELECT} WHERE s.user_id = ? ORDER BY s.track_name ASC`,
    args: [userId],
  });
  return result.rows;
}

export async function getSong(
  userId: number,
  songId: number
): Promise<unknown | null> {
  const result = await db.execute({
    sql: `${REPERTOIRE_SONG_SELECT} WHERE s.user_id = ? AND s.id = ?`,
    args: [userId, songId],
  });
  return result.rows[0] ?? null;
}

export async function findDuplicateSong(
  userId: number,
  input: {
    itunesId: number | string;
    trackName: string;
    artistName: string;
  }
): Promise<unknown | null> {
  const result = await db.execute({
    sql: `SELECT id, track_name, artist_name FROM songs
          WHERE user_id = ?
            AND (
              itunes_id = ?
              OR (
                lower(trim(track_name)) = lower(trim(?))
                AND lower(trim(artist_name)) = lower(trim(?))
              )
            )
          LIMIT 1`,
    args: [userId, input.itunesId, input.trackName, input.artistName],
  });
  return result.rows[0] ?? null;
}

export interface UpsertSongInput {
  itunesId: number | string;
  trackName: string;
  artistName: string;
  artworkUrl: string;
  durationMs: number;
  releaseDate: string;
  explicit: number;
  album: string;
  releaseYear: number;
  lyrics: string | null;
}

export async function upsertSong(
  userId: number,
  input: UpsertSongInput
): Promise<{ id: number; created: boolean }> {
  const result = await db.execute({
    sql: `INSERT INTO songs (
            user_id, itunes_id, track_name, artist_name, artwork_url,
            duration_ms, release_date, explicit, album, release_year, lyrics,
            personal_key, vocal_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '0', 'Practicing')
          ON CONFLICT(user_id, itunes_id) DO UPDATE SET
            track_name = excluded.track_name,
            artist_name = excluded.artist_name,
            artwork_url = excluded.artwork_url,
            duration_ms = excluded.duration_ms,
            release_date = excluded.release_date,
            explicit = excluded.explicit,
            album = excluded.album,
            release_year = excluded.release_year,
            lyrics = excluded.lyrics
          RETURNING id`,
    args: [
      userId,
      input.itunesId,
      input.trackName,
      input.artistName,
      input.artworkUrl,
      input.durationMs,
      input.releaseDate,
      input.explicit,
      input.album,
      input.releaseYear,
      input.lyrics,
    ],
  });
  const row = result.rows[0] as { id?: number } | undefined;
  const id = row?.id;
  if (typeof id !== "number") {
    throw new RepertoireError("Song already in your list.", 409);
  }

  const historyCheck = await db.execute({
    sql: `SELECT COUNT(*) as count FROM song_status_history h
          JOIN songs s ON s.id = h.song_id
          WHERE h.song_id = ? AND s.user_id = ?`,
    args: [id, userId],
  });
  const count = Number(
    (historyCheck.rows[0] as { count?: number })?.count ?? 0
  );
  if (count === 0) {
    await db.execute({
      sql: "INSERT INTO song_status_history (song_id, status) VALUES (?, 'Practicing')",
      args: [id],
    });
  }

  return { id, created: true };
}

const SONG_PATCH_FIELDS = new Set(["personal_key", "vocal_status", "lyrics"]);

export async function patchSong(
  userId: number,
  songId: number,
  patch: Partial<Record<"personal_key" | "vocal_status" | "lyrics", string | null>>
): Promise<void> {
  await assertSongOwned(userId, songId);
  for (const [field, value] of Object.entries(patch)) {
    if (!SONG_PATCH_FIELDS.has(field)) {
      throw new RepertoireError(`Field not allowed: ${field}`);
    }
    await db.execute({
      sql: `UPDATE songs SET ${field} = ? WHERE id = ? AND user_id = ?`,
      args: [value, songId, userId],
    });
    if (field === "vocal_status" && value != null) {
      await db.execute({
        sql: "INSERT INTO song_status_history (song_id, status) VALUES (?, ?)",
        args: [songId, value],
      });
    }
  }
}

export async function deleteSong(userId: number, songId: number): Promise<void> {
  await assertSongOwned(userId, songId);
  await db.execute({
    sql: "DELETE FROM songs WHERE id = ? AND user_id = ?",
    args: [songId, userId],
  });
}

export async function listSongTags(
  userId: number,
  songId: number
): Promise<unknown[]> {
  await assertSongOwned(userId, songId);
  const result = await db.execute({
    sql: `SELECT t.* FROM tags t
          JOIN song_tags st ON t.id = st.tag_id
          JOIN songs s ON s.id = st.song_id
          WHERE st.song_id = ? AND s.user_id = ?`,
    args: [songId, userId],
  });
  return result.rows;
}

export async function addSongTag(
  userId: number,
  songId: number,
  tagId: number
): Promise<void> {
  await assertSongOwned(userId, songId);
  await assertTagOwned(userId, tagId);
  await db.execute({
    sql: "INSERT OR IGNORE INTO song_tags (song_id, tag_id) VALUES (?, ?)",
    args: [songId, tagId],
  });
}

export async function removeSongTag(
  userId: number,
  songId: number,
  tagId: number
): Promise<void> {
  await assertSongOwned(userId, songId);
  await db.execute({
    sql: "DELETE FROM song_tags WHERE song_id = ? AND tag_id = ?",
    args: [songId, tagId],
  });
}

export async function listPerformances(
  userId: number,
  songId: number
): Promise<unknown[]> {
  await assertSongOwned(userId, songId);
  const result = await db.execute({
    sql: "SELECT * FROM performances WHERE song_id = ? AND user_id = ? ORDER BY date DESC",
    args: [songId, userId],
  });
  return result.rows;
}

export async function getPerformanceTagIds(
  userId: number,
  performanceId: number
): Promise<number[]> {
  await assertPerformanceOwned(userId, performanceId);
  const result = await db.execute({
    sql: `SELECT pt.tag_id FROM performance_tags pt
          JOIN performances p ON p.id = pt.performance_id
          WHERE pt.performance_id = ? AND p.user_id = ?`,
    args: [performanceId, userId],
  });
  return (result.rows as { tag_id: number }[]).map((r) => Number(r.tag_id));
}

export interface PerformanceInput {
  date: string;
  location: string;
  notes: string;
  rating: number;
  tagIds?: number[];
}

export async function createPerformance(
  userId: number,
  songId: number,
  input: PerformanceInput
): Promise<{ id: number }> {
  await assertSongOwned(userId, songId);
  const result = await db.execute({
    sql: `INSERT INTO performances (song_id, user_id, date, location, notes, rating)
          VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    args: [
      songId,
      userId,
      input.date,
      input.location,
      input.notes,
      input.rating,
    ],
  });
  const id = (result.rows[0] as { id?: number })?.id;
  if (typeof id !== "number") {
    throw new RepertoireError("Failed to create performance.");
  }
  await setPerformanceTags(userId, id, input.tagIds ?? []);
  return { id };
}

export async function updatePerformance(
  userId: number,
  performanceId: number,
  input: PerformanceInput
): Promise<void> {
  await assertPerformanceOwned(userId, performanceId);
  await db.execute({
    sql: `UPDATE performances SET date = ?, location = ?, notes = ?, rating = ?
          WHERE id = ? AND user_id = ?`,
    args: [
      input.date,
      input.location,
      input.notes,
      input.rating,
      performanceId,
      userId,
    ],
  });
  await setPerformanceTags(userId, performanceId, input.tagIds ?? []);
}

async function setPerformanceTags(
  userId: number,
  performanceId: number,
  tagIds: number[]
): Promise<void> {
  await db.execute({
    sql: "DELETE FROM performance_tags WHERE performance_id = ?",
    args: [performanceId],
  });
  for (const tagId of tagIds) {
    await assertTagOwned(userId, tagId);
    await db.execute({
      sql: "INSERT INTO performance_tags (performance_id, tag_id) VALUES (?, ?)",
      args: [performanceId, tagId],
    });
  }
}

export async function deletePerformance(
  userId: number,
  performanceId: number
): Promise<void> {
  await assertPerformanceOwned(userId, performanceId);
  await db.execute({
    sql: "DELETE FROM performances WHERE id = ? AND user_id = ?",
    args: [performanceId, userId],
  });
}

export async function listTags(userId: number): Promise<unknown[]> {
  const result = await db.execute({
    sql: `SELECT t.id, t.name, COUNT(st.song_id) as count
          FROM tags t
          LEFT JOIN song_tags st ON t.id = st.tag_id
          WHERE t.user_id = ?
          GROUP BY t.id
          ORDER BY t.name ASC`,
    args: [userId],
  });
  return result.rows;
}

export async function listTagsSimple(userId: number): Promise<unknown[]> {
  const result = await db.execute({
    sql: "SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC",
    args: [userId],
  });
  return result.rows;
}

export async function createTag(userId: number, name: string): Promise<void> {
  try {
    await db.execute({
      sql: "INSERT INTO tags (user_id, name) VALUES (?, ?)",
      args: [userId, name.trim()],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE constraint failed")) {
      throw new RepertoireError("This tag already exists.", 409);
    }
    throw err;
  }
}

export async function deleteTag(userId: number, tagId: number): Promise<void> {
  await assertTagOwned(userId, tagId);
  await db.execute({
    sql: "DELETE FROM tags WHERE id = ? AND user_id = ?",
    args: [tagId, userId],
  });
}

export async function searchSongsByTags(
  userId: number,
  tagIds: number[],
  logic: "AND" | "OR"
): Promise<unknown[]> {
  if (tagIds.length === 0) return [];
  for (const id of tagIds) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new RepertoireError("Invalid tag id.");
    }
  }

  let sql = `SELECT DISTINCT s.id, s.track_name, s.artist_name, s.artwork_url, s.genre FROM songs s`;
  const args: (string | number)[] = [];
  const conditions: string[] = ["s.user_id = ?"];
  args.push(userId);

  if (logic === "OR") {
    sql += " JOIN song_tags st ON s.id = st.song_id";
    conditions.push(
      `st.tag_id IN (${tagIds.map(() => "?").join(",")})`
    );
    args.push(...tagIds);
  } else {
    for (let i = 0; i < tagIds.length; i++) {
      sql += ` JOIN song_tags st${i} ON s.id = st${i}.song_id`;
      conditions.push(`st${i}.tag_id = ?`);
      args.push(tagIds[i]);
    }
  }

  sql += ` WHERE ${conditions.join(" AND ")} ORDER BY s.track_name ASC`;
  const result = await db.execute({ sql, args });
  return result.rows;
}

export async function listLocations(
  userId: number,
  options?: { withTagIds?: boolean }
): Promise<unknown[]> {
  if (options?.withTagIds) {
    const result = await db.execute({
      sql: `SELECT l.id, l.name, group_concat(lt.tag_id) AS tag_ids
            FROM locations l
            LEFT JOIN location_tags lt ON lt.location_id = l.id
            WHERE l.user_id = ?
            GROUP BY l.id, l.name
            ORDER BY l.name ASC`,
      args: [userId],
    });
    return result.rows;
  }
  const result = await db.execute({
    sql: "SELECT * FROM locations WHERE user_id = ? ORDER BY name ASC",
    args: [userId],
  });
  return result.rows;
}

export async function createLocation(
  userId: number,
  name: string
): Promise<void> {
  await db.execute({
    sql: "INSERT INTO locations (user_id, name) VALUES (?, ?)",
    args: [userId, name.trim()],
  });
}

export async function deleteLocation(
  userId: number,
  locationId: number
): Promise<void> {
  await assertLocationOwned(userId, locationId);
  await db.execute({
    sql: "DELETE FROM locations WHERE id = ? AND user_id = ?",
    args: [locationId, userId],
  });
}

export async function listLocationTags(
  userId: number,
  locationId: number
): Promise<unknown[]> {
  await assertLocationOwned(userId, locationId);
  const result = await db.execute({
    sql: `SELECT t.* FROM tags t
          JOIN location_tags lt ON t.id = lt.tag_id
          JOIN locations l ON l.id = lt.location_id
          WHERE lt.location_id = ? AND l.user_id = ?`,
    args: [locationId, userId],
  });
  return result.rows;
}

export async function addLocationTag(
  userId: number,
  locationId: number,
  tagId: number
): Promise<void> {
  await assertLocationOwned(userId, locationId);
  await assertTagOwned(userId, tagId);
  await db.execute({
    sql: "INSERT OR IGNORE INTO location_tags (location_id, tag_id) VALUES (?, ?)",
    args: [locationId, tagId],
  });
}

export async function removeLocationTag(
  userId: number,
  locationId: number,
  tagId: number
): Promise<void> {
  await assertLocationOwned(userId, locationId);
  await db.execute({
    sql: "DELETE FROM location_tags WHERE location_id = ? AND tag_id = ?",
    args: [locationId, tagId],
  });
}

export async function getLocationStats(
  userId: number,
  locationName: string
): Promise<{
  daysSung: number;
  totalSongs: number;
  topSongs: { track_name: string; count: number }[];
}> {
  const [basic, top] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(DISTINCT date) as days, COUNT(*) as total
            FROM performances
            WHERE user_id = ? AND location = ?`,
      args: [userId, locationName],
    }),
    db.execute({
      sql: `SELECT s.track_name, COUNT(*) as count
            FROM performances p
            JOIN songs s ON p.song_id = s.id
            WHERE p.user_id = ? AND p.location = ?
            GROUP BY p.song_id
            ORDER BY count DESC
            LIMIT 3`,
      args: [userId, locationName],
    }),
  ]);
  const b = basic.rows[0] as { days?: number; total?: number };
  return {
    daysSung: Number(b.days) || 0,
    totalSongs: Number(b.total) || 0,
    topSongs: top.rows as { track_name: string; count: number }[],
  };
}

export async function listLocationPerformances(
  userId: number,
  locationName: string
): Promise<unknown[]> {
  const result = await db.execute({
    sql: `SELECT s.track_name AS track_name, p.date AS date
          FROM performances p
          JOIN songs s ON p.song_id = s.id
          WHERE p.user_id = ? AND p.location = ?
          ORDER BY p.date DESC, p.id DESC`,
    args: [userId, locationName],
  });
  return result.rows;
}

export async function getStatsDashboard(userId: number): Promise<{
  global: unknown;
  topArtists: unknown[];
  topSongs: unknown[];
  venues: unknown[];
  statusHistory: unknown[];
}> {
  const uid = userId;
  const [globalRes, artistRes, songRes, venueRes, historyRes] = await Promise.all([
    db.execute({
      sql: `SELECT
              (SELECT COUNT(*) FROM songs WHERE user_id = ?) as totalSongs,
              (SELECT COUNT(*) FROM performances WHERE user_id = ?) as totalPerformances,
              (SELECT AVG(rating) FROM performances WHERE user_id = ?) as avgRating,
              (SELECT COUNT(DISTINCT location) FROM performances WHERE user_id = ?) as uniqueVenues,
              (SELECT COUNT(*) FROM songs WHERE user_id = ? AND vocal_status = 'Mastered') as masteredCount,
              (SELECT COUNT(*) FROM songs WHERE user_id = ? AND vocal_status = 'Proficient') as proficientCount,
              (SELECT COUNT(*) FROM songs WHERE user_id = ? AND vocal_status = 'Practicing') as practicingCount`,
      args: [uid, uid, uid, uid, uid, uid, uid],
    }),
    db.execute({
      sql: `SELECT artist_name, COUNT(*) as count
            FROM performances p
            JOIN songs s ON p.song_id = s.id
            WHERE p.user_id = ?
            GROUP BY s.artist_name
            ORDER BY count DESC
            LIMIT 5`,
      args: [uid],
    }),
    db.execute({
      sql: `SELECT s.id, s.track_name, s.artist_name, s.artwork_url, COUNT(*) as count
            FROM performances p
            JOIN songs s ON p.song_id = s.id
            WHERE p.user_id = ?
            GROUP BY s.id
            ORDER BY count DESC
            LIMIT 5`,
      args: [uid],
    }),
    db.execute({
      sql: `SELECT location, COUNT(*) as count, AVG(rating) as avgRating
            FROM performances
            WHERE user_id = ? AND location != ''
            GROUP BY location
            ORDER BY count DESC
            LIMIT 5`,
      args: [uid],
    }),
    db.execute({
      sql: `SELECT h.song_id, h.status, h.changed_at
            FROM song_status_history h
            JOIN songs s ON h.song_id = s.id
            WHERE s.user_id = ?
            ORDER BY h.changed_at ASC`,
      args: [uid],
    }),
  ]);

  return {
    global: globalRes.rows[0],
    topArtists: artistRes.rows,
    topSongs: songRes.rows,
    venues: venueRes.rows,
    statusHistory: historyRes.rows,
  };
}

export async function listAllPerformances(userId: number): Promise<unknown[]> {
  const result = await db.execute({
    sql: `SELECT p.date, p.location, s.track_name, s.artist_name, p.rating
          FROM performances p
          JOIN songs s ON p.song_id = s.id
          WHERE p.user_id = ?
          ORDER BY p.date DESC, p.id DESC`,
    args: [userId],
  });
  return result.rows;
}

export async function listSongsByRating(userId: number): Promise<unknown[]> {
  const result = await db.execute({
    sql: `SELECT s.id, s.track_name, s.artist_name, s.artwork_url,
                 AVG(p.rating) AS avgRating, COUNT(*) AS perfCount
          FROM performances p
          JOIN songs s ON p.song_id = s.id
          WHERE p.user_id = ? AND p.rating IS NOT NULL
          GROUP BY s.id
          ORDER BY avgRating DESC, perfCount DESC, s.track_name ASC`,
    args: [userId],
  });
  return result.rows;
}

export function assertPortabilityTable(table: string): PortabilityTable {
  if (!PORTABILITY_TABLES.has(table)) {
    throw new RepertoireError("Invalid export table.");
  }
  return table as PortabilityTable;
}

export async function exportPortabilityTable(
  userId: number,
  table: PortabilityTable
): Promise<unknown[]> {
  const result = await db.execute({
    sql: `SELECT * FROM ${table} WHERE user_id = ?`,
    args: [userId],
  });
  return result.rows;
}

export async function importPortabilityRows(
  userId: number,
  table: PortabilityTable,
  rows: Record<string, unknown>[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const columns = Object.keys(rows[0]).filter(
    (col) => col !== "id" && col !== "user_id"
  );
  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT OR IGNORE INTO ${table} (user_id, ${columns.join(", ")}) VALUES (?, ${placeholders})`;

  for (const row of rows) {
    await db.execute({
      sql,
      args: [userId, ...columns.map((col) => row[col] as string | number | null)],
    });
  }
  return rows.length;
}

export async function wipeUserRepertoire(userId: number): Promise<void> {
  await db.batch([
    {
      sql: "DELETE FROM performance_tags WHERE performance_id IN (SELECT id FROM performances WHERE user_id = ?)",
      args: [userId],
    },
    {
      sql: "DELETE FROM song_tags WHERE song_id IN (SELECT id FROM songs WHERE user_id = ?)",
      args: [userId],
    },
    { sql: "DELETE FROM performances WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM songs WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM tags WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM locations WHERE user_id = ?", args: [userId] },
  ]);
}
