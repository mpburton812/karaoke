import { db } from "./db.js";

export interface EnrichmentStatus {
  running: boolean;
  requested: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  pending: number;
  totalSongs: number;
  currentSong: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  message: string | null;
  errors: string[];
}

interface SongToEnrich {
  id: number;
  track_name: string;
  artist_name: string;
}

interface EnrichmentJob {
  running: boolean;
  requested: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  currentSong: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  message: string | null;
  errors: string[];
}

const jobs = new Map<number, EnrichmentJob>();

function now(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(text: string): string {
  return text.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s*-.*$/g, "").trim();
}

function emptyQualities() {
  return {
    bpm: null as number | null,
    key: "DNF",
    energy: null as number | null,
    danceability: null as number | null,
    happiness: null as number | null,
    acousticness: null as number | null,
    instrumentalness: null as number | null,
    liveness: null as number | null,
    speechiness: null as number | null,
    loudness: null as number | null,
  };
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function checkKarafunAvailable(
  trackName: string,
  artistName: string
): Promise<boolean> {
  const cleanTitle = cleanText(trackName);
  const cleanArtist = cleanText(artistName);

  const result = await db.execute({
    sql: `SELECT id FROM karafun_catalog 
          WHERE (title LIKE ? OR ? LIKE '%' || title || '%') 
          AND (artist LIKE ? OR ? LIKE '%' || artist || '%') 
          LIMIT 1`,
    args: [`%${cleanTitle}%`, cleanTitle, `%${cleanArtist}%`, cleanArtist],
  });

  if (result.rows.length > 0) return true;

  const searchQuery = `${cleanTitle} ${cleanArtist}`;
  const karafunSearchUrl = `https://www.karafun.com/search.html?query=${encodeURIComponent(searchQuery)}`;
  const html = await fetchText(karafunSearchUrl, {
    headers: {
      "User-Agent": "KaraokeCompanion/1.0 (https://github.com/mpburton812/karaoke)",
      Accept: "text/html",
    },
  });
  return (
    html.includes("song-list__item") ||
    html.includes("karaoke/") ||
    (html.length > 1000 && !html.toLowerCase().includes("no results found"))
  );
}

async function fetchLyrics(
  artistName: string,
  trackName: string
): Promise<string | null> {
  const cleanArtist = cleanText(artistName);
  const cleanTitle = cleanText(trackName);
  const data = (await fetchJson(
    `https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`
  )) as { lyrics?: unknown };
  return typeof data.lyrics === "string" && data.lyrics.trim()
    ? data.lyrics
    : null;
}

async function fetchMusicalQualitiesForNames(
  trackName: string,
  artistName: string
): Promise<ReturnType<typeof emptyQualities>> {
  const qualities = emptyQualities();
  const mbSearchUrl = `https://musicbrainz.org/ws/2/recording/?query=recording:${encodeURIComponent(trackName)} AND artist:${encodeURIComponent(artistName)}&fmt=json`;
  const mbData = (await fetchJson(mbSearchUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "KaraokeCompanion/1.0 (https://github.com/mpburton812/karaoke)",
    },
  })) as { recordings?: Array<{ id?: string }> };
  const mbid = mbData.recordings?.[0]?.id;
  if (!mbid) return qualities;

  const abData = (await fetchJson(
    `https://acousticbrainz.org/api/v1/${mbid}/high-level`
  )) as {
    highlevel?: {
      tonal_atonal?: { all?: { tonal?: number } };
      key_edma?: { all?: { key?: string } };
      mood_acoustic?: { all?: { acoustic?: number } };
      danceability?: { all?: { danceable?: number } };
      mood_happy?: { all?: { happy?: number } };
      voice_instrumental?: { all?: { instrumental?: number; voice?: number } };
    };
  };
  const data = abData.highlevel;
  if (!data) return qualities;

  return {
    bpm: null,
    key:
      (data.tonal_atonal?.all?.tonal ?? 0) > 0.5
        ? data.key_edma?.all?.key || "DNF"
        : "DNF",
    energy:
      data.mood_acoustic?.all?.acoustic !== undefined
        ? 1 - data.mood_acoustic.all.acoustic
        : null,
    danceability: data.danceability?.all?.danceable ?? null,
    happiness: data.mood_happy?.all?.happy ?? null,
    acousticness: data.mood_acoustic?.all?.acoustic ?? null,
    instrumentalness: data.voice_instrumental?.all?.instrumental ?? null,
    liveness: null,
    speechiness: data.voice_instrumental?.all?.voice ?? null,
    loudness: null,
  };
}

