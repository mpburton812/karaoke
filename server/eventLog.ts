import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  type EventCode,
  type EventLevelCode,
  getEventDefinition,
  isEventCode,
  levelForEvent,
} from "../src/lib/eventCatalog.js";
import { db } from "./db.js";
import { formatBuildLabel, getBuildInfo } from "./buildInfo.js";

export type EventLevel = EventLevelCode;

export type { EventCode } from "../src/lib/eventCatalog.js";
export { EVENT_CATALOG, EVENT_CATALOG_ENTRIES } from "../src/lib/eventCatalog.js";

export interface LogEventInput {
  level: EventLevel;
  message: string;
  userId?: number | null;
  username?: string | null;
  /** Canonical event code (stored in `category`); level is derived when recognized. */
  event?: EventCode | string;
  category?: string;
  details?: Record<string, unknown>;
}

export interface EventLogRow {
  id: number;
  occurredAt: string;
  level: EventLevel;
  userId: number | null;
  username: string | null;
  message: string;
  /** Event catalog code, or legacy grouping label. */
  category: string | null;
  details: string | null;
}

export const MAX_EVENT_LOG_ENTRIES = 1000;

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const JSONL_PATH =
  process.env.EVENT_LOG_JSONL?.trim() ||
  path.join(REPO_ROOT, "logs", "application-events.jsonl");

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeLevel(level: string): EventLevel {
  const u = level.toUpperCase();
  if (u === "C" || u === "CRITICAL") return "C";
  if (u === "W" || u === "WARNING" || u === "WARN") return "W";
  return "I";
}

function resolveEventAndLevel(input: LogEventInput): {
  level: EventLevel;
  category: string | null;
} {
  const eventKey =
    (typeof input.event === "string" && input.event.trim()) ||
    (typeof input.category === "string" && isEventCode(input.category)
      ? input.category
      : null);

  if (eventKey && isEventCode(eventKey)) {
    return { level: levelForEvent(eventKey), category: eventKey };
  }

  const legacyCategory = input.category?.trim().slice(0, 64) || null;
  return { level: normalizeLevel(input.level), category: legacyCategory };
}

async function appendGithubJsonl(entry: {
  at: string;
  level: EventLevel;
  user: string | null;
  message: string;
  event: string | null;
  category: string | null;
}): Promise<void> {
  try {
    await mkdir(path.dirname(JSONL_PATH), { recursive: true });
    const line = `${JSON.stringify(entry)}\n`;
    await appendFile(JSONL_PATH, line, "utf8");
  } catch (err) {
    console.error("[eventLog] JSONL append failed:", err);
  }
}

/**
 * Log a catalogued application event. Level and default label come from {@link EVENT_CATALOG}.
 */
export function logCatalogEvent(
  event: EventCode,
  input?: Omit<LogEventInput, "event" | "level" | "category"> & {
    message?: string;
    category?: string;
  }
): void {
  const def = getEventDefinition(event)!;
  logEvent({
    event,
    level: def.level,
    message: input?.message?.trim() || def.label,
    userId: input?.userId,
    username: input?.username,
    category: input?.category,
    details: input?.details,
  });
}

/**
 * Structured application event (RFC 5424–style severities mapped to C / W / I).
 * Persists to Turso and appends to logs/application-events.jsonl for GitHub review.
 */
