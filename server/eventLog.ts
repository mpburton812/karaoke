import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./db.js";
import { formatBuildLabel, getBuildInfo } from "./buildInfo.js";

export type EventLevel = "C" | "W" | "I";

export interface LogEventInput {
  level: EventLevel;
  message: string;
  userId?: number | null;
  username?: string | null;
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
  category: string | null;
}

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

async function appendGithubJsonl(entry: {
  at: string;
  level: EventLevel;
  user: string | null;
  message: string;
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
 * Structured application event (RFC 5424–style severities mapped to C / W / I).
 * Persists to Turso and appends to logs/application-events.jsonl for GitHub review.
 */
export function logEvent(input: LogEventInput): void {
  const level = normalizeLevel(input.level);
  const occurredAt = nowIso();
  const message = input.message.trim().slice(0, 2000);
  if (!message) return;

  const category = input.category?.trim().slice(0, 64) || null;
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

      await appendGithubJsonl({
        at: occurredAt,
        level,
        user: username,
        message,
        category,
      });
    } catch (err) {
      console.error("[eventLog] persist failed:", err);
    }
  })();
}

export async function listEventLogs(options: {
  limit: number;
  offset: number;
}): Promise<{ events: EventLogRow[]; total: number }> {
  const limit = Math.min(Math.max(1, options.limit), 100);
  const offset = Math.max(0, options.offset);

  const [rowsRes, countRes] = await Promise.all([
    db.execute({
      sql: `SELECT id, occurred_at, level, user_id, username, message, category
            FROM event_logs
            ORDER BY occurred_at DESC, id DESC
            LIMIT ? OFFSET ?`,
      args: [limit, offset],
    }),
    db.execute({ sql: "SELECT COUNT(*) AS c FROM event_logs", args: [] }),
  ]);

  const total = Number((countRes.rows[0] as { c?: unknown } | undefined)?.c ?? 0);
  const events = rowsRes.rows.map((row) => {
    const o = row as Record<string, unknown>;
    return {
      id: Number(o.id),
      occurredAt: String(o.occurred_at ?? ""),
      level: normalizeLevel(String(o.level ?? "I")),
      userId: o.user_id != null ? Number(o.user_id) : null,
      username: typeof o.username === "string" ? o.username : null,
      message: String(o.message ?? ""),
      category: typeof o.category === "string" ? o.category : null,
    };
  });

  return { events, total };
}

export function logApiWarning(
  message: string,
  context?: { userId?: number; category?: string; details?: Record<string, unknown> }
): void {
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
  logEvent({
    level: "I",
    message: `API started — ${formatBuildLabel(info)}${envPart}`,
    category: "release",
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
  context?: { userId?: number; username?: string | null; details?: Record<string, unknown> }
): void {
  logEvent({
    level: "I",
    message,
    userId: context?.userId,
    username: context?.username,
    category: "release",
    details: context?.details,
  });
}

export function logApiCritical(
  message: string,
  context?: { userId?: number; category?: string; details?: Record<string, unknown> }
): void {
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
  let category = "data";
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
  logEvent({ level: "I", userId, username, message: `${message}${suffix}`, category });
}
