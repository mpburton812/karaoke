import { describe, expect, it } from "vitest";
import { assertSqlAllowed } from "./sqlGuard.js";

const USER_ID = 42;

describe("assertSqlAllowed", () => {
  it("allows SELECT without user_id", () => {
    expect(() =>
      assertSqlAllowed("SELECT * FROM songs WHERE user_id = ?", USER_ID, [USER_ID])
    ).not.toThrow();
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

  it("allows global karafun catalog delete", () => {
    expect(() =>
      assertSqlAllowed("DELETE FROM karafun_catalog", USER_ID, [])
    ).not.toThrow();
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

  it("allows INSERT into songs without user_id in WHERE", () => {
    expect(() =>
      assertSqlAllowed(
        "INSERT INTO songs (user_id, track_name) VALUES (?, ?)",
        USER_ID,
        [USER_ID, "Test"]
      )
    ).not.toThrow();
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
});