export function logEvent(input: LogEventInput): void {
  const { level, category } = resolveEventAndLevel(input);
  const occurredAt = nowIso();
  const message = input.message.trim().slice(0, 2000);
  if (!message) return;

  const detailsJson =
    input.details && Object.keys(input.details).length > 0
      ? JSON.stringify(input.details).slice(0, 4000)
      : null;

  void (async () => {
    try {
      let username = input.username?.trim() || null;
      const userId =
        typeof input.userId === "number" && Number.isFinite(input.userId)
          ? input.userId
          : null;

      if (userId && !username) {
        const u = await db.execute({
          sql: "SELECT username FROM users WHERE id = ?",
          args: [userId],
        });
        const row = u?.rows?.[0] as { username?: string } | undefined;
        username = typeof row?.username === "string" ? row.username : null;
      }

      await db.execute({
        sql: `INSERT INTO event_logs (
                occurred_at, level, user_id, username, message, category, details
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [occurredAt, level, userId, username, message, category, detailsJson],
      });

      await pruneEventLogs();

      await appendGithubJsonl({
        at: occurredAt,
        level,
        user: username,
        message,
        event: category && isEventCode(category) ? category : null,
        category,
      });
    } catch (err) {
      console.error("[eventLog] persist failed:", err);
    }
  })();
}

async function pruneEventLogs(): Promise<void> {
  await db.execute({
    sql: `DELETE FROM event_logs
          WHERE id NOT IN (
            SELECT id FROM event_logs
            ORDER BY occurred_at DESC, id DESC
            LIMIT ?
          )`,
    args: [MAX_EVENT_LOG_ENTRIES],
  });
}

function mapEventLogRow(row: Record<string, unknown>): EventLogRow {
  return {
    id: Number(row.id),
    occurredAt: String(row.occurred_at ?? ""),
    level: normalizeLevel(String(row.level ?? "I")),
    userId: row.user_id != null ? Number(row.user_id) : null,
    username: typeof row.username === "string" ? row.username : null,
    message: String(row.message ?? ""),
    category: typeof row.category === "string" ? row.category : null,
    details: typeof row.details === "string" ? row.details : null,
  };
}

export async function listEventLogs(options: {
  limit: number;
  offset: number;
}): Promise<{ events: EventLogRow[]; total: number }> {
  const limit = Math.min(Math.max(1, options.limit), MAX_EVENT_LOG_ENTRIES);
  const offset = Math.max(0, options.offset);

  const [rowsRes, countRes] = await Promise.all([
    db.execute({
      sql: `SELECT id, occurred_at, level, user_id, username, message, category, details
            FROM event_logs
            ORDER BY occurred_at DESC, id DESC
            LIMIT ? OFFSET ?`,
      args: [limit, offset],
    }),
    db.execute({ sql: "SELECT COUNT(*) AS c FROM event_logs", args: [] }),
  ]);

  const total = Number((countRes.rows[0] as { c?: unknown } | undefined)?.c ?? 0);
  const events = rowsRes.rows.map((row) =>
    mapEventLogRow(row as Record<string, unknown>)
  );

  return { events, total };
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Export up to {@link MAX_EVENT_LOG_ENTRIES} rows as CSV (newest first). */
export async function exportEventLogsCsv(): Promise<string> {
  const res = await db.execute({
    sql: `SELECT id, occurred_at, level, user_id, username, message, category, details
          FROM event_logs
          ORDER BY occurred_at DESC, id DESC
          LIMIT ?`,
    args: [MAX_EVENT_LOG_ENTRIES],
  });
  const header =
    "id,occurred_at,level,user_id,username,category,message,details";
  const lines = res.rows.map((row) => {
    const e = mapEventLogRow(row as Record<string, unknown>);
    return [
      String(e.id),
      csvEscape(e.occurredAt),
      csvEscape(e.level),
      e.userId != null ? String(e.userId) : "",
      csvEscape(e.username ?? ""),
      csvEscape(e.category ?? ""),
      csvEscape(e.message),
      csvEscape(e.details ?? ""),
    ].join(",");
  });
  return [header, ...lines].join("\r\n");
}

export async function clearEventLogs(): Promise<number> {
  const countRes = await db.execute({
    sql: "SELECT COUNT(*) AS c FROM event_logs",
    args: [],
  });
  const count = Number((countRes.rows[0] as { c?: unknown } | undefined)?.c ?? 0);
  await db.execute({ sql: "DELETE FROM event_logs", args: [] });
  return count;
}

export function logApiWarning(
  message: string,
  context?: {
    userId?: number;
    event?: EventCode;
    category?: string;
    details?: Record<string, unknown>;
  }
): void {
  if (context?.event) {
    logCatalogEvent(context.event, {
      message,
      userId: context?.userId,
      details: context?.details,
    });
    return;
  }
  logEvent({
    level: "W",
    message,
    userId: context?.userId,
    category: context?.category ?? "api",
    details: context?.details,
  });
}

let serverStartupLogged = false;

/** @internal Vitest only — module-level startup guard. */
export function resetEventLogTestState(): void {
  serverStartupLogged = false;
}

/** Log once per API process when the server boots (deploy / code update). */
export function logServerStartup(): void {
  if (serverStartupLogged) return;
  serverStartupLogged = true;

  const info = getBuildInfo();
  const envPart = info.nodeEnv !== "production" ? ` [${info.nodeEnv}]` : "";
  logCatalogEvent("application_configuration_load_success", {
    message: `API started — ${formatBuildLabel(info)}${envPart}`,
    details: {
      commit: info.commit,
      branch: info.branch,
      version: info.version,
      nodeEnv: info.nodeEnv,
      builtAt: info.builtAt,
    },
  });
}

export function logRelease(
  message: string,
  context?: {
    userId?: number;
    username?: string | null;
    details?: Record<string, unknown>;
  }
): void {
  logCatalogEvent("session_token_renewal", {
    message,
    userId: context?.userId,
    username: context?.username,
    details: context?.details,
  });
}

export function logApiCritical(
  message: string,
  context?: {
    userId?: number;
    event?: EventCode;
    category?: string;
    details?: Record<string, unknown>;
  }
): void {
  if (context?.event) {
    logCatalogEvent(context.event, {
      message,
      userId: context?.userId,
      details: context?.details,
    });
    return;
  }
  logEvent({
    level: "C",
    message,
    userId: context?.userId,
    category: context?.category ?? "system",
    details: context?.details,
  });
}

function parseInsertColumnNames(sql: string, table: string): string[] | null {
  const re = new RegExp(`INSERT\\s+INTO\\s+${table}\\s*\\(([^)]+)\\)`, "i");
  const match = re.exec(sql);
  if (!match) return null;
  return match[1].split(",").map((c) => c.trim().toLowerCase());
}

function argAt(args: unknown[] | undefined, index: number): unknown {
  if (!args || index < 0 || index >= args.length) return undefined;
  return args[index];
}

function formatSongRef(track: unknown, artist: unknown): string | null {
  const t = typeof track === "string" ? track.trim() : "";
  const a = typeof artist === "string" ? artist.trim() : "";
  if (t && a) return `"${t}" by ${a}`;
  if (t) return `"${t}"`;
  return null;
}

function formatNamedRef(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? `"${s}"` : null;
}

async function lookupSongRef(
  userId: number,
  songId: unknown
): Promise<string | null> {
  const id = typeof songId === "number" ? songId : Number(songId);
  if (!Number.isFinite(id) || id <= 0) return null;
  try {
    const res = await db.execute({
      sql: `SELECT track_name, artist_name FROM songs WHERE id = ? AND user_id = ?`,
      args: [id, userId],
    });
    const row = res?.rows?.[0] as
      | { track_name?: string; artist_name?: string }
      | undefined;
    return formatSongRef(row?.track_name, row?.artist_name);
  } catch {
    return null;
  }
}

function songRefFromInsertArgs(
  cols: string[] | null,
  args: unknown[] | undefined
): string | null {
  if (!cols || !args) return null;
  const trackIdx = cols.indexOf("track_name");
  const artistIdx = cols.indexOf("artist_name");
  return formatSongRef(argAt(args, trackIdx), argAt(args, artistIdx));
}

function namedRefFromInsertArgs(
  cols: string[] | null,
  args: unknown[] | undefined,
  column: string
): string | null {
  if (!cols || !args) return null;
  const idx = cols.indexOf(column);
  return formatNamedRef(argAt(args, idx));
}

/** Best-effort audit for scoped SQL executed via /api/execute (call before DELETE so rows can be resolved). */
export async function auditSqlMutation(
  userId: number,
  sql: string,
  username?: string | null,
  args?: unknown[]
): Promise<void> {
  const normalized = sql.replace(/\s+/g, " ").trim();
  const upper = normalized.toUpperCase();
  let message: string | null = null;
  let suffix = "";

  if (/^INSERT\s+INTO\s+SONGS\b/i.test(normalized)) {
    const ref = songRefFromInsertArgs(parseInsertColumnNames(normalized, "songs"), args);
    message = "Added song to repertoire";
    suffix = ref ? `: ${ref}` : "";
  } else if (/^INSERT\s+INTO\s+LOCATIONS\b/i.test(normalized)) {
    const ref = namedRefFromInsertArgs(
      parseInsertColumnNames(normalized, "locations"),
      args,
      "name"
    );
    message = "Added venue";
    suffix = ref ? `: ${ref}` : "";
  } else if (/^INSERT\s+INTO\s+TAGS\b/i.test(normalized)) {
    const ref = namedRefFromInsertArgs(
      parseInsertColumnNames(normalized, "tags"),
      args,
      "name"
    );
    message = "Added tag";
    suffix = ref ? `: ${ref}` : "";
  } else if (/^INSERT\s+INTO\s+PERFORMANCES\b/i.test(normalized)) {
    const cols = parseInsertColumnNames(normalized, "performances");
    const songIdIdx = cols?.indexOf("song_id") ?? -1;
    const ref = await lookupSongRef(userId, argAt(args, songIdIdx));
    message = "Recorded performance";
    suffix = ref ? `: ${ref}` : "";
  } else if (/^UPDATE\s+PERFORMANCES\b/i.test(normalized)) {
    const rawPerfId = argAt(args, 4);
    const perfId =
      typeof rawPerfId === "number"
        ? rawPerfId
        : Number(rawPerfId);
    if (Number.isFinite(perfId) && perfId > 0) {
      try {
        const res = await db.execute({
          sql: `SELECT s.track_name, s.artist_name FROM performances p
                JOIN songs s ON s.id = p.song_id
                WHERE p.id = ? AND p.user_id = ?`,
          args: [perfId, userId],
        });
        const row = res?.rows?.[0] as
          | { track_name?: string; artist_name?: string }
          | undefined;
        const ref = formatSongRef(row?.track_name, row?.artist_name);
        message = "Updated performance";
        suffix = ref ? `: ${ref}` : "";
      } catch {
        message = "Updated performance";
      }
    } else {
      message = "Updated performance";
    }
  } else if (/^DELETE\s+FROM\s+SONGS\b/i.test(normalized)) {
    const ref = await lookupSongRef(userId, argAt(args, 0));
    message = "Removed song from repertoire";
    suffix = ref ? `: ${ref}` : "";
  } else if (/^DELETE\s+FROM\s+LOCATIONS\b/i.test(normalized)) {
    message = "Removed venue";
  } else if (/^DELETE\s+FROM\s+TAGS\b/i.test(normalized)) {
    message = "Removed tag";
  } else if (/^UPDATE\s+SONGS\b/i.test(normalized) && upper.includes(" LYRICS ")) {
    const ref = await lookupSongRef(userId, argAt(args, 1));
    message = "Updated song lyrics";
    suffix = ref ? ` for ${ref}` : "";
  }

  if (!message) return;
  logCatalogEvent("feature_utilization_metrics", {
    userId,
    username,
    message: `${message}${suffix}`,
  });
}
