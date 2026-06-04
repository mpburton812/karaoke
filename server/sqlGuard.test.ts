import { describe, expect, it } from "vitest";
import { assertSqlAllowed, hasTenantScope } from "./sqlGuard.js";

const USER_ID = 42;

describe("hasTenantScope", () => {
  it("detects direct and aliased user_id filters", () => {
    expect(hasTenantScope("SELECT * FROM songs WHERE user_id = ?")).toBe(true);
    expect(hasTenantScope("SELECT * FROM songs s WHERE s.user_id = ?")).toBe(
      true
    );
    expect(hasTenantScope("DELETE FROM song_tags WHERE song_id IN (SELECT id FROM songs WHERE user_id = ?)")).toBe(
      true
    );
  });
});

describe("assertSqlAllowed", () => {
  it("allows scoped SELECT", () => {
    expect(() =>
      assertSqlAllowed("SELECT * FROM songs WHERE user_id = ?", USER_ID, [
        USER_ID,
      ])
    ).not.toThrow();
  });

  it("rejects unscoped SELECT on tenant tables", () => {
    expect(() =>
      assertSqlAllowed("SELECT * FROM songs WHERE id = ?", USER_ID, [1])
    ).toThrow(/user_id/);
  });

  it("allows SELECT 1 health check", () => {
    expect(() => assertSqlAllowed("SELECT 1", USER_ID, [])).not.toThrow();
  });

  it("allows DELETE on songs with matching user_id", () => {
    expect(() =>
      assertSqlAllowed("DELETE FROM songs WHERE id = ? AND user_id = ?", USER_ID, [
        1,
        USER_ID,
      ])
    ).not.toThrow();
  });

  it("rejects DELETE on songs without user_id filter", () => {
    expect(() =>
      assertSqlAllowed("DELETE FROM songs WHERE id = ?", USER_ID, [1])
    ).toThrow(/user_id/);
  });

  it("rejects DELETE when user_id arg does not match session", () => {
    expect(() =>
      assertSqlAllowed("DELETE FROM tags WHERE id = ? AND user_id = ?", USER_ID, [
        1,
        99,
      ])
    ).toThrow(/authenticated user/);
  });

  it("blocks DROP statements", () => {
    expect(() =>
      assertSqlAllowed("SELECT 1; DROP TABLE users", USER_ID, [])
    ).toThrow(/not allowed/);
  });

  it("blocks PRAGMA", () => {
    expect(() =>
      assertSqlAllowed("PRAGMA table_info(users)", USER_ID, [])
    ).toThrow(/not allowed/);
  });

  it("blocks event_logs access", () => {
    expect(() =>
      assertSqlAllowed("DELETE FROM event_logs", USER_ID, [])
    ).toThrow(/not allowed/);
  });

  it("allows INSERT into songs with matching user_id column", () => {
    expect(() =>
      assertSqlAllowed(
        "INSERT INTO songs (user_id, track_name) VALUES (?, ?)",
        USER_ID,
        [USER_ID, "Test"]
      )
    ).not.toThrow();
  });

  it("rejects INSERT into songs without user_id column", () => {
    expect(() =>
      assertSqlAllowed(
        "INSERT INTO songs (track_name) VALUES (?)",
        USER_ID,
        ["Test"]
      )
    ).toThrow(/user_id/);
  });

  it("requires user_id on UPDATE performances", () => {
    expect(() =>
      assertSqlAllowed(
        "UPDATE performances SET rating = ? WHERE id = ?",
        USER_ID,
        [5, 1]
      )
    ).toThrow(/user_id/);
  });

  it("whitelists UPDATE songs columns", () => {
    expect(() =>
      assertSqlAllowed(
        "UPDATE songs SET personal_key = ? WHERE id = ? AND user_id = ?",
        USER_ID,
        ["0", 1, USER_ID]
      )
    ).not.toThrow();
    expect(() =>
      assertSqlAllowed(
        "UPDATE songs SET password_hash = ? WHERE id = ? AND user_id = ?",
        USER_ID,
        ["x", 1, USER_ID]
      )
    ).toThrow(/only allows/);
  });

  it("allows portability export table whitelist", () => {
    expect(() =>
      assertSqlAllowed("SELECT * FROM tags WHERE user_id = ?", USER_ID, [
        USER_ID,
      ])
    ).not.toThrow();
    expect(() =>
      assertSqlAllowed("SELECT * FROM users WHERE user_id = ?", USER_ID, [
        USER_ID,
      ])
    ).toThrow(/not allowed/);
  });

  it("allows junction DELETE with ownership subquery (nuke batch)", () => {
    expect(() =>
      assertSqlAllowed(
        "DELETE FROM performance_tags WHERE performance_id IN (SELECT id FROM performances WHERE user_id = ?)",
        USER_ID,
        [USER_ID]
      )
    ).not.toThrow();
  });
});
