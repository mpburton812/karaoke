import { db } from "./db.js";
import { getSpotifyAccessTokenForUser } from "./spotifyAuth.js";

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
  spotify_track_id: string | null;
  genre: string | null;
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
const FETCH_TIMEOUT_MS = 10_000;

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

type MusicalQualities = ReturnType<typeof emptyQualities>;

async function fetchWithTimeout(
  url: string,
  init: RequestInit | undefined,
  label: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${FETCH_TIMEOUT_MS / 1000}s`, {
        cause: err,
      });
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(
  url: string,
  init: RequestInit | undefined,
  label: string
): Promise<string> {
  const res = await fetchWithTimeout(url, init, label);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchJson(
  url: string,
  init: RequestInit | undefined,
  label: string
): Promise<unknown> {
  const res = await fetchWithTimeout(url, init, label);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function mergeQualities(
  base: MusicalQualities,
  incoming: Partial<MusicalQualities>
): MusicalQualities {
  return {
    bpm: base.bpm ?? incoming.bpm ?? null,
    key: base.key !== "DNF" ? base.key : incoming.key ?? "DNF",
    energy: base.energy ?? incoming.energy ?? null,
    danceability: base.danceability ?? incoming.danceability ?? null,
    happiness: base.happiness ?? incoming.happiness ?? null,
    acousticness: base.acousticness ?? incoming.acousticness ?? null,
    instrumentalness: base.instrumentalness ?? incoming.instrumentalness ?? null,
    liveness: base.liveness ?? incoming.liveness ?? null,
    speechiness: base.speechiness ?? incoming.speechiness ?? null,
    loudness: base.loudness ?? incoming.loudness ?? null,
  };
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
  const html = await fetchText(
    karafunSearchUrl,
    {
      headers: {
        "User-Agent": "KaraokeCompanion/1.0 (https://github.com/mpburton812/karaoke)",
        Accept: "text/html",
      },
    },
    "KaraFun search"
  );
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
    `https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`,
    undefined,
    "Lyrics lookup"
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
  const mbData = (await fetchJson(
    mbSearchUrl,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "KaraokeCompanion/1.0 (https://github.com/mpburton812/karaoke)",
      },
    },
    "MusicBrainz lookup"
  )) as { recordings?: Array<{ id?: string }> };
  const mbid = mbData.recordings?.[0]?.id;
  if (!mbid) return qualities;

  const abData = (await fetchJson(
    `https://acousticbrainz.org/api/v1/${mbid}/high-level`,
    undefined,
    "AcousticBrainz lookup"
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

const SPOTIFY_KEYS = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

async function fetchSpotifyAudioFeatures(
  accessToken: string,
  spotifyTrackId: string
): Promise<Partial<MusicalQualities>> {
  const data = (await fetchJson(
    `https://api.spotify.com/v1/audio-features/${encodeURIComponent(spotifyTrackId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    "Spotify audio features"
  )) as Record<string, unknown>;
  const keyNum = coerceNumber(data.key);
  const mode = coerceNumber(data.mode);
  const key =
    keyNum !== null && keyNum >= 0 && keyNum < SPOTIFY_KEYS.length
      ? `${SPOTIFY_KEYS[keyNum]}${mode === 0 ? "m" : ""}`
      : undefined;
  return {
    bpm: coerceNumber(data.tempo),
    key,
    energy: coerceNumber(data.energy),
    danceability: coerceNumber(data.danceability),
    happiness: coerceNumber(data.valence),
    acousticness: coerceNumber(data.acousticness),
    instrumentalness: coerceNumber(data.instrumentalness),
    liveness: coerceNumber(data.liveness),
    speechiness: coerceNumber(data.speechiness),
    loudness: coerceNumber(data.loudness),
  };
}

function findFirstNumber(value: unknown, keys: string[]): number | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstNumber(item, keys);
      if (found !== null) return found;
    }
    return null;
  }
  const obj = value as Record<string, unknown>;
  for (const key of keys) {
    const n = coerceNumber(obj[key]);
    if (n !== null) return n;
  }
  for (const child of Object.values(obj)) {
    const found = findFirstNumber(child, keys);
    if (found !== null) return found;
  }
  return null;
}

function findFirstString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstString(item, keys);
      if (found) return found;
    }
    return null;
  }
  const obj = value as Record<string, unknown>;
  for (const key of keys) {
    const raw = obj[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  for (const child of Object.values(obj)) {
    const found = findFirstString(child, keys);
    if (found) return found;
  }
  return null;
}

async function fetchGetSongBpmQualities(
  trackName: string,
  artistName: string
): Promise<Partial<MusicalQualities>> {
  const apiKey = process.env.GETSONGBPM_API_KEY?.trim();
  if (!apiKey) return {};
  const params = new URLSearchParams({
    api_key: apiKey,
    type: "song",
    lookup: `${trackName} ${artistName}`,
    limit: "1",
  });
  const search = await fetchJson(
    `https://api.getsongbpm.com/search/?${params.toString()}`,
    undefined,
    "GetSongBPM search"
  );
  const songId =
    findFirstString(search, ["id", "song_id"]) ??
    String(findFirstNumber(search, ["id", "song_id"]) ?? "");
  const detail = songId
    ? await fetchJson(
        `https://api.getsongbpm.com/song/?${new URLSearchParams({
          api_key: apiKey,
          id: songId,
        }).toString()}`,
        undefined,
        "GetSongBPM song"
      )
    : search;
  const bpm = findFirstNumber(detail, ["tempo", "bpm"]);
  const key = findFirstString(detail, ["key_of", "key", "camelot"]);
  return {
    bpm,
    key: key ?? undefined,
  };
}

function readLastFmTags(data: unknown): string[] {
  const tags = (data as { track?: { toptags?: { tag?: unknown } } })?.track
    ?.toptags?.tag;
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => {
      const name = (tag as { name?: unknown }).name;
      return typeof name === "string" ? name.toLowerCase().trim() : "";
    })
    .filter(Boolean)
    .slice(0, 12);
}

function inferQualitiesFromTags(tags: string[]): Partial<MusicalQualities> {
  const has = (...needles: string[]) =>
    tags.some((tag) => needles.some((needle) => tag.includes(needle)));
  return {
    energy: has("rock", "metal", "punk", "dance", "edm", "party") ? 0.75 : null,
    danceability: has("dance", "disco", "funk", "edm", "house") ? 0.75 : null,
    happiness: has("happy", "party", "pop", "feel good") ? 0.7 : null,
    acousticness: has("acoustic", "folk", "singer-songwriter") ? 0.75 : null,
    instrumentalness: has("instrumental") ? 0.8 : null,
  };
}

async function fetchLastFmMetadata(
  trackName: string,
  artistName: string
): Promise<{ genre: string | null; qualities: Partial<MusicalQualities> }> {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey) return { genre: null, qualities: {} };
  const params = new URLSearchParams({
    method: "track.getInfo",
    api_key: apiKey,
    artist: artistName,
    track: trackName,
    autocorrect: "1",
    format: "json",
  });
  const data = await fetchJson(
    `https://ws.audioscrobbler.com/2.0/?${params.toString()}`,
    undefined,
    "Last.fm track info"
  );
  const tags = readLastFmTags(data);
  return {
    genre: tags[0] ?? null,
    qualities: inferQualitiesFromTags(tags),
  };
}

