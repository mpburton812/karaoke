import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock("./db.js", () => ({
  db: { execute: mockExecute },
}));

import { runSchemaMigrations } from "./schemaMigrations.js";

function callSql(call: unknown[]): string {
  const first = call[0];
  if (typeof first === "string") return first;
  return (first as { sql: string }).sql;
}

describe("runSchemaMigrations", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValue({ rows: [] });
  });

  it("creates schema_migrations table on first run", async () => {
    await runSchemaMigrations();
    const sqls = mockExecute.mock.calls.map((c) => callSql(c));
    expect(sqls[0]).toMatch(/CREATE TABLE IF NOT EXISTS schema_migrations/);
  });

  it("skips migration body when already recorded", async () => {
    mockExecute.mockImplementation(async (stmt: string | { sql: string }) => {
      const sql = typeof stmt === "string" ? stmt : stmt.sql;
      if (sql.includes("SELECT 1 FROM schema_migrations")) {
        return { rows: [{ "1": 1 }] };
      }
      return { rows: [] };
    });

    const callsBefore = mockExecute.mock.calls.length;
    await runSchemaMigrations();
    const dropKarafun = mockExecute.mock.calls
      .slice(callsBefore)
      .some((c) => callSql(c).includes("DROP TABLE IF EXISTS karafun_catalog"));
    expect(dropKarafun).toBe(false);
  });

  it("applies karafun cleanup when migration is new", async () => {
    let migrationChecks = 0;
    mockExecute.mockImplementation(async (stmt: string | { sql: string }) => {
      const sql = typeof stmt === "string" ? stmt : stmt.sql;
      if (sql.includes("SELECT 1 FROM schema_migrations WHERE id = ?")) {
        migrationChecks += 1;
        return { rows: [] };
      }
      return { rows: [] };
    });

    await runSchemaMigrations();
    const sqls = mockExecute.mock.calls.map((c) => callSql(c));
    expect(sqls.some((s) => s.includes("karafun_catalog"))).toBe(true);
    expect(sqls.some((s) => s.includes("DROP TABLE IF EXISTS setlists"))).toBe(
      true
    );
    expect(sqls.some((s) => s.includes("personal_key = '0'"))).toBe(true);
    expect(migrationChecks).toBeGreaterThanOrEqual(3);
  });
});
