import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db.js", () => ({
  db: {
    execute: vi.fn(),
  },
}));

vi.mock("./repertoire.js", () => ({
  getSong: vi.fn(),
  findDuplicateSong: vi.fn(),
}));

import { db } from "./db.js";
import { getSong, findDuplicateSong } from "./repertoire.js";
import {
  SongShareError,
  acceptSongShare,
  createSongShare,
  discardSongShare,
  getNotificationsEnabled,
  getShareStats,
  listIncomingShareNotifications,
  listUserDirectory,
  respondToSongShare,
  setNotificationsEnabled,
} from "./songShares.js";

const mockExecute = vi.mocked(db.execute);
const mockGetSong = vi.mocked(getSong);
const mockFindDuplicate = vi.mocked(findDuplicateSong);

const snapshotJson = JSON.stringify({
  track_name: "Song",
  artist_name: "Artist",
  itunes_id: 1,
});

function shareRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    sender_user_id: 1,
    recipient_user_id: 2,
    sender_song_id: 10,
    song_snapshot: snapshotJson,
    send_message: "hi",
    status: "opened",
    sender_username: "alice",
    recipient_username: "bob",
    preview_resolved_at: null,
    responded_at: null,
    ...overrides,
  };
}

describe("songShares", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createSongShare", () => {
    it("rejects sharing with self", async () => {
      await expect(
        createSongShare(1, { recipientUserId: 1, songId: 5, message: "hi" })
      ).rejects.toThrow(SongShareError);
    });

    it("rejects messages over 255 characters", async () => {
      await expect(
        createSongShare(1, {
          recipientUserId: 2,
          songId: 5,
          message: "x".repeat(256),
        })
      ).rejects.toThrow(/255/);
    });

    it("rejects unknown recipient", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });
      await expect(
        createSongShare(1, { recipientUserId: 2, songId: 5, message: "" })
      ).rejects.toMatchObject({ status: 404 });
    });

    it("rejects when sender does not own the song", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [{ id: 2 }] });
      mockGetSong.mockResolvedValue(null);
      await expect(
        createSongShare(1, { recipientUserId: 2, songId: 10, message: "" })
      ).rejects.toMatchObject({ status: 404 });
    });

    it("creates a share with snapshot JSON", async () => {
      mockExecute
        .mockResolvedValueOnce({ rows: [{ id: 2 }] })
        .mockResolvedValueOnce({ rows: [{ id: 99 }] });
      mockGetSong.mockResolvedValue({
        id: 10,
        track_name: "Song",
        artist_name: "Artist",
        itunes_id: 1,
      });

      const created = await createSongShare(1, {
        recipientUserId: 2,
        songId: 10,
        message: "Try this",
      });
      expect(created.id).toBe(99);
      const insertCall = mockExecute.mock.calls[1];
      expect(insertCall?.[0]?.sql).toContain("INSERT INTO song_shares");
      const snapshotArg = insertCall?.[0]?.args?.[3];
      expect(String(snapshotArg)).toContain("Song");
    });
  });

  describe("listUserDirectory", () => {
    it("lists users except the current user", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: 2, username: "bob" }],
      });
      const users = await listUserDirectory(1);
      expect(users).toHaveLength(1);
      expect(mockExecute.mock.calls[0][0].args).toEqual([1]);
    });
  });

  describe("notifications preference", () => {
    it("reads notifications_enabled as boolean", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ notifications_enabled: 0 }],
      });
      expect(await getNotificationsEnabled(1)).toBe(false);
    });

    it("writes notifications_enabled", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });
      await setNotificationsEnabled(1, true);
      expect(mockExecute.mock.calls[0][0].args).toEqual([1, 1]);
    });
  });

  describe("getShareStats", () => {
    it("returns sent and received counts", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ sent: 3, received: 7 }],
      });
      const stats = await getShareStats(1);
      expect(stats).toEqual({ sent: 3, received: 7 });
    });
  });

  describe("listIncomingShareNotifications", () => {
    it("returns empty when notifications are disabled", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ notifications_enabled: 0 }],
      });
      const shares = await listIncomingShareNotifications(2);
      expect(shares).toEqual([]);
      expect(mockExecute).toHaveBeenCalledOnce();
    });
  });

  describe("acceptSongShare", () => {
    it("rejects duplicate without inserting a new song", async () => {
      mockExecute
        .mockResolvedValueOnce({ rows: [shareRow()] })
        .mockResolvedValueOnce({ rows: [] });
      mockFindDuplicate.mockResolvedValue({ id: 3 });

      await expect(acceptSongShare(2, 5)).rejects.toMatchObject({ status: 409 });
      expect(mockFindDuplicate).toHaveBeenCalled();
      expect(mockExecute.mock.calls.some((c) => c[0].sql.includes("INSERT INTO songs"))).toBe(
        false
      );
    });

    it("inserts a new song when not a duplicate", async () => {
      mockExecute
        .mockResolvedValueOnce({ rows: [shareRow()] })
        .mockResolvedValueOnce({ rows: [{ id: 88 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      mockFindDuplicate.mockResolvedValue(null);

      const result = await acceptSongShare(2, 5);
      expect(result.savedSongId).toBe(88);
      expect(mockExecute.mock.calls[1][0].sql).toContain("INSERT INTO songs");
      expect(mockExecute.mock.calls[3][0].sql).toContain("status = 'saved'");
    });
  });

  describe("discardSongShare", () => {
    it("marks share as discarded for recipient", async () => {
      mockExecute
        .mockResolvedValueOnce({ rows: [shareRow({ status: "pending" })] })
        .mockResolvedValueOnce({ rows: [] });
      await discardSongShare(2, 5);
      expect(mockExecute.mock.calls[1][0].sql).toContain("discarded");
    });
  });

  describe("respondToSongShare", () => {
    it("requires preview to be resolved first", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [shareRow({ preview_resolved_at: null })],
      });
      await expect(respondToSongShare(2, 5, "thanks")).rejects.toThrow(
        /Save or close/
      );
    });

    it("stores response message after save or discard", async () => {
      mockExecute
        .mockResolvedValueOnce({
          rows: [shareRow({ preview_resolved_at: "2026-01-01" })],
        })
        .mockResolvedValueOnce({ rows: [] });
      await respondToSongShare(2, 5, "Sounds great!");
      expect(mockExecute.mock.calls[1][0].args?.[0]).toBe("Sounds great!");
    });
  });
});
