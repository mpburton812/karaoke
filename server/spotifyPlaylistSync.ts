import { db } from "./db.js";
import {
  fetchSpotifyCurrentUser,
  getSpotifyAccessTokenForUser,
} from "./spotifyAuth.js";

/** Extract Spotify playlist id from URL or raw id. */
export function parseSpotifyPlaylistId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const uri = /^spotify:playlist:([a-zA-Z0-9]+)$/.exec(s);
  if (uri) return uri[1];
  const web = /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/.exec(s);
  if (web) return web[1];
  if (/^[a-zA-Z0-9]{16,32}$/.test(s)) return s;
  return null;
}

function coercePositiveInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.floor(v);
  if (typeof v === "string" && /^\d+$/.test(v)) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

/**
 * Track count on "Get current user's playlists" items. Spotify moved the ref
 * from deprecated `tracks` to `items` (object with href + total — not an array).
 */
export function readSimplifiedPlaylistTrackTotal(playlist: {
  tracks?: { total?: unknown };
  items?: unknown;
}): number {
  const itemsRef = playlist.items;
  if (
    itemsRef &&
    typeof itemsRef === "object" &&
    !Array.isArray(itemsRef) &&
    "total" in itemsRef
  ) {
    const n = coercePositiveInt((itemsRef as { total?: unknown }).total);
    if (n !== null) return n;
  }
  const fromTracks = coercePositiveInt(playlist.tracks?.total);
  return fromTracks ?? 0;
}

function spotifyApiErrorMessage(data: Record<string, unknown>, status: number): string {
  const err = data.error;
  if (typeof err === "string") {
    return err.trim() ? `${err.trim()} (Spotify HTTP ${status})` : `Spotify HTTP ${status}`;
  }
  if (err && typeof err === "object" && "message" in err) {
    const o = err as { message?: string; reason?: string };
    const m = typeof o.message === "string" ? o.message.trim() : "";
    const r = typeof o.reason === "string" ? o.reason.trim() : "";
    if (m && r) return `${m} (${r}) — Spotify HTTP ${status}`;
    if (m) return `${m} — Spotify HTTP ${status}`;
  }
  return `Spotify HTTP ${status}`;
}

/** Best-effort: Spotify GET …/playlists/{id}/items only returns tracks for owned or collaborative playlists. */
export function playlistAllowsTrackImport(
  yourSpotifyUserId: string,
  ownerSpotifyId: string | undefined,
  collaborative: boolean
): boolean {
  if (!yourSpotifyUserId) return false;
  if (ownerSpotifyId && ownerSpotifyId === yourSpotifyUserId) return true;
  if (collaborative) return true;
  return false;
}

async function spotifyGet<T>(
  accessToken: string,
  url: string
): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const base = spotifyApiErrorMessage(data, res.status);
    if (res.status === 403) {
      throw new Error(
        `${base}. Spotify only returns tracks for playlists you own or collaborate on. Lists you only follow cannot be imported—duplicate the playlist to your library in Spotify, or pick one you created. If your app is in Development mode, add your Spotify account email under developer.spotify.com → your app → User management.`
      );
    }
    throw new Error(base);
  }
  return data as T;
}

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  tracksTotal: number;
  /** False when Spotify will reject GET …/playlists/{id}/items (follow-only lists). */
  canImportTracks: boolean;
}

export async function listSpotifyPlaylists(
  userId: number
): Promise<SpotifyPlaylistSummary[]> {
  const access = await getSpotifyAccessTokenForUser(userId);
  const { id: meSpotifyId } = await fetchSpotifyCurrentUser(access);
  const out: SpotifyPlaylistSummary[] = [];
  const limit = 50;
  let offset = 0;
  // Do not follow `page.next` for this endpoint: Spotify has returned `next`
  // URLs that hit deprecated paths and respond with 403 Forbidden.

  for (;;) {
    const url = `https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`;
    const page = await spotifyGet<{
      items: Array<{
        id: string;
        name: string;
        collaborative?: boolean;
        owner?: { id?: string };
        tracks?: { total?: unknown };
        /** Track count ref (Spotify); not the paging `items` array */
        items?: unknown;
      }>;
    }>(access, url);

    const items = page.items ?? [];
    for (const p of items) {
      const ownerId = typeof p.owner?.id === "string" ? p.owner.id : undefined;
      const collaborative = Boolean(p.collaborative);
      const canImportTracks = playlistAllowsTrackImport(
        meSpotifyId,
        ownerId,
        collaborative
      );
      out.push({
        id: p.id,
        name: p.name,
        tracksTotal: readSimplifiedPlaylistTrackTotal(p),
        canImportTracks,
      });
    }
    if (items.length === 0 || items.length < limit) {
      break;
    }
    offset += limit;
  }
  return out;
}

