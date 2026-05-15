import type { ResultSet } from "@libsql/client";

/** Map libSQL JSON array rows back to named objects (API transport format). */
export function normalizeResultSet(result: ResultSet): ResultSet {
  if (!result.columns?.length || !result.rows?.length) {
    return result;
  }

  const first = result.rows[0];
  if (
    first !== null &&
    typeof first === "object" &&
    !Array.isArray(first) &&
    result.columns.some((col) => col in (first as object))
  ) {
    return result;
  }

  const rows = result.rows.map((row) => {
    const record: Record<string, unknown> = {};
    for (let i = 0; i < result.columns.length; i++) {
      record[result.columns[i]] = Array.isArray(row)
        ? row[i]
        : (row as Record<string, unknown>)[result.columns[i]];
    }
    return record;
  });

  return { ...result, rows } as ResultSet;
}
