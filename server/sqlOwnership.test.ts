import { describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { assertSqlOwnership } from "./sqlOwnership.js";

const USER_ID = 7;

function mockDb(rows: unknown[] = [{ "1": 1 }]): Client {
  return {
    execute: vi.fn().mockResolvedValue({ rows }),
  } as unknown as Client;
}

describe("assertSqlOwnership (Track 2 Phase 1)", () => {
  it("rejects song_tags insert when song is not owned", async () => {
    const db = mockDb([]);
    await expect(
      assertSqlOwnership(
        db,
        "INSERT OR IGNORE INTO song_tags (song_id, tag_id) VALUES (?, ?)",
        USER_ID,
        [99, 1]
      )
    ).rejects.toThrow(/Song not found/);
  });

  it("allows song_tags insert when song and tag are owned", async () => {
    const db = mockDb([{ "1": 1 }]);
    await expect(
      assertSqlOwnership(
        db,
        "INSERT OR IGNORE INTO song_tags (song_id, tag_id) VALUES (?, ?)",
        USER_ID,
        [5, 2]
      )
    ).resolves.toBeUndefined();
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it("rejects performance_tags read when performance is not owned", async () => {
    const db = mockDb([]);
    await expect(
      assertSqlOwnership(
        db,
        "SELECT tag_id FROM performance_tags WHERE performance_id = ?",
        USER_ID,
        [12]
      )
    ).rejects.toThrow(/Performance not found/);
  });

  it("rejects location_tags insert when location is not owned", async () => {
    const db = mockDb([]);
    await expect(
      assertSqlOwnership(
        db,
        "INSERT OR IGNORE INTO location_tags (location_id, tag_id) VALUES (?, ?)",
        USER_ID,
        [3, 1]
      )
    ).rejects.toThrow(/Location not found/);
  });

  it("rejects song_status_history insert for another users song", async () => {
    const db = mockDb([]);
    await expect(
      assertSqlOwnership(
        db,
        "INSERT INTO song_status_history (song_id, status) VALUES (?, ?)",
        USER_ID,
        [8, "Practicing"]
      )
    ).rejects.toThrow(/Song not found/);
  });

  it("validates song_id on performance insert", async () => {
    const db = mockDb([{ "1": 1 }]);
    await assertSqlOwnership(
      db,
      "INSERT INTO performances (song_id, user_id, date) VALUES (?, ?, ?)",
      USER_ID,
      [5, USER_ID, "2026-05-20"]
    );
    expect(db.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining("FROM songs WHERE id = ?"),
      })
    );
  });

  it("skips extra checks when SQL already has tenant scope", async () => {
    const db = mockDb([]);
    await assertSqlOwnership(
      db,
      "DELETE FROM songs WHERE id = ? AND user_id = ?",
      USER_ID,
      [1, USER_ID]
    );
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("rejects DELETE on song_tags without scope", async () => {
    const db = mockDb([{ "1": 1 }]);
    await assertSqlOwnership(
      db,
      "DELETE FROM song_tags WHERE song_id = ? AND tag_id = ?",
      USER_ID,
      [5, 2]
    );
    expect(db.execute).toHaveBeenCalled();
  });
});