interface SpotifyTrackLite {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: {
    name?: string;
    images?: Array<{ url: string; height?: number }>;
    release_date?: string;
  };
  duration_ms: number;
  explicit?: boolean;
  popularity?: number;
}

interface PlaylistTrackItem {
  /** Legacy field; Spotify docs deprecate in favor of `item`. */
  track?: SpotifyTrackLite | null;
  item?: SpotifyTrackLite | null;
}

function artistNames(track: SpotifyTrackLite): string {
  const names = (track.artists ?? []).map((a) => a.name).filter(Boolean);
  return names.join(", ") || "Unknown";
}

function pickArtwork(track: SpotifyTrackLite): string | null {
  const imgs = track.album?.images ?? [];
  if (imgs.length === 0) return null;
  const sorted = [...imgs].sort(
    (a, b) => (b.height ?? 0) - (a.height ?? 0)
  );
  return sorted[0]?.url ?? null;
}

function releaseYear(track: SpotifyTrackLite): number | null {
  const d = track.album?.release_date;
  if (!d) return null;
  const y = parseInt(d.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

export async function getSyncedPlaylistsForUser(userId: number): Promise<
  Array<{
    spotifyPlaylistId: string;
    playlistName: string | null;
    lastSyncedAt: string | null;
    snapshotId: string | null;
  }>
> {
  const r = await db.execute({
    sql: `SELECT spotify_playlist_id, playlist_name, last_synced_at, snapshot_id
          FROM spotify_synced_playlists WHERE user_id = ? ORDER BY last_synced_at DESC`,
    args: [userId],
  });
  return r.rows.map((row) => {
    const o = row as {
      spotify_playlist_id: string;
      playlist_name: string | null;
      last_synced_at: string | null;
      snapshot_id: string | null;
    };
    return {
      spotifyPlaylistId: o.spotify_playlist_id,
      playlistName: o.playlist_name,
      lastSyncedAt: o.last_synced_at,
      snapshotId: o.snapshot_id,
    };
  });
}

export async function syncSpotifyPlaylist(
  userId: number,
  playlistIdRaw: string
): Promise<{
  added: number;
  removed: number;
  unlinked: number;
  skipped: number;
  linkedExisting: number;
  duplicateSongs: Array<{ trackName: string; artistName: string }>;
  playlistName: string;
  snapshotId: string;
  addedSongIds: number[];
  unchanged?: boolean;
}> {
  const playlistId = parseSpotifyPlaylistId(playlistIdRaw);
  if (!playlistId) {
    throw new Error("Invalid Spotify playlist URL or id.");
  }

  const access = await getSpotifyAccessTokenForUser(userId);

  const meta = await spotifyGet<{
    id: string;
    name: string;
    snapshot_id: string;
  }>(
    access,
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}?fields=id,name,snapshot_id&market=from_token`
  );

  const prev = await db.execute({
    sql: `SELECT snapshot_id FROM spotify_synced_playlists WHERE user_id = ? AND spotify_playlist_id = ?`,
    args: [userId, playlistId],
  });
  const prevRow = prev.rows[0] as { snapshot_id: string | null } | undefined;
  if (prevRow?.snapshot_id === meta.snapshot_id) {
    await db.execute({
      sql: `INSERT INTO spotify_synced_playlists (user_id, spotify_playlist_id, playlist_name, snapshot_id, last_synced_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(user_id, spotify_playlist_id) DO UPDATE SET
              playlist_name = excluded.playlist_name,
              last_synced_at = excluded.last_synced_at`,
      args: [userId, playlistId, meta.name, meta.snapshot_id],
    });
    return {
      added: 0,
      removed: 0,
      unlinked: 0,
      skipped: 0,
      linkedExisting: 0,
      duplicateSongs: [],
      playlistName: meta.name,
      snapshotId: meta.snapshot_id,
      addedSongIds: [],
      unchanged: true,
    };
  }

  const trackMap = new Map<string, SpotifyTrackLite>();
  const limit = 50;
  let offset = 0;
  // Use /playlists/{id}/items — /tracks was removed Feb 2026 (403 on deprecated path).
  for (;;) {
    const url =
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items` +
      `?limit=${limit}&offset=${offset}&market=from_token&additional_types=track`;
    const page = await spotifyGet<{
      items: PlaylistTrackItem[];
    }>(access, url);

    const items = page.items ?? [];
    for (const item of items) {
      const tr = item.track ?? item.item;
      if (!tr?.id) continue;
      trackMap.set(tr.id, tr);
    }
    if (items.length === 0 || items.length < limit) {
      break;
    }
    offset += limit;
  }

  await db.execute({
    sql: `INSERT INTO spotify_synced_playlists (user_id, spotify_playlist_id, playlist_name, snapshot_id, last_synced_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id, spotify_playlist_id) DO UPDATE SET
            playlist_name = excluded.playlist_name,
            snapshot_id = excluded.snapshot_id,
            last_synced_at = excluded.last_synced_at`,
    args: [userId, playlistId, meta.name, meta.snapshot_id],
  });

  const existing = await db.execute({
    sql: `SELECT song_id, spotify_track_id FROM spotify_playlist_songs
          WHERE user_id = ? AND spotify_playlist_id = ? AND spotify_track_id IS NOT NULL`,
    args: [userId, playlistId],
  });

  const existingByTrack = new Map<string, number>();
  for (const row of existing.rows) {
    const o = row as { song_id: number; spotify_track_id: string };
    existingByTrack.set(o.spotify_track_id, o.song_id);
  }

  let removed = 0;
  let unlinked = 0;
  const toRemove: number[] = [];
  for (const [tid, songId] of existingByTrack) {
    if (!trackMap.has(tid)) {
      toRemove.push(songId);
    }
  }

  const chunk = 40;
  for (let i = 0; i < toRemove.length; i += chunk) {
    const slice = toRemove.slice(i, i + chunk);
    if (slice.length === 0) continue;
    const placeholders = slice.map(() => "?").join(",");
    await db.execute({
      sql: `DELETE FROM spotify_playlist_songs
            WHERE user_id = ? AND spotify_playlist_id = ? AND song_id IN (${placeholders})`,
      args: [userId, playlistId, ...slice],
    });
    unlinked += slice.length;

    const orphaned = await db.execute({
      sql: `SELECT COUNT(*) AS c FROM songs s
            WHERE s.user_id = ? AND s.id IN (${placeholders})
              AND s.spotify_track_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM spotify_playlist_songs ps
                WHERE ps.user_id = s.user_id AND ps.song_id = s.id
              )`,
      args: [userId, ...slice],
    });
    const deleteCount = Number(
      (orphaned.rows[0] as { c?: unknown } | undefined)?.c ?? 0
    );
    if (deleteCount > 0) {
      await db.execute({
        sql: `DELETE FROM songs
              WHERE user_id = ? AND id IN (${placeholders})
                AND spotify_track_id IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1 FROM spotify_playlist_songs ps
                  WHERE ps.user_id = songs.user_id AND ps.song_id = songs.id
                )`,
        args: [userId, ...slice],
      });
    }
    removed += deleteCount;
  }

  let added = 0;
  let skipped = 0;
  let linkedExisting = 0;
  const addedSongIds: number[] = [];
  const duplicateSongs: Array<{ trackName: string; artistName: string }> = [];
  for (const [trackId, tr] of trackMap) {
    if (existingByTrack.has(trackId)) {
      skipped += 1;
      continue;
    }

    const artistName = artistNames(tr);
    const duplicate = await db.execute({
      sql: `SELECT id, track_name, artist_name FROM songs
            WHERE user_id = ?
              AND (
                spotify_track_id = ?
                OR (
                  lower(trim(track_name)) = lower(trim(?))
                  AND lower(trim(artist_name)) = lower(trim(?))
                )
              )
            LIMIT 1`,
      args: [userId, trackId, tr.name, artistName],
    });
    const duplicateRow = duplicate.rows[0] as
      | { id: number; track_name: string; artist_name: string }
      | undefined;
    if (duplicateRow) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO spotify_playlist_songs (
                user_id, spotify_playlist_id, song_id, spotify_track_id, track_name, artist_name
              ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          userId,
          playlistId,
          duplicateRow.id,
          trackId,
          tr.name,
          artistName,
        ],
      });
      linkedExisting += 1;
      duplicateSongs.push({
        trackName: duplicateRow.track_name,
        artistName: duplicateRow.artist_name,
      });
      continue;
    }

    const artwork = pickArtwork(tr);
    const year = releaseYear(tr);
    const ins = await db.execute({
      sql: `INSERT INTO songs (
        user_id, itunes_id, spotify_track_id, spotify_sync_playlist_id,
        track_name, artist_name, artwork_url, duration_ms, album, explicit,
        popularity, release_date, release_year, genre,
        karafun_available, personal_key, vocal_status
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 'Standard', 'Practicing')
      RETURNING id`,
      args: [
        userId,
        trackId,
        playlistId,
        tr.name,
        artistName,
        artwork,
        tr.duration_ms ?? 0,
        tr.album?.name ?? null,
        tr.explicit ? 1 : 0,
        typeof tr.popularity === "number" ? tr.popularity : null,
        tr.album?.release_date ?? null,
        year,
      ],
    });
    const newRow = ins.rows[0] as { id: number } | undefined;
    if (newRow?.id != null) {
      addedSongIds.push(newRow.id);
      await db.execute({
        sql: `INSERT OR IGNORE INTO spotify_playlist_songs (
                user_id, spotify_playlist_id, song_id, spotify_track_id, track_name, artist_name
              ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [userId, playlistId, newRow.id, trackId, tr.name, artistName],
      });
    }
    added += 1;
  }

  return {
    added,
    removed,
    unlinked,
    skipped,
    linkedExisting,
    duplicateSongs,
    playlistName: meta.name,
    snapshotId: meta.snapshot_id,
    addedSongIds,
  };
}

/** Removes one Spotify playlist association and deletes orphaned Spotify-created songs. */
export async function deleteImportedSongsForSpotifyPlaylist(
  userId: number,
  spotifyPlaylistId: string
): Promise<{ deleted: number; unlinked: number }> {
  const sel = await db.execute({
    sql: `SELECT song_id FROM spotify_playlist_songs
          WHERE user_id = ? AND spotify_playlist_id = ?`,
    args: [userId, spotifyPlaylistId],
  });
  const n = sel.rows.length;
  if (n > 0) {
    const songIds = sel.rows
      .map((row) => Number((row as { song_id?: unknown }).song_id))
      .filter(Number.isFinite);
    const placeholders = songIds.map(() => "?").join(",");
    await db.execute({
      sql: `DELETE FROM spotify_playlist_songs
            WHERE user_id = ? AND spotify_playlist_id = ?`,
      args: [userId, spotifyPlaylistId],
    });

    if (songIds.length > 0) {
      const orphaned = await db.execute({
        sql: `SELECT COUNT(*) AS c FROM songs s
              WHERE s.user_id = ? AND s.id IN (${placeholders})
                AND s.spotify_track_id IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1 FROM spotify_playlist_songs ps
                  WHERE ps.user_id = s.user_id AND ps.song_id = s.id
                )`,
        args: [userId, ...songIds],
      });
      const deleteCount = Number(
        (orphaned.rows[0] as { c?: unknown } | undefined)?.c ?? 0
      );
      if (deleteCount > 0) {
        await db.execute({
          sql: `DELETE FROM songs
                WHERE user_id = ? AND id IN (${placeholders})
                  AND spotify_track_id IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM spotify_playlist_songs ps
                    WHERE ps.user_id = songs.user_id AND ps.song_id = songs.id
                  )`,
          args: [userId, ...songIds],
        });
      }

      await db.execute({
        sql: `UPDATE songs
              SET spotify_sync_playlist_id = NULL
              WHERE user_id = ? AND id IN (${placeholders})`,
        args: [userId, ...songIds],
      });

      await db.execute({
        sql: `DELETE FROM spotify_synced_playlists
              WHERE user_id = ? AND spotify_playlist_id = ?`,
        args: [userId, spotifyPlaylistId],
      });
      return { deleted: deleteCount, unlinked: n };
    }
  }
  await db.execute({
    sql: `DELETE FROM spotify_synced_playlists WHERE user_id = ? AND spotify_playlist_id = ?`,
    args: [userId, spotifyPlaylistId],
  });
  return { deleted: 0, unlinked: n };
}