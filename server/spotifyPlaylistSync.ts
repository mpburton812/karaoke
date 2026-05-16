import { db } from "./db.js";
import { getSpotifyAccessTokenForUser } from "./spotifyAuth.js";

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
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: string }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return `Spotify HTTP ${status}`;
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
    throw new Error(spotifyApiErrorMessage(data, res.status));
  }
  return data as T;
}

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  tracksTotal: number;
}

export async function listSpotifyPlaylists(
  userId: number
): Promise<SpotifyPlaylistSummary[]> {
  const access = await getSpotifyAccessTokenForUser(userId);
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
        tracks?: { total?: unknown };
        /** Track count ref (Spotify); not the paging `items` array */
        items?: unknown;
      }>;
    }>(access, url);

    const items = page.items ?? [];
    for (const p of items) {
      out.push({
        id: p.id,
        name: p.name,
        tracksTotal: readSimplifiedPlaylistTrackTotal(p),
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
  track: SpotifyTrackLite | null;
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
  skipped: number;
  playlistName: string;
  snapshotId: string;
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
      skipped: 0,
      playlistName: meta.name,
      snapshotId: meta.snapshot_id,
      unchanged: true,
    };
  }

  const trackMap = new Map<string, SpotifyTrackLite>();
  const limit = 50;
  let offset = 0;
  // Avoid following `page.next` for the same 403-on-deprecated-URL class of issues.

  for (;;) {
    const url =
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks` +
      `?limit=${limit}&offset=${offset}&market=from_token&additional_types=track`;
    const page = await spotifyGet<{
      items: PlaylistTrackItem[];
    }>(access, url);

    const items = page.items ?? [];
    for (const item of items) {
      const tr = item.track;
      if (!tr?.id) continue;
      trackMap.set(tr.id, tr);
    }
    if (items.length === 0 || items.length < limit) {
      break;
    }
    offset += limit;
  }

  const existing = await db.execute({
    sql: `SELECT id, spotify_track_id FROM songs
          WHERE user_id = ? AND spotify_sync_playlist_id = ? AND spotify_track_id IS NOT NULL`,
    args: [userId, playlistId],
  });

  const existingByTrack = new Map<string, number>();
  for (const row of existing.rows) {
    const o = row as { id: number; spotify_track_id: string };
    existingByTrack.set(o.spotify_track_id, o.id);
  }

  let removed = 0;
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
      sql: `DELETE FROM songs WHERE user_id = ? AND id IN (${placeholders})`,
      args: [userId, ...slice],
    });
    removed += slice.length;
  }

  let added = 0;
  let skipped = 0;
  for (const [trackId, tr] of trackMap) {
    if (existingByTrack.has(trackId)) {
      skipped += 1;
      continue;
    }

    const artwork = pickArtwork(tr);
    const year = releaseYear(tr);
    await db.execute({
      sql: `INSERT INTO songs (
        user_id, itunes_id, spotify_track_id, spotify_sync_playlist_id,
        track_name, artist_name, artwork_url, duration_ms, album, explicit,
        popularity, release_date, release_year, genre,
        karafun_available, personal_key, vocal_status
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 'Standard', 'Practicing')`,
      args: [
        userId,
        trackId,
        playlistId,
        tr.name,
        artistNames(tr),
        artwork,
        tr.duration_ms ?? 0,
        tr.album?.name ?? null,
        tr.explicit ? 1 : 0,
        typeof tr.popularity === "number" ? tr.popularity : null,
        tr.album?.release_date ?? null,
        year,
      ],
    });
    added += 1;
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

  return {
    added,
    removed,
    skipped,
    playlistName: meta.name,
    snapshotId: meta.snapshot_id,
  };
}