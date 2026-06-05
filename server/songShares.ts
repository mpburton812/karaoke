import { db } from "./db.js";
import { findDuplicateSong, getSong } from "./repertoire.js";

export class SongShareError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "SongShareError";
  }
}

export type SongShareStatus =
  | "pending"
  | "opened"
  | "saved"
  | "discarded"
  | "duplicate";

export interface SongSnapshot {
  track_name: string;
  artist_name: string;
  artwork_url: string | null;
  itunes_id: number | null;
  spotify_track_id: string | null;
  karafun_available: number | null;
  key: string | null;
  bpm: number | null;
  duration_ms: number | null;
  popularity: number | null;
  energy: number | null;
  danceability: number | null;
  happiness: number | null;
  acousticness: number | null;
  instrumentalness: number | null;
  liveness: number | null;
  speechiness: number | null;
  loudness: number | null;
  release_date: string | null;
  explicit: number | null;
  album: string | null;
  genre: string | null;
  release_year: number | null;
  lyrics: string | null;
}

const MAX_MESSAGE_LEN = 255;

function trimMessage(raw: unknown, field: string): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s.length > MAX_MESSAGE_LEN) {
    throw new SongShareError(`${field} must be at most ${MAX_MESSAGE_LEN} characters.`);
  }
  return s;
}

function rowToSnapshot(row: Record<string, unknown>): SongSnapshot {
  const num = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    track_name: String(row.track_name ?? ""),
    artist_name: String(row.artist_name ?? ""),
    artwork_url: row.artwork_url != null ? String(row.artwork_url) : null,
    itunes_id: num(row.itunes_id),
    spotify_track_id:
      row.spotify_track_id != null ? String(row.spotify_track_id) : null,
    karafun_available: num(row.karafun_available),
    key: row.key != null ? String(row.key) : null,
    bpm: num(row.bpm),
    duration_ms: num(row.duration_ms),
    popularity: num(row.popularity),
    energy: num(row.energy),
    danceability: num(row.danceability),
    happiness: num(row.happiness),
    acousticness: num(row.acousticness),
    instrumentalness: num(row.instrumentalness),
    liveness: num(row.liveness),
    speechiness: num(row.speechiness),
    loudness: num(row.loudness),
    release_date: row.release_date != null ? String(row.release_date) : null,
    explicit: num(row.explicit),
    album: row.album != null ? String(row.album) : null,
    genre: row.genre != null ? String(row.genre) : null,
    release_year: num(row.release_year),
    lyrics: row.lyrics != null ? String(row.lyrics) : null,
  };
}

export async function listUserDirectory(
  userId: number
): Promise<{ id: number; username: string }[]> {
  const result = await db.execute({
    sql: `SELECT id, username FROM users WHERE id != ? ORDER BY username ASC`,
    args: [userId],
  });
  return result.rows as { id: number; username: string }[];
}

export async function getNotificationsEnabled(userId: number): Promise<boolean> {
  const result = await db.execute({
    sql: `SELECT COALESCE(notifications_enabled, 1) AS notifications_enabled FROM users WHERE id = ?`,
    args: [userId],
  });
  const row = result.rows[0] as { notifications_enabled?: number } | undefined;
  return Number(row?.notifications_enabled ?? 1) !== 0;
}

export async function setNotificationsEnabled(
  userId: number,
  enabled: boolean
): Promise<void> {
  await db.execute({
    sql: `UPDATE users SET notifications_enabled = ? WHERE id = ?`,
    args: [enabled ? 1 : 0, userId],
  });
}

export async function getShareStats(
  userId: number
): Promise<{ sent: number; received: number }> {
  const result = await db.execute({
    sql: `SELECT
            (SELECT COUNT(*) FROM song_shares WHERE sender_user_id = ?) AS sent,
            (SELECT COUNT(*) FROM song_shares WHERE recipient_user_id = ?) AS received`,
    args: [userId, userId],
  });
  const row = result.rows[0] as { sent?: number; received?: number } | undefined;
  return {
    sent: Number(row?.sent ?? 0),
    received: Number(row?.received ?? 0),
  };
}

type ShareRow = Record<string, unknown>;

