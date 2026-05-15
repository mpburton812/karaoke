import { describe, expect, it } from "vitest";
import type { ResultSet } from "@libsql/client";
import { normalizeResultSet } from "./normalizeResultSet";

/** Minimal ResultSet fixture (API JSON may use array rows). */
function mockResultSet(overrides: Partial<ResultSet> & Pick<ResultSet, "columns" | "rows">): ResultSet {
  return {
    columnTypes: overrides.columns.map(() => "TEXT" as const),
    rowsAffected: 0,
    lastInsertRowid: undefined,
    ...overrides,
  } as ResultSet;
}

describe("normalizeResultSet", () => {
  it("maps array rows to objects using columns", () => {
    const input = mockResultSet({
      columns: ["id", "track_name", "artist_name"],
      columnTypes: ["INTEGER", "TEXT", "TEXT"],
      rows: [[32, "Piano Man", "Billy Joel"]],
    });

    const result = normalizeResultSet(input);
    expect(result.rows[0]).toEqual({
      id: 32,
      track_name: "Piano Man",
      artist_name: "Billy Joel",
    });
  });

  it("leaves already-named rows unchanged", () => {
    const input = mockResultSet({
      columns: ["id", "name"],
      columnTypes: ["INTEGER", "TEXT"],
      rows: [{ id: 1, name: "test" }],
    });

    const result = normalizeResultSet(input);
    expect(result.rows[0]).toEqual({ id: 1, name: "test" });
  });

  it("returns empty result sets as-is", () => {
    const input = mockResultSet({
      columns: [],
      columnTypes: [],
      rows: [],
    });

    expect(normalizeResultSet(input).rows).toEqual([]);
  });

  it("normalizes multiple rows", () => {
    const input = mockResultSet({
      columns: ["id", "name"],
      columnTypes: ["INTEGER", "TEXT"],
      rows: [
        [1, "a"],
        [2, "b"],
      ],
    });

    const result = normalizeResultSet(input);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toEqual({ id: 2, name: "b" });
  });
});
