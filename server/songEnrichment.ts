import { db } from "./db.js";
import { logApiWarning, logCatalogEvent } from "./eventLog.js";

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

/** Prevents overlapping full-library admin rebuilds (sync or background). */
let adminFullLibraryReenrichLocked = false;

export interface StartEnrichmentJobOptions {
  /** When true, include songs that already have `enriched_at` set (full re-run). */
  force?: boolean;
}

export interface AdminReenrichUserSummary {
  userId: number;
  requested: number;
  succeeded: number;
  failed: number;
  message: string | null;
}

export interface AdminReenrichAllUsersResult {
  usersInLibrary: number;
  usersProcessed: number;
  totalSongsRequested: number;
  perUser: AdminReenrichUserSummary[];
}

function now(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(text: string): string {
  return text.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s*-.*$/g, "").trim();
}

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

async function fetchJson(
  url: string,
  init: RequestInit | undefined,
  label: string
): Promise<unknown> {
  const res = await fetchWithTimeout(url, init, label);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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

async function enrichSong(userId: number, song: SongToEnrich): Promise<void> {
  let lyricsText: string | null = null;
  try {
    lyricsText = await fetchLyrics(song.artist_name, song.track_name);
  } catch {
    /* optional */
  }

  await db.execute({
    sql: `UPDATE songs SET
      lyrics = COALESCE(?, lyrics),
      enriched_at = datetime('now')
      WHERE id = ? AND user_id = ?`,
    args: [
      lyricsText && lyricsText.trim() ? lyricsText.trim() : null,
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
  songIds: number[] | undefined,
  force: boolean
): Promise<SongToEnrich[]> {
  if (songIds && songIds.length > 0) {
    const uniqueIds = [...new Set(songIds)].filter(Number.isFinite);
    if (uniqueIds.length === 0) return [];
    const placeholders = uniqueIds.map(() => "?").join(",");
    const res = await db.execute({
      sql: `SELECT id, track_name, artist_name, spotify_track_id FROM songs
            WHERE user_id = ? AND id IN (${placeholders})
            ORDER BY id ASC`,
      args: [userId, ...uniqueIds],
    });
    return res.rows as unknown as SongToEnrich[];
  }

  const pendingOnly = force ? "" : " AND enriched_at IS NULL";
  const res = await db.execute({
    sql: `SELECT id, track_name, artist_name, spotify_track_id FROM songs
          WHERE user_id = ?${pendingOnly}
          ORDER BY id ASC`,
    args: [userId],
  });
  return res.rows as unknown as SongToEnrich[];
}

/** Run enrichment immediately for specific songs (e.g. welcome song on registration). */
export async function enrichSongsNow(
  userId: number,
  songIds: number[]
): Promise<void> {
  const songs = await loadSongsForJob(userId, songIds, true);
  if (songs.length === 0) return;
  for (let i = 0; i < songs.length; i++) {
    const song = songs[i]!;
    if (i > 0) await sleep(1100);
    await enrichSong(userId, song);
  }
}

async function runJob(userId: number, songs: SongToEnrich[]): Promise<void> {
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
      logApiWarning(`Enrichment failed for ${song.track_name}: ${message}`, {
        userId,
        event: "core_service_dependency_failure",
      });
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
  songIds?: number[],
  options?: StartEnrichmentJobOptions
): Promise<EnrichmentStatus> {
  const active = jobs.get(userId);
  if (active?.running) {
    return getEnrichmentStatus(userId);
  }

  const force = options?.force === true;
  const songs = await loadSongsForJob(userId, songIds, force);
  const timestamp = now();
  const emptyMessage = force
    ? "No songs in library."
    : "No songs need enrichment.";
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
    message: songs.length > 0 ? "Enrichment started." : emptyMessage,
    errors: [],
  });

  if (songs.length > 0) {
    void runJob(userId, songs).then(() => {
      const finished = jobs.get(userId);
      if (finished && finished.failed > 0) {
        logCatalogEvent("background_job_routine_completion", {
          userId,
          message: `Enrichment job finished with ${finished.failed} failed song(s)`,
        });
      }
    });
  }

  return getEnrichmentStatus(userId);
}

async function runAdminReenrichAllUsersCore(): Promise<AdminReenrichAllUsersResult> {
  const perUser: AdminReenrichUserSummary[] = [];
  let totalSongsRequested = 0;
  const distinct = await db.execute({
    sql: `SELECT DISTINCT user_id FROM songs ORDER BY user_id`,
    args: [],
  });
  const usersInLibrary = distinct.rows.length;

  for (const row of distinct.rows) {
    const uid = Number((row as { user_id: unknown }).user_id);
    if (!Number.isFinite(uid) || uid <= 0) continue;

    while (jobs.get(uid)?.running) {
      await sleep(500);
    }

    const songs = await loadSongsForJob(uid, undefined, true);
    if (songs.length === 0) continue;

    totalSongsRequested += songs.length;
    const timestamp = now();
    jobs.set(uid, {
      running: true,
      requested: songs.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      currentSong: null,
      startedAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
      message: "Admin full library re-enrichment.",
      errors: [],
    });

    await runJob(uid, songs);

    const finished = jobs.get(uid);
    perUser.push({
      userId: uid,
      requested: songs.length,
      succeeded: finished?.succeeded ?? 0,
      failed: finished?.failed ?? 0,
      message: finished?.message ?? null,
    });
  }

  return {
    usersInLibrary,
    usersProcessed: perUser.length,
    totalSongsRequested,
    perUser,
  };
}

/**
 * Re-runs backend enrichment for every song row, for every user that has songs.
 * Processes one user at a time (awaiting each job) to respect external API rate limits.
 */
export async function adminReenrichAllUsersSequentially(): Promise<AdminReenrichAllUsersResult> {
  if (adminFullLibraryReenrichLocked) {
    throw new Error("Full-library re-enrichment is already in progress.");
  }
  adminFullLibraryReenrichLocked = true;
  try {
    return await runAdminReenrichAllUsersCore();
  } finally {
    adminFullLibraryReenrichLocked = false;
  }
}

/**
 * Queues full-library re-enrichment without blocking the caller. Returns false if a run is already active.
 */
export function scheduleAdminReenrichAllUsersBackground(): boolean {
  if (adminFullLibraryReenrichLocked) {
    return false;
  }
  adminFullLibraryReenrichLocked = true;
  void (async () => {
    try {
      await runAdminReenrichAllUsersCore();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logApiWarning(`Admin full-library re-enrichment failed: ${message}`, {
        event: "non_breaking_api_runtime_error",
      });
      console.error("[songEnrichment] admin rebuild-all failed:", err);
    } finally {
      adminFullLibraryReenrichLocked = false;
    }
  })();
  return true;
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