function mapShareRow(row: ShareRow): Record<string, unknown> {
  let snapshot: SongSnapshot | null = null;
  try {
    snapshot = JSON.parse(String(row.song_snapshot ?? "{}")) as SongSnapshot;
  } catch {
    snapshot = null;
  }
  return {
    id: row.id,
    senderUserId: row.sender_user_id,
    recipientUserId: row.recipient_user_id,
    senderSongId: row.sender_song_id,
    senderUsername: row.sender_username,
    recipientUsername: row.recipient_username,
    sendMessage: row.send_message,
    responseMessage: row.response_message,
    status: row.status,
    songSnapshot: snapshot,
    introAckAt: row.intro_ack_at,
    previewResolvedAt: row.preview_resolved_at,
    respondedAt: row.responded_at,
    senderReplyAckAt: row.sender_reply_ack_at,
    createdAt: row.created_at,
  };
}

async function getShareRow(
  shareId: number,
  userId: number
): Promise<ShareRow | null> {
  const result = await db.execute({
    sql: `SELECT sh.*,
                 su.username AS sender_username,
                 ru.username AS recipient_username
          FROM song_shares sh
          JOIN users su ON su.id = sh.sender_user_id
          JOIN users ru ON ru.id = sh.recipient_user_id
          WHERE sh.id = ?
            AND (sh.sender_user_id = ? OR sh.recipient_user_id = ?)`,
    args: [shareId, userId, userId],
  });
  return (result.rows[0] as ShareRow | undefined) ?? null;
}

export async function createSongShare(
  senderUserId: number,
  input: { recipientUserId: number; songId: number; message: string }
): Promise<{ id: number }> {
  const message = trimMessage(input.message, "message");
  const recipientUserId = input.recipientUserId;
  if (!Number.isInteger(recipientUserId) || recipientUserId <= 0) {
    throw new SongShareError("Invalid recipient.");
  }
  if (recipientUserId === senderUserId) {
    throw new SongShareError("You cannot share a song with yourself.");
  }

  const recipientCheck = await db.execute({
    sql: "SELECT id FROM users WHERE id = ?",
    args: [recipientUserId],
  });
  if (recipientCheck.rows.length === 0) {
    throw new SongShareError("Recipient not found.", 404);
  }

  const song = await getSong(senderUserId, input.songId);
  if (!song) {
    throw new SongShareError("Song not found.", 404);
  }

  const snapshot = rowToSnapshot(song as Record<string, unknown>);
  if (!snapshot.track_name.trim() || !snapshot.artist_name.trim()) {
    throw new SongShareError("Song is missing title or artist.");
  }

  const result = await db.execute({
    sql: `INSERT INTO song_shares (
            sender_user_id, recipient_user_id, sender_song_id,
            song_snapshot, send_message, status
          ) VALUES (?, ?, ?, ?, ?, 'pending')
          RETURNING id`,
    args: [
      senderUserId,
      recipientUserId,
      input.songId,
      JSON.stringify(snapshot),
      message,
    ],
  });
  const id = (result.rows[0] as { id?: number } | undefined)?.id;
  if (typeof id !== "number") {
    throw new SongShareError("Failed to create share.", 500);
  }
  return { id };
}

export async function listInboxShares(userId: number): Promise<unknown[]> {
  const result = await db.execute({
    sql: `SELECT sh.*, su.username AS sender_username, ru.username AS recipient_username
          FROM song_shares sh
          JOIN users su ON su.id = sh.sender_user_id
          JOIN users ru ON ru.id = sh.recipient_user_id
          WHERE sh.recipient_user_id = ?
          ORDER BY sh.created_at DESC`,
    args: [userId],
  });
  return result.rows.map((r) => mapShareRow(r as ShareRow));
}

export async function listOutboxShares(userId: number): Promise<unknown[]> {
  const result = await db.execute({
    sql: `SELECT sh.*, su.username AS sender_username, ru.username AS recipient_username
          FROM song_shares sh
          JOIN users su ON su.id = sh.sender_user_id
          JOIN users ru ON ru.id = sh.recipient_user_id
          WHERE sh.sender_user_id = ?
          ORDER BY sh.created_at DESC`,
    args: [userId],
  });
  return result.rows.map((r) => mapShareRow(r as ShareRow));
}

