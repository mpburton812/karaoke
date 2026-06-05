import { db } from "./db.js";
import { wipeUserRepertoire } from "./repertoire.js";

export const BACKUP_VERSION = 1;

export interface UserBackupPayload {
  version: number;
  exportedAt: string;
  data: {
    tags: Record<string, unknown>[];
    locations: Record<string, unknown>[];
    songs: Record<string, unknown>[];
    performances: Record<string, unknown>[];
    song_tags: Record<string, unknown>[];
    performance_tags: Record<string, unknown>[];
    location_tags: Record<string, unknown>[];
    song_status_history: Record<string, unknown>[];
    spotify_synced_playlists: Record<string, unknown>[];
    spotify_playlist_songs: Record<string, unknown>[];
  };
}

export class PortabilityError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "PortabilityError";
  }
}

function emptyData(): UserBackupPayload["data"] {
  return {
    tags: [],
    locations: [],
    songs: [],
    performances: [],
    song_tags: [],
    performance_tags: [],
    location_tags: [],
    song_status_history: [],
    spotify_synced_playlists: [],
    spotify_playlist_songs: [],
  };
}

export async function exportUserBackup(userId: number): Promise<UserBackupPayload> {
  const [
    tags,
    locations,
    songs,
    performances,
    songTags,
    performanceTags,
    locationTags,
    statusHistory,
    spotifyPlaylists,
    spotifyPlaylistSongs,
  ] = await Promise.all([
    db.execute({
      sql: "SELECT * FROM tags WHERE user_id = ? ORDER BY id",
      args: [userId],
    }),
    db.execute({
      sql: "SELECT * FROM locations WHERE user_id = ? ORDER BY id",
      args: [userId],
    }),
    db.execute({
      sql: "SELECT * FROM songs WHERE user_id = ? ORDER BY id",
      args: [userId],
    }),
    db.execute({
      sql: "SELECT * FROM performances WHERE user_id = ? ORDER BY id",
      args: [userId],
    }),
    db.execute({
      sql: `SELECT st.song_id, st.tag_id FROM song_tags st
            INNER JOIN songs s ON s.id = st.song_id
            WHERE s.user_id = ?`,
      args: [userId],
    }),
    db.execute({
      sql: `SELECT pt.performance_id, pt.tag_id FROM performance_tags pt
            INNER JOIN performances p ON p.id = pt.performance_id
            WHERE p.user_id = ?`,
      args: [userId],
    }),
    db.execute({
      sql: `SELECT lt.location_id, lt.tag_id FROM location_tags lt
            INNER JOIN locations l ON l.id = lt.location_id
            WHERE l.user_id = ?`,
      args: [userId],
    }),
    db.execute({
      sql: `SELECT h.id, h.song_id, h.status, h.changed_at FROM song_status_history h
            INNER JOIN songs s ON s.id = h.song_id
            WHERE s.user_id = ?
            ORDER BY h.id`,
      args: [userId],
    }),
    db.execute({
      sql: "SELECT * FROM spotify_synced_playlists WHERE user_id = ?",
      args: [userId],
    }),
    db.execute({
      sql: "SELECT * FROM spotify_playlist_songs WHERE user_id = ?",
      args: [userId],
    }),
  ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      tags: tags.rows as Record<string, unknown>[],
      locations: locations.rows as Record<string, unknown>[],
      songs: songs.rows as Record<string, unknown>[],
      performances: performances.rows as Record<string, unknown>[],
      song_tags: songTags.rows as Record<string, unknown>[],
      performance_tags: performanceTags.rows as Record<string, unknown>[],
      location_tags: locationTags.rows as Record<string, unknown>[],
      song_status_history: statusHistory.rows as Record<string, unknown>[],
      spotify_synced_playlists: spotifyPlaylists.rows as Record<string, unknown>[],
      spotify_playlist_songs: spotifyPlaylistSongs.rows as Record<string, unknown>[],
    },
  };
}

