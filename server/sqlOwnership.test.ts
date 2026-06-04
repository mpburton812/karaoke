import { describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { assertSqlOwnership } from "./sqlOwnership.js";

const USER_ID = 7;

function mockDb(rows: unknown[] = [{ "1": 1 }]): Client {
  return {
    execute: vi.fn().mockResolvedValue({ rows }),
  } as unknown as Client;
}

describe("assertSqlOwnership", () => {
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

  it("allows song_tags insert when song is owned", async () => {
    const db = mockDb([{ "1": 1 }]);
    await expect(
      assertSqlOwnership(
        db,
        "INSERT OR IGNORE INTO song_tags (song_id, tag_id) VALUES (?, ?)",
        USER_ID,
        [5, 2]
      )
    ).resolves.toBeUndefined();
    expect(db.execute).toHaveBeenCalled();
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
});