export async function listIncomingShareNotifications(
  userId: number
): Promise<unknown[]> {
  const enabled = await getNotificationsEnabled(userId);
  if (!enabled) return [];

  const result = await db.execute({
    sql: `SELECT sh.*, su.username AS sender_username, ru.username AS recipient_username
          FROM song_shares sh
          JOIN users su ON su.id = sh.sender_user_id
          JOIN users ru ON ru.id = sh.recipient_user_id
          WHERE sh.recipient_user_id = ?
            AND sh.intro_ack_at IS NULL
            AND sh.status = 'pending'
          ORDER BY sh.created_at ASC`,
    args: [userId],
  });
  return result.rows.map((r) => mapShareRow(r as ShareRow));
}

export async function listPendingShareResponses(
  userId: number
): Promise<unknown[]> {
  const result = await db.execute({
    sql: `SELECT sh.*, su.username AS sender_username, ru.username AS recipient_username
          FROM song_shares sh
          JOIN users su ON su.id = sh.sender_user_id
          JOIN users ru ON ru.id = sh.recipient_user_id
          WHERE sh.recipient_user_id = ?
            AND sh.preview_resolved_at IS NOT NULL
            AND sh.responded_at IS NULL
          ORDER BY sh.preview_resolved_at ASC`,
    args: [userId],
  });
  return result.rows.map((r) => mapShareRow(r as ShareRow));
}

export async function listSenderReplyNotifications(
  userId: number
): Promise<unknown[]> {
  const enabled = await getNotificationsEnabled(userId);
  if (!enabled) return [];

  const result = await db.execute({
    sql: `SELECT sh.*, su.username AS sender_username, ru.username AS recipient_username
          FROM song_shares sh
          JOIN users su ON su.id = sh.sender_user_id
          JOIN users ru ON ru.id = sh.recipient_user_id
          WHERE sh.sender_user_id = ?
            AND sh.response_message IS NOT NULL
            AND sh.sender_reply_ack_at IS NULL
          ORDER BY sh.responded_at ASC`,
    args: [userId],
  });
  return result.rows.map((r) => mapShareRow(r as ShareRow));
}

export async function getSongShare(
  userId: number,
  shareId: number
): Promise<unknown | null> {
  const row = await getShareRow(shareId, userId);
  return row ? mapShareRow(row) : null;
}

export async function ackShareIntro(
  userId: number,
  shareId: number
): Promise<void> {
  const row = await getShareRow(shareId, userId);
  if (!row || row.recipient_user_id !== userId) {
    throw new SongShareError("Share not found.", 404);
  }
  await db.execute({
    sql: `UPDATE song_shares SET intro_ack_at = datetime('now'),
          status = CASE WHEN status = 'pending' THEN 'opened' ELSE status END
          WHERE id = ?`,
    args: [shareId],
  });
}

export async function openSongShare(
  userId: number,
  shareId: number
): Promise<unknown> {
  const row = await getShareRow(shareId, userId);
  if (!row || row.recipient_user_id !== userId) {
    throw new SongShareError("Share not found.", 404);
  }
  await db.execute({
    sql: `UPDATE song_shares SET status = 'opened', intro_ack_at = COALESCE(intro_ack_at, datetime('now'))
          WHERE id = ?`,
    args: [shareId],
  });
  const updated = await getShareRow(shareId, userId);
  return mapShareRow(updated!);
}

