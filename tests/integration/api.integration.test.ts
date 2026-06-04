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

  it("GET /api/songs returns JSON rows (replaces /api/execute)", async () => {
    await request(app)
      .post("/api/songs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        itunesId: 999002 + userId,
        trackName: "API Test Song",
        artistName: "API Artist",
        artworkUrl: "",
        durationMs: 0,
        releaseDate: "2020",
        explicit: 0,
        album: "",
        releaseYear: 2020,
        lyrics: null,
      });

    const res = await request(app)
      .get("/api/songs")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const song = res.body.songs.find(
      (s: { track_name: string }) => s.track_name === "API Test Song"
    );
    expect(song).toBeDefined();
    expect(song.artist_name).toBe("API Artist");
  });

  it("rejects tenant SQL on /api/execute (Track 2)", async () => {
    const res = await request(app)
      .post("/api/execute")
      .set("Authorization", `Bearer ${token}`)
      .send({
        sql: "DELETE FROM songs WHERE id = ?",
        args: [1],
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/repertoire API/i);
  });

  it("allows SELECT 1 on /api/execute", async () => {
    const res = await request(app)
      .post("/api/execute")
      .set("Authorization", `Bearer ${token}`)
      .send({ sql: "SELECT 1", args: [] });
    expect(res.status).toBe(200);
  });
});