async function enrichSong(userId: number, song: SongToEnrich): Promise<void> {
  let kf = false;
  try {
    kf = await checkKarafunAvailable(song.track_name, song.artist_name);
  } catch {
    /* optional */
  }

  let lyricsText: string | null = null;
  try {
    lyricsText = await fetchLyrics(song.artist_name, song.track_name);
  } catch {
    /* optional */
  }

  let qualities = emptyQualities();
  try {
    qualities = await fetchMusicalQualitiesForNames(
      song.track_name,
      song.artist_name
    );
  } catch {
    /* optional */
  }

  await db.execute({
    sql: `UPDATE songs SET
      karafun_available = ?,
      lyrics = COALESCE(?, lyrics),
      key = ?, bpm = ?, energy = ?, danceability = ?, happiness = ?,
      acousticness = ?, instrumentalness = ?, liveness = ?, speechiness = ?, loudness = ?,
      enriched_at = datetime('now')
      WHERE id = ? AND user_id = ?`,
    args: [
      kf ? 1 : 0,
      lyricsText && lyricsText.trim() ? lyricsText.trim() : null,
      qualities.key,
      qualities.bpm,
      qualities.energy,
      qualities.danceability,
      qualities.happiness,
      qualities.acousticness,
      qualities.instrumentalness,
      qualities.liveness,
      qualities.speechiness,
      qualities.loudness,
      song.id,
      userId,
    ],
  });
}

async function countTotalSongs(userId: number): Promise<number> {
  const res = await db.execute({
    sql: "SELECT COUNT(*) AS c FROM songs WHERE user_id = ?",
    args: [userId],
  });
  return Number((res.rows[0] as { c?: unknown } | undefined)?.c ?? 0);
}

export async function countSongsNeedingEnrichment(userId: number): Promise<number> {
  const res = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM songs
          WHERE user_id = ? AND enriched_at IS NULL`,
    args: [userId],
  });
  return Number((res.rows[0] as { c?: unknown } | undefined)?.c ?? 0);
}

async function loadSongsForJob(
  userId: number,
  songIds?: number[]
): Promise<SongToEnrich[]> {
  if (songIds && songIds.length > 0) {
    const uniqueIds = [...new Set(songIds)].filter(Number.isFinite);
    if (uniqueIds.length === 0) return [];
    const placeholders = uniqueIds.map(() => "?").join(",");
    const res = await db.execute({
      sql: `SELECT id, track_name, artist_name FROM songs
            WHERE user_id = ? AND id IN (${placeholders})
            ORDER BY id ASC`,
      args: [userId, ...uniqueIds],
    });
    return res.rows as unknown as SongToEnrich[];
  }

  const res = await db.execute({
    sql: `SELECT id, track_name, artist_name FROM songs
          WHERE user_id = ? AND enriched_at IS NULL
          ORDER BY id ASC`,
    args: [userId],
  });
  return res.rows as unknown as SongToEnrich[];
}

async function runJob(userId: number, songs: SongToEnrich[]) {
  const job = jobs.get(userId);
  if (!job) return;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i]!;
    job.currentSong = `${song.track_name} - ${song.artist_name}`;
    job.updatedAt = now();
    try {
      if (i > 0) await sleep(1100);
      await enrichSong(userId, song);
      job.succeeded += 1;
    } catch (err) {
      job.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      job.errors.unshift(`${song.track_name}: ${message}`);
      job.errors.splice(10);
    } finally {
      job.processed += 1;
      job.updatedAt = now();
    }
  }

  job.running = false;
  job.currentSong = null;
  job.completedAt = now();
  job.updatedAt = job.completedAt;
  job.message =
    job.failed > 0
      ? `Completed with ${job.failed} failed song(s).`
      : "Enrichment complete.";
}

export async function startEnrichmentJob(
  userId: number,
  songIds?: number[]
): Promise<EnrichmentStatus> {
  const active = jobs.get(userId);
  if (active?.running) {
    return getEnrichmentStatus(userId);
  }

  const songs = await loadSongsForJob(userId, songIds);
  const timestamp = now();
  jobs.set(userId, {
    running: songs.length > 0,
    requested: songs.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    currentSong: null,
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt: songs.length > 0 ? null : timestamp,
    message: songs.length > 0 ? "Enrichment started." : "No songs need enrichment.",
    errors: [],
  });

  if (songs.length > 0) {
    void runJob(userId, songs);
  }

  return getEnrichmentStatus(userId);
}

export async function getEnrichmentStatus(
  userId: number
): Promise<EnrichmentStatus> {
  const [pending, totalSongs] = await Promise.all([
    countSongsNeedingEnrichment(userId),
    countTotalSongs(userId),
  ]);
  const job = jobs.get(userId);
  if (!job) {
    return {
      running: false,
      requested: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      pending,
      totalSongs,
      currentSong: null,
      startedAt: null,
      updatedAt: null,
      completedAt: null,
      message: pending > 0 ? `${pending} song(s) need enrichment.` : null,
      errors: [],
    };
  }

  return {
    running: job.running,
    requested: job.requested,
    processed: job.processed,
    succeeded: job.succeeded,
    failed: job.failed,
    skipped: job.skipped,
    pending,
    totalSongs,
    currentSong: job.currentSong,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    message: job.message,
    errors: [...job.errors],
  };
}