async function insertSongFromSnapshot(
  userId: number,
  snapshot: SongSnapshot
): Promise<number> {
  const result = await db.execute({
    sql: `INSERT INTO songs (
            user_id, itunes_id, spotify_track_id, track_name, artist_name, artwork_url,
            karafun_available, key, bpm, duration_ms, popularity, energy, danceability,
            happiness, acousticness, instrumentalness, liveness, speechiness, loudness,
            release_date, explicit, album, genre, release_year, lyrics,
            personal_key, vocal_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '0', 'Practicing')
          RETURNING id`,
    args: [
      userId,
      snapshot.itunes_id,
      snapshot.spotify_track_id,
      snapshot.track_name,
      snapshot.artist_name,
      snapshot.artwork_url,
      snapshot.karafun_available,
      snapshot.key ?? "DNF",
      snapshot.bpm,
      snapshot.duration_ms,
      snapshot.popularity,
      snapshot.energy,
      snapshot.danceability,
      snapshot.happiness,
      snapshot.acousticness,
      snapshot.instrumentalness,
      snapshot.liveness,
      snapshot.speechiness,
      snapshot.loudness,
      snapshot.release_date,
      snapshot.explicit,
      snapshot.album,
      snapshot.genre,
      snapshot.release_year,
      snapshot.lyrics,
    ],
  });
  const id = (result.rows[0] as { id?: number } | undefined)?.id;
  if (typeof id !== "number") {
    throw new SongShareError("Failed to save song.", 500);
  }
  await db.execute({
    sql: "INSERT INTO song_status_history (song_id, status) VALUES (?, 'Practicing')",
    args: [id],
  });
  return id;
}

export async function acceptSongShare(
  userId: number,
  shareId: number
): Promise<{ savedSongId: number }> {
  const row = await getShareRow(shareId, userId);
  if (!row || row.recipient_user_id !== userId) {
    throw new SongShareError("Share not found.", 404);
  }
  const status = String(row.status);
  if (["saved", "discarded", "duplicate"].includes(status)) {
    throw new SongShareError("This share was already resolved.");
  }

  let snapshot: SongSnapshot;
  try {
    snapshot = JSON.parse(String(row.song_snapshot)) as SongSnapshot;
  } catch {
    throw new SongShareError("Invalid song snapshot.", 500);
  }

  const duplicate = await findDuplicateSong(userId, {
    itunesId: snapshot.itunes_id ?? 0,
    trackName: snapshot.track_name,
    artistName: snapshot.artist_name,
  });
  if (duplicate) {
    await db.execute({
      sql: `UPDATE song_shares SET status = 'duplicate', preview_resolved_at = datetime('now')
            WHERE id = ?`,
      args: [shareId],
    });
    throw new SongShareError(
      "This song is already in your repertoire. Nothing was changed.",
      409
    );
  }

  const savedSongId = await insertSongFromSnapshot(userId, snapshot);
  await db.execute({
    sql: `UPDATE song_shares SET status = 'saved', preview_resolved_at = datetime('now')
          WHERE id = ?`,
    args: [shareId],
  });
  return { savedSongId };
}

export async function discardSongShare(
  userId: number,
  shareId: number
): Promise<void> {
  const row = await getShareRow(shareId, userId);
  if (!row || row.recipient_user_id !== userId) {
    throw new SongShareError("Share not found.", 404);
  }
  const status = String(row.status);
  if (["saved", "discarded", "duplicate"].includes(status)) {
    throw new SongShareError("This share was already resolved.");
  }
  await db.execute({
    sql: `UPDATE song_shares SET status = 'discarded', preview_resolved_at = datetime('now')
          WHERE id = ?`,
    args: [shareId],
  });
}

export async function respondToSongShare(
  userId: number,
  shareId: number,
  message: string
): Promise<void> {
  const responseMessage = trimMessage(message, "message");
  const row = await getShareRow(shareId, userId);
  if (!row || row.recipient_user_id !== userId) {
    throw new SongShareError("Share not found.", 404);
  }
  if (!row.preview_resolved_at) {
    throw new SongShareError("Save or close the song before sending a response.");
  }
  if (row.responded_at) {
    throw new SongShareError("You already sent a response for this share.");
  }
  await db.execute({
    sql: `UPDATE song_shares SET response_message = ?, responded_at = datetime('now')
          WHERE id = ?`,
    args: [responseMessage, shareId],
  });
}

export async function ackSenderReply(
  userId: number,
  shareId: number
): Promise<void> {
  const row = await getShareRow(shareId, userId);
  if (!row || row.sender_user_id !== userId) {
    throw new SongShareError("Share not found.", 404);
  }
  await db.execute({
    sql: `UPDATE song_shares SET sender_reply_ack_at = datetime('now') WHERE id = ?`,
    args: [shareId],
  });
}
