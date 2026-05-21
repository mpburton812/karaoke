import { db } from "./db.js";
import { logApiWarning, logCatalogEvent } from "./eventLog.js";
import { enrichSongsNow } from "./songEnrichment.js";

/** Starter track for new accounts (Spotify catalog reference). */
export const WELCOME_SONG = {
  trackName: "Piano Man",
  artistName: "Billy Joel",
  spotifyTrackId: "70C80SySPPuA0xaBh4nc2",
  album: "Piano Man",
  releaseDate: "1973-11-02",
  releaseYear: 1973,
  durationMs: 339_000,
  genre: "Rock",
  artworkUrl:
    "https://i.scdn.co/image/ab67616d0000b273ac26a12b2b4c5ab47cd51f38",
} as const;

/**
 * Inserts Piano Man into a new user's library and runs full server enrichment
 * (KaraFun, lyrics, GetSongBPM, Last.fm, MusicBrainz, optional Spotify features).
 */
export async function seedWelcomeSongForUser(userId: number): Promise<void> {
  try {
    const existing = await db.execute({
      sql: `SELECT id, enriched_at FROM songs
            WHERE user_id = ?
              AND LOWER(track_name) = LOWER(?)
              AND LOWER(artist_name) = LOWER(?)
            LIMIT 1`,
      args: [userId, WELCOME_SONG.trackName, WELCOME_SONG.artistName],
    });
    const prior = existing.rows[0] as
      | { id: number; enriched_at: string | null }
      | undefined;
    if (prior?.id) {
      if (!prior.enriched_at) {
        await enrichSongsNow(userId, [prior.id]);
      }
      return;
    }

    const ins = await db.execute({
      sql: `INSERT INTO songs (
        user_id, itunes_id, spotify_track_id, track_name, artist_name, artwork_url,
        album, release_date, release_year, duration_ms, genre,
        personal_key, vocal_status, karafun_available
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Standard', 'Practicing', 0)
      RETURNING id`,
      args: [
        userId,
        WELCOME_SONG.spotifyTrackId,
        WELCOME_SONG.trackName,
        WELCOME_SONG.artistName,
        WELCOME_SONG.artworkUrl,
        WELCOME_SONG.album,
        WELCOME_SONG.releaseDate,
        WELCOME_SONG.releaseYear,
        WELCOME_SONG.durationMs,
        WELCOME_SONG.genre,
      ],
    });
    const newId = Number((ins.rows[0] as { id?: unknown })?.id);
    if (!Number.isFinite(newId) || newId <= 0) return;

    await enrichSongsNow(userId, [newId]);
    logCatalogEvent("feature_utilization_metrics", {
      userId,
      message: `Welcome song added: "${WELCOME_SONG.trackName}" by ${WELCOME_SONG.artistName}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logApiWarning(`Welcome song seed failed: ${message}`, {
      userId,
      event: "non_breaking_api_runtime_error",
    });
  }
}
