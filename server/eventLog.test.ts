import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute, mockAppendFile, mockMkdir } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockAppendFile: vi.fn(),
  mockMkdir: vi.fn(),
}));

vi.mock("./db.js", () => ({
  db: { execute: mockExecute },
  tursoConfigured: true,
}));

vi.mock("fs/promises", () => ({
  appendFile: mockAppendFile,
  mkdir: mockMkdir,
}));

import {
  auditSqlMutation,
  listEventLogs,
  logEvent,
  logServerStartup,
  resetEventLogTestState,
} from "./eventLog.js";

describe("eventLog", () => {
  beforeEach(() => {
    resetEventLogTestState();
    mockExecute.mockReset();
    mockAppendFile.mockReset();
    mockMkdir.mockReset();
    mockAppendFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
  });

  it("persists informational events to the database and JSONL", async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    logEvent({
      level: "I",
      userId: 7,
      username: "singer",
      message: "User signed in",
      event: "user_login_success",
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(mockExecute).toHaveBeenCalled();
    const insert = mockExecute.mock.calls.find((c) =>
      String(c[0]?.sql).includes("INSERT INTO event_logs")
    );
    expect(insert).toBeDefined();
    expect(insert![0].args).toContain("I");
    expect(insert![0].args).toContain("user_login_success");
    expect(insert![0].args).toContain("User signed in");
    expect(mockAppendFile).toHaveBeenCalled();
  });

  it("includes song title and artist on repertoire insert audit", async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    await auditSqlMutation(
      7,
      `INSERT INTO songs (user_id, track_name, artist_name) VALUES (?, ?, ?)`,
      "singer",
      [7, "Bohemian Rhapsody", "Queen"]
    );
    await new Promise((r) => setTimeout(r, 20));
    const insert = mockExecute.mock.calls.find((c) =>
      String(c[0]?.sql).includes("INSERT INTO event_logs")
    );
    expect(insert).toBeDefined();
    expect(insert![0].args).toContain(
      'Added song to repertoire: "Bohemian Rhapsody" by Queen'
    );
  });

  it("logs API startup as a release event once per process", async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    logServerStartup();
    logServerStartup();
    await new Promise((r) => setTimeout(r, 20));
    const inserts = mockExecute.mock.calls.filter((c) =>
      String(c[0]?.sql).includes("INSERT INTO event_logs")
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0]![0].args).toContain("application_configuration_load_success");
    expect(String(inserts[0]![0].args)).toMatch(/API started/);
  });

  it("lists events newest first with pagination", async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 2,
            occurred_at: "2026-05-20T10:00:00.000Z",
            level: "W",
            user_id: 1,
            username: "admin",
            message: "Spotify API unavailable",
            category: "spotify",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ c: 5 }] });

    const { events, total } = await listEventLogs({ limit: 10, offset: 0 });
    expect(total).toBe(5);
    expect(events).toHaveLength(1);
    expect(events[0]?.level).toBe("W");
    expect(events[0]?.message).toContain("Spotify");
  });
});
