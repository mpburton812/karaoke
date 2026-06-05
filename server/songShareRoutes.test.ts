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
  return {
    Authorization: `Bearer ${signToken({
      id: userId,
      username: userId === USER_ID ? "tester" : "other",
    })}`,
  };
}

const snapshot = JSON.stringify({
  track_name: "Shared Track",
  artist_name: "Shared Artist",
  itunes_id: 4242,
});

function shareRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    sender_user_id: USER_ID,
    recipient_user_id: OTHER_USER,
    sender_song_id: 10,
    song_snapshot: snapshot,
    send_message: "Check this out",
    status: "pending",
    sender_username: "tester",
    recipient_username: "other",
    intro_ack_at: null,
    preview_resolved_at: null,
    responded_at: null,
    response_message: null,
    sender_reply_ack_at: null,
    created_at: "2026-01-01",
    ...overrides,
  };
}

beforeAll(() => {
  app = createApp();
});

describe("Song share API", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockBatch.mockReset();
  });

  describe("authentication", () => {
    it("GET /api/song-shares/inbox requires auth", async () => {
      const res = await request(app).get("/api/song-shares/inbox");
      expect(res.status).toBe(401);
    });
  });

  describe("user directory and preferences", () => {
    it("GET /api/users/directory excludes self", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: OTHER_USER, username: "other" }],
      });
      const res = await request(app).get("/api/users/directory").set(auth());
      expect(res.status).toBe(200);
      expect(res.body.users).toEqual([{ id: OTHER_USER, username: "other" }]);
    });

    it("GET /api/users/me/preferences returns notifications flag", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ notifications_enabled: 1 }],
      });
      const res = await request(app)
        .get("/api/users/me/preferences")
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.notificationsEnabled).toBe(true);
    });

    it("PATCH /api/users/me/preferences updates notifications", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .patch("/api/users/me/preferences")
        .set(auth())
        .send({ notificationsEnabled: false });
      expect(res.status).toBe(200);
      expect(res.body.notificationsEnabled).toBe(false);
    });

    it("GET /api/users/me/share-stats returns counts", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ sent: 2, received: 5 }],
      });
      const res = await request(app)
        .get("/api/users/me/share-stats")
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ sent: 2, received: 5 });
    });
  });

  describe("POST /api/song-shares", () => {
    it("creates a share when song exists", async () => {
      mockExecute
        .mockResolvedValueOnce({ rows: [{ id: OTHER_USER }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 10,
              track_name: "Shared Track",
              artist_name: "Shared Artist",
              itunes_id: 4242,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 77 }] });
      const res = await request(app)
        .post("/api/song-shares")
        .set(auth())
        .send({
          recipientUserId: OTHER_USER,
          songId: 10,
          message: "For you",
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe(77);
    });

    it("returns 400 when recipientUserId is missing", async () => {
      const res = await request(app)
        .post("/api/song-shares")
        .set(auth())
        .send({ songId: 10, message: "" });
      expect(res.status).toBe(400);
    });
  });

  describe("inbox and notifications", () => {
    it("GET /api/song-shares/inbox lists received shares", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [shareRow()] });
      const res = await request(app)
        .get("/api/song-shares/inbox")
        .set(auth(OTHER_USER));
      expect(res.status).toBe(200);
      expect(res.body.shares).toHaveLength(1);
      expect(res.body.shares[0].senderUsername).toBe("tester");
      expect(res.body.shares[0].songSnapshot.track_name).toBe("Shared Track");
    });

    it("GET /api/song-shares/notifications/incoming respects disabled notifications", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ notifications_enabled: 0 }],
      });
      const res = await request(app)
        .get("/api/song-shares/notifications/incoming")
        .set(auth(OTHER_USER));
      expect(res.status).toBe(200);
      expect(res.body.shares).toEqual([]);
    });
  });

  describe("accept and respond", () => {
    it("POST accept returns 409 when song is already in repertoire", async () => {
      mockExecute
        .mockResolvedValueOnce({ rows: [shareRow({ status: "opened" })] })
        .mockResolvedValueOnce({
          rows: [{ id: 3, track_name: "Shared Track", artist_name: "Shared Artist" }],
        })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .post("/api/song-shares/7/accept")
        .set(auth(OTHER_USER));
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already in your repertoire/i);
    });

    it("POST respond stores recipient message", async () => {
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            shareRow({
              status: "saved",
              preview_resolved_at: "2026-01-02",
            }),
          ],
        })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .post("/api/song-shares/7/respond")
        .set(auth(OTHER_USER))
        .send({ message: "Thanks!" });
      expect(res.status).toBe(200);
    });
  });

  describe("stats dashboard", () => {
    it("GET /api/stats/dashboard includes songsSent and songsReceived", async () => {
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              totalSongs: 1,
              totalPerformances: 0,
              avgRating: null,
              uniqueVenues: 0,
              masteredCount: 0,
              proficientCount: 0,
              practicingCount: 1,
              songsSent: 4,
              songsReceived: 6,
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
      expect(res.body.global.songsSent).toBe(4);
      expect(res.body.global.songsReceived).toBe(6);
    });
  });
});
