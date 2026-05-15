import { describe, expect, it } from "vitest";
import type { ResultSet } from "@libsql/client";
import { normalizeResultSet } from "./normalizeResultSet";

describe("normalizeResultSet", () => {
  it("maps array rows to objects using columns", () => {
    const input: ResultSet = {
      columns: ["id", "track_name", "artist_name"],
      columnTypes: ["INTEGER", "TEXT", "TEXT"],
      rows: [[32, "Piano Man", "Billy Joel"]],
      rowsAffected: 0,
      lastInsertRowid: null,
    };

    const result = normalizeResultSet(input);
    expect(result.rows[0]).toEqual({
      id: 32,
      track_name: "Piano Man",
      artist_name: "Billy Joel",
    });
  });

  it("leaves already-named rows unchanged", () => {
    const input: ResultSet = {
      columns: ["id", "name"],
      columnTypes: ["INTEGER", "TEXT"],
      rows: [{ id: 1, name: "test" }],
      rowsAffected: 0,
      lastInsertRowid: null,
    };

    const result = normalizeResultSet(input);
    expect(result.rows[0]).toEqual({ id: 1, name: "test" });
  });

  it("returns empty result sets as-is", () => {
    const input: ResultSet = {
      columns: [],
      columnTypes: [],
      rows: [],
      rowsAffected: 0,
      lastInsertRowid: null,
    };

    expect(normalizeResultSet(input).rows).toEqual([]);
  });

  it("normalizes multiple rows", () => {
    const input: ResultSet = {
      columns: ["id", "name"],
      columnTypes: ["INTEGER", "TEXT"],
      rows: [
        [1, "a"],
        [2, "b"],
      ],
      rowsAffected: 0,
      lastInsertRowid: null,
    };

    const result = normalizeResultSet(input);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toEqual({ id: 2, name: "b" });
  });
});
