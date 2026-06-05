import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute, mockBatch } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockBatch: vi.fn(),
}));

vi.mock("./db.js", () => ({
  db: { execute: mockExecute, batch: mockBatch },
}));

vi.mock("./repertoire.js", () => ({
  wipeUserRepertoire: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "./db.js";
import { wipeUserRepertoire } from "./repertoire.js";
import {
  BACKUP_VERSION,
  PortabilityError,
  exportUserBackup,
  importUserBackup,
} from "./userPortability.js";

const USER_ID = 5;

describe("userPortability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
    mockBatch.mockReset();
  });

  it("exportUserBackup returns versioned payload with all sections", async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    const backup = await exportUserBackup(USER_ID);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.exportedAt).toBeTruthy();
    expect(backup.data.songs).toEqual([]);
    expect(backup.data.performances).toEqual([]);
    expect(backup.data.spotify_synced_playlists).toEqual([]);
    expect(mockExecute.mock.calls.length).toBeGreaterThanOrEqual(10);
  });

  it("importUserBackup rejects invalid version", async () => {
    await expect(
      importUserBackup(USER_ID, { version: 99, exportedAt: "", data: {} })
    ).rejects.toThrow(PortabilityError);
  });

  it("importUserBackup wipes then inserts rows", async () => {
    const backup = {
      version: BACKUP_VERSION,
      exportedAt: "2026-01-01",
      data: {
        tags: [{ id: 1, name: "Rock" }],
        locations: [{ id: 2, name: "Bar" }],
        songs: [{ id: 10, track_name: "Song", artist_name: "Artist" }],
        performances: [
          { id: 20, song_id: 10, date: "2026-01-01", rating: 5 },
        ],
        song_tags: [{ song_id: 10, tag_id: 1 }],
        performance_tags: [{ performance_id: 20, tag_id: 1 }],
        location_tags: [{ location_id: 2, tag_id: 1 }],
        song_status_history: [
          { id: 30, song_id: 10, status: "Practicing", changed_at: "2026-01-01" },
        ],
        spotify_synced_playlists: [],
        spotify_playlist_songs: [],
      },
    };

    mockBatch.mockResolvedValueOnce([]);

    const result = await importUserBackup(USER_ID, backup);
    expect(wipeUserRepertoire).toHaveBeenCalledWith(USER_ID);
    expect(mockBatch).toHaveBeenCalledOnce();
    expect(result.imported.songs).toBe(1);
    expect(result.imported.performances).toBe(1);
    const batchSql = (mockBatch.mock.calls[0][0] as { sql: string }[])
      .map((s) => s.sql)
      .join(" ");
    expect(batchSql).toMatch(/INSERT OR REPLACE INTO tags/);
    expect(batchSql).toMatch(/INSERT OR REPLACE INTO songs/);
    expect(batchSql).toMatch(/INSERT OR IGNORE INTO song_tags/);
  });
});
