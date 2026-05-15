import "dotenv/config";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import { createApp } from "../../server/app.js";

const url = process.env.TURSO_DATABASE_URL || process.env.VITE_TURSO_DATABASE_URL;
const authToken =
  process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN;

const canRun = Boolean(url && authToken && process.env.JWT_SECRET);

describe.skipIf(!canRun)("API + Turso integration", () => {
  const app = createApp();
  const db = createClient({ url: url!, authToken: authToken! });
  const username = `api_integration_${Date.now()}`;
  const password = "integration-test-password";
  let userId: number;
  let token: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash(password, 12);
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
      { sql: "DELETE FROM songs WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM users WHERE id = ?", args: [userId] },
    ]);
  });

  it("GET /api/health reports turso configured", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.turso).toBe(true);
  });

  it("POST /api/auth/login returns a token", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username, password });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(userId);
    token = res.body.token;
    expect(typeof token).toBe("string");
  });

  it("POST /api/execute returns named row objects via JSON", async () => {
    await db.execute({
      sql: `INSERT INTO songs (user_id, itunes_id, track_name, artist_name)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, itunes_id) DO NOTHING`,
      args: [userId, 999002, "API Test Song", "API Artist"],
    });

    const res = await request(app)
      .post("/api/execute")
      .set("Authorization", `Bearer ${token}`)
      .send({
        sql: "SELECT id, track_name FROM songs WHERE user_id = ? AND itunes_id = ?",
        args: [userId, 999002],
      });

    expect(res.status).toBe(200);
    expect(res.body.columns).toContain("track_name");
    const row = res.body.rows[0];
    expect(Array.isArray(row)).toBe(true);
    expect(row[1]).toBe("API Test Song");
  });

  it("rejects unscoped DELETE on songs", async () => {
    const res = await request(app)
      .post("/api/execute")
      .set("Authorization", `Bearer ${token}`)
      .send({
        sql: "DELETE FROM songs WHERE id = ?",
        args: [1],
      });

    expect(res.status).toBe(403);
  });
});
