import { db } from "./db.js";

export const MOTD_MAX_LENGTH = 255;

export class MotdError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "MotdError";
    this.status = status;
  }
}

export type MotdRow = {
  id: number;
  body: string;
  expiresAt: string;
  createdAt: string;
  createdBy: number | null;
  clearedAt: string | null;
  seenCount: number;
};

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Add one calendar month to a YYYY-MM-DD (or now) in UTC date terms. */
export function defaultMotdExpiresAt(from: Date = new Date()): string {
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  );
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function normalizeExpiresAt(input: string | null | undefined): string {
  if (input == null || String(input).trim() === "") {
    return defaultMotdExpiresAt();
  }
  const raw = String(input).trim();
  const dateOnly = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    throw new MotdError("expiresAt must be a YYYY-MM-DD date.");
  }
  const t = Date.parse(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(t)) {
    throw new MotdError("expiresAt is not a valid date.");
  }
  return dateOnly;
}

function mapMotdRow(
  row: Record<string, unknown>,
  seenCount = 0
): MotdRow {
  return {
    id: Number(row.id),
    body: String(row.body ?? ""),
    expiresAt: String(row.expires_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    createdBy:
      row.created_by == null || row.created_by === ""
        ? null
        : Number(row.created_by),
    clearedAt:
      row.cleared_at == null || row.cleared_at === ""
        ? null
        : String(row.cleared_at),
    seenCount,
  };
}

/** Latest uncleared MOTD whose expire date is today or later (UTC date). */
export async function getActiveMotd(): Promise<MotdRow | null> {
  const today = todayUtcDate();
  const res = await db.execute({
    sql: `SELECT * FROM admin_motd
          WHERE cleared_at IS NULL
            AND expires_at >= ?
          ORDER BY id DESC
          LIMIT 1`,
    args: [today],
  });
  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const countRes = await db.execute({
    sql: `SELECT COUNT(*) as count FROM admin_motd_seen WHERE motd_id = ?`,
    args: [Number(row.id)],
  });
  const seenCount = Number(
    (countRes.rows[0] as { count?: number })?.count ?? 0
  );
  return mapMotdRow(row, seenCount);
}

export async function getAdminMotdStatus(): Promise<MotdRow | null> {
  return getActiveMotd();
}

export async function publishMotd(
  adminUserId: number,
  message: string,
  expiresAt?: string | null
): Promise<MotdRow> {
  const body = String(message ?? "").trim();
  if (!body) {
    throw new MotdError("Message is required.");
  }
  if (body.length > MOTD_MAX_LENGTH) {
    throw new MotdError(`Message must be at most ${MOTD_MAX_LENGTH} characters.`);
  }
  const expires = normalizeExpiresAt(expiresAt);
  const nowIso = new Date().toISOString();

  const active = await getActiveMotd();
  if (active) {
    await db.execute({
      sql: `UPDATE admin_motd SET cleared_at = ? WHERE id = ? AND cleared_at IS NULL`,
      args: [nowIso, active.id],
    });
  }

  const insert = await db.execute({
    sql: `INSERT INTO admin_motd (body, expires_at, created_by)
          VALUES (?, ?, ?)
          RETURNING *`,
    args: [body, expires, adminUserId],
  });
  const row = insert.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw new MotdError("Failed to publish MOTD.", 500);
  }
  return mapMotdRow(row, 0);
}

/** Auto-expire now: clear active MOTD so unseen users never see it. */
export async function expireMotdNow(): Promise<{ cleared: boolean }> {
  const active = await getActiveMotd();
  if (!active) {
    return { cleared: false };
  }
  const nowIso = new Date().toISOString();
  await db.execute({
    sql: `UPDATE admin_motd SET cleared_at = ? WHERE id = ? AND cleared_at IS NULL`,
    args: [nowIso, active.id],
  });
  return { cleared: true };
}

export async function getMotdForUser(
  userId: number
): Promise<{ id: number; body: string; expiresAt: string } | null> {
  const active = await getActiveMotd();
  if (!active) return null;

  const seen = await db.execute({
    sql: `SELECT 1 FROM admin_motd_seen WHERE motd_id = ? AND user_id = ? LIMIT 1`,
    args: [active.id, userId],
  });
  if (seen.rows.length > 0) return null;

  return {
    id: active.id,
    body: active.body,
    expiresAt: active.expiresAt,
  };
}

export async function ackMotd(userId: number, motdId?: number): Promise<void> {
  const active = await getActiveMotd();
  if (!active) {
    throw new MotdError("No active MOTD to acknowledge.", 404);
  }
  if (motdId != null && Number(motdId) !== active.id) {
    throw new MotdError("MOTD is no longer active.", 409);
  }
  await db.execute({
    sql: `INSERT INTO admin_motd_seen (motd_id, user_id)
          VALUES (?, ?)
          ON CONFLICT(motd_id, user_id) DO NOTHING`,
    args: [active.id, userId],
  });
}
