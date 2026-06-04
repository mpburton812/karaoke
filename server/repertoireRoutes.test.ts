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

vi.mock("./songEnrichment.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./songEnrichment.js")>();
  return {
    ...actual,
    adminReenrichAllUsersSequentially: vi.fn(),
    scheduleAdminReenrichAllUsersBackground: vi.fn(),
  };
});

vi.mock("./eventLog.js", () => ({
  logEvent: vi.fn(),
  logCatalogEvent: vi.fn(),
  logApiWarning: vi.fn(),
  logApiCritical: vi.fn(),
  auditSqlMutation: vi.fn().mockResolvedValue(undefined),
  listEventLogs: vi.fn().mockResolvedValue({ events: [], total: 0 }),
}));

import { createApp } from "./app.js";
import { signToken } from "./auth.js";

const USER_ID = 42;
const OTHER_USER = 99;

let app: Express;

function auth(userId = USER_ID) {
  return { Authorization: `Bearer ${signToken({ id: userId, username: "tester" })}` };
}

/** Simulate owned row for ownership checks. */
function owned() {
  return { rows: [{ "1": 1 }] };
}

beforeAll(() => {
  app = createApp();
});

describe("Repertoire API (Track 2)", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockBatch.mockReset();
  });

  describe("authentication", () => {
    it("GET /api/songs requires auth", async () => {
      const res = await request(app).get("/api/songs");
      expect(res.status).toBe(401);
    });
  });

  describe("songs", () => {
    it("GET /api/songs returns repertoire rows", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: 1, track_name: "Song A", artist_name: "Artist" }],
      });
      const res = await request(app)
        .get("/api/songs")
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.songs).toHaveLength(1);
    });

    it("GET /api/songs/:id returns 404 when missing", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .get("/api/songs/404")
        .set(auth());
      expect(res.status).toBe(404);
    });

    it("POST /api/songs/check-duplicate validates body", async () => {
      const res = await request(app)
        .post("/api/songs/check-duplicate")
        .set(auth())
        .send({});
      expect(res.status).toBe(400);
    });

    it("PATCH /api/songs/:id returns 404 when not owned", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .patch("/api/songs/7")
        .set(auth())
        .send({ vocal_status: "Mastered" });
      expect(res.status).toBe(404);
    });

    it("PATCH /api/songs/:id updates allowed fields", async () => {
      mockExecute
        .mockResolvedValueOnce(owned())
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .patch("/api/songs/7")
        .set(auth())
        .send({ vocal_status: "Mastered" });
      expect(res.status).toBe(200);
      expect(mockExecute.mock.calls[1][0].sql).toMatch(/UPDATE songs SET vocal_status/);
    });

    it("DELETE /api/songs/:id removes owned song", async () => {
      mockExecute
        .mockResolvedValueOnce(owned())
        .mockResolvedValueOnce({ rows: [], rowsAffected: 1 });
      const res = await request(app)
        .delete("/api/songs/7")
        .set(auth());
      expect(res.status).toBe(200);
    });
  });

  describe("song tags", () => {
    it("POST /api/songs/:id/tags requires tagId", async () => {
      mockExecute.mockResolvedValueOnce(owned());
      const res = await request(app)
        .post("/api/songs/1/tags")
        .set(auth())
        .send({});
      expect(res.status).toBe(400);
    });

    it("POST /api/songs/:id/tags links tag when owned", async () => {
      mockExecute
        .mockResolvedValueOnce(owned())
        .mockResolvedValueOnce(owned())
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .post("/api/songs/1/tags")
        .set(auth())
        .send({ tagId: 3 });
      expect(res.status).toBe(200);
    });
  });

  describe("performances", () => {
    it("POST /api/songs/:id/performances creates a performance", async () => {
      mockExecute
        .mockResolvedValueOnce(owned())
        .mockResolvedValueOnce({ rows: [{ id: 50 }] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .post("/api/songs/1/performances")
        .set(auth())
        .send({
          date: "2026-05-20",
          location: "Bar",
          notes: "",
          rating: 4,
          tagIds: [],
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe(50);
    });

    it("DELETE /api/performances/:id returns 404 when not owned", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .delete("/api/performances/9")
        .set(auth());
      expect(res.status).toBe(404);
    });
  });

  describe("tags", () => {
    it("GET /api/tags?counts=1 returns tag aggregates", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: 1, name: "Rock", count: 2 }],
      });
      const res = await request(app)
        .get("/api/tags?counts=1")
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.tags[0].count).toBe(2);
    });

    it("GET /api/tags/songs filters by tag ids", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: 1, track_name: "A", artist_name: "B", artwork_url: "", genre: null }],
      });
      const res = await request(app)
        .get("/api/tags/songs?tagIds=1,2&logic=OR")
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.songs).toHaveLength(1);
    });

    it("DELETE /api/tags/:id requires ownership", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .delete("/api/tags/5")
        .set(auth());
      expect(res.status).toBe(404);
    });
  });

  describe("locations", () => {
    it("POST /api/locations creates a venue", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .post("/api/locations")
        .set(auth())
        .send({ name: "Karaoke Bar" });
      expect(res.status).toBe(201);
    });

    it("GET /api/locations/:id/stats requires name query", async () => {
      mockExecute.mockResolvedValueOnce(owned());
      const res = await request(app)
        .get("/api/locations/1/stats")
        .set(auth());
      expect(res.status).toBe(400);
    });
  });

  describe("stats", () => {
    it("GET /api/stats/dashboard returns aggregates", async () => {
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              totalSongs: 1,
              totalPerformances: 2,
              avgRating: 4,
              uniqueVenues: 1,
              masteredCount: 0,
              proficientCount: 1,
              practicingCount: 0,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .get("/api/stats/dashboard")
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.global.totalSongs).toBe(1);
    });
  });

  describe("portability", () => {
    it("GET /api/portability/users is rejected", async () => {
      const res = await request(app)
        .get("/api/portability/users")
        .set(auth());
      expect(res.status).toBe(400);
    });

    it("GET /api/portability/songs exports rows", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: 1, track_name: "X", user_id: USER_ID }],
      });
      const res = await request(app)
        .get("/api/portability/songs")
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.rows).toHaveLength(1);
    });
  });

  describe("account wipe", () => {
    it("POST /api/account/wipe runs batch deletes for the session user", async () => {
      mockBatch.mockResolvedValueOnce([]);
      const res = await request(app)
        .post("/api/account/wipe")
        .set(auth(USER_ID));
      expect(res.status).toBe(200);
      expect(mockBatch).toHaveBeenCalledOnce();
      const args = (mockBatch.mock.calls[0][0] as { args: unknown[] }[])[0]
        ?.args;
      expect(args).toContain(USER_ID);
    });

    it("does not accept user id in body (always session user)", async () => {
      mockBatch.mockResolvedValueOnce([]);
      await request(app)
        .post("/api/account/wipe")
        .set(auth(USER_ID))
        .send({ userId: OTHER_USER });
      const stmts = mockBatch.mock.calls[0][0] as { args: unknown[] }[];
      for (const s of stmts) {
        expect(s.args).not.toContain(OTHER_USER);
      }
    });
  });

  describe("legacy /api/execute lockdown", () => {
    it("blocks SELECT on songs", async () => {
      const res = await request(app)
        .post("/api/execute")
        .set(auth())
        .send({ sql: "SELECT * FROM songs", args: [] });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/repertoire API/);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("still allows SELECT 1", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
      const res = await request(app)
        .post("/api/execute")
        .set(auth())
        .send({ sql: "SELECT 1", args: [] });
      expect(res.status).toBe(200);
    });
  });
});