async function enrichSong(
  userId: number,
  song: SongToEnrich,
  spotifyAccessToken: string | null
): Promise<void> {
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
  let genre = song.genre;
  if (spotifyAccessToken && song.spotify_track_id) {
    try {
      qualities = mergeQualities(
        qualities,
        await fetchSpotifyAudioFeatures(spotifyAccessToken, song.spotify_track_id)
      );
    } catch {
      /* Spotify audio features may be unavailable for some apps */
    }
  }

  try {
    qualities = mergeQualities(
      qualities,
      await fetchGetSongBpmQualities(song.track_name, song.artist_name)
    );
  } catch {
    /* optional */
  }

  try {
    const lastFm = await fetchLastFmMetadata(song.track_name, song.artist_name);
    genre = genre || lastFm.genre;
    qualities = mergeQualities(qualities, lastFm.qualities);
  } catch {
    /* optional */
  }

  try {
    qualities = mergeQualities(qualities, await fetchMusicalQualitiesForNames(
      song.track_name,
      song.artist_name
    ));
  } catch {
    /* optional */
  }

  await db.execute({
    sql: `UPDATE songs SET
      karafun_available = ?,
      lyrics = COALESCE(?, lyrics),
      key = ?, bpm = ?, energy = ?, danceability = ?, happiness = ?,
      acousticness = ?, instrumentalness = ?, liveness = ?, speechiness = ?, loudness = ?,
      genre = COALESCE(?, genre),
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
      genre && genre.trim() ? genre.trim() : null,
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
      sql: `SELECT id, track_name, artist_name, spotify_track_id, genre FROM songs
            WHERE user_id = ? AND id IN (${placeholders})
            ORDER BY id ASC`,
      args: [userId, ...uniqueIds],
    });
    return res.rows as unknown as SongToEnrich[];
  }

  const res = await db.execute({
    sql: `SELECT id, track_name, artist_name, spotify_track_id, genre FROM songs
          WHERE user_id = ? AND enriched_at IS NULL
          ORDER BY id ASC`,
    args: [userId],
  });
  return res.rows as unknown as SongToEnrich[];
}

async function runJob(userId: number, songs: SongToEnrich[]) {
  const job = jobs.get(userId);
  if (!job) return;
  const spotifyAccessToken = await getSpotifyAccessTokenForUser(userId).catch(
    () => null
  );

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i]!;
    job.currentSong = `${song.track_name} - ${song.artist_name}`;
    job.updatedAt = now();
    try {
      if (i > 0) await sleep(1100);
      await enrichSong(userId, song, spotifyAccessToken);
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

  const idleMessage =
    !job.running && pending > 0
      ? `${pending} song(s) still need enrichment.`
      : job.message;

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
    message: idleMessage,
    errors: [...job.errors],
  };
}
