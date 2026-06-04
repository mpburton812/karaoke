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

describe.skipIf(!canRun)("Repertoire API + Turso integration (Track 2)", () => {
  const app = createApp();
  const db = createClient({ url: url!, authToken: authToken! });
  const username = `repertoire_${Date.now()}`;
  const otherUsername = `repertoire_other_${Date.now()}`;
  const password = "integration-test-password";
  let userId: number;
  let otherUserId: number;
  let token: string;
  let otherToken: string;
  let songId: number;
  let tagId: number;

  beforeAll(async () => {
    const hash = await bcrypt.hash(password, 12);
    for (const name of [username, otherUsername]) {
      const result = await db.execute({
        sql: "INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id",
        args: [name, hash],
      });
      const row = result.rows[0] as { id: number };
      if (name === username) userId = row.id;
      else otherUserId = row.id;
    }

    const login = await request(app)
      .post("/api/auth/login")
      .send({ username, password });
    token = login.body.token;

    const otherLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: otherUsername, password });
    otherToken = otherLogin.body.token;
  });

  afterAll(async () => {
    for (const id of [userId, otherUserId]) {
      if (!id) continue;
      await db.batch([
        {
          sql: "DELETE FROM performance_tags WHERE performance_id IN (SELECT id FROM performances WHERE user_id = ?)",
          args: [id],
        },
        { sql: "DELETE FROM performances WHERE user_id = ?", args: [id] },
        { sql: "DELETE FROM song_tags WHERE song_id IN (SELECT id FROM songs WHERE user_id = ?)", args: [id] },
        { sql: "DELETE FROM songs WHERE user_id = ?", args: [id] },
        { sql: "DELETE FROM tags WHERE user_id = ?", args: [id] },
        { sql: "DELETE FROM locations WHERE user_id = ?", args: [id] },
        { sql: "DELETE FROM users WHERE id = ?", args: [id] },
      ]);
    }
  });

  it("POST /api/songs creates a song", async () => {
    const res = await request(app)
      .post("/api/songs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        itunesId: 880001 + userId,
        trackName: "Integration Track",
        artistName: "Integration Artist",
        artworkUrl: "https://example.com/a.jpg",
        durationMs: 200000,
        releaseDate: "2020-01-01",
        explicit: 0,
        album: "Album",
        releaseYear: 2020,
        lyrics: null,
      });
    expect(res.status).toBe(201);
    songId = res.body.id;
    expect(typeof songId).toBe("number");
  });

  it("GET /api/songs lists the new song", async () => {
    const res = await request(app)
      .get("/api/songs")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.songs.some((s: { id: number }) => s.id === songId)).toBe(
      true
    );
  });

  it("PATCH /api/songs/:id updates vocal_status", async () => {
    const res = await request(app)
      .patch(`/api/songs/${songId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ vocal_status: "Proficient" });
    expect(res.status).toBe(200);
  });

  it("POST /api/tags and link to song", async () => {
    const create = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `int-tag-${userId}` });
    expect(create.status).toBe(201);

    const tags = await request(app)
      .get("/api/tags")
      .set("Authorization", `Bearer ${token}`);
    tagId = tags.body.tags.find(
      (t: { name: string }) => t.name === `int-tag-${userId}`
    )?.id;
    expect(tagId).toBeDefined();

    const link = await request(app)
      .post(`/api/songs/${songId}/tags`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tagId });
    expect(link.status).toBe(200);
  });

  it("GET /api/tags/songs finds song by tag", async () => {
    const res = await request(app)
      .get(`/api/tags/songs?tagIds=${tagId}&logic=OR`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.songs.some((s: { id: number }) => s.id === songId)).toBe(
      true
    );
  });

  it("POST /api/songs/:id/performances records a performance", async () => {
    const res = await request(app)
      .post(`/api/songs/${songId}/performances`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-05-20",
        location: "Test Venue",
        notes: "Great night",
        rating: 5,
        tagIds: [tagId],
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeGreaterThan(0);
  });

  it("GET /api/stats/dashboard includes the song", async () => {
    const res = await request(app)
      .get("/api/stats/dashboard")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.global.totalSongs).toBeGreaterThanOrEqual(1);
    expect(res.body.global.totalPerformances).toBeGreaterThanOrEqual(1);
  });

  it("cannot PATCH another users song (IDOR)", async () => {
    const res = await request(app)
      .patch(`/api/songs/${songId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ vocal_status: "Mastered" });
    expect(res.status).toBe(404);
  });

  it("POST /api/execute rejects tenant SQL (Track 2 lockdown)", async () => {
    const res = await request(app)
      .post("/api/execute")
      .set("Authorization", `Bearer ${token}`)
      .send({
        sql: "SELECT id FROM songs WHERE user_id = ?",
        args: [userId],
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/repertoire API/i);
  });

  it("POST /api/execute still allows SELECT 1", async () => {
    const res = await request(app)
      .post("/api/execute")
      .set("Authorization", `Bearer ${token}`)
      .send({ sql: "SELECT 1", args: [] });
    expect(res.status).toBe(200);
  });

  it("DELETE /api/songs/:id removes the song", async () => {
    const res = await request(app)
      .delete(`/api/songs/${songId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
