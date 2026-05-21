import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute, mockEnrichSongsNow } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockEnrichSongsNow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./db.js", () => ({
  db: { execute: mockExecute, batch: vi.fn() },
  tursoConfigured: true,
}));

vi.mock("./songEnrichment.js", () => ({
  enrichSongsNow: mockEnrichSongsNow,
}));

vi.mock("./eventLog.js", () => ({
  logCatalogEvent: vi.fn(),
  logApiWarning: vi.fn(),
}));

import { seedWelcomeSongForUser, WELCOME_SONG } from "./welcomeSong.js";

describe("seedWelcomeSongForUser", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockEnrichSongsNow.mockClear();
  });

  it("inserts Piano Man and enriches for new users", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 42 }] });

    await seedWelcomeSongForUser(9);

    expect(mockExecute).toHaveBeenCalledTimes(2);
    const insertCall = mockExecute.mock.calls[1][0] as { args: unknown[] };
    expect(insertCall.args).toContain(WELCOME_SONG.trackName);
    expect(insertCall.args).toContain(WELCOME_SONG.artistName);
    expect(mockEnrichSongsNow).toHaveBeenCalledWith(9, [42]);
  });

  it("enriches existing welcome song when not yet enriched", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ id: 7, enriched_at: null }],
    });

    await seedWelcomeSongForUser(3);

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockEnrichSongsNow).toHaveBeenCalledWith(3, [7]);
  });

  it("skips enrichment when welcome song already enriched", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ id: 7, enriched_at: "2026-01-01T00:00:00.000Z" }],
    });

    await seedWelcomeSongForUser(3);

    expect(mockEnrichSongsNow).not.toHaveBeenCalled();
  });
});
