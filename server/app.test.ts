import bcrypt from "bcryptjs";
import type { Express } from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute, mockBatch } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockBatch: vi.fn(),
}));

vi.mock("./db.js", () => ({
  db: { execute: mockExecute, batch: mockBatch },
  tursoConfigured: true,
}));

import { createApp } from "./app.js";
import { signToken } from "./auth.js";

let app: Express;
const USER_ID = 42;

beforeAll(() => {
  app = createApp();
});

describe("API routes", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockBatch.mockReset();
  });

  describe("GET /api/health", () => {
    it("returns ok and turso status", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, turso: true });
    });
  });

  describe("POST /api/auth/login", () => {
    it("returns 400 when fields are missing", async () => {
      const res = await request(app).post("/api/auth/login").send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });

    it("returns token for valid credentials", async () => {
      const hash = await bcrypt.hash("password123", 12);
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: USER_ID, username: "tester", password_hash: hash }],
      });

      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "tester", password: "password123" });

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({
        id: USER_ID,
        username: "tester",
        accessLevel: "user",
      });
      expect(typeof res.body.token).toBe("string");
    });
  });

  describe("POST /api/auth/change-password", () => {
    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/auth/change-password")
        .send({ currentPassword: "a", newPassword: "b" });
      expect(res.status).toBe(401);
    });

    it("changes password for authenticated user", async () => {
      const hash = await bcrypt.hash("oldpass12", 12);
      mockExecute
        .mockResolvedValueOnce({
          rows: [{ id: USER_ID, username: "tester", password_hash: hash }],
        })
        .mockResolvedValueOnce({ rowsAffected: 1 });

      const token = signToken({ id: USER_ID, username: "tester" });
      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: "oldpass12", newPassword: "newpass123" });

      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe("tester");
      expect(typeof res.body.token).toBe("string");
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns current user with access level", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: USER_ID, username: "tester", access_level: "admin" }],
      });

      const token = signToken({ id: USER_ID, username: "tester", accessLevel: "admin" });
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({
        id: USER_ID,
        username: "tester",
        accessLevel: "admin",
      });
    });
  });

  describe("God Mode admin routes", () => {
    it("rejects non-admin users", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: USER_ID, username: "tester", access_level: "user" }],
      });

      const token = signToken({ id: USER_ID, username: "tester", accessLevel: "user" });
      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it("lists users for admins", async () => {
      mockExecute
        .mockResolvedValueOnce({
          rows: [{ id: USER_ID, username: "mpburton", access_level: "admin" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 7,
              username: "singer",
              access_level: "user",
              last_login_at: "2026-05-17T00:00:00Z",
              last_performance_at: "2026-05-16",
              song_count: 3,
              tag_count: 2,
              venue_count: 1,
            },
          ],
        });

      const token = signToken({ id: USER_ID, username: "mpburton", accessLevel: "admin" });
      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.users).toEqual([
        {
          id: 7,
          username: "singer",
          accessLevel: "user",
          lastLoginAt: "2026-05-17T00:00:00Z",
          lastPerformanceAt: "2026-05-16",
          songCount: 3,
          tagCount: 2,
          venueCount: 1,
        },
      ]);
    });
  });

  describe("Enrichment API", () => {
    it("GET /api/enrichment/status returns counters for authenticated user", async () => {
      mockExecute
        .mockResolvedValueOnce({ rows: [{ c: 2 }] })
        .mockResolvedValueOnce({ rows: [{ c: 5 }] });

      const token = signToken({ id: USER_ID, username: "tester" });
      const res = await request(app)
        .get("/api/enrichment/status")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.pending).toBe(2);
      expect(res.body.totalSongs).toBe(5);
      expect(res.body.running).toBe(false);
    });

    it("POST /api/enrichment/run starts an empty enrichment scan", async () => {
      mockExecute
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ c: 0 }] })
        .mockResolvedValueOnce({ rows: [{ c: 0 }] });

      const token = signToken({ id: USER_ID, username: "tester" });
      const res = await request(app)
        .post("/api/enrichment/run")
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.running).toBe(false);
      expect(res.body.message).toBe("No songs need enrichment.");
    });
  });

  describe("KaraFun sync", () => {
    beforeEach(() => {
      vi.unstubAllGlobals();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("syncs the KaraFun catalog on the server", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            'id;title;artist;duration;year;foo;bar;styles\n1;"Song";"Artist";180;;;;"Pop"',
            { status: 200 }
          )
        )
      );
      mockExecute
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      mockBatch.mockResolvedValueOnce([{ rows: [] }]);

      const token = signToken({ id: USER_ID, username: "tester" });
      const res = await request(app)
        .post("/api/karafun/sync")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.source).toBe("direct");
      expect(res.body.warnings).toEqual([]);
      expect(typeof res.body.updatedAt).toBe("string");
      expect(mockExecute).toHaveBeenCalledWith("DELETE FROM karafun_catalog");
      expect(mockBatch).toHaveBeenCalledTimes(1);
    });

    it("falls back to the proxy when direct KaraFun download returns 404", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn()
          .mockResolvedValueOnce(new Response("not found", { status: 404 }))
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                contents:
                  'id;title;artist;duration;year;foo;bar;styles\n2;"Fallback";"Singer";200;;;;"Rock"',
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
          )
      );
      mockExecute
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      mockBatch.mockResolvedValueOnce([{ rows: [] }]);

      const token = signToken({ id: USER_ID, username: "tester" });
      const res = await request(app)
        .post("/api/karafun/sync")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.source).toBe("proxy");
      expect(res.body.warnings[0]).toContain("Direct KaraFun download failed");
      expect(mockBatch).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /api/execute", () => {
    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/execute")
        .send({ sql: "SELECT 1", args: [] });
      expect(res.status).toBe(401);
    });

    it("rejects DELETE without user_id scope", async () => {
      const token = signToken({ id: USER_ID, username: "tester" });
      const res = await request(app)
        .post("/api/execute")
        .set("Authorization", `Bearer ${token}`)
        .send({ sql: "DELETE FROM songs WHERE id = ?", args: [1] });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/user_id/);
    });

    it("runs allowed scoped DELETE", async () => {
      mockExecute.mockResolvedValueOnce({
        columns: [],
        columnTypes: [],
        rows: [],
        rowsAffected: 1,
        lastInsertRowid: null,
      });

      const token = signToken({ id: USER_ID, username: "tester" });
      const res = await request(app)
        .post("/api/execute")
        .set("Authorization", `Bearer ${token}`)
        .send({
          sql: "DELETE FROM songs WHERE id = ? AND user_id = ?",
          args: [1, USER_ID],
        });

      expect(res.status).toBe(200);
      expect(res.body.rowsAffected).toBe(1);
    });
  });

  describe("POST /api/batch", () => {
    it("rejects batch with unscoped user delete", async () => {
      const token = signToken({ id: USER_ID, username: "tester" });
      const res = await request(app)
        .post("/api/batch")
        .set("Authorization", `Bearer ${token}`)
        .send({
          statements: [
            {
              sql: "DELETE FROM performances WHERE id = ?",
              args: [9],
            },
          ],
        });

      expect(res.status).toBe(403);
    });

    it("runs batch with scoped statements", async () => {
      mockBatch.mockResolvedValueOnce([
        { rowsAffected: 1, columns: [], columnTypes: [], rows: [], lastInsertRowid: null },
      ]);

      const token = signToken({ id: USER_ID, username: "tester" });
      const res = await request(app)
        .post("/api/batch")
        .set("Authorization", `Bearer ${token}`)
        .send({
          statements: [
            {
              sql: "DELETE FROM songs WHERE user_id = ?",
              args: [USER_ID],
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
    });
  });

  describe("Spotify OAuth", () => {
    beforeEach(() => {
      vi.unstubAllEnvs();
    });

    it("POST /api/spotify/connect returns 503 when not configured", async () => {
      const token = signToken({ id: USER_ID, username: "tester" });
      const res = await request(app)
        .post("/api/spotify/connect")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/not configured/i);
    });

    it("POST /api/spotify/connect returns authorize URL when configured", async () => {
      vi.stubEnv("SPOTIFY_CLIENT_ID", "test_client_id");
      vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test_secret");
      vi.stubEnv(
        "SPOTIFY_REDIRECT_URI",
        "http://127.0.0.1:3001/api/spotify/callback"
      );
      vi.stubEnv("PUBLIC_APP_URL", "http://127.0.0.1:5173");

      const token = signToken({ id: USER_ID, username: "tester" });
      const res = await request(app)
        .post("/api/spotify/connect")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(typeof res.body.url).toBe("string");
      expect(res.body.url).toContain("accounts.spotify.com/authorize");
      expect(res.body.url).toContain("user-read-private");
      expect(res.body.url).toContain("playlist-read-private");
      expect(res.body.url).toContain("code_challenge_method=S256");
      expect(res.body.url).toContain("code_challenge=");
    });

    it("GET /api/spotify/diagnostics returns recent sanitized entries", async () => {
      vi.stubEnv("SPOTIFY_CLIENT_ID", "test_client_id");
      vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test_secret");
      vi.stubEnv(
        "SPOTIFY_REDIRECT_URI",
        "http://127.0.0.1:3001/api/spotify/callback"
      );
      vi.stubEnv("PUBLIC_APP_URL", "http://127.0.0.1:5173");

      const token = signToken({ id: USER_ID, username: "tester" });
      await request(app)
        .post("/api/spotify/connect")
        .set("Authorization", `Bearer ${token}`);

      const res = await request(app)
        .get("/api/spotify/diagnostics")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.diagnostics[0]).toMatchObject({
        event: "oauth.connect.created",
        userId: USER_ID,
      });
      expect(JSON.stringify(res.body.diagnostics)).not.toContain("test_secret");
    });
  });
});
