import { describe, expect, it } from "vitest";
import { assertSqlAllowed, hasTenantScope, TENANT_TABLES } from "./sqlGuard.js";

const USER_ID = 42;

describe("TENANT_TABLES", () => {
  it("includes core repertoire tables", () => {
    expect(TENANT_TABLES).toContain("songs");
    expect(TENANT_TABLES).toContain("performances");
    expect(TENANT_TABLES).toContain("song_tags");
    expect(TENANT_TABLES).not.toContain("event_logs");
  });
});

describe("hasTenantScope", () => {
  it("detects direct and aliased user_id filters", () => {
    expect(hasTenantScope("SELECT * FROM songs WHERE user_id = ?")).toBe(true);
    expect(hasTenantScope("SELECT * FROM songs s WHERE s.user_id = ?")).toBe(
      true
    );
  });

  it("detects subquery ownership for junction deletes", () => {
    expect(
      hasTenantScope(
        "DELETE FROM song_tags WHERE song_id IN (SELECT id FROM songs WHERE user_id = ?)"
      )
    ).toBe(true);
    expect(
      hasTenantScope(
        "DELETE FROM performance_tags WHERE performance_id IN (SELECT id FROM performances WHERE user_id = ?)"
      )
    ).toBe(true);
  });
});

describe("assertSqlAllowed (Track 2 Phase 2)", () => {
  it("allows SELECT 1 health check", () => {
    expect(() => assertSqlAllowed("SELECT 1", USER_ID, [])).not.toThrow();
  });

  it("rejects any SQL touching tenant tables", () => {
    const samples = [
      "SELECT * FROM songs WHERE user_id = ?",
      "DELETE FROM songs WHERE id = ? AND user_id = ?",
      "INSERT INTO songs (user_id, track_name) VALUES (?, ?)",
      "UPDATE performances SET rating = ? WHERE id = ? AND user_id = ?",
      "SELECT * FROM song_tags WHERE song_id = ?",
    ];
    for (const sql of samples) {
      expect(() => assertSqlAllowed(sql, USER_ID, [USER_ID])).toThrow();
    }
  });

  it("rejects tenant SELECT with repertoire API message", () => {
    expect(() =>
      assertSqlAllowed("SELECT * FROM songs WHERE user_id = ?", USER_ID, [
        USER_ID,
      ])
    ).toThrow(/repertoire API/);
  });

  it("blocks chained statements", () => {
    expect(() =>
      assertSqlAllowed("SELECT 1; DELETE FROM songs", USER_ID, [])
    ).toThrow(/not allowed/);
  });

  it("blocks PRAGMA and ATTACH", () => {
    expect(() =>
      assertSqlAllowed("PRAGMA table_info(songs)", USER_ID, [])
    ).toThrow(/not allowed/);
    expect(() => assertSqlAllowed("ATTACH DATABASE 'x' AS y", USER_ID, [])).toThrow(
      /not allowed/
    );
  });

  it("blocks users and event_logs tables", () => {
    expect(() =>
      assertSqlAllowed("SELECT * FROM users", USER_ID, [])
    ).toThrow(/not allowed/);
    expect(() =>
      assertSqlAllowed("DELETE FROM event_logs", USER_ID, [])
    ).toThrow(/not allowed/);
  });

  it("blocks dynamic export of non-portability tables", () => {
    expect(() =>
      assertSqlAllowed("SELECT * FROM passwords WHERE user_id = ?", USER_ID, [
        USER_ID,
      ])
    ).toThrow(/not allowed/);
  });

  it("blocks INSERT into unknown tables", () => {
    expect(() =>
      assertSqlAllowed("INSERT INTO evil (x) VALUES (?)", USER_ID, [1])
    ).toThrow(/not allowed/);
  });
});
