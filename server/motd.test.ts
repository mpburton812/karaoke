import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock("./db.js", () => ({
  db: { execute: mockExecute },
}));

import {
  MotdError,
  ackMotd,
  defaultMotdExpiresAt,
  expireMotdNow,
  getMotdForUser,
  publishMotd,
} from "./motd.js";

describe("motd", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("defaultMotdExpiresAt is one month ahead (UTC date)", () => {
    const from = new Date(Date.UTC(2026, 0, 15));
    expect(defaultMotdExpiresAt(from)).toBe("2026-02-15");
  });

  it("publishMotd rejects empty and overlong messages", async () => {
    await expect(publishMotd(1, "  ")).rejects.toBeInstanceOf(MotdError);
    await expect(publishMotd(1, "x".repeat(256))).rejects.toBeInstanceOf(
      MotdError
    );
  });

  it("publishMotd clears previous active and inserts new row", async () => {
    mockExecute
      // getActiveMotd select
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            body: "old",
            expires_at: "2099-01-01",
            created_at: "2026-01-01",
            created_by: 1,
            cleared_at: null,
          },
        ],
      })
      // seen count
      .mockResolvedValueOnce({ rows: [{ count: 2 }] })
      // clear previous
      .mockResolvedValueOnce({ rows: [] })
      // insert
      .mockResolvedValueOnce({
        rows: [
          {
            id: 2,
            body: "Hello admins",
            expires_at: "2026-09-02",
            created_at: "2026-08-02",
            created_by: 1,
            cleared_at: null,
          },
        ],
      });

    const row = await publishMotd(1, "Hello admins", "2026-09-02");
    expect(row.id).toBe(2);
    expect(row.body).toBe("Hello admins");
    expect(row.expiresAt).toBe("2026-09-02");
    expect(row.seenCount).toBe(0);

    const clearSql = mockExecute.mock.calls[2][0] as { sql: string };
    expect(clearSql.sql).toMatch(/cleared_at/);
  });

  it("getMotdForUser returns null when already seen", async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 5,
            body: "Hi",
            expires_at: "2099-01-01",
            created_at: "2026-01-01",
            created_by: 1,
            cleared_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] });

    const motd = await getMotdForUser(9);
    expect(motd).toBeNull();
  });

  it("expireMotdNow clears active motd", async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 3,
            body: "Bye",
            expires_at: "2099-01-01",
            created_at: "2026-01-01",
            created_by: 1,
            cleared_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await expireMotdNow();
    expect(result.cleared).toBe(true);
  });

  it("ackMotd inserts seen row", async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 7,
            body: "Note",
            expires_at: "2099-01-01",
            created_at: "2026-01-01",
            created_by: 1,
            cleared_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    await ackMotd(42, 7);
    const insert = mockExecute.mock.calls[2][0] as { sql: string; args: unknown[] };
    expect(insert.sql).toMatch(/admin_motd_seen/);
    expect(insert.args).toEqual([7, 42]);
  });
});