function parseBackupPayload(raw: unknown): UserBackupPayload {
  if (!raw || typeof raw !== "object") {
    throw new PortabilityError("Backup must be a JSON object.");
  }
  const body = raw as UserBackupPayload;
  if (body.version !== BACKUP_VERSION) {
    throw new PortabilityError(
      `Unsupported backup version (expected ${BACKUP_VERSION}).`
    );
  }
  if (!body.data || typeof body.data !== "object") {
    throw new PortabilityError("Backup is missing a data section.");
  }
  const data = body.data;
  const keys = [
    "tags",
    "locations",
    "songs",
    "performances",
    "song_tags",
    "performance_tags",
    "location_tags",
    "song_status_history",
    "spotify_synced_playlists",
    "spotify_playlist_songs",
  ] as const;
  for (const key of keys) {
    const section = data[key];
    if (section !== undefined && !Array.isArray(section)) {
      throw new PortabilityError(`Backup data.${key} must be an array.`);
    }
  }
  return {
    version: BACKUP_VERSION,
    exportedAt:
      typeof body.exportedAt === "string" ? body.exportedAt : "",
    data: {
      ...emptyData(),
      ...Object.fromEntries(
        keys.map((k) => [k, Array.isArray(data[k]) ? data[k]! : []])
      ),
    } as UserBackupPayload["data"],
  };
}

function insertWithId(
  table: string,
  userId: number,
  rows: Record<string, unknown>[],
  options: { includeUserId?: boolean } = {}
): { sql: string; args: unknown[] }[] {
  const statements: { sql: string; args: unknown[] }[] = [];
  for (const row of rows) {
    const cols: string[] = [];
    const vals: unknown[] = [];
    if (row.id != null && row.id !== "") {
      cols.push("id");
      vals.push(row.id);
    }
    if (options.includeUserId !== false) {
      cols.push("user_id");
      vals.push(userId);
    }
    for (const [key, value] of Object.entries(row)) {
      if (key === "id" || key === "user_id") continue;
      cols.push(key);
      vals.push(value ?? null);
    }
    if (cols.length === 0) continue;
    const placeholders = cols.map(() => "?").join(", ");
    statements.push({
      sql: `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
      args: vals,
    });
  }
  return statements;
}

function insertJunction(
  table: string,
  rows: Record<string, unknown>[],
  columns: [string, string]
): { sql: string; args: unknown[] }[] {
  const [a, b] = columns;
  return rows
    .filter((r) => r[a] != null && r[b] != null)
    .map((r) => ({
      sql: `INSERT OR IGNORE INTO ${table} (${a}, ${b}) VALUES (?, ?)`,
      args: [r[a], r[b]],
    }));
}

export async function importUserBackup(
  userId: number,
  raw: unknown
): Promise<{
  imported: Record<string, number>;
}> {
  const backup = parseBackupPayload(raw);
  const { data } = backup;

  await wipeUserRepertoire(userId);

  const statements: { sql: string; args: unknown[] }[] = [
    ...insertWithId("tags", userId, data.tags),
    ...insertWithId("locations", userId, data.locations),
    ...insertWithId("songs", userId, data.songs),
    ...data.song_status_history.map((row) => {
      const cols: string[] = [];
      const vals: unknown[] = [];
      if (row.id != null) {
        cols.push("id");
        vals.push(row.id);
      }
      for (const key of ["song_id", "status", "changed_at"] as const) {
        if (row[key] !== undefined) {
          cols.push(key);
          vals.push(row[key] ?? null);
        }
      }
      return {
        sql: `INSERT OR REPLACE INTO song_status_history (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
        args: vals,
      };
    }),
    ...insertWithId("performances", userId, data.performances),
    ...insertJunction("song_tags", data.song_tags, ["song_id", "tag_id"]),
    ...insertJunction("location_tags", data.location_tags, [
      "location_id",
      "tag_id",
    ]),
    ...insertJunction("performance_tags", data.performance_tags, [
      "performance_id",
      "tag_id",
    ]),
    ...insertWithId("spotify_synced_playlists", userId, data.spotify_synced_playlists, {
      includeUserId: true,
    }),
    ...insertWithId("spotify_playlist_songs", userId, data.spotify_playlist_songs, {
      includeUserId: true,
    }),
  ];

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return {
    imported: {
      tags: data.tags.length,
      locations: data.locations.length,
      songs: data.songs.length,
      performances: data.performances.length,
      song_tags: data.song_tags.length,
      performance_tags: data.performance_tags.length,
      location_tags: data.location_tags.length,
      song_status_history: data.song_status_history.length,
      spotify_synced_playlists: data.spotify_synced_playlists.length,
      spotify_playlist_songs: data.spotify_playlist_songs.length,
    },
  };
}
