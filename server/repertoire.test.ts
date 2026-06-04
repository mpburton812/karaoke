import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute, mockBatch } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockBatch: vi.fn(),
}));

vi.mock("./db.js", () => ({
  db: { execute: mockExecute, batch: mockBatch },
}));

import {
  RepertoireError,
  assertPortabilityTable,
  createTag,
  deleteSong,
  exportPortabilityTable,
  findDuplicateSong,
  importPortabilityRows,
  patchSong,
  searchSongsByTags,
  upsertSong,
  wipeUserRepertoire,
} from "./repertoire.js";

const USER_ID = 10;

describe("repertoire", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockBatch.mockReset();
  });

  describe("assertPortabilityTable", () => {
    it("allows songs, tags, locations", () => {
      expect(assertPortabilityTable("songs")).toBe("songs");
      expect(assertPortabilityTable("tags")).toBe("tags");
    });

    it("rejects unknown tables", () => {
      expect(() => assertPortabilityTable("users")).toThrow(RepertoireError);
    });
  });

  describe("findDuplicateSong", () => {
    it("returns null when no match", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });
      const row = await findDuplicateSong(USER_ID, {
        itunesId: 1,
        trackName: "A",
        artistName: "B",
      });
      expect(row).toBeNull();
    });
  });

  describe("upsertSong", () => {
    it("inserts status history when none exists", async () => {
      mockExecute
        .mockResolvedValueOnce({ rows: [{ id: 55 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await upsertSong(USER_ID, {
        itunesId: 100,
        trackName: "Track",
        artistName: "Artist",
        artworkUrl: "http://x",
        durationMs: 1,
        releaseDate: "2020",
        explicit: 0,
        album: "Alb",
        releaseYear: 2020,
        lyrics: null,
      });

      expect(result.id).toBe(55);
      expect(mockExecute).toHaveBeenCalledTimes(3);
      const historyInsert = mockExecute.mock.calls[2][0].sql as string;
      expect(historyInsert).toMatch(/song_status_history/);
    });
  });

  describe("patchSong", () => {
    it("rejects unknown fields", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
      await expect(
        patchSong(USER_ID, 1, { password_hash: "x" } as never)
      ).rejects.toThrow(/Field not allowed/);
    });

    it("records vocal_status history", async () => {
      mockExecute
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await patchSong(USER_ID, 1, { vocal_status: "Mastered" });
      expect(mockExecute.mock.calls[2][0].sql).toMatch(/song_status_history/);
    });
  });

  describe("deleteSong", () => {
    it("throws when song is not owned", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });
      await expect(deleteSong(USER_ID, 999)).rejects.toThrow(/Song not found/);
    });
  });

  describe("createTag", () => {
    it("maps UNIQUE constraint to 409", async () => {
      mockExecute.mockRejectedValueOnce(
        new Error("UNIQUE constraint failed: tags.user_id, tags.name")
      );
      await expect(createTag(USER_ID, "Rock")).rejects.toThrow(/already exists/);
    });
  });

  describe("searchSongsByTags", () => {
    it("returns empty for no tag ids", async () => {
      await expect(searchSongsByTags(USER_ID, [], "AND")).resolves.toEqual([]);
    });

    it("rejects invalid tag ids", async () => {
      await expect(searchSongsByTags(USER_ID, [0, -1], "OR")).rejects.toThrow(
        RepertoireError
      );
    });

    it("builds OR query with placeholders", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      await searchSongsByTags(USER_ID, [1, 2], "OR");
      const sql = mockExecute.mock.calls[0][0].sql as string;
      expect(sql).toMatch(/st\.tag_id IN \(\?,\?\)/);
      expect(mockExecute.mock.calls[0][0].args).toEqual([USER_ID, 1, 2]);
    });
  });

  describe("portability", () => {
    it("exports rows for a valid table", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: 1, name: "Tag" }],
      });
      const rows = await exportPortabilityTable(USER_ID, "tags");
      expect(rows).toHaveLength(1);
    });

    it("imports rows with user_id prefix", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const count = await importPortabilityRows(USER_ID, "tags", [
        { name: "Imported" },
      ]);
      expect(count).toBe(1);
      expect(mockExecute.mock.calls[0][0].args[0]).toBe(USER_ID);
    });
  });

  describe("wipeUserRepertoire", () => {
    it("runs ordered batch deletes", async () => {
      mockBatch.mockResolvedValueOnce([]);
      await wipeUserRepertoire(USER_ID);
      expect(mockBatch).toHaveBeenCalledOnce();
      const stmts = mockBatch.mock.calls[0][0] as { sql: string }[];
      expect(stmts).toHaveLength(6);
      expect(stmts[0].sql).toMatch(/performance_tags/);
      expect(stmts[stmts.length - 1].sql).toMatch(/locations/);
    });
  });
});
