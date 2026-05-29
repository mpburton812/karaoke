import "dotenv/config";
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TURSO_DATABASE_URL || process.env.VITE_TURSO_DATABASE_URL;
const authToken =
  process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN;

const canRun = Boolean(url && authToken);

describe.skipIf(!canRun)("Turso integration", () => {
  const db = createClient({ url: url!, authToken: authToken! });
  const username = `integration_${Date.now()}`;
  let userId: number;

  beforeAll(async () => {
    const hash = await bcrypt.hash("integration-test-password", 12);
    const result = await db.execute({
      sql: "INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id",
      args: [username, hash],
    });
    const row = result.rows[0];
    userId = Number(
      Array.isArray(row) ? row[0] : (row as { id: number }).id
    );
  });

  afterAll(async () => {
    if (!userId) return;
    await db.batch([
      {
        sql: "DELETE FROM performance_tags WHERE performance_id IN (SELECT id FROM performances WHERE user_id = ?)",
        args: [userId],
      },
      {
        sql: "DELETE FROM song_tags WHERE song_id IN (SELECT id FROM songs WHERE user_id = ?)",
        args: [userId],
      },
      { sql: "DELETE FROM performances WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM songs WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM tags WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM locations WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM users WHERE id = ?", args: [userId] },
    ]);
  });

  it("connects to Turso", async () => {
    const result = await db.execute("SELECT 1 AS ok");
    expect(Number((result.rows[0] as { ok: number }).ok)).toBe(1);
  });

  it("enforces unique (user_id, itunes_id) on songs", async () => {
    const insert = `INSERT INTO songs (user_id, itunes_id, track_name, artist_name)
      VALUES (?, ?, ?, ?)`;
    await db.execute({
      sql: insert,
      args: [userId, 999001, "Integration Track", "Test Artist"],
    });
    await db.execute({
      sql: `${insert} ON CONFLICT(user_id, itunes_id) DO UPDATE SET track_name = excluded.track_name`,
      args: [userId, 999001, "Integration Track Updated", "Test Artist"],
    });

    const count = await db.execute({
      sql: "SELECT COUNT(*) AS c FROM songs WHERE user_id = ? AND itunes_id = ?",
      args: [userId, 999001],
    });
    expect(Number((count.rows[0] as { c: number }).c)).toBe(1);

    const song = await db.execute({
      sql: "SELECT track_name FROM songs WHERE user_id = ? AND itunes_id = ?",
      args: [userId, 999001],
    });
    expect((song.rows[0] as { track_name: string }).track_name).toBe(
      "Integration Track Updated"
    );
  });

});
