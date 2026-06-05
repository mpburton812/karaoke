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
  createSongShare,
  acceptSongShare,
} from "./songShares.js";

const mockExecute = vi.mocked(db.execute);
const mockGetSong = vi.mocked(getSong);
const mockFindDuplicate = vi.mocked(findDuplicateSong);

describe("songShares", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
  });

  it("accept rejects duplicate without inserting", async () => {
    const snapshot = JSON.stringify({
      track_name: "Song",
      artist_name: "Artist",
      itunes_id: 1,
    });
    mockExecute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 5,
            sender_user_id: 1,
            recipient_user_id: 2,
            sender_song_id: 10,
            song_snapshot: snapshot,
            status: "opened",
            sender_username: "a",
            recipient_username: "b",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    mockFindDuplicate.mockResolvedValue({ id: 3 });

    await expect(acceptSongShare(2, 5)).rejects.toMatchObject({ status: 409 });
    expect(mockFindDuplicate).toHaveBeenCalled();
  });
});
